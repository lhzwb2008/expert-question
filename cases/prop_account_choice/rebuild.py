#!/usr/bin/env python3
"""Aqua Pay Later 200K 与 FTMO 2-Step 100K 的滚动开考测算。

策略只用经典 Dual Thrust（N=1，K1=K2=0.5），不调用 Quantra / ftmo-test 里的任何策略代码。
行情来自 Quantra 的 Longport 1 分钟线，导出为 A01；之后只读 A01。

python3 cases/prop_account_choice/rebuild.py          # 重算并写 answer/
python3 cases/prop_account_choice/rebuild.py --export # 先从 Quantra 重新导出 A01
"""

import argparse
import json
import os
import statistics
import sys
from math import floor

import numpy as np
import pandas as pd

CASE = os.path.dirname(os.path.abspath(__file__))
QUANTRA_CSV = os.environ.get("QUANTRA_CSV", os.path.expanduser("~/workspace/Quantra/qqq_longport.csv"))
BARS = os.path.join(CASE, "attachments", "A01_qqq_1min.csv")
ANSWER = os.path.join(CASE, "answer")
DATA_START = "2024-01-02"
DATA_END = "2026-10-30"

K1 = K2 = 0.5
CHECK_TIMES = [t for t in [f"{h:02d}:{m:02d}" for h in range(9, 16) for m in range(10, 60, 15)]
               if "09:40" <= t <= "15:40"]
EXIT_TIME = "15:40"
SLIPPAGE = 0.01
COMMISSION = 0.005
LEVERAGE = 2.0

AQUA = 200_000.0
FTMO = 100_000.0

STAGES = {
    "aqua_ch": dict(size=AQUA, stop_usd=1900.0, cap_usd=None, trade_breach=2000.0,
                    daily_loss=None, trailing=0.05, static_floor=None, touch_target=AQUA * 1.03),
    "aqua_fd": dict(size=AQUA, stop_usd=1900.0, cap_usd=1100.0, trade_breach=2000.0,
                    daily_loss=6000.0, trailing=0.05, static_floor=None, touch_target=None),
    "ftmo_p1": dict(size=FTMO, stop_usd=4750.0, cap_usd=None, trade_breach=None,
                    daily_loss=5000.0, trailing=None, static_floor=90_000.0, touch_target=None,
                    eod_target=FTMO * 1.10),
    "ftmo_p2": dict(size=FTMO, stop_usd=4750.0, cap_usd=None, trade_breach=None,
                    daily_loss=5000.0, trailing=None, static_floor=90_000.0, touch_target=None,
                    eod_target=FTMO * 1.05),
    "ftmo_fd": dict(size=FTMO, stop_usd=4750.0, cap_usd=None, trade_breach=None,
                    daily_loss=5000.0, trailing=None, static_floor=90_000.0, touch_target=None),
}
FTMO_MIN_DAYS = 4
PAYOUT_CAL_DAYS = 14
PAYOUT_GOOD_DAY = 1000.0
PAYOUT_GOOD_DAYS = 5
PAYOUT_CONSISTENCY = 0.15

REASON = {
    "trade_breach": "单笔浮亏达1%",
    "trailing": "5%追踪回撤",
    "daily_loss": "日亏损限额",
    "static_floor": "最大亏损10%",
}


def export_a01():
    raw = pd.read_csv(QUANTRA_CSV, parse_dates=["DateTime"])
    raw = raw[(raw["DateTime"] >= DATA_START) & (raw["DateTime"] < pd.Timestamp(DATA_END) + pd.Timedelta(days=1))]
    raw = raw[["DateTime", "Open", "High", "Low", "Close", "Volume"]]
    raw.to_csv(BARS, index=False, date_format="%Y-%m-%d %H:%M:%S")
    print(f"A01 {len(raw)} 行")


class Day:
    __slots__ = ("date", "times", "o", "h", "l", "c", "upper", "lower", "day_open", "exit_idx", "entry")

    def __init__(self, date, g, prev):
        self.date = date
        self.times = g["Time"].tolist()
        self.o = g["Open"].to_numpy(float)
        self.h = g["High"].to_numpy(float)
        self.l = g["Low"].to_numpy(float)
        self.c = g["Close"].to_numpy(float)
        self.day_open = float(self.o[0])
        rng = max(prev["High"] - prev["Close"], prev["Close"] - prev["Low"])
        self.upper = self.day_open + K1 * rng
        self.lower = self.day_open - K2 * rng
        self.exit_idx = self.times.index(EXIT_TIME) if EXIT_TIME in self.times else len(self.times) - 1
        self.entry = None
        for i, t in enumerate(self.times):
            if i >= self.exit_idx:
                break
            if t not in CHECK_TIMES:
                continue
            if self.c[i] > self.upper:
                self.entry = (i, 1)
                break
            if self.c[i] < self.lower:
                self.entry = (i, -1)
                break


