#!/usr/bin/env python3
"""用 LongPort OpenAPI 拉港股日线和证券资料，给快照附件用。不走 MCP，只生成内部快照。

凭证读 ~/workspace/Quantra/.env（LONGPORT_APP_KEY 等），不写进仓库。
已经存过的文件不会重拉。
用法：python3 fetch_longport.py 港股红利
"""
from __future__ import annotations

import json
import os
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "新题数据"
ENV = Path.home() / "workspace" / "Quantra" / ".env"

PLAN = {
    "港股红利": dict(start=date(2025, 7, 1), end=date(2026, 10, 30)),
    "基准复算": dict(start=date(2023, 12, 1), end=date(2026, 10, 30), tickers=[
        "AAPL.US", "MSFT.US", "CSCO.US", "TXN.US", "LRCX.US", "NFLX.US", "NOW.US", "KLAC.US"]),
    "双重上市": dict(start=date(2026, 6, 1), end=date(2026, 10, 30), tickers=[
        "BABA.US", "9988.HK", "JD.US", "9618.HK", "BIDU.US", "9888.HK", "NTES.US", "9999.HK", "TCOM.US", "9961.HK",
        "BILI.US", "9626.HK", "ZTO.US", "2057.HK", "LI.US", "2015.HK", "EDU.US", "9901.HK", "YUMC.US", "9987.HK"]),
    "两融回放": dict(start=date(2026, 6, 1), end=date(2026, 10, 30), tickers=[
        "601318.SH", "600030.SH", "601899.SH", "300750.SZ", "000333.SZ", "688981.SH"]),
    "定增减持": dict(start=date(2026, 8, 1), end=date(2026, 11, 18), tickers=[
        "002371.SZ", "688012.SH", "603986.SH", "002049.SZ", "600584.SH"]),
    "雪球回测": dict(start=date(2016, 11, 1), end=date(2026, 10, 30), tickers=["510500.SH", "512100.SH", "000905.SH", "000852.SH"]),
}


def load_env() -> None:
    for line in ENV.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def main() -> None:
    load_env()
    from longport.openapi import AdjustType, Config, Period, QuoteContext
    ctx = QuoteContext(Config.from_apikey_env())
    for name in sys.argv[1:] or list(PLAN):
        plan = PLAN[name]
        tickers = plan.get("tickers") or sorted(p.stem for p in (DATA / name).glob("*.HK.json"))
        out = DATA / f"{name}_longport"
        out.mkdir(parents=True, exist_ok=True)
        info_path = out / "static_info.json"
        if not info_path.exists():
            info = ctx.static_info(tickers)
            json.dump([dict(symbol=i.symbol, name_cn=i.name_cn, name_hk=i.name_hk, name_en=i.name_en, lot_size=i.lot_size,
                            currency=i.currency, total_shares=i.total_shares) for i in info],
                      open(info_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        for t in tickers:
            for adj, tag in ((AdjustType.NoAdjust, "noadj"), (AdjustType.ForwardAdjust, "fwd")):
                path = out / f"{t}_{tag}.json"
                if path.exists():
                    continue
                rows = []
                for c in ctx.history_candlesticks_by_date(t, Period.Day, adj, plan["start"], plan["end"]):
                    rows.append(dict(date=c.timestamp.strftime("%Y-%m-%d"), open=str(c.open), high=str(c.high), low=str(c.low),
                                     close=str(c.close), volume=int(c.volume), turnover=str(c.turnover)))
                json.dump(rows, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
                print(name, t, tag, len(rows), rows[0]["date"], rows[-1]["date"])


if __name__ == "__main__":
    main()
