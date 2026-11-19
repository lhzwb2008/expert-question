#!/usr/bin/env python3
"""打包「定增优选1号」解禁减持的三轮题（28 筛查 → 29 11月排程 → 30 上半月执行复核）。
29 读 28 的标答《定增解禁减持筛查表.xlsx》，30 读 28 的筛查表和 29 的《11月减持排程表.xlsx》，都原样复制进后一轮的题目附件。
价格和成交量全部通过 US Stocks MCP 查（fetch_新题.py 的 定增筛查/定增排程/定增复核）；总股本取自 LongPort 证券资料。
持仓、成本、解禁日、历史减持记录、成交回报是按题目需要拟的。
"""
from __future__ import annotations

import csv
import datetime as dt
import math
from pathlib import Path

import pandas as pd
from openpyxl import load_workbook

from build_common import OUT, copy_as, fresh_dir, load_mcp_prices, source_line, write_docx, write_xlsx

HERE = Path(__file__).resolve().parent
RAW = HERE / "新题数据"
DOC = HERE / "新题口径"
D28 = OUT / "题目" / "28_定增解禁减持筛查"
D29 = OUT / "题目" / "29_定增减持11月排程"
D30 = OUT / "题目" / "30_定增减持执行复核"
BASE, START, END, REV = "2026-10-30", "2026-11-02", "2026-11-30", "2026-11-17"
# 代码, MCP代码, 名称, 总股本, 本产品持股, 成本价, 解禁日
POS = [("002371", "002371.SZ", "北方华创", 727953799, 2000000, 520.00, "2026-10-16"),
       ("688012", "688012.SS", "中微公司", 957842348, 6000000, 180.00, "2026-09-21"),
       ("603986", "603986.SS", "兆易创新", 703971427, 3000000, 200.00, "2026-10-26"),
       ("002049", "002049.SZ", "紫光国微", 843233778, 4000000, 42.00, "2026-11-09"),
       ("600584", "600584.SS", "长电科技", 1789414570, 10000000, 38.00, "2026-08-28")]
NAME = {p[0]: p[2] for p in POS}
MGR, OTHER = "本公司", "华南某基金管理公司"
# 日期, 管理人, 产品, 代码, 股数
LEDGER = [("2026-08-04", MGR, "定增优选2号", "688012", 1500000),
          ("2026-08-10", MGR, "定增优选2号", "688012", 1000000), ("2026-08-11", MGR, "定增优选2号", "688012", 1000000),
          ("2026-08-12", MGR, "定增优选2号", "688012", 1000000), ("2026-08-13", MGR, "定增优选2号", "688012", 1000000),
          ("2026-08-14", MGR, "定增优选2号", "688012", 1000000),
          ("2026-08-20", MGR, "多策略稳健1号", "600584", 6000000),
          ("2026-09-15", MGR, "定增优选2号", "600584", 6000000),
          ("2026-09-22", OTHER, "某定增专户", "688012", 3000000),
          ("2026-10-12", MGR, "定增优选1号", "688012", 1000000), ("2026-10-13", MGR, "定增优选1号", "688012", 1000000)]
CAP_RATE, WIN = 0.05, 90
FEE = dict(comm=0.00025, stamp=0.0005, trans=0.00001)

d_ = dt.date.fromisoformat
pc = lambda x: f"{x * 100:.2f}%"
w2 = lambda x: f"{x:,.2f}"
r2 = lambda x: round(x + 1e-9, 2)


def in_win(sale: str, day: str) -> bool:
    return d_(day) - dt.timedelta(days=WIN - 1) <= d_(sale) <= d_(day)


def mcp(kind: str, code: str):
    sym = next(p[1] for p in POS if p[0] == code)
    rec, m = load_mcp_prices(RAW / kind / f"{sym}.json", 8)
    return rec, m[m.Close.notna()]


def nov_days():
    out, x = [], d_(START)
    while x <= d_(END):
        if x.weekday() < 5:
            out.append(x.isoformat())
        x += dt.timedelta(days=1)
    return out


