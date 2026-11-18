#!/usr/bin/env python3
"""打包「港股红利组合建仓权重与税后股息率测算」（三轮链的第二轮）：题目附件、标准答案附件。

输入是第一轮标准答案《港股红利候选池筛选表.xlsx》的「入选名单」（评测时由项目组从前题标答提供，不放进本题附件），
加上本题自己的附件：A01 证券资料（每手股数来自 LongPort，税务类别是下面 TAX 里拟的）、A02 建仓口径、A03 产品要素，
以及港币兑人民币汇率的 MCP 结果文件。

脚本做的事：
1. 生成 A01，复制 A02、A03 和 MCP 结果文件。
2. 只用第一轮的筛选表、本题附件和 MCP 结果文件重算，生成标准答案附件。第三轮读这里生成的建仓方案表。
3. 算一遍常见错误的结果。
"""
from __future__ import annotations

import csv
import json
import math
from fractions import Fraction as F
from pathlib import Path

from openpyxl import load_workbook

from build_common import OUT, copy_as, fresh_dir, load_mcp, source_line, write_docx, write_xlsx

HERE = Path(__file__).resolve().parent
RAW = HERE / "新题数据" / "港股红利建仓"
LP = HERE / "新题数据" / "港股红利_longport"
DOC = HERE / "新题口径" / "红利建仓"
PREV = OUT / "题目" / "13_港股红利候选池筛选" / "标准答案附件" / "港股红利候选池筛选表.xlsx"
DST = OUT / "题目" / "14_港股红利组合建仓"
PREFIX = "红利建仓_"
MCP_FILE = f"{PREFIX}MCP_HKDCNY汇率.json"
BASE = "2026-10-30"
RMB = F(800_000_000)
STOCK = F(95, 100)
SCAP, ICAP = F(8, 100), F(25, 100)
FEE = F(75, 10000) + F(15, 10000)
TIERS = (F(40, 1000), F(45, 1000), F(50, 1000))
RATE = {"H股": F(1, 10), "红筹居民企业": F(1, 10), "其他": F(0)}
RED = {"0883.HK", "0941.HK", "0836.HK", "0762.HK"}
OTHER = {"0005.HK", "2388.HK", "0002.HK", "0003.HK", "0006.HK", "0016.HK", "1972.HK", "0823.HK"}
POOL = ["0939.HK", "1398.HK", "3988.HK", "1288.HK", "3968.HK", "3328.HK", "0005.HK", "2388.HK", "0883.HK", "0857.HK",
        "0386.HK", "1088.HK", "1898.HK", "1171.HK", "0941.HK", "0728.HK", "0762.HK", "0002.HK", "0003.HK", "0006.HK",
        "0836.HK", "0902.HK", "0016.HK", "1972.HK", "0823.HK", "1919.HK", "0177.HK", "0548.HK", "0914.HK", "2318.HK"]


def tax_type(code: str) -> str:
    return "红筹居民企业" if code in RED else ("其他" if code in OTHER else "H股")


def read_selection(path: Path) -> list[dict]:
    ws = load_workbook(path, data_only=True)["入选名单"]
    head = [c.value for c in ws[1]]
    out = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or not isinstance(row[0], int):
            continue
        r = dict(zip(head, row))
        out.append(dict(code=r["代码"], name=r["名称"], ind=r["行业"], ttm=F(str(r["近12个月每股派息(港元)"])),
                        close=F(str(r["基准日收盘价(港元)"]))))
    assert len(out) == 15
    for r in out:
        r["y"] = r["ttm"] / r["close"]
    return out


def target_weights(sel: list[dict]):
    tot = sum(r["y"] for r in sel)
    w0 = {r["code"]: r["y"] / tot for r in sel}
    ind = {r["code"]: r["ind"] for r in sel}
    w = dict(w0)
    capped, icapped, rounds = set(), set(), 0
    while True:
        rounds += 1
        changed = False
        for k in sorted(set(ind.values())):
            s = sum(w[c] for c in w if ind[c] == k)
            if s > ICAP:
                for c in w:
                    if ind[c] == k:
                        w[c] = w[c] * ICAP / s
                icapped.add(k)
                changed = True
        for c in w:
            if w[c] > SCAP:
                w[c] = SCAP
                capped.add(c)
                changed = True
        rest = 1 - sum(w.values())
        free = [c for c in w if c not in capped and ind[c] not in icapped]
        if rest != 0 and free:
            base = sum(w0[c] for c in free)
            for c in free:
                w[c] += rest * w0[c] / base
            changed = True
        if not changed:
            break
        assert rounds < 20
    assert sum(w.values()) == 1 and all(v <= SCAP for v in w.values())
    for k in set(ind.values()):
        assert sum(w[c] for c in w if ind[c] == k) <= ICAP
    return w0, w, capped, icapped


