#!/usr/bin/env python3
"""打包「VaR模型返回检验」这道题：题目附件、标准答案附件。

2026-11-14 按质检意见重做。原来是四个模型选一个，和招行拆单、ETF 配权两道题的任务链重复；
现在只检验现行的正态法：逐季末回看 250 日的突破次数、分区、资本乘数和资本要求，结论是模型的处置办法。

数据仍取 high-econ/二期/var_model 的 A01、A02，A01 去掉 USO，USO 由在线 MCP 查询。
口径文件在 新题口径/VaR返回检验/。MCP 结果文件由 mcp_call.py --save 生成，本脚本只读不改。

脚本做的核对：
1. MCP 返回的 USO 收盘价和原快照逐日比对。
2. USO 按原始精度并入和四舍五入到 4 位小数并入，结果相同。
3. 算一遍常见错误的结果：不并入 USO、只看基准日。
"""
from __future__ import annotations

import json
import math

import numpy as np
import pandas as pd

from build_common import CASES, OUT, copy_as, fresh_dir, write_docx, write_xlsx

HERE = OUT / "_工具"
SRC = CASES / "二期" / "var_model" / "attachments"
DOC = HERE / "新题口径" / "VaR返回检验"
DST = OUT / "题目" / "03_VaR模型返回检验"
MCP = DST / "MCP结果文件"
PREFIX = "VaR模型_"
SYM = "USO"
MCP_FILE = f"{PREFIX}MCP_{SYM}日线.json"
START, BASE = "2021-01-04", "2026-10-30"
FIRST_Q = "2021-12"
WIN, LOOK, AVG = 250, 250, 60
Z99, P, LR_MAX = 2.326, 0.01, 3.841
NAV = 800_000_000
PLUS = {5: 0.40, 6: 0.50, 7: 0.65, 8: 0.75, 9: 0.85}


def zone(x: int) -> tuple[str, float]:
    if x <= 4:
        return "绿区", 0.0
    if x >= 10:
        return "红区", 1.0
    return "黄区", PLUS[x]


def load_mcp():
    rec = json.load(open(MCP / MCP_FILE, encoding="utf-8"))
    d = pd.DataFrame(json.loads(rec["原始返回"]["content"][0]["text"]))
    # 美股返回的 Date 是美东零点对应的 UTC 时间（04:00 或 05:00），日期部分就是交易日
    assert set(d.Date.str[11:13]) <= {"04", "05"}
    d["date"] = d.Date.str[:10]
    return rec, d.set_index("date")


