#!/usr/bin/env python3
"""生成 12 题（港股持仓变现能力测算与产品开放频率评估）的补充材料，输出到本目录。

2026-11-26 最终质检返修补的背景、历史和版本材料：月末持仓快照、持仓变动成交明细、9 月 30 日开放日赎回处置记录、
2026 年 6 月版流动性口径（已废止）和用它做的二季度末测算底稿、开放频率讨论纪要、口径修订往来、审批意见、
成交量异常复核、月度成交统计、快照导出说明、交易日历、交易费用规则、产品申赎历史、交易部意见、三季度日常监控。

行情全部是实际取数，原始返回在 _工具/新题数据/港股流动性_补充/：
- LongPort 不复权日线（*_noadj.json，港股成交量单位是股）；
- LongPort 当月可查代码数超限的 6 只，用 US Stocks MCP 的一年日线（*_mcp.json）。没有分红的直接用返回的收盘价；
  友邦保险、香港交易所在期间内有分红，按返回里的 Dividends 列还原成不复权价，还原后都落在价位表的最小价位上。
  十一只股票的成交量和题目附件 A01 逐日一致，基准日收盘价和 A02 一致。
持股数、现金、费用、申赎数据、人员和审议过程是延续本题场景拟的。本脚本不联网，重跑结果只差 docx 的生成时间。
新材料不写基准日 2026-10-30 前 20、60 个交易日窗口的成交量和日均量、云顶新耀基准日收盘价、各档赎回天数和开放频率结论。
"""
from __future__ import annotations
import csv
import json
import math
import sys
from decimal import ROUND_CEILING, ROUND_HALF_UP, Decimal as D
from pathlib import Path
import pandas as pd

HERE = Path(__file__).resolve().parent
TOOLS = HERE.parents[1]
sys.path.insert(0, str(TOOLS))
from build_common import load_mcp_prices, scrub_office, write_docx  # noqa: E402
from build_common import write_xlsx as _write_xlsx  # noqa: E402

RAW = TOOLS / "新题数据" / "港股流动性_补充"
P = "港股流动性_"
CENT = D("0.01")
# A02 的顺序和持股数（2026-10-30 收盘后）
HOLD = [("0700.HK", "腾讯控股", 612000), ("9988.HK", "阿里巴巴-W", 2435000), ("0941.HK", "中国移动", 2480000), ("1299.HK", "友邦保险", 2618000),
        ("2318.HK", "中国平安", 3150000), ("0883.HK", "中国海洋石油", 7060000), ("0388.HK", "香港交易所", 395000), ("6990.HK", "科伦博泰生物-B", 848600),
        ("1952.HK", "云顶新耀", 16800000), ("9969.HK", "诺诚健华", 12000000), ("9626.HK", "哔哩哔哩-W", 2380000), ("3896.HK", "金山云", 29500000)]
CODES = [h[0] for h in HOLD]
NAME = {h[0]: h[1] for h in HOLD}
YD, NC = "1952.HK", "9969.HK"
# 二季度末（2026-06-30）持股；7 月以后的变动见 TRADES
H0 = {"0700.HK": 656000, "9988.HK": 2605000, "0941.HK": 2480000, "1299.HK": 2802000, "2318.HK": 3150000, "0883.HK": 7060000, "0388.HK": 395000,
      "6990.HK": 848600, YD: 8950000, NC: 19600000, "9626.HK": 2380000, "3896.HK": 29500000}
NC_SELL = (19, 400000, "2026-08-10")       # 诺诚健华：8 月 10 日起 19 个交易日，每天卖 40 万股
YD_BUY = (25, 314000, "2026-09-14")        # 云顶新耀：9 月 14 日起 25 个交易日，每天买 31.4 万股
REDEEM_SELL = {"0700.HK": [12000, 12000, 10000, 10000], "9988.HK": [45000, 45000, 40000, 40000], "1299.HK": [50000, 50000, 42000, 42000]}
REDEEM_DAYS = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-02"]
CASH0 = D("150000000.00")
COMM = D("0.0003")
# 2026-09-30 开放日（份额、金额为拟的产品数据）
OPEN = dict(sub=D("31500000.00"), red_units=D("80000000"), units0=D("2236800000"), pay="2026-10-08")


