#!/usr/bin/env python3
"""打包「多策略稳健1号」雪球凭证的三道题（19 存续排查 → 20 报价回测比选 → 21 认购额度与期初要素）。

20 读 19 的标准答案《存续雪球凭证排查表.xlsx》，21 读 19 的排查表和 20 的《11月雪球报价回测表.xlsx》。
2026-11-26 返修起前轮标答不再放进后一轮的题目附件，后一轮直接读前轮标准答案附件计算；题目附件里的 B 系列背景材料
由 补充材料/19|20|21/生成补充材料.py 生成，这里原样复制，并用 leak_check 检查不含本题和前轮要算的关键数字。

中证500ETF 的不复权日线是 fetch_longport.py 拉的内部快照；中证1000ETF 和十年回测用的日线、起始日收盘价
都是 fetch_新题.py 通过 US Stocks MCP 查回来的。台账、报价、估值表、券商额度和各条门槛是按题目需要拟的。
"""
from __future__ import annotations

import bisect
import calendar
import csv
import json
import math
from pathlib import Path

import pandas as pd
from openpyxl import load_workbook

from build_common import OUT, copy_as, copy_materials, fresh_dir, load_mcp_prices, source_line, write_docx, write_xlsx

HERE = Path(__file__).resolve().parent
RAW = HERE / "新题数据"
LP = RAW / "雪球回测_longport"
DOC = HERE / "新题口径"
BASE, NEW = "2026-10-30", "2026-11-02"
SNAP0 = "2025-07-01"
NAME = {"510500": "中证500ETF", "512100": "中证1000ETF"}
DIV500 = [("2024-05-16", "2024-05-17", 0.087), ("2025-01-15", "2025-01-16", 0.091),
          ("2026-01-15", "2026-01-16", 0.062), ("2026-07-14", "2026-07-15", 0.149)]
# 编号, 发行人, 标的, 结构, 敲出水平, 每月降幅, 下限, 敲入, 票息, 起始日, 名义本金(万元)
NOTES = [
    ("XQ2509-01", "中信证券", "510500", "经典", 1.00, 0.000, 1.00, 0.75, 0.132, "2025-09-12", 3000),
    ("XQ2512-01", "华泰证券", "512100", "降敲", 1.00, 0.005, 0.90, 0.75, 0.156, "2025-12-22", 2000),
    ("XQ2603-01", "招商证券", "512100", "经典", 1.00, 0.000, 1.00, 0.75, 0.148, "2026-03-05", 2000),
    ("XQ2604-01", "国泰海通", "510500", "降敲", 1.00, 0.005, 0.90, 0.75, 0.119, "2026-04-16", 3000),
    ("XQ2605-01", "华泰证券", "512100", "经典", 1.00, 0.000, 1.00, 0.75, 0.152, "2026-05-19", 2000),
    ("XQ2606-01", "中信证券", "510500", "经典", 1.00, 0.000, 1.00, 0.75, 0.126, "2026-06-03", 4000),
    ("XQ2606-02", "中金公司", "510500", "经典", 1.00, 0.000, 1.00, 0.75, 0.129, "2026-06-25", 3000),
    ("XQ2607-01", "招商证券", "512100", "经典", 1.00, 0.000, 1.00, 0.75, 0.155, "2026-07-06", 2000),
    ("XQ2607-02", "国泰海通", "510500", "降敲", 1.00, 0.005, 0.90, 0.70, 0.104, "2026-07-20", 3000),
    ("XQ2608-01", "广发证券", "512100", "降敲", 1.00, 0.005, 0.90, 0.75, 0.141, "2026-08-13", 3000),
]
QUOTES = [
    ("Q1", "中信证券", "510500", "经典", 1.00, 0.000, 1.00, 0.75, 0.128),
    ("Q2", "华泰证券", "512100", "经典", 1.00, 0.000, 1.00, 0.75, 0.165),
    ("Q3", "国泰海通", "510500", "降敲", 1.00, 0.005, 0.90, 0.70, 0.098),
    ("Q4", "招商证券", "512100", "降敲", 1.00, 0.005, 0.90, 0.65, 0.120),
    ("Q5", "中金公司", "510500", "降敲", 1.00, 0.010, 0.80, 0.75, 0.084),
    ("Q6", "广发证券", "512100", "降敲", 1.00, 0.005, 0.90, 0.75, 0.136),
]
CAP = {"Q1": 5000, "Q2": 3000, "Q3": 5000, "Q4": 3000, "Q5": 4000, "Q6": 5000}
TENOR, LOCK = 24, 3
KI_LINE, TH_LOW, TH_HIGH = 0.50, 0.15, 0.08
L_ALL, L_ETF, L_ISS, L_CASH, LOT, MIN_TICKET = 0.30, 0.15, 0.06, 0.08, 100, 1000

D19 = OUT / "题目" / "19_雪球凭证存续排查"
D20 = OUT / "题目" / "20_雪球报价回测比选"
D21 = OUT / "题目" / "21_雪球凭证认购额度"
pc = lambda x, n=2: f"{x * 100:.{n}f}%"
w2 = lambda x: f"{x:,.2f}"


def obs_day(days: list[str], start: str, k: int) -> str | None:
    """起始日后第 k 个月的观察日：对应日，当月没有就用月末，不是交易日顺延。"""
    y0, m0, d0 = map(int, start.split("-"))
    y, m = y0 + (m0 - 1 + k) // 12, (m0 - 1 + k) % 12 + 1
    tgt = f"{y:04d}-{m:02d}-{min(d0, calendar.monthrange(y, m)[1]):02d}"
    i = bisect.bisect_left(days, tgt)
    return days[i] if i < len(days) else None


def level(ko, step, floor, k):
    return max(floor, ko - step * (k - LOCK))


def ledger_rows():
    return [dict(code=n[0], iss=n[1], und=n[2], kind=n[3], ko=n[4], step=n[5], floor=n[6], ki=n[7], cpn=n[8], start=n[9], amt=n[10])
            for n in NOTES]


# ========== 2026-11-26 最终质检返修：补充的背景、历史和版本材料 ==========
# B 系列材料由 补充材料/19|20|21/生成补充材料.py 生成（共用 补充材料/19/雪球公共.py），生成结果提交在各目录里，
# 这里用 copy_materials 原样复制进题目附件，打包不联网。行情是真实数据（LongPort、US Stocks MCP），人员和往来是拟的。
# 下面的 leak_check 在每题算完标准答案后检查 B 系列材料，不能出现本题和前轮要算的关键数字、结论和逐张状态。
def _att_text(p: Path) -> str:
    import re
    import zipfile
    if p.suffix in (".md", ".csv"):
        return p.read_text(encoding="utf-8")
    with zipfile.ZipFile(p) as z:
        if p.suffix == ".docx":
            return re.sub(r"<[^>]+>", "", z.read("word/document.xml").decode().replace("</w:p>", "\n"))
        return "\n".join(re.sub(r"<[^>]+>", " ", z.read(n).decode()) for n in z.namelist()
                         if n.startswith(("xl/sharedStrings", "xl/worksheets/sheet")))


def lit(*vals: str) -> str:
    """几个字面值的正则，前后不能紧挨数字（前面也不能是小数点或千分位逗号）。"""
    import re
    return r"(?<![\d.,])(?:" + "|".join(re.escape(v) for v in vals) + r")(?![\d])"


def wan(x: float, nd: int = 2) -> str:
    """金额的两种写法：带千分位和不带。"""
    return lit(f"{x:,.{nd}f}", f"{x:.{nd}f}") if nd else lit(f"{x:,.0f}", f"{x:.0f}")


