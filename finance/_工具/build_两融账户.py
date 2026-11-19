#!/usr/bin/env python3
"""打包「量化多头二号」两融账户的两道题（26 10月回放复核 → 27 11月降杠杆执行方案）。
27 读 26 的标准答案《两融账户10月回放复核表.xlsx》「10月末状态」，这份表原样复制进 27 的题目附件。
沪深行情快照是 fetch_longport.py 拉的不复权日线；中芯国际 10 月日线和 6 只股票 11-02 收盘价是 fetch_新题.py 通过 US Stocks MCP 查的。
持仓、融资合约、交易流水、券商通知和投资经理邮件是按题目需要拟的。
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
                      "10月末状态": [f"10 月涨跌幅 = 2026-10-30 收盘价 ÷ 2026-09-30 收盘价 − 1。下一步降杠杆按这张表执行。"],
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
                       "持仓：" + "，".join(f"{NAME[k]} {acc.pos[k]:,} 股" for k in NAME) + "。下一步降杠杆按复核表「10月末状态」执行。"]),
        ("数据", ["沪深五只股票用内部行情快照。中芯国际通过 US Stocks MCP 查询 688981.SS，这段时间没有分红，Close 和不复权价相同，保留两位小数使用；Date 加 8 小时取交易日。"]),
    ])
    print(f"[26] 比例 " + " ".join(f"{d[5:]}:{r(d) * 100:.2f}" for d in ["2026-09-30"] + days))
    print(f"     不计利息 10-23 {RN['2026-10-23']['ratio'] * 100:.2f}；强平前 {fp['r_before'] * 100:.2f} 现金还款后 {fp['r_cash'] * 100:.2f} 应卖 {fp['need']}")
    print(f"     超额 {extra} 损失 {loss}；月末 {rat_e * 100:.2f}% 现金 {acc.cash} 本金 {acc.principal} 利息 {acc.intr} 持仓 {acc.pos}")
    return dict(acc=acc, px=px, rat=rat_e, loss=loss, R=R, fp=fp)


# ---------------- 27 ----------------
def read_q26(path: Path):
    wb = load_workbook(path, data_only=True)
    pos, chg, con, intr, cash = {}, {}, [], None, None
    for r in wb["10月末状态"].iter_rows(min_row=2, values_only=True):
        if not r or not r[0]:
            continue
        if r[0] == "担保证券":
            pos[str(r[1])] = int(r[4])
            chg[str(r[1])] = float(r[7])
        elif r[0] == "融资合约":
            con.append([r[1], r[9].replace("开仓日 ", ""), float(r[6])])
        elif r[0] == "应付融资利息":
            intr = float(r[6])
        elif r[0] == "现金余额":
            cash = float(r[6])
    return pos, chg, con, intr, cash


def lots(code: str, held: int):
    """返回从小到大可以申报的卖出股数。"""
    if code.startswith("688"):
        if held < 200:
            return [held]
        return list(range(200, held + 1))
    if held < 100:
        return [held]
    qs = list(range(100, held - held % 100 + 1, 100))
    if held % 100:
        qs.append(held)
    return qs


def q27(r26):
    import copy
    att, ans = fresh_dir(D27 / "题目附件"), fresh_dir(D27 / "标准答案附件")
    (D27 / "MCP结果文件").mkdir(exist_ok=True)
    copy_as(D26 / "标准答案附件" / "两融账户10月回放复核表.xlsx", att / "两融账户10月回放复核表.xlsx")
    copy_as(DOC / "两融降杠杆" / "A01_投委会降杠杆决议.md", att / "降杠杆_A01_投委会降杠杆决议.md")
    copy_as(DOC / "两融回放" / "A04_融资融券合同条款摘要.md", att / "降杠杆_A02_融资融券合同条款摘要.md")
    mcps = {}
    for k in NAME:
        fn = f"降杠杆_MCP_{NAME[k]}日线.json"
        copy_as(RAW / "两融降杠杆" / f"{YSYM[k]}.json", D27 / "MCP结果文件" / fn)
        copy_as(D27 / "MCP结果文件" / fn, att / fn)
        mcps[k] = fn
    pos, chg, con, intr, cash = read_q26(att / "两融账户10月回放复核表.xlsx")
    recs, p = {}, {}
    for k, fn in mcps.items():
        rec, m = load_mcp_prices(att / fn, 8)
        recs[k] = (rec, m)
        p[k] = round(float(m.Close[EXE]), 2)
        assert abs(float(m.Close[BASE]) - r26["px"].loc[BASE, k]) < 0.006  # 和 10-30 收盘价对得上
        assert float(m.Dividends.loc[BASE:EXE].abs().sum()) == 0
    # 10-31、11-01、11-02 按 10-30 日终本金计；执行日 11-03 当天还掉的本金当天不计息，当天利息等还款后按日终本金计
    acc = Account(pos, cash, con, intr)
    acc.accrue(3)
    ser = lambda a: (a.mv(p) + a.cash) / (a.principal + a.intr + r2(a.principal * RATE / 360))  # 含当天利息的日终比例
    log, sells = [], []
    pi, parts, rest = acc.repay(acc.cash)
    acc.cash = rest
    log.append(["现金直接还款", "", cash, pi, "；".join(f"{a} {w2(b)}" for a, b in parts)])

    def conc(a):
        mv = a.mv(p)
        return {k: a.pos[k] * p[k] / mv for k in a.pos if a.pos[k] > 0}

    def fix_conc(a, step):
        while True:
            c = conc(a)
            over = [k for k in c if c[k] > CONC + 1e-12]
            if not over:
                return
            k = max(over, key=lambda x: c[x])
            for q in lots(k, a.pos[k]):
                b = copy.deepcopy(a)
                sell(b, k, q, p[k])
                if conc(b).get(k, 0) <= CONC:
                    o = sell(a, k, q, p[k])
                    o["step"] = step
                    sells.append((o, copy.deepcopy(a)))
                    break

    fix_conc(acc, "集中度")
    order = sorted(pos, key=lambda k: chg[k])
    while ser(acc) < TGT:
        k = next(x for x in order if acc.pos[x] > 0)
        done = False
        for q in lots(k, acc.pos[k]):
            b = copy.deepcopy(acc)
            sell(b, k, q, p[k])
            if ser(b) >= TGT:
                o = sell(acc, k, q, p[k])
                done = True
                break
        if not done:
            o = sell(acc, k, acc.pos[k], p[k])
        o["step"] = "比例"
        sells.append((o, copy.deepcopy(acc)))
        fix_conc(acc, "复查集中度")
    fix_conc(acc, "复查集中度")
    assert ser(acc) >= TGT and all(v <= CONC for v in conc(acc).values())
    pre_fin = ser(acc)
    day_i = r2(acc.principal * RATE / 360)
    acc.intr = r2(acc.intr + day_i)
    fin = (acc.mv(p) + acc.cash) / (acc.principal + acc.intr)
    assert abs(fin - pre_fin) < 1e-9

    print(f"[27] 11-02 价 {p}")
    for o, a in sells:
        print(f"     {o['step']} 卖 {NAME[o['code']]} {o['qty']} @ {o['price']} 净 {o['net']} 后比例 {ser(a) * 100:.2f}% 集中度 {max(conc(a).values()) * 100:.2f}%")
    print(f"     执行后 {fin * 100:.2f}% 本金 {acc.principal} 利息 {acc.intr} 现金 {acc.cash} 持仓 {acc.pos} 集中度 { {NAME[k]: round(v * 100, 2) for k, v in conc(acc).items()} }")

    # ---- 输出 ----
    s_rows = []
    r_rows = [["现金直接还款", "", cash, pi, "；".join(f"{a} {w2(b)}" for a, b in parts)]]
    for i, (o, a) in enumerate(sells, 1):
        s_rows.append([i, o["step"], o["code"], NAME[o["code"]], o["qty"], o["price"], o["amt"], o["comm"], o["stamp"], o["trans"], o["net"],
                       round(max(conc(a).values()) * 100, 2), round(ser(a) * 100, 2)])
        r_rows.append([f"卖券还款 {i}", f"{NAME[o['code']]} {o['qty']:,} 股", o["net"], o["pay_i"], "；".join(f"{x} {w2(y)}" for x, y in o["parts"])])
    mv = acc.mv(p)
    e_rows = [["担保证券", k, NAME[k], acc.pos[k], p[k], r2(acc.pos[k] * p[k]), round(acc.pos[k] * p[k] / mv * 100, 2), ""] for k in NAME]
    e_rows += [["融资合约", c[0], "", "", "", c[2], "", f"开仓日 {c[1]}"] for c in acc.con]
    e_rows += [["应付融资利息", "", "", "", "", acc.intr, "", "含 11-03 当天按还款后本金计的利息"],
               ["现金余额", "", "", "", "", acc.cash, "", ""],
               ["担保证券市值合计", "", "", "", "", mv, "", ""],
               ["维持担保比例(%)", "", "", "", "", round(fin * 100, 2), "", "目标 ≥ 200%，" + ("满足" if fin >= TGT else "不满足")],
               ["最大单一股票占比(%)", "", "", "", "", round(max(conc(acc).values()) * 100, 2), "", "目标 ≤ 30%，满足"]]
    o_rows = [[k, NAME[k], recs[k][0]["参数"]["ticker"], recs[k][0]["工具"], "period=1mo, interval=1d", recs[k][0]["查询时间"],
               str(recs[k][1].Date[EXE]), EXE, p[k]] for k in NAME]
    write_xlsx(ans / "两融降杠杆执行方案表.xlsx",
               [("卖出清单", ["序号", "步骤", "代码", "名称", "卖出股数", "测算价(元)", "成交金额(元)", "佣金(元)", "印花税(元)", "过户费(元)", "卖出净额(元)",
                          "卖出后最大单一占比(%)", "卖出后维持担保比例(%)"], s_rows),
                ("还款明细", ["项目", "来源", "还款金额(元)", "还利息(元)", "还本金"], r_rows),
                ("执行后状态", ["类别", "代码或合约", "名称", "持股数(股)", "11-02收盘价(测算价，元)", "市值或金额(元)", "占担保证券市值(%)", "备注"], e_rows),
                ("在线数据", ["代码", "名称", "查询代码", "工具", "参数", "查询时间", "返回的Date(UTC)", "对应交易日", "收盘价(元，保留2位)"], o_rows)],
               notes={"卖出清单": ["成交金额、费用和比例都按 11-02 收盘价（测算价）算。卖出后维持担保比例是执行日 11-03 的日终口径：含 10-31 至 11-02 三天按 10-30 本金计的利息，以及 11-03 当天按这一步还款后本金计的利息。集中度用不四舍五入的原值和 30% 比。",
                               "卖出顺序：先集中度，再按 10 月涨跌幅从低到高卖到 200%，最后复查集中度。每一步取满足要求的最少股数。"],
                      "在线数据": [source_line(recs[k][0]) for k in NAME] + ["Date 是 UTC 16:00，加 8 小时后的日期是交易日，11-02 对应 2026-11-01T16:00Z 这一行。"]})
    agg = {}
    for o, _ in sells:
        agg[o["code"]] = agg.get(o["code"], 0) + o["qty"]
    names = "、".join(f"{NAME[k]} {v:,} 股" for k, v in agg.items())
    write_docx(ans / "两融降杠杆执行方案.docx", "量化多头二号 两融账户11月3日降杠杆执行方案", [
        ("结论", [f"方案按 11-02 收盘价测算，交易部 11-03 执行：先用账户现金 {w2(cash)} 元直接还款，再卖出 {names}，所得全部还款。"
                f"按测算价，执行后维持担保比例 {pc(fin)}，最大单一股票占比 {pc(max(conc(acc).values()))}，两项目标都满足。11-03 实际成交价和测算价不同的，交易部按同样的顺序和目标收尾。"]),
        ("为什么这样卖", [f"按 11-02 收盘价，还款前宁德时代占担保证券市值 {pc(pos['300750'] * p['300750'] / sum(pos[k] * p[k] for k in pos))}，超过 30%，先卖宁德时代。"]
         + [f"第 {i} 笔（{o['step']}）：{NAME[o['code']]} {o['qty']:,} 股，成交 {w2(o['amt'])} 元，净额 {w2(o['net'])} 元；卖完以后比例 {pc(ser(a))}，最大单一占比 {pc(max(conc(a).values()))}。"
            for i, (o, a) in enumerate(sells, 1)]
         + ["10 月涨跌幅从低到高是：" + "、".join(f"{NAME[k]} {chg[k]:.2f}%" for k in order) + "。"]),
        ("还款以后", [f"融资本金还剩 {w2(acc.principal)} 元：" + "，".join(f"{c[0]} {w2(c[2])} 元" for c in acc.con) + f"。应付利息 {w2(acc.intr)} 元。"]),
        ("数据", ["11-02 收盘价（测算价）通过 US Stocks MCP 查询，代码后缀 .SS、.SZ，Date 加 8 小时取交易日，保留两位小数："
                + "，".join(f"{NAME[k]} {p[k]:.2f}" for k in NAME) + "。10-30 收盘价和复核表一致。"]),
    ])
    return dict(sells=sells, fin=fin, acc=acc, p=p)


if __name__ == "__main__":
    r26 = q26()
    q27(r26)
