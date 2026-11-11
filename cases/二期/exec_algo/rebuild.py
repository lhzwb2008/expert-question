#!/usr/bin/env python3
"""拆单算法选型的标准重算。--export 从 raw/ 写出附件。不带参数时只读附件。"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
ATT = ROOT / "attachments"
ANS = ROOT / "answer"
Q = 2_000_000.0
CAP = 0.15
IMPACT = 0.002
POV = 0.10
PROFILE_DAYS = 20
LAST_BAR = "14:56"
AM_BARS = 120
STD_MAX = 10.0
ALGOS = [("TWAP", "匀速"), ("VWAP", "按成交量分布"), ("POV", "跟量"), ("AM", "上午完成")]


def export() -> None:
    raw = pd.read_csv(ROOT / "raw" / "min1.csv")
    out = raw[["time", "open", "close", "volume", "turnover"]].rename(columns={"volume": "volume_lots"})
    out["turnover"] = out["turnover"].astype("int64")
    ATT.mkdir(exist_ok=True)
    out.to_csv(ATT / "A01_minute.csv", index=False)
    print("A01", len(out), "行")


def build():
    m = pd.read_csv(ATT / "A01_minute.csv")
    m["day"] = m.time.str[:10]
    m["hm"] = m.time.str[11:]
    m["shares"] = m.volume_lots * 100.0
    cont = m[m.hm <= LAST_BAR]
    vol = cont.pivot(index="day", columns="hm", values="shares")
    amt = cont.pivot(index="day", columns="hm", values="turnover")
    price = amt / vol
    share = vol.div(vol.sum(axis=1), axis=0)
    arrive = m[m.hm == "09:30"].set_index("day").open
    close = m[m.hm == "15:00"].set_index("day").close
    days = vol.index.tolist()
    nb = vol.shape[1]
    recs = []
    for j in range(PROFILE_DAYS, len(days)):
        d = days[j]
        v = vol.loc[d].to_numpy(float)
        p = price.loc[d].to_numpy(float)
        prof = share.iloc[j - PROFILE_DAYS:j].mean().to_numpy()
        mkt = amt.loc[d].sum() / vol.loc[d].sum()
        plans = {
            "TWAP": np.full(nb, Q / nb),
            "VWAP": Q * prof,
            "POV": None,
            "AM": np.r_[np.full(AM_BARS, Q / AM_BARS), np.zeros(nb - AM_BARS)],
        }
        for key, plan in plans.items():
            left, backlog, paid, done_at = Q, 0.0, 0.0, ""
            for b in range(nb):
                if left <= 1e-6:
                    break
                if plan is None:
                    want = min(left, POV * v[b])
                else:
                    backlog += plan[b]
                    want = min(left, backlog)
                fill = min(want, CAP * v[b])
                if plan is not None:
                    backlog -= fill
                if fill > 0:
                    paid += fill * p[b] * (1 + IMPACT * fill / v[b])
                    left -= fill
                    done_at = vol.columns[b]
            if left > 1e-6:
                paid += left * close[d]
                done_at = "15:00"
            avg = paid / Q
            recs.append({
                "date": d, "algo": key, "avg_price": avg, "market_vwap": mkt, "arrival": arrive[d],
                "vs_vwap_bp": (avg / mkt - 1) * 1e4, "vs_arrival_bp": (avg / arrive[d] - 1) * 1e4,
                "done_at": done_at,
            })
    book = pd.DataFrame(recs)
    rows = []
    for key, name in ALGOS:
        b = book[book.algo == key]
        rows.append({
            "algo": key, "name": name, "days": len(b), "mean_vs_vwap_bp": b.vs_vwap_bp.mean(),
            "std_vs_vwap_bp": b.vs_vwap_bp.std(ddof=1), "worst_vs_vwap_bp": b.vs_vwap_bp.max(),
            "mean_vs_arrival_bp": b.vs_arrival_bp.mean(),
            "pass": b.vs_vwap_bp.std(ddof=1) <= STD_MAX,
        })
    table = pd.DataFrame(rows)
    ok = table[table["pass"]]
    choice = ok.sort_values("mean_vs_vwap_bp").iloc[0].algo
    return table, book, choice


def main() -> None:
    if "--export" in sys.argv:
        export()
    table, book, choice = build()
    ANS.mkdir(exist_ok=True)
    show = table.copy()
    for col in ["mean_vs_vwap_bp", "std_vs_vwap_bp", "worst_vs_vwap_bp", "mean_vs_arrival_bp"]:
        show[col] = show[col].map(lambda x: f"{x:.2f}")
    show["pass"] = show["pass"].map(lambda x: "是" if x else "否")
    show.to_csv(ANS / "summary.csv", index=False)
    led = book[book.algo == choice].drop(columns=["algo", "arrival", "vs_arrival_bp"]).copy()
    for col in ["avg_price", "market_vwap"]:
        led[col] = led[col].map(lambda x: f"{x:.4f}")
    led["vs_vwap_bp"] = led["vs_vwap_bp"].map(lambda x: f"{x:.2f}")
    led.to_csv(ANS / "chosen_daily.csv", index=False)
    (ROOT / "summary.json").write_text(json.dumps(
        {"choice": choice, "rows": table.to_dict(orient="records")}, ensure_ascii=False, indent=2))
    print("选择", choice)
    print(show.to_string(index=False))
    print(led.head(2).to_string(index=False))
    print(led.tail(1).to_string(index=False))
    for key in ["POV", "AM", "TWAP"]:
        b = book[(book.algo == key)].iloc[0]
        print(key, b.date, f"{b.avg_price:.4f}", f"{b.vs_vwap_bp:.2f}", b.done_at)
    worst = book[book.algo == choice].sort_values("vs_vwap_bp").iloc[-1]
    print("worst", worst.date, f"{worst.vs_vwap_bp:.2f}")


if __name__ == "__main__":
    main()
