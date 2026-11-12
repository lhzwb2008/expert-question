#!/usr/bin/env python3
"""打包「沪金午休实盘准入」这道题：题目附件、标准答案附件。

底稿是 high-econ/一期/au_lunch_gate，附件内容没有改，只改了文件名。标答数字直接取底稿的 answer/。
在线 MCP 查的是 COMEX 黄金期货（GC=F）日线，用来给分年汇总加一列同期金价涨跌幅作对照。
COMEX 金价不进入交易测算，测算仍只用 A01、A02。

脚本做的核对：
1. 底稿台账 827 笔，逐年汇总和 summary.json 对得上。
2. 从 MCP 返回里取各区间首尾的收盘价，算出六个区间的金价涨跌幅。
"""
from __future__ import annotations

import json

import pandas as pd

from build_common import CASES, OUT, copy_as, fresh_dir, load_mcp_prices, source_line, write_docx, write_xlsx

SRC = CASES / "一期" / "au_lunch_gate"
DST = OUT / "题目" / "08_沪金午休实盘准入"
PREFIX = "沪金午休_"
MCP_FILE = f"{PREFIX}MCP_COMEX黄金期货日线.json"
BASE, END = "2021-10-29", "2026-10-30"
START = 200_000.0
RENAME = {
    "A01_au_5m.csv": "A01_沪金5分钟线.csv",
    "A02_xau_lunch_1m.csv": "A02_伦敦金午休1分钟线.csv",
    "A03_背景与术语.md": "A03_背景与术语.md",
    "A04_交易规则.md": "A04_交易规则.md",
    "A05_上线门槛与交付.md": "A05_上线门槛与交付.md",
}