def backtest(px: pd.DataFrame, weights: dict[str, float]):
    ret = px.pct_change().dropna()
    port = sum(ret[k] * w for k, w in weights.items())
    dates, v = port.index.tolist(), port.to_numpy()
    test = [i for i, d in enumerate(dates) if d >= START]
    assert test[0] >= WIN
    var = np.array([Z99 * np.std(v[i - WIN:i], ddof=1) for i in test])
    r = v[test]
    hit = r < -var
    days = [dates[i] for i in test]
    s = pd.Series(days)
    ends = s.groupby(s.str[:4] + "Q" + ((s.str[5:7].astype(int) - 1) // 3 + 1).astype(str)).last()
    evals = [d for d in ends.tolist() if d[:7] >= FIRST_Q and d[5:7] in ("03", "06", "09", "12")] + [BASE]
    rows = []
    for d in evals:
        j = days.index(d)
        assert j + 1 >= LOOK
        x = int(hit[j - LOOK + 1:j + 1].sum())
        z, plus = zone(x)
        m = 3 + plus
        avg = float(var[j - AVG + 1:j + 1].mean())
        rows.append(dict(date=d, x=x, zone=z, plus=plus, m=m, var=float(var[j]), avg=avg,
                         cap=max(float(var[j]), m * avg) * math.sqrt(10)))
    n, x = len(days), int(hit.sum())
    ph = x / n
    lr = -2 * ((n - x) * math.log(1 - P) + x * math.log(P) - (n - x) * math.log(1 - ph) - x * math.log(ph))
    hits = [(days[i], float(r[i]), float(var[i])) for i in range(n) if hit[i]]
    margin = float(np.abs(r + var).min())
    return rows, hits, n, lr, margin


def verdict(rows: list[dict]) -> str:
    if any(r["zone"] == "红区" for r in rows):
        return "更换模型"
    return "保留并上调乘数" if sum(r["zone"] == "黄区" for r in rows) >= 5 else "保留"


def main() -> None:
    att = fresh_dir(DST / "题目附件")
    ans = fresh_dir(DST / "标准答案附件")

    a01 = pd.read_csv(SRC / "A01_prices.csv", dtype={"adj_close": str})
    kept = a01[a01.symbol != SYM]
    snap = a01[a01.symbol == SYM].set_index("date").adj_close.astype(float)
    kept.to_csv(att / f"{PREFIX}A01_ETF复权日线.csv", index=False)
    copy_as(SRC / "A02_portfolio.csv", att / f"{PREFIX}A02_组合权重.csv")
    copy_as(DOC / "A03_口径说明.md", att / f"{PREFIX}A03_口径说明.md")
    copy_as(DOC / "A04_处置规则与交付.md", att / f"{PREFIX}A04_处置规则与交付.md")
    copy_as(MCP / MCP_FILE, att / MCP_FILE)
    weights = dict(pd.read_csv(att / f"{PREFIX}A02_组合权重.csv").set_index("symbol").weight)

    # 核对 1
    rec, d = load_mcp()
    days = sorted(kept.date.unique())
    assert all(x in d.index for x in days), "MCP 返回没有覆盖全部交易日"
    use = d.loc[days]
    events = d[(d["Stock Splits"] != 0) | (d.Dividends != 0)]
    worst = (use.Close - snap.loc[days]).abs().max()
    print(f"核对 1：{SYM} 返回 {len(d)} 行（{d.index[0]} 至 {d.index[-1]}），本题用 {len(use)} 行，与原快照最大相差 {worst:.6f}")
    assert worst < 1e-4 and len(events) == 1

    seven = kept.assign(adj_close=kept.adj_close.astype(float)).pivot(index="date", columns="symbol", values="adj_close")

    def run(prices: pd.Series | None, w: dict[str, float]):
        px = seven.copy()
        if prices is not None:
            px[SYM] = prices.to_numpy()
        return backtest(px, w)

    rows, hits, n, lr, margin = run(use.Close, weights)
    v = verdict(rows)
    rows4, hits4, _, _, _ = run(use.Close.round(4), weights)
    key = lambda rs: [(r["date"], r["x"], r["zone"], round(r["var"] * 100, 4), round(r["cap"] * 100, 4)) for r in rs]
    assert key(rows) == key(rows4) and [h[0] for h in hits] == [h[0] for h in hits4]
    print(f"核对 2：四舍五入到 4 位小数后并入，21 个评估日和 {len(hits)} 次突破都相同。突破判定最小间距 {margin:.2e}")

    base = rows[-1]
    red = [r for r in rows if r["zone"] == "红区"]
    yellow = [r for r in rows if r["zone"] == "黄区"]
    cap_amt = base["cap"] * NAV
    peak = max(rows, key=lambda r: r["cap"])
    print(f"结论 {v}；全区间 {n} 天，突破 {len(hits)} 次，LR {lr:.3f}")
    for r in rows:
        print(f"  {r['date']} 突破 {r['x']:>2} {r['zone']} 加点 {r['plus']:.2f} 乘数 {r['m']:.2f} VaR {r['var'] * 100:.4f}% "
              f"60日均 {r['avg'] * 100:.4f}% 资本 {r['cap'] * 100:.4f}%")
    print(f"  基准日资本 {cap_amt:,.2f} 美元；资本要求比例最高 {peak['date']} {peak['cap'] * 100:.4f}%")
    assert v == "更换模型" and base["zone"] == "绿区" and len(red) == 3
    assert verdict([base]) == "保留"

    # 核对 3：常见错误
    for label, w in [("USO 当 0 收益", {k: x for k, x in weights.items() if k != SYM}),
                     ("七只重新归一", {k: x / 0.95 for k, x in weights.items() if k != SYM})]:
        r7, h7, _, _, _ = run(None, w)
        print(f"  {label}：结论 {verdict(r7)}，突破 {len(h7)} 次，各评估日 {[x['x'] for x in r7]}，基准日资本 {r7[-1]['cap'] * NAV:,.2f}")

    # 标准答案附件：xlsx
    pc = lambda x: round(x * 100, 4)
    t_head = ["评估日", "近250日突破次数", "分区", "加点", "资本乘数", "当日VaR(%)", "近60日平均VaR(%)", "资本要求比例(%)"]
    t_rows = [[r["date"], r["x"], r["zone"], r["plus"], r["m"], pc(r["var"]), pc(r["avg"]), pc(r["cap"])] for r in rows]
    h_head = ["突破日期", "当日组合收益(%)", "当日VaR(%)"]
    h_rows = [[a, pc(b), pc(c)] for a, b, c in hits]
    o_head = ["交易日", f"{SYM} MCP返回收盘价（美元）", "Stock Splits", "Dividends"]
    o_rows = [[day, round(float(use.Close[day]), 4), float(use["Stock Splits"][day]), float(use.Dividends[day])] for day in days]
    q = rec["参数"]
    sp_day = events.index[0]
    prev_day = days[days.index(sp_day) - 1]
    p0, p1 = float(use.Close[prev_day]), float(use.Close[sp_day])
    red_txt = "、".join(f"{r['date']}（{r['x']} 次）" for r in red)
    write_xlsx(
        ans / "VaR模型返回检验测算表.xlsx",
        [("返回检验表", t_head, t_rows), ("突破明细", h_head, h_rows), ("在线数据", o_head, o_rows)],
        notes={
            "返回检验表": [
                f"结论：{v}。红区评估日 {len(red)} 个：{red_txt}。黄区评估日 {len(yellow)} 个，绿区 {len(rows) - len(red) - len(yellow)} 个。",
                f"基准日 {BASE} 突破 {base['x']} 次，{base['zone']}，资本乘数 {base['m']:.2f}，资本要求比例 {base['cap'] * 100:.4f}%，"
                f"按组合规模 {NAV:,} 美元计，市场风险资本 {cap_amt:,.2f} 美元。",
                f"全区间 {START} 至 {BASE} 共 {n} 个交易日，突破 {len(hits)} 次，Kupiec LR 为 {lr:.3f}，超过 {LR_MAX}，检验不通过。",
            ],
            "突破明细": [f"现行模型正态法在 {START} 至 {BASE} 的 {len(hits)} 次突破。"],
            "在线数据": [
                f"来源：US Stocks MCP（https://mcp-stocks-us.gino.im/mcp，数据来自 Yahoo Finance），工具 get_historical_stock_prices，"
                f"代码 {q['ticker']}，参数 period={q['period']}、interval={q['interval']}。查询时间：{rec['查询时间']}。",
                f"返回 {len(d)} 行，{d.index[0]} 至 {d.index[-1]}。本表只列与其余七只 ETF 相同的 {len(days)} 个交易日（{days[0]} 至 {days[-1]}）。",
                "返回的 Date 是美东零点对应的 UTC 时间，日期部分就是交易日。",
                f"{sp_day} 的 Stock Splits 为 0.125，是 8 股合 1 股。返回的收盘价已经按合股调整：{prev_day} 为 {p0:.2f}，{sp_day} 为 {p1:.2f}，"
                f"当日收益 {p1 / p0 - 1:+.2%}，没有出现 8 倍的跳变。",
                "返回期间内 Dividends 全部为 0，USO 没有分红，返回的收盘价可以直接当作 adj_close 使用。",
            ],
        },
    )

    # 标准答案附件：docx
    first, last = hits[0], hits[-1]
    big = min(hits, key=lambda h: h[1])
    write_docx(
        ans / "VaR模型返回检验意见.docx",
        "多资产组合 VaR 模型返回检验意见",
        [
            ("结论", [f"{v}。现行的正态法在 21 个评估日里有 {len(red)} 个落在红区，按 A04 只要有一个评估日落在红区就要更换。"]),
            ("各评估日的分区", [
                f"红区 {len(red)} 个：{red_txt}。",
                f"黄区 {len(yellow)} 个：" + "、".join(f"{r['date']}（{r['x']} 次）" for r in yellow) + "。",
                f"其余 {len(rows) - len(red) - len(yellow)} 个评估日在绿区。",
                f"基准日 {BASE} 含当天在内最近 250 个交易日突破 {base['x']} 次，在绿区，加点 0，资本乘数 {base['m']:.2f}。"
                "只看基准日会得出「保留」，但处置规则看的是全部 21 个评估日。",
            ]),
            ("基准日的市场风险资本", [
                f"基准日当日 VaR {base['var'] * 100:.4f}%，近 60 日平均 VaR {base['avg'] * 100:.4f}%。资本乘数乘近 60 日平均 VaR 为 "
                f"{base['m'] * base['avg'] * 100:.4f}%，大于当日 VaR，取它再乘 √10，资本要求比例 {base['cap'] * 100:.4f}%。",
                f"组合规模 {NAV:,} 美元，市场风险资本 {cap_amt:,.2f} 美元。新模型上线前仍按这个数计提。",
                f"资本要求比例最高的评估日是 {peak['date']}，为 {peak['cap'] * 100:.4f}%，当时资本乘数 {peak['m']:.2f}。",
            ]),
            ("全区间检验", [
                f"{START} 至 {BASE} 共 {n} 个交易日，按 1% 的概率应有约 15 次突破，实际 {len(hits)} 次。Kupiec LR 为 {lr:.3f}，"
                f"超过 {LR_MAX}，检验不通过，和分区结果的方向一致。这一项只作参考。",
                f"第一次突破在 {first[0]}，组合收益 {first[1] * 100:.4f}%，VaR {first[2] * 100:.4f}%。"
                f"最后一次在 {last[0]}，组合收益 {last[1] * 100:.4f}%，VaR {last[2] * 100:.4f}%。"
                f"亏损最大的一次在 {big[0]}，组合收益 {big[1] * 100:.4f}%，VaR {big[2] * 100:.4f}%。",
            ]),
            ("在线数据", [
                f"内部快照 A01 只有七只 ETF，没有权重 5% 的 USO。USO 的日线通过 US Stocks MCP 查询，取与其余七只相同的 {len(days)} 个交易日并入测算。",
                f"返回数据显示 USO 在 {sp_day} 做过 8 股合 1 股。返回的收盘价已经按合股调整，{prev_day} 为 {p0:.2f} 美元，{sp_day} 为 {p1:.2f} 美元，"
                "前后连续。USO 没有分红，返回的收盘价直接作为复权价使用。",
                "合股发生在 2020 年 4 月，落在逐日比较首日之前 250 天的取数窗口里。价格如果没有按合股调整，当天会多出一个约 700% 的假收益，VaR 会失真。",
            ]),
            ("对应材料", [f"21 个评估日的结果见《VaR模型返回检验测算表.xlsx》的「返回检验表」，{len(hits)} 次突破见「突破明细」，USO 的逐日价格见「在线数据」。"
                      "两份文件的数字和结论相同。"]),
        ],
    )
    print("抽查：", first, last, big)
    print("USO：", {x: round(float(use.Close[x]), 4) for x in (days[0], prev_day, sp_day, START, days[-1])})
    print("查询时间", rec["查询时间"], "返回行数", len(d), d.index[0], d.index[-1])


if __name__ == "__main__":
    main()