def leak_check(att: Path, pats: list[tuple[str, str]], skip_in: dict[str, str] | None = None) -> None:
    """pats: [(说明, 正则)]，说明以「~」开头的只查 md、docx 正文。
    skip_in: {说明: 文件名关键词}，该项不查文件名含关键词的材料（如观察日历本来就列观察日）。"""
    import re
    bad = []
    for p in sorted(att.iterdir()):
        if not re.search(r"_B\d", p.name):
            continue
        t = _att_text(p)
        for why, rx in pats:
            if skip_in and why in skip_in and skip_in[why] in p.name:
                continue
            if why.startswith("~") and p.suffix not in (".md", ".docx"):  # 只查正文：表格里的行情数字容易撞上短小数
                continue
            m = re.search(rx, t)
            if m:
                bad.append(f"{p.name}：{why}「{t[max(0, m.start() - 12):m.end() + 12]}」")
    assert not bad, "B 系列材料泄露关键数字：\n" + "\n".join(bad)


# ---------------- 19 ----------------
def restore_raw(adj: pd.Series, div: dict[str, float]) -> pd.Series:
    """按 Dividends 把前复权收盘价还原成不复权，从后往前一段一段除回去。"""
    days = list(adj.index)
    out, f = {}, 1.0
    for i in range(len(days) - 1, -1, -1):
        d = days[i]
        out[d] = adj[d] / f
        if d in div and i > 0:
            rp = adj[days[i - 1]] / f + div[d]
            f *= (rp - div[d]) / rp
    return pd.Series(out).sort_index().round(3)


def run_note(n: dict, px: pd.Series, divs: dict[str, float], days: list[str]):
    s0, fac = n["s0"], 1.0
    obs = {obs_day(days, n["start"], k): k for k in range(LOCK, TENOR + 1)}
    obs.pop(None, None)
    ki, ev, prev = None, [], n["start"]
    gap_ko, gap_ki = 9.0, 9.0
    for d in days[days.index(n["start"]) + 1:]:
        if d > BASE:
            break
        if d in divs:
            fac *= (px[prev] - divs[d]) / px[prev]
        c = float(px[d])
        kip = round(s0 * n["ki"] * fac, 4)
        if d in obs:
            k = obs[d]
            kop = round(s0 * level(n["ko"], n["step"], n["floor"], k) * fac, 4)
            ev.append([d, k, kop, c, c >= kop])
            gap_ko = min(gap_ko, abs(c - kop))
            if c >= kop:
                return dict(status="已敲出", ko=d, ki=ki, ev=ev, fac=fac, kip=kip, gap_ko=gap_ko, gap_ki=gap_ki)
        if ki is None:
            gap_ki = min(gap_ki, abs(c - kip))
            if c < kip:
                ki = (d, c, kip)
        prev = d
    return dict(status="存续已敲入" if ki else "存续未敲入", ko=None, ki=ki, ev=ev, fac=fac, kip=kip, gap_ko=gap_ko, gap_ki=gap_ki)


