#!/usr/bin/env python3
"""ETF 组合配权方案选型的标准重算。--export 从 raw/ 写出附件。不带参数时只读附件。"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
ATT = ROOT / "attachments"
ANS = ROOT / "answer"
POOL = [
    ("510300.SH", "沪深300ETF"), ("159915.SZ", "创业板ETF"), ("510880.SH", "红利ETF"), ("159920.SZ", "恒生ETF"),
    ("513100.SH", "纳指ETF"), ("518880.SH", "黄金ETF"), ("511010.SH", "国债ETF"), ("512880.SH", "证券ETF"),
    ("512010.SH", "医药ETF"), ("512400.SH", "有色金属ETF"),
]
CODES = [c for c, _ in POOL]
FIRST, LAST = "2020-12", "2026-10"
LOOK = 250
TOP = 3
COST = 0.001
MDD_MAX = 0.15
SCHEMES = [("E", "等权"), ("V", "波动率倒数"), ("M", "动量前三"), ("D", "低波动前三")]


def export() -> None:
    raw = pd.read_csv(ROOT / "raw" / "daily.csv")
    raw["code"] = raw.symbol.str.slice(0, 6) + raw.symbol.str.slice(7).map({"SS": ".SH", "SZ": ".SZ"})
    raw = raw[raw.code.isin(CODES)]
    full = raw.groupby("date").code.nunique()
    raw = raw[raw.date.isin(full[full == len(CODES)].index)]  # 只留 10 只都有行情的交易日
    out = raw[["code", "date"]].copy()
    out["adj_close"] = raw.adj_close.round(4)
    ATT.mkdir(exist_ok=True)
    out.to_csv(ATT / "A01_prices.csv", index=False)
    pd.DataFrame(POOL, columns=["code", "name"]).to_csv(ATT / "A02_pool.csv", index=False)
    print("A01", len(out), "行")


def weights(key: str, px: pd.DataFrame, ret: pd.DataFrame, i: int) -> pd.Series:
    sd = ret.iloc[i - LOOK + 1:i + 1].std()
    mom = px.iloc[i] / px.iloc[i - LOOK] - 1
    w = pd.Series(0.0, index=CODES)
    if key == "E":
        w[:] = 1 / len(CODES)
    elif key == "V":
        w = (1 / sd) / (1 / sd).sum()
    elif key == "M":
        w[mom.sort_values(ascending=False, kind="mergesort").index[:TOP]] = 1 / TOP
    else:
        w[sd.sort_values(kind="mergesort").index[:TOP]] = 1 / TOP
    return w


def build():
    px = pd.read_csv(ATT / "A01_prices.csv").pivot(index="date", columns="code", values="adj_close")[CODES]
    ret = px.pct_change()
    days = px.index.to_series()
    ends = days.groupby(days.str[:7]).last()
    ends = ends[(ends.index >= FIRST) & (ends.index <= LAST)].tolist()
    pos = {d: i for i, d in enumerate(px.index)}
    rows, books = [], {}
    for key, name in SCHEMES:
        nav, peak, mdd, before, recs = 1.0, 1.0, 0.0, None, []
        for k in range(len(ends) - 1):
            t, t1 = ends[k], ends[k + 1]
            w = weights(key, px, ret, pos[t])
            r = px.loc[t1] / px.loc[t] - 1
            turn = 1.0 if before is None else float((w - before).abs().sum())
            gross = float((w * r).sum())
            net = (1 - COST * turn) * (1 + gross) - 1
            before = w * (1 + r) / (1 + gross)
            nav *= 1 + net
            peak = max(peak, nav)
            mdd = max(mdd, 1 - nav / peak)
            held = w[w > 0].sort_values(ascending=False, kind="mergesort")
            recs.append({
                "rebalance_date": t, "hold_to": t1,
                "holdings": " ".join(f"{c}:{v:.4f}" for c, v in held.items()) if key != "E" else "十只各0.1000",
                "gross_pct": gross * 100, "turnover": turn, "net_pct": net * 100, "nav": nav,
            })
        b = pd.DataFrame(recs)
        books[key] = b
        n = len(b)
        rows.append({
            "scheme": key, "name": name, "months": n, "final_nav": nav,
            "ann_return_pct": (nav ** (12 / n) - 1) * 100,
            "ann_vol_pct": (b.net_pct / 100).std(ddof=1) * np.sqrt(12) * 100,
            "max_drawdown_pct": mdd * 100, "avg_turnover": b.turnover.iloc[1:].mean(),
            "pass": mdd <= MDD_MAX,
        })
    table = pd.DataFrame(rows)
    ok = table[table["pass"]]
    choice = ok.sort_values("ann_return_pct", ascending=False).iloc[0].scheme
    return table, books, choice


def main() -> None:
    if "--export" in sys.argv:
        export()
    table, books, choice = build()
    ANS.mkdir(exist_ok=True)
    show = table.copy()
    show["final_nav"] = show["final_nav"].map(lambda x: f"{x:.4f}")
    for col in ["ann_return_pct", "ann_vol_pct", "max_drawdown_pct"]:
        show[col] = show[col].map(lambda x: f"{x:.2f}")
    show["avg_turnover"] = show["avg_turnover"].map(lambda x: f"{x:.4f}")
    show["pass"] = show["pass"].map(lambda x: "是" if x else "否")
    show.to_csv(ANS / "summary.csv", index=False)
    led = books[choice].copy()
    for col in ["gross_pct", "net_pct"]:
        led[col] = led[col].map(lambda x: f"{x:.3f}")
    led["turnover"] = led["turnover"].map(lambda x: f"{x:.4f}")
    led["nav"] = led["nav"].map(lambda x: f"{x:.4f}")
    led.to_csv(ANS / "chosen_monthly.csv", index=False)
    (ROOT / "summary.json").write_text(json.dumps(
        {"choice": choice, "rows": table.to_dict(orient="records")}, ensure_ascii=False, indent=2))
    print("选择", choice)
    print(show.to_string(index=False))
    print(led.head(3).to_string(index=False))
    print(led.tail(1).to_string(index=False))
    m = books["M"]
    print("M 首月", m.iloc[0].to_dict())


if __name__ == "__main__":
    main()
