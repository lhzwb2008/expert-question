#!/usr/bin/env python3
"""打包「QQQ模拟盘准入」这道题：题目附件、标准答案附件。

底稿是 high-econ/一期/qqq_turtle_gate（只读）。题目附件内容没有改，只改了文件名。
在线 MCP 查的是 QQQ 日线，用来核对买入持有基准的两个价格和复权口径。

2026-11-26 最终质检返修：标答不再取底稿 answer/ 的数字，改由本脚本按 A01（日线）、A02（参数手册）、
A04（费用）独立重算。底稿回测有两处没按 A02 执行：
- 20 日／55 日入场的选择。A02 要求当天就知道该用 20 日还是 55 日（「这样 2021 年第一天知道该用 20 日还是
  55 日」），和 N、通道一样取前一交易日收盘后的状态。底稿在当天先结算「上一笔突破」再选通道，
  2021-05-04 开盘平掉多头的同时把 2021-04-01 那笔突破记成赢，改用 55 日低点，漏掉了平仓后按前 20 日低点
  318.962 的同日开空。2025-10-10 也是同样的情况（入场价相同，只是记成了 55 日入场，股数随权益变）。
- 名义本金降档后的恢复。A02 写的是「权益回到 100,000 以上，名义本金恢复成 100,000」。底稿每天按前一日权益从
  100,000 重新推算，权益回到 90,000 以上就恢复成 100,000（例如 2021-07-23 按 100,000 开了 251 股）。
  这里改成带状态：降档以后只有前一日收盘权益回到 100,000 以上才恢复。

脚本做的核对：
1. A01 的首日开盘价、末日收盘价和 MCP 返回值比对。
2. 用返回里的 Dividends 列把复权价还原成不复权价，算出含分红、不含分红两种口径的买入持有收益。
3. 本脚本的回测关掉上面两处修正时，和底稿 answer/ 的 331 笔成交、1464 天权益、rebuild_check.json 逐项一致；
   分别打开、同时打开两处修正，列出变化，并核对 2021-05-04、2021-07-23 前后的成交路径。
4. 标答两份文件和 ③填写稿.md 的「标准答案」「考点」里的关键数字与重算结果一致。
"""
from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass

import pandas as pd
from docx import Document
from openpyxl import load_workbook

from build_common import CASES, OUT, copy_as, fresh_dir, load_mcp_prices, source_line, write_docx, write_xlsx

SRC = CASES / "一期" / "qqq_turtle_gate"
DST = OUT / "题目" / "07_QQQ模拟盘准入"
PREFIX = "QQQ模拟盘_"
MCP_FILE = f"{PREFIX}MCP_QQQ日线.json"
D0, D1 = "2021-01-04", "2026-10-30"
START = 100_000.0
RENAME = {
    "A01_qqq_daily.csv": "A01_QQQ日线.csv",
    "A02_参数手册.md": "A02_参数手册.md",
    "A03_实习生参数说明.md": "A03_实习生参数说明.md",
    "A04_费用.csv": "A04_费用.csv",
    "A05_准入门槛.md": "A05_准入门槛.md",
    "A06_实习生回测摘要.csv": "A06_实习生回测摘要.csv",
}
ACTION = {"buy": "买入", "sell": "卖出", "short": "卖空", "cover": "买回"}


# ---------------- 按 A02、A04 的回测 ----------------

@dataclass
class Unit:
    price: float
    shares: int
    stop: float
    n: float  # 这个单位记下的 N（加仓单位沿用同一笔持仓第一笔的 N）


