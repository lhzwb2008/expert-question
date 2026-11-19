#!/usr/bin/env python3
"""打包「全球科技成长一号」美元专户的两道题（24 估值对账 → 25 业绩报酬计提）。
25 读 24 的标准答案《专户估值对账表.xlsx》「净值汇总」，这份表原样复制进 25 的题目附件。
美股不复权日线是 fetch_longport.py 拉的内部快照；拆股、分红和 QQQ 是 fetch_新题.py 通过 US Stocks MCP 查的。
持仓、交易流水、付息日、管理人估值表、托管行对账单、份额登记和初算是按题目需要拟的。
"""
from __future__ import annotations

import csv
import datetime as dt
import json
from pathlib import Path

import pandas as pd
from openpyxl import load_workbook

from build_common import OUT, copy_as, fresh_dir, load_mcp_prices, source_line, write_docx, write_xlsx

HERE = Path(__file__).resolve().parent
RAW = HERE / "新题数据"
LP = RAW / "基准复算_longport"
DOC = HERE / "新题口径"
D24 = OUT / "题目" / "24_美股专户公司行为估值对账"
D25 = OUT / "题目" / "25_美股专户超额业绩报酬计提"
START, BASE = "2025-10-31", "2026-10-30"
TS = ["AAPL", "MSFT", "CSCO", "TXN", "LRCX", "NFLX", "NOW", "KLAC"]
CO = {"AAPL": "苹果", "MSFT": "微软", "CSCO": "思科", "TXN": "德州仪器", "LRCX": "泛林集团", "NFLX": "奈飞", "NOW": "ServiceNow", "KLAC": "科磊"}
POS0 = {"AAPL": 25000, "MSFT": 12000, "CSCO": 80000, "TXN": 30000, "LRCX": 40000, "NFLX": 5000, "NOW": 6000, "KLAC": 5000}
CASH0 = 1500000.00
TXN_REC0 = ("TXN", "2025-10-31", 1.42, "2025-11-11")  # 期初应收
# 日期, 股票, 股数（正买负卖）
TRADES = [("2025-11-14", "NFLX", 300), ("2025-12-10", "AAPL", -5000), ("2026-01-20", "CSCO", 10000),
          ("2026-03-17", "TXN", 10000), ("2026-03-17", "LRCX", 15000), ("2026-06-05", "KLAC", -300),
          ("2026-07-15", "NOW", 8000), ("2026-09-15", "NFLX", -6000)]
SUB = ("2026-03-16", 8000000.00)
PAY_LAG = {"AAPL": 3, "MSFT": 21, "CSCO": 20, "TXN": 11, "LRCX": 14, "KLAC": 15}
TAX, BAD_TAX = 0.10, 0.30
# 份额登记：编号, 投资者, 申购确认日, 上次实际计提日（无则空）
LOTS = [("L1", "机构甲（某银行理财子公司）", "2024-03-15", "2025-10-31"), ("L2", "机构乙（某保险资管）", "2025-02-10", ""),
        ("L3", "机构丙（某家族办公室）", "2026-03-16", "")]
UNIT_1031 = 1.3520
L2_NAV = 1.4100
FEE_RATE = 0.20

pc = lambda x: f"{x * 100:.2f}%"
w2 = lambda x: f"{x:,.2f}"
r2 = lambda x: round(x + 1e-9, 2)
r4 = lambda x: round(x + 1e-12, 4)


def next_wd(d: str, lag: int) -> str:
    x = dt.date.fromisoformat(d) + dt.timedelta(days=lag)
    while x.weekday() >= 5:
        x += dt.timedelta(days=1)
    return x.isoformat()


def load_px():
    return pd.DataFrame({t: pd.DataFrame(json.load(open(LP / f"{t}.US_noadj.json", encoding="utf-8"))).set_index("date").close.astype(float) for t in TS})


