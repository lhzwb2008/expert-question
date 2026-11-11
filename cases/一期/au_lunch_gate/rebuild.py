#!/usr/bin/env python3
"""沪金午休跟随。只读行情，不调用 laplace 里的策略代码。

python3 cases/一期/au_lunch_gate/rebuild.py
python3 cases/一期/au_lunch_gate/rebuild.py --export   # 从 laplace/data 重新导出 A01、A02
"""

import argparse
import json
import os
from math import floor

import numpy as np
import pandas as pd

CASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("LAPLACE", os.path.expanduser("~/workspace/laplace"))
AU_DIR = os.path.join(ROOT, "data", "cn_fut", "5m", "SHFE_au")
XAU_PKL = os.path.join(ROOT, "data", "xauusd_1m_bj.pkl")
A01 = os.path.join(CASE, "attachments", "A01_au_5m.csv")
A02 = os.path.join(CASE, "attachments", "A02_xau_lunch_1m.csv")
ANSWER = os.path.join(CASE, "answer")

END = pd.Timestamp("2026-10-30")
START = (END - pd.DateOffset(years=5)).date()
CASH0 = 200_000.0
MULT = 1000
MARGIN = 0.16
TICK = 0.02
FEE = 20.01
GATE = 5e-4


def trading_day(bj: pd.Series) -> pd.Series:
    td = (bj + pd.Timedelta(hours=3)).dt.normalize()
    wd = td.dt.weekday.to_numpy()
    extra = np.where(wd == 5, 2, np.where(wd == 6, 1, 0))
    return (td + pd.to_timedelta(extra, unit="D")).dt.date


def in_session(hm: pd.Series) -> pd.Series:
    night = (hm >= 21 * 60) | (hm < 2 * 60 + 30)
    day = (
        ((hm >= 9 * 60) & (hm < 10 * 60 + 15))
        | ((hm >= 10 * 60 + 30) & (hm < 11 * 60 + 30))
        | ((hm >= 13 * 60 + 30) & (hm < 15 * 60))
    )
    return night | day


def export():
    frames = []
    for name in sorted(os.listdir(AU_DIR)):
        if not name.endswith(".csv"):
            continue
        df = pd.read_csv(os.path.join(AU_DIR, name), parse_dates=["DateTime"])
        if df.empty:
            continue
        df["Contract"] = name[:-4]
        frames.append(df)
    au = pd.concat(frames, ignore_index=True)
    au = au.drop_duplicates(["Contract", "DateTime"], keep="last")
    au = au[au["Close"] > 0]
    hm = au["DateTime"].dt.hour * 60 + au["DateTime"].dt.minute
    au = au.loc[in_session(hm)].copy()
    au["td"] = trading_day(au["DateTime"])
    au = au[au["td"] <= END.date()]
    au = au.sort_values(["DateTime", "Contract"])
    au[["DateTime", "Contract", "Open", "High", "Low", "Close", "Volume"]].to_csv(
        A01, index=False, date_format="%Y-%m-%d %H:%M:%S")

    xau = pd.read_pickle(XAU_PKL)
    hm = xau["BJ"].dt.hour * 60 + xau["BJ"].dt.minute
    xau = xau[(hm >= 11 * 60) & (hm <= 13 * 60 + 40) & (xau["BJ"] <= END + pd.Timedelta(hours=16))]
    xau = xau[["BJ", "Open", "High", "Low", "Close"]].rename(columns={"BJ": "DateTime"})
    xau.to_csv(A02, index=False, date_format="%Y-%m-%d %H:%M:%S")
    print(f"A01 {sum(1 for _ in open(A01))-1} 行，A02 {len(xau)} 行")


def xau_at(px: pd.Series, ts: pd.Timestamp) -> float:
    i = int(px.index.searchsorted(ts, side="right")) - 1
    if i < 0 or ts - px.index[i] > pd.Timedelta("5min"):
        return np.nan
    return float(px.iloc[i])


