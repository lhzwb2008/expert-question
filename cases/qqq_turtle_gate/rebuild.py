#!/usr/bin/env python3
"""QQQ 日线海龟。只读 Quantra 的分钟行情并聚合成日线，不用其中的策略代码。"""

import json
import os
from dataclasses import dataclass, field

import pandas as pd

QUANTRA_CSV = "/root/workspace/Quantra/qqq_longport.csv"
CASE = os.path.dirname(os.path.abspath(__file__))
BARS = os.path.join(CASE, "attachments", "A01_qqq_daily.csv")
EVAL_START = pd.Timestamp("2021-01-04")
EVAL_END = pd.Timestamp("2026-10-30")
START_EQUITY = 100_000.0
COMMISSION = 0.005


def load_daily():
    raw = pd.read_csv(QUANTRA_CSV, parse_dates=["DateTime"])
    raw["Date"] = raw["DateTime"].dt.normalize()
    daily = (
        raw.groupby("Date", as_index=False)
        .agg(Open=("Open", "first"), High=("High", "max"), Low=("Low", "min"),
             Close=("Close", "last"), Volume=("Volume", "sum"))
        .sort_values("Date")
        .reset_index(drop=True)
    )
    return daily


def arrays(daily):
    high = daily["High"].to_numpy(float)
    low = daily["Low"].to_numpy(float)
    open_ = daily["Open"].to_numpy(float)
    close = daily["Close"].to_numpy(float)
    n = len(daily)
    tr = [None] * n
    for i in range(1, n):
        tr[i] = max(high[i] - low[i], abs(high[i] - close[i - 1]), abs(low[i] - close[i - 1]))
    nval = [None] * n
    nval[20] = sum(tr[1:21]) / 20.0
    for i in range(21, n):
        nval[i] = (nval[i - 1] * 19.0 + tr[i]) / 20.0
    sma = [None] * n
    for i in range(20, n):
        sma[i] = sum(tr[i - 19:i + 1]) / 20.0
    return high, low, open_, close, nval, sma


def roll_max(values, i, window):
    return max(values[i - window:i])


def roll_min(values, i, window):
    return min(values[i - window:i])


def notional_for(prev_equity, start=START_EQUITY):
    if prev_equity >= start:
        return float(start)
    notional = float(start)
    floor = float(start)
    while prev_equity <= floor - 0.1 * notional + 1e-9:
        floor -= 0.1 * notional
        notional *= 0.8
        if notional < 1:
            break
    return notional


def unit_shares(base, n_used):
    if not n_used or n_used <= 0:
        return 0
    return int(base * 0.01 / n_used)


@dataclass
class Unit:
    price: float
    shares: int
    stop: float
    n_used: float


@dataclass
class Book:
    cash: float = START_EQUITY
    units: list = field(default_factory=list)
    side: int = 0
    trades: list = field(default_factory=list)
    equity_rows: list = field(default_factory=list)
    fees: float = 0.0
    round_id: int = 0
    open_round: int = 0

    def pos(self):
        if not self.units:
            return 0
        return self.side * sum(u.shares for u in self.units)

    def equity(self, mark):
        return self.cash + self.pos() * mark


def fill_price(level, open_, side):
    if side == 1:
        return open_ if open_ >= level else level
    return open_ if open_ <= level else level


def hit(level, open_, high, low, side):
    if side == 1:
        return open_ >= level or high >= level
    return open_ <= level or low <= level


