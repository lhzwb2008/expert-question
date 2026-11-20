#!/usr/bin/env python3
"""打包「量化多头二号」两融账户的两道题（26 10月回放复核 → 27 11月降杠杆卖出方案）。
27 只用 26 标准答案《两融账户10月回放复核表.xlsx》「10月末状态」里的持股数和板块，这份表原样复制进 27 的题目附件。
27 的负债直接给券商 11-02 日终对账单，不再按合同计息和还款；核心是压力跌幅、压力情景比例、集中度和单只卖出上限下的卖出顺序。
沪深行情快照是 fetch_longport.py 拉的不复权日线；中芯国际 10 月日线和 6 只股票近 3 个月日线是 fetch_新题.py 通过 US Stocks MCP 查的。
持仓、融资合约、交易流水、券商通知、投资经理邮件、降杠杆目标和顺序是按题目需要拟的。
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import math
from pathlib import Path

import pandas as pd
from openpyxl import load_workbook

from build_common import OUT, copy_as, fresh_dir, load_mcp_prices, source_line, write_docx, write_xlsx

HERE = Path(__file__).resolve().parent
RAW = HERE / "新题数据"
LP = RAW / "两融回放_longport"
DOC = HERE / "新题口径"
D26 = OUT / "题目" / "26_两融账户追保强平复核"
D27 = OUT / "题目" / "27_两融账户降杠杆方案"

BASE, EXE, RUN = "2026-10-30", "2026-11-02", "2026-11-03"  # EXE 取测算价的日子，RUN 执行日
RATE = 0.062
# 代码, 名称, 板块, 9-30 日终持股
HOLD = [("300750", "宁德时代", "创业板", 70000), ("688981", "中芯国际", "科创板", 50000), ("601899", "紫金矿业", "沪市主板", 150000),
        ("600030", "中信证券", "沪市主板", 100000), ("000333", "美的集团", "深市主板", 30000), ("601318", "中国平安", "沪市主板", 40000)]
LPSYM = {"300750": "300750.SZ", "688981": "688981.SH", "601899": "601899.SH", "600030": "600030.SH", "000333": "000333.SZ", "601318": "601318.SH"}
YSYM = {k: v.replace(".SH", ".SS") for k, v in LPSYM.items()}
NAME = {h[0]: h[1] for h in HOLD}
BOARD = {h[0]: h[2] for h in HOLD}
CASH0 = 200000.00
CONTRACTS = [("R2607-01", "2026-07-08", 11500000.00), ("R2608-01", "2026-08-12", 8000000.00), ("R2609-01", "2026-09-09", 5000000.00)]
# 日期, 类型, 代码, 股数, 成交价, 发起方
FLOWS = [("2026-10-13", "融资买入", "688981", 20000, 106.00, "本方"),
         ("2026-10-22", "银证转入", "", 0, 2500000.00, "本方"),
         ("2026-10-23", "卖券还款", "300750", 16000, 237.60, "本方"),
         ("2026-10-26", "强制平仓（卖券还款）", "601899", 60000, 27.47, "华东证券")]
WARN, CALL, TGT, CONC = 1.50, 1.30, 2.00, 0.30

pc = lambda x: f"{x * 100:.2f}%"
w2 = lambda x: f"{x:,.2f}"
r2 = lambda x: round(x + 1e-9, 2)


def fees(amt: float, sell: bool):
    c = max(5.0, r2(amt * 0.00025))
    t = r2(amt * 0.00001)
    s = r2(amt * 0.0005) if sell else 0.0
    return c, s, t


class Account:
    def __init__(self, pos, cash, con, intr):
        self.pos = dict(pos)
        self.cash = cash
        self.con = [list(c) for c in con]
        self.intr = intr

    @property
    def principal(self):
        return r2(sum(c[2] for c in self.con))

    def accrue(self, ndays: int, skip_interest=False):
        for _ in range(ndays):
            if not skip_interest:
                self.intr = r2(self.intr + r2(self.principal * RATE / 360))

    def repay(self, amount: float):
        """先还利息再按开仓日还本金，返回 (还利息, [(合约, 本金)], 剩余)。"""
        pay_i = min(amount, self.intr)
        self.intr = r2(self.intr - pay_i)
        amount = r2(amount - pay_i)
        parts = []
        for c in self.con:
            p = min(amount, c[2])
            if p > 0:
                c[2] = r2(c[2] - p)
                amount = r2(amount - p)
                parts.append((c[0], p))
        self.con = [c for c in self.con if c[2] > 0.004]
        return r2(pay_i), parts, amount

    def mv(self, px):
        return r2(sum(self.pos[k] * px[k] for k in self.pos))

    def ratio(self, px):
        return (self.mv(px) + self.cash) / (self.principal + self.intr)


def sell(acc: Account, code: str, qty: int, price: float):
    amt = r2(qty * price)
    c, s, t = fees(amt, True)
    net = r2(amt - c - s - t)
    acc.pos[code] -= qty
    pi, parts, rest = acc.repay(net)
    acc.cash = r2(acc.cash + rest)
    return dict(code=code, qty=qty, price=price, amt=amt, comm=c, stamp=s, trans=t, net=net, pay_i=pi, parts=parts, rest=rest)


def replay(px: pd.DataFrame, days: list[str], mode: str = "ok"):
    """mode: ok 正确；noint 不计利息（投资经理的算法）。"""
    p0 = r2(sum(c[2] for c in CONTRACTS))
    intr0 = 0.0 if mode == "noint" else r2(10 * r2(p0 * RATE / 360))
    acc = Account({h[0]: h[3] for h in HOLD}, CASH0, CONTRACTS, intr0)
    rows = [dict(day="2026-09-30", mv=acc.mv(px.loc["2026-09-30"]), cash=acc.cash, prin=acc.principal, intr=acc.intr,
                 ratio=acc.ratio(px.loc["2026-09-30"]), ev="期初")]
    prev = dt.date(2026, 9, 30)
    log = {}
    for d in days:
        dd = dt.date.fromisoformat(d)
        acc.accrue((dd - prev).days - 1, mode == "noint")  # 前面几个非交易日按上一日终本金计息
        ev = []
        for f in FLOWS:
            if f[0] != d:
                continue
            if f[1] == "融资买入":
                amt = r2(f[3] * f[4])
                c, _, t = fees(amt, False)
                acc.con.append([f"R{d[2:4]}{d[5:7]}-01", d, r2(amt + c + t)])
                acc.pos[f[2]] += f[3]
                log[d] = dict(amt=amt, comm=c, trans=t, fin=r2(amt + c + t))
                ev.append(f"融资买入 {NAME[f[2]]} {f[3]:,} 股 @ {f[4]:.2f}")
            elif f[1] == "银证转入":
                acc.cash = r2(acc.cash + f[4])
                ev.append(f"银证转入现金 {w2(f[4])}")
            else:
                if f[5] == "华东证券":
                    # 合同第八条：先用现金直接还款，看还需不需要卖
                    log["force_pre"] = snapshot_force(acc, px.loc[d], f)
                o = sell(acc, f[2], f[3], f[4])
                log[d + f[1]] = o
                ev.append(f"{f[1]} {NAME[f[2]]} {f[3]:,} 股 @ {f[4]:.2f}")
        if mode != "noint":
            acc.intr = r2(acc.intr + r2(acc.principal * RATE / 360))
        rows.append(dict(day=d, mv=acc.mv(px.loc[d]), cash=acc.cash, prin=acc.principal, intr=acc.intr, ratio=acc.ratio(px.loc[d]),
                         ev="；".join(ev)))
        prev = dd
    return rows, acc, log


def snapshot_force(acc: Account, p, f):
    """强平当天，按合同先用全部现金直接还款，算当天日终比例；不够再算最少卖多少（100 股整数倍）。"""
    import copy
    a = copy.deepcopy(acc)
    cash = a.cash
    pi, parts, rest = a.repay(cash)
    a.cash = rest
    a2 = copy.deepcopy(a)
    a2.intr = r2(a2.intr + r2(a2.principal * RATE / 360))
    r_cash = a2.ratio(p)
    need = 0
    if r_cash < WARN:
        q = 100
        while True:
            b = copy.deepcopy(a)
            sell(b, f[2], q, f[4])
            b.intr = r2(b.intr + r2(b.principal * RATE / 360))
            if b.ratio(p) >= WARN:
                need = q
                break
            q += 100
    # 券商实际：不还现金，直接卖
    c = copy.deepcopy(acc)
    c.intr = r2(c.intr + r2(c.principal * RATE / 360))
    r_before = c.ratio(p)
    return dict(cash=cash, cash_pay_i=pi, cash_parts=parts, r_before=r_before, r_cash=r_cash, need=need)


def status(r):
    return "正常" if r >= WARN else ("警戒" if r >= CALL else "追保")


def load_snapshot():
    px = {}
    for k in NAME:
        if k == "688981":
            continue
        d = pd.DataFrame(json.load(open(LP / f"{LPSYM[k]}_noadj.json", encoding="utf-8")))
        px[k] = d.set_index("date").close.astype(float)
    return pd.DataFrame(px)


# ---------------- 26 ----------------
def q26():
    att, ans = fresh_dir(D26 / "题目附件"), fresh_dir(D26 / "标准答案附件")
    (D26 / "MCP结果文件").mkdir(exist_ok=True)
    mcp = "回放_MCP_中芯国际日线.json"
    copy_as(RAW / "两融回放" / "688981.SS.json", D26 / "MCP结果文件" / mcp)
    copy_as(D26 / "MCP结果文件" / mcp, att / mcp)
    snap = load_snapshot()
    snap = snap[(snap.index >= "2026-09-01") & (snap.index <= BASE)]
    with open(att / "回放_A01_担保证券期初持仓.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["证券代码", "证券名称", "板块", "2026-09-30日终持股数(股)"])
        for h in HOLD:
            wr.writerow([h[0], h[1], h[2], h[3]])
    p0 = r2(sum(c[2] for c in CONTRACTS))
    intr0 = r2(10 * r2(p0 * RATE / 360))
    with open(att / "回放_A02_融资合约与现金.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["项目", "合约编号", "开仓日", "2026-09-30日终金额(元)", "说明"])
        for c in CONTRACTS:
            wr.writerow(["融资合约", c[0], c[1], f"{c[2]:.2f}", "未还本金，期限 6 个月"])
        wr.writerow(["应付融资利息", "", "", f"{intr0:.2f}", "2026-09-21 至 09-30 计提，09-20 已结息"])
        wr.writerow(["现金余额", "", "", f"{CASH0:.2f}", "信用账户资金余额"])
    with open(att / "回放_A03_10月交易与资金流水.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["日期", "业务类型", "证券代码", "证券名称", "数量(股)", "成交价(元)", "金额(元)", "发起方"])
        for x in FLOWS:
            if x[1] == "银证转入":
                wr.writerow([x[0], x[1], "", "", "", "", f"{x[4]:.2f}", x[5]])
            else:
                wr.writerow([x[0], x[1], x[2], NAME[x[2]], x[3], f"{x[4]:.2f}", "", x[5]])
    copy_as(DOC / "两融回放" / "A04_融资融券合同条款摘要.md", att / "回放_A04_融资融券合同条款摘要.md")
    with open(att / "回放_A05_沪深行情快照.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["date", "code", "name", "close"])
        for d in snap.index:
            for k in snap.columns:
                wr.writerow([d, k, NAME[k], f"{snap.loc[d, k]:.2f}"])
    copy_as(DOC / "两融回放" / "A07_复核口径与交付.md", att / "回放_A07_复核口径与交付.md")

    # ---- 只用附件重算 ----
    a05 = pd.read_csv(att / "回放_A05_沪深行情快照.csv", dtype={"code": str, "date": str})
    px = a05.pivot(index="date", columns="code", values="close")
    rec, m = load_mcp_prices(att / mcp, 8)
    m = m[m.Close.notna()]
    px["688981"] = m.Close.round(2).reindex(px.index)
    lp688 = pd.DataFrame(json.load(open(LP / "688981.SH_noadj.json"))).set_index("date").close.astype(float)
    assert (px["688981"]["2026-08-19":] - lp688.reindex(px.index)["2026-08-19":]).abs().max() < 1e-9
    assert float(m.Dividends.abs().sum()) == 0
    miss688 = [d for d in px.index if pd.isna(px.loc[d, "688981"])]
    assert all(d < "2026-09-30" for d in miss688)
    days = [d for d in px.index if "2026-10-01" <= d <= BASE]
    rows, acc, log = replay(px, days)
    rows_n, acc_n, _ = replay(px, days, "noint")
    R = {r["day"]: r for r in rows}
    RN = {r["day"]: r for r in rows_n}
    fp = log["force_pre"]
    force = log["2026-10-26强制平仓（卖券还款）"]

    # 券商通知
    notices = [("2026-10-14", "警戒通知", "2026-10-13"), ("2026-10-22", "追保通知", "2026-10-21"),
               ("2026-10-26", "强制平仓通知", "2026-10-23")]
    with open(att / "回放_A06_券商通知记录.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["通知日期", "通知类型", "依据日", "券商计算的维持担保比例", "通知内容"])
        wr.writerow(["2026-10-14", "警戒通知", "2026-10-13", pc(R["2026-10-13"]["ratio"]),
                     "日终维持担保比例低于150%，恢复前暂停新增融资买入"])
        wr.writerow(["2026-10-22", "追保通知", "2026-10-21", pc(R["2026-10-21"]["ratio"]),
                     "日终维持担保比例低于130%，请于2026-10-23日终前使维持担保比例不低于150%，否则自2026-10-26起强制平仓"])
        wr.writerow(["2026-10-26", "强制平仓通知", "2026-10-23", pc(R["2026-10-23"]["ratio"]),
                     "2026-10-23日终维持担保比例未达到150%，今日强制平仓紫金矿业60,000股，成交价27.47元，所得用于还款"])
    mail = (DOC / "两融回放" / "A08_投资经理邮件.md").read_text(encoding="utf-8")
    rn = RN["2026-10-23"]
    mail = mail.format(mv=f"{w2(rn['mv'])} 元", cash=f"{w2(rn['cash'])} 元", debt=f"{w2(rn['prin'])} 元", ratio=pc(rn["ratio"]))
    (att / "回放_A08_投资经理邮件.md").write_text(mail, encoding="utf-8")

    # 检查：故事成立，且离门槛有距离
    r = lambda d: R[d]["ratio"]
    assert r("2026-10-12") >= WARN + 0.03 and r("2026-10-13") < WARN - 0.01
    assert all(r(d) >= CALL + 0.005 for d in days if d != "2026-10-21") and r("2026-10-21") < CALL - 0.005
    assert r("2026-10-22") < WARN and r("2026-10-23") < WARN - 0.004 and RN["2026-10-23"]["ratio"] >= WARN + 0.003
    assert fp["r_cash"] >= WARN + 0.01 and fp["need"] == 0
    first_warn = [d for d in days if r(d) < WARN][0]
    assert first_warn == "2026-10-13"
    extra = 60000 - fp["need"]
    p30 = px.loc[BASE, "601899"]
    fee_force = r2(force["comm"] + force["stamp"] + force["trans"])
    loss = r2(extra * max(0.0, p30 - force["price"]) + fee_force * extra / 60000)

    # ---- 输出 ----
    d_rows = []
    for x in rows:
        ev = x["ev"] + ("；追保期内" if x["day"] in ("2026-10-22", "2026-10-23") else "")
        d_rows.append([x["day"], x["mv"], x["cash"], x["prin"], x["intr"], r2(x["prin"] + x["intr"]), round(x["ratio"] * 100, 2), ev.lstrip("；"),
                       status(x["ratio"])])
    n_rows = [
        ["2026-10-14", "警戒通知", "2026-10-13", pc(R["2026-10-13"]["ratio"]), round(r("2026-10-13") * 100, 2), "成立",
         f"10-12 日终 {pc(r('2026-10-12'))}，10-13 融资买入中芯国际后跌破 150%；10-13 的融资买入发生在通知前，不违反合同"],
        ["2026-10-22", "追保通知", "2026-10-21", pc(R["2026-10-21"]["ratio"]), round(r("2026-10-21") * 100, 2), "成立",
         "10 月唯一一个日终低于 130% 的交易日，追保期限是 10-23 日终回到 150%"],
        ["2026-10-26", "强制平仓通知", "2026-10-23", pc(R["2026-10-23"]["ratio"]), round(r("2026-10-23") * 100, 2), "触发成立，数量不成立",
         f"10-23 日终 {pc(r('2026-10-23'))}，没回到 150%，10-26 可以强平；但按合同应先用现金 {w2(fp['cash'])} 元还款，还款后 {pc(fp['r_cash'])}，不需要卖券"],
    ]
    f_rows = [
        ["强平前（10-26 日终，不还款、不卖券）", "", round(fp["r_before"] * 100, 2), "按 10-26 收盘价"],
        ["第一步：现金直接还款", fp["cash"], round(fp["r_cash"] * 100, 2),
         f"先还利息 {w2(fp['cash_pay_i'])}，再还本金 " + "，".join(f"{a} {w2(b)}" for a, b in fp["cash_parts"])],
        ["第二步：合同下应卖紫金矿业股数", fp["need"], "", "还款后已不低于 150%，不需要卖券"],
        ["券商实际卖出紫金矿业股数", 60000, round(R["2026-10-26"]["ratio"] * 100, 2), "券商没有先用现金还款，直接卖券；比例为实际 10-26 日终"],
        ["超额平仓股数", extra, "", "60,000 − 0"],
        ["强平成交金额", force["amt"], "", f"60,000 × {force['price']:.2f}"],
        ["强平交易费用", fee_force, "", f"佣金 {w2(force['comm'])}，印花税 {w2(force['stamp'])}，过户费 {w2(force['trans'])}"],
        ["超额平仓损失", loss, "", f"{extra:,} × ({p30:.2f} − {force['price']:.2f}) + {w2(fee_force)} × {extra:,} ÷ 60,000"],
    ]
    pxe, pxs = px.loc[BASE], px.loc["2026-09-30"]
    tot_mv = acc.mv(pxe)
    s_rows = []
    for h in HOLD:
        k = h[0]
        s_rows.append(["担保证券", k, NAME[k], BOARD[k], acc.pos[k], float(pxe[k]), r2(acc.pos[k] * pxe[k]),
                       round((pxe[k] / pxs[k] - 1) * 100, 2), round(acc.pos[k] * pxe[k] / tot_mv * 100, 2), ""])
    for c in acc.con:
        s_rows.append(["融资合约", c[0], "", "", "", "", c[2], "", "", f"开仓日 {c[1]}"])
    s_rows.append(["应付融资利息", "", "", "", "", "", acc.intr, "", "", "2026-09-21 起计提，扣除 10-23、10-26 还掉的利息"])
    s_rows.append(["现金余额", "", "", "", "", "", acc.cash, "", "", ""])
    s_rows.append(["担保证券市值合计", "", "", "", "", "", tot_mv, "", "", ""])
    s_rows.append(["负债合计", "", "", "", "", "", r2(acc.principal + acc.intr), "", "", ""])
    rat_e = acc.ratio(pxe)
    s_rows.append(["维持担保比例(%)", "", "", "", "", "", round(rat_e * 100, 2), "", "", status(rat_e)])
    o_rows = [[d, float(m.Close[d]), float(px.loc[d, "688981"]), str(m.Date[d])] for d in ["2026-09-30"] + days]
    write_xlsx(ans / "两融账户10月回放复核表.xlsx",
               [("逐日回放", ["日期", "担保证券市值(元)", "现金(元)", "融资本金(元)", "应付利息(元)", "负债合计(元)", "维持担保比例(%)", "当天发生的事", "状态"], d_rows),
                ("通知核对", ["通知日期", "通知类型", "依据日", "券商给的比例", "复核比例(%)", "是否成立", "说明"], n_rows),
                ("强平核对", ["项目", "金额或股数", "维持担保比例(%)", "说明"], f_rows),
                ("10月末状态", ["类别", "代码或合约", "名称", "板块", "持股数(股)", "10-30收盘价(元)", "市值或金额(元)", "10月涨跌幅(%)", "占担保证券市值(%)", "备注"], s_rows),
                ("在线数据", ["交易日", "在线收盘价", "使用的收盘价(保留2位)", "返回的Date(UTC)"], o_rows)],
               notes={"逐日回放": ["利息每个自然日按当天日终本金 × 6.20% ÷ 360 计提，四舍五入到分；节假日按节前最后一个交易日日终本金计。10-08 一天计了 10-01 至 10-08 共 8 天。",
                               "卖券还款先还截至前一自然日的应付利息，再按开仓日先后还本金。"],
                      "强平核对": ["合同第八条：强制平仓先用现金直接还款，还款后仍低于 150% 的才卖券，以恢复到 150% 为限。按 A07，用强平当日 10-26 收盘价回算。",
                               f"超额平仓损失按 A07：超额股数 × (10-30 收盘价 − 强平成交价)，再加上超额部分分摊的交易费用。"],
                      "10月末状态": ["10 月涨跌幅 = 2026-10-30 收盘价 ÷ 2026-09-30 收盘价 − 1。"],
                      "在线数据": [source_line(rec), f"返回 {len(m)} 行，Date 为 {str(m.Date.iloc[0])[:10]} 至 {str(m.Date.iloc[-1])[:10]}（UTC），对应交易日 {m.index[0]} 至 {m.index[-1]}。Date 是 UTC 16:00，加 8 小时后的日期是交易日。",
                               "Close 是按分红调整的价格，这段时间 Dividends 全是 0，和不复权价相同，只有浮点尾数，保留两位小数使用。"]})
    warn_days = [d for d in days if r(d) < WARN]
    ev_n = n_rows
    write_docx(ans / "两融账户10月复核意见.docx", "量化多头二号 两融账户10月追保与强制平仓复核意见", [
        ("结论", [f"华东证券 10 月的警戒通知和追保通知都成立。10-23 日终维持担保比例 {pc(r('2026-10-23'))}，没有回到 150%，10-26 强制平仓的触发条件成立。",
                f"但券商没有按合同先用账户里的 {w2(fp['cash'])} 元现金还款。先还款的话，10-26 日终比例是 {pc(fp['r_cash'])}，不需要卖任何股票。"
                f"卖出的紫金矿业 60,000 股全部是超额平仓，按 A07 计算的损失是 {w2(loss)} 元，建议在异议期内（11-02 收盘前）向券商提出。",
                f"10 月末维持担保比例 {pc(rat_e)}，处在{status(rat_e)}状态。"]),
        ("10 月的经过", [f"9-30 日终比例 {pc(r('2026-09-30'))}。10-12 是 {pc(r('2026-10-12'))}，10-13 融资买入中芯国际 20,000 股、新增融资 {w2(log['2026-10-13']['fin'])} 元后跌到 {pc(r('2026-10-13'))}，从这天起处在警戒状态。",
                      f"10-21 宁德时代收盘 {px.loc['2026-10-21', '300750']:.2f} 元，单日跌 {abs(px.loc['2026-10-21', '300750'] / px.loc['2026-10-20', '300750'] - 1) * 100:.2f}%，日终比例 {pc(r('2026-10-21'))}，低于 130%，这是 10 月唯一一个低于追保线的交易日。",
                      f"10-22 银证转入 2,500,000 元后比例 {pc(r('2026-10-22'))}；10-23 卖出宁德时代 16,000 股还款后 {pc(r('2026-10-23'))}，仍差 {(WARN - r('2026-10-23')) * 100:.2f} 个百分点。"]),
        ("投资经理的说法", [f"邮件里 10-23 的比例 {pc(rn['ratio'])}，算的时候没有计融资利息。合同第二条每个自然日计息，10-23 卖券还款前的应付利息是 "
                       f"{w2(R['2026-10-22']['intr'])} 元，卖券所得要先还利息，本金少还了这么多；"
                       f"计上利息以后是 {pc(r('2026-10-23'))}，没有达标。所以强平本身有依据，要求赔偿全部损失、恢复持仓的主张不成立。",
                       "能主张的是超额平仓：合同第八条要求先用现金还款，券商跳过了这一步。",
                       "另外，22 日转入的 250 万元如果当天直接还款，而不是留在账户里当担保物，比例会更高。以后追保优先直接还款。"]),
        ("10 月末状态", [f"担保证券市值 {w2(tot_mv)} 元，现金 {w2(acc.cash)} 元，融资本金 {w2(acc.principal)} 元，应付利息 {w2(acc.intr)} 元，维持担保比例 {pc(rat_e)}。",
                       "持仓：" + "，".join(f"{NAME[k]} {acc.pos[k]:,} 股" for k in NAME) + "。"]),
        ("数据", ["沪深五只股票用内部行情快照。中芯国际通过 US Stocks MCP 查询 688981.SS，这段时间没有分红，Close 和不复权价相同，保留两位小数使用；Date 加 8 小时取交易日。"]),
    ])
    print(f"[26] 比例 " + " ".join(f"{d[5:]}:{r(d) * 100:.2f}" for d in ["2026-09-30"] + days))
    print(f"     不计利息 10-23 {RN['2026-10-23']['ratio'] * 100:.2f}；强平前 {fp['r_before'] * 100:.2f} 现金还款后 {fp['r_cash'] * 100:.2f} 应卖 {fp['need']}")
    print(f"     超额 {extra} 损失 {loss}；月末 {rat_e * 100:.2f}% 现金 {acc.cash} 本金 {acc.principal} 利息 {acc.intr} 持仓 {acc.pos}")
    return dict(acc=acc, px=px, rat=rat_e, loss=loss, R=R, fp=fp)


# ---------------- 27 ----------------
STRESS, CAP, FEE27 = 1.80, 0.50, 0.00076
LIMIT = {"沪市主板": 0.10, "深市主板": 0.10, "创业板": 0.20, "科创板": 0.20}


def read_q26(path: Path):
    wb = load_workbook(path, data_only=True)
    pos, board = {}, {}
    for r in wb["10月末状态"].iter_rows(min_row=2, values_only=True):
        if r and r[0] == "担保证券":
            pos[str(r[1])] = int(r[4])
            board[str(r[1])] = r[3]
    return pos, board


def lots(code: str, room: int):
    """不超过 room 股时，从小到大可以申报的卖出股数。"""
    if code.startswith("688"):
        return list(range(200, room + 1)) if room >= 200 else []
    return list(range(100, room - room % 100 + 1, 100))


def q27(r26):
    att, ans = fresh_dir(D27 / "题目附件"), fresh_dir(D27 / "标准答案附件")
    fresh_dir(D27 / "MCP结果文件")
    copy_as(D26 / "标准答案附件" / "两融账户10月回放复核表.xlsx", att / "两融账户10月回放复核表.xlsx")
    copy_as(DOC / "两融降杠杆" / "A01_投委会降杠杆决议.md", att / "降杠杆_A01_投委会降杠杆决议.md")
    mcps = {}
    for k in NAME:
        fn = f"降杠杆_MCP_{NAME[k]}日线.json"
        copy_as(RAW / "两融降杠杆压力" / f"{YSYM[k]}.json", D27 / "MCP结果文件" / fn)
        copy_as(D27 / "MCP结果文件" / fn, att / fn)
        mcps[k] = fn

    # 券商 11-02 日终对账单：10-31、11-01 按 10-30 本金计息；11-02 现金直接还款（先息后本），当天利息按还款后本金计
    acc = r26["acc"]
    a = Account(acc.pos, acc.cash, acc.con, acc.intr)
    a.accrue(2)
    cash = a.cash
    pay_i, parts, rest = a.repay(cash)
    assert rest == 0
    a.cash = 0.0
    a.intr = r2(a.intr + r2(a.principal * RATE / 360))
    with open(att / "降杠杆_A02_华东证券11月2日对账单.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["项目", "合约编号", "开仓日", "2026-11-02日终金额(元)", "说明"])
        for c in a.con:
            wr.writerow(["融资合约", c[0], c[1], f"{c[2]:.2f}", "未还本金"])
        wr.writerow(["应付融资利息", "", "", f"{a.intr:.2f}", "11-02 当天按还款后本金计提"])
        wr.writerow(["现金余额", "", "", "0.00", ""])
        wr.writerow(["直接还款", "", "", f"{cash:.2f}", f"11-02 客户发起，先还应付利息 {pay_i:.2f}，再还 " + "，".join(f"{x} 本金 {y:.2f}" for x, y in parts)])

    # ---- 只用附件重算 ----
    pos0, board = read_q26(att / "两融账户10月回放复核表.xlsx")
    st = pd.read_csv(att / "降杠杆_A02_华东证券11月2日对账单.csv", dtype=str)
    debt0 = r2(sum(float(x) for x in st[st["项目"].isin(["融资合约", "应付融资利息"])]["2026-11-02日终金额(元)"]))
    cash0 = float(st[st["项目"] == "现金余额"]["2026-11-02日终金额(元)"].iloc[0])
    assert cash0 == 0
    recs, p, vol, dd, win = {}, {}, {}, {}, {}
    for k, fn in mcps.items():
        rec, m = load_mcp_prices(att / fn, 8)
        recs[k] = (rec, m)
        c = m.Close.round(2)
        w = c[c.index <= EXE].tail(21)
        assert w.index[-1] == EXE and len(w) == 21
        assert abs(float(c[BASE]) - r26["px"].loc[BASE, k]) < 0.006
        assert float(m.Dividends.loc[w.index[0]:EXE].abs().sum()) == 0
        p[k] = float(c[EXE])
        vol[k] = float(w.pct_change().dropna().std())
        dd[k] = round(min(3 * vol[k], LIMIT[board[k]]), 4)
        win[k] = (w.index[1], w.index[-1])
    capq = {k: (lots(k, int(pos0[k] * CAP)) or [0])[-1] for k in pos0}

    def mv(s):
        return sum(s["pos"][k] * p[k] for k in s["pos"])

    def ratio(s):
        return (mv(s) + cash0) / s["debt"]

    def stress(s):
        return (sum(s["pos"][k] * p[k] * (1 - dd[k]) for k in s["pos"]) + cash0) / s["debt"]

    def conc(s):
        t = mv(s)
        return {k: s["pos"][k] * p[k] / t for k in s["pos"] if s["pos"][k] > 0}

    def room(s, k):
        return capq[k] - (pos0[k] - s["pos"][k])

    def do(s, k, q):
        amt = r2(q * p[k])
        fee = r2(amt * FEE27)
        n = dict(pos=dict(s["pos"]), debt=r2(s["debt"] - r2(amt - fee)))
        n["pos"][k] -= q
        return n, dict(code=k, qty=q, amt=amt, fee=fee, net=r2(amt - fee))

    sells = []

    def record(s, o, step):
        o.update(step=step, debt=s["debt"], conc=max(conc(s).values()), ratio=ratio(s), stress=stress(s))
        sells.append(o)

    def fix_conc(s, step):
        while True:
            c = conc(s)
            over = [k for k in c if c[k] > CONC + 1e-12]
            if not over:
                return s
            k = max(over, key=c.get)
            for q in lots(k, room(s, k)):
                n, o = do(s, k, q)
                if conc(n).get(k, 0) <= CONC:
                    break
            else:
                raise SystemExit(f"{k} 卖到上限仍超过 30%")
            s = n
            record(s, o, step)

    s = dict(pos=dict(pos0), debt=debt0)
    start = dict(ratio=ratio(s), stress=stress(s), conc=conc(s))
    s = fix_conc(s, "集中度")
    order = sorted(pos0, key=lambda k: -dd[k])
    for k in order:
        if stress(s) >= STRESS:
            break
        qs = lots(k, room(s, k))
        if not qs:
            continue
        for q in qs:
            n, o = do(s, k, q)
            if stress(n) >= STRESS:
                break
        s = n
        record(s, o, "压力情景" + ("（到50%上限）" if room(s, k) < (200 if k.startswith("688") else 100) and stress(s) < STRESS else ""))
        s = fix_conc(s, "复查集中度")
    assert stress(s) >= STRESS and all(v <= CONC for v in conc(s).values())
    capped = [k for k in pos0 if pos0[k] - s["pos"][k] == capq[k]]

    print(f"[27] 对账单负债 {debt0}；11-02 价 {p}")
    print("     压力跌幅 " + " ".join(f"{NAME[k]} {dd[k] * 100:.2f}%（σ {vol[k] * 100:.4f}%）" for k in order))
    print(f"     起点 比例 {start['ratio'] * 100:.2f}% 压力 {start['stress'] * 100:.2f}% 宁德 {start['conc']['300750'] * 100:.2f}%")
    for o in sells:
        print(f"     {o['step']} {NAME[o['code']]} {o['qty']} 成交 {o['amt']} 费用 {o['fee']} 净额 {o['net']} 负债 {o['debt']} "
              f"集中度 {o['conc'] * 100:.3f}% 比例 {o['ratio'] * 100:.3f}% 压力 {o['stress'] * 100:.3f}%")
    print(f"     执行后 持仓 {s['pos']} 负债 {s['debt']} 占比 { {NAME[k]: round(v * 100, 2) for k, v in conc(s).items()} } 上限 {capped}")
    # 错法
    print(f"     错法：创业板按 10% 封顶，宁德压力跌幅 10.00%；分母 n 时宁德 σ {float(recs['300750'][1].Close.round(2)[:EXE].tail(21).pct_change().dropna().std(ddof=0)) * 100:.4f}%")
    assert capped == ["300750"] and STRESS - start["stress"] > 0.2

    # ---- 输出 ----
    p_rows = [[k, NAME[k], board[k], p[k], round(vol[k] * 100, 4), round(3 * vol[k] * 100, 4), round(LIMIT[board[k]] * 100, 0), round(dd[k] * 100, 2),
               pos0[k], capq[k]] for k in order]
    s_rows = [[i, o["step"], o["code"], NAME[o["code"]], o["qty"], p[o["code"]], o["amt"], o["fee"], o["net"], o["debt"], round(o["conc"] * 100, 2),
               round(o["ratio"] * 100, 2), round(o["stress"] * 100, 2)] for i, o in enumerate(sells, 1)]
    tot = mv(s)
    e_rows = [["担保证券", k, NAME[k], s["pos"][k], p[k], r2(s["pos"][k] * p[k]), round(s["pos"][k] * p[k] / tot * 100, 2),
               f"卖出 {pos0[k] - s['pos'][k]:,} 股" + ("，到 50% 上限" if k in capped else "") if pos0[k] != s["pos"][k] else ""] for k in NAME]
    e_rows += [["担保证券市值合计", "", "", "", "", r2(tot), "", ""],
               ["现金余额", "", "", "", "", 0.0, "", "卖出净额全部还款"],
               ["负债合计", "", "", "", "", s["debt"], "", f"11-02 日终 {usd2(debt0)}，减去卖出净额合计 {usd2(r2(debt0 - s['debt']))}"],
               ["维持担保比例(%)", "", "", "", "", round(ratio(s) * 100, 2), "", ""],
               ["压力情景比例(%)", "", "", "", "", round(stress(s) * 100, 2), "", "目标 ≥ 180%，满足"],
               ["最大单一股票占比(%)", "", "", "", "", round(max(conc(s).values()) * 100, 2), "", "目标 ≤ 30%，满足"]]
    o_rows = [[k, NAME[k], recs[k][0]["参数"]["ticker"], d, str(recs[k][1].Date[d]), float(recs[k][1].Close.round(2)[d])]
              for k in NAME for d in (win[k][0], EXE)]
    write_xlsx(ans / "两融降杠杆执行方案表.xlsx",
               [("压力参数", ["代码", "名称", "板块", "11-02收盘价(元)", "日波动率(%)", "3倍日波动率(%)", "涨跌幅限制(%)", "压力跌幅(%)", "11-02持股数(股)", "卖出上限(股)"], p_rows),
                ("卖出清单", ["序号", "步骤", "代码", "名称", "卖出股数", "测算价(元)", "成交金额(元)", "卖出费用(元)", "卖出净额(元)", "卖出后负债合计(元)",
                          "卖出后最大单一占比(%)", "卖出后维持担保比例(%)", "卖出后压力情景比例(%)"], s_rows),
                ("执行后状态", ["类别", "代码", "名称", "持股数(股)", "11-02收盘价(元)", "市值或金额(元)", "占担保证券市值(%)", "备注"], e_rows),
                ("在线数据", ["代码", "名称", "查询代码", "交易日", "返回的Date(UTC)", "收盘价(元，保留2位)"], o_rows)],
               notes={"压力参数": [f"日波动率用 {win['300750'][0]} 至 {EXE} 的 20 个日收益，样本标准差。压力跌幅 = min(3 × 日波动率, 涨跌幅限制)，保留两位小数。按压力跌幅从高到低排列，也就是卖出顺序。",
                                "卖出上限 = 11-02 持股数 × 50%，按申报单位向下取整。"],
                      "卖出清单": [f"起点：负债 {usd2(debt0)} 元，维持担保比例 {start['ratio'] * 100:.2f}%，压力情景比例 {start['stress'] * 100:.2f}%，宁德时代占 {start['conc']['300750'] * 100:.2f}%。",
                               "卖出费用 = 成交金额 × 0.076%，四舍五入到分；卖出净额全部还款。集中度用原值和 30% 比。"],
                      "在线数据": [source_line(recs[k][0]) for k in NAME] + ["Date 是 UTC 16:00，加 8 小时后的日期是交易日；11-02 对应 2026-11-01T16:00Z 这一行。表里列出每只股票波动率窗口的第一个交易日和 11-02 两行。"]})
    agg = {}
    for o in sells:
        agg[o["code"]] = agg.get(o["code"], 0) + o["qty"]
    write_docx(ans / "两融降杠杆执行方案.docx", "量化多头二号 两融账户11月3日降杠杆卖出方案", [
        ("结论", ["按 11-02 收盘价测算，交易部 11-03 卖出" + "、".join(f"{NAME[k]} {v:,} 股" for k, v in agg.items()) + "，所得全部还款。"
                f"执行后负债 {usd2(s['debt'])} 元，维持担保比例 {ratio(s) * 100:.2f}%，压力情景比例 {stress(s) * 100:.2f}%，最大单一股票占比 {max(conc(s).values()) * 100:.2f}%，两项目标都满足。"
                "11-03 实际成交价和测算价不同的，交易部按同样的顺序和目标收尾。"]),
        ("压力跌幅", ["按 11-02 往前 20 个交易日的日波动率乘 3，不超过涨跌幅限制：" + "、".join(f"{NAME[k]} {dd[k] * 100:.2f}%" for k in order) + "。"
                   f"宁德时代是创业板，涨跌幅限制 20%，3 倍日波动率 {3 * vol['300750'] * 100:.2f}% 没有超过限制。",
                   f"起点负债按华东证券 11-02 对账单 {usd2(debt0)} 元，维持担保比例 {start['ratio'] * 100:.2f}%，压力情景比例 {start['stress'] * 100:.2f}%。"]),
        ("为什么这样卖", [f"还款以后宁德时代占担保证券市值 {start['conc']['300750'] * 100:.2f}%，超过 30%，先卖它。"]
         + [f"第 {i} 笔，{o['step']}：{NAME[o['code']]} {o['qty']:,} 股，成交 {usd2(o['amt'])} 元，净额 {usd2(o['net'])} 元；卖完以后压力情景比例 {o['stress'] * 100:.2f}%，最大单一占比 {o['conc'] * 100:.2f}%。"
            for i, o in enumerate(sells, 1)]
         + [f"宁德时代两笔合计 {agg['300750']:,} 股，到了 11-02 持股 50% 的上限，压力情景比例还不够，按压力跌幅顺序换中芯国际。"
            "中芯国际是科创板，超过 200 股的部分可以按 1 股申报。"]),
        ("数据", ["6 只股票近 3 个月日线通过 US Stocks MCP 查询，代码后缀 .SS、.SZ，Date 加 8 小时取交易日，收盘价保留两位小数。11-02 收盘价："
                + "，".join(f"{NAME[k]} {p[k]:.2f}" for k in NAME) + "。10-30 收盘价和复核表一致。"]),
    ])
    return dict(sells=sells, s=s)


usd2 = w2


if __name__ == "__main__":
    r26 = q26()
    q27(r26)