def build(sel, w, fx, lots, taxes, fx_inverted=False, notax=False):
    assets = RMB * fx if fx_inverted else RMB / fx
    rows = []
    for r in sel:
        c = r["code"]
        tgt = assets * STOCK * w[c]
        n_lot = math.floor(tgt / r["close"] / lots[c])
        sh = n_lot * lots[c]
        mv = sh * r["close"]
        rate = F(0) if notax else RATE[taxes[c]]
        rows.append(dict(r, lot=lots[c], tgt=tgt, n_lot=n_lot, sh=sh, mv=mv, aw=mv / assets, tax=taxes[c], rate=rate,
                         net=sh * r["ttm"] * (1 - rate)))
    mv = sum(x["mv"] for x in rows)
    net = sum(x["net"] for x in rows)
    ny = net / assets
    cap = ny - FEE
    ok = [t for t in TIERS if t <= cap]
    return dict(assets=assets, rows=rows, mv=mv, cash=assets - mv, net=net, ny=ny, cap=cap, tier=ok[-1] if ok else None)


def tier_text(t) -> str:
    return "不设年度分配目标" if t is None else f"{float(t) * 100:.1f}%"


def main() -> None:
    att = fresh_dir(DST / "题目附件")
    ans = fresh_dir(DST / "标准答案附件")
    (DST / "MCP结果文件").mkdir(exist_ok=True)
    copy_as(RAW / "HKDCNY=X.json", DST / "MCP结果文件" / MCP_FILE)
    info = {x["symbol"]: x for x in json.load(open(LP / "static_info.json", encoding="utf-8"))}

    # 1. 附件
    with open(att / f"{PREFIX}A01_证券资料.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["code", "name", "lot_size", "tax_type"])
        for c in POOL:
            wr.writerow([c, info[c]["name_cn"], info[c]["lot_size"], tax_type(c)])
    copy_as(DOC / "A02_建仓口径.md", att / f"{PREFIX}A02_建仓口径.md")
    copy_as(DOC / "A03_产品要素与交付.md", att / f"{PREFIX}A03_产品要素与交付.md")
    copy_as(DST / "MCP结果文件" / MCP_FILE, att / MCP_FILE)

    # 2. 只用第一轮筛选表、本题附件和 MCP 结果文件重算
    sel = read_selection(PREV)
    a01 = list(csv.DictReader(open(att / f"{PREFIX}A01_证券资料.csv", encoding="utf-8")))
    lots = {r["code"]: int(r["lot_size"]) for r in a01}
    taxes = {r["code"]: r["tax_type"] for r in a01}
    rec, text = load_mcp(att / MCP_FILE)
    fxd = {r["Date"]: r for r in json.loads(text)}
    fx_row = fxd["2026-10-30T00:00:00.000Z"]
    fx = F(f"{fx_row['Close']:.6f}")
    w0, w, capped, icapped = target_weights(sel)
    res = build(sel, w, fx, lots, taxes)

    fl = float
    p4 = lambda x: f"{fl(x) * 100:.4f}%"
    print(f"汇率 {fx}（原始 {fx_row['Close']}），触及单只上限 {capped}，触及行业上限 {icapped}")
    for x in res["rows"]:
        print(f"  {x['code']} {x['name']:6} {x['ind']:4} 初始 {p4(w0[x['code']])} 目标 {p4(w[x['code']])} 手 {x['lot']:>5} "
              f"股数 {x['sh']:>10,} 市值 {fl(x['mv']):>16,.2f} 实际 {p4(x['aw'])} {x['tax']} 税后股息 {fl(x['net']):>14,.2f}")
    print(f"  产品资产 {fl(res['assets']):,.2f} 港元，市值 {fl(res['mv']):,.2f}，现金 {fl(res['cash']):,.2f}（{p4(res['cash'] / res['assets'])}）")
    print(f"  税后股息率 {p4(res['ny'])}，可分配能力 {p4(res['cap'])}，分配目标 {tier_text(res['tier'])}")
    assert res["tier"] == TIERS[0]
    assert res["cap"] - TIERS[0] > F(1, 1000) and TIERS[1] - res["cap"] > F(2, 1000)

    # 常见错误
    wrong = {}
    for kw, label in ((dict(notax=True), "漏算预提税"), (dict(fx_inverted=True), "汇率方向用反")):
        r2 = build(sel, w, fx, lots, taxes, **kw)
        wrong[label] = r2
        print(f"  {label}：产品资产 {fl(r2['assets']):,.2f}，税后股息率 {p4(r2['ny'])}，可分配能力 {p4(r2['cap'])}，目标 {tier_text(r2['tier'])}")
    nofee = res["ny"]
    print(f"  不扣费：{p4(nofee)}，目标 {tier_text([t for t in TIERS if t <= nofee][-1])}")
    w_nocap = {c: v for c, v in w0.items()}
    r3 = build(sel, w_nocap, fx, lots, taxes)
    print(f"  不封顶：税后股息率 {p4(r3['ny'])}，目标 {tier_text(r3['tier'])}")
    assert wrong["漏算预提税"]["tier"] == TIERS[1]

    # 3. 标准答案附件
    r2_ = lambda x: round(fl(x), 2)
    r4p = lambda x: round(fl(x) * 100, 4)
    adj = lambda c, ind: "单只上限" if c in capped else ("行业上限" if ind in icapped else "否（分得缩减的权重）")
    w_head = ["代码", "名称", "行业", "近12个月股息率(%)", "初始权重(%)", "目标权重(%)", "是否被上限调整"]
    w_rows = [[r["code"], r["name"], r["ind"], r4p(r["y"]), r4p(w0[r["code"]]), r4p(w[r["code"]]), adj(r["code"], r["ind"])] for r in sel]
    b_head = ["代码", "名称", "每手股数", "基准日收盘价(港元)", "目标金额(港元)", "建仓股数", "手数", "建仓市值(港元)", "实际权重(%)",
              "税务类别", "预提税率(%)", "近12个月每股派息(港元)", "税后年股息(港元)"]
    b_rows = [[x["code"], x["name"], x["lot"], fl(x["close"]), r2_(x["tgt"]), x["sh"], x["n_lot"], r2_(x["mv"]), r4p(x["aw"]),
               x["tax"], int(x["rate"] * 100), round(fl(x["ttm"]), 4), r2_(x["net"])] for x in res["rows"]]
    by_tax = {k: sum((x["net"] for x in res["rows"] if x["tax"] == k), F(0)) for k in RATE}
    stock_tgt = res["assets"] * STOCK
    s_rows = [
        ["港币兑人民币汇率（1港元折合人民币）", fl(fx)], ["募集金额(人民币)", r2_(RMB)], ["产品资产(港元)", r2_(res["assets"])],
        ["股票仓位目标(港元)", r2_(stock_tgt)], ["建仓市值合计(港元)", r2_(res["mv"])], ["现金(港元)", r2_(res["cash"])],
        ["现金占产品资产(%)", r4p(res["cash"] / res["assets"])], ["税后年股息合计(港元)", r2_(res["net"])],
        ["税后股息率(%)", r4p(res["ny"])], ["管理费率+托管费率(%)", r4p(FEE)], ["可分配能力(%)", r4p(res["cap"])],
        ["年度分配目标", tier_text(res["tier"])],
    ] + [[f"税后年股息：{k}(港元)", r2_(v)] for k, v in by_tax.items()]
    fx_dates = [d for d in sorted(fxd) if "2026-10-26" <= d[:10] <= "2026-11-03"]
    o_rows = [[d, round(fxd[d]["Close"], 6)] for d in fx_dates]
    write_xlsx(
        ans / "港股红利组合建仓方案表.xlsx",
        [("目标权重", w_head, w_rows), ("建仓清单", b_head, b_rows), ("汇总", ["项目", "数值"], s_rows),
         ("在线数据", ["MCP返回的Date(UTC)", "HKDCNY收盘价"], o_rows)],
        notes={
            "目标权重": [f"初始权重 = 近12个月股息率 ÷ 15只之和。中国移动初始权重 {p4(w0['0941.HK'])}，超过8%，降到8%；"
                     f"银行四只初始合计 {p4(sum(w0[r['code']] for r in sel if r['ind'] == '银行'))}，超过25%，按比例缩到25%。",
                     "缩下来的权重按初始权重的比例分给其余10只；分完后没有再超限。"],
            "建仓清单": ["建仓股数 = 目标金额 ÷ 基准日收盘价，向下取整到每手股数的整数倍；实际权重 = 建仓市值 ÷ 产品资产。",
                     "预提税率：H股10%，红筹居民企业10%，其他0%。"],
            "汇总": [f"可分配能力 {p4(res['cap'])}，不低于4.0%、低于4.5%，年度分配目标取4.0%。"],
            "在线数据": [
                source_line(rec).replace("代码 HKDCNY=X", "代码 HKDCNY=X（1港元折合人民币）"),
                f"返回 {len(fxd)} 行。外汇行情的 Date 是伦敦时间零点对应的 UTC 时间：英国夏令时期间写成前一天 23:00，10-25 之后是当天 00:00。",
                f"2026-10-30 对应的是 2026-10-30T00:00:00.000Z 这一行，收盘价 {fx_row['Close']}，保留6位小数为 {fl(fx):.6f}。",
                f"产品资产 = 800,000,000 ÷ {fl(fx):.6f} = {fl(res['assets']):,.2f} 港元。",
            ],
        },
    )
    top_cap = next(x for x in res["rows"] if x["code"] in capped)
    banks = [x for x in res["rows"] if x["ind"] == "银行"]
    wt = wrong["漏算预提税"]
    write_docx(
        ans / "港股红利组合建仓方案说明.docx",
        "港股红利组合建仓方案说明",
        [
            ("结论", [f"年度分配目标定为 {tier_text(res['tier'])}。税后股息率 {p4(res['ny'])}，减去管理费 0.75% 和托管费 0.15% 后，可分配能力 {p4(res['cap'])}，"
                    "不低于4.0%、低于4.5%，按规则取不超过可分配能力的最高一档。"]),
            ("资金和现金", [f"募集人民币 800,000,000 元，按 2026-10-30 港币兑人民币 {fl(fx):.6f} 折合产品资产 {fl(res['assets']):,.2f} 港元。"
                       f"股票仓位目标 {fl(stock_tgt):,.2f} 港元，按每手股数向下取整后建仓市值合计 {fl(res['mv']):,.2f} 港元，"
                       f"现金 {fl(res['cash']):,.2f} 港元，占产品资产 {p4(res['cash'] / res['assets'])}。"]),
            ("权重调整", [f"中国移动初始权重 {p4(w0['0941.HK'])}，超过单只上限，降到8%。",
                       f"银行四只（{'、'.join(x['name'] for x in banks)}）初始合计 {p4(sum(w0[x['code']] for x in banks))}，超过行业上限，按比例缩到25%："
                       + "，".join(f"{x['name']} {p4(w[x['code']])}" for x in banks) + "。",
                       "缩下来的权重按初始权重的比例分给其余10只，分完后没有股票或行业再超限。公用事业四只合计 "
                       f"{p4(sum(w[x['code']] for x in res['rows'] if x['ind'] == '公用事业'))}，电信两只合计 "
                       f"{p4(sum(w[x['code']] for x in res['rows'] if x['ind'] == '电信'))}，都在25%以内。"]),
            ("税后股息", [f"税后年股息合计 {fl(res['net']):,.2f} 港元。" + "；".join(f"{k} {fl(v):,.2f} 港元" for k, v in by_tax.items()) + "。",
                       f"H股和红筹居民企业预提10%，其他0%。如果不扣预提税，税后股息率会算成 {p4(wt['ny'])}，可分配能力 {p4(wt['cap'])}，"
                       f"分配目标会错成 {tier_text(wt['tier'])}。"]),
            ("对应材料", ["15只股票的初始权重和目标权重见《港股红利组合建仓方案表.xlsx》的「目标权重」，建仓股数、市值和税后年股息见「建仓清单」，"
                      "产品资产、现金、税后股息率和分配目标见「汇总」，汇率和查询信息见「在线数据」。"]),
        ],
    )
    print("查询时间", rec["查询时间"])


if __name__ == "__main__":
    main()
