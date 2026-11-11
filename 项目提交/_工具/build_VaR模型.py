#!/usr/bin/env python3
"""打包「VaR模型选型」这道题：题目附件、标准答案附件。

和 cases/二期/var_model 相比只有一处改动：A01 去掉 USO 的行情，改由在线 MCP 查询。
MCP 结果文件放在 题目/03_VaR模型选型/MCP结果文件/，由 mcp_call.py --save 生成，本脚本只读不改。

脚本做的核对：
1. MCP 返回的 USO 收盘价和原快照逐日比对。
2. 把 MCP 返回的 USO 并回去重算，四个模型的判定表和 A 的突破明细应与原标答一致。
3. 不查 MCP、只用七只 ETF 时算出来是什么。
"""
from __future__ import annotations

import importlib.util
import json
import shutil

import pandas as pd

from build_common import CASES, OUT, copy_as, fresh_dir, write_docx, write_xlsx

SRC = CASES / "二期" / "var_model"
DST = OUT / "题目" / "03_VaR模型选型"
MCP = DST / "MCP结果文件"
PREFIX = "VaR模型_"
SYM = "USO"
MCP_FILE = f"{PREFIX}MCP_{SYM}日线.json"

RENAME = {
    "A02_portfolio.csv": "A02_组合权重.csv",
    "A03_口径说明.md": "A03_口径说明.md",
    "A04_合格线与交付.md": "A04_合格线与交付.md",
}


def load_mcp():
    rec = json.load(open(MCP / MCP_FILE, encoding="utf-8"))
    d = pd.DataFrame(json.loads(rec["原始返回"]["content"][0]["text"]))
    # 美股返回的 Date 是美东零点对应的 UTC 时间（04:00 或 05:00），日期部分就是交易日
    assert set(d.Date.str[11:13]) <= {"04", "05"}
    d["date"] = d.Date.str[:10]
    return rec, d.set_index("date")


def fmt(table: pd.DataFrame):
    return [(r.model, int(r.days), int(r.exceptions), f"{r.lr:.3f}", int(r.max_in_250), f"{r.avg_var_pct:.4f}",
             bool(r["pass"])) for _, r in table.iterrows()]


