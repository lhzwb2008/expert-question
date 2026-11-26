#!/usr/bin/env python3
"""给 20 题补充材料（比选_B10、B11、B14）拉中证500、中证1000 指数的长历史日线（LongPort，不复权，指数本身无分红）。
结果存到 新题数据/雪球比选_补充/，生成补充材料.py 只读这里的文件，不联网。
LongPort 单次最多返回约 1000 根，按年份分段取后合并。凭证读 ~/workspace/Quantra/.env（复用 fetch_longport.load_env）。
用法：python3 取数_指数长历史.py
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(TOOLS))
from fetch_longport import load_env  # noqa: E402

OUT = TOOLS / "新题数据" / "雪球比选_补充"
SEGS = [(date(2013, 1, 1), date(2016, 12, 31)), (date(2017, 1, 1), date(2019, 12, 31)),
        (date(2020, 1, 1), date(2022, 12, 31)), (date(2023, 1, 1), date(2026, 10, 30))]


def main() -> None:
    load_env()
    from longport.openapi import AdjustType, Config, Period, QuoteContext
    ctx = QuoteContext(Config.from_apikey_env())
    OUT.mkdir(parents=True, exist_ok=True)
    meta = dict(查询时间=datetime.now().strftime("%Y-%m-%d %H:%M:%S 北京时间"), 数据源="LongPort OpenAPI history_candlesticks_by_date",
                周期="Day", 复权="NoAdjust", 分段=[f"{a}~{b}" for a, b in SEGS], 文件={})
    for t in ("000905.SH", "000852.SH"):
        rows = {}
        for a, b in SEGS:
            for c in ctx.history_candlesticks_by_date(t, Period.Day, AdjustType.NoAdjust, a, b):
                d = c.timestamp.strftime("%Y-%m-%d")
                rows[d] = dict(date=d, open=str(c.open), high=str(c.high), low=str(c.low), close=str(c.close),
                               volume=int(c.volume), turnover=str(c.turnover))
        r = [rows[k] for k in sorted(rows)]
        json.dump(r, open(OUT / f"{t}_noadj.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        meta["文件"][f"{t}_noadj.json"] = dict(行数=len(r), 起=r[0]["date"], 止=r[-1]["date"])
        print(t, len(r), r[0]["date"], r[-1]["date"])
    json.dump(meta, open(OUT / "取数记录.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
