#!/usr/bin/env python3
"""打包「港股持仓变现能力与开放频率」这道题：题目附件、标准答案附件。

2026-11-14 按质检意见重做。原来是三条限额、超限减持、整改后重算，和 A 股调仓指令复核的任务链重复；
现在没有限额和整改，任务是测算持仓的变现阶梯和四档赎回情景下按比例卖出所需的天数，再按 30% 赎回情景给产品的开放频率定档。

成交量和收盘价全部来自 US Stocks MCP 的实际调用（新题数据/港股流动性/），口径文件在 新题口径/港股流动性/。持股数是下面 HOLD 里拟的。
A01、A02 快照收录十一只股票，云顶新耀（1952.HK）留给在线 MCP 查询。

脚本做的事：
1. 生成 A01（日成交量）和 A02（持仓清单，含基准日收盘价）。
2. 只用题目附件加云顶新耀的 MCP 结果文件重算，生成标准答案附件。
3. 检查 30% 赎回情景离档位边界的距离，并算一遍常见错误的结果。
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
DST = OUT / "题目" / "12_港股持仓变现能力"
PREFIX = "港股流动性_"
MCP_CODE = "1952.HK"
MCP_FILE = f"{PREFIX}MCP_1952.HK日线.json"
FIRST, BASE = "2026-05-04", "2026-10-30"
PART = F(1, 4)
LADDER = (1, 2, 3, 5, 10)
REDEEM = (F(1, 10), F(2, 10), F(3, 10), F(5, 10))
KEY = F(3, 10)
HOLD = [  # 代码, 名称, 持股数
    ("0700.HK", "腾讯控股", 612000),
    ("9988.HK", "阿里巴巴-W", 2435000),
    ("0941.HK", "中国移动", 2480000),
    ("1299.HK", "友邦保险", 2618000),
    ("2318.HK", "中国平安", 3150000),
    ("0883.HK", "中国海洋石油", 7060000),
    ("0388.HK", "香港交易所", 395000),
    ("6990.HK", "科伦博泰生物-B", 848600),
    ("1952.HK", "云顶新耀", 16800000),
    ("9969.HK", "诺诚健华", 12000000),
    ("9626.HK", "哔哩哔哩-W", 2380000),
    ("3896.HK", "金山云", 29500000),
]


def grade(days: int) -> str:
    return "每日开放" if days <= 3 else ("每周开放" if days <= 5 else "每月开放")


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
        rows.append(dict(code=h["code"], name=h["name"], shares=s, close=close[h["code"]], value=s * close[h["code"]],
                         adv20=adv20, adv60=adv60, use=use, cap=cap, days=-(-s // cap)))
    total = sum(r["value"] for r in rows)
    ladder = []
    for n in LADDER:
        v = sum(min(r["shares"], n * r["cap"]) * r["close"] for r in rows)
        ladder.append(dict(n=n, v=v, p=v / total))
    scen = []
    for x in REDEEM:
        need = {r["code"]: -(-math.ceil(r["shares"] * x) // r["cap"]) for r in rows}
        d = max(need.values())
        scen.append(dict(x=x, days=d, who=[r for r in rows if need[r["code"]] == d], need=need))
    key = next(s for s in scen if s["x"] == KEY)
    return rows, total, ladder, scen, grade(key["days"])


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
    copy_as(DOC / "A03_流动性口径.md", att / f"{PREFIX}A03_流动性口径.md")
    copy_as(DOC / "A04_定档规则与交付.md", att / f"{PREFIX}A04_定档规则与交付.md")
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
    rows, total, ladder, scen, verdict = measure(hold, vol, close)

    fl = float
    pc = lambda x: f"{fl(x) * 100:.2f}%"
    print(f"A01 {len(a01)} 行。结论 {verdict}。组合总市值 {fl(total):,.2f}")
    rank = sorted(rows, key=lambda r: -r["value"])
    for r in rows:
        print(f"  {r['code']} {r['name']:9} 持 {r['shares']:>10,} 价 {fl(r['close']):>7.2f} 市值 {fl(r['value']):>16,.2f} 第{rank.index(r) + 1:>2} "
              f"ADV20 {fl(r['adv20']):>13,.2f} ADV60 {fl(r['adv60']):>13,.2f} 日可变现 {r['cap']:>10,} 天数 {r['days']:>2}")
    for a in ladder:
        print(f"  {a['n']:>2} 日可变现 {fl(a['v']):,.2f}（{pc(a['p'])}）")
    for s in scen:
        print(f"  赎回 {pc(s['x'])}：{s['days']} 天，瓶颈 {[r['name'] for r in s['who']]}，档位 {grade(s['days'])}；各只 {list(s['need'].values())}")
    x = next(r for r in rows if r["code"] == MCP_CODE)
    key = next(s for s in scen if s["x"] == KEY)
    assert verdict == "每周开放" and key["days"] == 4 and [r["code"] for r in key["who"]] == [MCP_CODE]
    sell = math.ceil(x["shares"] * KEY)
    assert 3 * x["cap"] * F(11, 10) < sell < 4 * x["cap"] * F(9, 10)   # 离 3 天、4 天两条线都有 10% 以上的距离
    for s in scen:
        assert len(s["who"]) == 1
    full_days = max(r["days"] for r in rows)
    slow = [r for r in rows if r["days"] == full_days]

    # 常见错误
    wrong = {}
    for mode, label in (("adv20", "只用 ADV20"), ("adv60", "只用 ADV60")):
        r2, t2, l2, s2, v2 = measure(hold, vol, close, mode)
        wrong[mode] = (next(s for s in s2 if s["x"] == KEY), v2, next(r for r in r2 if r["code"] == MCP_CODE))
        print(f"  {label}：30% 赎回 {wrong[mode][0]['days']} 天，瓶颈 {[r['name'] for r in wrong[mode][0]['who']]}，结论 {v2}；各档 {[s['days'] for s in s2]}")
    hold11 = [h for h in hold if h["code"] != MCP_CODE]
    r3, t3, l3, s3, v3 = measure(hold11, vol, close)
    k3 = next(s for s in s3 if s["x"] == KEY)
    print(f"  漏掉云顶新耀：总市值 {fl(t3):,.2f}，30% 赎回 {k3['days']} 天，瓶颈 {[r['name'] for r in k3['who']]}，结论 {v3}")
    assert wrong["adv60"][1] == "每日开放" and v3 == "每日开放"

    # 3. 标准答案附件
    h_head = ["代码", "名称", "持股数", "基准日收盘价(港元)", "市值(港元)", "ADV20(股)", "ADV60(股)", "可用日均量(股)", "日可变现量(股)", "变现天数"]
    h_rows = [[r["code"], r["name"], r["shares"], fl(r["close"]), round(fl(r["value"]), 2), round(fl(r["adv20"]), 2), round(fl(r["adv60"]), 2),
               round(fl(r["use"]), 2), r["cap"], r["days"]] for r in rows]
    l_head = ["N（交易日）", "N日可变现市值(港元)", "N日可变现比例(%)"]
    l_rows = [[a["n"], round(fl(a["v"]), 2), round(fl(a["p"]) * 100, 2)] for a in ladder]
    s_head = ["赎回比例(%)", "所需天数", "瓶颈股票", "瓶颈股票要卖的股数", "瓶颈股票日可变现量(股)"]
    s_rows = [[int(s["x"] * 100), s["days"], "、".join(r["name"] for r in s["who"]), math.ceil(s["who"][0]["shares"] * s["x"]), s["who"][0]["cap"]] for s in scen]
    last20 = mb.tail(20)
    d_rows = [[day, int(v)] for day, v in last20.Volume.items()]
    first60 = mb.index[-60]
    kl = next(r for r in rows if r["code"] == "6990.HK")
    lad = {a["n"]: a for a in ladder}
    sc = {int(s["x"] * 100): s for s in scen}
    write_xlsx(
        ans / "港股持仓变现能力测算表.xlsx",
        [("持仓变现能力", h_head, h_rows), ("变现阶梯", l_head, l_rows), ("赎回情景", s_head, s_rows),
         ("在线数据", ["交易日", "云顶新耀(1952.HK)日成交量(股)"], d_rows)],
        notes={
            "持仓变现能力": ["可用日均量取 ADV20 和 ADV60 里较小的一个；日可变现量 = 可用日均量 × 25%，向下取整；变现天数向上取整。",
                       f"组合总市值 {fl(total):,.2f} 港元。全部变现天数 {full_days} 天，最慢的是{'、'.join(r['name'] for r in slow)}。"],
            "变现阶梯": [f"1 日可变现比例 {pc(lad[1]['p'])}，3 日 {pc(lad[3]['p'])}，10 日 {pc(lad[10]['p'])}。"],
            "赎回情景": [f"结论：{verdict}。30% 赎回情景所需天数 {key['days']} 天，落在 4 至 5 个交易日一档。",
                     f"瓶颈是云顶新耀：要卖 {sell:,} 股，日可变现量 {x['cap']:,} 股，3 天只能卖 {3 * x['cap']:,} 股，要 4 天。",
                     "每只股票都按赎回比例卖出同样的比例，所需天数取十二只里最大的一个。"],
            "在线数据": [
                source_line(rec),
                f"返回 {len(m)} 行，{m.index[0]} 至 {m.index[-1]}。返回的 Date 是 UTC 时间（16:00），加 8 小时后的日期是香港的交易日。",
                "返回期间内 Dividends、Stock Splits 两列全部为 0，没有分红和拆分，返回的收盘价就是实际收盘价，成交量也没有调整。",
                f"基准日 {BASE} 收盘价 {fl(x['close']):.2f} 港元。上表是最近 20 个交易日（{last20.index[0]} 至 {BASE}）的日成交量，ADV20 = {fl(x['adv20']):,.2f} 股。",
                f"最近 60 个交易日是 {first60} 至 {BASE}，ADV60 = {fl(x['adv60']):,.2f} 股。可用日均量取较小的 ADV20，日可变现量 {x['cap']:,} 股。",
            ],
        },
    )
    w60 = wrong["adv60"]
    write_docx(
        ans / "港股产品开放频率评估意见.docx",
        "港股组合产品开放频率评估意见",
        [
            ("结论", [f"{verdict}。30% 赎回情景下，每只股票按同样比例卖出需要 {key['days']} 个交易日，落在 4 至 5 个交易日一档。"]),
            ("30% 赎回情景", [
                f"瓶颈是云顶新耀（1952.HK）。持股 {x['shares']:,} 股，30% 是 {sell:,} 股；日可变现量 {x['cap']:,} 股，3 天只能卖 {3 * x['cap']:,} 股，要 4 天。",
                "其余十一只股票 3 天之内都能卖完各自的 30%。",
            ]),
            ("其余三档", ["；".join(f"{k}% 赎回需要 {sc[k]['days']} 天，瓶颈是{'、'.join(r['name'] for r in sc[k]['who'])}" for k in (10, 20, 50)) + "。这三档只作参考。"]),
            ("持仓变现能力", [
                f"组合总市值 {fl(total):,.2f} 港元。" + "，".join(f"{n} 日可变现比例 {pc(lad[n]['p'])}" for n in LADDER) + "。",
                f"全部变现需要 {full_days} 个交易日，最慢的是{'、'.join(r['name'] for r in slow)}。",
            ]),
            ("两处容易看漏的地方", [
                f"云顶新耀的 ADV20 是 {fl(x['adv20']):,.2f} 股，ADV60 是 {fl(x['adv60']):,.2f} 股，近期成交萎缩。按口径取较小的 ADV20，日可变现量 {x['cap']:,} 股。"
                f"只用 ADV60 时日可变现量是 {w60[2]['cap']:,} 股，30% 赎回会算成 {w60[0]['days']} 天，结论错成{w60[1]}。",
                f"科伦博泰生物-B 的 ADV20 是 {fl(kl['adv20']):,.2f} 股，ADV60 是 {fl(kl['adv60']):,.2f} 股，近期成交放大。按口径取较小的 ADV60，日可变现量 {kl['cap']:,} 股，变现天数 {kl['days']} 天。",
            ]),
            ("在线数据", [
                "研究部的快照没有收录云顶新耀。它的日线通过 US Stocks MCP 查询，代码 1952.HK。返回的日期是 UTC 时间，加 8 小时后才是香港的交易日；"
                f"返回期间内没有分红和拆分，收盘价和成交量都没有调整。基准日 {BASE} 收盘 {fl(x['close']):.2f} 港元，市值 {fl(x['value']):,.2f} 港元。",
            ]),
            ("对应材料", ["十二只股票的日均量和变现天数见《港股持仓变现能力测算表.xlsx》的「持仓变现能力」，可变现比例见「变现阶梯」，四档赎回的所需天数和瓶颈股票见「赎回情景」，"
                      "云顶新耀的成交量和查询信息见「在线数据」。两份文件的结论、所需天数、瓶颈股票和可变现比例相同。"]),
        ],
    )
    print("查询时间", rec["查询时间"], len(m), "行", m.index[0], m.index[-1], "20日起", last20.index[0], "60日起", first60)


if __name__ == "__main__":
    main()
