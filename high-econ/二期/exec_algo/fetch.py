#!/usr/bin/env python3
"""用 Longport 行情拉招商银行 1 分钟线，写到 raw/min1.csv。

密钥从本机 Quantra/.env 读取，这里不保存任何账号信息。
运行：~/workspace/Quantra/.venv/bin/python fetch.py
"""
import datetime as dt
import time
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from longport.openapi import AdjustType, Config, Period, QuoteContext

SYMBOL = "600036.SH"
START, END = dt.date(2026, 7, 1), dt.date(2026, 10, 30)
OUT = Path(__file__).resolve().parent / "raw" / "min1.csv"


def main() -> None:
    load_dotenv(Path.home() / "workspace" / "Quantra" / ".env")
    ctx = QuoteContext(Config.from_apikey_env())
    rows = []
    day = START
    while day <= END:
        if day.weekday() < 5:
            for attempt in range(4):
                try:
                    bars = ctx.history_candlesticks_by_date(SYMBOL, Period.Min_1, AdjustType.NoAdjust, day, day)
                    break
                except Exception:
                    time.sleep(2 + attempt * 2)
            else:
                raise SystemExit(f"{day} 拉取失败")
            for b in bars:
                rows.append({
                    "time": b.timestamp.strftime("%Y-%m-%d %H:%M"),
                    "open": float(b.open), "high": float(b.high), "low": float(b.low),
                    "close": float(b.close), "volume": int(b.volume), "turnover": float(b.turnover),
                })
            print(day, len(bars), flush=True)
            time.sleep(0.25)
        day += dt.timedelta(days=1)
    OUT.parent.mkdir(exist_ok=True)
    pd.DataFrame(rows).to_csv(OUT, index=False)


if __name__ == "__main__":
    main()