def _px_width(v) -> float:
    import unicodedata
    return sum(15 if unicodedata.east_asian_width(ch) in "WF" or (unicodedata.east_asian_width(ch) == "A" and ord(ch) > 0x2000) else 7.5
               for ch in str(v))


def write_xlsx(path, sheets, notes=None, formats=None):
    """共用 write_xlsx 之后再按像素宽补一次列宽，避免中文长标签被右边单元格挡住。"""
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
                v = f"{cell.value:,.4f}" if isinstance(cell.value, float) else cell.value
                need[cell.column] = max(need.get(cell.column, 0), (_px_width(v) + 12) / 7)
        for col, wneed in need.items():
            letter = get_column_letter(col)
            if (ws.column_dimensions[letter].width or 8) < wneed:
                ws.column_dimensions[letter].width = round(min(wneed + 1, 60), 1)
    wb.save(path)
    scrub_office(path)


def tick(p: float) -> float:
    for hi, t in [(0.25, 0.001), (0.5, 0.005), (10, 0.01), (20, 0.02), (100, 0.05), (200, 0.1), (500, 0.2), (1000, 0.5), (1e9, 1)]:
        if p < hi:
            return t


def series(code: str) -> pd.DataFrame:
    lp = RAW / f"{code}_noadj.json"
    if lp.exists():
        r = pd.DataFrame(json.load(open(lp, encoding="utf-8"))["返回"]).set_index("date")
        out = pd.DataFrame(dict(close=r.close.astype(float), volume=r.volume.astype(int)))
    else:
        rec, d = load_mcp_prices(RAW / f"{code}_mcp.json", 8)
        closes, divs = list(d.Close), list(d.Dividends)
        fac, cum = [1.0] * len(d), 1.0
        for i in range(len(d) - 1, -1, -1):
            fac[i] = cum
            if divs[i] > 0 and i > 0:
                cum *= 1 - divs[i] / (closes[i - 1] / cum + divs[i])
        out = pd.DataFrame(dict(close=[c / f for c, f in zip(closes, fac)], volume=d.Volume.astype(int)), index=d.index)
        if sum(divs):
            for x in out.close[(out.index >= "2026-01-02") & (out.index <= "2026-10-30")]:
                assert abs(x / tick(x) - round(x / tick(x))) * tick(x) < 6e-4, (code, x)
            out["close"] = [round(round(x / tick(x)) * tick(x), 3) for x in out.close]
        else:
            out["close"] = out.close.round(3)
    return out[(out.index >= "2026-01-02") & (out.index <= "2026-10-30")]


def dividends() -> list[tuple[str, str, D]]:
    out = []
    for code in CODES:
        f = RAW / f"{code}_mcp.json"
        f = f if f.exists() else TOOLS / "新题数据" / "港股流动性" / f"{code}.json"
        rec, d = load_mcp_prices(f, 8)
        for day, v in d.Dividends.items():
            if "2026-07-01" <= day <= "2026-10-30" and v > 0:
                out.append((day, code, D(str(round(float(v), 6)))))
    return sorted(out)


def hk_fee(amount: D) -> dict:
    """佣金 0.03%；印花税 0.1% 向上取整到 1 港元；交易费 0.00565%；证监会交易征费 0.0027%；会财局交易征费 0.00015%。后三项四舍五入到分。"""
    r = lambda x: x.quantize(CENT, rounding=ROUND_HALF_UP)
    return dict(comm=r(amount * COMM), stamp=(amount * D("0.001")).to_integral_value(rounding=ROUND_CEILING),
                tf=r(amount * D("0.0000565")), sfc=r(amount * D("0.000027")), afrc=r(amount * D("0.0000015")))


