#!/usr/bin/env python3
"""VaR 模型回测的标准重算。--export 从 raw/ 写出附件。不带参数时只读附件。"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
ATT = ROOT / "attachments"
ANS = ROOT / "answer"
WEIGHTS = {"SPY": 0.30, "EFA": 0.10, "EEM": 0.10, "TLT": 0.15, "IEF": 0.10, "HYG": 0.10, "GLD": 0.10, "USO": 0.05}
NAMES = {"SPY": "美国大盘股", "EFA": "发达市场股票", "EEM": "新兴市场股票", "TLT": "美国长期国债",
         "IEF": "美国中期国债", "HYG": "美国高收益债", "GLD": "黄金", "USO": "原油"}
START = "2021-01-04"
WIN = 250
EW = 100
LAM = 0.94
Z99 = 2.326
P = 0.01
LR_MAX = 3.841
RED = 10


def export() -> None:
    raw = pd.read_csv(ROOT / "raw" / "daily.csv")
    raw = raw[raw.symbol.isin(WEIGHTS)]
    out = raw[["symbol", "date"]].copy()
    out["adj_close"] = raw.adj_close.round(4)
    ATT.mkdir(exist_ok=True)
    out.to_csv(ATT / "A01_prices.csv", index=False)
    pd.DataFrame([{"symbol": k, "asset": NAMES[k], "weight": w} for k, w in WEIGHTS.items()]).to_csv(
        ATT / "A02_portfolio.csv", index=False)
    print("A01", len(out), "行")


def kupiec(x: int, n: int) -> float:
    ph = x / n
    return -2 * ((n - x) * math.log(1 - P) + x * math.log(P) - (n - x) * math.log(1 - ph) - x * math.log(ph))


def build():
    px = pd.read_csv(ATT / "A01_prices.csv").pivot(index="date", columns="symbol", values="adj_close")
    ret = px.pct_change().dropna()
    port = sum(ret[k] * w for k, w in WEIGHTS.items())
    dates = port.index.tolist()
    v = port.to_numpy()
    test = [i for i, d in enumerate(dates) if d >= START]
    w = (1 - LAM) * LAM ** np.arange(EW)

    def ewma(i: int) -> float:
        return math.sqrt(float((w * v[i - EW:i][::-1] ** 2).sum()))

    sig = np.array([ewma(i) if i >= EW else np.nan for i in range(len(v))])
    models = {
        "A": ("历史模拟法", lambda i: -np.sort(v[i - WIN:i])[2]),
        "B": ("正态法", lambda i: Z99 * np.std(v[i - WIN:i], ddof=1)),
        "C": ("指数加权法", lambda i: Z99 * sig[i]),
        "D": ("波动率调整历史模拟法", lambda i: -sig[i] * np.sort(v[i - WIN:i] / sig[i - WIN:i])[2]),
    }
    rows, books = [], {}
    n = len(test)
    for key, (name, fn) in models.items():
        var = np.array([fn(i) for i in test])
        hit = v[test] < -var
        x = int(hit.sum())
        worst250 = int(pd.Series(hit.astype(int)).rolling(250).sum().max())
        lr = kupiec(x, n)
        rows.append({
            "model": key, "name": name, "days": n, "exceptions": x, "lr": lr,
            "max_in_250": worst250, "avg_var_pct": var.mean() * 100,
            "pass": lr <= LR_MAX and worst250 < RED,
        })
        books[key] = pd.DataFrame({
            "date": [dates[i] for i in test], "return_pct": v[test] * 100, "var_pct": var * 100, "hit": hit,
        })
    table = pd.DataFrame(rows)
    ok = table[table["pass"]]
    choice = "都不用" if ok.empty else ok.sort_values("avg_var_pct").iloc[0].model
    return table, books, choice


def main() -> None:
    if "--export" in sys.argv:
        export()
    table, books, choice = build()
    ANS.mkdir(exist_ok=True)
    show = table.copy()
    show["lr"] = show["lr"].map(lambda x: f"{x:.3f}")
    show["avg_var_pct"] = show["avg_var_pct"].map(lambda x: f"{x:.4f}")
    show["pass"] = show["pass"].map(lambda x: "是" if x else "否")
    show.to_csv(ANS / "summary.csv", index=False)
    if choice != "都不用":
        b = books[choice]
        hits = b[b.hit].drop(columns="hit").copy()
        for col in ["return_pct", "var_pct"]:
            hits[col] = hits[col].map(lambda x: f"{x:.4f}")
        hits.to_csv(ANS / "chosen_exceptions.csv", index=False)
        print(hits.to_string(index=False))
        print(b.head(1).to_string(index=False))
    (ROOT / "summary.json").write_text(json.dumps(
        {"choice": choice, "rows": table.to_dict(orient="records")}, ensure_ascii=False, indent=2))
    print("选择", choice)
    print(show.to_string(index=False))


if __name__ == "__main__":
    main()
