#!/usr/bin/env python3
"""因子入库检验的标准重算。--export 从 raw/ 写出附件。不带参数时只读附件。"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
ATT = ROOT / "attachments"
ANS = ROOT / "answer"
FIRST, LAST = "2020-12", "2026-10"
GROUP = 12
COST = 0.002
IC_MIN, T_MIN = 0.03, 2.0
FACTORS = [("F1", "动量"), ("F2", "反转"), ("F3", "低波动"), ("F4", "52周高点"), ("F5", "彩票")]


def export() -> None:
    raw = pd.read_csv(ROOT / "raw" / "daily.csv")
    out = pd.DataFrame({
        "code": raw.symbol.str.slice(0, 6) + raw.symbol.str.slice(7).map({"SS": ".SH", "SZ": ".SZ"}),
        "date": raw.date,
        "adj_close": raw.adj_close.round(4),
    })
    ATT.mkdir(exist_ok=True)
    out.to_csv(ATT / "A01_prices.csv", index=False)
    print("A01", len(out), "行", out.code.nunique(), "只")


def factor(key: str, px: pd.DataFrame, ret: pd.DataFrame, i: int) -> pd.Series:
    if key == "F1":
        return px.iloc[i - 21] / px.iloc[i - 252] - 1
    if key == "F2":
        return -(px.iloc[i] / px.iloc[i - 21] - 1)
    if key == "F3":
        return -ret.iloc[i - 59:i + 1].std()
    if key == "F4":
        return px.iloc[i] / px.iloc[i - 249:i + 1].max()
    return -ret.iloc[i - 19:i + 1].max()


def build():
    px = pd.read_csv(ATT / "A01_prices.csv").pivot(index="date", columns="code", values="adj_close")
    ret = px.pct_change()
    days = px.index.to_series()
    ends = days.groupby(days.str[:7]).last()
    ends = ends[(ends.index >= FIRST) & (ends.index <= LAST)].tolist()
    pos = {d: i for i, d in enumerate(px.index)}
    rows, books = [], {}
    for key, name in FACTORS:
        recs, top0, bot0 = [], None, None
        for k in range(len(ends) - 1):
            t, t1 = ends[k], ends[k + 1]
            f = factor(key, px, ret, pos[t])
            fwd = px.loc[t1] / px.loc[t] - 1
            ic = f.rank().corr(fwd.rank())
            order = f.sort_values(ascending=False, kind="mergesort").index.tolist()
            top, bot = set(order[:GROUP]), set(order[-GROUP:])
            turn = ((GROUP - len(top & top0)) / GROUP if top0 else 1.0) + ((GROUP - len(bot & bot0)) / GROUP if bot0 else 1.0)
            gross = fwd[sorted(top)].mean() - fwd[sorted(bot)].mean()
            recs.append({"signal_date": t, "hold_to": t1, "ic": ic, "long_short": gross,
                         "turnover": turn, "net": gross - COST * turn})
            top0, bot0 = top, bot
        b = pd.DataFrame(recs)
        books[key] = b
        n = len(b)
        t_stat = b.ic.mean() / b.ic.std(ddof=1) * np.sqrt(n)
        rows.append({
            "factor": key, "name": name, "months": n, "ic_mean": b.ic.mean(), "ic_t": t_stat,
            "ic_pos_months": int((b.ic > 0).sum()), "ls_gross_pct": b.long_short.mean() * 100,
            "ls_net_pct": b.net.mean() * 100,
            "pass": b.ic.mean() >= IC_MIN and t_stat >= T_MIN and b.net.mean() > 0,
        })
    return pd.DataFrame(rows), books


def main() -> None:
    if "--export" in sys.argv:
        export()
    table, books = build()
    ANS.mkdir(exist_ok=True)
    show = table.copy()
    show["ic_mean"] = show["ic_mean"].map(lambda x: f"{x:.4f}")
    show["ic_t"] = show["ic_t"].map(lambda x: f"{x:.2f}")
    for col in ["ls_gross_pct", "ls_net_pct"]:
        show[col] = show[col].map(lambda x: f"{x:.3f}")
    show["pass"] = show["pass"].map(lambda x: "是" if x else "否")
    show.to_csv(ANS / "summary.csv", index=False)
    admitted = table[table["pass"]].factor.tolist()
    parts = []
    for key in admitted:
        b = books[key].copy()
        b.insert(0, "factor", key)
        parts.append(b)
    if parts:
        led = pd.concat(parts)
        led["ic"] = led["ic"].map(lambda x: f"{x:.4f}")
        for col in ["long_short", "net"]:
            led[col] = (led[col] * 100).map(lambda x: f"{x:.3f}")
        led["turnover"] = led["turnover"].map(lambda x: f"{x:.4f}")
        led = led.rename(columns={"long_short": "long_short_pct", "net": "net_pct"})
        led.to_csv(ANS / "admitted_monthly.csv", index=False)
        print(led.head(3).to_string(index=False))
        print(led.tail(2).to_string(index=False))
    (ROOT / "summary.json").write_text(json.dumps(
        {"admitted": admitted, "rows": table.to_dict(orient="records")}, ensure_ascii=False, indent=2))
    print("入库", admitted)
    print(show.to_string(index=False))


if __name__ == "__main__":
    main()
