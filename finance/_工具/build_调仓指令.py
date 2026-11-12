#!/usr/bin/env python3
"""打包「A股调仓指令复核」这道题：题目附件、标准答案附件。

这道题没有底稿，是 2026-11-11 新出的。收盘价全部来自 US Stocks MCP 的实际调用（新题数据/调仓指令/），
口径文件在 新题口径/调仓指令/。持股数、目标权重和现金余额是下面 HOLD、CASH 里拟的。
A02 快照收录十九只股票，中芯国际（688981.SS）留给在线 MCP 查询。

脚本做的事：
1. 生成 A01（持仓与目标权重）和 A02（收盘价快照）。
2. 只用题目附件加中芯国际的 MCP 结果文件重算，生成标准答案附件。
3. 检查小单门槛、三条限额离门槛的距离，并算一遍常见错误的结果。
"""
from __future__ import annotations

import csv
import json
from decimal import ROUND_FLOOR, ROUND_HALF_UP, Decimal as D
from pathlib import Path

from build_common import OUT, copy_as, fresh_dir, load_mcp_prices, source_line, write_docx, write_xlsx

HERE = Path(__file__).resolve().parent
RAW = HERE / "新题数据" / "调仓指令"
DOC = HERE / "新题口径" / "调仓指令"
DST = OUT / "题目" / "11_A股调仓指令复核"
PREFIX = "调仓指令_"
MCP_CODE, MCP_TICKER = "688981.SH", "688981.SS"
MCP_FILE = f"{PREFIX}MCP_688981.SS日线.json"
BASE = "2026-10-30"
SNAP_DAYS = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]
CASH = D("34618275.46")
MIN_ORDER = D("500000")
LIM_TURN, CASH_LO, CASH_HI, LIM_ONE = D("0.15"), D("0.01"), D("0.03"), D("0.08")
HOLD = [  # 代码, 名称, 板块, 持股数, 目标权重
    ("601318.SH", "中国平安", "主板", 603200, "0.060"),
    ("601166.SH", "兴业银行", "主板", 1279900, "0.050"),
    ("600900.SH", "长江电力", "主板", 1211800, "0.060"),
    ("601398.SH", "工商银行", "主板", 3359400, "0.075"),
    ("600030.SH", "中信证券", "主板", 794100, "0.055"),
    ("600276.SH", "恒瑞医药", "主板", 561300, "0.055"),
    ("601899.SH", "紫金矿业", "主板", 1113700, "0.040"),
    ("600309.SH", "万华化学", "主板", 209300, "0.045"),
    ("601012.SH", "隆基绿能", "主板", 1136400, "0.000"),
    ("600887.SH", "伊利股份", "主板", 674900, "0.040"),
    ("601888.SH", "中国中免", "主板", 0, "0.040"),
    ("000333.SZ", "美的集团", "主板", 427100, "0.070"),
    ("000858.SZ", "五粮液", "主板", 341900, "0.040"),
    ("002594.SZ", "比亚迪", "主板", 295700, "0.060"),
    ("000651.SZ", "格力电器", "主板", 535200, "0.050"),
    ("002415.SZ", "海康威视", "主板", 495000, "0.035"),
    ("300059.SZ", "东方财富", "创业板", 1110600, "0.055"),
    ("688981.SH", "中芯国际", "科创板", 417358, "0.080"),
    ("688041.SH", "海光信息", "科创板", 102650, "0.050"),
    ("688111.SH", "金山办公", "科创板", 71830, "0.020"),
]
CENT = D("0.01")


def ticker_of(code: str) -> str:
    return code.replace(".SH", ".SS")


def fee(amount: D, rate: str) -> D:
    return (amount * D(rate)).quantize(CENT, rounding=ROUND_HALF_UP)


