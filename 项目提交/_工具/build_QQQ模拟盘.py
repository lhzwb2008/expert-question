#!/usr/bin/env python3
"""打包「QQQ模拟盘准入」这道题：题目附件、标准答案附件。

底稿是 cases/一期/qqq_turtle_gate，附件内容没有改，只改了文件名。标答数字直接取底稿的 answer/。
在线 MCP 查的是 QQQ 日线，用来核对买入持有基准的两个价格和复权口径。

脚本做的核对：
1. A01 的首日开盘价、末日收盘价和 MCP 返回值比对。
2. 用返回里的 Dividends 列把复权价还原成不复权价，算出含分红、不含分红两种口径的买入持有收益。
3. 底稿答案里的成交笔数、费用、期末权益和 rebuild_check.json 对得上。
"""
from __future__ import annotations

import json

import pandas as pd

from build_common import CASES, OUT, copy_as, fresh_dir, load_mcp_prices, source_line, write_docx, write_xlsx

SRC = CASES / "一期" / "qqq_turtle_gate"
DST = OUT / "题目" / "07_QQQ模拟盘准入"
PREFIX = "QQQ模拟盘_"
MCP_FILE = f"{PREFIX}MCP_QQQ日线.json"
D0, D1 = "2021-01-04", "2026-10-30"
START = 100_000.0
RENAME = {
    "A01_qqq_daily.csv": "A01_QQQ日线.csv",
    "A02_参数手册.md": "A02_参数手册.md",
    "A03_实习生参数说明.md": "A03_实习生参数说明.md",
    "A04_费用.csv": "A04_费用.csv",
    "A05_准入门槛.md": "A05_准入门槛.md",
    "A06_实习生回测摘要.csv": "A06_实习生回测摘要.csv",
}
ACTION = {"buy": "买入", "sell": "卖出", "short": "卖空", "cover": "买回"}


