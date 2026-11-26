#!/usr/bin/env python3
"""生成 11 题（沪深股票多头组合四季度调仓指令复核）的补充材料，输出到本目录。
2026-11-26 最终质检返修补的背景、历史和版本材料：三季度持仓与现金历史、三季度调仓的限额复核和执行回顾、
旧版调仓口径（已废止）与修订记录、四季度目标权重第一稿（已废止）与审议记录、收盘价快照的形成与核对记录、
交易部执行约束、费率安排和工作计划。

行情全部是实际取数，原始返回在 _工具/新题数据/调仓指令_补充/：
- LongPort 不复权日线（*_noadj.json，成交量单位是手，乘 100 换成股）；
- LongPort 当月可查代码数超限的 8 只，用 US Stocks MCP 的一年日线（*_mcp.json）。MCP 的收盘价按分红做过前复权，
  这里按返回里的 Dividends 列逐次还原成不复权价（除息前一日不复权收盘 = 复权收盘 ÷ 累计因子 + 每股派息），
  还原后都落在分位上；同一方法对 601398、600030 两只和 LongPort 不复权价逐日比对，164 个交易日全部一致。
持股数、现金、费率、人员和审议过程是延续本题场景拟的。本脚本不联网，重跑结果只差 docx 的生成时间。
新材料不写本题基准日 2026-10-30 的中芯国际收盘价、组合净资产、四季度目标股数、订单和复核结论。
"""
from __future__ import annotations
import csv
import glob
import json
import sys
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal as D
from pathlib import Path
import pandas as pd
HERE = Path(__file__).resolve().parent
TOOLS = HERE.parents[1]
sys.path.insert(0, str(TOOLS))
from build_common import load_mcp_prices, scrub_office, write_docx  # noqa: E402
from build_common import write_xlsx as _write_xlsx  # noqa: E402
RAW = TOOLS / "新题数据" / "调仓指令_补充"
OLD_RAW = TOOLS / "新题数据" / "调仓指令"
P = "调仓指令_"
CENT = D("0.01")
# A01 的顺序和持股数（2026-10-30 收盘后），和 build_调仓指令.py 的 HOLD 相同
HOLD = [
    ("601318.SH", "中国平安", "主板", 603200, "0.060", "非银金融"),
    ("601166.SH", "兴业银行", "主板", 1279900, "0.050", "银行"),
    ("600900.SH", "长江电力", "主板", 1211800, "0.060", "公用事业"),
    ("601398.SH", "工商银行", "主板", 3359400, "0.075", "银行"),
    ("600030.SH", "中信证券", "主板", 794100, "0.055", "非银金融"),
    ("600276.SH", "恒瑞医药", "主板", 561300, "0.055", "医药"),
    ("601899.SH", "紫金矿业", "主板", 1113700, "0.040", "有色金属"),
    ("600309.SH", "万华化学", "主板", 209300, "0.045", "化工"),
    ("601012.SH", "隆基绿能", "主板", 1136400, "0.000", "电力设备"),
    ("600887.SH", "伊利股份", "主板", 674900, "0.040", "食品饮料"),
    ("601888.SH", "中国中免", "主板", 0, "0.040", "商贸零售"),
    ("000333.SZ", "美的集团", "主板", 427100, "0.070", "家用电器"),
    ("000858.SZ", "五粮液", "主板", 341900, "0.040", "食品饮料"),
    ("002594.SZ", "比亚迪", "主板", 295700, "0.060", "汽车"),
    ("000651.SZ", "格力电器", "主板", 535200, "0.050", "家用电器"),
    ("002415.SZ", "海康威视", "主板", 495000, "0.035", "电子与计算机"),
    ("300059.SZ", "东方财富", "创业板", 1110600, "0.055", "非银金融"),
    ("688981.SH", "中芯国际", "科创板", 417358, "0.080", "电子与计算机"),
    ("688041.SH", "海光信息", "科创板", 102650, "0.050", "电子与计算机"),
    ("688111.SH", "金山办公", "科创板", 71830, "0.020", "电子与计算机"),
]
CODES = [h[0] for h in HOLD]
NAME = {h[0]: h[1] for h in HOLD}
BOARD = {h[0]: h[2] for h in HOLD}
IND = {h[0]: h[5] for h in HOLD}
W2 = {h[0]: D(h[4]) for h in HOLD}
SMIC = "688981.SH"
CASH_1030 = D("34618275.46")
# 三季度调仓（基准日 2026-06-30，07-01 至 07-03 收盘集合竞价成交）。正数买入、负数卖出
Q3 = {"601318.SH": -46800, "600900.SH": 161800, "600030.SH": -105900, "600276.SH": 81300, "601899.SH": -186300,
      "601012.SH": -663600, "000333.SZ": 47100, "002594.SZ": -34300, "002415.SZ": -105000, SMIC: -80000, "688041.SH": 22650}