def run(daily, mode):
    high, low, open_, close, nval, sma = arrays(daily)
    dates = list(daily["Date"])
    book = Book()
    hypo = None
    last_winner = False
    prev_equity = START_EQUITY

    def charge(shares):
        return shares * COMMISSION if mode == "official" else 0.0

    def push(date, action, price, shares, n_used, reason):
        f = charge(shares)
        book.fees += f
        if action in ("buy", "cover"):
            book.cash -= price * shares + f
        else:
            book.cash += price * shares - f
        if action in ("buy", "short") and book.open_round == 0:
            book.round_id += 1
            book.open_round = book.round_id
        book.trades.append({
            "round_id": book.open_round,
            "Date": pd.Timestamp(date).strftime("%Y-%m-%d"),
            "action": action,
            "price": round(float(price), 4),
            "shares": int(shares),
            "fee": round(f, 4),
            "n_used": None if n_used is None else round(float(n_used), 6),
            "reason": reason,
        })
        if book.pos() == 0:
            book.open_round = 0

    def close_all(date, price, reason):
        shares = abs(book.pos())
        if shares == 0:
            return
        action = "sell" if book.side == 1 else "cover"
        book.units.clear()
        book.side = 0
        push(date, action, price, shares, None, reason)

    def close_one(date, unit, price, reason):
        action = "sell" if book.side == 1 else "cover"
        book.units.remove(unit)
        if not book.units:
            book.side = 0
        push(date, action, price, unit.shares, unit.n_used, reason)

    def add_units(date, side, bar_high, bar_low):
        guard = 0
        while book.units and len(book.units) < 4 and guard < 4:
            guard += 1
            last = book.units[-1]
            step = 0.5 * last.n_used
            level = last.price + step * side
            if side == 1 and bar_high < level:
                break
            if side == -1 and bar_low > level:
                break
            for unit in book.units:
                unit.stop += step * side
            stop = level - 2 * last.n_used * side
            book.units.append(Unit(level, last.shares, stop, last.n_used))
            push(date, "buy" if side == 1 else "short", level, last.shares, last.n_used, "add")

    for i in range(56, len(dates)):
        dt = dates[i]
        if dt > EVAL_END:
            break
        in_eval = dt >= EVAL_START
        n_prev = nval[i - 1]
        h20, l20 = roll_max(high, i, 20), roll_min(low, i, 20)
        h55, l55 = roll_max(high, i, 55), roll_min(low, i, 55)
        h10, l10 = roll_max(high, i, 10), roll_min(low, i, 10)

        if hypo is not None:
            side = hypo["side"]
            stop = hypo["stop"]
            exit_level = l10 if side == 1 else h10
            outcome = None
            if side == 1:
                if open_[i] <= stop:
                    outcome = False
                elif low[i] <= stop:
                    outcome = False
                elif open_[i] <= exit_level:
                    outcome = open_[i] > hypo["entry"]
                elif low[i] <= exit_level:
                    outcome = exit_level > hypo["entry"]
            else:
                if open_[i] >= stop:
                    outcome = False
                elif high[i] >= stop:
                    outcome = False
                elif open_[i] >= exit_level:
                    outcome = open_[i] < hypo["entry"]
                elif high[i] >= exit_level:
                    outcome = exit_level < hypo["entry"]
            if outcome is not None:
                last_winner = bool(outcome)
                hypo = None

        note = "flat"
        if in_eval and book.units:
            note = "hold"
            if mode == "official":
                if book.side == 1:
                    tight = max(u.stop for u in book.units)
                    if open_[i] <= tight or open_[i] <= l10:
                        close_all(dt, open_[i], "gap_stop" if open_[i] <= tight else "gap_exit10")
                        note = "gap"
                    else:
                        for unit in sorted(book.units, key=lambda u: -u.stop):
                            if unit in book.units and low[i] <= unit.stop:
                                close_one(dt, unit, unit.stop, "stop")
                                note = "stop"
                        if book.units and low[i] <= l10:
                            close_all(dt, l10, "exit10")
                            note = "exit10"
                else:
                    tight = min(u.stop for u in book.units)
                    if open_[i] >= tight or open_[i] >= h10:
                        close_all(dt, open_[i], "gap_stop" if open_[i] >= tight else "gap_exit10")
                        note = "gap"
                    else:
                        for unit in sorted(book.units, key=lambda u: u.stop):
                            if unit in book.units and high[i] >= unit.stop:
                                close_one(dt, unit, unit.stop, "stop")
                                note = "stop"
                        if book.units and high[i] >= h10:
                            close_all(dt, h10, "exit10")
                            note = "exit10"
            else:
                if book.side == 1 and close[i] < l10:
                    close_all(dt, close[i], "exit10_close")
                    note = "exit10_close"
                elif book.side == -1 and close[i] > h10:
                    close_all(dt, close[i], "exit10_close")
                    note = "exit10_close"

        opened_today = False
        if in_eval and not book.units:
            if mode == "official":
                use_55 = last_winner
                long_level = h55 if use_55 else h20
                short_level = l55 if use_55 else l20
                long_hit = hit(long_level, open_[i], high[i], low[i], 1)
                short_hit = hit(short_level, open_[i], high[i], low[i], -1)
                if long_hit and short_hit:
                    note = "both_break_skip"
                elif long_hit or short_hit:
                    side = 1 if long_hit else -1
                    level = long_level if side == 1 else short_level
                    px = fill_price(level, open_[i], side)
                    shares = unit_shares(notional_for(prev_equity), n_prev)
                    if shares >= 1:
                        stop = px - 2 * n_prev * side
                        book.side = side
                        book.units.append(Unit(px, shares, stop, n_prev))
                        push(dt, "buy" if side == 1 else "short", px, shares, n_prev,
                             "entry55" if use_55 else "entry20")
                        opened_today = True
                        note = "entry55" if use_55 else "entry20"
                        stopped = (side == 1 and low[i] <= stop) or (side == -1 and high[i] >= stop)
                        if stopped:
                            exit_px = open_[i] if ((side == 1 and open_[i] <= stop) or (side == -1 and open_[i] >= stop)) else stop
                            close_all(dt, exit_px, "stop_same_day")
                            note = "stop_same_day"
                        else:
                            add_units(dt, side, high[i], low[i])
                            if any(t["reason"] == "add" and t["Date"] == pd.Timestamp(dt).strftime("%Y-%m-%d") for t in book.trades):
                                note = "entry_add"
            else:
                long_hit = close[i] > h20
                short_hit = close[i] < l20
                if long_hit and short_hit:
                    note = "both_close_skip"
                elif long_hit or short_hit:
                    side = 1 if long_hit else -1
                    n_used = sma[i - 1]
                    shares = unit_shares(book.equity(close[i]), n_used)
                    if shares >= 1:
                        book.side = side
                        book.units.append(Unit(close[i], shares, close[i], n_used))
                        push(dt, "buy" if side == 1 else "short", close[i], shares, n_used, "entry20_close")
                        opened_today = True
                        note = "entry20_close"

        if in_eval and mode == "official" and book.units and not opened_today:
            before = len(book.trades)
            add_units(dt, book.side, high[i], low[i])
            if len(book.trades) > before:
                note = "add"

        if in_eval:
            book.equity_rows.append({
                "Date": pd.Timestamp(dt).strftime("%Y-%m-%d"),
                "equity": round(book.equity(close[i]), 2),
                "side": book.side,
                "shares": book.pos(),
                "note": note,
            })
            prev_equity = book.equity(close[i])

        if mode == "official" and hypo is None:
            long_hit = hit(h20, open_[i], high[i], low[i], 1)
            short_hit = hit(l20, open_[i], high[i], low[i], -1)
            if long_hit ^ short_hit:
                side = 1 if long_hit else -1
                px = fill_price(h20 if side == 1 else l20, open_[i], side)
                stop = px - 2 * n_prev * side
                if (side == 1 and low[i] <= stop) or (side == -1 and high[i] >= stop):
                    last_winner = False
                else:
                    hypo = {"side": side, "entry": px, "stop": stop}

    return book


