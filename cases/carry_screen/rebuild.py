#!/usr/bin/env python3
"""商品跨期价差品种准入的标准重算。

--export 从本机天勤日线写出 A01、A02。不带参数时只读附件。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent
ATT = ROOT / "attachments"
ANS = ROOT / "answer"
SRC = Path.home() / "workspace" / "laplace" / "data" / "cn_fut" / "1d"
FIRST = pd.Timestamp("2023-01-03")
LAST = pd.Timestamp("2026-10-30")
OI_MIN = 20_000
VOL_MIN = 1_000
BUFFER_DAYS = 10
BIG = 0.03
COV_MIN = 0.95
BIG_MIN = 0.60
SHARE_MIN = 0.85
MED_MIN = 0.03
ORDER = ["cu", "al", "zn", "rb", "hc", "ru", "m", "y", "p", "c", "i", "pp", "SR", "CF", "TA", "MA", "RM", "FG"]
NAME = {
    "cu": "铜", "al": "铝", "zn": "锌", "rb": "螺纹钢", "hc": "热轧卷板", "ru": "天然橡胶",
    "m": "豆粕", "y": "豆油", "p": "棕榈油", "c": "玉米", "i": "铁矿石", "pp": "聚丙烯",
    "SR": "白糖", "CF": "棉花", "TA": "PTA", "MA": "甲醇", "RM": "菜粕", "FG": "玻璃",
}


def export() -> None:
    specs = pd.read_csv(SRC / "contracts.csv")
    frames = []
    for _, r in specs.iterrows():
        code = r.symbol.split(".")[1]
        f = SRC / r["product"] / f"{code}.csv"
        df = pd.read_csv(f, usecols=["date", "close", "volume", "close_oi"])
        df.insert(1, "symbol", r.symbol)
        frames.append(df)
    px = pd.concat(frames, ignore_index=True)
    px["date"] = pd.to_datetime(px["date"])
    px = px[(px["date"] >= FIRST) & (px["date"] <= LAST) & (px["close"] > 0)]
    px = px.sort_values(["symbol", "date"])
    px["date"] = px["date"].dt.strftime("%Y-%m-%d")
    px["volume"] = px["volume"].round().astype("int64")
    px["close_oi"] = px["close_oi"].round().astype("int64")
    ATT.mkdir(parents=True, exist_ok=True)
    px.to_csv(ATT / "A01_daily.csv", index=False)
    keep = set(px["symbol"])
    spec = specs[specs["symbol"].isin(keep)].copy()
    spec["product"] = pd.Categorical(spec["product"], ORDER, ordered=True)
    spec = spec.sort_values(["product", "expire_date", "symbol"])
    spec.to_csv(ATT / "A02_contracts.csv", index=False)
    print(f"A01 {len(px)} 行  A02 {len(spec)} 行")


def median(vals: list[float]) -> float:
    vals = sorted(vals)
    n = len(vals)
    if n % 2:
        return vals[n // 2]
    return (vals[n // 2 - 1] + vals[n // 2]) / 2


def build():
    px = pd.read_csv(ATT / "A01_daily.csv")
    spec = pd.read_csv(ATT / "A02_contracts.csv")
    px["date"] = pd.to_datetime(px["date"])
    spec["expire"] = pd.to_datetime(spec["expire_date"])
    meta = spec.set_index("symbol")
    by = {}
    for symbol, g in px.groupby("symbol", sort=False):
        m = meta.loc[symbol]
        by.setdefault(m["product"], {})
        for rec in g.itertuples(index=False):
            by[m["product"]].setdefault(rec.date, []).append(
                (symbol, rec.close, int(rec.volume), int(rec.close_oi), m["expire"])
            )
    summary = []
    admitted_rows = []
    for product in ORDER:
        days = by[product]
        trading = sorted(days)
        anns = []
        pos = neg = 0
        for dt in trading:
            pool = []
            for symbol, close, volume, oi, expire in days[dt]:
                if oi >= OI_MIN and volume >= VOL_MIN and (expire - dt).days >= BUFFER_DAYS:
                    pool.append((symbol, close, volume, oi, expire))
            if len(pool) < 2:
                continue
            pool.sort(key=lambda r: (r[4], -r[3], r[0]))
            near = pool[0]
            rest = [r for r in pool if r[4] > near[4]]
            if not rest:
                continue
            rest.sort(key=lambda r: (-r[3], r[4], r[0]))
            far = rest[0]
            span = (far[4] - near[4]).days
            ann = (near[1] - far[1]) / near[1] * 365 / span
            anns.append(ann)
            if abs(ann) >= BIG:
                if ann > 0:
                    pos += 1
                elif ann < 0:
                    neg += 1
            if product in ("i", "rb"):
                admitted_rows.append({
                    "product": product,
                    "date": dt.strftime("%Y-%m-%d"),
                    "near": near[0],
                    "far": far[0],
                    "near_close": near[1],
                    "far_close": far[1],
                    "near_expire": near[4].strftime("%Y-%m-%d"),
                    "far_expire": far[4].strftime("%Y-%m-%d"),
                    "calendar_days": span,
                    "ann": round(ann, 10),
                })
        n_all = len(trading)
        n_pair = len(anns)
        big = pos + neg
        share = max(pos, neg) / big if big else 0.0
        med = median(anns) if anns else 0.0
        ok = (
            n_all > 0
            and n_pair / n_all >= COV_MIN
            and big / n_all >= BIG_MIN
            and share >= SHARE_MIN
            and abs(med) >= MED_MIN
        )
        if ok and med > 0:
            side = "贴水，多近空远"
        elif ok:
            side = "升水，空近多远"
        else:
            side = ""
        summary.append({
            "product": product,
            "name": NAME[product],
            "trading_days": n_all,
            "pair_days": n_pair,
            "big_days": big,
            "pos_days": pos,
            "neg_days": neg,
            "share": round(share, 6),
            "median": round(med, 6),
            "admitted": "是" if ok else "否",
            "side": side,
        })
    return pd.DataFrame(summary), pd.DataFrame(admitted_rows)


def main() -> None:
    if "--export" in sys.argv:
        export()
    summary, pairs = build()
    ANS.mkdir(parents=True, exist_ok=True)
    summary.to_csv(ANS / "summary.csv", index=False, na_rep="")
    pairs.to_csv(ANS / "admitted_pairs.csv", index=False)
    admitted = summary.loc[summary.admitted == "是", "product"].tolist()
    payload = {"admitted": admitted, "rows": summary.to_dict(orient="records")}
    (ANS / "summary.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print("纳入", " ".join(admitted))
    for _, r in summary.iterrows():
        mark = "Y" if r.admitted == "是" else "n"
        print(
            f"{r['product']:4} {mark} {r['pair_days']}/{r['trading_days']} "
            f"big {r['big_days']} +{r['pos_days']} -{r['neg_days']} "
            f"share {r['share']:.4f} med {r['median']:+.6f} {r['side']}"
        )


if __name__ == "__main__":
    main()
