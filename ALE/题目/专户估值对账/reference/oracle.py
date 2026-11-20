#!/usr/bin/env python3
"""全球科技成长一号 2026-10-30 估值对账：参考解。

只读 --input 目录里的公开输入，不联网。生成两份成品：
  专户估值对账表.xlsx、专户估值对账报告.docx
依赖：openpyxl、python-docx；其余只用标准库。
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import re
import zipfile
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Pt
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

BOOK = "专户估值对账表.xlsx"
MEMO = "专户估值对账报告.docx"
START, BASE = "2025-10-31", "2026-10-30"
TAX = Decimal("0.10")
COMMISSION = Decimal("0.0002")
SEC_FEE = Decimal("0.0000278")
LEVELS = [(Decimal("0.0050"), "更正估值，通报托管行，报告监管机构，并对外公告"),
          (Decimal("0.0025"), "更正估值，通报托管行，并报告监管机构"),
          (Decimal("0"), "更正估值，并通报托管行")]
CENT = Decimal("0.01")


def c2(x) -> Decimal:
    return Decimal(x).quantize(CENT, rounding=ROUND_HALF_UP)


def money(x) -> str:
    return f"{x:,.2f}"


def read_csv(path: Path) -> list[dict]:
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


# ---------------------------------------------------------------- 读输入
def load(root: Path) -> dict:
    a01 = read_csv(root / "对账_A01_期初持仓与现金.csv")
    tickers = [r["代码"] for r in a01 if r["项目"] == "股票"]
    names = {r["代码"]: r["名称"] for r in a01 if r["项目"] == "股票"}
    pos0 = {r["代码"]: int(r["2025-10-31日终数量或金额"]) for r in a01 if r["项目"] == "股票"}
    cash0 = Decimal(next(r for r in a01 if r["项目"] == "现金")["2025-10-31日终数量或金额"])
    rec_row = next(r for r in a01 if r["项目"] == "应收股利")
    m = re.search(r"(\d{4}-\d{2}-\d{2}) 除息.*?付息日 (\d{4}-\d{2}-\d{2})", rec_row["说明"])
    rec0 = {"t": rec_row["代码"], "ex": m.group(1), "pay": m.group(2),
            "net": Decimal(rec_row["2025-10-31日终数量或金额"])}

    trades, subs = [], []
    for r in read_csv(root / "对账_A02_交易与资金流水.csv"):
        if r["业务"] == "申购款到账":
            subs.append((r["日期"], Decimal(r["金额(美元)"])))
        else:
            q = int(r["股数"])
            trades.append({"d": r["日期"], "t": r["代码"], "q": q if r["业务"] == "买入" else -q,
                           "px": Decimal(r["成交价(美元)"])})

    px: dict[tuple[str, str], Decimal] = {}
    for r in read_csv(root / "对账_A03_美股不复权收盘价.csv"):
        px[(r["date"], r["ticker"])] = Decimal(r["close"])
    days = sorted({d for d, _ in px})

    mgr = {"pos": {}, "rec": Decimal(0)}
    for r in read_csv(root / "对账_A04_管理人估值表.csv"):
        if r["科目"] == "股票":
            mgr["pos"][r["代码"]] = int(r["数量"])
        elif r["科目"] == "现金":
            mgr["cash"] = Decimal(r["金额(美元)"])
        elif r["科目"] == "应收股利":
            mgr["rec"] += Decimal(r["金额(美元)"])
        elif r["科目"] == "资产净值":
            mgr["nav"] = Decimal(r["金额(美元)"])
    mgr["refund"] = Decimal(0)

    cus = {"pos": {}, "div": {}}
    for r in read_csv(root / "对账_A05_托管行对账单.csv"):
        if r["类别"] == "持仓":
            cus["pos"][r["代码"]] = int(r["数量或余额"])
        elif r["类别"] == "股利入账":
            ex = re.search(r"除息日 (\d{4}-\d{2}-\d{2})", r["摘要"]).group(1)
            cus["div"][(r["代码"], ex)] = {"pay": r["日期"], "tax": Decimal(r["代扣税款(美元)"]),
                                           "net": Decimal(r["实收金额(美元)"])}
        elif r["类别"] == "现金":
            cus["cash"] = Decimal(r["数量或余额"])
        elif r["类别"] == "资产净值":
            cus["nav"] = Decimal(r["数量或余额"])
    cus["rec"], cus["refund"] = Decimal(0), Decimal(0)

    exports = {}
    for t in tickers:
        path = root / f"对账_A07_行情导出_{t}.json"
        raw = json.loads(path.read_text(encoding="utf-8"))
        rows = json.loads(raw["原始返回"]["content"][0]["text"])
        exports[t] = {"file": path.name, "time": raw["查询时间"], "tool": raw["工具"],
                      "params": raw["参数"], "rows": rows}
    return dict(tickers=tickers, names=names, pos0=pos0, cash0=cash0, rec0=rec0, trades=trades,
                subs=subs, px=px, days=days, mgr=mgr, cus=cus, exports=exports)


# ---------------------------------------------------------------- 公司行为
def corporate_actions(data: dict) -> tuple[dict, list]:
    """美股日线导出的日期是美东零点对应的 UTC 时间，取日期部分即为交易日。"""
    splits, raw_divs = {}, []
    for t in data["tickers"]:
        for r in data["exports"][t]["rows"]:
            d = r["Date"][:10]
            if not (START < d <= BASE):
                continue
            if r["Stock Splits"]:
                splits[t] = (d, int(round(r["Stock Splits"])))
            if r["Dividends"]:
                raw_divs.append((t, d, Decimal(str(r["Dividends"]))))
    divs = []
    for t, d, v in sorted(raw_divs, key=lambda x: (x[1], x[0])):
        factor = 1
        if t in splits and d < splits[t][0]:
            factor = splits[t][1]  # 导出数据把拆股前的每股分红按拆股比例调小了
        divs.append({"t": t, "ex": d, "export": v, "per": v * factor, "factor": factor})
    return splits, divs


# ---------------------------------------------------------------- 重建
def rebuild(data: dict, splits: dict, divs: list, method: str = "correct") -> dict:
    """method=correct：按口径重建。
    method=manager：复现管理人新系统的做法——拆股只作用于期初持仓、拆股前交易的股数不乘比例，
    每股分红直接取导出数据，扣税按 10% 记入现金，不单列应收退税。用于解释差异，不作为结果。"""
    tickers, px, cus = data["tickers"], data["px"], data["cus"]
    pos = dict(data["pos0"])
    pre_split_trade = {t: 0 for t in tickers}
    cash = data["cash0"]
    r0 = data["rec0"]
    receivable = {(r0["t"], r0["ex"]): {"net": r0["net"], "pay": r0["pay"], "over": Decimal(0)}}
    refund = Decimal(0)
    detail, ledger, trade_rows = [], [], []
    by_ex = {(x["t"], x["ex"]): x for x in divs}
    for d in [x for x in data["days"] if START < x <= BASE]:
        for t, (sd, k) in splits.items():
            if d == sd:
                before = pos[t]
                if method == "correct":
                    pos[t] = before * k
                else:
                    pos[t] = (before - pre_split_trade[t]) * k + pre_split_trade[t]
                ledger.append((d, t, "拆股", f"（1股拆{k}股）", pos[t] - before))
        for (t, ex), x in by_ex.items():
            if ex != d:
                continue
            per = x["per"] if method == "correct" else x["export"]
            gross = c2(pos[t] * per)
            tax = c2(gross * TAX)
            net = gross - tax
            c = cus["div"].get((t, ex))
            pay = c["pay"] if c else None
            over = Decimal(0)
            if c and method == "correct":
                over = c["tax"] - tax
                assert c["tax"] + c["net"] == gross, (t, ex, "托管行入账的税前金额与重建不符")
            receivable[(t, ex)] = {"net": net, "pay": pay, "over": over}
            detail.append({"t": t, "ex": ex, "shares": pos[t], "export": x["export"], "per": per,
                           "factor": x["factor"], "gross": gross, "tax": tax, "net": net, "pay": pay,
                           "cus_tax": c["tax"] if c else None, "cus_net": c["net"] if c else None,
                           "over": over, "paid": bool(pay and pay <= BASE)})
        for key in list(receivable):
            item = receivable[key]
            if item["pay"] and item["pay"] <= d:
                cash += item["net"] - item["over"]
                refund += item["over"]
                del receivable[key]
        for sd, amount in data["subs"]:
            if sd == d:
                cash += amount
        for tr in data["trades"]:
            if tr["d"] != d:
                continue
            t, q = tr["t"], tr["q"]
            assert tr["px"] == px[(d, t)], (d, t, "成交价不是当日收盘价")
            amount = c2(abs(q) * tr["px"])
            com = c2(amount * COMMISSION)
            fee = c2(amount * SEC_FEE) if q < 0 else Decimal(0)
            flow = -(amount + com) if q > 0 else amount - com - fee
            cash += flow
            pos[t] += q
            if t in splits and d < splits[t][0]:
                pre_split_trade[t] += q
            trade_rows.append({"d": d, "t": t, "q": q, "px": tr["px"], "amount": amount, "com": com,
                               "fee": fee, "flow": flow})
    mv = {t: c2(pos[t] * px[(BASE, t)]) for t in tickers}
    rec = sum((v["net"] for v in receivable.values()), Decimal(0))
    nav = sum(mv.values(), Decimal(0)) + cash + rec + refund
    return dict(pos=pos, mv=mv, cash=cash, rec=rec, receivable=receivable, refund=refund, nav=nav,
                detail=detail, ledger=ledger, trades=trade_rows)


def level(rate: Decimal) -> str:
    for threshold, text in LEVELS:
        if abs(rate) >= threshold:
            return text
    raise AssertionError


def compute(root: Path) -> dict:
    data = load(root)
    splits, divs = corporate_actions(data)
    ok = rebuild(data, splits, divs)
    sim = rebuild(data, splits, divs, "manager")
    tickers, px, mgr, cus = data["tickers"], data["px"], data["mgr"], data["cus"]

    # 拆股与不复权价相互印证：生效日价格约为前一交易日的 1/k
    for t, (sd, k) in splits.items():
        prev = max(d for d in data["days"] if d < sd)
        assert Decimal("0.8") < px[(sd, t)] * k / px[(prev, t)] < Decimal("1.2"), t
    # 管理人新系统的做法能逐项复现 A04
    assert sim["pos"] == mgr["pos"] and sim["cash"] == mgr["cash"] and sim["rec"] == mgr["rec"]
    assert sim["nav"] == mgr["nav"]
    # 托管行：持仓正确，现金就是实收，股利按收付实现、不记应收和应收退税
    assert cus["pos"] == ok["pos"] and cus["cash"] == ok["cash"]
    assert cus["nav"] == sum(ok["mv"].values(), Decimal(0)) + cus["cash"]

    for side in (mgr, cus):
        side["mv"] = {t: c2(side["pos"][t] * px[(BASE, t)]) for t in tickers}
        side["stock"] = sum(side["mv"].values(), Decimal(0))
    ok["stock"] = sum(ok["mv"].values(), Decimal(0))
    rate = (mgr["nav"] - ok["nav"]) / ok["nav"]

    klac_gap = sum((x["net"] for x in ok["detail"] if x["t"] == "KLAC"), Decimal(0)) - \
        sum((x["net"] for x in sim["detail"] if x["t"] == "KLAC"), Decimal(0))
    other_gap = sum((x["net"] for x in ok["detail"] if x["t"] != "KLAC"), Decimal(0)) - \
        sum((x["net"] for x in sim["detail"] if x["t"] != "KLAC"), Decimal(0))
    assert other_gap == 0
    assert mgr["cash"] - ok["cash"] == ok["refund"] - klac_gap

    pos_diff = {t: mgr["pos"][t] - ok["pos"][t] for t in tickers if mgr["pos"][t] != ok["pos"][t]}
    return dict(data=data, splits=splits, divs=divs, ok=ok, sim=sim, mgr=mgr, cus=cus, rate=rate,
                level=level(rate), klac_gap=klac_gap, pos_diff=pos_diff)


# ---------------------------------------------------------------- 工作簿
HEAD_FONT = Font(name="等线", bold=True)
BODY_FONT = Font(name="等线")
HEAD_FILL = PatternFill("solid", fgColor="DDEBF7")
THIN = Side(style="thin", color="A6A6A6")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
FMT = {"int": "#,##0;-#,##0;0", "money": "#,##0.00;-#,##0.00;0.00", "price": "#,##0.00",
       "per": "0.00", "pct": "0.00%", "date": "yyyy-mm-dd", "text": "@"}


def as_date(s):
    return dt.date.fromisoformat(s) if s else None


def write_table(ws, header, rows, kinds, widths, start_row=1):
    for j, h in enumerate(header, 1):
        c = ws.cell(start_row, j, h)
        c.font, c.fill, c.border = HEAD_FONT, HEAD_FILL, BOX
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for i, row in enumerate(rows, start_row + 1):
        for j, (v, k) in enumerate(zip(row, kinds), 1):
            if v == "":
                v = None
            if isinstance(v, Decimal):
                v = int(v) if k == "int" else float(v)
            c = ws.cell(i, j, v)
            c.font, c.border = BODY_FONT, BOX
            c.number_format = FMT[k]
            if k == "text":
                c.alignment = Alignment(wrap_text=True, vertical="top")
    for j, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(j)].width = w
    ws.row_dimensions[start_row].height = 32
    return start_row + len(rows)


def build_book(res: dict, path: Path) -> None:
    data, ok, mgr, cus = res["data"], res["ok"], res["mgr"], res["cus"]
    tickers, names = data["tickers"], data["names"]
    wb = Workbook()

    ws = wb.active
    ws.title = "持仓重建"
    rows = []
    for t in tickers:
        split_add = sum(x[4] for x in ok["ledger"] if x[1] == t)
        traded = sum(x["q"] for x in ok["trades"] if x["t"] == t)
        rows.append([t, names[t], data["pos0"][t], split_add, traded, ok["pos"][t], data["px"][(BASE, t)],
                     ok["mv"][t], mgr["pos"][t], mgr["pos"][t] - ok["pos"][t], cus["pos"][t],
                     cus["pos"][t] - ok["pos"][t]])
    rows.append(["合计", "", None, None, None, None, None, ok["stock"], None, None, None, None])
    last = write_table(ws, ["代码", "名称", "2025-10-31\n期初股数", "拆股增加\n股数", "本期买卖股数\n（买正卖负）",
                            "2026-10-30\n重建股数", "2026-10-30\n收盘价", "重建市值", "管理人股数",
                            "管理人−重建", "托管行股数", "托管行−重建"],
                       rows, ["text", "text", "int", "int", "int", "int", "price", "money", "int", "int", "int", "int"],
                       [8, 12, 12, 11, 14, 12, 11, 16, 12, 12, 12, 12])
    ws.cell(last, 1).font = HEAD_FONT
    r = last + 2
    ws.cell(r, 1, "拆股与交易记账顺序").font = HEAD_FONT
    events = [(x[0], x[1], f"{x[2]}{x[3]}", x[4], None) for x in ok["ledger"]] + \
             [(x["d"], x["t"], "买入" if x["q"] > 0 else "卖出", x["q"], x["flow"]) for x in ok["trades"]]
    events.sort(key=lambda e: (e[0], e[2].startswith("拆股") is False))
    write_table(ws, ["日期", "代码", "事项", "股数变动", "现金变动"],
                [[as_date(e[0]), e[1], e[2], e[3], e[4]] for e in events],
                ["date", "text", "text", "int", "money"], [12, 12, 12, 11, 14], start_row=r + 1)
    ws.column_dimensions["A"].width = 12
    ws.freeze_panes = "C2"

    ws = wb.create_sheet("股利明细")
    rows = []
    r0 = data["rec0"]
    c0 = cus["div"][(r0["t"], r0["ex"])]
    shares0 = data["pos0"][r0["t"]]
    rows.append([r0["t"], as_date(r0["ex"]), shares0, (c0["tax"] + c0["net"]) / shares0, None, c0["tax"] + c0["net"],
                 c0["tax"], r0["net"],
                 as_date(c0["pay"]), c0["tax"], c0["net"], Decimal(0), "已到账", "期初应收，到账冲减，不计入本期"])
    for x in ok["detail"]:
        note = []
        if x["factor"] != 1:
            note.append(f"行情数据按拆股折算为{x['export']}，按实际派发{x['per']:.2f}入账")
        if x["over"]:
            note.append(f"托管行按{(x['cus_tax'] / x['gross'] * 100):.0f}%扣税，多扣部分列应收退税")
        if not x["paid"]:
            note.append("10月30日未到账，列应收股利")
        rows.append([x["t"], as_date(x["ex"]), x["shares"], x["per"], x["export"], x["gross"], x["tax"], x["net"],
                     as_date(x["pay"]), x["cus_tax"], x["cus_net"], x["over"], "已到账" if x["paid"] else "未到账",
                     "；".join(note)])
    period = ok["detail"]
    rows.append(["本期合计", None, None, None, None, sum((x["gross"] for x in period), Decimal(0)),
                 sum((x["tax"] for x in period), Decimal(0)), sum((x["net"] for x in period), Decimal(0)), None,
                 sum((x["cus_tax"] or 0 for x in period), Decimal(0)), sum((x["cus_net"] or 0 for x in period), Decimal(0)),
                 ok["refund"], None, "不含期初应收的TXN 2025-10-31股利"])
    last = write_table(ws, ["代码", "除息日", "享有分红\n股数", "每股分红\n（实际派发）", "行情数据\n每股金额",
                            "税前金额", "应扣税款\n（10%）", "税后应收", "付息日", "托管行\n代扣税款", "托管行\n实收",
                            "多扣税款\n（应收退税）", "10-30\n到账状态", "说明"],
                       rows, ["text", "date", "int", "per", "per", "money", "money", "money", "date", "money", "money",
                              "money", "text", "text"],
                       [9, 12, 11, 12, 11, 13, 12, 13, 12, 12, 12, 13, 9, 42])
    ws.cell(last, 1).font = HEAD_FONT
    ws.freeze_panes = "C2"

    ws = wb.create_sheet("净值汇总")
    items = [("股票市值", "stock"), ("现金", "cash"), ("应收股利", "rec"), ("应收退税", "refund"), ("资产净值", "nav")]
    rows = [[n, ok[k], mgr[k], cus[k], mgr[k] - ok[k], cus[k] - ok[k]] for n, k in items]
    last = write_table(ws, ["项目", "重建", "管理人估值表", "托管行对账单", "管理人−重建", "托管行−重建"], rows,
                       ["text", "money", "money", "money", "money", "money"], [16, 18, 18, 18, 16, 16])
    for j in range(1, 7):
        ws.cell(last, j).font = HEAD_FONT
    r = last + 2
    for label, value, kind in [("估值差错率（管理人）", float(res["rate"]), "pct"),
                               ("处理级别", res["level"], "text"),
                               ("估值基准日", dt.date.fromisoformat(BASE), "date"),
                               ("业绩报酬计提采用的资产净值", float(ok["nav"]), "money")]:
        a, b = ws.cell(r, 1, label), ws.cell(r, 2, value)
        a.font, b.font = HEAD_FONT, BODY_FONT
        a.border = b.border = BOX
        b.number_format = FMT[kind]
        if kind == "text":
            ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=6)
        r += 1
    ws.cell(r + 1, 1, "差错率 =（管理人估值表资产净值 − 重建资产净值）÷ 重建资产净值").font = BODY_FONT

    ws = wb.create_sheet("公司行为")
    rows = []
    for t, (sd, k) in sorted(res["splits"].items(), key=lambda x: x[1][0]):
        e = data["exports"][t]
        rows.append([t, "拆股", as_date(sd), f"1股拆{k}股", None, None, e["file"], f"生效日开盘前持股乘以{k}，含拆股前买卖的股数"])
    for x in res["divs"]:
        e = data["exports"][x["t"]]
        how = f"拆股前分红，行情数据已按拆股折算，乘以{x['factor']}后与托管行入账一致" if x["factor"] != 1 else "与托管行入账一致" \
            if (x["t"], x["ex"]) in cus["div"] else "10月30日未到账，托管行尚无入账"
        rows.append([x["t"], "现金分红", as_date(x["ex"]), None, x["export"], x["per"], e["file"], how])
    last = write_table(ws, ["代码", "类型", "生效日／除息日", "拆股比例", "行情数据每股金额", "入账每股金额", "来源文件", "处理"],
                       rows, ["text", "text", "date", "text", "per", "per", "text", "text"],
                       [8, 10, 14, 10, 12, 12, 30, 44])
    r = last + 2
    ws.cell(r, 1, "数据来源").font = HEAD_FONT
    exp_rows = []
    for t in tickers:
        e = data["exports"][t]
        p = e["params"]
        exp_rows.append([t, e["file"], e["time"], e["tool"], f"ticker={p['ticker']}；period={p['period']}（近两年）；interval={p['interval']}（日线）",
                         e["rows"][0]["Date"][:10], e["rows"][-1]["Date"][:10]])
    write_table(ws, ["代码", "文件", "导出时间", "工具", "参数", "数据起始日", "数据截止日"], exp_rows,
                ["text"] * 7, [8, 30, 22, 26, 36, 12, 12], start_row=r + 1)
    r = r + 2 + len(exp_rows)
    for line in ["说明：",
                 "1. 本表列示拆股生效日或除息日在2025-11-01至2026-10-30之间的记录，来源为Yahoo Finance日线数据的Stock Splits、Dividends两列。",
                 "2. TXN 2025-10-31除息的股利期初已列应收，2025-11-11到账冲减，不计入本期。",
                 "3. 行情数据对KLAC拆股前的分红按拆股比例做了折算，入账时乘以10还原，与托管行入账的税前金额一致。"]:
        r += 1
        ws.cell(r, 1, line).font = BODY_FONT

    wb.save(path)
    tidy_ooxml(path, "全球科技成长一号2026年10月30日估值对账表")


# ---------------------------------------------------------------- 报告
def set_cell(cell, text, bold=False, align=None):
    cell.text = ""
    p = cell.paragraphs[0]
    run = p.add_run(text)
    run.bold = bold
    run.font.size = Pt(10)
    if align:
        p.alignment = align


def add_table(doc, header, rows, right_cols=()):
    table = doc.add_table(rows=1, cols=len(header))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for j, h in enumerate(header):
        set_cell(table.rows[0].cells[j], h, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
    for row in rows:
        cells = table.add_row().cells
        for j, v in enumerate(row):
            set_cell(cells[j], v, align=WD_ALIGN_PARAGRAPH.RIGHT if j in right_cols else None)
    return table


def cn_date(s: str, with_year: bool = True) -> str:
    d = dt.date.fromisoformat(s)
    return f"{d.year}年{d.month}月{d.day}日" if with_year else f"{d.month}月{d.day}日"


def split_text(k: int) -> str:
    return f"每1股拆为{k}股"


def build_memo(res: dict, path: Path) -> None:
    data, ok, mgr, cus, sim = res["data"], res["ok"], res["mgr"], res["cus"], res["sim"]
    px = data["px"]
    doc = Document()
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10.5)
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")
    normal.paragraph_format.space_after = Pt(6)
    for s in ("Title", "Heading 1", "Heading 2"):
        doc.styles[s].element.rPr.rFonts.set(qn("w:eastAsia"), "黑体")

    def para(text, bold_lead=None):
        p = doc.add_paragraph()
        if bold_lead:
            p.add_run(bold_lead).bold = True
        p.add_run(text)
        return p

    doc.add_heading("全球科技成长一号2026年10月30日估值对账报告", level=0)
    doc.add_paragraph("报送：运营部、托管行、投资经理\n估值基准日：2026年10月30日\n金额单位：美元")

    gap = mgr["nav"] - ok["nav"]
    doc.add_heading("一、对账结论", level=1)
    para(f"从2025年10月31日日终持仓逐笔重建，本计划2026年10月30日资产净值为{money(ok['nav'])}美元，"
         "年度业绩报酬按此计提。")
    para(f"管理人新估值系统列示的资产净值为{money(mgr['nav'])}美元，高估{money(gap)}美元，估值差错率为"
         f"{res['rate'] * 100:.2f}%。差错率在0.25%至0.50%之间，需要更正估值、通报托管行并报告监管机构，无需对外公告。")
    para(f"托管行复核的资产净值为{money(cus['nav'])}美元，比重建结果低{money(ok['nav'] - cus['nav'])}美元。"
         f"托管持股和现金余额与重建一致，差额是TXN应收股利{money(ok['rec'])}美元和CSCO应收退税"
         f"{money(ok['refund'])}美元没有入账。")
    add_table(doc, ["项目", "重建结果", "管理人估值表", "托管行对账单"],
              [[n, money(ok[k]), money(mgr[k]), money(cus[k])] for n, k in
               [("股票市值", "stock"), ("现金", "cash"), ("应收股利", "rec"), ("应收退税", "refund"), ("资产净值", "nav")]],
              right_cols=(1, 2, 3))

    doc.add_heading("二、管理人估值差错", level=1)
    for idx, t in [("（一）", "NFLX"), ("（二）", "KLAC")]:
        sd, k = res["splits"][t]
        tr = next(x for x in ok["trades"] if x["t"] == t and x["d"] < sd)
        diff = res["pos_diff"][t]
        word = "少" if diff < 0 else "多"
        act = "买入" if tr["q"] > 0 else "卖出"
        para(f"{cn_date(tr['d'])}{act}的{abs(tr['q'])}股发生在{cn_date(sd, False)}{split_text(k)}之前，"
             f"拆股后对应{abs(tr['q']) * k:,}股。新系统只对期初持股做了拆股，这笔{act}仍按{abs(tr['q'])}股记账。"
             f"{t}应为{ok['pos'][t]:,}股，估值表为{mgr['pos'][t]:,}股。",
             bold_lead=f"{idx}{t}持股{word}计{abs(diff):,}股，{word}估{money(abs(diff) * px[(BASE, t)])}美元。")
    klac = [x for x in ok["detail"] if x["t"] == "KLAC"]
    klac_sim = {x["ex"]: x for x in sim["detail"] if x["t"] == "KLAC"}
    pre = [x for x in klac if x["factor"] != 1]
    post = [x for x in klac if x["factor"] == 1]
    actual = "、".join(f"{x['per']:.2f}" for x in pre)
    para(f"行情数据中KLAC拆股前{len(pre)}次分红已按拆股比例折算为每股"
         f"{'、'.join(str(x['export']) for x in pre)}美元，公司实际派发为每股"
         f"{actual}美元，与托管行入账一致，新系统直接用了折算后的金额。"
         + (f"拆股后{cn_date(post[0]['ex'], False)}那次分红，又按多计的{klac_sim[post[0]['ex']]['shares']:,}股计算。" if post else "")
         + "逐次差异如下：",
         bold_lead=f"（三）KLAC股利少计{money(res['klac_gap'])}美元。")
    add_table(doc, ["除息日", "应计税后股利", "新系统记录", "差异"],
              [[x["ex"], money(x["net"]), money(klac_sim[x["ex"]]["net"]), money(x["net"] - klac_sim[x["ex"]]["net"])]
               for x in klac] + [["合计", "", "", money(res["klac_gap"])]], right_cols=(1, 2, 3))
    para(f"CSCO四次分红托管行按30%扣税，新系统按10%税率把税后股利全额记入现金。多扣的{money(ok['refund'])}美元"
         f"应列为应收退税，不应计入现金。扣除KLAC少计的股利{money(res['klac_gap'])}美元后，现金净多计"
         f"{money(mgr['cash'] - ok['cash'])}美元。",
         bold_lead=f"（四）现金多计{money(mgr['cash'] - ok['cash'])}美元。")
    para(f"以上各项合计，股票市值多估{money(mgr['stock'] - ok['stock'])}美元，现金多计{money(mgr['cash'] - ok['cash'])}美元，"
         f"应收退税漏记{money(ok['refund'])}美元，资产净值多估{money(gap)}美元。")
    para("调整NFLX、KLAC持股数，补记KLAC股利差额，把CSCO多扣的税款从现金转入应收退税，更正后重新出具10月30日估值表。"
         "新系统拆股只处理期初持股、分红直接取用行情数据金额，这两处需要在11月估值前修复。",
         bold_lead="更正建议：")

    doc.add_heading("三、托管行差异", level=1)
    csco = [x for x in ok["detail"] if x["t"] == "CSCO"]
    para(f"{'、'.join(cn_date(x['ex'], x is csco[0]) for x in csco)}四次分红，托管行按30%代扣，本计划适用的协定税率为10%，"
         f"分别多扣{'、'.join(money(x['over']) for x in csco)}美元。请托管行核实税率资料并办理退税，估值中列应收退税。",
         bold_lead=f"（一）CSCO预提税多扣{money(ok['refund'])}美元。")
    txn = next(x for x in ok["detail"] if not x["paid"])
    para(f"{txn['t']}于{cn_date(txn['ex'])}除息，每股{txn['per']}美元，持股{txn['shares']:,}股，税后{money(txn['net'])}美元，"
         "10月30日日终尚未到账。托管行按收付实现制记账没有列示，估值应在除息日确认应收。",
         bold_lead=f"（二）TXN应收股利{money(txn['net'])}美元未记。")

    doc.add_heading("四、差错率与处理", level=1)
    para(f"估值差错率 =（{money(mgr['nav'])} − {money(ok['nav'])}）÷ {money(ok['nav'])} = {res['rate'] * 100:.2f}%。")
    para("按公司估值差错处理办法，差错率达到0.25%、低于0.50%，由管理人更正估值，通报托管行，并报告监管机构，不需要对外公告。"
         f"年度业绩报酬按更正后的资产净值{money(ok['nav'])}美元计提。")

    doc.add_heading("五、公司行为数据", level=1)
    items = []
    for t, (sd, k) in sorted(res["splits"].items(), key=lambda x: x[1][0]):
        prev = max(d for d in data["days"] if d < sd)
        items.append(f"{t}于{cn_date(sd)}{split_text(k)}，前一交易日收盘{money(px[(prev, t)])}美元，"
                     f"当日收盘{money(px[(sd, t)])}美元")
    para("；".join(items) + "。拆股前后的收盘价与拆股比例相符。", bold_lead="拆股：")
    para(f"本期除息{len(ok['detail'])}次，税后股利合计{money(sum((x['net'] for x in ok['detail']), Decimal(0)))}美元。"
         "拆股和分红记录取自Yahoo Finance日线数据（2026年11月19日导出），每笔分红都与托管行入账核对过。"
         "TXN 2025年10月31日除息的股利期初已列应收，11月11日到账时冲减，没有重复计入。", bold_lead="分红：")
    para("明细见《专户估值对账表.xlsx》。")
    doc.save(path)
    tidy_ooxml(path, "全球科技成长一号2026年10月30日估值对账报告")


def tidy_ooxml(path: Path, title: str) -> None:
    """写入文档属性（标题、生成时间），不附带模板缩略图。"""
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    core = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
            'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            f'<dc:title>{title}</dc:title>'
            f'<dcterms:created xsi:type="dcterms:W3CDTF">{now}</dcterms:created>'
            f'<dcterms:modified xsi:type="dcterms:W3CDTF">{now}</dcterms:modified>'
            '</cp:coreProperties>')
    app = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
           '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
           'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"/>')
    with zipfile.ZipFile(path) as z:
        items = [(i, z.read(i.filename)) for i in z.infolist()]
    if path.suffix == ".xlsx":
        items = shared_strings(items)
    items.sort(key=lambda x: x[0].filename != "[Content_Types].xml")
    stamp = dt.datetime.now().timetuple()[:6]
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for info, body in items:
            name = info.filename
            if name == "docProps/thumbnail.jpeg":
                continue
            if name == "docProps/core.xml":
                body = core.encode("utf-8")
            elif name == "docProps/app.xml":
                body = app.encode("utf-8")
            elif name == "_rels/.rels":
                body = re.sub(rb'<Relationship [^>]*thumbnail[^>]*/>', b"", body)
            elif name == "[Content_Types].xml":
                body = re.sub(rb'<Default Extension="jpeg"[^>]*/>', b"", body)
            z.writestr(zipfile.ZipInfo(name, date_time=stamp), body, compress_type=zipfile.ZIP_DEFLATED)


def shared_strings(items: list) -> list:
    """工作表字符串改用共享字符串表存放。"""
    table: list[bytes] = []
    index: dict[bytes, int] = {}
    refs = [0]

    def to_shared(m):
        refs[0] += 1
        text = m.group(3)
        if text not in index:
            index[text] = len(table)
            table.append(text)
        return m.group(1) + b't="s"' + m.group(2) + b"><v>" + str(index[text]).encode() + b"</v></c>"

    cell = re.compile(rb'(<c [^>]*?)t="inlineStr"([^>]*)><is><t[^>]*>(.*?)</t></is></c>', re.S)
    out = []
    for info, body in items:
        name = info.filename
        if name.startswith("xl/worksheets/sheet"):
            body = cell.sub(to_shared, body).replace(b' t="inlineStr"></c>', b"></c>").replace(b' t="n"></c>', b"></c>")
        elif name == "xl/styles.xml":
            body = body.replace(b' pivotButton="0" quotePrefix="0"', b"")
        elif name == "xl/workbook.xml":
            body = body.replace(b"<workbookProtection/>", b"")
            body = re.sub(rb"<calcPr [^>]*/>", b"", body)
        out.append((info, body))
    sst = (b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
           b'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="%d" uniqueCount="%d">'
           % (refs[0], len(table)))
    sst += b"".join(b'<si><t xml:space="preserve">' + t + b"</t></si>" for t in table) + b"</sst>"
    for k, (info, body) in enumerate(out):
        if info.filename == "xl/_rels/workbook.xml.rels":
            body = body.replace(b"</Relationships>",
                                b'<Relationship Id="rIdSst" Type="http://schemas.openxmlformats.org/officeDocument/2006/'
                                b'relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>')
        elif info.filename == "[Content_Types].xml":
            body = body.replace(b"</Types>",
                                b'<Override PartName="/xl/sharedStrings.xml" ContentType="application/'
                                b'vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>')
        out[k] = (info, body)
    out.append((zipfile.ZipInfo("xl/sharedStrings.xml"), sst))
    utf8 = lambda m: chr(int(m.group(1))).encode("utf-8") if int(m.group(1)) > 127 else m.group(0)
    return [(i, re.sub(rb"&#(\d+);", utf8, body).replace(b"<pageSetUpPr/>", b"") if i.filename.startswith("xl/") else body)
            for i, body in out]


def produce(root: Path, out: Path) -> dict:
    res = compute(root)
    out.mkdir(parents=True, exist_ok=True)
    build_book(res, out / BOOK)
    build_memo(res, out / MEMO)
    return res


def basis(res: dict) -> dict:
    """核对基准：全部用字符串保存数值，避免浮点误差。"""
    ok, mgr, cus = res["ok"], res["mgr"], res["cus"]
    s = lambda x: str(x)
    return {
        "资产净值": {"重建": s(ok["nav"]), "管理人": s(mgr["nav"]), "托管行": s(cus["nav"])},
        "股票市值": s(ok["stock"]), "现金": s(ok["cash"]), "应收股利": s(ok["rec"]), "应收退税": s(ok["refund"]),
        "持股": ok["pos"], "管理人持股差": res["pos_diff"],
        "差错率": s(res["rate"]), "差错率_百分数两位": f"{res['rate'] * 100:.2f}", "处理级别": res["level"],
        "KLAC股利少记": s(res["klac_gap"]),
        "拆股": {t: [d, k] for t, (d, k) in res["splits"].items()},
        "分红": [{"代码": x["t"], "除息日": x["ex"], "股数": x["shares"], "每股": s(x["per"]), "税前": s(x["gross"]),
                "税后": s(x["net"]), "付息日": x["pay"], "多扣税": s(x["over"])} for x in ok["detail"]],
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args()
    res = produce(a.input, a.out)
    print(json.dumps(basis(res), ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