def summarize(book, daily):
    eq = pd.DataFrame(book.equity_rows)
    trades = pd.DataFrame(book.trades)
    final = float(eq["equity"].iloc[-1])
    peak = eq["equity"].cummax()
    dd = eq["equity"] / peak - 1.0
    mdd_i = dd.idxmin()
    window = daily[(daily["Date"] >= EVAL_START) & (daily["Date"] <= EVAL_END)]
    bh = float(window["Close"].iloc[-1] / window["Open"].iloc[0] - 1.0)
    closed = 0
    if len(trades):
        for _, g in trades.groupby("round_id"):
            if g.iloc[-1]["action"] in ("sell", "cover"):
                closed += 1
    reasons = trades["reason"].value_counts().to_dict() if len(trades) else {}
    return {
        "final_equity": round(final, 2),
        "total_return": round(final / START_EQUITY - 1.0, 6),
        "mdd": round(float(dd.min()), 6),
        "mdd_date": eq.loc[mdd_i, "Date"],
        "buy_hold_return": round(bh, 6),
        "fees": round(book.fees, 2),
        "fills": int(len(trades)),
        "rounds": int(trades["round_id"].nunique()) if len(trades) else 0,
        "closed_rounds": int(closed),
        "open_shares": int(book.pos()),
        "first_date": eq["Date"].iloc[0],
        "last_date": eq["Date"].iloc[-1],
        "days": int(len(eq)),
        "reasons": {str(k): int(v) for k, v in reasons.items()},
    }


def main():
    daily = load_daily()
    daily = daily[daily["Date"] <= EVAL_END].reset_index(drop=True)
    os.makedirs(os.path.dirname(BARS), exist_ok=True)
    saved = daily.copy()
    saved["Date"] = saved["Date"].dt.strftime("%Y-%m-%d")
    saved.to_csv(BARS, index=False)
    official = run(daily, "official")
    intern = run(daily, "intern")
    answer = os.path.join(CASE, "answer")
    os.makedirs(answer, exist_ok=True)
    pd.DataFrame(official.trades).to_csv(os.path.join(answer, "official_trades.csv"), index=False)
    pd.DataFrame(official.equity_rows).to_csv(os.path.join(answer, "official_equity.csv"), index=False)
    pd.DataFrame(intern.trades).to_csv(os.path.join(answer, "intern_trades.csv"), index=False)
    payload = {"official": summarize(official, daily), "intern": summarize(intern, daily),
               "daily_rows": int(len(saved)), "daily_first": saved["Date"].iloc[0], "daily_last": saved["Date"].iloc[-1]}
    with open(os.path.join(answer, "rebuild_check.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