def backtest(bars: pd.DataFrame, fee_per_share: float, fix_filter: bool = True, fix_notional: bool = True) -> dict:
    """fix_filter：20/55 日的选择用前一交易日收盘后的「上一笔突破」状态；False 时和底稿一样当天先结算再选。
    fix_notional：名义本金降档后只有权益回到 100,000 以上才恢复；False 时和底稿一样每天从 100,000 重新推算。"""
    dates = list(bars.Date)
    O, H, L, C = (bars[k].astype(float).tolist() for k in ("Open", "High", "Low", "Close"))
    n_bars = len(dates)
    # 真实波幅和 Wilder N：最初 20 个 TR 的平均记在第 20 个 TR 那天
    tr = [None] + [max(H[i] - L[i], abs(H[i] - C[i - 1]), abs(L[i] - C[i - 1])) for i in range(1, n_bars)]
    N = [None] * n_bars
    N[20] = sum(tr[1:21]) / 20
    for i in range(21, n_bars):
        N[i] = (N[i - 1] * 19 + tr[i]) / 20

    def chan(i, w):  # 不含当天
        return (max(H[i - w:i]), min(L[i - w:i])) if i >= w else (None, None)

    st = dict(cash=START, side=0, rid=0, cur=0, notional=START, floor=START, last_win=False)
    units: list[Unit] = []
    fills, days, judg = [], [], []
    hypo = None

    def trade(day, act, px, sh, n, why):
        fee = sh * fee_per_share
        st["cash"] += (-1 if act in ("buy", "cover") else 1) * px * sh - fee
        if act in ("buy", "short") and st["cur"] == 0:
            st["rid"] += 1
            st["cur"] = st["rid"]
        fills.append(dict(round_id=st["cur"], Date=day, action=act, price=px, shares=sh, fee=fee, n_used=n, reason=why))

    def close_all(day, px, why):
        sh = sum(u.shares for u in units)
        units.clear()
        trade(day, "sell" if st["side"] == 1 else "cover", px, sh, None, why)
        st["side"], st["cur"] = 0, 0

    def add_units(day, hi, lo):
        s = st["side"]
        while units and len(units) < 4:
            last = units[-1]
            step = 0.5 * last.n
            lvl = last.price + s * step
            if (s == 1 and hi < lvl) or (s == -1 and lo > lvl):
                break
            for u in units:
                u.stop += s * step
            units.append(Unit(lvl, last.shares, lvl - s * 2 * last.n, last.n))
            trade(day, "buy" if s == 1 else "short", lvl, last.shares, last.n, "add")

    for i in range(21, n_bars):
        day = dates[i]
        if day > D1:
            break
        o, h, l, c = O[i], H[i], L[i], C[i]
        n_prev = N[i - 1]
        h10, l10 = chan(i, 10)
        h20, l20 = chan(i, 20)
        h55, l55 = chan(i, 55)
        win_prev_close = st["last_win"]

        # 上一笔 20 日突破的输赢：先看止损再看 10 日出场，开盘穿过就按开盘
        if hypo is not None:
            s, e, stop = hypo["side"], hypo["entry"], hypo["stop"]
            ex = l10 if s == 1 else h10
            past = (lambda x, lv: x <= lv) if s == 1 else (lambda x, lv: x >= lv)
            better = (lambda px: px > e) if s == 1 else (lambda px: px < e)
            ext = l if s == 1 else h
            out = None
            if past(o, stop):
                out = False
            elif past(o, ex):
                out = better(o)
            elif past(ext, stop):
                out = False
            elif past(ext, ex):
                out = better(ex)
            if out is not None:
                st["last_win"] = out
                judg.append(dict(start=hypo["day"], side=s, entry=e, end=day, win=out))
                hypo = None
        use55 = win_prev_close if fix_filter else st["last_win"]

        in_eval = day >= D0
        opened = False
        if in_eval and units:
            s = st["side"]
            past = (lambda x, lv: x <= lv) if s == 1 else (lambda x, lv: x >= lv)
            ex = l10 if s == 1 else h10
            ext = l if s == 1 else h
            tight = max(u.stop for u in units) if s == 1 else min(u.stop for u in units)
            if past(o, tight) or past(o, ex):
                close_all(day, o, "gap_stop" if past(o, tight) else "gap_exit10")
            else:
                for u in sorted(units, key=lambda u: -s * u.stop):
                    if past(ext, u.stop):
                        units.remove(u)
                        trade(day, "sell" if s == 1 else "cover", u.stop, u.shares, u.n, "stop")
                if not units:
                    st["side"], st["cur"] = 0, 0
                elif past(ext, ex):
                    close_all(day, ex, "exit10")
        if in_eval and not units:
            up, dn = (h55, l55) if use55 else (h20, l20)
            hit_up, hit_dn = h >= up, l <= dn
            if hit_up != hit_dn:
                s = 1 if hit_up else -1
                lvl = up if s == 1 else dn
                px = o if (o >= lvl if s == 1 else o <= lvl) else lvl
                sh = math.floor(st["notional"] * 0.01 / n_prev)
                if sh >= 1:
                    st["side"], opened = s, True
                    stop = px - s * 2 * n_prev
                    units.append(Unit(px, sh, stop, n_prev))
                    trade(day, "buy" if s == 1 else "short", px, sh, n_prev, "entry55" if use55 else "entry20")
                    if (l <= stop) if s == 1 else (h >= stop):
                        close_all(day, o if ((o <= stop) if s == 1 else (o >= stop)) else stop, "stop_same_day")
                    else:
                        add_units(day, h, l)
        elif in_eval and units and not opened:
            add_units(day, h, l)

        if in_eval:
            pos = st["side"] * sum(u.shares for u in units)
            eq = st["cash"] + pos * c
            days.append(dict(Date=day, equity=eq, side=st["side"], shares=pos, notional=st["notional"], N=N[i]))
            # 用今天收盘权益定明天的名义本金
            if fix_notional and eq >= START:
                st["notional"], st["floor"] = START, START
            elif not fix_notional:
                st["notional"], st["floor"] = START, START
            while eq < START and eq <= st["floor"] - 0.1 * st["notional"] + 1e-9:
                st["floor"] -= 0.1 * st["notional"]
                st["notional"] *= 0.8

        if hypo is None:
            up_hit, dn_hit = h >= h20, l <= l20
            if up_hit != dn_hit:
                s = 1 if up_hit else -1
                lvl = h20 if s == 1 else l20
                px = o if (o >= lvl if s == 1 else o <= lvl) else lvl
                stop = px - s * 2 * n_prev
                if (l <= stop) if s == 1 else (h >= stop):
                    st["last_win"] = False
                    judg.append(dict(start=day, side=s, entry=px, end=day, win=False))
                else:
                    hypo = dict(side=s, entry=px, stop=stop, day=day)

    t = pd.DataFrame(fills)
    e = pd.DataFrame(days)
    t["price"] = t.price.round(4)
    e["equity"] = e.equity.round(2)
    return dict(trades=t, equity=e, judg=pd.DataFrame(judg), N=dict(zip(dates, N)))


