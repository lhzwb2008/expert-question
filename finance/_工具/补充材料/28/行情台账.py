#!/usr/bin/env python3
"""28、29、30 题补充材料共用：真实日线读取和本公司 2026 年定增股集中竞价减持台账。

行情只读 _工具/新题数据/定增减持_补充/ 里存下的原始返回，不联网：
- *_noadj.json：LongPort 不复权日线（成交量单位手，×100 换成股；含成交额）；
- *_1y.json：US Stocks MCP get_historical_stock_prices 一年日线（Yahoo Finance，Date 为 UTC，A 股 +8 小时；
  OHLC 是分红复权价，这里按返回的 Dividends 逐笔还原成不复权价；没有成交额）。
历史减持台账里的成交价一律由当日真实行情定：LongPort 有成交额的取当日成交额÷成交量（当日 VWAP），
只有 MCP 日线的取 (最高+最低+2×收盘)/4；都落在当日最低价和最高价之间。
"""
from __future__ import annotations

import json
import math
import sys
from functools import lru_cache
from pathlib import Path

import pandas as pd

TOOLS = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(TOOLS))
from build_common import load_mcp_prices  # noqa: E402

RAW = TOOLS / "新题数据" / "定增减持_补充"
# 代码 → (名称, 数据文件)
SRC = {
    "002371": ("北方华创", "002371.SZ_noadj.json"), "688012": ("中微公司", "688012.SH_noadj.json"),
    "603986": ("兆易创新", "603986.SH_noadj.json"), "002049": ("紫光国微", "002049.SZ_noadj.json"),
    "600584": ("长电科技", "600584.SH_noadj.json"), "300750": ("宁德时代", "300750.SZ_noadj.json"),
    "002230": ("科大讯飞", "002230.SZ_1y.json"), "600519": ("贵州茅台", "600519.SS_1y.json"),
    "688981": ("中芯国际", "688981.SS_1y.json"), "600309": ("万华化学", "600309.SS_1y.json"),
}
NAME = {k: v[0] for k, v in SRC.items()}


@lru_cache(maxsize=None)
def bars(code6: str) -> pd.DataFrame:
    """不复权日线，索引为交易日 YYYY-MM-DD，列 open high low close vol(股) turnover(元，MCP 来源为 NaN)。"""
    fn = SRC[code6][1]
    if fn.endswith("_noadj.json"):
        rows = json.load(open(RAW / fn, encoding="utf-8"))["返回"]
        d = pd.DataFrame(rows).set_index("date")
        return pd.DataFrame(dict(open=d.open.astype(float), high=d.high.astype(float), low=d.low.astype(float),
                                 close=d.close.astype(float), vol=d.volume.astype(int) * 100,
                                 turnover=d.turnover.astype(float)))
    _, d = load_mcp_prices(RAW / fn, 8)
    d = d.sort_index()
    # Yahoo 复权：adj(t) = raw(t) × Π_{除息日k>t} f_k，f_k = 1 − D_k / raw_close(k 的前一交易日)
    fac = pd.Series(1.0, index=d.index)
    cum = 1.0
    days = list(d.index)
    for k in sorted(d.index[d.Dividends > 0], reverse=True):
        i = days.index(k)
        if i == 0:
            continue
        p = days[i - 1]
        a = float(d.Close[p]) / cum
        f = a / (a + float(d.Dividends[k]))
        cum *= f
        fac[fac.index < k] = cum
    assert float(d["Stock Splits"].abs().sum()) == 0
    return pd.DataFrame(dict(open=d.Open / fac, high=d.High / fac, low=d.Low / fac, close=d.Close / fac,
                             vol=d.Volume.astype(int), turnover=float("nan")))


def bar(code6: str, day: str) -> pd.Series:
    b = bars(code6)
    assert day in b.index, (code6, day, "不是交易日")
    return b.loc[day]


def clip_px(code6: str, day: str, px: float) -> float:
    r = bar(code6, day)
    lo, hi = math.ceil(round(r.low * 100, 6)) / 100, math.floor(round(r.high * 100, 6)) / 100
    return round(min(max(round(px, 2), lo), hi), 2)


def day_px(code6: str, day: str) -> float:
    """当日成交参考价：有成交额取 VWAP，否则 (H+L+2C)/4，保留两位并落在当日区间内。"""
    r = bar(code6, day)
    px = r.turnover / r.vol if r.turnover == r.turnover else (r.high + r.low + 2 * r.close) / 4
    return clip_px(code6, day, px)


def frac_px(code6: str, day: str, f: float) -> float:
    r = bar(code6, day)
    return clip_px(code6, day, r.low + (r.high - r.low) * f)


def avg_vol(code6: str, end: str, n: int = 20) -> float:
    b = bars(code6)
    s = b[b.index <= end].tail(n)
    assert len(s) == n
    return float(s.vol.mean())


def prev_day(code6: str, day: str) -> str:
    b = bars(code6)
    return b.index[b.index < day][-1]


# ---------------- 本公司 2026 年定增股集中竞价减持台账（截至 2026-10-30） ----------------
# (卖出日, 产品, 代码, 股数, 批次说明)。中微公司、长电科技 8 月以来的记录和第 28 题 A02 一致。
# 科大讯飞两笔按 2025 年版旧口径（单只产品、成交额 10%）执行，各自一天卖完，见 29 题 B05 旧排程底稿。
LEDGER = [
    ("2026-01-12", "多策略稳健1号", "300750", 1800000, "锁定期满后首批"),
    ("2026-02-09", "多策略稳健1号", "300750", 1500000, "第二批"),
    ("2026-03-05", "定增优选2号", "002230", 2400000, "一次卖完，清仓"),
    ("2026-03-20", "定增优选1号", "002230", 1600000, "一次卖完，清仓"),
    ("2026-04-15", "多策略稳健1号", "600519", 12000, "调仓小额卖出"),
    ("2026-06-18", "定增优选2号", "688981", 900000, "定增份额部分卖出"),
    ("2026-08-04", "定增优选2号", "688012", 1500000, "分批卖出"),
    ("2026-08-10", "定增优选2号", "688012", 1000000, "分批卖出"),
    ("2026-08-11", "定增优选2号", "688012", 1000000, "分批卖出"),
    ("2026-08-12", "定增优选2号", "688012", 1000000, "分批卖出"),
    ("2026-08-13", "定增优选2号", "688012", 1000000, "分批卖出"),
    ("2026-08-14", "定增优选2号", "688012", 1000000, "分批卖出，该产品中微持仓卖完"),
    ("2026-08-20", "多策略稳健1号", "600584", 6000000, "定增份额"),
    ("2026-09-15", "定增优选2号", "600584", 6000000, "定增份额"),
    ("2026-10-09", "多策略稳健1号", "300750", 1500000, "第三批，该产品宁德持仓卖完"),
    ("2026-10-12", "定增优选1号", "688012", 1000000, "流动性安排"),
    ("2026-10-13", "定增优选1号", "688012", 1000000, "流动性安排"),
    ("2026-10-16", "定增优选2号", "600309", 300000, "调仓"),
]
# 同业披露的其他管理人卖出（交易部同业监测登记），和第 28 题 A02 一致
PEER = [("2026-09-22", "华南某基金管理公司", "某定增专户", "688012", 3000000)]


def ledger_rows():
    """台账每行附真实成交均价和金额。"""
    out = []
    for d, prod, code, n, note in LEDGER:
        px = day_px(code, d)
        out.append(dict(day=d, prod=prod, code=code, name=NAME[code], n=n, px=px, amt=round(n * px, 2), note=note,
                        vol=int(bar(code, d).vol)))
    return out