def build():
    S = {c: series(c) for c in CODES}
    close = pd.DataFrame({c: S[c].close for c in CODES})
    vol = pd.DataFrame({c: S[c].volume for c in CODES})
    assert not close.isna().any().any()
    days = list(close.index)
    att = TOOLS.parent / "题目" / "12_港股持仓变现能力" / "题目附件"
    a01 = pd.read_csv(next(att.glob("*A01_*.csv")), dtype={"code": str})
    for r in a01.itertuples():
        assert vol.loc[r.date, r.code] == r.volume
    for r in csv.DictReader(open(next(att.glob("*A02_*.csv")), encoding="utf-8")):
        if r["close"]:
            assert abs(close.loc["2026-10-30", r["code"]] - float(r["close"])) < 1e-9
    px = lambda day, c: D(f"{close.loc[day, c]:.3f}")
    td = [d for d in days if "2026-06-30" <= d <= "2026-10-30"]
    trades = []
    i0 = td.index(NC_SELL[2])
    for d in td[i0:i0 + NC_SELL[0]]:
        trades.append(dict(day=d, code=NC, side=-1, n=NC_SELL[1], tag="诺诚健华减持"))
    i0 = td.index(YD_BUY[2])
    for d in td[i0:i0 + YD_BUY[0]]:
        trades.append(dict(day=d, code=YD, side=1, n=YD_BUY[1], tag="云顶新耀加仓"))
    assert trades[-1]["day"] <= "2026-10-23"
    for c, parts in REDEEM_SELL.items():
        for d, n in zip(REDEEM_DAYS, parts):
            trades.append(dict(day=d, code=c, side=-1, n=n, tag="开放日赎回变现"))
    for t in trades:
        t["price"] = px(t["day"], t["code"])
        t["amount"] = t["price"] * t["n"]
        t.update(hk_fee(t["amount"]))
        t["fees"] = t["comm"] + t["stamp"] + t["tf"] + t["sfc"] + t["afrc"]
        t["net"] = (t["amount"] if t["side"] < 0 else -t["amount"]) - t["fees"]
        t["settle"] = td[td.index(t["day"]) + 2]
    trades.sort(key=lambda t: (t["day"], CODES.index(t["code"])))
    hold_on, cur = {}, dict(H0)
    for d in td:
        for t in trades:
            if t["day"] == d:
                cur[t["code"]] += t["side"] * t["n"]
        hold_on[d] = dict(cur)
    assert hold_on["2026-10-30"] == {h[0]: h[2] for h in HOLD}, hold_on["2026-10-30"]
    divs = []
    for d, c, v in dividends():
        n = hold_on[td[td.index(d) - 1]][c]
        divs.append(dict(day=d, code=c, per=v, n=n, amount=(v * n).quantize(CENT, rounding=ROUND_HALF_UP)))
    # 现金（含应收股利、未交收款）按成交日、除净日记账，截至 2026-09-30；开放日申购款 9 月 30 日到账，赎回款 10 月 8 日划出
    mv = lambda d: sum(hold_on[d][c] * px(d, c) for c in CODES)
    cash_on, bal = {}, CASH0
    for d in td:
        if d > "2026-06-30":
            bal += sum((t["net"] for t in trades if t["day"] == d), D(0)) + sum((v["amount"] for v in divs if v["day"] == d), D(0))
        if d == "2026-09-30":
            bal += OPEN["sub"]
        cash_on[d] = bal
    nav930 = mv("2026-09-30") + cash_on["2026-09-30"]
    unit = (nav930 - OPEN["sub"]) / OPEN["units0"]
    unit = unit.quantize(D("0.0001"), rounding=ROUND_HALF_UP)
    red_amt = (OPEN["red_units"] * unit).quantize(CENT, rounding=ROUND_HALF_UP)
    sub_units = (OPEN["sub"] / unit).quantize(D("0.01"), rounding=ROUND_HALF_UP)
    for d in td:
        if d >= OPEN["pay"]:
            cash_on[d] -= red_amt
    return dict(close=close, vol=vol, days=days, td=td, px=px, trades=trades, hold_on=hold_on, divs=divs, cash_on=cash_on, mv=mv,
                unit=unit, red_amt=red_amt, sub_units=sub_units, nav930=nav930)


fl = float
pct = lambda x, n=2: f"{fl(x) * 100:.{n}f}%"
money = lambda x: f"{fl(x):,.2f}"


def main() -> None:
    m = build()
    for f in HERE.iterdir():
        if f.is_file() and f.suffix != ".py" and not f.name.startswith("."):
            f.unlink()
    sys.path.insert(0, str(HERE))
    from texts12 import write_all
    write_all(m, HERE, globals())


if __name__ == "__main__":
    main()
