#!/usr/bin/env python3
"""打包「港股持仓流动性限额」这道题：题目附件、标准答案附件。

这道题没有底稿，是 2026-11-11 新出的。成交量和收盘价全部来自 US Stocks MCP 的实际调用（新题数据/港股流动性/），
口径文件在 新题口径/港股流动性/。持股数是下面 HOLD 里拟的。
A01、A02 快照收录十一只股票，云顶新耀（1952.HK）留给在线 MCP 查询。

脚本做的事：
1. 生成 A01（日成交量）和 A02（持仓清单，含基准日收盘价）。
2. 只用题目附件加云顶新耀的 MCP 结果文件重算，生成标准答案附件。
3. 检查三条限额离门槛的距离，并算一遍常见错误的结果。
"""
from __future__ import annotations

import csv
import math
from fractions import Fraction as F
from pathlib import Path

import pandas as pd

from build_common import OUT, copy_as, fresh_dir, load_mcp_prices, source_line, write_docx, write_xlsx

HERE = Path(__file__).resolve().parent
RAW = HERE / "新题数据" / "港股流动性"
DOC = HERE / "新题口径" / "港股流动性"
DST = OUT / "题目" / "12_港股持仓流动性限额"
PREFIX = "港股流动性_"
MCP_CODE = "1952.HK"
MCP_FILE = f"{PREFIX}MCP_1952.HK日线.json"
FIRST, BASE = "2026-05-04", "2026-10-30"
PART = F(1, 4)
MAX_DAYS, LIM_D1, LIM_D3 = 5, F(55, 100), F(85, 100)
HOLD = [  # 代码, 名称, 持股数
    ("0700.HK", "腾讯控股", 612000),
    ("9988.HK", "阿里巴巴-W", 2435000),
    ("0941.HK", "中国移动", 2480000),
    ("1299.HK", "友邦保险", 2618000),
    ("2318.HK", "中国平安", 3150000),
    ("0883.HK", "中国海洋石油", 7060000),
    ("0388.HK", "香港交易所", 395000),
    ("6990.HK", "科伦博泰生物-B", 848600),
    ("1952.HK", "云顶新耀", 8950000),
    ("9969.HK", "诺诚健华", 19600000),
    ("9626.HK", "哔哩哔哩-W", 2380000),
    ("3896.HK", "金山云", 29500000),
]


