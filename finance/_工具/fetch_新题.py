#!/usr/bin/env python3
"""给后加的题拉数据：全部通过 US Stocks MCP 实际调用，原始返回连同查询时间存到 新题数据/。

已经存过的文件不会重拉，所以附件和标答对应的始终是同一次查询。
用法：python3 fetch_新题.py [题目名...]   不带参数时全部都拉。
"""
from __future__ import annotations

import datetime as dt
import json
import sys
import time
from pathlib import Path

import mcp_call

HERE = Path(__file__).resolve().parent
DATA = HERE / "新题数据"
URL = mcp_call.SERVERS["us-stocks"]

PLAN = {
    "商品跨期": [("000001.SS", "10y")],
    "港股流动性": [(t, "1y") for t in [
        "0700.HK", "9988.HK", "0005.HK", "0941.HK", "1299.HK", "3690.HK", "1810.HK", "2318.HK", "0883.HK", "0388.HK",
        "6990.HK", "9926.HK", "1952.HK", "2013.HK", "9969.HK", "6618.HK", "2158.HK", "3896.HK", "1801.HK", "9626.HK"]],
    "压力测试": [(t, "10y") for t in ["^GSPC", "^NDX", "000001.SS", "^HSI", "GC=F", "TLT"]],
    "调仓指令": [(t, "6mo") for t in [
        "601318.SS", "601166.SS", "600900.SS", "601398.SS", "600030.SS", "600276.SS", "601899.SS", "600309.SS",
        "601012.SS", "600887.SS", "601888.SS", "000333.SZ", "000858.SZ", "002594.SZ", "000651.SZ", "002415.SZ",
        "300760.SZ", "300059.SZ", "688981.SS", "688041.SS", "688111.SS", "600028.SS"]],
    "港股红利": [(t, "5y") for t in [
        "0939.HK", "1398.HK", "3988.HK", "1288.HK", "3968.HK", "3328.HK", "0005.HK", "2388.HK",
        "0883.HK", "0857.HK", "0386.HK", "1088.HK", "1898.HK", "1171.HK", "0941.HK", "0728.HK", "0762.HK",
        "0002.HK", "0003.HK", "0006.HK", "0836.HK", "0902.HK", "0016.HK", "1972.HK", "0823.HK",
        "1919.HK", "0177.HK", "0548.HK", "0914.HK", "2318.HK"]],
    "港股红利建仓": [("HKDCNY=X", "3mo")],
    "港股红利对冲": [("^HSI", "10y")],
    "行业轮动": [(t, "10y") for t in ["XLK", "XLF", "XLV", "XLY", "XLP", "XLE", "XLI", "XLB", "XLU", "XLRE", "XLC", "^SP500TR"]],
    "行业轮动仓位": [("^VIX", "5y")],
    "行业轮动风控线": [("CNY=X", "10y")],
    "双重上市": [(t, "5y") for t in [
        "BABA", "9988.HK", "JD", "9618.HK", "BIDU", "9888.HK", "NTES", "9999.HK", "TCOM", "9961.HK", "BILI", "9626.HK",
        "ZTO", "2057.HK", "NIO", "9866.HK", "XPEV", "9868.HK", "LI", "2015.HK", "BEKE", "2423.HK", "HTHT", "1179.HK",
        "TME", "1698.HK", "EDU", "9901.HK", "YUMC", "9987.HK", "MNSO", "9896.HK", "HKD=X"]],
    "双重上市回测": [("^IRX", "5y")],
    "行业轮动风控规则": [("^VIX", "10y")],
    "雪球回测": [("510500.SS", "10y")],
    "雪球双标的": [("512100.SS", "10y")],
    "基准复算": [(t, "5y") for t in ["NFLX", "NOW", "KLAC", "INTC", "PLTR"]],
    "雪球排查": [("512100.SS", "2y")],
    "雪球比选": [("510500.SS", "10y"), ("512100.SS", "10y")],
    "雪球认购": [("510500.SS", "1mo"), ("512100.SS", "1mo")],
    "ADR体检": [("HKD=X", "6mo")],
    "ADR转换": [(t, "1mo") for t in ["BABA", "9988.HK", "BIDU", "9888.HK", "NTES", "9999.HK", "BILI", "9626.HK",
                                     "ZTO", "2057.HK", "LI", "2015.HK", "HKD=X"]],
    "专户对账": [(t, "2y") for t in ["AAPL", "MSFT", "CSCO", "TXN", "LRCX", "NFLX", "NOW", "KLAC"]],
    "业绩报酬": [("QQQ", "2y")],
    "两融回放": [("688981.SS", "3mo")],
    "两融降杠杆": [(t, "1mo") for t in ["300750.SZ", "688981.SS", "601899.SS", "600030.SS", "000333.SZ", "601318.SS"]],
    "定增筛查": [(t, "3mo") for t in ["002371.SZ", "688012.SS", "603986.SS", "002049.SZ", "600584.SS"]],
    "定增排程": [(t, "6mo") for t in ["002371.SZ", "688012.SS", "603986.SS", "002049.SZ", "600584.SS"]],
    "定增复核": [(t, "1mo") for t in ["002371.SZ", "688012.SS", "603986.SS", "002049.SZ", "600584.SS"]],
}


def main() -> None:
    names = sys.argv[1:] or list(PLAN)
    c = mcp_call.Mcp(URL)
    server = c.start().get("serverInfo", {})
    for name in names:
        d = DATA / name
        d.mkdir(parents=True, exist_ok=True)
        for ticker, period in PLAN[name]:
            path = d / f"{ticker}.json"
            if path.exists():
                continue
            args = {"ticker": ticker, "period": period, "interval": "1d"}
            when = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).strftime("%Y-%m-%d %H:%M:%S 北京时间")
            result = c.rpc("tools/call", {"name": "get_historical_stock_prices", "arguments": args})
            rec = {"查询时间": when, "MCP服务地址": URL, "MCP服务端": server, "工具": "get_historical_stock_prices",
                   "参数": args, "原始返回": result}
            json.dump(rec, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            try:
                rows = json.loads(result["content"][0]["text"])
                print(f"{name} {ticker} {when} {len(rows)} 行 {rows[0]['Date'][:10]} ~ {rows[-1]['Date'][:10]}")
            except Exception as e:  # 返回的不是行情表
                print(f"{name} {ticker} 返回异常: {str(result)[:200]} {e}")
            time.sleep(0.5)


if __name__ == "__main__":
    main()