def load_days():
    df = pd.read_csv(BARS, parse_dates=["DateTime"])
    df["Date"] = df["DateTime"].dt.date
    df["Time"] = df["DateTime"].dt.strftime("%H:%M")
    daily = df.groupby("Date").agg(High=("High", "max"), Low=("Low", "min"), Close=("Close", "last"))
    days = []
    prev = None
    for d, g in df.groupby("Date", sort=True):
        if prev is not None:
            days.append(Day(d, g.sort_values("DateTime"), daily.loc[prev]))
        prev = d
    return days


def sim_day(day, balance, hwm, st):
    """返回 (状态, 原因, 当日净盈亏, 是否成交, 成交记录)。状态: ok / fail / target。"""
    if day.entry is None:
        return "ok", "", 0.0, False, None
    shares = floor(balance * LEVERAGE / day.day_open)
    if shares <= 0:
        return "ok", "", 0.0, False, None
    floors = []
    if st["daily_loss"]:
        floors.append((balance - st["daily_loss"], "daily_loss"))
    if st["trailing"]:
        floors.append((hwm * (1 - st["trailing"]), "trailing"))
    if st["static_floor"]:
        floors.append((st["static_floor"], "static_floor"))

    i0, side = day.entry
    entry = day.c[i0] + SLIPPAGE * side
    fee_in = round(shares * COMMISSION, 10)
    cash = balance - fee_in
    stop_px = entry - side * st["stop_usd"] / shares
    cap_px = entry + side * st["cap_usd"] / shares if st["cap_usd"] else None
    rec = dict(entry_time=day.times[i0], side="多" if side > 0 else "空", shares=shares,
               entry_px=entry, upper=day.upper, lower=day.lower)

    def check(px):
        flt = side * shares * (px - entry)
        if st["trade_breach"] and flt <= -st["trade_breach"]:
            return "trade_breach"
        eq = cash + flt
        for f, why in floors:
            if eq <= f:
                return why
        return None

    exit_px = None
    exit_why = None
    for i in range(i0 + 1, day.exit_idx + 1):
        o, h, l, c = day.o[i], day.h[i], day.l[i], day.c[i]
        adverse = l if side > 0 else h
        favor = h if side > 0 else l
        hit_stop = (adverse <= stop_px) if side > 0 else (adverse >= stop_px)
        if hit_stop:
            gap = (o <= stop_px) if side > 0 else (o >= stop_px)
            exit_px = o if gap else stop_px
            exit_why = "止损"
            why = check(exit_px)
            if why:
                return _fail(rec, day, i, exit_px, why, shares, fee_in, side, entry)
            break
        why = check(adverse)
        if why:
            return _fail(rec, day, i, adverse, why, shares, fee_in, side, entry)
        if cap_px is not None:
            hit_cap = (favor >= cap_px) if side > 0 else (favor <= cap_px)
            if hit_cap:
                gap = (o >= cap_px) if side > 0 else (o <= cap_px)
                exit_px = o if gap else cap_px
                exit_why = "日盈上限"
                break
        if st["touch_target"] is not None:
            best = cash + side * shares * (favor - entry)
            if best >= st["touch_target"]:
                pnl = st["touch_target"] - balance
                rec.update(exit_time=day.times[i], exit_px=None, exit_why="触及目标", pnl=pnl)
                return "target", "", pnl, True, rec
        if i == day.exit_idx:
            half_day = day.times[i] != EXIT_TIME
            exit_px = c - side * SLIPPAGE if half_day else c
            exit_why = "收盘平仓"
            break
    fee_out = round(shares * COMMISSION, 10)
    pnl = side * shares * (exit_px - entry) - fee_in - fee_out
    rec.update(exit_time=day.times[i], exit_px=exit_px, exit_why=exit_why, pnl=pnl)
    for f, why in floors:
        if balance + pnl <= f:
            return "fail", why, pnl, True, rec
    return "ok", "", pnl, True, rec


def _fail(rec, day, i, px, why, shares, fee_in, side, entry):
    pnl = side * shares * (px - entry) - fee_in
    rec.update(exit_time=day.times[i], exit_px=px, exit_why="违规", pnl=pnl)
    return "fail", why, pnl, True, rec


def run_stage(days, name, i):
    """从第 i 个交易日开始跑一个阶段。返回 (结果, 结束日索引, 原因)。"""
    st = STAGES[name]
    bal = hwm = st["size"]
    start = days[i].date
    traded_days = 0
    pnls = []
    for j in range(i, len(days)):
        status, why, pnl, traded, _ = sim_day(days[j], bal, hwm, st)
        traded_days += traded
        if status == "fail":
            return "fail", j, REASON[why]
        if status == "target":
            return "pass", j, ""
        bal += pnl
        hwm = max(hwm, bal)
        pnls.append(pnl)
        if name == "ftmo_fd":
            if (days[j].date - start).days >= PAYOUT_CAL_DAYS and bal > st["size"]:
                return "pass", j, ""
        elif name.startswith("ftmo") and bal >= st["eod_target"]:
            need = FTMO_MIN_DAYS - traded_days
            k = j + max(0, need)
            return ("pass", k, "") if k < len(days) else ("open", len(days) - 1, "")
        if name == "aqua_fd":
            net = bal - st["size"]
            good = sum(1 for p in pnls if p >= PAYOUT_GOOD_DAY)
            held = (days[j].date - start).days
            if held >= PAYOUT_CAL_DAYS and good >= PAYOUT_GOOD_DAYS and net > 0 \
                    and max(pnls) < PAYOUT_CONSISTENCY * net:
                return "pass", j, ""
    return "open", len(days) - 1, ""


