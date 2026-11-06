#!/usr/bin/env python3
"""从 Dukascopy 公开图表接口拉 GBP/USD 1 分钟线，买价和卖价各一份，存到 raw/。

不需要账号。已有文件时从最后一根往后续拉。
"""
from __future__ import annotations

import datetime as dt
import json
import sys
import time
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
START = dt.datetime(2024, 12, 23, tzinfo=dt.timezone.utc)
END = dt.datetime(2026, 11, 1, tzinfo=dt.timezone.utc)
URL = ("https://freeserv.dukascopy.com/2.0/?path=chart/json3&instrument=GBP%2FUSD&offer_side={side}"
       "&interval=1MIN&splits=true&stocks=true&limit=20000&time_direction=N&timestamp={ts}&jsonp=_cb")
HEADERS = {"User-Agent": "Mozilla/5.0", "Referer": "https://freeserv.dukascopy.com/"}


def page(side: str, ts_ms: int) -> list:
    for attempt in range(8):
        try:
            text = requests.get(URL.format(side=side, ts=ts_ms), headers=HEADERS, timeout=90).text
            return json.loads(text[text.index("(") + 1:text.rindex(")")])
        except Exception as exc:  # noqa: BLE001
            print(f"{side} 重试 {attempt + 1}: {exc}", flush=True)
            time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"拉取失败 {side} {ts_ms}")


def fetch(side: str) -> None:
    out = RAW / f"gbpusd_1m_{side}.pkl"
    rows: list = []
    ts = int(START.timestamp() * 1000)
    if out.exists():
        old = pd.read_pickle(out)
        rows = old.values.tolist()
        ts = int(old["UTC_ms"].max()) + 60_000
    end = int(END.timestamp() * 1000)
    while ts < end:
        got = page(side, ts)
        if not got:
            break
        rows += got
        last = int(got[-1][0])
        print(f"{side} {dt.datetime.utcfromtimestamp(last / 1000)} 累计 {len(rows)}", flush=True)
        if last + 60_000 <= ts:
            break
        ts = last + 60_000
        time.sleep(1)
    df = pd.DataFrame(rows, columns=["UTC_ms", "Open", "High", "Low", "Close", "Volume"])
    df = df.drop_duplicates("UTC_ms").sort_values("UTC_ms").reset_index(drop=True)
    df = df[df["UTC_ms"] < end]
    RAW.mkdir(parents=True, exist_ok=True)
    df.to_pickle(out)
    print(f"{side} 写入 {out} {len(df)} 行", flush=True)


if __name__ == "__main__":
    for s in sys.argv[1:] or ["B", "A"]:
        fetch(s)