def measure(hold: list[dict], vol: dict[str, list[int]], close: dict[str, F], mode: str = "min"):
    """按 A03、A04 走一遍。mode 只在算常见错误时用：min 是标准口径，adv20、adv60 是只用一个窗口。"""
    rows = []
    for h in hold:
        v = vol[h["code"]]
        assert len(v) >= 60
        adv20, adv60 = F(sum(v[-20:]), 20), F(sum(v[-60:]), 60)
        use = {"min": min(adv20, adv60), "adv20": adv20, "adv60": adv60}[mode]
        cap = math.floor(use * PART)
        s = int(h["shares"])
        days = -(-s // cap)
        keep = min(s, MAX_DAYS * cap)
        rows.append(dict(code=h["code"], name=h["name"], shares=s, close=close[h["code"]], adv20=adv20, adv60=adv60, use=use, cap=cap,
                         days=days, over=days > MAX_DAYS, cut=s - keep, keep=keep))

    def ladder(key: str):
        total = sum(r[key] * r["close"] for r in rows)
        d = {n: sum(min(r[key], n * r["cap"]) * r["close"] for r in rows) for n in (1, 3)}
        return dict(total=total, v1=d[1], v3=d[3], p1=d[1] / total, p3=d[3] / total)

    now, fixed = ladder("shares"), ladder("keep")
    over = [r for r in rows if r["over"]]
    for res, n_over in ((now, len(over)), (fixed, 0)):
        res["ok1"], res["ok2"], res["ok3"] = n_over == 0, res["p1"] >= LIM_D1, res["p3"] >= LIM_D3
        res["n_over"] = n_over
    ok = lambda r: r["ok1"] and r["ok2"] and r["ok3"]
    verdict = "通过" if ok(now) else ("整改后通过" if ok(fixed) else "整改后仍不通过")
    return rows, now, fixed, verdict


def main() -> None:
    att = fresh_dir(DST / "题目附件")
    ans = fresh_dir(DST / "标准答案附件")
    (DST / "MCP结果文件").mkdir(exist_ok=True)
    copy_as(RAW / f"{MCP_CODE}.json", DST / "MCP结果文件" / MCP_FILE)

    # 1. 附件
    with open(att / f"{PREFIX}A01_日成交量.csv", "w", newline="", encoding="utf-8") as f1, \
            open(att / f"{PREFIX}A02_持仓清单.csv", "w", newline="", encoding="utf-8") as f2:
        w1, w2 = csv.writer(f1), csv.writer(f2)
        w1.writerow(["date", "code", "volume"])
        w2.writerow(["code", "name", "shares", "close"])
        for code, name, shares in HOLD:
            if code == MCP_CODE:
                w2.writerow([code, name, shares, ""])
                continue
            rec0, d = load_mcp_prices(RAW / f"{code}.json", 8)
            later = d[(d.index > BASE) & ((d.Dividends > 0) | (d["Stock Splits"] != 0))]
            assert later.empty, f"{code} 在基准日之后有分红或拆分，返回的复权价不等于实际收盘价"
            assert float(d["Stock Splits"].abs().sum()) == 0
            d = d[(d.index >= FIRST) & (d.index <= BASE)]
            for day, v in d.Volume.items():
                w1.writerow([day, code, int(v)])
            w2.writerow([code, name, shares, f"{float(d.Close[BASE]):.2f}"])
    for name in ["A03_流动性口径.md", "A04_限额与交付.md"]:
        copy_as(DOC / name, att / f"{PREFIX}{name}")
    copy_as(DST / "MCP结果文件" / MCP_FILE, att / MCP_FILE)

    # 2. 只用题目附件重算
    hold = list(csv.DictReader(open(att / f"{PREFIX}A02_持仓清单.csv", encoding="utf-8")))
    a01 = pd.read_csv(att / f"{PREFIX}A01_日成交量.csv", dtype={"code": str})
    vol = {c: [int(x) for x in g.sort_values("date").volume] for c, g in a01.groupby("code")}
    close = {h["code"]: F(h["close"]) for h in hold if h["close"]}
    rec, m = load_mcp_prices(att / MCP_FILE, 8)
    assert set(m.Date.str[11:13]) == {"16"} and float(m.Dividends.sum()) == 0 and float(m["Stock Splits"].abs().sum()) == 0
    mb = m[m.index <= BASE]
    vol[MCP_CODE] = [int(x) for x in mb.Volume]
    close[MCP_CODE] = F(f"{float(mb.Close[BASE]):.2f}")
    assert len(vol) == 12 and len(close) == 12
    rows, now, fixed, verdict = measure(hold, vol, close)

    pc = lambda x: f"{float(x) * 100:.2f}%"
    print(f"结论 {verdict}")
    for r in rows:
        print(f"  {r['code']} {r['name']:9} 持 {r['shares']:>10,} 价 {float(r['close']):>7.2f} 市值 {float(r['shares'] * r['close']) / 1e6:>7.1f}m "
              f"ADV20 {float(r['adv20']):>13,.1f} ADV60 {float(r['adv60']):>13,.1f} 日可变现 {r['cap']:>10,} 天数 {r['days']:>2} "
              f"{'超限 减持 %d' % r['cut'] if r['over'] else ''}")
    for tag, r in (("现状", now), ("整改后", fixed)):
        print(f"  {tag}：总市值 {float(r['total']):,.2f}，1日 {float(r['v1']):,.2f}（{pc(r['p1'])}），3日 {float(r['v3']):,.2f}（{pc(r['p3'])}），限额 {r['ok1']} {r['ok2']} {r['ok3']}")
    over = [r for r in rows if r["over"]]
    assert verdict == "整改后通过" and [r["code"] for r in over] == ["6990.HK", "1952.HK", "9969.HK"]
    assert now["ok2"] and not now["ok3"]
    for r in (now, fixed):
        assert abs(r["p1"] - LIM_D1) > F(1, 100) and abs(r["p3"] - LIM_D3) > F(1, 100)
    for r in rows:   # 变现天数离 5 天的门槛不能只差一点点
        assert abs(r["shares"] - MAX_DAYS * r["cap"]) > r["cap"] // 20, r["code"]
    cut_value = sum(r["cut"] * r["close"] for r in rows)

    # 常见错误
    for mode, label in (("adv20", "只用 ADV20"), ("adv60", "只用 ADV60")):
        r2, n2, f2, v2 = measure(hold, vol, close, mode)
        print(f"  {label}：超限 {[r['name'] for r in r2 if r['over']]}，现状 3 日 {pc(n2['p3'])}，结论 {v2}")

    # 3. 标准答案附件
    fl = float
    h_head = ["代码", "名称", "持股数", "基准日收盘价(港元)", "市值(港元)", "ADV20(股)", "ADV60(股)", "可用日均量(股)", "日可变现量(股)", "变现天数",
              "是否超限", "最少减持股数", "减持后持股数"]
    h_rows = [[r["code"], r["name"], r["shares"], fl(r["close"]), round(fl(r["shares"] * r["close"]), 2), round(fl(r["adv20"]), 2), round(fl(r["adv60"]), 2),
               round(fl(r["use"]), 2), r["cap"], r["days"], "超限" if r["over"] else "未超限", r["cut"], r["keep"]] for r in rows]
    yes = lambda b: "满足" if b else "不满足"

    def col(r):
        return [round(fl(r["total"]), 2), round(fl(r["v1"]), 2), round(fl(r["p1"]) * 100, 2), round(fl(r["v3"]), 2), round(fl(r["p3"]) * 100, 2),
                r["n_over"], yes(r["ok1"]), yes(r["ok2"]), yes(r["ok3"])]

    labels = ["组合总市值(港元)", "1日可变现市值(港元)", "1日可变现比例(%)", "3日可变现市值(港元)", "3日可变现比例(%)", "单票超限只数",
              "限额一：单票变现天数≤5", "限额二：1日可变现比例≥55%", "限额三：3日可变现比例≥85%"]
    s_rows = [[a, b, c] for a, b, c in zip(labels, col(now), col(fixed))]
    s_rows.append(["减持市值合计(港元)", "", round(fl(cut_value), 2)])
    s_rows.append(["结论", "不通过", verdict])
    x = next(r for r in rows if r["code"] == MCP_CODE)
    last20 = mb.tail(20)
    d_rows = [[day, int(v)] for day, v in last20.Volume.items()]
    first60 = mb.index[-60]
    o_txt = "；".join(f"{r['name']}（{r['code']}）持股 {r['shares']:,} 股，日可变现量 {r['cap']:,} 股，变现天数 {r['days']} 天，最少减持 {r['cut']:,} 股，减持后 {r['keep']:,} 股" for r in over)
    kl = next(r for r in rows if r["code"] == "6990.HK")
    write_xlsx(
        ans / "港股持仓流动性测算表.xlsx",
        [("持仓流动性", h_head, h_rows), ("组合变现比例", ["项目", "现状", "整改后"], s_rows), ("在线数据", ["交易日", "云顶新耀(1952.HK)日成交量(股)"], d_rows)],
        notes={
            "持仓流动性": ["可用日均量取 ADV20 和 ADV60 里较小的一个；日可变现量 = 可用日均量 × 25%，向下取整；变现天数向上取整。",
                      f"超限 {len(over)} 只：{o_txt}。",
                      f"科伦博泰生物-B 的 ADV20（{fl(kl['adv20']):,.2f}）大于 ADV60（{fl(kl['adv60']):,.2f}），可用日均量取 ADV60；只看 ADV20 时它是 5 天，不会被发现。"],
            "组合变现比例": [f"现状 3 日可变现比例 {pc(now['p3'])}，低于 85%；整改后 {pc(fixed['p3'])}，三条限额都满足。减持市值合计 {fl(cut_value):,.2f} 港元。"],
            "在线数据": [
                source_line(rec),
                f"返回 {len(m)} 行，{m.index[0]} 至 {m.index[-1]}。返回的 Date 是 UTC 时间（16:00），加 8 小时后的日期是香港的交易日。",
                "返回期间内 Dividends、Stock Splits 两列全部为 0，没有分红和拆分，返回的收盘价就是实际收盘价，成交量也没有调整。",
                f"基准日 {BASE} 收盘价 {fl(x['close']):.2f} 港元。上表是最近 20 个交易日（{last20.index[0]} 至 {BASE}）的日成交量，ADV20 = {fl(x['adv20']):,.2f} 股。",
                f"最近 60 个交易日是 {first60} 至 {BASE}，ADV60 = {fl(x['adv60']):,.2f} 股。可用日均量取较小的 ADV20，日可变现量 {x['cap']:,} 股。",
            ],
        },
    )
    write_docx(
        ans / "港股持仓流动性复核意见.docx",
        "港股持仓流动性限额复核意见",
        [
            ("结论", [f"整改后通过。现状有 {len(over)} 只股票的变现天数超过 5 个交易日，组合 3 日可变现比例 {pc(now['p3'])}，低于 85%；"
                    f"按最少减持办法减持这 {len(over)} 只股票后，三条限额都满足。"]),
            ("现状", [
                f"组合总市值 {fl(now['total']):,.2f} 港元。",
                f"限额一（单票变现天数不超过 5 个交易日）：不满足，超限 {len(over)} 只。{o_txt}。",
                f"限额二（1 日可变现比例不低于 55%）：满足。1 日可变现市值 {fl(now['v1']):,.2f} 港元，比例 {pc(now['p1'])}。",
                f"限额三（3 日可变现比例不低于 85%）：不满足。3 日可变现市值 {fl(now['v3']):,.2f} 港元，比例 {pc(now['p3'])}。",
            ]),
            ("整改后", [
                f"三只股票合计减持市值 {fl(cut_value):,.2f} 港元，组合总市值降到 {fl(fixed['total']):,.2f} 港元。",
                f"每只股票的变现天数都不超过 5 个交易日。1 日可变现比例 {pc(fixed['p1'])}，3 日可变现比例 {pc(fixed['p3'])}，三条限额都满足。",
            ]),
            ("两处容易看漏的地方", [
                f"科伦博泰生物-B 的 ADV20 是 {fl(kl['adv20']):,.2f} 股，ADV60 是 {fl(kl['adv60']):,.2f} 股，近期成交放大。按口径取较小的 ADV60，日可变现量 {kl['cap']:,} 股，变现天数 {kl['days']} 天，超限。",
                f"云顶新耀的 ADV20 是 {fl(x['adv20']):,.2f} 股，ADV60 是 {fl(x['adv60']):,.2f} 股，近期成交萎缩。按口径取较小的 ADV20，日可变现量 {x['cap']:,} 股，变现天数 {x['days']} 天，超限。",
            ]),
            ("在线数据", [
                "研究部的快照没有收录云顶新耀。它的日线通过 US Stocks MCP 查询，代码 1952.HK。返回的日期是 UTC 时间，加 8 小时后才是香港的交易日；"
                f"返回期间内没有分红和拆分，收盘价和成交量都没有调整。基准日 {BASE} 收盘 {fl(x['close']):.2f} 港元。",
            ]),
            ("对应材料", ["十二只股票的日均量、变现天数和减持股数见《港股持仓流动性测算表.xlsx》的「持仓流动性」，现状和整改后的可变现比例见「组合变现比例」，"
                      "云顶新耀的成交量和查询信息见「在线数据」。两份文件的结论、超限股票、减持股数和可变现比例相同。"]),
        ],
    )
    print("查询时间", rec["查询时间"], len(m), "行", m.index[0], m.index[-1], "减持市值", float(cut_value))


if __name__ == "__main__":
    main()
