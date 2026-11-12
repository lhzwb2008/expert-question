#!/usr/bin/env python3
"""配对交易候选对筛选的标准重算。--export 从 raw/ 写出附件。不带参数时只读附件。"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
ATT = ROOT / "attachments"
ANS = ROOT / "answer"
PAIRS = [
    ("KO", "PEP", "饮料"), ("V", "MA", "支付"), ("HD", "LOW", "家装零售"), ("XOM", "CVX", "石油"),
    ("JPM", "BAC", "银行"), ("UPS", "FDX", "快递"), ("GS", "MS", "投行"), ("PG", "CL", "日化"),
]
LOOK = 120
Z_IN, Z_OUT, Z_STOP = 2.0, 0.5, 4.0
MAX_HOLD = 40
LEG = 10_000.0
COST = 0.0005
START = "2021-01-04"
MAX_STOPS = 4


def export() -> None:
    raw = pd.read_csv(ROOT / "raw" / "daily.csv")
    out = raw[["symbol", "date"]].copy()
    out["adj_close"] = raw.adj_close.round(4)
    ATT.mkdir(exist_ok=True)
    out.to_csv(ATT / "A01_prices.csv", index=False)
    pd.DataFrame([{"pair": f"{a}/{b}", "stock_a": a, "stock_b": b, "industry": ind} for a, b, ind in PAIRS]).to_csv(
        ATT / "A02_pairs.csv", index=False)
    print("A01", len(out), "行")


def run_pair(px: pd.DataFrame, a: str, b: str) -> pd.DataFrame:
    spread = np.log(px[a] / px[b])
    prev = spread.shift(1)
    z = (spread - prev.rolling(LOOK).mean()) / prev.rolling(LOOK).std()
    dates = px.index.tolist()
    pos, i0, trades = 0, None, []
    for i, day in enumerate(dates):
        if day < START:
            continue
        zi = z.iloc[i]
        last = i == len(dates) - 1
        if pos != 0:
            why = None
            if (pos == -1 and zi <= Z_OUT) or (pos == 1 and zi >= -Z_OUT):
                why = "回归"
            elif (pos == -1 and zi >= Z_STOP) or (pos == 1 and zi <= -Z_STOP):
                why = "止损"
            elif i - i0 >= MAX_HOLD:
                why = "到期"
            elif last:
                why = "期末"
            if why:
                ra = px[a].iloc[i] / px[a].iloc[i0] - 1
                rb = px[b].iloc[i] / px[b].iloc[i0] - 1
                trades.append({
                    "entry_date": dates[i0], "exit_date": day,
                    "side": "多A空B" if pos == 1 else "空A多B",
                    "entry_z": z.iloc[i0], "exit_z": zi, "exit_reason": why,
                    "pnl": LEG * pos * (ra - rb) - 4 * COST * LEG,
                })
                pos = 0
        elif not last:
            if zi >= Z_IN:
                pos, i0 = -1, i
            elif zi <= -Z_IN:
                pos, i0 = 1, i
    return pd.DataFrame(trades)


def build():
    px = pd.read_csv(ATT / "A01_prices.csv").pivot(index="date", columns="symbol", values="adj_close")
    rows, books = [], {}
    for a, b, _ in PAIRS:
        t = run_pair(px, a, b)
        books[f"{a}/{b}"] = t
        net = t.pnl.sum()
        stops = int((t.exit_reason == "止损").sum())
        rows.append({
            "pair": f"{a}/{b}", "trades": len(t), "net": net, "wins": int((t.pnl > 0).sum()),
            "stops": stops, "worst": t.pnl.min(), "pass": net > 0 and stops <= MAX_STOPS,
        })
    table = pd.DataFrame(rows)
    ok = table[table["pass"]]
    choice = "都不做" if ok.empty else ok.sort_values("net", ascending=False).iloc[0].pair
    return table, books, choice


def main() -> None:
    if "--export" in sys.argv:
        export()
    table, books, choice = build()
    ANS.mkdir(exist_ok=True)
    show = table.copy()
    for col in ["net", "worst"]:
        show[col] = show[col].map(lambda x: f"{x:.2f}")
    show["pass"] = show["pass"].map(lambda x: "是" if x else "否")
    show.to_csv(ANS / "summary.csv", index=False)
    if choice != "都不做":
        led = books[choice].copy()
        for col in ["entry_z", "exit_z"]:
            led[col] = led[col].map(lambda x: f"{x:.4f}")
        led["pnl"] = led["pnl"].map(lambda x: f"{x:.2f}")
        led.to_csv(ANS / "chosen_trades.csv", index=False)
        print(led.to_string(index=False))
    (ROOT / "summary.json").write_text(json.dumps(
        {"choice": choice, "rows": table.to_dict(orient="records")}, ensure_ascii=False, indent=2))
    print("选择", choice)
    print(show.to_string(index=False))


if __name__ == "__main__":
    main()