def load_trades():
    au = pd.read_csv(A01, parse_dates=["DateTime"])
    hm = au["DateTime"].dt.hour * 60 + au["DateTime"].dt.minute
    au = au.loc[in_session(hm)].copy()
    au["td"] = trading_day(au["DateTime"])
    au = au.sort_values(["td", "Contract", "DateTime"])
    vol = au.groupby(["td", "Contract"], sort=False)["Volume"].sum()
    leader = vol.groupby(level=0).idxmax().map(lambda x: x[1]).sort_index().shift(1)
    use = au["td"].map(leader)
    bars = au[au["Contract"].to_numpy() == use.to_numpy()].sort_values(["td", "DateTime"])

    xau = pd.read_csv(A02, parse_dates=["DateTime"]).set_index("DateTime")["Close"].sort_index()
    xau = xau[~xau.index.duplicated(keep="last")]

    rows = []
    for td, g in bars.groupby("td", sort=True):
        if td < START or td > END.date():
            continue
        p0 = xau_at(xau, pd.Timestamp(td.year, td.month, td.day, 11, 30))
        p1 = xau_at(xau, pd.Timestamp(td.year, td.month, td.day, 13, 29))
        if not (np.isfinite(p0) and np.isfinite(p1) and p0 > 0):
            continue
        xret = p1 / p0 - 1.0
        if abs(xret) < GATE:
            continue
        eb = g[g["DateTime"].dt.hour * 60 + g["DateTime"].dt.minute == 13 * 60 + 30]
        xb = g[g["DateTime"].dt.hour * 60 + g["DateTime"].dt.minute == 14 * 60 + 25]
        if eb.empty or xb.empty:
            continue
        entry = float(eb["Open"].iloc[0])
        exit_px = float(xb["Close"].iloc[0])
        if entry <= 0 or exit_px <= 0:
            continue
        side = 1 if xret > 0 else -1
        gross = side * (exit_px / entry - 1.0)
        cost = FEE / (entry * MULT) + 2 * TICK / entry
        rows.append(dict(
            td=td, contract=str(eb["Contract"].iloc[0]), side=side,
            entry=entry, exit=exit_px, xret=xret, gross=gross, net=gross - cost,
        ))
    return rows


def run(rows):
    cash = CASH0
    peak = CASH0
    peak_date = START
    mdd = 0.0
    mdd_peak = peak_date
    mdd_trough = peak_date
    out = []
    for r in rows:
        m1 = r["entry"] * MULT * MARGIN
        lots = int(floor(cash / m1)) if m1 > 0 else 0
        raw = r["net"] * r["entry"] * MULT * lots if lots >= 1 else 0.0
        free = cash - m1 * lots if lots >= 1 else cash
        called = lots >= 1 and raw < -free
        pnl = -free if called else raw
        cash += pnl
        if cash > peak:
            peak = cash
            peak_date = r["td"]
        dd = cash / peak - 1.0 if peak else 0.0
        if dd < mdd:
            mdd = dd
            mdd_peak = peak_date
            mdd_trough = r["td"]
        out.append(dict(r, lots=lots, pnl=pnl, equity=cash, called=int(called)))
    return out, mdd, mdd_peak, mdd_trough


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--export", action="store_true")
    args = ap.parse_args()
    if args.export or not (os.path.exists(A01) and os.path.exists(A02)):
        export()
    rows = load_trades()
    trades, mdd, mdd_peak, mdd_trough = run(rows)
    df = pd.DataFrame(trades)
    end = float(df["equity"].iloc[-1])
    called = df[df["called"] == 1]
    by_year = {}
    df["year"] = pd.to_datetime(df["td"]).dt.year
    for y, g in df.groupby("year"):
        by_year[str(y)] = dict(笔数=int(len(g)), 盈亏=round(float(g["pnl"].sum()), 2),
                              年末权益=round(float(g["equity"].iloc[-1]), 2),
                              多=int((g["side"] == 1).sum()), 空=int((g["side"] == -1).sum()))
    gates = dict(
        期末权益高于30万=end > 300_000,
        最大回撤不超过15=mdd >= -0.15,
        强平次数为0=len(called) == 0,
    )
    summary = dict(
        区间=[str(df["td"].iloc[0]), str(df["td"].iloc[-1])],
        笔数=int(len(df)), 多=int((df["side"] == 1).sum()), 空=int((df["side"] == -1).sum()),
        胜=int((df["pnl"] > 0).sum()), 负=int((df["pnl"] < 0).sum()),
        期末权益=round(end, 2), 总收益=round(end / CASH0 - 1, 6),
        最大回撤=round(float(mdd), 6), 回撤高点=str(mdd_peak), 回撤谷底=str(mdd_trough),
        强平次数=int(len(called)), 强平日=[str(d) for d in called["td"]],
        分年=by_year, 门槛=gates, 结论="搁置" if not all(gates.values()) else "上实盘",
    )
    os.makedirs(ANSWER, exist_ok=True)
    show = df.copy()
    show["td"] = show["td"].astype(str)
    show["方向"] = np.where(show["side"] == 1, "多", "空")
    show["pnl"] = show["pnl"].round(2)
    show["equity"] = show["equity"].round(2)
    show["xret"] = show["xret"].round(6)
    show[["td", "contract", "方向", "lots", "entry", "exit", "xret", "pnl", "equity", "called"]].rename(columns={
        "td": "交易日", "contract": "合约", "lots": "手数", "entry": "开仓价", "exit": "平仓价",
        "xret": "伦敦金午休涨跌", "pnl": "盈亏", "equity": "平仓后权益", "called": "强平",
    }).to_csv(os.path.join(ANSWER, "official_trades.csv"), index=False)
    with open(os.path.join(ANSWER, "summary.json"), "w") as f:
        json.dump(summary, f, ensure_ascii=False, indent=1)
    print(json.dumps(summary, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
