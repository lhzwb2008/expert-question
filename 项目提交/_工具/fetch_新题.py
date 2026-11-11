#!/usr/bin/env python3
"""给后加的四道题拉数据：全部通过 US Stocks MCP 实际调用，原始返回连同查询时间存到 新题数据/。

已经存过的文件不会重拉，所以附件和标答对应的始终是同一次查询。
用法：python3 fetch_新题.py [题目名...]   不带参数时四道题都拉。
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