def chain(days, memo, stages, i):
    """依次跑各阶段；前一阶段通过日的下一交易日开始下一阶段。返回 (结果, 结束日索引, 原因, 结束阶段, 各阶段通过日索引)。"""
    k = i
    passed = []
    for n, name in enumerate(stages):
        key = (name, k)
        if key not in memo:
            memo[key] = run_stage(days, name, k)
        res, j, why = memo[key]
        if res != "pass":
            return res, j, why, name, passed
        passed.append(j)
        if n + 1 < len(stages):
            k = j + 1
            if k >= len(days):
                return "open", len(days) - 1, "", stages[n + 1], passed
    return "pass", j, "", stages[-1], passed


STAGE_CN = {"aqua_ch": "Challenge", "aqua_fd": "Funded", "ftmo_p1": "Phase1", "ftmo_p2": "Phase2", "ftmo_fd": "Funded"}
RESULT_CN = {"pass": "成功", "fail": "失败", "open": "未结束"}


def summarize(rows, result="结果", end="结束日"):
    done = [r for r in rows if r[result] != "未结束"]
    win = [r for r in done if r[result] == "成功"]
    fails = {}
    for r in done:
        if r[result] == "失败":
            key = f'{r["结束阶段"]}:{r["失败原因"]}'
            fails[key] = fails.get(key, 0) + 1
    cal = [(pd.Timestamp(r[end]) - pd.Timestamp(r["开考日"])).days for r in win]
    by_year = {}
    for r in done:
        y = r["开考日"][:4]
        a, b = by_year.get(y, (0, 0))
        by_year[y] = (a + (r[result] == "成功"), b + 1)
    return dict(
        开考=len(rows), 已结束=len(done), 未结束=len(rows) - len(done), 成功=len(win),
        失败=len(done) - len(win),
        成功率=round(len(win) / len(done) * 100, 4) if done else None,
        成功中位自然日=statistics.median(cal) if cal else None,
        失败原因=dict(sorted(fails.items(), key=lambda x: -x[1])),
        按年=dict((y, dict(成功=a, 已结束=b, 成功率=round(a / b * 100, 4))) for y, (a, b) in sorted(by_year.items())),
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--export", action="store_true")
    args = ap.parse_args()
    if args.export or not os.path.exists(BARS):
        export_a01()
    days = load_days()
    print(f"可开考交易日 {len(days)}：{days[0].date} ~ {days[-1].date}")
    memo = {}
    ds = lambda j: str(days[j].date)
    rows = {"Aqua": [], "FTMO": []}
    for i in range(len(days)):
        res, j, why, stage, passed = chain(days, memo, ["aqua_ch", "aqua_fd"], i)
        rows["Aqua"].append({
            "账户": "Aqua", "开考日": ds(i), "结果": RESULT_CN[res], "结束阶段": STAGE_CN[stage],
            "结束日": ds(j) if res != "open" else "", "失败原因": why,
            "耗时自然日": (days[j].date - days[i].date).days if res == "pass" else "",
            "Challenge通过日": ds(passed[0]) if passed else "",
            "Phase1通过日": "", "Phase2通过日": "", "拿到funded": "",
        })
        res, j, why, stage, passed = chain(days, memo, ["ftmo_p1", "ftmo_p2", "ftmo_fd"], i)
        if len(passed) >= 2:
            funded = "成功"
        elif res == "fail":
            funded = "失败"
        else:
            funded = "未结束"
        rows["FTMO"].append({
            "账户": "FTMO", "开考日": ds(i), "结果": RESULT_CN[res], "结束阶段": STAGE_CN[stage],
            "结束日": ds(j) if res != "open" else "", "失败原因": why,
            "耗时自然日": (days[j].date - days[i].date).days if res == "pass" else "",
            "Challenge通过日": "",
            "Phase1通过日": ds(passed[0]) if passed else "",
            "Phase2通过日": ds(passed[1]) if len(passed) >= 2 else "", "拿到funded": funded,
        })
    out = {acct: summarize(r) for acct, r in rows.items()}
    ref = [dict(r, 结束日=r["Phase2通过日"] or r["结束日"]) for r in rows["FTMO"]]
    out["FTMO拿到funded参考"] = summarize(ref, result="拿到funded")
    a, f = out["Aqua"]["成功率"], out["FTMO"]["成功率"]
    out["结论"] = "购买 Aqua Pay Later 200K" if a > f else "购买 FTMO 2-Step 100K"
    print(json.dumps(out, ensure_ascii=False, indent=1))
    os.makedirs(ANSWER, exist_ok=True)
    pd.DataFrame(rows["Aqua"] + rows["FTMO"]).to_csv(os.path.join(ANSWER, "official_starts.csv"), index=False)
    with open(os.path.join(ANSWER, "summary.json"), "w") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1, default=str)


if __name__ == "__main__":
    sys.exit(main())
