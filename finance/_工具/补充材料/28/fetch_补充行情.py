#!/usr/bin/env python3
"""给 28、29、30 题补充材料取真实行情：LongPort 不复权日线（含成交额）和证券资料。
原始返回存到 _工具/新题数据/定增减持_补充/，已经存过的不重拉。打包时不联网，只读这里存下的文件。
同一目录下还有 2026-11-26 用 mcp_call.py --save 存的 US Stocks MCP 一年日线（*_1y.json），用来核对除权除息日。
用法：python3 补充材料/28/fetch_补充行情.py
"""
from __future__ import annotations
import json
import sys
from datetime import date, datetime
from pathlib import Path
TOOLS = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(TOOLS))
from fetch_longport import load_env  # noqa: E402
OUT = TOOLS / "新题数据" / "定增减持_补充"
START, END = date(2025, 12, 1), date(2026, 11, 20)
TICKERS = ["002371.SZ", "688012.SH", "603986.SH", "002049.SZ", "600584.SH"]
# 2026-11-27 补：B 系列历史减持台账、成交回报里出现的其他在管持仓，成交价按真实日线定
EXTRA = ["300750.SZ", "002230.SZ", "600519.SH", "688981.SH", "600309.SH"]


def main() -> None:
    load_env()
    from longport.openapi import AdjustType, Config, Period, QuoteContext
    ctx = QuoteContext(Config.from_apikey_env())
    OUT.mkdir(parents=True, exist_ok=True)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    info_path = OUT / "static_info.json"
    if not info_path.exists():
        info = ctx.static_info(TICKERS)
        json.dump(dict(查询时间=now, 接口="LongPort OpenAPI QuoteContext.static_info", 参数=dict(symbols=TICKERS),
                       返回=[dict(symbol=i.symbol, name_cn=i.name_cn, lot_size=i.lot_size, currency=i.currency, total_shares=i.total_shares,
                                 circulating_shares=i.circulating_shares) for i in info]),
                  open(info_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for t in TICKERS + EXTRA:
        path = OUT / f"{t}_noadj.json"
        if path.exists():
            continue
        candles = ctx.history_candlesticks_by_date(t, Period.Day, AdjustType.NoAdjust, START, END)
        rows = [dict(date=c.timestamp.strftime("%Y-%m-%d"), open=str(c.open), high=str(c.high), low=str(c.low), close=str(c.close),
                     volume=int(c.volume), turnover=str(c.turnover)) for c in candles]
        json.dump(dict(查询时间=now, 接口="LongPort OpenAPI QuoteContext.history_candlesticks_by_date",
                       参数=dict(symbol=t, period="Day", adjust_type="NoAdjust", start=str(START), end=str(END)), 返回=rows),
                  open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        print(t, len(rows), rows[0]["date"], rows[-1]["date"])


if __name__ == "__main__":
    main()