def rebalance(hold: list[dict], price: dict[str, D]):
    """按 A03、A04 走一遍。返回净资产、逐只股票的结果、初始和最终两份汇总、结论。"""
    nav = sum(D(h["shares"]) * price[h["code"]] for h in hold) + CASH
    rows = []
    for h in hold:
        p, s, w = price[h["code"]], int(h["shares"]), D(h["target_weight"])
        lot = 1 if h["board"] == "科创板" else 100
        target = int((w * nav / p / lot).to_integral_value(rounding=ROUND_FLOOR)) * lot
        diff = target - s
        amount = abs(diff) * p
        place = diff != 0 and (amount >= MIN_ORDER or (w == 0 and s > 0))
        rows.append(dict(h, price=p, shares=s, w=w, target=target, diff=diff, amount=amount,
                         state="下单" if place else ("小单过滤" if diff != 0 else "无交易")))

    def settle(states: set[str]):
        orders = [r for r in rows if r["state"] in states]
        buy = sum((r["amount"] for r in orders if r["diff"] > 0), D(0))
        sell = sum((r["amount"] for r in orders if r["diff"] < 0), D(0))
        fees = D(0)
        for r in orders:
            r["佣金"], r["过户费"] = fee(r["amount"], "0.0002"), fee(r["amount"], "0.00001")
            r["印花税"] = fee(r["amount"], "0.0005") if r["diff"] < 0 else D(0)
            fees += r["佣金"] + r["过户费"] + r["印花税"]
        cash = CASH + sell - buy - fees
        after = {r["code"]: (r["target"] if r["state"] in states else r["shares"]) for r in rows}
        wt = {r["code"]: after[r["code"]] * r["price"] / nav for r in rows}
        top = max(wt, key=wt.get)
        turn = max(buy, sell) / nav
        res = dict(n=len(orders), n_buy=sum(r["diff"] > 0 for r in orders), n_sell=sum(r["diff"] < 0 for r in orders),
                   buy=buy, sell=sell, fees=fees, turn=turn, cash=cash, cash_pct=cash / nav, top=top, top_w=wt[top],
                   ok1=turn <= LIM_TURN, ok2=CASH_LO <= cash / nav <= CASH_HI, ok3=wt[top] <= LIM_ONE,
                   over=[c for c in wt if wt[c] > LIM_ONE], after=after, wt=wt)
        return res

    first = settle({"下单"})
    final = first
    if first["ok1"] and first["ok2"] and first["ok3"]:
        verdict = "按清单执行"
    elif not (first["ok1"] and first["ok2"]):
        verdict = "退回重做"
    else:
        for r in rows:
            if r["code"] in first["over"]:
                r["state"] = "补卖"
        final = settle({"下单", "补卖"})
        verdict = "修订后执行" if final["ok1"] and final["ok2"] and final["ok3"] else "退回重做"
    return nav, rows, first, final, verdict


