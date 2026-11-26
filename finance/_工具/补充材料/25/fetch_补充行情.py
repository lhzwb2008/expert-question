#!/usr/bin/env python3
"""给 25 题补充材料取真实行情。原始返回存到 _工具/新题数据/业绩报酬_补充/，已经存过的不重拉；打包时不联网，只读这里存下的文件。
- US Stocks MCP get_historical_stock_prices：QQQ、^NDX（纳斯达克100价格指数）period=5y 日线。QQQ 的 Close 按分红调整过。
- LongPort 不复权日线：QQQ.US，2024-01-01 至 2026-10-30（只算价格收益率时用）。
用法：python3 补充材料/25/fetch_补充行情.py
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
OUT = TOOLS / "新题数据" / "业绩报酬_补充"
START, END = date(2024, 1, 1), date(2026, 10, 30)
def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for t, fn in (("QQQ", "QQQ_5y.json"), ("^NDX", "NDX_5y.json")):
        p = OUT / fn
        if not p.exists():
            subprocess.run([sys.executable, str(TOOLS / "mcp_call.py"), "call", "us-stocks", "get_historical_stock_prices",
                            json.dumps({"ticker": t, "period": "5y", "interval": "1d"}), "--save", str(p)], check=True, cwd=TOOLS)
    path = OUT / "QQQ.US_noadj.json"
    if not path.exists():
        load_env()
        from longport.openapi import AdjustType, Config, Period, QuoteContext
        ctx = QuoteContext(Config.from_apikey_env())
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        rows = []
        for c in ctx.history_candlesticks_by_date("QQQ.US", Period.Day, AdjustType.NoAdjust, START, END):
            rows.append(dict(date=c.timestamp.strftime("%Y-%m-%d"), open=str(c.open), high=str(c.high), low=str(c.low), close=str(c.close),
                             volume=int(c.volume), turnover=str(c.turnover)))
        json.dump(dict(查询时间=now, 接口="LongPort OpenAPI QuoteContext.history_candlesticks_by_date",
                       参数=dict(symbol="QQQ.US", period="Day", adjust_type="NoAdjust", start=str(START), end=str(END)), 返回=rows),
                  open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        print("QQQ.US", len(rows), rows[0]["date"], rows[-1]["date"])
if __name__ == "__main__":
    main()
