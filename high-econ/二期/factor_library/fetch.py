#!/usr/bin/env python3
"""从 Yahoo 公开接口拉日线，写到 raw/daily.csv。不需要账号。"""
import datetime as dt
import json
import time
import urllib.request
from pathlib import Path

import pandas as pd

SYMBOLS = ['600519.SS', '601318.SS', '600036.SS', '601166.SS', '600900.SS', '600276.SS', '601398.SS', '601288.SS', '601988.SS', '600030.SS', '601012.SS', '600887.SS', '600309.SS', '601888.SS', '600028.SS', '601857.SS', '600050.SS', '601668.SS', '600104.SS', '600585.SS', '601088.SS', '600690.SS', '601328.SS', '600000.SS', '600016.SS', '601601.SS', '601628.SS', '600048.SS', '600031.SS', '600438.SS', '603288.SS', '600809.SS', '601899.SS', '600406.SS', '601919.SS', '600150.SS', '601225.SS', '600436.SS', '603259.SS', '600019.SS', '601390.SS', '601186.SS', '601800.SS', '600111.SS', '601138.SS', '000858.SZ', '000333.SZ', '000651.SZ', '002594.SZ', '300750.SZ', '000001.SZ', '002415.SZ', '000725.SZ', '300059.SZ', '002475.SZ', '000568.SZ', '300760.SZ', '002714.SZ', '000002.SZ', '000063.SZ']
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
