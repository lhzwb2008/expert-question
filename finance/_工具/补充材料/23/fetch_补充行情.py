#!/usr/bin/env python3
"""给 23 题补充材料取真实行情。原始返回存到 _工具/新题数据/ADR转换_补充/，已经存过的不重拉；打包时不联网，只读这里存下的文件。
- LongPort 不复权日线：产品持有的 10 只 ADR 和对应 H 股，2024-11-01 至 2026-10-30（价差周度跟踪、2026-06 试点转换的价格）。
- US Stocks MCP get_historical_stock_prices：HKD=X 两年日线（期间没有分红，Close 就是收盘价）。
用法：python3 补充材料/23/fetch_补充行情.py
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(TOOLS))
from fetch_longport import load_env  # noqa: E402

OUT = TOOLS / "新题数据" / "ADR转换_补充"
START, END = date(2024, 11, 1), date(2026, 10, 30)
TICKERS = ["BABA.US", "9988.HK", "BIDU.US", "9888.HK", "NTES.US", "9999.HK", "BILI.US", "9626.HK", "ZTO.US", "2057.HK",
           "LI.US", "2015.HK", "JD.US", "9618.HK", "TCOM.US", "9961.HK", "EDU.US", "9901.HK", "YUMC.US", "9987.HK"]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    fx = OUT / "HKD=X_2y.json"
    if not fx.exists():
        subprocess.run([sys.executable, str(TOOLS / "mcp_call.py"), "call", "us-stocks", "get_historical_stock_prices",
                        json.dumps({"ticker": "HKD=X", "period": "2y", "interval": "1d"}), "--save", str(fx)], check=True, cwd=TOOLS)
    load_env()
    from longport.openapi import AdjustType, Config, Period, QuoteContext
    ctx = QuoteContext(Config.from_apikey_env())
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    for t in TICKERS:
        path = OUT / f"{t}_noadj.json"
        if path.exists():
            continue
        rows = []
        # 一次最多返回 1000 根，两年够用
        for c in ctx.history_candlesticks_by_date(t, Period.Day, AdjustType.NoAdjust, START, END):
            rows.append(dict(date=c.timestamp.strftime("%Y-%m-%d"), open=str(c.open), high=str(c.high), low=str(c.low), close=str(c.close),
                             volume=int(c.volume), turnover=str(c.turnover)))
        json.dump(dict(查询时间=now, 接口="LongPort OpenAPI QuoteContext.history_candlesticks_by_date",
                       参数=dict(symbol=t, period="Day", adjust_type="NoAdjust", start=str(START), end=str(END)), 返回=rows),
                  open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        print(t, len(rows), rows[0]["date"], rows[-1]["date"])


if __name__ == "__main__":
    main()