def corp_actions(mcp: dict):
    """从在线数据取拆股和分红。返回 splits{t:(d,k)}，divs[(t, 除息日, 返回的每股, 实际每股)]。"""
    splits, divs = {}, []
    for t in TS:
        m = mcp[t]
        w = m[(m.index > START) & (m.index <= BASE)]
        for d, k in w["Stock Splits"].items():
            if k:
                splits[t] = (d, float(k))
    for t in TS:
        m = mcp[t]
        w = m[(m.index > START) & (m.index <= BASE)]
        for d, v in w.Dividends.items():
            if v:
                f = splits[t][1] if t in splits and d < splits[t][0] else 1.0  # 拆股前的分红被按拆股比例调小了
                divs.append((t, d, float(v), r4(float(v) * f)))
    return splits, sorted(divs, key=lambda x: (x[1], x[0]))


def rebuild(px, splits, divs, mode="ok", until=BASE):
    """mode: ok 正确；sys 管理人新系统（只对期初持仓做拆股，拆股前的分红用在线返回的每股金额）。
    返回逐日状态函数需要的东西：pos、cash、应收、退税、股利明细。"""
    pos = dict(POS0)
    pre_trade = {t: 0 for t in TS}  # 拆股前的交易股数（sys 模式不乘比例）
    cash = CASH0
    rec = {("TXN", "2025-10-31"): r2(POS0["TXN"] * 1.42 * (1 - TAX))}
    pay = {("TXN", "2025-10-31"): TXN_REC0[3]}
    refund = 0.0
    det = []
    days = [d for d in px.index if START < d <= until]
    navs = {}
    dv = {(t, d): (v0, v) for t, d, v0, v in divs}
    for d in days:
        for t, (sd, k) in splits.items():
            if d == sd:
                if mode == "ok":
                    pos[t] = int(round(pos[t] * k))
                else:
                    pos[t] = int(round((pos[t] - pre_trade[t]) * k)) + pre_trade[t]
        for (t, ed), (v0, v) in dv.items():
            if ed == d:
                per = v if mode == "ok" else v0
                gross = r2(pos[t] * per)
                net = r2(gross * (1 - TAX))
                rec[(t, ed)] = net
                pay[(t, ed)] = next_wd(ed, PAY_LAG[t])
                det.append(dict(t=t, ex=ed, sh=pos[t], per=per, gross=gross, tax=r2(gross * TAX), net=net, pay=pay[(t, ed)],
                                bad_tax=r2(gross * BAD_TAX) if t == "CSCO" else r2(gross * TAX)))
        for key in list(rec):
            if pay[key] <= d:
                cash = r2(cash + rec.pop(key))
                if key[0] == "CSCO" and mode == "ok":
                    g = next(x for x in det if (x["t"], x["ex"]) == key)
                    extra = r2(g["bad_tax"] - g["tax"])  # 托管行多扣，实收少了，记应收退税
                    cash = r2(cash - extra)
                    refund = r2(refund + extra)
        if d == SUB[0]:
            navs["pre_sub"] = r2(sum(pos[t] * px.loc[d, t] for t in TS) + cash + sum(rec.values()) + refund)
            cash = r2(cash + SUB[1])
        for td, t, q in TRADES:
            if td != d:
                continue
            amt = r2(abs(q) * px.loc[d, t])
            c = r2(amt * 0.0002)
            if q > 0:
                cash = r2(cash - amt - c)
            else:
                cash = r2(cash + amt - c - r2(amt * 0.0000278))
            pos[t] += q
            if t in splits and d < splits[t][0]:
                pre_trade[t] += q
        navs[d] = r2(sum(pos[t] * px.loc[d, t] for t in TS) + cash + sum(rec.values()) + refund)
    nav0 = r2(sum(POS0[t] * px.loc[START, t] for t in TS) + CASH0 + r2(POS0["TXN"] * 1.42 * (1 - TAX)))
    navs[START] = nav0
    return dict(pos=pos, cash=cash, rec=dict(rec), refund=refund, det=det, navs=navs, pay=pay)


