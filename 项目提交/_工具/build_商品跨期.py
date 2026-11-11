#!/usr/bin/env python3
"""打包「商品跨期品种准入」这道题：题目附件、标准答案附件。

底稿是 cases/一期/carry_screen，附件内容没有改，只改了文件名。
在线 MCP 查的是上证指数（000001.SS）日线，用来核对 A01 的交易日是否齐全：
国内商品期货日盘和 A 股用同一份交易日历，各品种的交易日数是覆盖率和大波动日占比的分母。

脚本做的核对：
1. 调用底稿的重算脚本从附件重算一遍，十八行判定和 1850 行台账与底稿答案一致。
2. 上证指数在评估窗口内的交易日与 A01 各品种的交易日逐日相同。
"""
from __future__ import annotations

import pandas as pd

from build_common import CASES, OUT, copy_as, fresh_dir, load_mcp_prices, load_module, source_line, write_docx, write_xlsx

SRC = CASES / "一期" / "carry_screen"
DST = OUT / "题目" / "09_商品跨期品种准入"
PREFIX = "商品跨期_"
MCP_FILE = f"{PREFIX}MCP_000001.SS日线.json"
FIRST, LAST = "2023-01-03", "2026-10-30"
RENAME = {
    "A01_daily.csv": "A01_合约日线.csv",
    "A02_contracts.csv": "A02_合约规格.csv",
    "A03_背景与术语.md": "A03_背景与术语.md",
    "A04_配入口径.md": "A04_配入口径.md",
    "A05_准入与交付.md": "A05_准入与交付.md",
}