def summarize(res: dict) -> dict:
    t, e = res["trades"], res["equity"]
    dd = e.equity / e.equity.cummax() - 1
    k = int(dd.idxmin())
    first = t.groupby("round_id").first()
    last = t.groupby("round_id").last()
    reasons = t.reason.value_counts()
    final = float(e.equity.iloc[-1])
    return dict(
        final_equity=final, total_return=round(final / START - 1, 6), mdd=round(float(dd.min()), 6),
        mdd_date=e.Date[k], peak_date=e.Date[int(e.equity[:k + 1].idxmax())], peak=float(e.equity[:k + 1].max()),
        fees=round(float(t.fee.sum()), 2), fills=len(t), rounds=int(t.round_id.nunique()),
        long_rounds=int((first.action == "buy").sum()), short_rounds=int((first.action == "short").sum()),
        closed_rounds=int(last.action.isin(["sell", "cover"]).sum()), open_shares=int(e.shares.iloc[-1]),
        open_since=t[t.round_id == t.round_id.max()].Date.iloc[0] if e.shares.iloc[-1] else None,
        entry20=int(reasons.get("entry20", 0)), entry55=int(reasons.get("entry55", 0)), days=len(e),
        reasons={str(a): int(b) for a, b in reasons.items()},
    )


def check_against_base(res: dict) -> None:
    """关掉两处修正时，和底稿的答案逐笔、逐日对上。"""
    ref_t = pd.read_csv(SRC / "answer" / "official_trades.csv")
    ref_e = pd.read_csv(SRC / "answer" / "official_equity.csv")
    chk = json.load(open(SRC / "answer" / "rebuild_check.json", encoding="utf-8"))["official"]
    t, e = res["trades"], res["equity"]
    assert len(t) == len(ref_t) == 331
    for col in ("round_id", "Date", "action", "shares", "reason"):
        assert list(t[col]) == list(ref_t[col]), col
    assert (t.price - ref_t.price).abs().max() < 1e-9 and (t.fee - ref_t.fee).abs().max() < 1e-9
    nu, rn = t.n_used.astype(float), ref_t.n_used.astype(float)
    assert ((nu - rn).abs().fillna(0) < 1e-6).all() and (nu.isna() == rn.isna()).all()
    assert len(e) == len(ref_e) and list(e.Date) == list(ref_e.Date)
    assert (e.equity - ref_e.equity).abs().max() < 0.005 and list(e.shares) == list(ref_e.shares) and list(e.side) == list(ref_e.side)
    s = summarize(res)
    for k in ("final_equity", "total_return", "mdd", "mdd_date", "fees", "fills", "rounds", "closed_rounds", "open_shares", "days", "reasons"):
        assert s[k] == chk[k], (k, s[k], chk[k])


def show_path(res: dict, a: str, b: str, label: str) -> None:
    t, e = res["trades"], res["equity"].set_index("Date")
    print(f"    [{label}] {a} 至 {b} 成交：")
    for _, r in t[(t.Date >= a) & (t.Date <= b)].iterrows():
        print(f"      {r.Date} {ACTION[r.action]} {r.price:.4f} × {r.shares}  {r.reason}")
    print(f"    [{label}] 每日收盘权益／持仓／当日名义本金：")
    for day, r in e.loc[a:b].iterrows():
        print(f"      {day} {r.equity:,.2f} {int(r.shares)} {r.notional:,.0f}")


# ---------------- 打包 ----------------