# ---------------- 24 ----------------
def q24():
    att, ans = fresh_dir(D24 / "题目附件"), fresh_dir(D24 / "标准答案附件")
    (D24 / "MCP结果文件").mkdir(exist_ok=True)
    files = {}
    for t in TS:
        fn = f"对账_MCP_{t}日线.json"
        copy_as(RAW / "专户对账" / f"{t}.json", D24 / "MCP结果文件" / fn)
        copy_as(D24 / "MCP结果文件" / fn, att / fn)
        files[t] = fn
    px_all = load_px()
    with open(att / "对账_A01_期初持仓与现金.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["项目", "代码", "名称", "2025-10-31日终数量或金额", "说明"])
        for t in TS:
            wr.writerow(["股票", t, CO[t], POS0[t], "股"])
        wr.writerow(["现金", "", "", f"{CASH0:.2f}", "美元"])
        wr.writerow(["应收股利", "TXN", CO["TXN"], f"{r2(POS0['TXN'] * 1.42 * (1 - TAX)):.2f}",
                     "2025-10-31 除息，每股 1.42 美元，30,000 股，税后；付息日 2025-11-11"])
    with open(att / "对账_A02_交易与资金流水.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["日期", "业务", "代码", "股数", "成交价(美元)", "金额(美元)"])
        rows = [(d, "买入" if q > 0 else "卖出", t, abs(q), f"{px_all.loc[d, t]:.2f}", "") for d, t, q in TRADES]
        rows.append((SUB[0], "申购款到账", "", "", "", f"{SUB[1]:.2f}"))
        for r in sorted(rows, key=lambda x: (x[0], x[1] != "申购款到账")):
            wr.writerow(r)
    with open(att / "对账_A03_美股日线.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["date", "ticker", "close"])
        for d in px_all.index:
            if "2025-10-01" <= d <= BASE:
                for t in TS:
                    wr.writerow([d, t, f"{px_all.loc[d, t]:.2f}"])
    copy_as(DOC / "专户对账" / "A06_对账口径与交付.md", att / "对账_A06_对账口径与交付.md")

    # ---- 只用附件重算 ----
    a03 = pd.read_csv(att / "对账_A03_美股日线.csv", dtype={"date": str})
    px = a03.pivot(index="date", columns="ticker", values="close")[TS]
    mcp, recs = {}, {}
    for t in TS:
        rec, m = load_mcp_prices(att / files[t], 0)
        recs[t] = rec
        mcp[t] = m
    splits, divs = corp_actions(mcp)
    assert splits == {"NFLX": ("2025-11-17", 10.0), "NOW": ("2025-12-18", 5.0), "KLAC": ("2026-06-12", 10.0)}
    for t, (d, k) in splits.items():  # 拆股和不复权价对得上
        i = list(px.index).index(d)
        assert 0.8 < px.loc[d, t] * k / px.iloc[i - 1][t] < 1.2
    ok = rebuild(px, splits, divs)
    sys_ = rebuild(px, splits, divs, "sys")
    # 托管行：持仓正确，CSCO 按 30% 扣税，不记应收退税
    cust_cash = ok["cash"]
    pxe = px.loc[BASE]
    mv = lambda pos: r2(sum(pos[t] * pxe[t] for t in TS))
    nav_ok = r2(mv(ok["pos"]) + ok["cash"] + sum(ok["rec"].values()) + ok["refund"])
    nav_sys = r2(mv(sys_["pos"]) + sys_["cash"] + sum(sys_["rec"].values()))
    nav_cus = r2(mv(ok["pos"]) + cust_cash)  # 托管行按收付实现记股利，不记应收
    err = (nav_sys - nav_ok) / nav_ok
    # 只修拆股、不修分红；只修分红、不修 NFLX 的错法
    print(f"[24] 正确 {nav_ok:,.2f} 管理人 {nav_sys:,.2f} 托管 {nav_cus:,.2f} 差错率 {err * 100:.3f}% 退税 {ok['refund']} 应收 {ok['rec']}")
    print(f"     持仓 正确 {ok['pos']}\n          系统 {sys_['pos']}")
    dpos = {t: sys_["pos"][t] - ok["pos"][t] for t in TS if sys_["pos"][t] != ok["pos"][t]}
    part = {t: dpos[t] * pxe[t] for t in dpos}
    div_gap = r2(sum(x["net"] for x in ok["det"]) - sum(x["net"] for x in sys_["det"]))
    print(f"     持仓差 {dpos} 市值 {part} 股利差 {div_gap}")
    assert 0.0025 + 0.0005 < abs(err) < 0.005 - 0.0005
    err_no_nflx = (nav_sys - part["NFLX"] - nav_ok) / nav_ok
    assert abs(err_no_nflx) > 0.0055  # 漏看 NFLX 那笔会算成要公告
    # 托管行股利入账明细
    with open(att / "对账_A05_托管行对账单.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["类别", "日期", "代码", "摘要", "代扣税款(美元)", "实收金额(美元)", "数量或余额"])
        for t in TS:
            wr.writerow(["持仓", BASE, t, "日终托管持股(股)", "", "", ok["pos"][t]])
        for x in [dict(t="TXN", ex="2025-10-31", pay="2025-11-11", gross=r2(POS0["TXN"] * 1.42), bad_tax=r2(POS0["TXN"] * 1.42 * TAX))] + ok["det"]:
            if x["pay"] <= BASE:
                wr.writerow(["股利入账", x["pay"], x["t"], f"现金股利（除息日 {x['ex']}）", f"{x['bad_tax']:.2f}", f"{r2(x['gross'] - x['bad_tax']):.2f}", ""])
        wr.writerow(["现金", BASE, "", "日终托管账户余额(美元)", "", "", f"{cust_cash:.2f}"])
        wr.writerow(["资产净值", BASE, "", "托管行复核值(美元)，股利按收付实现记账", "", "", f"{nav_cus:.2f}"])
    with open(att / "对账_A04_管理人估值表.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["科目", "代码", "数量", "价格(美元)", "金额(美元)"])
        for t in TS:
            wr.writerow(["股票", t, sys_["pos"][t], f"{pxe[t]:.2f}", f"{r2(sys_['pos'][t] * pxe[t]):.2f}"])
        wr.writerow(["现金", "", "", "", f"{sys_['cash']:.2f}"])
        for (t, ed), v in sys_["rec"].items():
            wr.writerow(["应收股利", t, "", "", f"{v:.2f}"])
        wr.writerow(["资产净值", "", "", "", f"{nav_sys:.2f}"])
    # 管理人现金里 CSCO 按 10% 记，等于实收现金 + 应收退税，再扣掉 KLAC 少记的股利
    assert abs(sys_["cash"] - (ok["cash"] + ok["refund"] - div_gap)) < 0.05

    # ---- 输出 ----
    sp_adj = {t: (ok["pos"][t] - POS0[t] - sum(q for d, tt, q in TRADES if tt == t)) for t in TS}
    h_rows = [[t, CO[t], POS0[t], sp_adj[t], sum(q for d, tt, q in TRADES if tt == t), ok["pos"][t], float(pxe[t]), r2(ok["pos"][t] * pxe[t]),
               sys_["pos"][t], sys_["pos"][t] - ok["pos"][t], ok["pos"][t], 0] for t in TS]
    dv_rows = []
    for x in ok["det"]:
        y = next(z for z in divs if (z[0], z[1]) == (x["t"], x["ex"]))
        got = r2(x["gross"] - x["bad_tax"]) if x["pay"] <= BASE else ""
        dv_rows.append([x["t"], x["ex"], x["sh"], y[2], x["per"], x["gross"], x["tax"], x["net"], x["pay"] if x["pay"] <= BASE else "未到账", got,
                        r2(x["bad_tax"] - x["tax"]) if x["pay"] <= BASE else "", "是" if x["pay"] <= BASE else "否（应收）"])
    rec_ok, rec_sys = r2(sum(ok["rec"].values())), r2(sum(sys_["rec"].values()))
    n_rows = [["股票市值", mv(ok["pos"]), mv(sys_["pos"]), mv(ok["pos"])],
              ["现金", ok["cash"], sys_["cash"], cust_cash],
              ["应收股利", rec_ok, rec_sys, 0.0],
              ["应收退税", ok["refund"], 0.0, 0.0],
              ["资产净值", nav_ok, nav_sys, nav_cus],
              ["和重建的差", 0.0, r2(nav_sys - nav_ok), r2(nav_cus - nav_ok)],
              ["差错率(%)", "", round(err * 100, 2), round((nav_cus - nav_ok) / nav_ok * 100, 2)],
              ["处理级别", "", "达到 0.25%，未到 0.50%：更正估值，通报托管行，报告监管，不公告", "托管行补记应收股利和应收退税"]]
    o_rows = []
    for t in TS:
        for d, k in [splits[t]] if t in splits else []:
            o_rows.append([t, d, "拆股", k, "", str(mcp[t].Date[d])])
        for z in divs:
            if z[0] == t:
                o_rows.append([t, z[1], "分红", "", z[2], str(mcp[t].Date[z[1]]), z[3]])
    write_xlsx(ans / "专户估值对账表.xlsx",
               [("持仓重建", ["代码", "名称", "期初股数", "拆股调整", "买卖股数", "2026-10-30股数", "收盘价(美元)", "市值(美元)",
                          "管理人股数", "管理人差异", "托管行股数", "托管行差异"], h_rows),
                ("股利明细", ["代码", "除息日", "享有股数", "在线返回每股(美元)", "实际每股(美元)", "税前(美元)", "应扣税10%(美元)", "税后(美元)", "付息日",
                          "托管行实收(美元)", "多扣税款(美元)", "是否到账"], dv_rows),
                ("净值汇总", ["项目", "重建(美元)", "管理人估值表(美元)", "托管行(美元)"], n_rows),
                ("在线数据", ["代码", "日期", "类型", "拆股比例", "在线返回每股分红", "返回的Date(UTC)", "实际每股分红"], o_rows)],
               notes={"持仓重建": ["拆股调整 = 拆股生效日持股数 × (比例 − 1)，拆股前买卖的股数也要乘比例。"],
                      "股利明细": ["除息日前一交易日日终持股享有分红。2025-10-31 除息的 TXN 一笔期初已记应收，不在本表。",
                               "KLAC 2026-06-12 拆股前的三次分红，在线返回的每股金额是按拆股比例调小后的数，实际每股要乘 10，这样算出的税后金额和托管行实收一致。",
                               "CSCO 四次分红托管行按 30% 扣税，按税收协定应扣 10%，多扣的记应收退税。"],
                      "净值汇总": [f"差错率 = (管理人 − 重建) ÷ 重建 = {pc(err)}。下一步算业绩报酬用重建资产净值 {w2(nav_ok)} 美元。"],
                      "在线数据": [source_line(recs[t]) for t in TS] + ["美股 Date 是美东零点对应的 UTC 时间，日期部分就是交易日。"]})
    write_docx(ans / "专户估值对账报告.docx", "全球科技成长一号 2026-10-30 估值对账报告", [
        ("结论", [f"重建的 2026-10-30 资产净值是 {w2(nav_ok)} 美元。管理人新系统估值表是 {w2(nav_sys)} 美元，多估 {w2(nav_sys - nav_ok)} 美元，差错率 {pc(err)}；"
                "达到 0.25%、没到 0.50%，要更正估值、通报托管行并报告监管，不需要对外公告。",
                f"托管行对账单 {w2(nav_cus)} 美元，持仓和已到账的股利都对，少的 {w2(nav_ok - nav_cus)} 美元有两项：TXN 10-30 除息的应收股利 {w2(rec_ok)} 美元没记（托管行按到账记股利），CSCO 多扣的税款 {w2(ok['refund'])} 美元应记应收退税。"]),
        ("管理人新系统的问题", [
            f"NFLX：2025-11-14 拆股前买入的 300 股没乘 10。正确持股 {ok['pos']['NFLX']:,} 股，系统 {sys_['pos']['NFLX']:,} 股，少 {abs(dpos['NFLX']):,} 股，少估 {w2(abs(part['NFLX']))} 美元。",
            f"KLAC：2026-06-05 拆股前卖出的 300 股没乘 10。正确持股 {ok['pos']['KLAC']:,} 股，系统 {sys_['pos']['KLAC']:,} 股，多 {dpos['KLAC']:,} 股，多估 {w2(part['KLAC'])} 美元。",
            f"KLAC 分红：系统直接用了行情数据里的每股分红，拆股前的 2025-11-17、2026-02-17、2026-05-18 三次被调小成十分之一，拆股后那次又按多出来的股数算；"
            f"股利合计少记 {w2(div_gap)} 美元。",
            "两处持仓错误方向相反，净效果是多估。只看到其中一处，差错率会算错，处理级别也可能判错。"]),
        ("托管行的问题", [f"CSCO 2026-01-02、04-02、07-06、10-02 四次分红按 30% 扣税，按税收协定应扣 10%，合计多扣 {w2(ok['refund'])} 美元。"
                      "托管行要补记应收退税，并办理退税申请。"]),
        ("应收股利", [f"TXN 2026-10-30 除息，10-30 还没到账，税后 {w2(rec_ok)} 美元记应收股利。2025-10-31 除息的那笔期初已经记过，11-11 到账，不能重复算。"]),
        ("数据", ["行情用内部快照的不复权收盘价。拆股、分红通过 US Stocks MCP 的 get_historical_stock_prices 查询 8 只股票近两年的数据，"
                "取 Stock Splits 和 Dividends 两列；拆股前的分红金额按拆股比例还原后和托管行入账一致。"]),
    ])
    return dict(nav=nav_ok, nav_sys=nav_sys, ok=ok, px=px, err=err)


# ---------------- 25 ----------------
def q25(r24):
    att, ans = fresh_dir(D25 / "题目附件"), fresh_dir(D25 / "标准答案附件")
    (D25 / "MCP结果文件").mkdir(exist_ok=True)
    copy_as(D24 / "标准答案附件" / "专户估值对账表.xlsx", att / "专户估值对账表.xlsx")
    copy_as(DOC / "业绩报酬" / "A02_业绩报酬条款.md", att / "报酬_A02_业绩报酬条款.md")
    copy_as(DOC / "业绩报酬" / "A04_计提口径与交付.md", att / "报酬_A04_计提口径与交付.md")
    fn = "报酬_MCP_QQQ日线.json"
    copy_as(RAW / "业绩报酬" / "QQQ.json", D25 / "MCP结果文件" / fn)
    copy_as(D25 / "MCP结果文件" / fn, att / fn)
    navs = r24["ok"]["navs"]
    units_1031 = r2(navs[START] / UNIT_1031)
    u1 = r2(round(units_1031 * 0.7, -2))
    u2 = r2(units_1031 - u1)
    unit_1031 = r4(navs[START] / (u1 + u2))
    unit_sub = r4(navs["pre_sub"] / (u1 + u2))
    u3 = r2(SUB[1] / unit_sub)
    base = {"L1": ("2025-10-31", unit_1031), "L2": ("2025-02-10", L2_NAV), "L3": ("2026-03-16", unit_sub)}
    units = {"L1": u1, "L2": u2, "L3": u3}
    with open(att / "报酬_A01_份额登记.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["份额编号", "投资者", "申购确认日", "申购单位净值", "当前份额", "上次实际计提业绩报酬日", "上次计提日单位净值", "备注"])
        wr.writerow(["L1", LOTS[0][1], "2024-03-15", "1.0000", f"{u1:.2f}", "2025-10-31", f"{unit_1031:.4f}", "2025-10-31 计提后份额"])
        wr.writerow(["L2", LOTS[1][1], "2025-02-10", f"{L2_NAV:.4f}", f"{u2:.2f}", "", "", "2025-10-31 单位净值低于高水位，未计提"])
        wr.writerow(["L3", LOTS[2][1], "2026-03-16", f"{unit_sub:.4f}", f"{u3:.2f}", "", "", f"申购金额 {SUB[1]:,.2f} 美元"])
        wr.writerow(["", "历史单位净值", "2025-10-31", f"{unit_1031:.4f}", "", "", "", "托管行复核确认"])
        wr.writerow(["", "历史单位净值", "2026-03-16", f"{unit_sub:.4f}", "", "", "", "托管行复核确认"])
    # ---- 只用附件重算 ----
    wb = load_workbook(att / "专户估值对账表.xlsx", data_only=True)
    nav = next(r[1] for r in wb["净值汇总"].iter_rows(min_row=2, values_only=True) if r[0] == "资产净值")
    nav_sys = next(r[2] for r in wb["净值汇总"].iter_rows(min_row=2, values_only=True) if r[0] == "资产净值")
    a01 = pd.read_csv(att / "报酬_A01_份额登记.csv", dtype=str)
    rec, q = load_mcp_prices(att / fn, 0)
    qadj = q.Close
    tot_u = r2(u1 + u2 + u3)

    def calc(nav_v, price=qadj, override=None):
        unit = r4(nav_v / tot_u)
        out = []
        for k in ["L1", "L2", "L3"]:
            bd, bu = base[k]
            if override and k in override:
                bd, bu = override[k]
            rb = float(price[BASE] / price[bd] - 1)
            ex = unit - bu * (1 + rb)
            take = unit > bu and ex > 0
            fee = r2(ex * units[k] * FEE_RATE) if take else 0.0
            ded = r2(fee / unit) if take else 0.0
            out.append(dict(k=k, bd=bd, bu=bu, rb=rb, unit=unit, ex=ex, take=take, fee=fee, ded=ded, after=r2(units[k] - ded)))
        return unit, out
    unit, res = calc(nav)
    unit_s, res_s = calc(nav_sys, override={"L2": ("2025-10-31", unit_1031)})  # 管理人初算：用错的净值，L2 没计提也把基准日挪到 2025-10-31
    with open(att / "报酬_A03_管理人初算.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["份额编号", "资产净值(美元)", "期末单位净值", "基准日", "基准单位净值", "基准收益率", "每份超额收益", "业绩报酬(美元)"])
        for x in res_s:
            wr.writerow([x["k"], f"{nav_sys:.2f}", f"{x['unit']:.4f}", x["bd"], f"{x['bu']:.4f}", pc(x["rb"]), f"{x['ex']:.4f}", f"{x['fee']:.2f}"])
    fee_tot = r2(sum(x["fee"] for x in res))
    ded_tot = r2(sum(x["ded"] for x in res))
    nav_after = r2(nav - fee_tot)
    u_after = r2(tot_u - ded_tot)
    unit_after = r4(nav_after / u_after)
    for x in res:
        print(f"[25] {x['k']} 基准 {x['bd']} {x['bu']:.4f} QQQ {x['rb'] * 100:.2f}% 期末 {x['unit']:.4f} 超额 {x['ex']:.4f} 计提 {x['take']} 报酬 {x['fee']:,.2f} 扣 {x['ded']:,.2f}")
    print(f"     合计 {fee_tot:,.2f} 计提后净值 {nav_after:,.2f} 份额 {u_after:,.2f} 单位 {unit_after}；初算 {sum(x['fee'] for x in res_s):,.2f}")
    # 价格收益率的错法
    for x in res:
        assert abs(x["ex"]) > 0.01 or not x["take"]
    l_rows = [[x["k"], LOTS[i][1], units[x["k"]], x["bd"], x["bu"], x["bu"], round(x["rb"] * 100, 2), x["unit"], round(x["ex"], 4), "是" if x["take"] else "否",
               x["fee"], x["ded"], x["after"], BASE if x["take"] else x["bd"], x["unit"] if x["take"] else x["bu"]] for i, x in enumerate(res)]
    fee_s = r2(sum(x["fee"] for x in res_s))
    s_rows = [["计提日资产净值(美元)", nav], ["计提前总份额", tot_u], ["期末单位净值", unit], ["业绩报酬合计(美元)", fee_tot], ["扣减份额合计", ded_tot],
              ["计提后资产净值(美元)", nav_after], ["计提后总份额", u_after], ["计提后单位净值", unit_after],
              ["管理人初算业绩报酬(美元)", fee_s], ["和初算的差(美元)", r2(fee_tot - fee_s)]]
    o_rows = [[d, str(q.Date[d]), float(q.Close[d])] for d in sorted({base[k][0] for k in base} | {BASE}) if d in q.index]
    write_xlsx(ans / "业绩报酬计提表.xlsx",
               [("逐笔计提", ["份额编号", "投资者", "份额", "基准日", "基准单位净值", "高水位", "QQQ基准收益率(%)", "期末单位净值", "每份超额收益", "是否计提",
                          "业绩报酬(美元)", "扣减份额", "计提后份额", "新的基准日", "新的高水位"], l_rows),
                ("计提汇总", ["项目", "数值"], s_rows),
                ("在线数据", ["交易日", "返回的Date(UTC)", "QQQ收盘价(按分红调整)"], o_rows)],
               notes={"逐笔计提": ["每份超额收益 = 期末单位净值 − 基准单位净值 × (1 + QQQ 含分红收益率)。期末单位净值高于高水位且超额收益为正才计提。"],
                      "计提汇总": ["初算用了管理人估值表的资产净值，并把 L2 的基准日挪到 2025-10-31；L2 那天没有实际计提，基准日仍是申购确认日 2025-02-10，高水位仍是 1.4100。"],
                      "在线数据": [source_line(rec), "Close 是按分红调整后的收盘价，可以直接算含分红收益率。"]})
    write_docx(ans / "业绩报酬计提说明.docx", "全球科技成长一号 2026-10-30 业绩报酬计提说明", [
        ("结论", [f"计提日资产净值 {w2(nav)} 美元（对账后），总份额 {w2(tot_u)}，期末单位净值 {unit:.4f}。业绩报酬合计 {w2(fee_tot)} 美元，扣减份额 {w2(ded_tot)}。"
                f"计提后资产净值 {w2(nav_after)} 美元，总份额 {w2(u_after)}，单位净值 {unit_after:.4f}。"]),
        ("逐笔", [f"{x['k']} {LOTS[i][1]}：基准日 {x['bd']}，基准单位净值 {x['bu']:.4f}，同期 QQQ 含分红 {pc(x['rb'])}，每份超额收益 {x['ex']:.4f}。"
                + (f"计提 {w2(x['fee'])} 美元，扣减份额 {w2(x['ded'])}，新的基准日 {BASE}、高水位 {x['unit']:.4f}。" if x["take"] else
                   ("期末单位净值高于高水位，但跑输 QQQ，不计提，基准日和高水位不变。" if x["unit"] > x["bu"] else "期末单位净值没有超过高水位，不计提。"))
                for i, x in enumerate(res)]),
        ("和初算的差异", [f"管理人初算 {w2(fee_s)} 美元，比正确的{'多' if fee_s > fee_tot else '少'} {w2(abs(fee_s - fee_tot))} 美元。原因有两处：",
                       f"一是用了管理人估值表的资产净值 {w2(nav_sys)} 美元，没有用对账后的 {w2(nav)} 美元；",
                       "二是把 L2 的基准日挪到了 2025-10-31。L2 那天单位净值低于高水位，没有实际计提，按条款基准日仍是申购确认日 2025-02-10，高水位仍是 1.4100。"]),
        ("数据", ["QQQ 通过 US Stocks MCP 查询，Close 是按分红调整后的价格，用来算含分红收益率；美股 Date 的日期部分就是交易日。"]),
    ])
    return res


if __name__ == "__main__":
    r24 = q24()
    q25(r24)