# ---------------- 28 ----------------
def q28():
    att, ans = fresh_dir(D28 / "题目附件"), fresh_dir(D28 / "标准答案附件")
    (D28 / "MCP结果文件").mkdir(exist_ok=True)
    files = {}
    for p in POS:
        fn = f"筛查_MCP_{p[2]}日线.json"
        copy_as(RAW / "定增筛查" / f"{p[1]}.json", D28 / "MCP结果文件" / fn)
        copy_as(D28 / "MCP结果文件" / fn, att / fn)
        files[p[0]] = fn
    with open(att / "筛查_A01_定增持仓与解禁安排.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["证券代码", "证券名称", "总股本(股)", "本产品持股(股)", "定增成本价(元)", "解禁日"])
        for p in POS:
            wr.writerow([p[0], p[2], p[3], p[4], f"{p[5]:.2f}", p[6]])
    with open(att / "筛查_A02_近期减持记录.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["卖出日", "管理人", "产品", "证券代码", "证券名称", "方式", "卖出股数(股)"])
        for x in LEDGER:
            wr.writerow([x[0], x[1], x[2], x[3], NAME[x[3]], "集中竞价", x[4]])
    copy_as(DOC / "定增筛查" / "A03_筛查口径与交付.md", att / "筛查_A03_筛查口径与交付.md")

    # 只用附件重算
    a01 = pd.read_csv(att / "筛查_A01_定增持仓与解禁安排.csv", dtype={"证券代码": str})
    a02 = pd.read_csv(att / "筛查_A02_近期减持记录.csv", dtype={"证券代码": str})
    rows, quota, recs, px20 = [], {}, {}, {}
    for r in a01.itertuples(index=False):
        code = r[0]
        rec, m = load_mcp_prices(att / files[code], 8)
        m = m[m.Close.notna()]
        recs[code] = (rec, m)
        assert float(m.Dividends.loc["2026-09-25":BASE].abs().sum()) == 0
        last = m.loc[:BASE].tail(20)
        px20[code] = last
        lo_day = last.Close.idxmin()
        lo = round(float(last.Close.min()), 2)
        loss = lo < r[4]
        unlocked = r[5] <= END
        listed = unlocked and not loss
        first = max(r[5], START) if listed else ""
        why = "最近20个交易日最低收盘价低于定增成本价，11月不减持" if loss else (f"{r[5]} 解禁，从解禁日起可卖" if r[5] > START else "已解禁，不浮亏")
        q1 = int(math.floor(r[2] * 0.01))
        used = int(sum(x[6] for x in a02.itertuples(index=False) if x[3] == code and x[1] == MGR and in_win(x[0], START)))
        quota[code] = dict(q1=q1, used=used, avail=q1 - used)
        rows.append(dict(code=code, name=r[1], tot=int(r[2]), hold=int(r[3]), cost=float(r[4]), unlock=r[5], first=first, lo=lo, lo_day=lo_day,
                         loss=loss, listed=listed, why=why, start20=last.index[0]))
    for x in rows:
        print(f"[28] {x['code']} {x['name']} 最低 {x['lo']}({x['lo_day']}) 成本 {x['cost']} 列入 {x['listed']} 额度 {quota[x['code']]}")
    assert [x["code"] for x in rows if not x["listed"]] == ["002371"]
    for x in rows:
        if x["listed"]:
            assert x["lo"] > x["cost"] * 1.1
    led_rows = []
    for x in LEDGER:
        inw = in_win(x[0], START)
        why = "其他管理人，不合并计算" if x[1] != MGR else ("在窗口内" if inw else "早于窗口起点 2026-08-05")
        led_rows.append([x[0], x[1], x[2], x[3], NAME[x[3]], x[4], "是" if (x[1] == MGR and inw) else "否", why])
    l_rows = [[x["code"], x["name"], x["hold"], x["cost"], x["unlock"], x["first"], x["lo"], x["lo_day"], "是" if x["loss"] else "否",
               "列入" if x["listed"] else "不列入", x["why"]] for x in rows]
    q_rows = [[x["code"], x["name"], x["tot"], quota[x["code"]]["q1"], quota[x["code"]]["used"], quota[x["code"]]["avail"]] for x in rows]
    o_rows = []
    for x in rows:
        rec, m = recs[x["code"]]
        for d in px20[x["code"]].index:
            o_rows.append([x["code"], d, str(m.Date[d]), round(float(m.Close[d]), 2)])
    write_xlsx(ans / "定增解禁减持筛查表.xlsx",
               [("减持名单", ["代码", "名称", "本产品持股(股)", "定增成本价(元)", "解禁日", "最早可卖日", "最近20个交易日最低收盘价(元)", "最低价日期", "是否浮亏",
                          "是否列入", "原因"], l_rows),
                ("额度占用", ["卖出日", "管理人", "产品", "代码", "名称", "股数", "是否计入11-02窗口", "原因"], led_rows),
                ("11-02额度", ["代码", "名称", "总股本(股)", "1%额度(股)", "窗口内已用(股)", "11-02可用额度(股)"], q_rows),
                ("在线数据", ["代码", "交易日(北京时间)", "返回的Date(UTC)", "收盘价(元)"], o_rows)],
               notes={"减持名单": [f"最近 20 个交易日为 {rows[0]['start20']} 至 {BASE}。"],
                      "额度占用": ["11-02 的窗口是 2026-08-05 至 2026-11-02。只合并本公司管理的产品。"],
                      "11-02额度": ["1% 额度按总股本计算，向下取整到股。"],
                      "在线数据": [source_line(recs[c][0]) for c in recs] + ["Date 是 UTC 16:00，加 8 小时后的日期是交易日。这 20 个交易日里没有除权除息，Close 和不复权收盘价相同。"]})
    li = [x for x in rows if x["listed"]]
    write_docx(ans / "定增解禁减持筛查说明.docx", "定增优选1号 解禁持仓11月减持前筛查说明", [
        ("结论", ["列入 11 月减持名单的 4 只：" + "、".join(f"{x['name']}（11-02 可用额度 {quota[x['code']]['avail']:,} 股{'，' + x['first'] + ' 起可卖' if x['first'] > START else ''}）" for x in li) + "。",
                "北方华创不减持：最近 20 个交易日最低收盘价 {:.2f} 元（{}），低于定增成本价 {:.2f} 元。".format(rows[0]["lo"], rows[0]["lo_day"], rows[0]["cost"])]),
        ("额度", [f"{x['name']}：总股本 {x['tot']:,} 股，1% 额度 {quota[x['code']]['q1']:,} 股，窗口内本公司已卖 {quota[x['code']]['used']:,} 股，11-02 可用 {quota[x['code']]['avail']:,} 股。" for x in rows],),
        ("额度占用里没计入的", ["中微公司 2026-08-04 定增优选2号卖出 1,500,000 股，早于 11-02 窗口起点 2026-08-05，不占额度。",
                         "中微公司 2026-09-22 华南某基金管理公司卖出 3,000,000 股，不是本公司管理的产品，不合并。"]),
        ("数据", ["5 只股票收盘价通过 US Stocks MCP 查询，Date 加 8 小时取交易日；这 20 个交易日没有除权除息，Close 就是不复权收盘价。"]),
    ])
    return rows, quota


# ---------------- 29 ----------------
def read28(path: Path):
    wb = load_workbook(path, data_only=True)
    lst = {}
    for r in wb["减持名单"].iter_rows(min_row=2, values_only=True):
        if r and r[0] and r[9] in ("列入", "不列入"):
            lst[str(r[0])] = dict(name=r[1], hold=int(r[2]), cost=float(r[3]), unlock=r[4], first=r[5], listed=r[9] == "列入")
    led = [(r[0], str(r[3]), int(r[5])) for r in wb["额度占用"].iter_rows(min_row=2, values_only=True) if r and r[0] and r[6] == "是"]
    q = {str(r[0]): int(r[3]) for r in wb["11-02额度"].iter_rows(min_row=2, values_only=True) if r and r[0] and str(r[0]).isdigit()}
    return lst, led, q


def schedule(lst, led, q1, cap, days):
    hist = list(led)
    plan, rows = {}, []
    for code, x in lst.items():
        if not x["listed"]:
            continue
        left = x["hold"]
        for d in days:
            used = sum(s for (dd, c, s) in hist if c == code and in_win(dd, d))
            room = q1[code] - used
            if left == 0:
                n, why = 0, "已卖完"
            elif d < x["first"]:
                n, why = 0, "未解禁"
            else:
                cand = {"单日上限": cap[code], "90日额度": room, "剩余持股": left}
                why = min(cand, key=lambda k: cand[k])
                n = max(0, cand[why] // 100 * 100)
            if n:
                hist.append((d, code, n))
                left -= n
                plan[(d, code)] = n
            rows.append([d, code, x["name"], cap[code], room, left + n, n, why])
    return plan, rows


def q29(r28):
    att, ans = fresh_dir(D29 / "题目附件"), fresh_dir(D29 / "标准答案附件")
    (D29 / "MCP结果文件").mkdir(exist_ok=True)
    copy_as(D28 / "标准答案附件" / "定增解禁减持筛查表.xlsx", att / "定增解禁减持筛查表.xlsx")
    copy_as(DOC / "定增排程" / "A01_排程口径与交付.md", att / "排程_A01_排程口径与交付.md")
    files = {}
    for p in POS:
        if p[0] == "002371":  # 筛查没列入，排程用不到
            continue
        fn = f"排程_MCP_{p[2]}日线.json"
        copy_as(RAW / "定增排程" / f"{p[1]}.json", D29 / "MCP结果文件" / fn)
        copy_as(D29 / "MCP结果文件" / fn, att / fn)
        files[p[0]] = fn
    lst, led, q1 = read28(att / "定增解禁减持筛查表.xlsx")
    cap, adv, recs, rng = {}, {}, {}, {}
    for code in [c for c in lst if lst[c]["listed"]]:
        rec, m = load_mcp_prices(att / files[code], 8)
        m = m[m.Close.notna()]
        recs[code] = (rec, m)
        last = m.loc[:BASE].tail(20)
        adv[code] = float(last.Volume.mean())
        cap[code] = int(adv[code] * CAP_RATE // 100 * 100)
        rng[code] = (last.index[0], last.index[-1])
    days = nov_days()
    assert len(days) == 21
    plan, rows = schedule(lst, led, q1, cap, days)
    s_rows, summ = [], {}
    for code, x in lst.items():
        if not x["listed"]:
            continue
        ds = [d for d in days if plan.get((d, code))]
        tot = sum(plan.get((d, code), 0) for d in days)
        pause = [d for d in days if ds and ds[0] <= d <= ds[-1] and not plan.get((d, code))]
        summ[code] = dict(tot=tot, first=ds[0], last=ds[-1], left=x["hold"] - tot, pause=pause)
        s_rows.append([code, x["name"], x["hold"], cap[code], tot, ds[0], ds[-1], x["hold"] - tot, "、".join(pause) or "无"])
        print(f"[29] {code} {x['name']} cap {cap[code]} 合计 {tot} {ds[0]}~{ds[-1]} 剩 {x['hold'] - tot} 停 {pause}")
    assert all(v["left"] == 0 for v in summ.values())
    assert summ["688012"]["pause"] and summ["600584"]["pause"]
    c_rows = [[code, lst[code]["name"], rng[code][0], rng[code][1], round(adv[code], 2), round(adv[code] * CAP_RATE, 2), cap[code]] for code in lst if lst[code]["listed"]]
    o_rows = [[code, d, str(recs[code][1].Date[d]), int(recs[code][1].Volume[d])] for code in lst if lst[code]["listed"] for d in recs[code][1].loc[:BASE].tail(20).index]
    write_xlsx(ans / "11月减持排程表.xlsx",
               [("单日上限", ["代码", "名称", "起始日", "截止日", "20日日均成交量(股)", "×5%(股)", "单日上限(股)"], c_rows),
                ("逐日排程", ["交易日", "代码", "名称", "单日上限(股)", "当天90日额度剩余(股)", "当天卖前剩余持股(股)", "计划卖出(股)", "卡在哪一项"], rows),
                ("排程汇总", ["代码", "名称", "本产品持股(股)", "单日上限(股)", "11月计划卖出合计(股)", "第一天", "最后一天", "11月底剩余(股)", "中间停卖的交易日"], s_rows),
                ("在线数据", ["代码", "交易日(北京时间)", "返回的Date(UTC)", "成交量(股)"], o_rows)],
               notes={"逐日排程": ["当天 90 日额度剩余 = 1% 额度 − 往前 89 天到当天窗口里本公司已卖和本排程已排的股数（不含当天）。计划卖出取三项最小值，向下取到 100 股。"],
                      "在线数据": [source_line(recs[c][0]) for c in recs if lst[c]["listed"]] + ["Date 是 UTC 16:00，加 8 小时取交易日。Volume 单位是股。"]})
    li = [c for c in lst if lst[c]["listed"]]
    write_docx(ans / "11月减持排程说明.docx", "定增优选1号 11月集中竞价减持排程说明", [
        ("结论", ["11 月排 4 只，全部能在月内卖完：" + "；".join(f"{lst[c]['name']} {summ[c]['tot']:,} 股，{summ[c]['first']} 至 {summ[c]['last']}" for c in li) + "。北方华创筛查没列入，不排。"]),
        ("单日上限", [f"{lst[c]['name']}：10-30 往前 20 个交易日日均成交量 {adv[c]:,.2f} 股，5% 取整后每天最多 {cap[c]:,} 股。" for c in li]),
        ("额度停卖", [f"{lst[c]['name']}：{'、'.join(summ[c]['pause'])} 因为 90 日额度用完停卖，等早先的卖出出了窗口再接着卖。" for c in li if summ[c]["pause"]]
         + [f"紫光国微 {lst['002049']['first']} 解禁，从这天起排。"]),
        ("数据", ["成交量通过 US Stocks MCP 查询，Date 加 8 小时取交易日，单位是股。"]),
    ])
    return dict(lst=lst, led=led, q1=q1, cap=cap, plan=plan, days=days)


# ---------------- 30 ----------------
def fees(amt):
    c = max(5.0, r2(amt * FEE["comm"]))
    return c, r2(amt * FEE["stamp"]), r2(amt * FEE["trans"])


def q30(r29):
    att, ans = fresh_dir(D30 / "题目附件"), fresh_dir(D30 / "标准答案附件")
    (D30 / "MCP结果文件").mkdir(exist_ok=True)
    copy_as(D28 / "标准答案附件" / "定增解禁减持筛查表.xlsx", att / "定增解禁减持筛查表.xlsx")
    copy_as(D29 / "标准答案附件" / "11月减持排程表.xlsx", att / "11月减持排程表.xlsx")
    copy_as(DOC / "定增复核" / "A02_复核口径与交付.md", att / "复核_A02_复核口径与交付.md")
    files = {}
    for p in POS:
        fn = f"复核_MCP_{p[2]}日线.json"
        copy_as(RAW / "定增复核" / f"{p[1]}.json", D30 / "MCP结果文件" / fn)
        copy_as(D30 / "MCP结果文件" / fn, att / fn)
        files[p[0]] = fn
    hl = {}
    for p in POS:
        rec, m = load_mcp_prices(att / files[p[0]], 8)
        hl[p[0]] = (rec, m[m.Close.notna()])
    days = [d for d in r29["days"] if d <= REV]
    assert len(days) == 12
    plan, cap = r29["plan"], r29["cap"]
    vw = lambda c, d: round((float(hl[c][1].High[d]) + float(hl[c][1].Low[d]) + float(hl[c][1].Close[d])) / 3, 2)
    fills = {k: v for k, v in plan.items() if k[0] <= REV}
    fills[("2026-11-05", "688012")] = cap["688012"]  # 额度只剩七万多，交易部按单日上限卖
    fills[("2026-11-12", "002049")] = 650000          # 超单日上限
    fills[("2026-11-10", "002371")] = 100000          # 不在名单
    p03 = sorted(d for (d, c) in fills if c == "603986")
    fills[(p03[0], "603986")] = 1000000               # 和排程不一样，但不违规
    fills[(p03[1], "603986")] = 1200000
    fills[("2026-11-04", "603986")] = 800000
    if True:  # 交易部超卖以后，后面几天照单日上限卖到持股卖完为止
        fills[("2026-11-09", "688012")] = cap["688012"]
        hold = {p[0]: p[4] for p in POS}
        for k in sorted(fills):
            n = min(fills[k], hold[k[1]])
            hold[k[1]] -= n
            if n:
                fills[k] = n
            else:
                del fills[k]
    price = {k: vw(k[1], k[0]) for k in fills}
    bad_px = ("2026-11-03", "600584")
    price[bad_px] = round(float(hl["600584"][1].High[bad_px[0]]) + 1.00, 2)  # 录错
    a01 = sorted(fills.items())
    with open(att / "复核_A01_交易部成交回报.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["成交日", "证券代码", "证券名称", "方向", "成交股数(股)", "成交均价(元)"])
        for (d, c), n in a01:
            wr.writerow([d, c, NAME[c], "卖出", n, f"{price[(d, c)]:.2f}"])
    # ---- 只用附件重算 ----
    lst, led, q1 = read28(att / "定增解禁减持筛查表.xlsx")
    wb = load_workbook(att / "11月减持排程表.xlsx", data_only=True)
    capx = {str(r[0]): int(r[6]) for r in wb["单日上限"].iter_rows(min_row=2, values_only=True) if r and r[0] and str(r[0]).isdigit()}
    planx = {}
    for r in wb["逐日排程"].iter_rows(min_row=2, values_only=True):
        if r and r[0] and str(r[0]).startswith("2026") and r[6]:
            planx[(r[0], str(r[1]))] = int(r[6])
    assert capx == cap and planx == plan
    rep = pd.read_csv(att / "复核_A01_交易部成交回报.csv", dtype={"证券代码": str})
    hist = list(led)
    chk, viol, money = [], [], {}
    for r in rep.sort_values(["成交日", "证券代码"]).itertuples(index=False):
        d, c, n, p = r[0], r[1], int(r[4]), float(r[5])
        lo, hi = float(hl[c][1].Low[d]), float(hl[c][1].High[d])
        hist.append((d, c, n))
        cum = sum(s for (dd, cc, s) in hist if cc == c and in_win(dd, d))
        listed = lst[c]["listed"]
        ok = dict(名单=listed, 价格=lo - 1e-9 <= p <= hi + 1e-9, 成本=p >= lst[c]["cost"], 上限=(n <= capx.get(c, 0)) if listed else None, 额度=cum <= q1[c])
        chk.append([d, c, NAME[c], n, p, round(lo, 2), round(hi, 2), lst[c]["cost"]] + ["通过" if v else ("不适用" if v is None else "不通过") for v in ok.values()] + [cum, q1[c]])
        if not ok["名单"]:
            viol.append([d, c, NAME[c], "名单", f"筛查未列入仍卖出 {n:,} 股", "立即停止卖出，报合规负责人"])
        if not ok["价格"]:
            viol.append([d, c, NAME[c], "价格真实性", f"成交均价 {p:.2f} 元不在当天 {lo:.2f}–{hi:.2f} 元内", "回报录错，要求交易部更正"])
        if not ok["成本"]:
            viol.append([d, c, NAME[c], "成本", f"成交均价 {p:.2f} 元低于成本 {lst[c]['cost']:.2f} 元", "报投委会"])
        if ok["上限"] is False:
            viol.append([d, c, NAME[c], "单日上限", f"卖出 {n:,} 股，超过单日上限 {capx[c]:,} 股 {n - capx[c]:,} 股", "提醒交易部，后续按排程"])
        if not ok["额度"]:
            viol.append([d, c, NAME[c], "90日额度", f"窗口累计 {cum:,} 股，超过 1% 额度 {q1[c]:,} 股 {cum - q1[c]:,} 股", "违反投委会 90 日 1% 的减持纪律，报合规负责人和投委会，窗口回到额度内之前暂停卖出"])
        amt = r2(n * p)
        cm, st, tr = fees(amt)
        net = r2(amt - cm - st - tr)
        g = money.setdefault(c, dict(n=0, amt=0.0, fee=0.0, net=0.0, pnl=0.0))
        g["n"] += n; g["amt"] = r2(g["amt"] + amt); g["fee"] = r2(g["fee"] + cm + st + tr); g["net"] = r2(g["net"] + net)
        g["pnl"] = r2(g["pnl"] + net - n * lst[c]["cost"])
    for v in viol:
        print("[30]", v)
    kinds = [(v[0], v[1], v[3]) for v in viol]
    assert ("2026-11-10", "002371", "名单") in kinds and ("2026-11-03", "600584", "价格真实性") in kinds
    assert ("2026-11-12", "002049", "单日上限") in kinds and ("2026-11-05", "688012", "90日额度") in kinds
    assert not [k for k in kinds if k[2] == "成本"] and not [k for k in kinds if k[1] == "603986"]
    assert len(viol) == 4
    o88 = [v for v in viol if v[1] == "688012"]
    s_rows = []
    tot = dict(n=0, pn=0, amt=0.0, fee=0.0, net=0.0, pnl=0.0)
    for c in NAME:
        g = money.get(c, dict(n=0, amt=0.0, fee=0.0, net=0.0, pnl=0.0))
        pn = sum(v for (d, cc), v in plan.items() if cc == c and d <= REV)
        s_rows.append([c, NAME[c], g["n"], pn, g["n"] - pn, g["amt"], g["fee"], g["net"], g["pnl"], lst[c]["hold"] - g["n"]])
        for k, v in (("n", g["n"]), ("pn", pn), ("amt", g["amt"]), ("fee", g["fee"]), ("net", g["net"]), ("pnl", g["pnl"])):
            tot[k] = r2(tot[k] + v) if isinstance(v, float) else tot[k] + v
    s_rows.append(["合计", "", tot["n"], tot["pn"], tot["n"] - tot["pn"], tot["amt"], tot["fee"], tot["net"], tot["pnl"], ""])
    print(f"[30] 合计 卖 {tot['n']:,} 计划 {tot['pn']:,} 金额 {tot['amt']:,.2f} 费 {tot['fee']:,.2f} 净 {tot['net']:,.2f} 收益 {tot['pnl']:,.2f}")
    o_rows = [[c, d, str(hl[c][1].Date[d]), round(float(hl[c][1].Low[d]), 2), round(float(hl[c][1].High[d]), 2)] for (d, c) in sorted({(r[0], r[1]) for r in rep.itertuples(index=False)})]
    write_xlsx(ans / "11月上半月减持复核表.xlsx",
               [("成交核对", ["成交日", "代码", "名称", "成交股数", "成交均价", "当天最低价", "当天最高价", "成本价", "名单", "价格真实性", "不低于成本", "单日上限", "90日额度",
                          "成交后窗口累计(股)", "1%额度(股)"], chk),
                ("违规清单", ["日期", "代码", "名称", "哪一条", "情况", "处理"], viol),
                ("收益汇总", ["代码", "名称", "实际卖出(股)", "计划卖出(股)", "差额(股)", "成交金额(元)", "费用(元)", "净额(元)", "已实现收益(元)", "11-17日终剩余持股(股)"], s_rows),
                ("在线数据", ["代码", "交易日(北京时间)", "返回的Date(UTC)", "最低价(元)", "最高价(元)"], o_rows)],
               notes={"成交核对": ["窗口累计含筛查表「额度占用」里计入的历史记录和 11 月实际成交。北方华创不在名单，单日上限不适用。"],
                      "收益汇总": ["已实现收益 = 净额 − 成交股数 × 定增成本价。"],
                      "在线数据": [source_line(hl[c][0]) for c in NAME] + ["Date 是 UTC 16:00，加 8 小时取交易日，这段时间没有除权除息。"]})
    write_docx(ans / "11月上半月减持复核意见.docx", "定增优选1号 11月上半月减持执行复核意见", [
        ("违规", [f"{v[0]} {v[2]}（{v[3]}）：{v[4]}。处理：{v[5]}。" for v in viol]),
        ("和排程的差异", [f"{r[1]}：实际卖出 {r[2]:,} 股，计划 {r[3]:,} 股，差 {r[4]:+,} 股。" for r in s_rows[:-1]]
         + ["兆易创新的节奏和排程不同（三天卖完），但每天都在单日上限和额度内，不算违规。"]),
        ("卖了多少钱", [f"11-02 至 11-17 合计卖出 {tot['n']:,} 股，成交金额 {w2(tot['amt'])} 元，费用 {w2(tot['fee'])} 元，净额 {w2(tot['net'])} 元，已实现收益 {w2(tot['pnl'])} 元。"]
         + [f"{r[1]}：成交金额 {w2(r[5])} 元，净额 {w2(r[7])} 元，已实现收益 {w2(r[8])} 元，11-17 日终剩余 {r[9]:,} 股。" for r in s_rows[:-1] if r[2]]
         + [f"长电科技 {bad_px[0]} 的成交均价是录错的，金额先按回报算，更正后要重算。"]),
        ("数据", ["当天最低价、最高价通过 US Stocks MCP 查询，Date 加 8 小时取交易日。"]),
    ])
    return dict(viol=viol, money=money, tot=tot, s_rows=s_rows, chk=chk)


if __name__ == "__main__":
    rows, quota = q28()
    r29 = q29((rows, quota))
    q30(r29)
