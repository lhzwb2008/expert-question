#!/usr/bin/env python3
"""打包「美股配对筛选」这道题：题目附件、标准答案附件。

底稿是 high-econ/二期/pairs_desk，附件内容没有改，只改了文件名。
在线 MCP 查的是拟上线那一对（XOM、CVX）的公司信息，用来核对两只股票现在是否仍属于同一行业。

脚本做的核对：
1. 用改名后的附件重算，8 对候选的判定表和 XOM/CVX 的 20 笔交易应与原标答一致。
2. 读两个 MCP 结果文件里的 sector、industry 字段，确认两只股票相同。
"""
from __future__ import annotations

import json
import shutil

import pandas as pd

from build_common import CASES, OUT, MCP_NAME, copy_as, fresh_dir, load_mcp, load_module, write_docx, write_xlsx

SRC = CASES / "二期" / "pairs_desk"
DST = OUT / "题目" / "06_美股配对筛选"
PREFIX = "美股配对_"
PAIR = ("XOM", "CVX")
RENAME = {
    "A01_prices.csv": "A01_股票复权日线.csv",
    "A02_pairs.csv": "A02_候选对名单.csv",
    "A03_口径说明.md": "A03_口径说明.md",
    "A04_合格线与交付.md": "A04_合格线与交付.md",
}