Q3_FILTERED = {"601166.SH": 1290000, "600887.SH": 680000}   # 旧口径下投资经理给的目标股数，交易金额不到 30 万被过滤
Q3_SPLIT = {SMIC: [30000, 25000, 25000], "601012.SH": [350000, 313600], "688041.SH": [12000, 10650]}   # 单只单日按基准日价估算不超过 500 万元
Q3_DAYS = ["2026-07-01", "2026-07-02", "2026-07-03"]
# 季中：9 月 14 日产品净申购资金划入，9 月 15 日至 17 日加仓中芯国际
INFLOW_DAY, INFLOW = "2026-09-14", D("22000000.00")
SEP_BUY = [("2026-09-15", 40000), ("2026-09-16", 40000), ("2026-09-17", 37358)]
RATE_INT = D("0.0035")   # 托管户活期利率，年化，按 360 天
# 四季度目标权重第一稿（2026-09-15，已废止）
W1 = dict(W2)
W1.update({SMIC: D("0.085"), "601012.SH": D("0.015"), "601888.SH": D("0.030"), "688111.SH": D("0.030"), "601398.SH": D("0.070")})


def _px_width(v) -> float:
    """11 号字下的大致像素宽：中文和全角符号 15，其余 7.5。"""
    import unicodedata
    return sum(15 if unicodedata.east_asian_width(ch) in "WF" or (unicodedata.east_asian_width(ch) == "A" and ord(ch) > 0x2000) else 7.5
               for ch in str(v))


def write_xlsx(path, sheets, notes=None, formats=None):
    """共用 write_xlsx 之后再按像素宽补一次列宽：按双宽估的列宽对中文长标签偏窄几个像素，会被右边单元格挡住。"""
    from openpyxl import load_workbook
    from openpyxl.utils import get_column_letter
    _write_xlsx(path, sheets, notes, formats)
    wb = load_workbook(path)
    for ws in wb:
        merged = {(r, c) for mr in ws.merged_cells.ranges for r in range(mr.min_row, mr.max_row + 1) for c in range(mr.min_col, mr.max_col + 1)}
        need = {}
        for row in ws.iter_rows():
            for cell in row:
                if cell.value is None or (cell.row, cell.column) in merged or cell.alignment.wrap_text:
                    continue
                v = cell.value
                if isinstance(v, float):
                    v = f"{v:,.4f}"
                need[cell.column] = max(need.get(cell.column, 0), (_px_width(v) + 12) / 7)
        for col, wneed in need.items():
            letter = get_column_letter(col)
            if (ws.column_dimensions[letter].width or 8) < wneed:
                ws.column_dimensions[letter].width = round(min(wneed + 1, 60), 1)
    wb.save(path)
    scrub_office(path)


def round_c(x: D) -> D:
    return x.quantize(CENT, rounding=ROUND_HALF_UP)


def series(code: str) -> pd.DataFrame:
    """不复权收盘价（元）和成交量（股），2026-03-02 至 2026-10-30。"""
    lp = RAW / f"{code}_noadj.json"
    if lp.exists():
        r = pd.DataFrame(json.load(open(lp, encoding="utf-8"))["返回"]).set_index("date")
        return pd.DataFrame(dict(close=r.close.astype(float), volume=r.volume.astype(int) * 100, src="LongPort"))
    rec, d = load_mcp_prices(RAW / f"{code.replace('.SH', '.SS')}_mcp.json", 8)
    closes, divs = list(d.Close), list(d.Dividends)
    fac, cum = [1.0] * len(d), 1.0
    for i in range(len(d) - 1, -1, -1):
        fac[i] = cum
        if divs[i] > 0 and i > 0:
            cum *= 1 - divs[i] / (closes[i - 1] / cum + divs[i])
    out = pd.DataFrame(dict(close=[c / f for c, f in zip(closes, fac)], volume=d.Volume.astype(int)), index=d.index)
    out = out[(out.index >= "2026-03-02") & (out.index <= "2026-10-30")].copy()
    assert all(abs(x * 100 - round(x * 100)) < max(2e-3, x * 2e-5) for x in out.close), code
    out["close"] = out.close.round(2)
    out["src"] = "US Stocks MCP"
    return out


