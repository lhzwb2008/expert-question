#!/usr/bin/env python3
"""永续资金费账本的标准重算。--export 从 raw/ 写出附件。不带参数时只读附件。"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent
ATT = ROOT / "attachments"
ANS = ROOT / "answer"
RAW = ROOT / "raw"
ORDER = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "DOGEUSDT", "WIFUSDT"]
LOOK = 21
THR = 0.00004
NOTIONAL = 10_000.0
SPOT_FEE = 0.001
PERP_FEE = 0.0005
MAX_DD = 400.0


def export() -> None:
    fund = pd.read_csv(RAW / "funding.csv")
    spot = pd.read_csv(RAW / "spot_1h.csv")
    fund["time"] = pd.to_datetime(fund.time_ms, unit="ms", utc=True).dt.floor("h")
    spot["time"] = pd.to_datetime(spot.time_ms, unit="ms", utc=True).dt.floor("h")
    fund = fund[fund.symbol.isin(ORDER)].sort_values(["symbol", "time"])
    spot = spot[spot.symbol.isin(ORDER)].sort_values(["symbol", "time"])
    if fund.duplicated(["symbol", "time"]).any() or spot.duplicated(["symbol", "time"]).any():
        raise SystemExit("整点后有重复时间")
    # 现货还没上市的那段结算不放进附件，题目里就不用再写缺价怎么处理
    fund = fund.merge(spot[["symbol", "time"]], on=["symbol", "time"], how="inner")
    out_f = pd.DataFrame({
        "symbol": fund.symbol,
        "time_utc": fund.time.dt.strftime("%Y-%m-%d %H:%M"),
        "funding_rate": fund.funding_rate.astype(float).map(lambda x: f"{x:.8f}"),
        "mark_price": fund.mark_price.astype(float),
    })
    out_s = pd.DataFrame({
        "symbol": spot.symbol,
        "time_utc": spot.time.dt.strftime("%Y-%m-%d %H:%M"),
        "open": spot.open.astype(float),
    })
    ATT.mkdir(parents=True, exist_ok=True)
    out_f.to_csv(ATT / "A01_funding.csv", index=False)
    out_s.to_csv(ATT / "A02_spot.csv", index=False)
    print(f"A01 {len(out_f)} 行  A02 {len(out_s)} 行")


def run_symbol(g: pd.DataFrame) -> tuple[dict, pd.DataFrame]:
    g = g.sort_values("time").reset_index(drop=True)
    rates = g.funding_rate.to_numpy(float)
    marks = g.mark_price.to_numpy(float)
    spots = g.open.to_numpy(float)
    stamp = g.time.dt.strftime("%Y-%m-%d %H:%M").tolist()
    pos = None
    realized = 0.0
    peak = 0.0
    max_dd = 0.0
    collected = 0
    trades = []

    def mark_equity(eq: float) -> None:
        nonlocal peak, max_dd
        peak = max(peak, eq)
        max_dd = max(max_dd, peak - eq)

    def close_at(i: int) -> None:
        nonlocal pos, realized
        qty = pos["qty"]
        fee_out = SPOT_FEE * qty * spots[i] + PERP_FEE * qty * marks[i]
        pnl = ((pos["mark0"] - marks[i]) * qty + (spots[i] - pos["spot0"]) * qty
               + pos["fund"] - pos["fee_in"] - fee_out)
        realized += pnl
        trades.append({
            "entry_utc": pos["t0"], "exit_utc": stamp[i],
            "entry_spot": pos["spot0"], "entry_mark": pos["mark0"],
            "exit_spot": float(spots[i]), "exit_mark": float(marks[i]),
            "qty": qty, "funding": pos["fund"], "pnl": pnl,
        })
        pos = None

    for i in range(len(g)):
        if pos is not None:
            pos["fund"] += rates[i] * marks[i] * pos["qty"]
            collected += 1
        hold = i + 1 >= LOOK and rates[i - LOOK + 1:i + 1].mean() >= THR
        if pos is not None and not hold:
            close_at(i)
        elif pos is None and hold:
            qty = NOTIONAL / spots[i]
            pos = {
                "qty": qty, "spot0": float(spots[i]), "mark0": float(marks[i]),
                "fund": 0.0, "t0": stamp[i],
                "fee_in": SPOT_FEE * NOTIONAL + PERP_FEE * qty * marks[i],
            }
        if pos is None:
            mark_equity(realized)
        else:
            qty = pos["qty"]
            mark_equity(realized + (pos["mark0"] - marks[i]) * qty
                        + (spots[i] - pos["spot0"]) * qty + pos["fund"] - pos["fee_in"])
    if pos is not None:
        close_at(len(g) - 1)
        mark_equity(realized)
    summary = {
        "symbol": g.symbol.iloc[0],
        "net": realized,
        "entries": len(trades),
        "collected": collected,
        "max_dd": max_dd,
        "pass": realized > 0 and max_dd <= MAX_DD,
    }
    return summary, pd.DataFrame(trades)


def build():
    fund = pd.read_csv(ATT / "A01_funding.csv")
    spot = pd.read_csv(ATT / "A02_spot.csv")
    merged = fund.merge(spot, on=["symbol", "time_utc"], how="left")
    if merged.open.isna().any():
        raise SystemExit("有结算找不到现货开盘价")
    merged["time"] = pd.to_datetime(merged.time_utc, utc=True)
    rows = []
    books = {}
    for symbol in ORDER:
        summary, trades = run_symbol(merged[merged.symbol == symbol].copy())
        rows.append(summary)
        books[symbol] = trades
    table = pd.DataFrame(rows)
    passed = table[table["pass"]]
    if passed.empty:
        choice = "不上"
    else:
        choice = passed.sort_values(["net", "symbol"], ascending=[False, True]).iloc[0].symbol
    return table, books, choice


def main() -> None:
    if "--export" in sys.argv:
        export()
    table, books, choice = build()
    ANS.mkdir(parents=True, exist_ok=True)
    show = table.copy()
    show["net"] = show["net"].map(lambda x: f"{x:.2f}")
    show["max_dd"] = show["max_dd"].map(lambda x: f"{x:.2f}")
    show["pass"] = show["pass"].map(lambda x: "是" if x else "否")
    show.to_csv(ANS / "summary.csv", index=False)
    chosen = books[choice].copy() if choice != "不上" else pd.DataFrame()
    for col in ["entry_spot", "entry_mark", "exit_spot", "exit_mark", "funding", "pnl"]:
        if len(chosen):
            chosen[col] = chosen[col].map(lambda x: f"{x:.2f}")
    if len(chosen):
        chosen["qty"] = chosen["qty"].map(lambda x: f"{x:.6f}")
    chosen.to_csv(ANS / "chosen_trades.csv", index=False)
    (ROOT / "summary.json").write_text(json.dumps({
        "choice": choice,
        "rows": table.to_dict(orient="records"),
    }, ensure_ascii=False, indent=2))
    print("选择", choice)
    print(show.to_string(index=False))
    if len(chosen):
        print(chosen.to_string(index=False))


if __name__ == "__main__":
    main()