def main() -> None:
    att = fresh_dir(DST / "题目附件")
    ans = fresh_dir(DST / "标准答案附件")
    for old, new in RENAME.items():
        copy_as(SRC / "attachments" / old, att / f"{PREFIX}{new}")
    copy_as(DST / "MCP结果文件" / MCP_FILE, att / MCP_FILE)

    a01 = pd.read_csv(att / f"{PREFIX}A01_QQQ日线.csv")
    # A04 的 apply_when 一列里有不带引号的逗号，按前三个逗号切
    fee_tab = {r[0]: r[1:] for r in (ln.split(",", 3) for ln in (att / f"{PREFIX}A04_费用.csv").read_text(encoding="utf-8").splitlines()[1:] if ln)}
    fee = float(fee_tab["commission_per_share"][0])
    assert fee == 0.005 and fee_tab["commission_per_share"][1] == "USD/share" and float(fee_tab["slippage"][0]) == 0
    a06 = pd.read_csv(att / f"{PREFIX}A06_实习生回测摘要.csv").set_index("item").intern_value
    intern = dict(final_equity=float(a06.final_equity_usd), total_return=float(a06.total_return), mdd=float(a06.max_drawdown),
                  fills=int(a06.fills), rounds=int(a06.rounds), fees=float(a06.commission_usd))
    assert a06.uses_55_day_entry == "no" and a06.recommendation == "approve"

    # 核对 3：先复现底稿，再打开两处修正
    runs = {}
    for name, ff, fn in [("底稿口径", False, False), ("只改20/55日选择", True, False), ("只改名义本金恢复", False, True), ("两处都改", True, True)]:
        runs[name] = backtest(a01, fee, ff, fn)
    check_against_base(runs["底稿口径"])
    print("核对 3：关掉两处修正时，本脚本回测和底稿 answer/ 的 331 笔成交（日期、方向、价格、股数、费用、N、原因）、1464 天权益逐项一致")
    sums = {k: summarize(v) for k, v in runs.items()}
    for k, s in sums.items():
        print(f"        {k}：期末 {s['final_equity']:,.2f}，回撤 {-s['mdd']:.4%}（{s['mdd_date']}），{s['fills']} 笔，手续费 {s['fees']:.2f}，"
              f"回合 {s['rounds']}（多 {s['long_rounds']}／空 {s['short_rounds']}），20 日 {s['entry20']}，55 日 {s['entry55']}，期末 {s['open_shares']} 股")
    base, fixf, fixn, res = (runs[k] for k in ("底稿口径", "只改20/55日选择", "只改名义本金恢复", "两处都改"))

    # 修正一：2021-05-04 平多后同日开空
    i = a01.index[a01.Date == "2021-05-04"][0]
    bar = a01.iloc[i]
    l10, l20, l55 = a01.Low[i - 10:i].min(), a01.Low[i - 20:i].min(), a01.Low[i - 55:i].min()
    assert (bar.Open, bar.Low, l10, l20) == (322.855, 315.911, 323.417, 318.962) and bar.Low > l55
    j = res["judg"]
    assert ((j.start == "2021-03-03") & (j.end == "2021-03-16") & ~j.win).any()      # 前一交易日收盘时，上一笔已结束的突破是输
    assert ((j.start == "2021-04-01") & (j.end == "2021-05-04") & j.win).any()       # 这一笔 05-04 开盘才结束，记赢
    n_0504 = res["N"]["2021-05-03"]
    for r in (base, fixf, res):
        assert r["trades"].query("Date == '2021-05-04' and reason == 'gap_exit10'").price.tolist() == [322.855]
    assert base["trades"].query("Date == '2021-05-04'").shape[0] == 1
    for r in (fixf, res):
        ent = r["trades"].query("Date == '2021-05-04' and reason == 'entry20'").iloc[0]
        assert ent.action == "short" and ent.price == 318.962 and ent.shares == math.floor(80_000 * 0.01 / n_0504) == 162
    d_base = base["trades"][base["trades"].reason.str.startswith("entry")].set_index("Date")
    d_fix = fixf["trades"][fixf["trades"].reason.str.startswith("entry")].set_index("Date")
    only_fix = sorted(set(d_fix.index) - set(d_base.index))
    relabel = sorted(x for x in set(d_fix.index) & set(d_base.index) if d_fix.reason[x] != d_base.reason[x])
    assert only_fix == ["2021-05-04"] and relabel == ["2025-10-10"] and set(d_base.index) <= set(d_fix.index)
    assert d_base.price["2025-10-10"] == d_fix.price["2025-10-10"]
    print(f"核对 4：2021-05-04 开盘 {bar.Open} 跌破前 10 日低点 {l10}，多头按开盘平仓；当天最低 {bar.Low} 触及前 20 日低点 {l20}（55 日低点 {l55}）。"
          f"前一交易日收盘时上一笔已结束的突破（2021-03-03 空头）是输，按 20 日开空 162 股（80,000 × 1% ÷ N {n_0504:.4f}）")
    print(f"        只改 20/55 日选择时，入场日期只多出 {only_fix}，另有 {relabel} 同价入场由 55 日记成 20 日")

    # 修正二：名义本金降档后，权益回到 100,000 以上才恢复
    eb = base["equity"].set_index("Date")
    assert eb.equity["2021-02-22"] == 89357.33 and eb.equity["2021-07-22"] == 93624.96 and eb.notional["2021-07-23"] == 100_000
    assert base["trades"].query("Date == '2021-07-23' and reason == 'entry55'").shares.tolist() == [251]
    for r in (fixn, res):
        e = r["equity"]
        prev = e.equity.shift().fillna(START)
        # 每天用的名义本金：前一日权益 >= 100,000 时为 100,000；降档后在权益回到 100,000 以前只降不升
        for k in range(1, len(e)):
            if prev[k] >= START:
                assert e.notional[k] == START
            else:
                assert e.notional[k] <= e.notional[k - 1]
        assert e.equity[(e.Date >= "2021-02-22") & (e.Date <= "2021-07-22")].max() < START
    er = res["equity"].set_index("Date")
    n_0723 = res["N"]["2021-07-22"]
    s0723 = res["trades"].query("Date == '2021-07-23' and reason == 'entry55'").shares.tolist()
    assert er.notional["2021-07-23"] == 64_000 and s0723 == [math.floor(64_000 * 0.01 / n_0723)] == [160]
    assert fixn["equity"].set_index("Date").notional["2021-07-23"] == 80_000
    assert fixn["trades"].query("Date == '2021-07-23' and reason == 'entry55'").shares.tolist() == [math.floor(80_000 * 0.01 / n_0723)] == [200]
    cuts = [(d, v) for d, v, p in zip(er.index[1:], er.notional[1:], er.notional[:-1]) if v != p]
    assert all(v < p for (d, v), p in zip(cuts, [START] + [v for _, v in cuts[:-1]]))
    print(f"核对 5：底稿 2021-07-22 权益 93,624.96 < 100,000 仍按 100,000 开 251 股；带状态的名义本金只改这一处时为 80,000（200 股），"
          f"两处都改时 2021-05-24 收盘 {er.equity['2021-05-24']:,.2f} 再降一档，2021-07-23 按 64,000 开 160 股（N {n_0723:.4f}）")
    print("        两处都改后名义本金的变动：", "，".join(f"{d} 起 {v:,.0f}" for d, v in cuts), "；评估窗内没有恢复到 100,000")
    for a, b in [("2021-04-29", "2021-05-25"), ("2021-07-16", "2021-07-27")]:
        show_path(base, a, b, "底稿口径")
        show_path(res, a, b, "两处都改")
    tb, tr_ = base["trades"], res["trades"]
    k0 = next(k for k in range(len(tb)) if (tb.Date[k], tb.shares[k], tb.price[k]) != (tr_.Date[k], tr_.shares[k], tr_.price[k]))
    print(f"        两处都改后，逐笔台账从第 {k0 + 1} 笔（{tr_.Date[k0]}）开始和底稿不同，此前 {k0} 笔一致")

    off = sums["两处都改"]
    assert off["days"] == 1464 and off["rounds"] == off["long_rounds"] + off["short_rounds"]
    assert off["closed_rounds"] == off["rounds"] - (1 if off["open_shares"] else 0)
    assert off["entry20"] + off["entry55"] == off["rounds"]

    # 核对 1、2：在线数据和买入持有（与返修前相同）
    rec, q = load_mcp_prices(DST / "MCP结果文件" / MCP_FILE, 0)
    assert set(q.Date.str[11:13]) <= {"04", "05"}
    a01i = a01.set_index("Date")
    in_rng = q.loc[a01i.index[0]:a01i.index[-1]]
    assert list(in_rng.index) == list(a01i.index)
    o_adj, c_adj = float(q.Open[D0]), float(q.Close[D1])
    o_a01, c_a01 = float(a01i.Open[D0]), float(a01i.Close[D1])
    print(f"核对 1：A01 {len(a01i)} 个交易日，与 MCP 同区间一致。{D0} 开盘 A01 {o_a01}，MCP {o_adj:.4f}；{D1} 收盘 A01 {c_a01}，MCP {c_adj:.4f}")
    assert abs(o_adj - o_a01) < 0.005 and abs(c_adj - c_a01) < 0.005
    bars = q.reset_index()
    f, fac = 1.0, [1.0] * len(bars)
    for k in range(len(bars) - 1, -1, -1):
        fac[k] = f
        if bars.Dividends[k] and k > 0:
            f *= 1 - bars.Dividends[k] / (bars.Close[k - 1] / f + bars.Dividends[k])
    bars["fac"] = fac
    b = bars.set_index("day")
    fac0, fac1 = float(b.fac[D0]), float(b.fac[D1])
    o_raw, c_raw = o_adj / fac0, c_adj / fac1
    divs = q[(q.Dividends != 0) & (q.index >= D0) & (q.index <= D1)].Dividends
    later = q[(q.Dividends != 0) & (q.index > D1)]
    splits = q[q["Stock Splits"] != 0]
    r_total, r_price = c_adj / o_adj - 1, c_raw / o_raw - 1
    r_a01 = c_a01 / o_a01 - 1
    bh, bh_price = START * (1 + r_a01), START * (1 + r_price)
    half = bh / 2
    print(f"核对 2：评估窗内分红 {len(divs)} 次，合计 {divs.sum():.3f} 美元/股（{divs.index[0]} 至 {divs.index[-1]}）；{D1} 之后分红 {len(later)} 次；拆分 {len(splits)} 次")
    print(f"        {D0} 调整系数 {fac0:.6f}，还原不复权开盘价 {o_raw:.2f}；{D1} 系数 {fac1:.6f}")
    print(f"        含分红 {r_total:.4%}（A01 口径 {r_a01:.4%}），不含分红 {r_price:.4%}；买入持有期末 {bh:.2f}，一半 {half:.2f}；不含分红期末 {bh_price:.2f}，一半 {bh_price / 2:.2f}")
    assert round(r_a01, 6) == 1.265737 and len(splits) == 0 and len(later) == 0
    assert (round(bh, 2), round(half, 2), round(bh_price, 2), round(bh_price / 2, 2)) == (226573.65, 113286.83, 219126.67, 109563.34)

    # 门槛
    gate = [off["final_equity"] > START, -off["mdd"] <= 0.25, off["final_equity"] >= half]
    gate_price = off["final_equity"] >= bh_price / 2
    assert gate == [False, False, False] and not gate_price
    for s in sums.values():  # 两处修正分别、同时打开，三条门槛都不过
        assert s["final_equity"] < START and -s["mdd"] > 0.25 and s["final_equity"] < bh_price / 2
    verdict = "搁置，不签发"

    fe, ret, mdd = off["final_equity"], off["total_return"] * 100, -off["mdd"] * 100
    sh_open = -off["open_shares"]
    side_open = "空头" if off["open_shares"] < 0 else "多头"
    t, e = res["trades"], res["equity"]
    cut_text = "；".join(f"{d} 起 {v:,.0f} 美元" for d, v in cuts)

    # 标准答案附件：xlsx
    l_head = ["回合", "日期", "方向", "价格", "股数", "费用", "成交原因"]
    l_rows = [[int(r.round_id), r.Date, ACTION[r.action], float(r.price), int(r.shares), float(r.fee), r.reason] for _, r in t.iterrows()]
    e_head = ["日期", "收盘权益", "持仓方向", "持仓股数", "当日计算单位用的名义本金"]
    e_rows = [[r.Date, float(r.equity), int(r.side), int(r.shares), float(r.notional)] for _, r in e.iterrows()]
    d_head = ["项目", "正式结果", "A06实习生摘要", "说明"]
    d_rows = [
        ["期末权益(美元)", fe, intern["final_equity"], "A06 不作为正式结果"],
        ["总收益(%)", round(ret, 4), round(intern["total_return"] * 100, 4), ""],
        ["最大回撤(%)", round(mdd, 4), round(-intern["mdd"] * 100, 4), f"正式结果谷底日 {off['mdd_date']}"],
        ["成交笔数", off["fills"], intern["fills"], "实习生不加仓、没有 2N 止损"],
        ["手续费(美元)", off["fees"], intern["fees"], "实习生没有扣每股 0.005 美元"],
        ["开仓回合", off["rounds"], intern["rounds"], f"正式结果做多 {off['long_rounds']} 个、做空 {off['short_rounds']} 个"],
        ["55日入场次数", off["entry55"], 0, "实习生只用 20 日"],
        ["20日入场次数", off["entry20"], intern["rounds"], "实习生按收盘价突破"],
        ["结论", verdict, "签发", "按 A02、A04 重算后三条门槛都未通过"],
    ]
    o_head = ["项目", "日期", "数值", "说明"]
    o_rows = [
        ["MCP返回开盘价（复权）", D0, round(o_adj, 4), "买入持有的买入价"],
        ["A01开盘价", D0, o_a01, "与返回值相差不到 0.001"],
        ["MCP返回收盘价（复权）", D1, round(c_adj, 4), "买入持有的计价"],
        ["A01收盘价", D1, c_a01, "与返回值一致"],
        ["调整系数", D0, round(fac0, 6), "由 Dividends 列从最近一天往回推出"],
        ["还原不复权开盘价", D0, round(o_raw, 2), "返回开盘价 ÷ 调整系数"],
        ["买入持有收益，含分红(%)", f"{D0} 至 {D1}", round(r_total * 100, 2), "复权价口径，与 A01 算出的 126.5737% 一致"],
        ["买入持有收益，不含分红(%)", f"{D0} 至 {D1}", round(r_price * 100, 2), "不复权价口径"],
        ["评估窗内分红次数", f"{D0} 至 {D1}", len(divs), f"合计每股 {divs.sum():.3f} 美元"],
    ] + [["分红", day, float(v), "每股美元"] for day, v in divs.items()]
    p0504 = t[(t.Date == "2021-05-04") & t.reason.isin(["entry20", "add"])]
    ledger_notes = [
        f"按 A02、A04 重算，{D0} 至 {D1} 共 {off['fills']} 笔成交，手续费合计 {off['fees']:.2f} 美元。"
        f"期末持有{side_open} {sh_open} 股，{off['open_since']} 当天建立，没有额外平仓。",
        f"2021-05-04 开盘 322.855 已跌破前 10 日低点 323.417，多头 488 股按开盘价平掉；平完后当天最低价 315.911 触及前 20 日低点 318.962，"
        f"按 318.962 开空 {int(p0504.shares.iloc[0])} 股（名义本金 80,000 美元，前一日 N {n_0504:.4f}），当天在 {p0504.price.iloc[1]:.4f} 加仓一个单位。"
        "当天用 20 日通道：截至前一交易日收盘，最近一笔已结束的 20 日突破（2021-03-03 的空头突破）记为输；"
        "2021-04-01 的多头突破在 05-04 开盘才结束、记为赢，从下一交易日起才影响通道选择。",
        f"名义本金按前一日收盘权益更新：{cut_text}。评估窗内收盘权益再没有回到 100,000 美元以上，名义本金没有恢复；"
        f"2021-07-23 的 55 日入场按 64,000 美元计算，每单位 160 股。",
    ]
    write_xlsx(
        ans / "QQQ模拟盘准入测算表.xlsx",
        [("逐笔台账", l_head, l_rows), ("每日权益", e_head, e_rows), ("差异清单", d_head, d_rows), ("在线数据", o_head, o_rows)],
        notes={
            "逐笔台账": ledger_notes,
            "每日权益": [f"最大回撤按每日收盘权益相对此前最高收盘权益计算，为 {mdd:.4f}%，谷底日 {off['mdd_date']}"
                     f"（此前最高收盘权益 {off['peak']:,.2f} 美元，{off['peak_date']}）。",
                     "「当日计算单位用的名义本金」是当天开仓时用的名义本金，由前一交易日收盘权益决定。"],
            "差异清单": ["A06 是实习生的摘要，只用来对照差异，不作为正式结果。"],
            "在线数据": [
                source_line(rec),
                f"返回 {len(q)} 行，{q.index[0]} 至 {q.index[-1]}。返回的 Date 是美东零点对应的 UTC 时间，日期部分就是交易日。"
                f"{a01i.index[0]} 至 {a01i.index[-1]} 返回 {len(in_rng)} 个交易日，与 A01 的交易日完全一致。",
                "返回的开高低收都按现金分红做过前复权，没有拆分记录。A01 的首日开盘价、末日收盘价与返回值相同，说明 A01 也是复权价。",
                f"还原办法：从最近一天往回，每遇到一个除息日，之前的系数乘以（1 − 每股分红 ÷ 除息前一日的不复权收盘价）。{D1} 之后到查询日没有分红，{D1} 的系数为 1。",
                f"买入持有按复权价是含分红的总回报 {r_total:.2%}；按不复权价只算价格涨幅是 {r_price:.2%}，对应期末 {bh_price:,.2f} 美元，一半 {bh_price / 2:,.2f} 美元。"
                "两种口径下门槛三都不通过。",
                "以后每次分红，返回的历史复权价会整体缩小，含分红收益、还原后的不复权价和分红记录不变。",
            ],
        },
    )

    # 标准答案附件：docx
    write_docx(
        ans / "QQQ模拟盘准入备忘录.docx",
        "QQQ 日线趋势策略模拟盘准入备忘录",
        [
            ("结论", [f"{verdict}模拟盘。按 A02、A04 重算后，A05 的三条门槛都没有通过。"]),
            ("三条门槛", [
                f"门槛一，期末权益高于 100,000 美元：未通过。期末权益 {fe:,.2f} 美元，总收益 {ret:.4f}%。",
                f"门槛二，每日收盘权益最大回撤不超过 25%：未通过。最大回撤 {mdd:.4f}%，谷底日 {off['mdd_date']}。",
                f"门槛三，期末权益不低于买入持有期末权益的一半：未通过。买入持有收益 {r_a01 * 100:.4f}%，期末权益 {bh:,.2f} 美元，"
                f"一半是 {half:,.2f} 美元，策略期末权益低于它。",
            ]),
            ("重算结果", [
                f"评估窗 {D0} 至 {D1}，共 {off['days']} 个交易日，起始现金 100,000 美元。",
                f"成交 {off['fills']} 笔，手续费 {off['fees']:.2f} 美元。开仓回合 {off['rounds']} 个，做多 {off['long_rounds']} 个、做空 {off['short_rounds']} 个，"
                f"已结束 {off['closed_rounds']} 个。20 日入场 {off['entry20']} 次，55 日入场 {off['entry55']} 次。",
                f"{D1} 收盘持有{side_open} {sh_open} 股，当天建立，没有额外平仓，按当日收盘价计入期末权益。",
                f"2021-05-04 开盘按 322.855 平掉多头 488 股后，当天最低价 315.911 触及前 20 日低点 318.962，按 A02「平完了才允许开新仓」"
                f"同日按 318.962 开空 {int(p0504.shares.iloc[0])} 股并加仓一个单位。当天用 20 日通道，因为截至前一交易日收盘，最近一笔已结束的 20 日突破记为输。",
                f"名义本金在 2021-02-22 收盘权益 89,357.33 美元后降为 80,000 美元，2021-05-24 收盘权益 {er.equity['2021-05-24']:,.2f} 美元后降为 64,000 美元，"
                "此后评估窗内权益没有回到 100,000 美元以上，名义本金没有恢复。2021-07-23 的 55 日入场按 64,000 美元计算，每单位 160 股。",
            ]),
            ("买入持有基准的口径核对", [
                f"通过 US Stocks MCP 查询 QQQ 日线（数据来自 Yahoo Finance，2026-11-11 查询）核对。{D0} 开盘价为 {o_adj:.4f}，A01 是 {o_a01}；{D1} 收盘价为 {c_adj:.2f}，A01 是 {c_a01}。两个价格都对得上。",
                f"该数据源的价格按现金分红做过前复权，A01 和它一致，也是复权价。评估窗内 QQQ 分红 {len(divs)} 次，合计每股 {divs.sum():.3f} 美元，没有拆分。"
                f"按分红记录还原，{D0} 的不复权开盘价是 {o_raw:.2f} 美元。",
                f"所以 A05 的买入持有收益 {r_a01 * 100:.4f}% 是含分红再投资的总回报。只算价格涨幅是 {r_price * 100:.2f}%，对应期末 {bh_price:,.2f} 美元，"
                f"一半是 {bh_price / 2:,.2f} 美元。策略期末权益 {fe:,.2f} 美元在两种口径下都低于一半，门槛三的结论不受口径影响。",
                "门槛判定仍按 A05 用 A01 的价格，在线数据只用于核对口径。",
            ]),
            ("与实习生摘要的差异", [
                f"A06 的期末权益是 {intern['final_equity']:,.2f} 美元，成交 {intern['fills']} 笔，手续费 0 美元，没有 55 日入场，建议签发。",
                "差异来自 A03 的做法：按收盘价突破、每次一个单位不加仓、只用 20 日、没有 2N 止损、不扣费用。这些都和 A02、A04 不一致，A06 不作为正式结果。",
            ]),
            ("对应材料", ["逐笔成交见《QQQ模拟盘准入测算表.xlsx》的「逐笔台账」，每日收盘权益见「每日权益」，与 A06 的对照见「差异清单」，"
                      "买入持有基准的核对见「在线数据」。两份文件的期末权益、成交笔数和结论相同。"]),
        ],
    )

    # 核对 6：两份标答文件和填写稿的关键数字
    wb = load_workbook(ans / "QQQ模拟盘准入测算表.xlsx", data_only=True)
    led = [r for r in wb["逐笔台账"].iter_rows(min_row=2, values_only=True) if isinstance(r[0], int)]
    eqs = [r for r in wb["每日权益"].iter_rows(min_row=2, values_only=True) if isinstance(r[0], str) and r[0][:2] == "20" and isinstance(r[1], (int, float))]
    dif = {r[0]: r[1] for r in wb["差异清单"].iter_rows(min_row=2, values_only=True) if r[0]}
    assert len(led) == off["fills"] and abs(sum(r[5] for r in led) - off["fees"]) < 0.005 and len({r[0] for r in led}) == off["rounds"]
    assert len(eqs) == off["days"] and eqs[-1][1] == fe and eqs[-1][3] == off["open_shares"]
    assert abs(min(r[1] / max(x[1] for x in eqs[:k + 1]) - 1 for k, r in enumerate(eqs)) - off["mdd"]) < 1e-6
    assert (dif["期末权益(美元)"], dif["成交笔数"], dif["手续费(美元)"], dif["55日入场次数"], dif["20日入场次数"], dif["开仓回合"], dif["结论"]) == \
        (fe, off["fills"], off["fees"], off["entry55"], off["entry20"], off["rounds"], verdict)
    memo = "\n".join(p.text for p in Document(ans / "QQQ模拟盘准入备忘录.docx").paragraphs)
    for s in [f"{fe:,.2f}", f"{ret:.4f}%", f"{mdd:.4f}%", off["mdd_date"], f"成交 {off['fills']} 笔", f"{off['fees']:.2f} 美元",
              f"开仓回合 {off['rounds']} 个，做多 {off['long_rounds']} 个、做空 {off['short_rounds']} 个，已结束 {off['closed_rounds']} 个",
              f"20 日入场 {off['entry20']} 次，55 日入场 {off['entry55']} 次", f"{side_open} {sh_open} 股", verdict, f"{half:,.2f}"]:
        assert s in memo, s
    draft = (DST / "③填写稿.md").read_text(encoding="utf-8")
    sec = {m.group(1): m.group(2) for m in re.finditer(r"^## (.+?)\n(.*?)(?=^## |\Z)", draft, re.S | re.M)}
    key = [f"{fe:.2f}美元", f"{ret:.4f}%", f"{mdd:.4f}%", off["mdd_date"], f"成交{off['fills']}笔", f"{off['fees']:.2f}美元",
           f"开仓回合{off['rounds']}个，做多{off['long_rounds']}个、做空{off['short_rounds']}个，已结束{off['closed_rounds']}个",
           f"20日入场{off['entry20']}次，55日入场{off['entry55']}次", f"{side_open}{sh_open}股", f"{half:.2f}美元"]
    for name in ("标准答案", "考点"):
        for s in key:
            assert s in sec[name], (name, s)
    for old in ("65476.19", "-34.5238%", "42.4577%", "331笔", "217.56", "开仓回合77个", "做空32个", "已结束76个", "20日入场57次", "55日入场20次", "空头87股"):
        assert old not in sec["标准答案"], old
        assert old not in sec["考点"].split("常见错误")[0], old
    for s in ["318.962", "162股", "64000", "160股"]:
        assert s in sec["考点"], s
    print(f"核对 6：测算表 {len(led)} 笔、{len(eqs)} 天、差异清单，备忘录，填写稿「标准答案」「考点」的期末权益 {fe:,.2f}、收益 {ret:.4f}%、回撤 {mdd:.4f}%、"
          f"{off['fills']} 笔、手续费 {off['fees']:.2f}、回合 {off['rounds']}、20 日 {off['entry20']}／55 日 {off['entry55']}、期末{side_open} {sh_open} 股一致；结论 {verdict}")
    print("买入持有：", round(bh, 2), round(half, 2), "不含分红：", round(bh_price, 2), round(bh_price / 2, 2))
    print("查询时间", rec["查询时间"], "返回", len(q), "行", q.index[0], q.index[-1])


if __name__ == "__main__":
    main()