def dividends() -> list[tuple[str, str, D]]:
    """2026-07-01 至 2026-10-30 的除息记录（交易日、代码、每股派息），取自 MCP 返回的 Dividends 列。"""
    out = []
    for code in CODES:
        f = RAW / f"{code.replace('.SH', '.SS')}_mcp.json"
        f = f if f.exists() else OLD_RAW / f"{code.replace('.SH', '.SS')}.json"
        rec, d = load_mcp_prices(f, 8)
        for day, v in d.Dividends.items():
            if "2026-07-01" <= day <= "2026-10-30" and v > 0:
                out.append((day, code, D(str(round(float(v), 6)))))
    return sorted(out)


def fee(amount: D, side: int, comm: str) -> tuple[D, D, D]:
    c = round_c(amount * D(comm))
    s = round_c(amount * D("0.0005")) if side < 0 else D(0)
    t = round_c(amount * D("0.00001"))
    return c, s, t


def build():
    S = {c: series(c) for c in CODES}
    close = pd.DataFrame({c: S[c].close for c in CODES})
    vol = pd.DataFrame({c: S[c].volume for c in CODES})
    assert not close.isna().any().any()
    days = list(close.index)
    px = lambda day, c: D(f"{close.loc[day, c]:.2f}")
    # 和 A02 核对：19 只股票 10-26 至 10-30 的收盘价一致
    a02 = TOOLS.parent / "题目" / "11_A股调仓指令复核" / "题目附件" / f"{P}A02_收盘价快照.csv"
    for r in csv.DictReader(open(a02, encoding="utf-8")):
        assert px(r["date"], r["code"]) == D(r["close"]), r
    post = {h[0]: h[3] for h in HOLD}
    post[SMIC] = 300000
    pre = {c: post[c] - Q3.get(c, 0) for c in CODES}
    # 逐笔成交（三季度调仓、9 月加仓）
    fills = []
    for c in CODES:
        q = Q3.get(c)
        if not q:
            continue
        parts = Q3_SPLIT.get(c, [abs(q)])
        assert sum(parts) == abs(q)
        for day, n in zip(Q3_DAYS, parts):
            fills.append(dict(day=day, code=c, side=1 if q > 0 else -1, n=n, tag="2026Q3调仓", comm="0.00025"))
    for day, n in SEP_BUY:
        fills.append(dict(day=day, code=SMIC, side=1, n=n, tag="季中加仓", comm="0.0002"))
    for f in fills:
        f["price"] = px(f["day"], f["code"])
        f["amount"] = f["price"] * f["n"]
        f["c"], f["s"], f["t"] = fee(f["amount"], f["side"], f["comm"])
        f["net"] = (-f["amount"] if f["side"] > 0 else f["amount"]) - f["c"] - f["s"] - f["t"]
    fills.sort(key=lambda f: (f["day"], CODES.index(f["code"])))
    # 每日持股
    hold_on = {}
    cur = dict(pre)
    trade_days = [d for d in days if "2026-06-30" <= d <= "2026-10-30"]
    for day in trade_days:
        for f in fills:
            if f["day"] == day:
                cur[f["code"]] += f["side"] * f["n"]
        hold_on[day] = dict(cur)
    assert hold_on["2026-10-30"] == {h[0]: h[3] for h in HOLD}
    # 分红：登记日（除息日前一个交易日）收盘后的持股
    divs = []
    for day, c, v in dividends():
        rec_day = trade_days[trade_days.index(day) - 1]
        n = hold_on[rec_day][c]
        if n:
            divs.append(dict(day=day, rec=rec_day, code=c, per=v, n=n, amount=round_c(v * n)))
    # 现金流水：06-30 余额倒推，使 10-30 余额等于 A03 的 34,618,275.46 元
    def ledger(start: D):
        rows, bal = [], start
        events = []
        for day in trade_days[1:]:
            for tag in ("2026Q3调仓", "季中加仓"):
                fs = [f for f in fills if f["day"] == day and f["tag"] == tag]
                if fs:
                    events.append((day, 1, "证券清算", f"{tag}：{len(fs)} 笔成交（买入 {sum(f['side'] > 0 for f in fs)}、卖出 {sum(f['side'] < 0 for f in fs)}）", sum((f["net"] for f in fs), D(0))))
            for v in divs:
                if v["day"] == day:
                    events.append((day, 2, "现金红利", f"{NAME[v['code']]}（{v['code']}）每股 {v['per']} 元 × 登记日持股 {v['n']:,} 股", v["amount"]))
            if day == INFLOW_DAY:
                events.append((day, 0, "资金划入", "产品层面净申购资金划入本组合", INFLOW))
        # 9-21 结息：06-21 至 09-20 每日余额 × 0.35% ÷ 360
        bal_by_day = {}
        b = start
        ev_by_day = {}
        for e in events:
            ev_by_day.setdefault(e[0], []).append(e)
        dd = date(2026, 6, 21)
        while dd <= date(2026, 9, 20):
            k = dd.isoformat()
            for e in ev_by_day.get(k, []):
                b += e[4]
            bal_by_day[k] = b
            dd += timedelta(days=1)
        interest = round_c(sum(bal_by_day.values(), D(0)) * RATE_INT / 360)
        events.append(("2026-09-21", 3, "利息收入", "托管户活期利息（2026-06-21 至 09-20，年化 0.35%，按 360 天计）", interest))
        events.sort(key=lambda e: (e[0], e[1]))
        for e in events:
            bal += e[4]
            rows.append(dict(day=e[0], kind=e[2], memo=e[3], amount=e[4], bal=bal))
        return rows, bal, interest
    start = D("10000000.00")
    for _ in range(6):
        rows, end, interest = ledger(start)
        start = start + (CASH_1030 - end)
    rows, end, interest = ledger(start)
    assert end == CASH_1030, end
    cash_on = {}
    for day in trade_days:
        cash_on[day] = start if day == "2026-06-30" else cash_on[trade_days[trade_days.index(day) - 1]]
        for r in rows:
            if r["day"] == day:
                cash_on[day] = r["bal"]
    return dict(close=close, vol=vol, px=px, days=days, trade_days=trade_days, pre=pre, post=post, fills=fills, hold_on=hold_on,
                divs=divs, ledger=rows, cash0=start, cash_on=cash_on, interest=interest, src={c: S[c].src.iloc[0] for c in CODES})