def main() -> None:
    att = fresh_dir(DST / "题目附件")
    ans = fresh_dir(DST / "标准答案附件")

    a01 = pd.read_csv(SRC / "attachments" / "A01_prices.csv", dtype={"adj_close": str})
    kept = a01[a01.symbol != SYM]
    snap = a01[a01.symbol == SYM].set_index("date").adj_close.astype(float)
    kept.to_csv(att / f"{PREFIX}A01_ETF复权日线.csv", index=False)
    for old, new in RENAME.items():
        copy_as(SRC / "attachments" / old, att / f"{PREFIX}{new}")
    copy_as(MCP / MCP_FILE, att / MCP_FILE)
    print(f"A01 原 {len(a01)} 行，去掉 {SYM} {len(a01) - len(kept)} 行，留 {len(kept)} 行，{kept.symbol.nunique()} 只")

    # 核对 1
    rec, d = load_mcp()
    days = sorted(kept.date.unique())
    assert all(x in d.index for x in days), "MCP 返回没有覆盖全部交易日"
    use = d.loc[days]
    events = d[(d["Stock Splits"] != 0) | (d.Dividends != 0)]
    worst = (use.Close - snap.loc[days]).abs().max()
    print(f"核对 1：{SYM} 返回 {len(d)} 行（{d.index[0]} 至 {d.index[-1]}），本题用 {len(use)} 行，与原快照最大相差 {worst:.6f}")
    print("        拆分和分红记录：", events[["Dividends", "Stock Splits"]].to_dict("index"))
    assert worst < 1e-4 and len(events) == 1

    # 核对 2、3
    spec = importlib.util.spec_from_file_location("var_rebuild", SRC / "rebuild.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    tmp = fresh_dir(DST / "_核对用临时目录")
    mod.ATT = tmp
    want = fmt(pd.read_csv(SRC / "answer" / "summary.csv").assign(**{"pass": lambda x: x["pass"] == "是"}))
    want_hits = pd.read_csv(SRC / "answer" / "chosen_exceptions.csv", dtype=str)

    def run(prices: pd.Series | None):
        frames = [kept.assign(adj_close=kept.adj_close.astype(float))]
        if prices is not None:
            frames.append(pd.DataFrame({"symbol": SYM, "date": days, "adj_close": prices.to_numpy()}))
        pd.concat(frames).to_csv(tmp / "A01_prices.csv", index=False)
        return mod.build()

    table, books, choice = run(use.Close)
    b = books[choice]
    hits = b[b.hit]
    assert choice == "A" and fmt(table) == want, "并入 MCP 数据后的结果和原标答不一致"
    assert [f"{x:.4f}" for x in hits.return_pct] == want_hits.return_pct.tolist()
    assert [f"{x:.4f}" for x in hits.var_pct] == want_hits.var_pct.tolist()
    print("核对 2：并入 MCP 返回的 USO（原始精度），判定表和 16 次突破明细与原标答一致")
    t4, _, c4 = run(use.Close.round(4))
    assert c4 == "A" and fmt(t4) == want
    print("        四舍五入到 4 位小数后再并入，结果相同")

    # 不查 MCP：USO 权重 5% 没有行情，按 7 只算
    weights = dict(mod.WEIGHTS)
    try:
        run(None)
        print("只用新附件、不查 MCP：仍能算出（不应该）")
    except Exception as e:  # noqa: BLE001
        print("只用新附件、不查 MCP：算不出，", type(e).__name__, e)
    for label, w in [("USO 当 0 收益", {k: v for k, v in weights.items() if k != SYM}),
                     ("七只重新归一", {k: v / 0.95 for k, v in weights.items() if k != SYM})]:
        mod.WEIGHTS = w
        t7, _, c7 = run(None)
        print(f"        {label}：选择 {c7}，", [(x[0], x[2], x[3], x[5]) for x in fmt(t7)])
    mod.WEIGHTS = weights
    shutil.rmtree(tmp)

    # 标准答案附件：xlsx
    t_head = ["模型", "名称", "回测天数", "突破次数", "LR", "任意250日内最多突破次数", "平均VaR(%)", "是否合格"]
    t_rows = [[r.model, r["name"], int(r.days), int(r.exceptions), round(r.lr, 3), int(r.max_in_250),
               round(r.avg_var_pct, 4), "是" if r["pass"] else "否"] for _, r in table.iterrows()]
    h_head = ["突破日期", "当日组合收益(%)", "当日VaR(%)"]
    h_rows = [[r.date, round(r.return_pct, 4), round(r.var_pct, 4)] for _, r in hits.iterrows()]
    o_head = ["交易日", f"{SYM} MCP返回收盘价（美元）", "Stock Splits", "Dividends"]
    o_rows = [[day, round(float(use.Close[day]), 4), float(use["Stock Splits"][day]), float(use.Dividends[day])] for day in days]
    q = rec["参数"]
    sp_day = events.index[0]
    prev_day = days[days.index(sp_day) - 1]
    p0, p1 = float(use.Close[prev_day]), float(use.Close[sp_day])
    write_xlsx(
        ans / "VaR模型回测测算表.xlsx",
        [("模型判定表", t_head, t_rows), ("突破明细", h_head, h_rows), ("在线数据", o_head, o_rows)],
        notes={
            "模型判定表": ["合格 = LR 不超过 3.841，且任意 250 日内突破少于 10 次。合格的模型里平均 VaR 最低的是 A。"],
            "突破明细": ["入选模型 A 历史模拟法在 2021-01-04 至 2026-10-30 的 16 次突破。"],
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
    row = {r.model: r for _, r in table.iterrows()}
    first, last = hits.iloc[0], hits.iloc[-1]
    big = hits.sort_values("return_pct").iloc[0]
    write_docx(
        ans / "VaR模型选型建议.docx",
        "多资产组合 VaR 模型选型建议",
        [
            ("结论", ["采用 A 历史模拟法作为每日 VaR 的正式计量口径。A 和 D 两项合格线都通过，A 的平均 VaR 更低。"]),
            ("四个模型", [
                f"回测区间 2021-01-04 至 2026-10-30，共 {int(row['A'].days)} 个交易日。按 1% 的概率，应有约 15 次突破。",
                f"C 指数加权法：平均 VaR {row['C'].avg_var_pct:.4f}%，是四个里最低的；但突破 {int(row['C'].exceptions)} 次，LR 为 {row['C'].lr:.3f}，"
                "超过 3.841，Kupiec 检验不通过，说明它低估了风险。不合格。",
                f"B 正态法：突破 {int(row['B'].exceptions)} 次，LR 为 {row['B'].lr:.3f}，检验不通过；任意 250 日内最多突破 {int(row['B'].max_in_250)} 次，出现红灯。不合格。",
                f"A 历史模拟法：突破 {int(row['A'].exceptions)} 次，LR 为 {row['A'].lr:.3f}，250 日内最多 {int(row['A'].max_in_250)} 次，平均 VaR {row['A'].avg_var_pct:.4f}%。合格。",
                f"D 波动率调整历史模拟法：突破 {int(row['D'].exceptions)} 次，LR 为 {row['D'].lr:.3f}，250 日内最多 {int(row['D'].max_in_250)} 次，平均 VaR {row['D'].avg_var_pct:.4f}%。合格，但平均 VaR 高于 A。",
            ]),
            ("A 的突破", [
                f"A 共突破 {len(hits)} 次。第一次在 {first.date}，组合收益 {first.return_pct:.4f}%，VaR {first.var_pct:.4f}%。"
                f"最后一次在 {last.date}，组合收益 {last.return_pct:.4f}%，VaR {last.var_pct:.4f}%。"
                f"亏损最大的一次在 {big.date}，组合收益 {big.return_pct:.4f}%，VaR {big.var_pct:.4f}%。",
            ]),
            ("在线数据", [
                f"内部快照 A01 只有七只 ETF，没有权重 5% 的 USO。USO 的日线通过 US Stocks MCP 查询，取与其余七只相同的 {len(days)} 个交易日并入测算。",
                f"返回数据显示 USO 在 {sp_day} 做过 8 股合 1 股。返回的收盘价已经按合股调整，{prev_day} 为 {p0:.2f} 美元，{sp_day} 为 {p1:.2f} 美元，"
                "前后连续。USO 没有分红，返回的收盘价直接作为复权价使用。",
                "合股发生在 2020 年 4 月，落在回测首日之前 250 天的取数窗口里。价格如果没有按合股调整，当天会多出一个约 700% 的假收益，四个模型的结果都会失真。",
            ]),
            ("对应材料", ["四个模型的统计见《VaR模型回测测算表.xlsx》的「模型判定表」，A 的 16 次突破见「突破明细」，USO 的逐日价格见「在线数据」。"
                      "两份文件的数字和选择相同。"]),
        ],
    )
    print("抽查：", first.to_dict(), last.to_dict(), big.to_dict())
    print("USO：", {x: round(float(use.Close[x]), 4) for x in (days[0], prev_day, sp_day, "2021-01-04", days[-1])})
    print("查询时间", rec["查询时间"], "返回行数", len(d), d.index[0], d.index[-1])


if __name__ == "__main__":
    main()
