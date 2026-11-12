#!/usr/bin/env python3
"""GBP/USD 伦敦开盘区间突破机器人：新闻过滤方案选择的标答重算。

只读 attachments/：A01 分钟线，A06-A08 官方日程原文。受限事件从原文解析，不另外手写。
  python3 rebuild.py            # 重算，写 answer/
  python3 rebuild.py --export   # 先从 raw/ 的买价、卖价重新生成 A01
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

ROOT = Path(__file__).resolve().parent
ATT = ROOT / "attachments"
ANS = ROOT / "answer"
A01 = ATT / "A01_gbpusd_1m.csv"
UTC = ZoneInfo("UTC")
LON = ZoneInfo("Europe/London")
NY = ZoneInfo("America/New_York")

FIRST_DAY = "2025-01-02"
LAST_DAY = "2026-10-30"
LOTS = 3.0
UNIT = 100_000
FEE = 3.5 * 2 * LOTS
MIN_W, MAX_W = 0.0010, 0.0060
MIN_RANGE_BARS = 360
START_EQUITY = 100_000.0
STRIKES = 3


def export() -> None:
    bid = pd.read_pickle(ROOT / "raw" / "gbpusd_1m_B.pkl")
    ask = pd.read_pickle(ROOT / "raw" / "gbpusd_1m_A.pkl")
    cols = ["Open", "High", "Low", "Close"]
    b = bid[["UTC_ms"] + cols].rename(columns={c: f"bid_{c.lower()}" for c in cols})
    a = ask[["UTC_ms"] + cols].rename(columns={c: f"ask_{c.lower()}" for c in cols})
    df = b.merge(a, on="UTC_ms", how="inner")
    t = pd.to_datetime(df["UTC_ms"], unit="ms", utc=True)
    lon = t.dt.tz_convert(LON)
    keep = (lon.dt.weekday < 5) & (lon.dt.hour <= 20)
    d = lon.dt.strftime("%Y-%m-%d")
    keep &= (d >= FIRST_DAY) & (d <= LAST_DAY)
    df = df[keep].copy()
    df.insert(0, "utc", t[keep].dt.strftime("%Y-%m-%d %H:%M"))
    df = df.drop(columns="UTC_ms")
    for c in df.columns[1:]:
        df[c] = df[c].map(lambda x: f"{x:.5f}")
    df.to_csv(A01, index=False)
    print(f"A01 {len(df)} 行 {df['utc'].iloc[0]} ~ {df['utc'].iloc[-1]}")


def parse_events() -> pd.DataFrame:
    rows = []
    bls = (ATT / "A06_BLS发布日程_2025_2026.md").read_text()
    pat = re.compile(r"^\| \w+, (\w+) (\d+), (\d{4}) \| (\d\d:\d\d) AM \| (Consumer Price Index|Employment Situation) for ([^|]+?) \|$", re.M)
    for mon, day, year, hm, name, ref in pat.findall(bls):
        dt = datetime.strptime(f"{mon} {day} {year} {hm}", "%B %d %Y %H:%M").replace(tzinfo=NY)
        rows.append({"event": "美国CPI" if name.startswith("Consumer") else "美国非农", "ref": ref.strip(), "local": dt})
    fomc = (ATT / "A07_FOMC会议日程.md").read_text()
    for block in re.split(r"#### (\d{4}) FOMC Meetings", fomc)[1:]:
        pass
    parts = re.split(r"#### (\d{4}) FOMC Meetings", fomc)
    for i in range(1, len(parts), 2):
        year = int(parts[i])
        for line in parts[i + 1].splitlines():
            m = re.match(r"^(January|February|March|April|May|June|July|August|September|October|November|December) (\d+)-(\d+)\*? ", line + " ")
            if not m:
                continue
            dt = datetime.strptime(f"{m.group(1)} {m.group(3)} {year} 14:00", "%B %d %Y %H:%M").replace(tzinfo=NY)
            rows.append({"event": "FOMC声明", "ref": f"{m.group(1)} {m.group(2)}-{m.group(3)}", "local": dt})
    boe = (ATT / "A08_英国央行MPC日程.md").read_text()
    sec25 = boe.split("# Monetary Policy Committee dates for 2026 and 2027")[0]
    for day, mon, year in re.findall(r"^\| (\d+) (\w+) (2025) \|", sec25, re.M):
        dt = datetime.strptime(f"{day} {mon} {year} 12:00", "%d %B %Y %H:%M").replace(tzinfo=LON)
        rows.append({"event": "英国央行利率决议", "ref": f"{day} {mon} {year}", "local": dt})
    sec26 = boe.split("## 2026 confirmed dates")[1].split("## 2027 confirmed dates")[0]
    for day, mon in re.findall(r"^\| Thursday (\d+) (\w+) \|", sec26, re.M):
        dt = datetime.strptime(f"{day} {mon} 2026 12:00", "%d %B %Y %H:%M").replace(tzinfo=LON)
        rows.append({"event": "英国央行利率决议", "ref": f"{day} {mon} 2026", "local": dt})
    ev = pd.DataFrame(rows)
    ev["utc"] = ev["local"].map(lambda x: x.astimezone(UTC).replace(tzinfo=None))
    ev["london"] = ev["local"].map(lambda x: x.astimezone(LON).replace(tzinfo=None))
    ev["et"] = ev["local"].map(lambda x: x.astimezone(NY).replace(tzinfo=None))
    lo = ev["london"].dt.strftime("%Y-%m-%d")
    ev = ev[(lo >= FIRST_DAY) & (lo <= LAST_DAY)].sort_values("utc").reset_index(drop=True)
    return ev[["event", "ref", "et", "london", "utc"]]


def load_bars() -> pd.DataFrame:
    df = pd.read_csv(A01)
    df["utc"] = pd.to_datetime(df["utc"])
    lon = df["utc"].dt.tz_localize(UTC).dt.tz_convert(LON)
    df["lday"] = lon.dt.strftime("%Y-%m-%d")
    df["lmin"] = lon.dt.hour * 60 + lon.dt.minute
    return df


def in_any(minute: pd.Timestamp, ev_utc: list, before: int, after: int):
    for t in ev_utc:
        if t - timedelta(minutes=before) <= minute <= t + timedelta(minutes=after):
            return t
    return None


def run_day(day: pd.DataFrame, cfg: str, ev_utc: list, ev_days: set):
    if cfg == "D" and day["lday"].iloc[0] in ev_days:
        return None, "事件日停机"
    rng = day[day["lmin"] < 7 * 60]
    if len(rng) < MIN_RANGE_BARS:
        return None, "区间K线不足"
    hi, lo = rng["bid_high"].max(), rng["bid_low"].min()
    w = round(hi - lo, 5)
    if w < MIN_W or w > MAX_W:
        return None, "区间宽度不符"
    rest = day[day["lmin"] >= 7 * 60].reset_index(drop=True)
    gate = {"B": (3, 3), "C": (5, 3)}.get(cfg)
    entry_idx = side = None
    blocked = 0
    for i in range(len(rest) - 1):
        if rest.at[i, "lmin"] > 15 * 60 + 59:
            break
        c = rest.at[i, "bid_close"]
        s = 1 if c > hi else -1 if c < lo else 0
        if not s:
            continue
        nxt = rest.at[i + 1, "utc"]
        if gate and in_any(nxt, ev_utc, *gate) is not None:
            blocked += 1
            continue
        entry_idx, side = i + 1, s
        break
    if entry_idx is None:
        return None, "无信号" if not blocked else "信号被门禁拦下"
    e = rest.loc[entry_idx]
    entry = e["ask_open"] if side > 0 else e["bid_open"]
    sl = lo if side > 0 else hi
    tp = round(entry + w, 5) if side > 0 else round(entry - w, 5)
    flat_at = []
    if cfg == "C":
        flat_at = sorted(t - timedelta(minutes=5) for t in ev_utc if t - timedelta(minutes=5) > e["utc"])
    exit_px = reason = exit_t = None
    for k in range(entry_idx, len(rest)):
        b = rest.loc[k]
        o_exit = b["bid_open"] if side > 0 else b["ask_open"]
        if flat_at and b["utc"] >= flat_at[0] and b["utc"] <= flat_at[0] + timedelta(minutes=5):
            exit_px, reason, exit_t = o_exit, "新闻前平仓", b["utc"]
            break
        if b["lmin"] >= 20 * 60:
            exit_px, reason, exit_t = o_exit, "20:00平仓", b["utc"]
            break
        if k > entry_idx:
            if side > 0 and b["bid_open"] <= sl:
                exit_px, reason, exit_t = b["bid_open"], "止损(跳空)", b["utc"]
                break
            if side > 0 and b["bid_open"] >= tp:
                exit_px, reason, exit_t = b["bid_open"], "止盈(跳空)", b["utc"]
                break
            if side < 0 and b["ask_open"] >= sl:
                exit_px, reason, exit_t = b["ask_open"], "止损(跳空)", b["utc"]
                break
            if side < 0 and b["ask_open"] <= tp:
                exit_px, reason, exit_t = b["ask_open"], "止盈(跳空)", b["utc"]
                break
        if side > 0:
            if b["bid_low"] <= sl:
                exit_px, reason, exit_t = sl, "止损", b["utc"]
                break
            if b["bid_high"] >= tp:
                exit_px, reason, exit_t = tp, "止盈", b["utc"]
                break
        else:
            if b["ask_high"] >= sl:
                exit_px, reason, exit_t = sl, "止损", b["utc"]
                break
            if b["ask_low"] <= tp:
                exit_px, reason, exit_t = tp, "止盈", b["utc"]
                break
        while flat_at and b["utc"] > flat_at[0] + timedelta(minutes=5):
            flat_at.pop(0)
    if exit_px is None:
        b = rest.iloc[-1]
        exit_px, reason, exit_t = (b["bid_close"] if side > 0 else b["ask_close"]), "当日末根收盘", b["utc"]
    pnl = round((exit_px - entry) * side * UNIT * LOTS - FEE, 2)
    return {
        "london_date": e["lday"], "side": "多" if side > 0 else "空", "range_high": hi, "range_low": lo,
        "range_pips": round(w * 10000, 1), "entry_utc": e["utc"], "entry_px": entry,
        "exit_utc": exit_t, "exit_px": exit_px, "exit_reason": reason, "pnl": pnl,
    }, None


def settle(trades: list, ev_utc: list, ev_name: dict) -> tuple[pd.DataFrame, dict]:
    strikes = 0
    end = None
    out = []
    for t in trades:
        if end is not None:
            break
        eo = in_any(t["entry_utc"], ev_utc, 2, 2)
        ec = in_any(t["exit_utc"], ev_utc, 2, 2)
        viol = eo is not None or ec is not None
        hit = []
        if eo is not None:
            hit.append(f"开仓:{ev_name[eo]}")
        if ec is not None:
            hit.append(f"平仓:{ev_name[ec]}")
        deducted = t["pnl"] if viol and t["pnl"] > 0 else 0.0
        if viol:
            strikes += 1
        row = dict(t, violation="是" if viol else "否", violation_detail="；".join(hit),
                   deducted=round(deducted, 2), strike_no=strikes if viol else 0)
        out.append(row)
        if strikes >= STRIKES:
            end = t["exit_utc"]
    df = pd.DataFrame(out)
    summ = {
        "trades": len(df),
        "net_pnl": round(df["pnl"].sum(), 2) if len(df) else 0.0,
        "violations": int((df["violation"] == "是").sum()) if len(df) else 0,
        "open_viol": int(df["violation_detail"].str.contains("开仓").sum()) if len(df) else 0,
        "close_viol": int(df["violation_detail"].str.contains("平仓").sum()) if len(df) else 0,
        "deducted": round(df["deducted"].sum(), 2) if len(df) else 0.0,
        "terminated": end.strftime("%Y-%m-%d %H:%M") if end is not None else None,
    }
    summ["withdrawable"] = round(summ["net_pnl"] - summ["deducted"], 2)
    summ["wins"] = int((df["pnl"] > 0).sum()) if len(df) else 0
    return df, summ


def main() -> None:
    if "--export" in sys.argv:
        export()
    ev = parse_events()
    ev_utc = list(ev["utc"])
    ev_name = {r.utc: f"{r.event}{r.london:%m-%d %H:%M}伦敦" for r in ev.itertuples()}
    ev_days = set(ev["london"].dt.strftime("%Y-%m-%d"))
    bars = load_bars()
    days = [g for _, g in bars.groupby("lday", sort=True)]
    ANS.mkdir(exist_ok=True)
    ev_out = ev.copy()
    for c in ["et", "london", "utc"]:
        ev_out[c] = ev_out[c].dt.strftime("%Y-%m-%d %H:%M")
    ev_out.to_csv(ANS / "events.csv", index=False)
    summary = {"events": len(ev), "events_by_type": ev["event"].value_counts().to_dict(), "configs": {}}
    ledgers = []
    for cfg in "ABCD":
        trades, skips = [], {}
        for d in days:
            t, why = run_day(d.reset_index(drop=True), cfg, ev_utc, ev_days)
            if t:
                trades.append(t)
            else:
                skips[why] = skips.get(why, 0) + 1
        df, s = settle(trades, ev_utc, ev_name)
        s["skips"] = skips
        s["trades_before_settle"] = len(trades)
        summary["configs"][cfg] = s
        df.insert(0, "config", cfg)
        ledgers.append(df)
        print(cfg, json.dumps(s, ensure_ascii=False))
    led = pd.concat(ledgers, ignore_index=True)
    for c in ["entry_utc", "exit_utc"]:
        led[c] = pd.to_datetime(led[c]).dt.strftime("%Y-%m-%d %H:%M")
    led.to_csv(ANS / "official_trades.csv", index=False)
    alive = {k: v for k, v in summary["configs"].items() if v["terminated"] is None}
    pick = max(alive, key=lambda k: (alive[k]["withdrawable"], -alive[k]["trades"])) if alive else None
    summary["pick"] = pick
    summary["trading_days"] = len(days)
    (ANS / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print("选择", pick)


if __name__ == "__main__":
    main()