def q19():
    att, ans = fresh_dir(D19 / "题目附件"), fresh_dir(D19 / "标准答案附件")
    (D19 / "MCP结果文件").mkdir(exist_ok=True)
    mcp = "排查_MCP_中证1000ETF日线.json"
    copy_as(RAW / "雪球排查" / "512100.SS.json", D19 / "MCP结果文件" / mcp)
    copy_as(D19 / "MCP结果文件" / mcp, att / mcp)
    lp = pd.DataFrame(json.load(open(LP / "510500.SH_noadj.json", encoding="utf-8")))
    lp = lp[(lp.date >= SNAP0) & (lp.date <= BASE)]
    with open(att / "排查_A02_中证500ETF日线.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["date", "code", "open", "high", "low", "close", "volume"])
        for r in lp.itertuples():
            wr.writerow([r.date, "510500.SH", r.open, r.high, r.low, r.close, r.volume])
    with open(att / "排查_A03_中证500ETF除息记录.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["权益登记日", "除息日", "每份现金红利(元)"])
        for a, b, v in DIV500:
            wr.writerow([a, b, f"{v:.3f}"])
    copy_as(DOC / "雪球排查" / "A04_排查口径与交付.md", att / "排查_A04_排查口径与交付.md")
    mats19 = copy_materials("19", att)  # 最终质检返修补充的背景、历史和版本材料（排查_B01~B16）
    raw500 = lp.set_index("date").close.astype(float)
    led = ledger_rows()
    lp1000 = pd.DataFrame(json.load(open(LP / "512100.SH_noadj.json", encoding="utf-8"))).set_index("date").close.astype(float)
    with open(att / "排查_A01_雪球凭证认购台账.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["凭证编号", "发行人", "挂钩标的代码", "挂钩标的", "结构", "起始日", "期限(月)", "锁定期(月)", "敲出水平", "每月降幅",
                     "敲出水平下限", "敲入水平", "年化票息", "名义本金(万元)", "期初价格(元)"])
        for n in led:
            s0 = (raw500 if n["und"] == "510500" else lp1000)[n["start"]]
            wr.writerow([n["code"], n["iss"], n["und"], NAME[n["und"]], n["kind"], n["start"], TENOR, LOCK, pc(n["ko"], 0), pc(n["step"], 1),
                         pc(n["floor"], 0), pc(n["ki"], 0), pc(n["cpn"]), n["amt"], f"{s0:.3f}"])

    # 只用附件重算
    a01 = pd.read_csv(att / "排查_A01_雪球凭证认购台账.csv", dtype=str)
    px500 = pd.read_csv(att / "排查_A02_中证500ETF日线.csv", dtype={"date": str}).set_index("date").close
    div500 = {r["除息日"]: float(r["每份现金红利(元)"]) for _, r in pd.read_csv(att / "排查_A03_中证500ETF除息记录.csv", dtype=str).iterrows()}
    days = list(px500.index)
    rec, m = load_mcp_prices(att / mcp, 8)
    m = m[m.Close.notna()]
    adj1000 = m.Close
    div1000 = {d: float(v) for d, v in m.Dividends.items() if v}
    raw1000 = restore_raw(adj1000, div1000)
    use = [d for d in days if d >= "2025-12-01"]
    miss = [d for d in days if d not in raw1000.index]
    extra = [d for d in raw1000.index if SNAP0 <= d <= BASE and d not in days]
    assert not extra and all(d < "2025-12-01" for d in miss)
    assert (raw1000.reindex(use) - lp1000.reindex(use)).abs().max() < 1e-9  # 还原后和内部不复权一致（只作出题核对）
    px = {"510500": px500, "512100": raw1000.reindex(days)}
    divs = {"510500": div500, "512100": div1000}
    res = []
    for r, n in zip(a01.itertuples(index=False), led):
        n = dict(n, s0=float(r[14]))
        assert abs(px[n["und"]][n["start"]] - n["s0"]) < 1e-9
        o = run_note(n, px[n["und"]], divs[n["und"]], days)
        o0 = run_note(n, px[n["und"]], {}, days)  # 错法：不做除息调整
        n.update(o=o, o0=o0)
        if n["und"] == "512100":  # 直接用前复权价、期初取前复权收盘价，结果应当一样
            a = dict(n, s0=float(adj1000[n["start"]]))
            oa = run_note(a, adj1000.round(4).reindex(days), {}, days)
            assert (oa["status"], oa["ko"], (oa["ki"] or [None])[0]) == (o["status"], o["ko"], (o["ki"] or [None])[0])
        res.append(n)
    base_px = {u: float(px[u][BASE]) for u in px}
    for n in res:
        o = n["o"]
        n["adj_s0"] = round(n["s0"] * o["fac"], 4)
        n["ko_amt"] = round(n["amt"] * n["cpn"] * (pd.Timestamp(o["ko"]) - pd.Timestamp(n["start"])).days / 365, 2) if o["ko"] else None
        n["ko_days"] = (pd.Timestamp(o["ko"]) - pd.Timestamp(n["start"])).days if o["ko"] else None
        n["loss"] = round(n["amt"] * max(0.0, 1 - base_px[n["und"]] / (n["s0"] * o["fac"])), 2) if o["status"] == "存续已敲入" else 0.0
    alive = [n for n in res if n["o"]["status"] != "已敲出"]
    tot = sum(n["amt"] for n in alive)
    ki_amt = sum(n["amt"] for n in alive if n["o"]["status"] == "存续已敲入")
    ratio = ki_amt / tot
    by_und = {u: sum(n["amt"] for n in alive if n["und"] == u) for u in NAME}
    issuers = list(dict.fromkeys(n["iss"] for n in res))
    by_iss = {i: sum(n["amt"] for n in alive if n["iss"] == i) for i in issuers}
    loss = round(sum(n["loss"] for n in alive), 2)
    kid = lambda o: o["ki"][0] if o["ki"] else None
    changed = [n for n in res if (n["o"]["status"], n["o"]["ko"], kid(n["o"])) != (n["o0"]["status"], n["o0"]["ko"], kid(n["o0"]))]

    print(f"[19] A02 {len(px500)} 行，MCP 512100 {len(m)} 行，对不上 {miss}")
    for n in res:
        o = n["o"]
        print(f"     {n['code']} {n['und']} {n['start']} {o['status']} 敲出{o['ko']} 敲入{o['ki'] and o['ki'][0]} 系数{o['fac']:.6f} "
              f"最小差距 敲出{o['gap_ko']:.4f} 敲入{o['gap_ki']:.4f} | 不调整：{n['o0']['status']} {n['o0']['ko']}")
    print(f"     存续 {tot} 万，敲入 {ki_amt} 万，占比 {pc(ratio)}，潜在亏损 {loss}；按标的 {by_und}；按发行人 {by_iss}")
    print(f"     除息调整改变判断：{[n['code'] for n in changed]}")
    w_alive = [n for n in res if n["o0"]["status"] != "已敲出"]
    w_ratio = sum(n["amt"] for n in w_alive if n["o0"]["status"] == "存续已敲入") / sum(n["amt"] for n in w_alive)
    print(f"     错法（不做除息调整）敲入占比 {pc(w_ratio)}")
    assert [n["code"] for n in changed] == ["XQ2512-01", "XQ2604-01", "XQ2606-01", "XQ2606-02"]
    assert ratio <= KI_LINE - 0.05 and w_ratio > KI_LINE
    for n in res:  # 每个判断离门槛至少 2 个最小价位
        assert n["o"]["gap_ko"] >= 0.002 and n["o"]["gap_ki"] >= 0.002, n["code"]

    # B 系列材料不能出现本题要算的关键数字、结论和逐张状态（历史期间的数字可以有）
    pats19 = [("存续名义本金", wan(tot, 0)), ("已敲入名义本金", lit(f"{ki_amt:,}万", f"{ki_amt}万")), ("敲入占比", lit(f"{ratio * 100:.2f}")),
              ("潜在亏损合计", wan(loss)), ("错法敲入占比", lit(f"{w_ratio * 100:.2f}"))]
    for n in res:
        o = n["o"]
        pats19.append((f"{n['code']} 状态", rf"{n['code']}[^。\n|]{{0,20}}(已敲出|已敲入|存续未敲入|存续已敲入|未敲入|敲出于|敲入于)"))
        if n["ko_amt"] is not None:
            pats19.append((f"{n['code']} 敲出收益", wan(n["ko_amt"])))
        if n["loss"]:
            pats19.append((f"{n['code']} 潜在亏损", wan(n["loss"])))
        if o["ko"]:
            pats19.append(("敲出日", lit(o["ko"])))
        if o["ki"] and o["ki"][0] != BASE:
            pats19.append(("敲入日", lit(o["ki"][0])))
        if abs(o["fac"] - 1) > 1e-12:
            pats19.append(("除息调整系数", lit(f"{o['fac']:.6f}", f"{o['fac']:.5f}")))
        if not o["ko"]:
            pats19.append((f"{n['code']} 当前敲入价格", lit(f"{o['kip']:.4f}")))
        if n["o0"]["ki"]:
            pats19.append((f"{n['code']} 不调整时的敲入价格", lit(f"{n['o0']['ki'][2]:.4f}")))
    leak_check(att, pats19, skip_in={"敲出日": "观察日历"})

    s_rows = []
    for n in res:
        o = n["o"]
        s_rows.append([n["code"], n["iss"], n["und"], n["kind"], n["start"], n["amt"], o["status"], o["ko"] or "", n["ko_days"] or "",
                       n["ko_amt"] if n["ko_amt"] is not None else "", o["ki"][0] if o["ki"] else "", o["ki"][1] if o["ki"] else "",
                       o["ki"][2] if o["ki"] else "", round(o["fac"], 6), n["s0"], n["adj_s0"],
                       "" if o["ko"] else o["kip"], "" if o["ko"] else base_px[n["und"]], "" if o["ko"] else n["loss"]])
    ob_rows = []
    for n in alive:
        oct_ev = [e for e in n["o"]["ev"] if e[0] >= "2026-10-01"]
        for e in oct_ev:
            ob_rows.append([n["code"], n["und"], e[0], e[1], e[2], e[3], "是" if e[4] else "否", ""])
        if not oct_ev:
            ob_rows.append([n["code"], n["und"], "", "", "", "", "", f"10月还在锁定期，第一个观察日是 {n['start'][:4]}-11-{n['start'][8:]}"])
    h_rows = [["合计", "存续名义本金", tot, ""]]
    h_rows += [["挂钩标的", f"{u} {NAME[u]}", by_und[u], ""] for u in NAME]
    h_rows += [["发行人", i, by_iss[i], "" if by_iss[i] else "存续里没有"] for i in issuers]
    h_rows += [["敲入", "已敲入名义本金", ki_amt, "、".join(n["code"] for n in alive if n["o"]["status"] == "存续已敲入")],
               ["敲入", "敲入占比(%)", round(ratio * 100, 2), ""], ["敲入", "潜在亏损合计", loss, f"按 {BASE} 收盘价"]]
    o_rows = [[d, float(adj1000[d]), float(raw1000[d]), "除息" if d in div1000 else ""] for d in sorted(set(
        [n["start"] for n in res if n["und"] == "512100"] + [BASE] + list(div1000) +
        [days[days.index(d) - 1] for d in div1000 if d in days] +
        [e[0] for n in res if n["und"] == "512100" for e in n["o"]["ev"]] +
        [n["o"]["ki"][0] for n in res if n["und"] == "512100" and n["o"]["ki"]])) if d >= "2025-12-01"]
    write_xlsx(ans / "存续雪球凭证排查表.xlsx",
               [("凭证状态", ["凭证编号", "发行人", "挂钩标的", "结构", "起始日", "名义本金(万元)", "状态", "敲出日", "持有天数", "敲出收益(万元)",
                          "敲入日", "敲入当日收盘价", "敲入价格", "除息调整系数", "期初价格", "调整后期初价格", "当前敲入价格", "基准日收盘价", "潜在亏损(万元)"], s_rows),
                ("10月观察", ["凭证编号", "挂钩标的", "观察日", "第几个月", "敲出价格", "收盘价", "是否敲出", "说明"], ob_rows),
                ("存续汇总", ["类别", "项目", "金额(万元)", "备注"], h_rows),
                ("在线数据", ["交易日", "在线收盘价(前复权)", "还原后不复权收盘价", "备注"], o_rows)],
               notes={"凭证状态": [f"基准日 {BASE}。除息调整系数是截至敲出日或基准日的连乘系数，不取整；调整后的价格保留 4 位小数。",
                               "敲出收益 = 名义本金 × 年化票息 × 持有天数 ÷ 365。潜在亏损 = 名义本金 × (1 − 基准日收盘价 ÷ 调整后期初价格)。"],
                      "存续汇总": [f"敲入占比 = {ki_amt} ÷ {tot} = {pc(ratio)}。"],
                      "在线数据": [source_line(rec), f"返回 {len(m)} 行（去掉最后一行空收盘价），{m.index[0]} 至 {m.index[-1]}。Date 是 UTC 16:00，加 8 小时后的日期是交易日。",
                               "Close 是按分红前复权的价格，Dividends 列有 2025-01-15 每份 0.037 元、2026-01-19 每份 0.041 元两次除息。从后往前按除息日前一日收盘价还原成不复权价，和台账期初价格一致。",
                               "和 A02 比，在线数据缺 " + "、".join(miss) + "。这一天早于中证1000ETF 所有凭证的起始日，不影响判断。"]})
    ko_n = [n for n in res if n["o"]["status"] == "已敲出"]
    ki_n = [n for n in alive if n["o"]["status"] == "存续已敲入"]
    ok_n = [n for n in alive if n["o"]["status"] == "存续未敲入"]
    write_docx(ans / "存续雪球凭证排查说明.docx", "多策略稳健1号 雪球凭证10月末存续排查说明", [
        ("结论", [f"台账 {len(res)} 张凭证，{len(ko_n)} 张已经敲出，{len(alive)} 张存续，存续名义本金 {tot:,} 万元。"
                f"存续里 {len(ki_n)} 张已敲入，名义本金 {ki_amt:,} 万元，敲入占比 {pc(ratio)}；按 {BASE} 收盘价估的潜在亏损合计 {w2(loss)} 万元。"]),
        ("已敲出", [f"{n['code']}（{n['iss']}，{NAME[n['und']]}）{n['o']['ko']} 敲出，持有 {n['ko_days']} 天，敲出收益 {w2(n['ko_amt'])} 万元。" for n in ko_n]),
        ("已敲入", [f"{n['code']}（{n['iss']}，{NAME[n['und']]}，{n['amt']:,} 万元）{n['o']['ki'][0]} 收盘 {n['o']['ki'][1]:.3f}，低于敲入价格 {n['o']['ki'][2]:.4f}；"
                 f"基准日收盘 {base_px[n['und']]:.3f}，潜在亏损 {w2(n['loss'])} 万元。" for n in ki_n]),
        ("存续未敲入", [f"{n['code']}（{n['iss']}，{NAME[n['und']]}，{n['amt']:,} 万元）当前敲入价格 {n['o']['kip']:.4f}，基准日收盘 {base_px[n['und']]:.3f}。" for n in ok_n]
         + ["10 月各存续凭证的观察日都没有敲出，明细见排查表「10月观察」。"]),
        ("除息调整改变了判断的凭证", [
            "XQ2512-01：中证1000ETF 2026-01-19 除息，系数 {:.6f}。调整后 {} 敲出；不调整要到 {} 才敲出，敲出收益会多算。".format(
                res[1]["o"]["fac"], res[1]["o"]["ko"], res[1]["o0"]["ko"]),
            "XQ2604-01：中证500ETF 2026-07-15 除息，系数 {:.6f}。调整后 {} 已经敲出；不调整的话到基准日还算存续。".format(res[3]["o"]["fac"], res[3]["o"]["ko"]),
            "XQ2606-01：同一次除息，调整后敲入价格 {:.4f}，基准日收盘 {:.3f} 没有跌破；不调整的话敲入价格是 {:.4f}，会被误判为 {} 敲入。".format(
                res[5]["o"]["kip"], base_px["510500"], res[5]["o0"]["kip"], res[5]["o0"]["ki"][0]),
            "XQ2606-02：同一次除息，状态不变，都是存续已敲入，但敲入日不同。调整后敲入价格 {:.4f}，{} 收盘 {:.3f} 跌破；不调整是 {:.4f}，会提前到 {} 就算敲入。".format(
                res[6]["o"]["kip"], res[6]["o"]["ki"][0], res[6]["o"]["ki"][1], res[6]["o0"]["ki"][2], res[6]["o0"]["ki"][0])]),
        ("存续分布", ["按挂钩标的：" + "，".join(f"{NAME[u]} {by_und[u]:,} 万元" for u in NAME) + "。",
                  "按发行人：" + "，".join(f"{i} {by_iss[i]:,} 万元" for i in issuers if by_iss[i]) + "。"]),
        ("数据", ["中证500ETF 用内部行情快照和除息记录。中证1000ETF 日线通过 US Stocks MCP 查询（数据来自 Yahoo Finance，2026-11-19 查询），代码 512100.SS，该数据源是前复权价，"
                "按分红记录还原成不复权价后和台账期初价格一致；在线数据缺 " + "、".join(miss) + "，不影响任何凭证。"]),
    ])
    return dict(res=res, ratio=ratio, tot=tot, by_und=by_und, by_iss=by_iss, pats=pats19)


# ---------------- 20 ----------------
def read_q19(path: Path):
    wb = load_workbook(path, data_only=True)
    rows = [r for r in wb["存续汇总"].iter_rows(min_row=2, values_only=True) if r and r[0]]
    get = {(r[0], r[1]): r[2] for r in rows}
    und = {k[1].split()[0]: v for k, v in get.items() if k[0] == "挂钩标的"}
    iss = {k[1]: v for k, v in get.items() if k[0] == "发行人"}
    return dict(tot=get[("合计", "存续名义本金")], ratio=get[("敲入", "敲入占比(%)")] / 100, und=und, iss=iss)


def backtest(px: pd.Series, q: dict, end: str = BASE):
    days = list(px.index)
    idx = {d: i for i, d in enumerate(days)}
    out = []
    for st in days:
        ob = [(k, obs_day(days, st, k)) for k in range(LOCK, TENOR + 1)]
        mat = ob[-1][1]
        if mat is None or mat > end:
            continue
        obs = dict((d, k) for k, d in ob)
        s0, hit, res = px[st], False, None
        for d in days[idx[st] + 1: idx[mat] + 1]:
            c = px[d]
            if d in obs and c >= s0 * level(q["ko"], q["step"], q["floor"], obs[d]):
                res = ("敲出", d)
                break
            if c < s0 * q["ki"]:
                hit = True
        if res is None:
            res = ("敲入亏损" if hit else "到期未敲入", mat)
        hd = (pd.Timestamp(res[1]) - pd.Timestamp(st)).days
        ret = min(0.0, px[mat] / s0 - 1) if res[0] == "敲入亏损" else q["cpn"] * hd / 365
        out.append((st, res[0], res[1], hd, ret, ret * 365 / hd))
    df = pd.DataFrame(out, columns=["start", "type", "end", "days", "ret", "ann"])
    assert not ((df.type == "敲入亏损") & (df.ret == 0)).any()
    share = df.type.value_counts(normalize=True)
    return dict(n=len(df), first=df.start.iloc[0], last=df.start.iloc[-1], ko_s=share.get("敲出", 0.0), mat=share.get("到期未敲入", 0.0),
                kil=share.get("敲入亏损", 0.0), days=df.days.mean(), ann=df.ann.mean())


def quote_rows():
    return [dict(id=q[0], iss=q[1], und=q[2], kind=q[3], ko=q[4], step=q[5], floor=q[6], ki=q[7], cpn=q[8]) for q in QUOTES]


def q20(pats19: list[tuple[str, str]] | None = None):
    att, ans = fresh_dir(D20 / "题目附件"), fresh_dir(D20 / "标准答案附件")
    (D20 / "MCP结果文件").mkdir(exist_ok=True)
    mcps = {"510500": "比选_MCP_中证500ETF十年日线.json", "512100": "比选_MCP_中证1000ETF十年日线.json"}
    for u, f in mcps.items():
        copy_as(RAW / "雪球比选" / f"{u}.SS.json", D20 / "MCP结果文件" / f)
        copy_as(D20 / "MCP结果文件" / f, att / f)
    with open(att / "比选_A01_11月雪球报价.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["报价编号", "发行人", "挂钩标的代码", "挂钩标的", "结构", "起始日", "期限(月)", "锁定期(月)", "敲出水平", "每月降幅",
                     "敲出水平下限", "敲入水平", "年化票息", "报价日"])
        for q in quote_rows():
            wr.writerow([q["id"], q["iss"], q["und"], NAME[q["und"]], q["kind"], NEW, TENOR, LOCK, pc(q["ko"], 0), pc(q["step"], 1),
                         pc(q["floor"], 0), pc(q["ki"], 0), pc(q["cpn"], 1), BASE])
    copy_as(DOC / "雪球比选" / "A02_回测口径与入选规则.md", att / "比选_A02_回测口径与入选规则.md")
    mats20 = copy_materials("20", att)  # 最终质检返修补充的背景、历史和版本材料（比选_B01~B17）

    # 前轮标答不再放进本题题目附件：直接读第一轮标准答案附件里的排查表（见「去掉前轮标答」）
    r19 = read_q19(D19 / "标准答案附件" / "存续雪球凭证排查表.xlsx")
    th = TH_HIGH if r19["ratio"] > KI_LINE else TH_LOW
    pq = pd.read_csv(att / "比选_A01_11月雪球报价.csv", dtype=str)
    pct = lambda s: float(s.rstrip("%")) / 100
    qs = [dict(id=r["报价编号"], iss=r["发行人"], und=r["挂钩标的代码"], kind=r["结构"], ko=pct(r["敲出水平"]), step=pct(r["每月降幅"]),
               floor=pct(r["敲出水平下限"]), ki=pct(r["敲入水平"]), cpn=pct(r["年化票息"])) for _, r in pq.iterrows()]
    recs, pxs, full, raw_info = {}, {}, {}, {}
    for u, f in mcps.items():
        rec, draw = load_mcp_prices(att / f, 8)
        raw_info[u] = (len(draw), draw.index[0], draw.index[-1])  # 原始返回行数（含末行空收盘价）、起止日
        d = draw[draw.Close.notna()]
        recs[u], full[u] = (rec, d), d.Close.round(4)
        pxs[u] = full[u][full[u].index <= BASE]
    for q in qs:
        q.update(backtest(pxs[q["und"]], q))
        q["ok"] = q["kil"] <= th
    sel = sorted([q for q in qs if q["ok"]], key=lambda q: -q["ann"])
    out = [q for q in qs if not q["ok"]]
    print(f"[20] 敲入占比 {pc(r19['ratio'])}，门槛 {pc(th, 0)}")
    for q in qs:
        print(f"     {q['id']} {q['iss']} {q['und']} {q['kind']} 敲入{pc(q['ki'], 0)} 票息{pc(q['cpn'], 1)}：{q['n']} 张 {q['first']}~{q['last']} "
              f"敲出{pc(q['ko_s'])} 到期未敲入{pc(q['mat'])} 敲入亏损{pc(q['kil'])} 天数{q['days']:.1f} 年化{pc(q['ann'])} {'入选' if q['ok'] else ''}")
    print("     排序", [q["id"] for q in sel])
    assert [q["id"] for q in sel] == ["Q6", "Q4", "Q3", "Q5"]
    assert all(abs(q["kil"] - th) > 0.01 for q in qs)
    assert all(sel[i]["ann"] - sel[i + 1]["ann"] > 0.002 for i in range(len(sel) - 1))
    # B 系列材料不能出现本题的门槛档位、回测统计和入选排序，也不能出现第一轮的存续结论
    pats20 = [("存续敲入占比", lit(f"{r19['ratio'] * 100:.2f}")), ("存续名义本金", wan(r19["tot"], 0)),
              ("入选排序", r"Q6\W{0,4}Q4\W{0,4}Q3\W{0,4}Q5"), ("本月门槛", r"(本月|本批|11月)[^。\n]{0,8}门槛[^。\n]{0,6}(15|8)%"),
              ("起始日数量", lit(f"{qs[0]['n']}", f"{qs[0]['n']:,}")), ("回测交易日数", lit(f"{len(pxs['510500'])}", f"{len(pxs['510500']):,}"))]
    for q in qs:
        for k in ("ko_s", "mat", "kil", "ann"):
            if q[k] > 0.001:
                pats20.append((f"~{q['id']} {k}", lit(f"{q[k] * 100:.2f}%", f"{q[k] * 100:.2f} %")))
        pats20.append((f"~{q['id']} 平均持有天数", lit(f"{q['days']:.1f}")))
        if not q["ok"]:
            pats20.append((f"{q['id']} 超出门槛", lit(f"{(q['kil'] - th) * 100:.2f}个百分点", f"{(q['kil'] - th) * 100:.2f} 个百分点")))
    leak_check(att, pats20)
    if pats19:  # 20 的 B 系列也不能出现第一轮的逐张状态、金额和价格（单独的日期常与会议日期重合，不查）
        leak_check(att, [x for x in pats19 if x[0] not in ("敲出日", "敲入日")])
    # 错法：门槛用 8%；回测不截到基准日
    print("     错法：门槛 8% 入选", [q["id"] for q in sorted([q for q in qs if q["kil"] <= TH_HIGH], key=lambda q: -q["ann"])])
    for q in qs[:1]:
        w = backtest(full[q["und"]], q, end="2099-12-31")
        print(f"     错法：不截到基准日 {q['id']} {w['n']} 张，敲入亏损 {pc(w['kil'])}")

    p2 = lambda x: round(x * 100, 2)
    b_rows = [[q["id"], q["iss"], f"{q['und']} {NAME[q['und']]}", q["kind"], p2(q["ko"]), p2(q["step"]), p2(q["floor"]), p2(q["ki"]), p2(q["cpn"]),
               q["n"], q["first"], q["last"], p2(q["ko_s"]), p2(q["mat"]), p2(q["kil"]), round(q["days"], 1), p2(q["ann"])] for q in qs]
    gap = lambda q: f"敲入亏损比例超出门槛 {(q['kil'] - th) * 100:.2f} 个百分点"
    r_rows = [[i + 1, q["id"], q["iss"], f"{q['und']} {NAME[q['und']]}", p2(q["kil"]), p2(q["ann"]), "是", ""] for i, q in enumerate(sel)]
    r_rows += [["", q["id"], q["iss"], f"{q['und']} {NAME[q['und']]}", p2(q["kil"]), p2(q["ann"]), "否", gap(q)] for q in out]
    o_rows = []
    for u, (rec, d) in recs.items():
        q = rec["参数"]
        raw_n, raw_first, raw_last = raw_info[u]
        o_rows.append([f"{u} {NAME[u]}", q["ticker"], rec["工具"], f"period={q['period']}, interval={q['interval']}", rec["查询时间"],
                       raw_n, raw_first, raw_last, len(d), len(pxs[u]), pxs[u].index[0], pxs[u].index[-1]])
    assert all(r[5] == 2425 and r[7] == "2026-11-18" and r[8] == 2424 for r in o_rows)  # 原始返回 2425 行、截至 2026-11-18；非空收盘价 2424 条
    n0 = qs[0]
    write_xlsx(ans / "11月雪球报价回测表.xlsx",
               [("回测结果", ["报价编号", "发行人", "挂钩标的", "结构", "敲出水平(%)", "每月降幅(%)", "敲出水平下限(%)", "敲入水平(%)", "年化票息(%)",
                          "起始日数量", "第一个起始日", "最后一个起始日", "敲出比例(%)", "到期未敲入比例(%)", "敲入亏损比例(%)", "平均持有自然日", "平均年化收益率(%)"], b_rows),
                ("入选排序", ["排序", "报价编号", "发行人", "挂钩标的", "敲入亏损比例(%)", "平均年化收益率(%)", "是否入选", "备注"], r_rows),
                ("在线数据", ["挂钩标的", "代码", "工具", "参数", "查询时间", "原始返回行数", "返回第一天", "返回最后一天", "非空收盘价行数", "回测用行数", "回测用第一天", "回测用最后一天"], o_rows)],
               notes={"回测结果": [f"每个交易日开一张 24 个月的凭证，到期日不晚于 {BASE}，两只 ETF 各 {n0['n']} 个起始日，{n0['first']} 至 {n0['last']}。",
                               "收盘价用在线返回的按分红调整价格，保留 4 位小数。年化收益率是各张凭证年化收益率的算术平均。"],
                      "入选排序": [f"存续敲入占比 {pc(r19['ratio'])}（10月末存续排查表），不超过 50%，敲入亏损比例门槛 {pc(th, 0)}。",
                               "入选的按平均年化收益率从高到低排，这个顺序就是 11 月认购额度的分配顺序。"],
                      "在线数据": [source_line(recs[u][0]) for u in recs]
                               + ["Date 是 UTC 16:00，加 8 小时后的日期是交易日。原始返回各 2425 行，截至 2026-11-18；末行（2026-11-18）Close 为空，未参与回测，"
                                  "可用的非空收盘价各 2424 条，截至 2026-11-17。回测按 A02 截到 2026-10-30，各 2412 个交易日。"]})
    write_docx(ans / "11月雪球报价比选意见.docx", "多策略稳健1号 11月新增雪球凭证报价比选意见", [
        ("结论", [f"6 份报价，{len(sel)} 份入选，按平均年化收益率排序：" + "、".join(f"{q['id']}（{q['iss']}）" for q in sel) + "。"
                + "、".join(f"{q['id']}（{q['iss']}）" for q in out) + "没有入选。"]),
        ("门槛", [f"10 月末存续排查定稿的敲入占比是 {pc(r19['ratio'])}，没有超过 50%，敲入亏损比例门槛按 {pc(th, 0)} 执行。"]),
        ("入选报价", [f"第 {i + 1}：{q['id']} {q['iss']}，{NAME[q['und']]}，{q['kind']}，敲入 {pc(q['ki'], 0)}，票息 {pc(q['cpn'], 1)}。"
                   f"敲入亏损比例 {pc(q['kil'])}，平均持有 {q['days']:.1f} 天，平均年化收益率 {pc(q['ann'])}。" for i, q in enumerate(sel)]),
        ("没有入选的", [f"{q['id']} {q['iss']}，{NAME[q['und']]}，{q['kind']}，票息 {pc(q['cpn'], 1)}。平均年化收益率 {pc(q['ann'])}，"
                    f"但敲入亏损比例 {pc(q['kil'])}，超出门槛 {(q['kil'] - th) * 100:.2f} 个百分点。" for q in out]),
        ("回测范围", [f"两只 ETF 的十年日线通过 US Stocks MCP 查询（数据来自 Yahoo Finance，2026-11-19 查询），用按分红调整过的收盘价，回测截止 {BASE}。"
                  f"到期日不晚于 {BASE} 的起始日各 {n0['n']} 个，{n0['first']} 至 {n0['last']}。"]),
    ])
    return dict(qs=qs, sel=sel, out=out, th=th, r19=r19)


