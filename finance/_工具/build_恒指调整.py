#!/usr/bin/env python3
"""打包「恒指调整AH交易」这道题：题目附件、标准答案附件。

和 high-econ/一期/ah_hsi_gate 相比只有一处改动：A01 去掉宁德时代两只股票的行情，改由在线 MCP 查询。
MCP 结果文件放在 题目/01_恒指调整AH交易/MCP结果文件/，由 mcp_call.py --save 生成，本脚本只读不改。

在线 MCP（US Stocks MCP，数据来自 Yahoo Finance）返回的收盘价按之后的现金分红做过前复权。
脚本做三件核对：
1. 用返回里的 Dividends 列把价格还原成不复权价，和原快照逐日比对。
2. 把还原后的价格并回去重算，15 笔事件、三个窗口、结论应与原标答逐格一致。
3. 不还原、直接用返回的前复权价重算，看宁德时代这一笔的净收益差多少。
"""
from __future__ import annotations

import csv
import datetime as dt
import importlib.util
import json
import shutil

from build_common import CASES, OUT, copy_as, fresh_dir, write_docx, write_xlsx

SRC = CASES / "一期" / "ah_hsi_gate"
DST = OUT / "题目" / "01_恒指调整AH交易"
MCP = DST / "MCP结果文件"
PREFIX = "恒指调整_"
CATL = ("300750.SZ", "3750.HK")
Q_FROM, Q_TO = "2026-03-02", "2026-03-20"
KEY_DAYS = ("2026-03-06", "2026-03-09", "2026-03-13", "2026-03-20")

RENAME = {
    "A02_fx.csv": "A02_美元汇率.csv",
    "A03_背景与术语.md": "A03_背景与术语.md",
    "A04_事件与持有.md": "A04_事件与持有.md",
    "A05_是否开展.md": "A05_是否开展.md",
    "A06_成份股变动表.md": "A06_成份股变动表.md",
    "A07_公司代码.csv": "A07_公司代码.csv",
}


def local_day(stamp: str) -> str:
    """返回里的 Date 是 UTC 时间，对应北京时间／香港时间次日零点。"""
    t = dt.datetime.strptime(stamp[:19], "%Y-%m-%dT%H:%M:%S") + dt.timedelta(hours=8)
    return t.strftime("%Y-%m-%d")


def load_mcp(symbol: str):
    rec = json.load(open(MCP / f"{PREFIX}MCP_{symbol}日线.json", encoding="utf-8"))
    rows = json.loads(rec["原始返回"]["content"][0]["text"])
    bars = [{"date": local_day(r["Date"]), "adj": float(r["Close"]), "div": float(r["Dividends"]),
             "split": float(r["Stock Splits"])} for r in rows]
    bars.sort(key=lambda b: b["date"])
    # 从最近一天往回还原：除息日之前的价格都乘过 (1 - 分红/除息前一日不复权收盘价)
    f = 1.0
    for i in range(len(bars) - 1, -1, -1):
        bars[i]["raw"] = bars[i]["adj"] / f
        bars[i]["factor"] = f
        if bars[i]["div"] and i > 0:
            prev_raw = bars[i - 1]["adj"] / f + bars[i]["div"]
            f = f * (1 - bars[i]["div"] / prev_raw)
        if bars[i]["split"]:
            raise SystemExit(f"{symbol} 区间内有拆股，脚本没有处理")
    return rec, bars


def write_prices(path, rows) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["date", "symbol", "close"])
        w.writeheader()
        w.writerows(rows)