def main() -> None:
    att = fresh_dir(DST / "题目附件")
    ans = fresh_dir(DST / "标准答案附件")
    for old, new in RENAME.items():
        copy_as(SRC / "attachments" / old, att / f"{PREFIX}{new}")
    files = {s: f"{PREFIX}MCP_{s}公司信息.json" for s in PAIR}
    for f in files.values():
        copy_as(DST / "MCP结果文件" / f, att / f)

    # 核对 1
    mod = load_module(SRC / "rebuild.py", "pairs_rebuild")
    tmp = fresh_dir(DST / "_核对用临时目录")
    for old, new in RENAME.items():
        copy_as(att / f"{PREFIX}{new}", tmp / old)
    mod.ATT = tmp
    table, books, choice = mod.build()
    shutil.rmtree(tmp)
    want = pd.read_csv(SRC / "answer" / "summary.csv", dtype=str)
    got = [(r.pair, str(int(r.trades)), f"{r.net:.2f}", str(int(r.wins)), str(int(r.stops)), f"{r.worst:.2f}")
           for _, r in table.iterrows()]
    assert choice == "/".join(PAIR) and got == [tuple(x) for x in want[["pair", "trades", "net", "wins", "stops", "worst"]].to_numpy()]
    led = books[choice]
    want_led = pd.read_csv(SRC / "answer" / "chosen_trades.csv", dtype=str)
    assert [f"{x:.2f}" for x in led.pnl] == want_led.pnl.tolist() and [f"{x:.4f}" for x in led.entry_z] == want_led.entry_z.tolist()
    print("核对 1：重算结果与原标答一致，选择", choice, "，", len(led), "笔")

    # 核对 2
    info = {}
    for s in PAIR:
        rec, text = load_mcp(DST / "MCP结果文件" / files[s])
        info[s] = (rec, json.loads(text))
        print(f"核对 2：{s} 查询时间 {rec['查询时间']}，工具 {rec['工具']}，longName={info[s][1]['longName']}，"
              f"sector={info[s][1]['sector']}，industry={info[s][1]['industry']}")
    a, b = (info[s][1] for s in PAIR)
    assert a["sector"] == b["sector"] and a["industry"] == b["industry"]
    tag = pd.read_csv(SRC / "attachments" / "A02_pairs.csv").set_index("pair").industry[choice]

    # 标准答案附件：xlsx
    t_head = ["候选对", "交易笔数", "净收益(美元)", "盈利笔数", "止损次数", "最差一笔净收益(美元)", "是否合格"]
    t_rows = [[r.pair, int(r.trades), round(r.net, 2), int(r.wins), int(r.stops), round(r.worst, 2), "是" if r["pass"] else "否"]
              for _, r in table.iterrows()]
    l_head = ["开仓日", "平仓日", "方向", "开仓z值", "平仓z值", "平仓原因", "净收益(美元)"]
    l_rows = [[r.entry_date, r.exit_date, r.side, round(r.entry_z, 4), round(r.exit_z, 4), r.exit_reason, round(r.pnl, 2)]
              for _, r in led.iterrows()]
    o_head = ["代码", "公司名称(longName)", "sector", "industry", "查询时间", "工具"]
    o_rows = [[s, info[s][1]["longName"], info[s][1]["sector"], info[s][1]["industry"], info[s][0]["查询时间"], info[s][0]["工具"]]
              for s in PAIR]
    write_xlsx(
        ans / "美股配对筛选测算表.xlsx",
        [("候选对判定表", t_head, t_rows), ("上线对逐笔交易", l_head, l_rows), ("在线数据", o_head, o_rows)],
        notes={
            "候选对判定表": ["合格 = 净收益之和大于 0，且止损不超过 4 次。合格的候选里净收益最高的是 XOM/CVX。"],
            "上线对逐笔交易": ["上线的一对是 XOM/CVX，A 为 XOM，B 为 CVX。2021-01-04 至 2026-10-30 共 20 笔。"],
            "在线数据": [
                f"来源：{MCP_NAME}，工具 get_stock_info，参数为 ticker。",
                f"两只股票的 sector 都是 {a['sector']}，industry 都是 {a['industry']}，属于同一行业，和 A02 的行业标注「{tag}」相符。",
                "返回里的股价、市值、估值等字段是查询当时的快照，本题不使用。",
            ],
        },
    )

    # 标准答案附件：docx
    row = {r.pair: r for _, r in table.iterrows()}

    def s(p):
        r = row[p]
        return f"{int(r.trades)} 笔，净收益 {r.net:.2f} 美元，盈利 {int(r.wins)} 笔，止损 {int(r.stops)} 次"

    t1 = led.iloc[0]
    t2 = led[led.entry_date == "2023-01-11"].iloc[0]
    write_docx(
        ans / "美股配对上线建议.docx",
        "美股同行业配对交易上线建议",
        [
            ("结论", ["上线 XOM/CVX。它的净收益为正、止损不超过 4 次，在两对合格的候选里净收益更高。"]),
            ("8 对候选", [
                "回测从 2021-01-04 到 2026-10-30，每笔两条腿各 10000 美元。合格要同时满足净收益之和大于 0、止损不超过 4 次。",
                f"GS/MS：{s('GS/MS')}。净收益是 8 对里最高的，但止损超过 4 次，不合格。",
                f"V/MA：{s('V/MA')}。止损超过 4 次，不合格。",
                f"JPM/BAC：{s('JPM/BAC')}。止损超过 4 次，不合格。",
                f"KO/PEP：{s('KO/PEP')}。HD/LOW：{s('HD/LOW')}。UPS/FDX：{s('UPS/FDX')}。三对净收益为负，不合格。",
                f"XOM/CVX：{s('XOM/CVX')}。合格。",
                f"PG/CL：{s('PG/CL')}。合格，但净收益低于 XOM/CVX。",
            ]),
            ("XOM/CVX 的两笔交易", [
                f"第一笔 {t1.entry_date} 开仓，空 XOM 多 CVX，开仓 z 值 {t1.entry_z:.4f}；{t1.exit_date} 持有满 40 个交易日到期平仓，"
                f"平仓 z 值 {t1.exit_z:.4f}，净收益 {t1.pnl:.2f} 美元，是它最差的一笔。",
                f"{t2.entry_date} 开仓的一笔，空 XOM 多 CVX，开仓 z 值 {t2.entry_z:.4f}；{t2.exit_date} 止损平仓，"
                f"平仓 z 值 {t2.exit_z:.4f}，净收益 {t2.pnl:.2f} 美元。",
            ]),
            ("行业核对", [
                f"定下 XOM/CVX 之后，用 US Stocks MCP 的 get_stock_info 分别查询了两只股票（{info['XOM'][0]['查询时间']}）。"
                f"XOM 返回的公司名称是 {a['longName']}，CVX 是 {b['longName']}。两只的 sector 都是 {a['sector']}，industry 都是 {a['industry']}。",
                f"两只股票目前属于同一行业，和 A02 的行业标注「{tag}」相符，同行业配对的前提成立。",
            ]),
            ("对应材料", ["8 对候选的统计见《美股配对筛选测算表.xlsx》的「候选对判定表」，XOM/CVX 的 20 笔交易见「上线对逐笔交易」，"
                      "行业查询结果见「在线数据」。两份文件的数字和选择相同。"]),
        ],
    )
    print("抽查：", t1.to_dict(), t2.to_dict(), sep="\n  ")


if __name__ == "__main__":
    main()
