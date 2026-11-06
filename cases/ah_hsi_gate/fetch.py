#!/usr/bin/env python3
"""拉取本题用到的 A/H 不复权日线，以及公开的美元兑港币、美元兑人民币。

行情走本机已有的 Longport 环境变量，脚本里不写账号。汇率走公开行情。
输出在 raw/，不作为输入附件。
"""
from __future__ import annotations

import json
import time
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
from dotenv import load_dotenv
from longport.openapi import AdjustType, Config, Period, QuoteContext

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
ENV = Path.home() / "workspace" / "Quantra" / ".env"
HK = ZoneInfo("Asia/Hong_Kong")
RANGES = [
    (date(2020, 8, 1), date(2022, 6, 30)),
    (date(2022, 7, 1), date(2024, 6, 30)),
    (date(2024, 7, 1), date(2026, 10, 30)),
]
SYMBOLS = [
    "601088.SH", "1088.HK", "601328.SH", "3328.HK", "002594.SZ", "1211.HK",
    "600036.SH", "3968.HK", "600690.SH", "6690.HK", "601899.SH", "2899.HK",
    "603259.SH", "2359.HK", "000333.SZ", "300.HK", "0300.HK", "601728.SH", "728.HK", "0728.HK",
    "300750.SZ", "3750.HK", "603993.SH", "3993.HK", "601600.SH", "2600.HK",
    "000338.SZ", "2338.HK", "688981.SH", "981.HK", "0981.HK",
    "601398.SH", "1398.HK", "601939.SH", "939.HK", "0939.HK",
    "601318.SH", "2318.HK", "601988.SH", "3988.HK",
]


def fetch_symbol(ctx, symbol: str) -> pd.DataFrame:
    rows = []
    for a, b in RANGES:
        try:
            resp = ctx.history_candlesticks_by_date(symbol, Period.Day, AdjustType.NoAdjust, a, b)
        except Exception as e:
            print(f"{symbol} {a} ERR {e}", flush=True)
            return pd.DataFrame()
        if len(resp) >= 1000:
            print(f"{symbol} {a} 撞上 1000 条上限", flush=True)
        for c in resp:
            rows.append({
                "date": c.timestamp.replace(tzinfo=HK).astimezone(HK).strftime("%Y-%m-%d"),
                "symbol": symbol,
                "close": c.close,
            })
        time.sleep(0.05)
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows).drop_duplicates(["date", "symbol"]).sort_values("date")
    return df


def fetch_fx() -> None:
    start = int(datetime(2020, 7, 1, tzinfo=HK).timestamp())
    end = int(datetime(2026, 11, 1, tzinfo=HK).timestamp())
    frames = []
    for yahoo, name in [("HKD=X", "usd_hkd"), ("CNY=X", "usd_cny")]:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo}?interval=1d&period1={start}&period2={end}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        raw = urllib.request.urlopen(req, timeout=30).read()
        result = json.loads(raw)["chart"]["result"][0]
        ts = result["timestamp"]
        close = result["indicators"]["quote"][0]["close"]
        rows = []
        for t, c in zip(ts, close):
            if c is None:
                continue
            d = datetime.fromtimestamp(t, HK).strftime("%Y-%m-%d")
            rows.append({"date": d, name: c})
        frames.append(pd.DataFrame(rows).groupby("date", as_index=False)[name].last())
    fx = frames[0].merge(frames[1], on="date", how="inner")
    fx.to_csv(RAW / "fx.csv", index=False)
    print(f"fx {len(fx)} {fx.date.min()} {fx.date.max()}", flush=True)


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    load_dotenv(ENV)
    ctx = QuoteContext(Config.from_apikey_env())
    frames = []
    for symbol in SYMBOLS:
        df = fetch_symbol(ctx, symbol)
        print(f"{symbol} {len(df)} {df.date.min() if len(df) else '-'} {df.date.max() if len(df) else '-'}", flush=True)
        if len(df):
            frames.append(df)
    px = pd.concat(frames, ignore_index=True)
    px.to_csv(RAW / "prices.csv", index=False)
    print(f"prices {len(px)}", flush=True)
    fetch_fx()


if __name__ == "__main__":
    main()
