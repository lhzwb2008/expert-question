#!/usr/bin/env python3
"""恒生指数成份股调整交易的标准重算。

--export 从 raw/ 写出 A01、A02。不带参数时只读附件。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent
ATT = ROOT / "attachments"
ANS = ROOT / "answer"
RAW = ROOT / "raw"
FIRST = pd.Timestamp("2020-09-07")
LAST = pd.Timestamp("2026-09-07")
FEE = 0.004
NS = (1, 5, 10)


def export() -> None:
    code = pd.read_csv(ATT / "A07_公司代码.csv", dtype=str).fillna("")
    both = code[(code.a_symbol != "") & (code.h_symbol != "")]
    keep = list(both.a_symbol) + list(both.h_symbol)
    px = pd.read_csv(RAW / "prices.csv")
    px = px[px.symbol.isin(keep)].drop_duplicates(["date", "symbol"])
    missing = sorted(set(keep) - set(px.symbol))
    if missing:
        raise SystemExit(f"缺少行情: {missing}")
    px = px.sort_values(["symbol", "date"])
    px.to_csv(ATT / "A01_prices.csv", index=False)
    fx = pd.read_csv(RAW / "fx.csv")
    fx["usd_hkd"] = fx["usd_hkd"].round(6)
    fx["usd_cny"] = fx["usd_cny"].round(6)
    fx.to_csv(ATT / "A02_fx.csv", index=False)
    print(f"A01 {len(px)} 行  A02 {len(fx)} 行")


def parse_date(text: str) -> pd.Timestamp:
    year, rest = text.split("年", 1)
    month, rest = rest.split("月", 1)
    day = rest.replace("日", "")
    return pd.Timestamp(int(year), int(month), int(day))


def events(code: pd.DataFrame) -> list[dict]:
    pair = {}
    for r in code.itertuples(index=False):
        if r.a_symbol and r.h_symbol:
            pair[r.name] = (r.a_symbol, r.h_symbol)
    out = []
    for line in (ATT / "A06_成份股变动表.md").read_text().splitlines():
        if not line.startswith("|") or "年" not in line[:24]:
            continue
        parts = [p.strip() for p in line.strip().strip("|").split("|")]
        if len(parts) < 5:
            continue
        raw_date, removed, added, _count, note = parts[:5]
        if "指數檢討" not in note:
            continue
        day = parse_date(raw_date)
        if day < FIRST or day > LAST:
            continue
        for side, cell in (("剔除", removed), ("加入", added)):
            for name in cell.split():
                if name not in pair:
                    continue
                a_symbol, h_symbol = pair[name]
                out.append({
                    "date": day, "side": side, "name": name,
                    "a_symbol": a_symbol, "h_symbol": h_symbol,
                })
    return out


def build():
    px = pd.read_csv(ATT / "A01_prices.csv")
    px["date"] = pd.to_datetime(px["date"])
    fx = pd.read_csv(ATT / "A02_fx.csv")
    fx["date"] = pd.to_datetime(fx["date"])
    fx = fx.sort_values("date")
    fx["k"] = fx["usd_hkd"] / fx["usd_cny"]
    code = pd.read_csv(ATT / "A07_公司代码.csv", dtype=str).fillna("")
    series = {}
    for symbol, g in px.groupby("symbol"):
        series[symbol] = g.drop_duplicates("date").set_index("date")["close"].sort_index()

    def k_on(day: pd.Timestamp) -> float:
        sub = fx.loc[fx["date"] <= day, "k"]
        if sub.empty:
            raise RuntimeError(f"没有汇率 {day.date()}")
        return float(sub.iloc[-1])

    rows = []
    for ev in events(code):
        a = series[ev["a_symbol"]]
        h = series[ev["h_symbol"]]
        days = sorted(set(a.index) & set(h.index))
        before = [d for d in days if d < ev["date"]]
        after = [d for d in days if d >= ev["date"]]
        if not before:
            raise RuntimeError(f"没有开仓日 {ev['name']} {ev['date'].date()}")
        entry = before[-1]
        rec = {
            "date": ev["date"].strftime("%Y-%m-%d"),
            "side": ev["side"],
            "name": ev["name"],
            "a_symbol": ev["a_symbol"],
            "h_symbol": ev["h_symbol"],
            "entry": entry.strftime("%Y-%m-%d"),
        }
        for n in NS:
            if len(after) < n:
                raise RuntimeError(f"窗口不足 {ev['name']} N={n}")
            exit_day = after[n - 1]
            a0, a1 = float(a.loc[entry]), float(a.loc[exit_day])
            h0, h1 = float(h.loc[entry]), float(h.loc[exit_day])
            ah0, ah1 = a0 * k_on(entry), a1 * k_on(exit_day)
            ra, rh = ah1 / ah0 - 1, h1 / h0 - 1
            pnl = (ra - rh) if ev["side"] == "加入" else (rh - ra)
            pnl -= FEE
            rec[f"exit_{n}"] = exit_day.strftime("%Y-%m-%d")
            rec[f"a_entry"] = a0
            rec[f"h_entry"] = h0
            rec[f"a_exit_{n}"] = a1
            rec[f"h_exit_{n}"] = h1
            rec[f"pnl_{n}"] = pnl
        rows.append(rec)
    detail = pd.DataFrame(rows)
    summary = []
    for n in NS:
        col = detail[f"pnl_{n}"]
        worst = detail.loc[col.idxmin()]
        total = float(col.sum())
        wins = int((col > 0).sum())
        worst_pnl = float(col.min())
        ok = len(detail) == 15 and total > 0 and wins >= 8 and worst_pnl >= -0.05
        summary.append({
            "n": n,
            "trades": len(detail),
            "total": total,
            "wins": wins,
            "worst_name": worst["name"],
            "worst_date": worst["date"],
            "worst_pnl": worst_pnl,
            "pass": ok,
        })
    passed = [s for s in summary if s["pass"]]
    if not passed:
        decision = "不开展"
    else:
        passed.sort(key=lambda s: (-s["total"], s["n"]))
        decision = f"开展 N={passed[0]['n']}"
    return detail, summary, decision


def main() -> None:
    if "--export" in sys.argv:
        export()
    detail, summary, decision = build()
    ANS.mkdir(parents=True, exist_ok=True)
    show = detail.copy()
    for n in NS:
        show[f"pnl_{n}"] = show[f"pnl_{n}"].map(lambda x: f"{x:.6f}")
    keep = ["date", "side", "name", "a_symbol", "h_symbol", "entry",
            "exit_1", "pnl_1", "exit_5", "pnl_5", "exit_10", "pnl_10"]
    show[keep].to_csv(ANS / "events.csv", index=False)
    win = pd.DataFrame(summary)
    win["total"] = win["total"].map(lambda x: f"{x:.6f}")
    win["worst_pnl"] = win["worst_pnl"].map(lambda x: f"{x:.6f}")
    win["合格"] = ["是" if s["pass"] else "否" for s in summary]
    win = win.drop(columns=["pass"])
    win.to_csv(ANS / "windows.csv", index=False)
    (ANS / "summary.json").write_text(json.dumps({
        "decision": decision,
        "windows": summary,
    }, ensure_ascii=False, indent=2, default=str))
    print(decision)
    for s in summary:
        print(
            f"N={s['n']} n {s['trades']} total {s['total']:.6f} wins {s['wins']} "
            f"worst {s['worst_date']} {s['worst_name']} {s['worst_pnl']:.6f} pass {s['pass']}"
        )
    for _, r in detail.iterrows():
        print(
            f"{r['date']} {r['side']} {r['name']} entry {r['entry']} "
            f"e5 {r['exit_5']} pnl5 {r['pnl_5']:.6f} "
            f"A {r['a_entry']:.4f}->{r['a_exit_5']:.4f} H {r['h_entry']:.4f}->{r['h_exit_5']:.4f}"
        )


if __name__ == "__main__":
    main()
