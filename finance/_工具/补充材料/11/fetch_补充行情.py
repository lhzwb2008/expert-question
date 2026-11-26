#!/usr/bin/env python3
"""给 11 题补充材料取真实行情：LongPort 不复权日线（含成交额）和证券资料。
原始返回存到 _工具/新题数据/调仓指令_补充/，已经存过的不重拉。打包时不联网，只读这里存下的文件。
用法：python3 补充材料/11/fetch_补充行情.py
"""
from __future__ import annotations
import json
import sys
from datetime import date, datetime
from pathlib import Path
TOOLS = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(TOOLS))
from fetch_longport import load_env  # noqa: E402
OUT = TOOLS / "新题数据" / "调仓指令_补充"
START, END = date(2026, 3, 2), date(2026, 10, 30)
TICKERS = ["601318.SH", "601166.SH", "600900.SH", "601398.SH", "600030.SH", "600276.SH", "601899.SH", "600309.SH", "601012.SH",
           "600887.SH", "601888.SH", "000333.SZ", "000858.SZ", "002594.SZ", "000651.SZ", "002415.SZ", "300059.SZ", "688981.SH",
           "688041.SH", "688111.SH"]
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
    for t in TICKERS:
        path = OUT / f"{t}_noadj.json"
        if path.exists():
            continue
        try:
            candles = ctx.history_candlesticks_by_date(t, Period.Day, AdjustType.NoAdjust, START, END)
        except Exception as e:  # LongPort 按自然月限制可查的代码个数，超限的代码改用 US Stocks MCP
            print(t, "LongPort 取不到：", str(e)[:120])
            continue
        rows = [dict(date=c.timestamp.strftime("%Y-%m-%d"), open=str(c.open), high=str(c.high), low=str(c.low), close=str(c.close),
                     volume=int(c.volume), turnover=str(c.turnover))
                for c in candles]
        json.dump(dict(查询时间=now, 接口="LongPort OpenAPI QuoteContext.history_candlesticks_by_date",
                       参数=dict(symbol=t, period="Day", adjust_type="NoAdjust", start=str(START), end=str(END)), 返回=rows),
                  open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        print(t, len(rows), rows[0]["date"], rows[-1]["date"])
if __name__ == "__main__":
    main()
