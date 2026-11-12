#!/usr/bin/env python3
"""从 Yahoo 公开接口拉日线，写到 raw/daily.csv。不需要账号。"""
import datetime as dt
import json
import time
import urllib.request
from pathlib import Path

import pandas as pd

SYMBOLS = ['510300.SS', '159915.SZ', '510880.SS', '159920.SZ', '513100.SS', '518880.SS', '511010.SS', '512880.SS', '512010.SS', '512400.SS']
START, END = "2019-06-01", "2026-10-31"
OUT = Path(__file__).resolve().parent / "raw" / "daily.csv"


def fetch(sym: str) -> pd.DataFrame:
    a = int(dt.datetime.fromisoformat(START).replace(tzinfo=dt.timezone.utc).timestamp())
    b = int(dt.datetime.fromisoformat(END).replace(tzinfo=dt.timezone.utc).timestamp())
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
           f"?period1={a}&period2={b}&interval=1d&events=div%2Csplits")
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            res = json.load(urllib.request.urlopen(req, timeout=30))["chart"]["result"][0]
            break
        except Exception:
            time.sleep(2 + attempt * 2)
    else:
        raise SystemExit(f"{sym} 拉取失败")
    off = res["meta"]["gmtoffset"]
    q = res["indicators"]["quote"][0]
    df = pd.DataFrame({
        "symbol": sym,
        "date": [dt.datetime.utcfromtimestamp(t + off).strftime("%Y-%m-%d") for t in res["timestamp"]],
        "close": q["close"],
        "adj_close": res["indicators"]["adjclose"][0]["adjclose"],
        "volume": q["volume"],
    })
    return df.dropna(subset=["close"])


def main() -> None:
    parts = []
    for sym in SYMBOLS:
        df = fetch(sym)
        print(sym, len(df), df.date.min(), df.date.max(), flush=True)
        parts.append(df)
        time.sleep(0.4)
    OUT.parent.mkdir(exist_ok=True)
    pd.concat(parts).to_csv(OUT, index=False)


if __name__ == "__main__":
    main()