# ---------------- 21 ----------------
NAV = 902_864_317.52
# 科目代码, 科目名称, 金额(元), 备注
BOOK = [
    ("1002", "银行存款", 89_713_508.36, ""),
    ("1021", "结算备付金", 3_190_445.10, ""),
    ("1031", "存出保证金", 1_000_000.00, ""),
    ("1103", "债券投资", None, ""),
    ("1108", "收益凭证投资", 152_136_200.00, "按发行人提供的估值"),
    ("120201", "买入返售金融资产-GC001", 89_800_000.00, "2026-10-30 买入，到期日 2026-11-02"),
    ("120202", "买入返售金融资产-GC007", 20_000_000.00, "2026-10-30 买入，到期日 2026-11-06"),
    ("1204", "应收利息", 4_381_226.47, ""),
    ("2203", "应付赎回款", 23_500_000.00, "2026-11-02 支付"),
    ("2206", "应付管理人报酬", 612_358.20, ""),
    ("2207", "应付托管费", 122_471.64, ""),
    ("2221", "应交税费", 85_906.33, ""),
]
CASH_KEYS = ("1002", "1021", "120201")


def read_q20(path: Path):
    wb = load_workbook(path, data_only=True)
    rows = [r for r in wb["入选排序"].iter_rows(min_row=2, values_only=True) if r and r[1] and r[6] == "是"]
    return [r[1] for r in sorted(rows, key=lambda r: r[0])]