def main() -> None:
    att = fresh_dir(DST / "题目附件")
    ans = fresh_dir(DST / "标准答案附件")
    for old, new in RENAME.items():
        copy_as(SRC / "attachments" / old, att / f"{PREFIX}{new}")
    copy_as(DST / "MCP结果文件" / MCP_FILE, att / MCP_FILE)

    # 核对 1
    sm = json.load(open(SRC / "answer" / "summary.json", encoding="utf-8"))
    t = pd.read_csv(SRC / "answer" / "official_trades.csv")
    t["year"] = t["交易日"].str[:4]
    by = t.groupby("year").agg(n=("盈亏", "size"), pnl=("盈亏", "sum"), last=("平仓后权益", "last"))
    for y, r in by.iterrows():
        z = sm["分年"][y]
        assert r.n == z["笔数"] and abs(r.pnl - z["盈亏"]) < 0.01 and abs(r["last"] - z["年末权益"]) < 0.01
    stops = t[t["强平"] == 1]["交易日"].tolist()
    assert len(t) == sm["笔数"] == 827 and stops == sm["强平日"] and abs(t["平仓后权益"].iloc[-1] - sm["期末权益"]) < 0.01
    total = sm["期末权益"] - START
    print(f"核对 1：台账 {len(t)} 笔，强平 {stops}，期末权益 {sm['期末权益']}，逐年汇总与 summary.json 一致；总盈利 {total:.2f}")

    # 核对 2
    rec, g = load_mcp_prices(DST / "MCP结果文件" / MCP_FILE, 0)
    assert set(g.Date.str[11:13]) <= {"04", "05"}
    days = pd.Series(g.index, index=g.index)
    last_of = days.groupby(days.str[:4]).last()
    cuts = [BASE] + [last_of[str(y)] for y in range(2021, 2026)] + [END]
    assert all(d in g.index for d in cuts)
    px = [float(g.Close[d]) for d in cuts]
    years = [str(y) for y in range(2021, 2027)]
    rets = [px[i + 1] / px[i] - 1 for i in range(6)]
    for y, d0, d1, p0, p1, r in zip(years, cuts[:-1], cuts[1:], px[:-1], px[1:], rets):
        print(f"核对 2：{y}  {d0} {p0:.2f} → {d1} {p1:.2f}  {r:+.2%}   策略盈亏 {sm['分年'][y]['盈亏']:.2f}")
    share26 = sm["分年"]["2026"]["盈亏"] / total
    print(f"        2026 年盈利占总盈利 {share26:.2%}；全程金价 {px[-1] / px[0] - 1:+.2%}")

    # 标准答案附件：xlsx
    l_head = ["交易日", "合约", "方向", "手数", "开仓价", "平仓价", "伦敦金午休涨跌", "盈亏", "平仓后权益", "是否强平"]
    l_rows = [[r["交易日"], r["合约"], r["方向"], int(r["手数"]), float(r["开仓价"]), float(r["平仓价"]), float(r["伦敦金午休涨跌"]),
               float(r["盈亏"]), float(r["平仓后权益"]), "是" if r["强平"] == 1 else "否"] for _, r in t.iterrows()]
    y_head = ["年份", "笔数", "当年盈亏(元)", "年末权益(元)", "金价区间起点", "金价区间终点", "同期COMEX金价涨跌幅(%)"]
    y_rows = [[y, sm["分年"][y]["笔数"], sm["分年"][y]["盈亏"], sm["分年"][y]["年末权益"], cuts[i], cuts[i + 1], round(rets[i] * 100, 2)]
              for i, y in enumerate(years)]
    o_head = ["日期", "COMEX黄金期货收盘价(美元/盎司)", "用途"]
    use = ["2021 年区间起点（策略评估起点 2021-10-30 之前最近一个交易日）"] + [f"{y} 年最后一个交易日" for y in range(2021, 2026)] + ["2026 年区间终点（证据截止日）"]
    o_rows = [[d, round(p, 2), u] for d, p, u in zip(cuts, px, use)]
    write_xlsx(
        ans / "沪金午休实盘准入测算表.xlsx",
        [("逐笔台账", l_head, l_rows), ("分年汇总", y_head, y_rows), ("在线数据", o_head, o_rows)],
        notes={
            "逐笔台账": ["按 A04 重算，2021-11-02 至 2026-10-30 共 827 笔。强平 5 次：" + "、".join(stops) + "。"],
            "分年汇总": [
                "金价涨跌幅 = 区间终点收盘价 ÷ 区间起点收盘价 − 1，收盘价见「在线数据」。金价只用于对照，不进入交易测算。",
                f"2026 年盈亏 {sm['分年']['2026']['盈亏']:,.2f} 元，占总盈利 {total:,.2f} 元的 {share26:.2%}；同期 COMEX 金价 {rets[5]:+.2%}。",
            ],
            "在线数据": [
                source_line(rec),
                f"返回 {len(g)} 行，{g.index[0]} 至 {g.index[-1]}。返回的 Date 是美东零点对应的 UTC 时间，日期部分就是交易日。",
                "GC=F 是 COMEX 黄金期货的近月连续报价，单位美元/盎司，没有分红和拆分，收盘价直接使用。",
            ],
        },
    )

    # 标准答案附件：docx
    def yr(i):
        y = years[i]
        return f"{y} 年 {sm['分年'][y]['笔数']} 笔，盈亏 {sm['分年'][y]['盈亏']:,.2f} 元，年末权益 {sm['分年'][y]['年末权益']:,.2f} 元，同期金价 {rets[i]:+.2%}"

    write_docx(
        ans / "沪金午休上线备忘录.docx",
        "沪金午休跟随规则实盘上线备忘录",
        [
            ("结论", ["搁置，不上实盘。三条门槛里强平次数这一条没有通过。"]),
            ("三条门槛", [
                f"门槛一，期末权益高于 300,000 元：通过。期末权益 {sm['期末权益']:,.2f} 元，总收益 {sm['总收益'] * 100:.4f}%。",
                f"门槛二，最大回撤不超过 15%：通过。最大回撤 {-sm['最大回撤'] * 100:.4f}%，高点日 {sm['回撤高点']}，谷底日 {sm['回撤谷底']}。",
                f"门槛三，强平次数为 0：未通过。强平 {sm['强平次数']} 次，分别在 " + "、".join(stops) + "。",
            ]),
            ("重算结果", [
                f"成交区间 {sm['区间'][0]} 至 {sm['区间'][1]}，共 {sm['笔数']} 笔，做多 {sm['多']} 笔、做空 {sm['空']} 笔，盈利 {sm['胜']} 笔、亏损 {sm['负']} 笔。",
                "强平是亏损超过当天可用资金时的风控封顶。2023-04-12 做多 3 手 au2306，价格亏损大于可用资金，实际亏损封顶为 865.76 元，平仓后权益等于 3 手保证金 215,808.00 元。",
            ]),
            ("分年情况和金价对照", [
                "；".join(yr(i) for i in range(6)) + "。",
                f"盈利集中在 2026 年：当年盈亏 {sm['分年']['2026']['盈亏']:,.2f} 元，占五年总盈利 {total:,.2f} 元的 {share26:.2%}。",
                f"金价涨跌幅用 US Stocks MCP 查询的 COMEX 黄金期货（GC=F）日线收盘价计算，2021 年从 {BASE} 起算，2026 年算到 {END}。"
                f"2026 年金价 {rets[5]:+.2%}，策略却赚得最多；2025 年金价 {rets[4]:+.2%}，策略只赚 {sm['分年']['2025']['盈亏']:,.2f} 元。"
                "策略的盈利和金价的单边涨跌没有对应关系。",
                "金价对照只用于说明盈利分布，不进入交易测算，也不改变按 A05 得出的结论。",
            ]),
            ("对应材料", ["逐笔成交见《沪金午休实盘准入测算表.xlsx》的「逐笔台账」，分年数字和金价对照见「分年汇总」，"
                      "COMEX 黄金期货的收盘价见「在线数据」。两份文件的期末权益、成交笔数、强平次数和结论相同。"]),
        ],
    )
    print("查询时间", rec["查询时间"], "返回", len(g), "行", g.index[0], g.index[-1])


if __name__ == "__main__":
    main()