def main() -> None:
    att = fresh_dir(DST / "题目附件")
    ans = fresh_dir(DST / "标准答案附件")

    # 题目附件：必要附件
    rows = list(csv.DictReader(open(SRC / "attachments" / "A01_prices.csv", encoding="utf-8")))
    kept = [r for r in rows if r["symbol"] not in CATL]
    snap = {(r["symbol"], r["date"]): float(r["close"]) for r in rows if r["symbol"] in CATL}
    write_prices(att / f"{PREFIX}A01_AH不复权收盘价.csv", kept)
    for old, new in RENAME.items():
        copy_as(SRC / "attachments" / old, att / f"{PREFIX}{new}")
    print(f"A01 原 {len(rows)} 行，去掉宁德时代 {len(rows) - len(kept)} 行，留 {len(kept)} 行")

    # 题目附件：MCP 结果文件
    mcp = {}
    for s in CATL:
        rec, bars = load_mcp(s)
        mcp[s] = (rec, {b["date"]: b for b in bars})
        copy_as(MCP / f"{PREFIX}MCP_{s}日线.json", att / f"{PREFIX}MCP_{s}日线.json")
        divs = [(b["date"], b["div"]) for b in bars if b["div"]]
        print(f"{s} 查询时间 {rec['查询时间']}，{len(bars)} 行，分红 {divs}")

    # 核对 1：还原后的不复权价和原快照比
    days = sorted(d for d in mcp[CATL[0]][1] if Q_FROM <= d <= Q_TO)
    assert days == sorted(d for d in mcp[CATL[1]][1] if Q_FROM <= d <= Q_TO), "两只股票区间内交易日不一致"
    worst = 0.0
    for s in CATL:
        for d in days:
            worst = max(worst, abs(mcp[s][1][d]["raw"] - snap[(s, d)]))
    print(f"核对 1：区间内 {len(days)} 个交易日，还原价与原快照最大相差 {worst:.4f}")
    assert worst < 0.006, "还原后的不复权价和原快照对不上"
    factor = {s: mcp[s][1][KEY_DAYS[0]]["factor"] for s in CATL}

    # 标准答案附件：xlsx
    ev = list(csv.DictReader(open(SRC / "answer" / "events.csv", encoding="utf-8")))
    wn = list(csv.DictReader(open(SRC / "answer" / "windows.csv", encoding="utf-8")))
    ev_head = ["生效日", "加入或剔除", "公司名称", "A股代码", "H股代码", "开仓日",
               "N=1平仓日", "N=1净收益", "N=5平仓日", "N=5净收益", "N=10平仓日", "N=10净收益"]
    ev_rows = [[e["date"], e["side"], e["name"], e["a_symbol"], e["h_symbol"], e["entry"],
                e["exit_1"], float(e["pnl_1"]), e["exit_5"], float(e["pnl_5"]), e["exit_10"], float(e["pnl_10"])]
               for e in ev]
    wn_head = ["持有窗口N", "笔数", "净收益之和", "盈利笔数", "最差一笔公司", "最差一笔生效日", "最差一笔净收益", "是否合格"]
    wn_rows = [[int(x["n"]), int(x["trades"]), float(x["total"]), int(x["wins"]), x["worst_name"],
                x["worst_date"], float(x["worst_pnl"]), x["合格"]] for x in wn]
    a, h = CATL
    on_head = ["交易日", f"{a} MCP返回收盘价（前复权，人民币）", f"{a} 还原不复权价", f"{h} MCP返回收盘价（前复权，港元）", f"{h} 还原不复权价"]
    on_rows = [[d, round(mcp[a][1][d]["adj"], 4), round(mcp[a][1][d]["raw"], 2),
                round(mcp[h][1][d]["adj"], 4), round(mcp[h][1][d]["raw"], 2)] for d in days]
    div_text = {s: "、".join(f"{d} 每股 {v}" for d, v in
                            [(b["date"], b["div"]) for b in mcp[s][1].values() if b["div"]]) for s in CATL}
    write_xlsx(
        ans / "恒指调整AH交易评估表.xlsx",
        [("事件表", ev_head, ev_rows), ("窗口汇总", wn_head, wn_rows), ("在线数据", on_head, on_rows)],
        notes={
            "事件表": ["净收益对应每条腿 1 港元名义，已扣 0.004 费用，保留 6 位小数。"],
            "在线数据": [
                "来源：US Stocks MCP（https://mcp-stocks-us.gino.im/mcp，数据来自 Yahoo Finance），工具 get_historical_stock_prices，参数 period=1y、interval=1d。",
                f"查询时间：{a} {mcp[a][0]['查询时间']}；{h} {mcp[h][0]['查询时间']}。",
                "返回的 Date 是 UTC 时间，加 8 小时后的日期是交易日。",
                f"返回的收盘价按查询区间之后的现金分红做过前复权。{a} 的分红：{div_text[a]}；{h} 的分红：{div_text[h]}。",
                f"查询区间内没有除息，区间内每天的调整系数相同：{a} 为 {factor[a]:.6f}，{h} 为 {factor[h]:.6f}。还原不复权价 = 返回收盘价 ÷ 调整系数。",
                "并入测算的四个交易日：开仓 2026-03-06，N=1 平仓 2026-03-09，N=5 平仓 2026-03-13，N=10 平仓 2026-03-20。",
                "返回的前复权价会随以后的分红继续变化，同一天的不复权价和区间内的涨跌幅不变。",
            ],
        },
    )

    # 标准答案附件：docx
    raw = {s: {d: mcp[s][1][d]["raw"] for d in KEY_DAYS} for s in CATL}
    adj = {s: {d: mcp[s][1][d]["adj"] for d in KEY_DAYS} for s in CATL}
    write_docx(
        ans / "恒指调整AH交易开展建议.docx",
        "恒生指数成份股调整 A/H 交易开展建议",
        [
            ("结论", ["不开展。第 1 日、第 5 日、第 10 日三个持有窗口都没有同时满足四条合格线，没有可以开展的持有天数。"]),
            ("三个窗口", [
                "第 1 日窗口：15 笔，净收益之和 -0.006450，不大于 0；盈利 6 笔，少于 8 笔；最差一笔是 2022-12-05 海尔智家 -0.019667。不合格。",
                "第 5 日窗口：15 笔，净收益之和 0.033699，大于 0；盈利 8 笔；最差一笔是 2026-03-09 宁德时代 -0.089751，低于 -0.05。不合格。",
                "第 10 日窗口：15 笔，净收益之和 -0.078884，不大于 0；盈利 7 笔，少于 8 笔；最差一笔是 2026-03-09 宁德时代 -0.198820。不合格。",
                "第 5 日窗口的合计是三个里最高的，但单笔亏损线没有守住，不能因为合计为正就开展。",
            ]),
            ("事件范围", [
                "生效日在 2020-09-07 至 2026-09-07、备注含「指數檢討」、公司在 A07 里 A 股和 H 股代码齐全的变动共 15 笔："
                "2020-09-07 剔除中国神华，2021-06-07 加入比亚迪股份，2021-09-06 剔除交通银行、加入招商银行，"
                "2022-06-13 加入中芯国际，2022-09-05 加入中国神华，2022-12-05 加入海尔智家，2023-06-05 加入紫金矿业，"
                "2023-12-04 加入药明康德，2025-06-09 加入美的集团，2025-09-08 加入中国电信，2026-03-09 加入宁德时代和洛阳钼业，"
                "2026-06-08 加入中国铝业，2026-09-07 加入潍柴动力。",
                "药明生物、比亚迪电子、国药控股、华润电力没有 A 股，2026 年 1 月恒生银行是私有化，都不算事件。",
            ]),
            ("在线数据和复权口径", [
                "内部行情快照 A01 没有宁德时代，这一笔的价格通过 US Stocks MCP 查询。"
                f"返回的收盘价按之后的现金分红做过前复权（{a}：{div_text[a]}；{h}：{div_text[h]}），和 A03 要求的不复权口径不一样。",
                f"查询区间 2026-03-02 至 2026-03-20 内没有除息，区间内的调整系数是常数（{a} 为 {factor[a]:.6f}，{h} 为 {factor[h]:.6f}），"
                "开平仓价的比值不受影响。评估表按还原后的不复权价列示："
                f"开仓日 2026-03-06，A 股 {raw[a][KEY_DAYS[0]]:.2f} 元，H 股 {raw[h][KEY_DAYS[0]]:.2f} 港元；"
                f"2026-03-09 为 {raw[a][KEY_DAYS[1]]:.2f}、{raw[h][KEY_DAYS[1]]:.2f}；"
                f"2026-03-13 为 {raw[a][KEY_DAYS[2]]:.2f}、{raw[h][KEY_DAYS[2]]:.2f}；"
                f"2026-03-20 为 {raw[a][KEY_DAYS[3]]:.2f}、{raw[h][KEY_DAYS[3]]:.2f}。逐日返回见评估表的「在线数据」工作表。",
                "这一笔在第 1 日、第 5 日、第 10 日窗口的净收益分别是 0.022908、-0.089751、-0.198820。"
                "少了这一笔，事件只有 14 笔，三个窗口都凑不齐 15 笔。",
            ]),
            ("对应材料", ["逐笔事件见《恒指调整AH交易评估表.xlsx》的「事件表」，窗口统计见「窗口汇总」。两份文件的笔数、净收益和结论相同。"]),
        ],
    )

    # 核对 2、3：并回去重算
    spec = importlib.util.spec_from_file_location("ah_rebuild", SRC / "rebuild.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    tmp = fresh_dir(DST / "_核对用临时目录")
    for old in RENAME:
        copy_as(SRC / "attachments" / old, tmp / old)
    mod.ATT = tmp
    want_ev = [(e["date"], e["side"], e["name"], e["entry"], e["exit_1"], e["pnl_1"], e["exit_5"], e["pnl_5"],
                e["exit_10"], e["pnl_10"]) for e in ev]

    def run(kind: str):
        add = [{"date": d, "symbol": s, "close": mcp[s][1][d][kind]} for s in CATL for d in days]
        write_prices(tmp / "A01_prices.csv", kept + add)
        detail, summary, decision = mod.build()
        got = [(r["date"], r["side"], r["name"], r["entry"], r["exit_1"], f"{r['pnl_1']:.6f}", r["exit_5"],
                f"{r['pnl_5']:.6f}", r["exit_10"], f"{r['pnl_10']:.6f}") for r in detail.to_dict("records")]
        return got, summary, decision

    got, summary, decision = run("raw")
    assert got == want_ev and decision == "不开展", "还原价重算结果和原标答不一致"
    print("核对 2：并入还原后的不复权价，15 笔事件、三个窗口、结论都和原标答一致")
    got2, summary2, decision2 = run("adj")
    catl_std = [x for x in want_ev if x[2] == "寧德時代"][0]
    catl_adj = [x for x in got2 if x[2] == "寧德時代"][0]
    diff = max(abs(float(catl_std[i]) - float(catl_adj[i])) for i in (5, 7, 9))
    print(f"核对 3：直接用返回的前复权价，宁德时代三笔净收益 {catl_adj[5]} {catl_adj[7]} {catl_adj[9]}，"
          f"与标答最大相差 {diff:.6f}，结论 {decision2}")
    write_prices(tmp / "A01_prices.csv", kept)
    try:
        mod.build()
        without = "仍能算出（不应该）"
    except Exception as e:  # noqa: BLE001
        without = f"算不出：{type(e).__name__} {e}"
    print("只用新附件、不查 MCP：", without)
    shutil.rmtree(tmp)
    print("四个交易日返回价：", {s: [round(adj[s][d], 4) for d in KEY_DAYS] for s in CATL})
    print("调整系数：", {s: round(factor[s], 6) for s in CATL})


if __name__ == "__main__":
    main()