def q21(r19_check: dict, r20_check: dict):
    att, ans = fresh_dir(D21 / "题目附件"), fresh_dir(D21 / "标准答案附件")
    (D21 / "MCP结果文件").mkdir(exist_ok=True)
    mcps = {"510500": "认购_MCP_中证500ETF近一月日线.json", "512100": "认购_MCP_中证1000ETF近一月日线.json"}
    for u, f in mcps.items():
        copy_as(RAW / "雪球认购" / f"{u}.SS.json", D21 / "MCP结果文件" / f)
        copy_as(D21 / "MCP结果文件" / f, att / f)
    liab = sum(v for c, _, v, _ in BOOK if c.startswith("2"))
    asset = NAV + liab
    bond = round(asset - sum(v for c, _, v, _ in BOOK if c.startswith("1") and v is not None), 2)
    book = [(c, s, bond if v is None else v, b) for c, s, v, b in BOOK]
    with open(att / "认购_A01_估值表摘要.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["估值日期", "科目代码", "科目名称", "市值(元)", "市值占净值(%)", "备注"])
        for c, s, v, b in book:
            if c == "2203":
                wr.writerow([BASE, "", "资产合计", f"{asset:.2f}", f"{asset / NAV * 100:.2f}", ""])
            wr.writerow([BASE, c, s, f"{v:.2f}", f"{v / NAV * 100:.2f}", b])
        wr.writerow([BASE, "", "负债合计", f"{liab:.2f}", f"{liab / NAV * 100:.2f}", ""])
        wr.writerow([BASE, "", "资产净值", f"{NAV:.2f}", "100.00", ""])
    with open(att / "认购_A02_券商额度回复.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["报价编号", "发行人", "回复日期", "本产品可认购上限(万元)", "备注"])
        for q in quote_rows():
            wr.writerow([q["id"], q["iss"], "2026-10-30", CAP[q["id"]], "起始日 2026-11-02，当日 15:00 前缴款"])
    copy_as(DOC / "雪球认购" / "A03_限额与认购口径.md", att / "认购_A03_限额与认购口径.md")
    mats21 = copy_materials("21", att)  # 最终质检返修补充的背景、历史和版本材料（认购_B01~B16）

    # 前轮标答不再放进本题题目附件：直接读前两轮标准答案附件里的成果（见「去掉前轮标答」）
    r19 = read_q19(D19 / "标准答案附件" / "存续雪球凭证排查表.xlsx")
    order = read_q20(D20 / "标准答案附件" / "11月雪球报价回测表.xlsx")
    assert r19["tot"] == r19_check["tot"] and order == [q["id"] for q in r20_check["sel"]]
    a01 = pd.read_csv(att / "认购_A01_估值表摘要.csv", dtype=str)
    val = {r["科目代码"]: float(r["市值(元)"]) for _, r in a01.iterrows() if isinstance(r["科目代码"], str)}
    nav = float(a01[a01.科目名称 == "资产净值"]["市值(元)"].iloc[0]) / 1e4
    cash = sum(val[c] for c in CASH_KEYS) / 1e4
    redeem = val["2203"] / 1e4
    cap = {r["报价编号"]: int(r["本产品可认购上限(万元)"]) for _, r in pd.read_csv(att / "认购_A02_券商额度回复.csv", dtype=str).iterrows()}
    pq = {q["id"]: q for q in quote_rows()}
    lim = dict(all=nav * L_ALL, etf=nav * L_ETF, iss=nav * L_ISS, cash=nav * L_CASH)

    def allocate(cash_net):
        und, iss, tot, free = dict(r19["und"]), dict(r19["iss"]), r19["tot"], cash_net - lim["cash"]
        rows = []
        for qid in order:
            q = pq[qid]
            room = [cap[qid], lim["all"] - tot, lim["etf"] - und[q["und"]], lim["iss"] - iss.get(q["iss"], 0), free]
            amt = math.floor(min(room) / LOT + 1e-9) * LOT
            take = amt >= MIN_TICKET
            rows.append(dict(q=q, room=room, raw=min(room), amt=amt if take else 0, bind=room.index(min(room)), take=take))
            if take:
                tot += amt; und[q["und"]] += amt; iss[q["iss"]] = iss.get(q["iss"], 0) + amt; free -= amt
        return rows, dict(tot=tot, und=und, iss=iss, cash=free + lim["cash"])

    alloc, after = allocate(cash - redeem)
    buy = [a for a in alloc if a["take"]]
    total = sum(a["amt"] for a in buy)

    s0 = {}
    recs = {}
    for u, f in mcps.items():
        rec, d = load_mcp_prices(att / f, 8)
        recs[u] = (rec, d)
        s0[u] = round(float(d.Close[NEW]), 3)

    BIND = ["券商额度上限", "雪球合计 30%", "同一ETF 15%", "同一发行人 6%", "现金不低于 8%"]
    print(f"[21] 净值 {nav:.2f} 万，现金类 {cash:.2f} 万，应付赎回 {redeem:.2f} 万；上限 30% {lim['all']:.2f} 15% {lim['etf']:.2f} 6% {lim['iss']:.2f} 8% {lim['cash']:.2f}")
    for a in alloc:
        print(f"     {a['q']['id']} {a['q']['iss']} 五项 {[round(x, 2) for x in a['room']]} → {a['amt']} {'认购' if a['take'] else '不认购'}（{BIND[a['bind']]}）")
    print(f"     合计 {total} 万；认购后 雪球 {after['tot']} {pc(after['tot'] / nav)}，ETF {after['und']}，发行人 {after['iss']}，现金 {after['cash']:.2f} {pc(after['cash'] / nav)}")
    print(f"     起始日收盘 {s0}")
    assert [(a["q"]["id"], a["amt"], a["bind"]) for a in alloc] == [("Q6", 2400, 3), ("Q4", 3000, 0), ("Q3", 2400, 3), ("Q5", 0, 4)]
    assert all(1 < a["raw"] % LOT < LOT - 1 for a in alloc if a["bind"] != 0)  # 不贴着 100 万的整数倍
    # 错法
    w1, _ = allocate(cash)
    print("     错法：不扣应付赎回款", [(a["q"]["id"], a["amt"]) for a in w1], sum(a["amt"] for a in w1))
    w2_, _ = allocate(cash - redeem + val["120202"] / 1e4)
    print("     错法：GC007 算现金", [(a["q"]["id"], a["amt"]) for a in w2_])
    # B 系列材料不能出现本题的认购方案、额度测算和起始日价格，也不能出现前两轮的结论
    pats21 = [("存续名义本金", wan(r19["tot"], 0)), ("存续敲入占比", lit(f"{r19['ratio'] * 100:.2f}")),
              ("入选排序", r"Q6\W{0,4}Q4\W{0,4}Q3\W{0,4}Q5"), ("认购合计", wan(total, 0)), ("错法合计", wan(sum(a["amt"] for a in w1), 0)),
              ("认购后雪球合计", wan(after["tot"], 0)), ("认购后现金", wan(after["cash"])), ("现金类资产", wan(cash)),
              ("扣赎回后现金", wan(cash - redeem)), ("起始日 Date 行", lit("2026-11-01T16")),
              ("~认购后雪球占比", lit(pc(after["tot"] / nav))), ("~认购后现金占比", lit(pc(after["cash"] / nav)))]
    pats21 += [(f"限额金额 {k}", wan(v)) for k, v in lim.items()]
    pats21 += [(f"认购后 {u}", wan(v, 0)) for u, v in after["und"].items()] + [(f"~认购后 {u} 占比", lit(pc(v / nav))) for u, v in after["und"].items()]
    pats21 += [(f"~认购后 {i} 占比", lit(pc(v / nav))) for i, v in after["iss"].items() if v != r19["iss"].get(i)]
    for a in alloc:
        pats21 += [(f"{a['q']['id']} 剩余", wan(x)) for x in a["room"][1:]]
        if a["take"] and a["amt"] not in cap.values():
            pats21.append((f"{a['q']['id']} 认购金额", lit(f"{a['amt']:,}万", f"{a['amt']}万", f"{a['amt']:,} 万", f"{a['amt']} 万")))
    for u, v in s0.items():
        pats21.append((f"~{u} 起始日收盘价", lit(f"{v:.3f}")))
        pats21 += [(f"{u} 期初要素", lit(f"{v * k:.4f}")) for k in {pq[q]["ki"] for q in pq if pq[q]["und"] == u}
                   | {pq[q]["ko"] for q in pq if pq[q]["und"] == u} | {pq[q]["floor"] for q in pq if pq[q]["und"] == u}]
    leak_check(att, pats21)
    leak_check(D20 / "题目附件", pats21)  # 20 的 B 系列也不能出现第三轮的认购方案和额度测算
    print("     错法：UTC 日期当交易日", {u: float(recs[u][1].Close["2026-11-03"]) for u in recs}, "；用 10-30 收盘", {u: float(recs[u][1].Close[BASE]) for u in recs})

    a_rows = [[i + 1, a["q"]["id"], a["q"]["iss"], f"{a['q']['und']} {NAME[a['q']['und']]}"] + [round(x, 2) for x in a["room"]]
              + [a["amt"], "是" if a["take"] else "否",
                 f"{BIND[a['bind']]}卡住" if a["take"] else f"{BIND[a['bind']]}下最多 {a['raw']:.2f} 万元，取整后 {math.floor(a['raw'] / LOT) * LOT} 万元，不到 {MIN_TICKET} 万元"]
              for i, a in enumerate(alloc)]
    ok = lambda x, l, ge=False: "是" if (x >= l if ge else x <= l) else "否"
    rn = lambda x: round(x / nav * 100, 2)
    l_rows = [["雪球凭证合计", r19["tot"], rn(r19["tot"]), after["tot"], rn(after["tot"]), "≤ 30%", round(lim["all"], 2), ok(after["tot"], lim["all"])]]
    l_rows += [[f"挂钩 {u} {NAME[u]}", r19["und"][u], rn(r19["und"][u]), after["und"][u], rn(after["und"][u]), "≤ 15%", round(lim["etf"], 2),
                ok(after["und"][u], lim["etf"])] for u in NAME]
    l_rows += [[f"发行人 {i}", r19["iss"].get(i, 0), rn(r19["iss"].get(i, 0)), after["iss"][i], rn(after["iss"][i]), "≤ 6%", round(lim["iss"], 2),
                ok(after["iss"][i], lim["iss"])] for i in after["iss"] if after["iss"][i]]
    l_rows += [["现金类资产 − 应付赎回款", round(cash - redeem, 2), rn(cash - redeem), round(after["cash"], 2), rn(after["cash"]), "≥ 8%",
                round(lim["cash"], 2), ok(after["cash"], lim["cash"], True)]]
    e_rows = []
    for a in buy:
        q, p = a["q"], s0[a["q"]["und"]]
        e_rows.append([q["id"], q["iss"], f"{q['und']} {NAME[q['und']]}", q["kind"], NEW, a["amt"], p, round(p * q["ki"], 4), round(p * q["ko"], 4),
                       round(p * q["floor"], 4) if q["kind"] == "降敲" else ""])
    o_rows = [[f"{u} {NAME[u]}", recs[u][0]["参数"]["ticker"], recs[u][0]["工具"], "period=1mo, interval=1d", recs[u][0]["查询时间"],
               str(recs[u][1].Date[NEW]), NEW, s0[u]] for u in NAME]
    write_xlsx(ans / "11月雪球认购方案表.xlsx",
               [("额度分配", ["分配顺序", "报价编号", "发行人", "挂钩标的", "券商额度上限(万元)", "雪球合计剩余(万元)", "同一ETF剩余(万元)",
                          "同一发行人剩余(万元)", "现金可用(万元)", "认购金额(万元)", "是否认购", "说明"], a_rows),
                ("认购后限额", ["项目", "认购前(万元)", "认购前占净值(%)", "认购后(万元)", "认购后占净值(%)", "限额", "限额对应金额(万元)", "是否符合"], l_rows),
                ("期初要素", ["报价编号", "发行人", "挂钩标的", "结构", "起始日", "名义本金(万元)", "期初价格(元)", "敲入价格(元)",
                          "第3个月敲出价格(元)", "最低敲出价格(元)"], e_rows),
                ("在线数据", ["挂钩标的", "代码", "工具", "参数", "查询时间", "返回的Date", "对应交易日", "收盘价(元)"], o_rows)],
               notes={"额度分配": [f"净值 {w2(nav)} 万元（{BASE} 估值表）。现金类资产 = 银行存款 + 结算备付金 + GC001 = {w2(cash)} 万元，"
                               f"扣应付赎回款 {w2(redeem)} 万元后 {w2(cash - redeem)} 万元，要留 8% 即 {w2(lim['cash'])} 万元。",
                               "各项剩余都是扣掉前面已分金额之后的数。认购金额向下取到 100 万元的整数倍，不到 1000 万元不认购。"],
                      "认购后限额": ["认购前的数用 10 月末存续排查表「存续汇总」，按名义本金，不含已敲出的凭证。"],
                      "期初要素": ["价格保留 4 位小数。第 3 个月是第一个观察月。"],
                      "在线数据": [source_line(recs[u][0]) for u in NAME] + ["Date 是 UTC 16:00，加 8 小时后的日期才是交易日，起始日对应的是 2026-11-01T16:00Z 这一行。"]})
    # 认购后各发行人逐项，和方案表「认购后限额」核对后写进方案正文（质检要求补齐招商、中信、华泰、中金）
    wb_chk = load_workbook(ans / "11月雪球认购方案表.xlsx", data_only=True)
    xlsx_iss = {str(r[0]).replace("发行人 ", ""): (r[3], r[4]) for r in wb_chk["认购后限额"].iter_rows(min_row=2, values_only=True)
                if r[0] and str(r[0]).startswith("发行人 ")}
    for i, v in after["iss"].items():
        assert xlsx_iss[i] == (v, round(v / nav * 100, 2)), (i, xlsx_iss.get(i), v)
    iss_after = sorted(after["iss"].items(), key=lambda kv: (-kv[1], list(after["iss"]).index(kv[0])))
    iss_txt = "发行人认购后名义本金：" + "，".join(f"{i} {v:,} 万元（{pc(v / nav)}）" for i, v in iss_after) + "，都不超过同一发行人 6% 限额。"
    write_docx(ans / "11月雪球认购方案.docx", "多策略稳健1号 11月雪球凭证认购方案", [
        ("结论", [f"11 月 2 日认购 {len(buy)} 笔，合计 {total:,} 万元：" + "，".join(f"{a['q']['id']} {a['q']['iss']} {a['amt']:,} 万元" for a in buy) + "。"
                + "、".join(f"{a['q']['id']} {a['q']['iss']}" for a in alloc if not a["take"]) + "这次不认购。"]),
        ("每笔怎么定的", [f"{a['q']['id']} {a['q']['iss']}（{NAME[a['q']['und']]}）：券商额度 {cap[a['q']['id']]:,} 万元，"
                     + (f"被{BIND[a['bind']]}卡住，最多 {a['raw']:.2f} 万元，取 {a['amt']:,} 万元。" if a["take"] and a["bind"]
                        else f"按券商额度认购 {a['amt']:,} 万元。" if a["take"]
                        else f"前面三笔分完以后{BIND[a['bind']]}下只剩 {a['raw']:.2f} 万元，取整 {math.floor(a['raw'] / LOT) * LOT} 万元，不到 {MIN_TICKET:,} 万元，不认购。")
                     for a in alloc]),
        ("认购后", [f"雪球凭证名义本金 {after['tot']:,} 万元，占净值 {pc(after['tot'] / nav)}。"
                 + "，".join(f"{NAME[u]} {after['und'][u]:,} 万元（{pc(after['und'][u] / nav)}）" for u in NAME) + "。",
                 iss_txt,
                 f"现金类资产扣应付赎回款后 {w2(after['cash'])} 万元，占净值 {pc(after['cash'] / nav)}。各项都在限额内。"]),
        ("期初要素", [f"{r[0]} {r[1]}，{NAME[r[2][:6]]}，期初价格 {r[6]:.3f} 元，敲入价格 {r[7]:.4f} 元，第 3 个月敲出价格 {r[8]:.4f} 元"
                   + (f"，最低敲出价格 {r[9]:.4f} 元。" if r[9] != "" else "。") for r in e_rows]
         + [f"期初价格是 {NEW} 的收盘价，通过 US Stocks MCP 查询（数据来自 Yahoo Finance，2026-11-19 查询）：中证500ETF {s0['510500']:.3f} 元，中证1000ETF {s0['512100']:.3f} 元。"]),
    ])


if __name__ == "__main__":
    r19 = q19()
    r20 = q20(r19["pats"])
    q21(r19, r20)