def nav_on(m, day, hold=None):
    hold = hold or m["hold_on"][day]
    mv = {c: hold[c] * m["px"](day, c) for c in CODES}
    return mv, sum(mv.values()) + m["cash_on"][day]


fl = float
pct = lambda x, n=2: f"{fl(x) * 100:.{n}f}%"
money = lambda x: f"{fl(x):,.2f}"


def main() -> None:
    m = build()
    out = HERE
    for f in out.iterdir():
        if f.is_file() and f.suffix != ".py" and not f.name.startswith("."):
            f.unlink()
    px = m["px"]
    # ---------- B01 月末持仓与估值快照 ----------
    sheets, notes = [], {}
    month_ends = ["2026-06-30", "2026-07-31", "2026-08-31", "2026-09-30"]
    summary = []
    for day in month_ends:
        hold = m["pre"] if day == "2026-06-30" else m["hold_on"][day]
        mv = {c: hold[c] * px(day, c) for c in CODES}
        nav = sum(mv.values()) + m["cash_on"][day]
        rows = [[c, NAME[c], BOARD[c], hold[c], fl(px(day, c)), round(fl(mv[c]), 2), round(fl(mv[c] / nav) * 100, 3)] for c in CODES]
        rows.append(["现金", "托管户活期存款", "", "", "", round(fl(m["cash_on"][day]), 2), round(fl(m["cash_on"][day] / nav) * 100, 3)])
        rows.append(["合计", "组合净资产", "", "", "", round(fl(nav), 2), 100.0])
        sheets.append((day + ("（调仓前）" if day == "2026-06-30" else ""),
                       ["代码", "名称", "板块", "持股数", "收盘价(元)", "市值(元)", "占净资产(%)"], rows))
        top = max(CODES, key=lambda c: mv[c])
        summary.append([day, round(fl(sum(mv.values())), 2), round(fl(m["cash_on"][day]), 2), round(fl(nav), 2),
                        round(fl(m["cash_on"][day] / nav) * 100, 3), NAME[top], round(fl(mv[top] / nav) * 100, 3),
                        sum(1 for c in CODES if hold[c] > 0)])
    sheets.append(("净资产汇总", ["日期", "股票市值(元)", "现金(元)", "组合净资产(元)", "现金比例(%)", "权重最高的股票", "其权重(%)", "持股只数"], summary))
    notes[sheets[0][0]] = ["2026-06-30 是三季度调仓的基准日，这一页是调仓前的持仓（7 月 1 日至 3 日成交后才变化）。"]
    notes["净资产汇总"] = ["估值系统月末导出，收盘价为当日不复权收盘价。现金为托管户活期存款日终余额，变动明细见《调仓指令_B02_组合现金流水》。",
                       "9 月末持股数与 10 月末相同；中芯国际 9 月 15 日至 17 日加仓 117,358 股，之前为 300,000 股。"]
    write_xlsx(out / f"{P}B01_组合月末持仓与估值快照_2026年6至9月.xlsx", sheets, notes,
               formats={s[0]: {"收盘价(元)": "0.00", "市值(元)": "#,##0.00", "占净资产(%)": "0.000"} for s in sheets[:-1]} |
               {"净资产汇总": {"股票市值(元)": "#,##0.00", "现金(元)": "#,##0.00", "组合净资产(元)": "#,##0.00"}})
    # ---------- B02 现金流水 ----------
    with open(out / f"{P}B02_组合现金流水_2026年7至10月.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["记账日", "类别", "摘要", "发生额(元)", "日终余额(元)"])
        w.writerow(["2026-06-30", "期初余额", "三季度调仓前日终余额", "", money(m["cash0"]).replace(",", "")])
        for r in m["ledger"]:
            w.writerow([r["day"], r["kind"], r["memo"], f"{r['amount']:.2f}", f"{r['bal']:.2f}"])
    # ---------- B03 三季度调仓及季中加仓成交回报 ----------
    with open(out / f"{P}B03_2026Q3调仓及季中加仓成交回报.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["成交日", "批次", "代码", "名称", "板块", "方向", "成交股数", "成交价(元)", "成交金额(元)", "佣金费率", "佣金(元)", "印花税(元)", "过户费(元)", "清算金额(元)", "成交方式"])
        for x in m["fills"]:
            w.writerow([x["day"], x["tag"], x["code"], NAME[x["code"]], BOARD[x["code"]], "买入" if x["side"] > 0 else "卖出", x["n"], f"{x['price']:.2f}",
                        f"{x['amount']:.2f}", f"{D(x['comm']) * 100:.3f}%", f"{x['c']:.2f}", f"{x['s']:.2f}", f"{x['t']:.2f}", f"{x['net']:.2f}", "收盘集合竞价"])
    # ---------- B04 三季度调仓限额复核底稿（旧口径） ----------
    d0 = "2026-06-30"
    p0 = {c: px(d0, c) for c in CODES}
    nav0 = sum(m["pre"][c] * p0[c] for c in CODES) + m["cash0"]
    tgt = {c: m["post"][c] for c in CODES}
    tgt.update(Q3_FILTERED)
    o_rows, buy0, sell0, fee0 = [], D(0), D(0), D(0)
    h_rows = []
    after = {}
    for c in CODES:
        diff = tgt[c] - m["pre"][c]
        amt = abs(diff) * p0[c]
        state = "无交易" if diff == 0 else ("下单" if amt >= 300000 else "小单过滤")
        after[c] = tgt[c] if state == "下单" else m["pre"][c]
        if state == "下单":
            cc, ss, tt = fee(amt, 1 if diff > 0 else -1, "0.00025")
            fee0 += cc + ss + tt
            if diff > 0:
                buy0 += amt
            else:
                sell0 += amt
            o_rows.append([c, NAME[c], "买入" if diff > 0 else "卖出", abs(diff), fl(p0[c]), fl(amt), fl(cc), fl(ss), fl(tt)])
        h_rows.append([c, NAME[c], BOARD[c], m["pre"][c], fl(p0[c]), round(fl(m["pre"][c] * p0[c] / nav0) * 100, 3), tgt[c], diff, fl(amt), state, after[c],
                       round(fl(after[c] * p0[c] / nav0) * 100, 3)])
    assert after == m["post"]
    cash_after0 = m["cash0"] + sell0 - buy0 - fee0
    turn_old = (buy0 + sell0) / 2 / nav0
    turn_new = max(buy0, sell0) / nav0
    wmax = max(CODES, key=lambda c: after[c] * p0[c])
    wmax_v = after[wmax] * p0[wmax] / nav0
    pre_top = max(CODES, key=lambda c: m["pre"][c] * p0[c])
    lim = [["组合净资产(元)", fl(nav0), "", ""], ["订单笔数", len(o_rows), "", ""], ["买入金额合计(元)", fl(buy0), "", ""], ["卖出金额合计(元)", fl(sell0), "", ""],
           ["预估费用合计(元)", fl(fee0), "", ""], ["调仓后现金(元)", fl(cash_after0), "", ""],
           ["换手率(%)：(买入+卖出)÷2÷净资产", round(fl(turn_old) * 100, 3), "≤15%", "满足" if turn_old <= D("0.15") else "不满足"],
           ["调仓后现金比例(%)", round(fl(cash_after0 / nav0) * 100, 3), "0.5%至5%", "满足" if D("0.005") <= cash_after0 / nav0 <= D("0.05") else "不满足"],
           [f"调仓后最高单票权重(%)：{NAME[wmax]}", round(fl(wmax_v) * 100, 3), "≤10%", "满足" if wmax_v <= D("0.10") else "不满足"],
           ["结论", "按清单执行", "", ""]]
    assert all(r[3] in ("", "满足") for r in lim)
    notes4 = {
        "持仓与目标": ["三季度仍按 2025 年版口径（《调仓指令_B06》）复核：目标股数由投资经理在调仓单里直接给出，交易金额不到 300,000 元的不下单。",
                  f"调仓前{NAME[pre_top]}权重 {pct(m['pre'][pre_top] * p0[pre_top] / nav0, 3)}，超过当时 10% 的单票上限，本次卖出 80,000 股。"],
        "订单与费用": ["佣金按当时的 0.025% 计，印花税 0.05% 只在卖出时收，过户费 0.001%，每笔每项分别四舍五入到分。按基准日收盘价预估，实际成交见《调仓指令_B03》。"],
        "限额检查": ["换手率按 2025 年版口径取买入、卖出的平均数。按 2026 年 9 月修订后的口径（取较大的一边）为 "
                 f"{pct(turn_new, 3)}，同样不超过 15%。复核人：林知远（风控），2026-06-30 晚间完成。"],
    }
    write_xlsx(out / f"{P}B04_2026Q3调仓限额复核底稿.xlsx",
               [("持仓与目标", ["代码", "名称", "板块", "调仓前持股数", "06-30收盘价(元)", "调仓前权重(%)", "目标股数", "交易股数", "交易金额(元)", "是否下单", "调仓后持股数", "调仓后权重(%)"], h_rows),
                ("订单与费用", ["代码", "名称", "方向", "股数", "收盘价(元)", "交易金额(元)", "佣金(元)", "印花税(元)", "过户费(元)"], o_rows),
                ("限额检查", ["项目", "数值", "当时限额", "检查结果"], lim)], notes4,
               formats={"持仓与目标": {"06-30收盘价(元)": "0.00", "交易金额(元)": "#,##0.00"},
                        "订单与费用": {"收盘价(元)": "0.00", "交易金额(元)": "#,##0.00", "佣金(元)": "0.00", "印花税(元)": "0.00", "过户费(元)": "0.00"},
                        "限额检查": {"数值": "#,##0.000"}})
    q3 = dict(nav0=nav0, buy0=buy0, sell0=sell0, fee0=fee0, cash_after0=cash_after0, turn_old=turn_old, turn_new=turn_new, wmax=wmax, wmax_v=wmax_v, pre_top=pre_top)
    texts(m, q3, out)


def texts(m, q3, out):
    if not (HERE / "texts11.py").exists():
        return
    from texts11 import write_all
    write_all(m, q3, out, globals())


if __name__ == "__main__":
    main()