def main() -> None:
    att = fresh_dir(DST / "题目附件")
    ans = fresh_dir(DST / "标准答案附件")
    (DST / "MCP结果文件").mkdir(exist_ok=True)
    copy_as(RAW / f"{MCP_TICKER}.json", DST / "MCP结果文件" / MCP_FILE)

    # 1. 附件
    with open(att / f"{PREFIX}A01_持仓与目标权重.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["code", "name", "board", "shares", "target_weight"])
        wr.writerows(HOLD)
    with open(att / f"{PREFIX}A02_收盘价快照.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["date", "code", "close"])
        for code, *_ in HOLD:
            if code == MCP_CODE:
                continue
            rec0, d = load_mcp_prices(RAW / f"{ticker_of(code)}.json", 8)
            later = d[(d.index > SNAP_DAYS[0]) & ((d.Dividends > 0) | (d["Stock Splits"] != 0))]
            assert later.empty, f"{code} 在快照期之后有分红或拆分，返回的复权价不等于实际收盘价"
            for day in SNAP_DAYS:
                wr.writerow([day, code, f"{float(d.Close[day]):.2f}"])
    for name in ["A03_调仓口径.md", "A04_限额与交付.md"]:
        copy_as(DOC / name, att / f"{PREFIX}{name}")
    copy_as(DST / "MCP结果文件" / MCP_FILE, att / MCP_FILE)

    # 2. 只用题目附件重算
    hold = list(csv.DictReader(open(att / f"{PREFIX}A01_持仓与目标权重.csv", encoding="utf-8")))
    price = {r["code"]: D(r["close"]) for r in csv.DictReader(open(att / f"{PREFIX}A02_收盘价快照.csv", encoding="utf-8")) if r["date"] == BASE}
    rec, m = load_mcp_prices(att / MCP_FILE, 8)
    assert set(m.Date.str[11:13]) == {"16"} and float(m.Dividends.sum()) == 0 and float(m["Stock Splits"].abs().sum()) == 0
    smic = D(f"{float(m.Close[BASE]):.2f}")
    price[MCP_CODE] = smic
    assert sum(D(h["target_weight"]) for h in hold) == D("0.98") and len(price) == 20
    nav, rows, first, final, verdict = rebalance(hold, price)
    name = {h["code"]: h["name"] for h in hold}

    pc = lambda x, n=3: f"{float(x) * 100:.{n}f}%"
    print(f"中芯国际 {BASE} 收盘 {smic}；组合净资产 {nav:,.2f}；结论 {verdict}")
    for tag, r in (("初始", first), ("最终", final)):
        print(f"  {tag}：{r['n']} 笔（买 {r['n_buy']} 卖 {r['n_sell']}），买入 {r['buy']:,.2f}，卖出 {r['sell']:,.2f}，费用 {r['fees']:,.2f}，"
              f"换手 {pc(r['turn'])}，现金 {r['cash']:,.2f}（{pc(r['cash_pct'])}），最高 {name[r['top']]} {pc(r['top_w'])}，限额 {r['ok1']} {r['ok2']} {r['ok3']}")
    for r in rows:
        print(f"  {r['code']} {r['name']:6} 价 {r['price']:>7} 持 {r['shares']:>8} 目标 {r['target']:>8} 差 {r['diff']:>9} 金额 {r['amount']:>14,.2f} {r['state']}"
              f" 调仓前 {pc(r['shares'] * r['price'] / nav)} 调仓后 {pc(final['wt'][r['code']])}")
    # 距离检查
    assert verdict == "修订后执行" and first["over"] == [MCP_CODE] and first["ok1"] and first["ok2"]
    gap_order = min(abs(r["amount"] - MIN_ORDER) for r in rows if r["diff"] != 0 and r["w"] != 0)
    assert gap_order > 80000, gap_order
    assert LIM_TURN - final["turn"] > D("0.005") and final["cash_pct"] - CASH_LO > D("0.003") and CASH_HI - final["cash_pct"] > D("0.003")
    second = sorted(final["wt"].values())[-2]
    assert first["top_w"] - LIM_ONE > D("0.0005") and LIM_ONE - final["top_w"] >= 0 and LIM_ONE - second > D("0.003")
    print(f"  小单门槛最近的一笔相差 {gap_order:,.2f} 元；中芯国际初始权重超限 {pc(first['top_w'] - LIM_ONE, 4)}")

    # 常见错误：取错交易日。返回里没有 UTC 日期为 2026-10-30 的行，容易取到前一个或后一个交易日的收盘价
    days = list(m.index)
    for label, day in (("前一个交易日", days[days.index(BASE) - 1]), ("后一个交易日", days[days.index(BASE) + 1])):
        p2 = dict(price)
        p2[MCP_CODE] = D(f"{float(m.Close[day]):.2f}")
        nav2, rows2, f2, g2, v2 = rebalance(hold, p2)
        sm2 = next(r for r in rows2 if r["code"] == MCP_CODE)
        print(f"  误用{label} {day} 的收盘价 {p2[MCP_CODE]}：净资产 {nav2:,.2f}，中芯国际应卖 {abs(sm2['diff']):,} 股 {sm2['amount']:,.2f} 元（{sm2['state']}），结论 {v2}，最终 {g2['n']} 笔")
        assert v2 != verdict
    # 常见错误：科创板也按 100 股取整
    hold3 = [dict(h, board="主板") for h in hold]
    nav3, rows3, f3, g3, v3 = rebalance(hold3, price)
    print(f"  科创板按 100 股取整：结论 {v3}，最终买入 {g3['buy']:,.2f}，卖出 {g3['sell']:,.2f}")

    # 3. 标准答案附件
    fl = float
    h_head = ["代码", "名称", "板块", "持股数", "基准日收盘价", "调仓前权重(%)", "目标权重(%)", "目标股数", "交易股数", "交易金额(元)",
              "是否下单", "调仓后持股数", "调仓后权重(%)"]
    h_rows = [[r["code"], r["name"], r["board"], r["shares"], fl(r["price"]), round(fl(r["shares"] * r["price"] / nav) * 100, 3),
               round(fl(r["w"]) * 100, 1), r["target"], r["diff"], fl(r["amount"]), r["state"], final["after"][r["code"]],
               round(fl(final["wt"][r["code"]]) * 100, 3)] for r in rows]
    orders = [r for r in rows if r["state"] in ("下单", "补卖")]
    o_head = ["代码", "名称", "方向", "股数", "收盘价", "交易金额(元)", "佣金(元)", "印花税(元)", "过户费(元)", "是否补卖单"]
    o_rows = [[r["code"], r["name"], "买入" if r["diff"] > 0 else "卖出", abs(r["diff"]), fl(r["price"]), fl(r["amount"]),
               fl(r["佣金"]), fl(r["印花税"]), fl(r["过户费"]), "是" if r["state"] == "补卖" else "否"] for r in orders]
    yes = lambda b: "满足" if b else "不满足"

    def col(r):
        return [r["n"], r["n_buy"], r["n_sell"], fl(r["buy"]), fl(r["sell"]), fl(r["fees"]), round(fl(r["turn"]) * 100, 3), fl(r["cash"]),
                round(fl(r["cash_pct"]) * 100, 3), name[r["top"]], round(fl(r["top_w"]) * 100, 3), yes(r["ok1"]), yes(r["ok2"]), yes(r["ok3"])]

    labels = ["订单笔数", "其中买入笔数", "其中卖出笔数", "买入金额合计(元)", "卖出金额合计(元)", "费用合计(元)", "单边换手率(%)", "调仓后现金(元)",
              "调仓后现金比例(%)", "调仓后权重最高的股票", "调仓后最高单票权重(%)", "限额一：单边换手率≤15%", "限额二：现金比例1%至3%", "限额三：单票权重≤8%"]
    s_rows = [[a, b, c] for a, b, c in zip(labels, col(first), col(final))]
    s_rows.insert(0, ["组合净资产(元)", fl(nav), fl(nav)])
    s_rows.append(["结论", "只有限额三不满足，进入补卖", verdict])
    sm = next(r for r in rows if r["code"] == MCP_CODE)
    filtered = [r for r in rows if r["state"] == "小单过滤"]
    f_txt = "、".join(f"{r['name']}（{'买入' if r['diff'] > 0 else '卖出'} {abs(r['diff']):,} 股，{r['amount']:,.2f} 元）" for r in filtered)
    d_rows = [[day, round(float(m.Close[day]), 2), "基准日，用于测算" if day == BASE else ""] for day in SNAP_DAYS]
    write_xlsx(
        ans / "A股调仓指令测算表.xlsx",
        [("持仓检查", h_head, h_rows), ("订单清单", o_head, o_rows), ("汇总与限额", ["项目", "初始清单", "最终清单"], s_rows),
         ("在线数据", ["交易日", "中芯国际(688981.SH)收盘价(元)", "说明"], d_rows)],
        notes={
            "持仓检查": [f"组合净资产 {nav:,.2f} 元 = 二十只股票市值 {nav - CASH:,.2f} 元 + 现金 {CASH:,.2f} 元。",
                     f"小单过滤 {len(filtered)} 只：{f_txt}。",
                     f"中芯国际初始也被小单过滤（卖出 {abs(sm['diff']):,} 股，{sm['amount']:,.2f} 元），持仓不变时权重 {pc(first['top_w'])}，超过 8%，按 A04 补卖到目标股数 {sm['target']:,} 股。"],
            "订单清单": [f"共 {final['n']} 笔，买入 {final['n_buy']} 笔、卖出 {final['n_sell']} 笔，其中 1 笔是补卖单。费用每项分别四舍五入到分。"],
            "汇总与限额": ["比例的分母都是调仓前的组合净资产。初始清单只有限额三不满足，补卖后三条都满足。"],
            "在线数据": [
                source_line(rec),
                f"返回 {len(m)} 行，{m.index[0]} 至 {m.index[-1]}。返回的 Date 是 UTC 时间（16:00），加 8 小时后的日期是交易日。",
                "返回期间内 Dividends、Stock Splits 两列全部为 0，没有分红和送转，返回的收盘价就是不复权的实际收盘价。",
                f"基准日 {BASE} 收盘价 {smic} 元，A02 没有收录这只股票，测算用的就是这个价格。",
            ],
        },
    )
    write_docx(
        ans / "A股调仓指令复核意见.docx",
        "沪深股票多头组合四季度调仓指令复核意见",
        [
            ("结论", [f"修订后执行。初始清单里中芯国际的调仓后权重 {pc(first['top_w'])}，超过 8% 的上限；补一笔卖出中芯国际 {abs(sm['diff']):,} 股的订单后，三条限额都满足。"]),
            ("组合净资产", [f"基准日 {BASE} 二十只股票市值 {nav - CASH:,.2f} 元，现金 {CASH:,.2f} 元，组合净资产 {nav:,.2f} 元。",
                       f"中芯国际（688981.SH）基准日收盘价 {smic} 元，持股 {sm['shares']:,} 股，市值 {sm['shares'] * smic:,.2f} 元，调仓前权重 {pc(sm['shares'] * smic / nav)}。"]),
            ("初始清单", [
                f"按 A03 生成的初始清单共 {first['n']} 笔，买入 {first['n_buy']} 笔、卖出 {first['n_sell']} 笔。买入金额合计 {first['buy']:,.2f} 元，卖出金额合计 {first['sell']:,.2f} 元，费用合计 {first['fees']:,.2f} 元。",
                f"限额一：单边换手率 {pc(first['turn'])}，不超过 15%，满足。限额二：调仓后现金 {first['cash']:,.2f} 元，占 {pc(first['cash_pct'])}，在 1% 至 3% 之间，满足。"
                f"限额三：中芯国际调仓后权重 {pc(first['top_w'])}，超过 8%，不满足。",
                f"中芯国际超限的原因：目标权重 8%，目标股数 {sm['target']:,} 股，应卖出 {abs(sm['diff']):,} 股，交易金额 {sm['amount']:,.2f} 元，低于 500,000 元被小单过滤，持仓没有变。",
                f"另外被小单过滤的有 {len(filtered)} 只：{f_txt}。它们的权重都在 8% 以内。",
            ]),
            ("补卖和最终清单", [
                f"只有限额三不满足，按 A04 补一笔卖单：卖出中芯国际 {abs(sm['diff']):,} 股，交易金额 {sm['amount']:,.2f} 元，佣金 {sm['佣金']} 元，印花税 {sm['印花税']} 元，过户费 {sm['过户费']} 元。补卖后持股 {sm['target']:,} 股，权重 {pc(final['wt'][MCP_CODE], 4)}。",
                f"最终清单共 {final['n']} 笔，买入 {final['n_buy']} 笔、卖出 {final['n_sell']} 笔。买入金额合计 {final['buy']:,.2f} 元，卖出金额合计 {final['sell']:,.2f} 元，费用合计 {final['fees']:,.2f} 元。",
                f"单边换手率 {pc(final['turn'])}；调仓后现金 {final['cash']:,.2f} 元，占 {pc(final['cash_pct'])}；调仓后权重最高的是{name[final['top']]} {pc(final['top_w'], 4)}。三条限额都满足。",
            ]),
            ("在线数据", [
                "研究部的收盘价快照 A02 没有收录中芯国际。它的日线通过 US Stocks MCP 查询，代码 688981.SS。返回的日期是 UTC 时间，加 8 小时后才是交易日；"
                f"返回期间内没有分红和送转，收盘价就是实际收盘价。基准日 {BASE} 收盘 {smic} 元。",
            ]),
            ("对应材料", ["二十只股票的目标股数和调仓后权重见《A股调仓指令测算表.xlsx》的「持仓检查」，最终订单见「订单清单」，初始和最终两份清单的限额检查见「汇总与限额」，"
                      "中芯国际的收盘价见「在线数据」。两份文件的结论、订单笔数、买卖金额和补卖单相同。"]),
        ],
    )
    print("查询时间", rec["查询时间"], len(m), "行", m.index[0], m.index[-1])


if __name__ == "__main__":
    main()