def main() -> None:
    att = fresh_dir(DST / "题目附件")
    ans = fresh_dir(DST / "标准答案附件")
    for old, new in RENAME.items():
        copy_as(SRC / "attachments" / old, att / f"{PREFIX}{new}")
    copy_as(DST / "MCP结果文件" / MCP_FILE, att / MCP_FILE)

    # 核对 1：重算
    mod = load_module(SRC / "rebuild.py", "carry_rebuild")
    summary, pairs = mod.build()
    old_s = pd.read_csv(SRC / "answer" / "summary.csv", keep_default_na=False)
    old_p = pd.read_csv(SRC / "answer" / "admitted_pairs.csv")
    assert summary.astype(str).values.tolist() == old_s.astype(str).values.tolist()
    assert len(pairs) == len(old_p) == 1850 and (pairs["ann"] - old_p["ann"]).abs().max() < 1e-9
    assert summary.loc[summary.admitted == "是", "product"].tolist() == ["rb", "i"]
    print("核对 1：重算与底稿答案一致，纳入 rb、i，台账", len(pairs), "行")

    # 核对 2：交易日
    rec, s = load_mcp_prices(DST / "MCP结果文件" / MCP_FILE, 8)
    idx = [d for d in s.index if FIRST <= d <= LAST]
    px = pd.read_csv(SRC / "attachments" / "A01_daily.csv", usecols=["date", "symbol"])
    px["product"] = px.symbol.str.split(".").str[1].str.replace(r"\d+", "", regex=True)
    for product, g in px.groupby("product"):
        assert sorted(g.date.unique()) == idx, product
    by_year = pd.Series(idx).str[:4].value_counts().sort_index()
    print("核对 2：上证指数窗口内交易日", len(idx), "个，与 18 个品种逐日相同；分年", by_year.to_dict())
    assert len(idx) == 925

    # 标准答案附件：xlsx
    s_head = ["品种代码", "品种", "交易日数", "配对日数", "大波动日数", "年化大于0的大波动日数", "年化小于0的大波动日数",
              "方向占比", "年化展期中位数", "是否纳入", "方向"]
    s_rows = [[r["product"], r["name"], int(r.trading_days), int(r.pair_days), int(r.big_days), int(r.pos_days), int(r.neg_days),
               float(r.share), float(r["median"]), r.admitted, r.side] for _, r in summary.iterrows()]
    p_head = ["品种代码", "日期", "近月代码", "远月代码", "近月收盘价", "远月收盘价", "近月最后交易日", "远月最后交易日", "间隔自然日", "年化展期"]
    p_rows = [[r["product"], r.date, r.near, r.far, float(r.near_close), float(r.far_close), r.near_expire, r.far_expire,
               int(r.calendar_days), round(float(r.ann), 6)] for _, r in pairs.iterrows()]
    o_head = ["年份", "上证指数交易日数", "A01各品种交易日数", "是否一致"]
    o_rows = [[y, int(n), int(n), "一致"] for y, n in by_year.items()] + [["合计", len(idx), 925, "一致"]]
    write_xlsx(
        ans / "商品跨期品种准入测算表.xlsx",
        [("品种判定表", s_head, s_rows), ("纳入品种逐日台账", p_head, p_rows), ("在线数据", o_head, o_rows)],
        notes={
            "品种判定表": ["四条门槛同时成立才纳入：配对日数÷交易日数≥95%，大波动日数÷交易日数≥60%，方向占比≥85%，中位数绝对值≥0.03。",
                      "只有螺纹钢 rb 和铁矿石 i 纳入。"],
            "纳入品种逐日台账": ["螺纹钢 925 行，铁矿石 925 行，共 1850 行。年化展期保留 6 位小数。"],
            "在线数据": [
                source_line(rec),
                f"返回 {len(s)} 行，{s.index[0]} 至 {s.index[-1]}。返回的 Date 是 UTC 时间，加 8 小时后的日期是交易日。",
                f"评估窗口 {FIRST} 至 {LAST} 上证指数有 {len(idx)} 个交易日，首日 {idx[0]}，末日 {idx[-1]}。",
                "国内商品期货日盘和 A 股用同一份交易日历。A01 里 18 个品种各有 925 个交易日，逐日与上证指数相同，没有缺失日，也没有多出的日期。",
                "交易日数是配对覆盖率和大波动日占比的分母，核对无误后按 925 计算。上证指数只用于核对交易日，不进入期限结构测算。",
            ],
        },
    )

    # 标准答案附件：docx
    row = {r["product"]: r for _, r in summary.iterrows()}
    rb, i_, y, ru, fg = row["rb"], row["i"], row["y"], row["ru"], row["FG"]
    write_docx(
        ans / "商品跨期组合建议.docx",
        "商品跨期价差组合品种准入建议",
        [
            ("结论", ["只纳入螺纹钢和铁矿石。螺纹钢升水，做空近月、做多远月；铁矿石贴水，做多近月、做空远月。其余十六个品种至少有一条门槛不成立，不纳入。"]),
            ("纳入的两个品种", [
                f"螺纹钢 rb：交易日 {rb.trading_days}，配对 {rb.pair_days}，大波动日 {rb.big_days}（年化为正 {rb.pos_days}、为负 {rb.neg_days}），"
                f"方向占比 {rb.share:.6f}，年化展期中位数 {rb['median']:+.6f}。四条门槛都成立。",
                f"铁矿石 i：交易日 {i_.trading_days}，配对 {i_.pair_days}，大波动日 {i_.big_days}（年化为正 {i_.pos_days}、为负 {i_.neg_days}），"
                f"方向占比 {i_.share:.0f}，年化展期中位数 {i_['median']:+.6f}。四条门槛都成立。",
            ]),
            ("三个容易误选的品种", [
                f"豆油 y：只差方向占比，{y.pos_days}/{y.big_days} = {y.share:.6f}，低于 85%。覆盖率、大波动日占比和中位数绝对值（{y['median']:+.6f}）都过。",
                f"天然橡胶 ru：只差大波动日占比，{ru.big_days}/{ru.trading_days} = {ru.big_days / ru.trading_days:.6f}，低于 60%。"
                f"配对 {ru.pair_days}/{ru.trading_days} 和方向占比 {ru.neg_days}/{ru.big_days} = {ru.share:.6f} 都过，中位数 {ru['median']:+.6f}。",
                f"玻璃 FG：只差方向占比，{fg.neg_days}/{fg.big_days} = {fg.share:.6f}，低于 85%。中位数 {fg['median']:+.6f}，绝对值是未纳入品种里最大的，但不能因为曲线陡就纳入。",
            ]),
            ("交易日核对", [
                f"用 US Stocks MCP 查询了上证指数（000001.SS）日线。评估窗口 {FIRST} 至 {LAST} 上证指数有 {len(idx)} 个交易日，"
                "A01 里十八个品种各有 925 个交易日，逐日相同，没有缺失日。",
                "交易日数是配对覆盖率和大波动日占比的分母，按 925 计算。上证指数只用于核对交易日，不进入期限结构测算。",
            ]),
            ("对应材料", ["十八个品种的判定见《商品跨期品种准入测算表.xlsx》的「品种判定表」，两个纳入品种的 1850 行逐日配对见「纳入品种逐日台账」，"
                      "交易日核对见「在线数据」。两份文件的纳入名单和方向相同。"]),
        ],
    )
    print("查询时间", rec["查询时间"], "返回", len(s), "行", s.index[0], s.index[-1])


if __name__ == "__main__":
    main()