def main() -> None:
    att = fresh_dir(DST / "题目附件")
    ans = fresh_dir(DST / "标准答案附件")
    for old, new in RENAME.items():
        copy_as(SRC / "attachments" / old, att / f"{PREFIX}{new}")
    copy_as(DST / "MCP结果文件" / MCP_FILE, att / MCP_FILE)

    chk = json.load(open(SRC / "answer" / "rebuild_check.json", encoding="utf-8"))
    off, intern = chk["official"], chk["intern"]
    trades = pd.read_csv(SRC / "answer" / "official_trades.csv")
    equity = pd.read_csv(SRC / "answer" / "official_equity.csv")
    assert len(trades) == off["fills"] == 331 and abs(trades.fee.sum() - off["fees"]) < 0.01
    assert abs(equity.equity.iloc[-1] - off["final_equity"]) < 0.01 and len(equity) == off["days"]
    print("核对 3：底稿答案 331 笔、手续费", round(trades.fee.sum(), 2), "、期末权益", equity.equity.iloc[-1], "，与 rebuild_check.json 一致")
    print("        成交动作：", trades.action.value_counts().to_dict())

    # 核对 1、2
    rec, q = load_mcp_prices(DST / "MCP结果文件" / MCP_FILE, 0)
    assert set(q.Date.str[11:13]) <= {"04", "05"}
    a01 = pd.read_csv(SRC / "attachments" / "A01_qqq_daily.csv").set_index("Date")
    in_rng = q.loc[a01.index[0]:a01.index[-1]]
    assert list(in_rng.index) == list(a01.index)
    o_adj, c_adj = float(q.Open[D0]), float(q.Close[D1])
    o_a01, c_a01 = float(a01.Open[D0]), float(a01.Close[D1])
    print(f"核对 1：A01 {len(a01)} 个交易日，与 MCP 同区间一致。{D0} 开盘 A01 {o_a01}，MCP {o_adj:.4f}；{D1} 收盘 A01 {c_a01}，MCP {c_adj:.4f}")
    assert abs(o_adj - o_a01) < 0.005 and abs(c_adj - c_a01) < 0.005
    bars = q.reset_index()
    f, fac = 1.0, [1.0] * len(bars)
    for i in range(len(bars) - 1, -1, -1):
        fac[i] = f
        if bars.Dividends[i] and i > 0:
            f *= 1 - bars.Dividends[i] / (bars.Close[i - 1] / f + bars.Dividends[i])
    bars["fac"] = fac
    b = bars.set_index("day")
    fac0, fac1 = float(b.fac[D0]), float(b.fac[D1])
    o_raw, c_raw = o_adj / fac0, c_adj / fac1
    divs = q[(q.Dividends != 0) & (q.index >= D0) & (q.index <= D1)].Dividends
    later = q[(q.Dividends != 0) & (q.index > D1)]
    splits = q[q["Stock Splits"] != 0]
    r_total, r_price = c_adj / o_adj - 1, c_raw / o_raw - 1
    r_a01 = c_a01 / o_a01 - 1
    bh, bh_price = START * (1 + r_a01), START * (1 + r_price)
    print(f"核对 2：评估窗内分红 {len(divs)} 次，合计 {divs.sum():.3f} 美元/股（{divs.index[0]} 至 {divs.index[-1]}）；{D1} 之后分红 {len(later)} 次；拆分 {len(splits)} 次")
    print(f"        {D0} 调整系数 {fac0:.6f}，还原不复权开盘价 {o_raw:.2f}；{D1} 系数 {fac1:.6f}")
    print(f"        含分红 {r_total:.4%}（A01 口径 {r_a01:.4%}），不含分红 {r_price:.4%}；买入持有期末 {bh:.2f}，一半 {bh / 2:.2f}；不含分红期末 {bh_price:.2f}，一半 {bh_price / 2:.2f}")
    assert abs(r_a01 - off["buy_hold_return"]) < 1e-6 and len(splits) == 0 and len(later) == 0

    # 标准答案附件：xlsx
    l_head = ["回合", "日期", "方向", "价格", "股数", "费用", "成交原因"]
    l_rows = [[int(r.round_id), r.Date, ACTION[r.action], float(r.price), int(r.shares), float(r.fee), r.reason] for _, r in trades.iterrows()]
    e_head = ["日期", "收盘权益", "持仓方向", "持仓股数"]
    e_rows = [[r.Date, float(r.equity), int(r.side), int(r.shares)] for _, r in equity.iterrows()]
    d_head = ["项目", "正式结果", "A06实习生摘要", "说明"]
    d_rows = [
        ["期末权益(美元)", off["final_equity"], intern["final_equity"], "A06 不作为正式结果"],
        ["总收益(%)", round(off["total_return"] * 100, 4), round(intern["total_return"] * 100, 4), ""],
        ["最大回撤(%)", round(-off["mdd"] * 100, 4), round(-intern["mdd"] * 100, 4), f"正式结果谷底日 {off['mdd_date']}"],
        ["成交笔数", off["fills"], intern["fills"], "实习生不加仓、没有 2N 止损"],
        ["手续费(美元)", off["fees"], intern["fees"], "实习生没有扣每股 0.005 美元"],
        ["55日入场次数", off["reasons"]["entry55"], 0, "实习生只用 20 日"],
        ["20日入场次数", off["reasons"]["entry20"], intern["reasons"]["entry20_close"], "实习生按收盘价突破"],
        ["结论", "搁置，不签发", "签发", "按 A02、A04 重算后三条门槛都未通过"],
    ]
    o_head = ["项目", "日期", "数值", "说明"]
    o_rows = [
        ["MCP返回开盘价（复权）", D0, round(o_adj, 4), "买入持有的买入价"],
        ["A01开盘价", D0, o_a01, "与返回值相差不到 0.001"],
        ["MCP返回收盘价（复权）", D1, round(c_adj, 4), "买入持有的计价"],
        ["A01收盘价", D1, c_a01, "与返回值一致"],
        ["调整系数", D0, round(fac0, 6), "由 Dividends 列从最近一天往回推出"],
        ["还原不复权开盘价", D0, round(o_raw, 2), "返回开盘价 ÷ 调整系数"],
        ["买入持有收益，含分红(%)", f"{D0} 至 {D1}", round(r_total * 100, 2), "复权价口径，与 A01 算出的 126.5737% 一致"],
        ["买入持有收益，不含分红(%)", f"{D0} 至 {D1}", round(r_price * 100, 2), "不复权价口径"],
        ["评估窗内分红次数", f"{D0} 至 {D1}", len(divs), f"合计每股 {divs.sum():.3f} 美元"],
    ] + [["分红", day, float(v), "每股美元"] for day, v in divs.items()]
    write_xlsx(
        ans / "QQQ模拟盘准入测算表.xlsx",
        [("逐笔台账", l_head, l_rows), ("每日权益", e_head, e_rows), ("差异清单", d_head, d_rows), ("在线数据", o_head, o_rows)],
        notes={
            "逐笔台账": ["按 A02、A04 重算，2021-01-04 至 2026-10-30 共 331 笔成交，手续费合计 217.56 美元。期末持有空头 87 股，没有额外平仓。"],
            "每日权益": ["最大回撤按每日收盘权益相对此前最高收盘权益计算，为 42.4577%，谷底日 2026-04-10。"],
            "差异清单": ["A06 是实习生的摘要，只用来对照差异，不作为正式结果。"],
            "在线数据": [
                source_line(rec),
                f"返回 {len(q)} 行，{q.index[0]} 至 {q.index[-1]}。返回的 Date 是美东零点对应的 UTC 时间，日期部分就是交易日。"
                f"{a01.index[0]} 至 {a01.index[-1]} 返回 {len(in_rng)} 个交易日，与 A01 的交易日完全一致。",
                "返回的开高低收都按现金分红做过前复权，没有拆分记录。A01 的首日开盘价、末日收盘价与返回值相同，说明 A01 也是复权价。",
                f"还原办法：从最近一天往回，每遇到一个除息日，之前的系数乘以（1 − 每股分红 ÷ 除息前一日的不复权收盘价）。{D1} 之后到查询日没有分红，{D1} 的系数为 1。",
                f"买入持有按复权价是含分红的总回报 {r_total:.2%}；按不复权价只算价格涨幅是 {r_price:.2%}，对应期末 {bh_price:,.2f} 美元，一半 {bh_price / 2:,.2f} 美元。"
                "两种口径下门槛三都不通过。",
                "以后每次分红，返回的历史复权价会整体缩小，含分红收益、还原后的不复权价和分红记录不变。",
            ],
        },
    )

    # 标准答案附件：docx
    half = bh / 2
    write_docx(
        ans / "QQQ模拟盘准入备忘录.docx",
        "QQQ 日线趋势策略模拟盘准入备忘录",
        [
            ("结论", ["搁置，不签发模拟盘。按 A02、A04 重算后，A05 的三条门槛都没有通过。"]),
            ("三条门槛", [
                f"门槛一，期末权益高于 100,000 美元：未通过。期末权益 {off['final_equity']:,.2f} 美元，总收益 {off['total_return'] * 100:.4f}%。",
                f"门槛二，每日收盘权益最大回撤不超过 25%：未通过。最大回撤 {-off['mdd'] * 100:.4f}%，谷底日 {off['mdd_date']}。",
                f"门槛三，期末权益不低于买入持有期末权益的一半：未通过。买入持有收益 {r_a01 * 100:.4f}%，期末权益 {bh:,.2f} 美元，"
                f"一半是 {half:,.2f} 美元，策略期末权益低于它。",
            ]),
            ("重算结果", [
                f"评估窗 {D0} 至 {D1}，共 {off['days']} 个交易日，起始现金 100,000 美元。",
                f"成交 {off['fills']} 笔，手续费 {off['fees']:.2f} 美元。开仓回合 {off['rounds']} 个，做多 45 个、做空 32 个，已结束 {off['closed_rounds']} 个。"
                f"20 日入场 {off['reasons']['entry20']} 次，55 日入场 {off['reasons']['entry55']} 次。",
                f"{D1} 收盘持有空头 {-off['open_shares']} 股，当天建立，没有额外平仓，按当日收盘价计入期末权益。",
            ]),
            ("买入持有基准的口径核对", [
                f"用 US Stocks MCP 查询了 QQQ 日线。{D0} 开盘价返回 {o_adj:.4f}，A01 是 {o_a01}；{D1} 收盘价返回 {c_adj:.2f}，A01 是 {c_a01}。两个价格都对得上。",
                f"返回的价格按现金分红做过前复权，A01 和它一致，也是复权价。评估窗内 QQQ 分红 {len(divs)} 次，合计每股 {divs.sum():.3f} 美元，没有拆分。"
                f"按分红记录还原，{D0} 的不复权开盘价是 {o_raw:.2f} 美元。",
                f"所以 A05 的买入持有收益 {r_a01 * 100:.4f}% 是含分红再投资的总回报。只算价格涨幅是 {r_price * 100:.2f}%，对应期末 {bh_price:,.2f} 美元，"
                f"一半是 {bh_price / 2:,.2f} 美元。策略期末权益 {off['final_equity']:,.2f} 美元在两种口径下都低于一半，门槛三的结论不受口径影响。",
                "门槛判定仍按 A05 用 A01 的价格，在线数据只用于核对口径。",
            ]),
            ("与实习生摘要的差异", [
                f"A06 的期末权益是 {intern['final_equity']:,.2f} 美元，成交 {intern['fills']} 笔，手续费 0 美元，没有 55 日入场，建议签发。",
                "差异来自 A03 的做法：按收盘价突破、每次一个单位不加仓、只用 20 日、没有 2N 止损、不扣费用。这些都和 A02、A04 不一致，A06 不作为正式结果。",
            ]),
            ("对应材料", ["逐笔成交见《QQQ模拟盘准入测算表.xlsx》的「逐笔台账」，每日收盘权益见「每日权益」，与 A06 的对照见「差异清单」，"
                      "买入持有基准的核对见「在线数据」。两份文件的期末权益、成交笔数和结论相同。"]),
        ],
    )
    print("买入持有：", round(bh, 2), round(half, 2), "不含分红：", round(bh_price, 2), round(bh_price / 2, 2))
    print("查询时间", rec["查询时间"], "返回", len(q), "行", q.index[0], q.index[-1])


if __name__ == "__main__":
    main()
