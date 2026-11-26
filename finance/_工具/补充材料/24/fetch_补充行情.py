#!/usr/bin/env python3
"""给 24 题补充材料取真实行情。原始返回存到 _工具/新题数据/专户对账_补充/，已经存过的不重拉；打包时不联网，只读这里存下的文件。
- LongPort 不复权日线：专户持有的 8 只美股，2024-11-01 至 2025-10-31（以往月份估值对账底稿、历史估值更正记录用的收盘价）。
用法：python3 补充材料/24/fetch_补充行情.py
"""
from __future__ import annotations
import json
import sys
from datetime import date, datetime
from pathlib import Path
TOOLS = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(TOOLS))
from fetch_longport import load_env  # noqa: E402
OUT = TOOLS / "新题数据" / "专户对账_补充"
START, END = date(2024, 11, 1), date(2025, 10, 31)
TICKERS = ["AAPL.US", "MSFT.US", "CSCO.US", "TXN.US", "LRCX.US", "NFLX.US", "NOW.US", "KLAC.US"]
def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    load_env()
    from longport.openapi import AdjustType, Config, Period, QuoteContext
    ctx = QuoteContext(Config.from_apikey_env())
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    for t in TICKERS:
        path = OUT / f"{t}_noadj.json"
        if path.exists():
            continue
        rows = []
        for c in ctx.history_candlesticks_by_date(t, Period.Day, AdjustType.NoAdjust, START, END):
            rows.append(dict(date=c.timestamp.strftime("%Y-%m-%d"), open=str(c.open), high=str(c.high), low=str(c.low), close=str(c.close),
                             volume=int(c.volume), turnover=str(c.turnover)))
        json.dump(dict(查询时间=now, 接口="LongPort OpenAPI QuoteContext.history_candlesticks_by_date",
                       参数=dict(symbol=t, period="Day", adjust_type="NoAdjust", start=str(START), end=str(END)), 返回=rows),
                  open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        print(t, len(rows), rows[0]["date"], rows[-1]["date"])
if __name__ == "__main__":
    main()
