"""项目冗余材料的计算：全部用 新题数据/项目冗余_补充/ 里的真实行情，返回（数字字典, 表格字典）。"""
from __future__ import annotations
import numpy as np
import pandas as pd
from _data import load, lp


def pct(x, nd=2):
    return f"{x * 100:.{nd}f}%"


def _stats(s: pd.Series) -> dict:
    s = s.fillna(0)
    nav = (1 + s).cumprod()
    yrs = len(s) / 252
    return dict(cum=nav.iloc[-1] - 1, ann=nav.iloc[-1] ** (1 / yrs) - 1, vol=s.std() * np.sqrt(252),
                mdd=(nav / nav.cummax() - 1).min())


# ---------- 日本股票 ETF 汇率对冲切换 ----------
def japan():
    _, e = load("EWJ_5y"); _, h = load("HEWJ_5y"); _, x = load("DXJ_5y"); _, j = load("JPY_X_5y")
    px = pd.DataFrame({"EWJ": e.Close, "HEWJ": h.Close, "DXJ": x.Close, "EWJ量": e.Volume, "HEWJ量": h.Volume,
                       "DXJ量": x.Volume}).dropna()
    px["USDJPY"] = j.Close.reindex(px.index).ffill()
    px = px.loc["2022-01-03":"2026-06-30"]
    out, tabs = {}, {"j_px": px}
    cost = 0.0005  # 每次切换（卖一买一）按 5 个基点计
    for tag, win, end in (("v1", 20, "2026-06-12"), ("v2", 60, "2026-06-30")):
        p = px.loc[:end]
        r = p[["EWJ", "HEWJ", "DXJ"]].pct_change()
        ma = p.USDJPY.rolling(win).mean()
        hold = (p.USDJPY > ma).shift(1)  # 前一日美元日元在均线上方（日元偏弱）→ 持有对冲版
        sw = pd.Series(np.where(hold == True, r.HEWJ, r.EWJ), index=p.index)
        flips = (hold.astype(float).diff().abs() > 0)
        net = sw - flips.astype(float) * cost
        sl = slice("2022-04-01", None)
        r, sw, net, flips, hold, ma = r.loc[sl], sw.loc[sl], net.loc[sl], flips.loc[sl], hold.loc[sl], ma.loc[sl]
        for name, s in (("ewj", r.EWJ), ("hewj", r.HEWJ), ("dxj", r.DXJ), ("sw", sw), ("net", net)):
            for k, v in _stats(s).items():
                out[f"{tag}_{name}_{k}"] = v
        out[f"{tag}_flips"] = int(flips.sum())
        out[f"{tag}_hedged_days"] = int((hold == True).sum())
        out[f"{tag}_days"] = int(len(hold))
        out[f"{tag}_end"] = p.index[-1]
        if tag == "v2":
            tab = pd.DataFrame({"美元日元": p.USDJPY.loc[sl], "60日均线": ma, "持有": np.where(hold == True, "HEWJ", "EWJ"),
                                "EWJ日收益": r.EWJ, "HEWJ日收益": r.HEWJ, "当日切换": np.where(flips, "是", ""),
                                "策略日收益（扣成本）": net})
            tabs["j_daily"] = tab
            yr = pd.DataFrame({"EWJ": r.EWJ, "HEWJ": r.HEWJ, "DXJ": r.DXJ, "切换（未扣成本）": sw, "切换（扣成本）": net})
            tabs["j_year"] = yr.groupby(yr.index.str[:4]).apply(lambda g: (1 + g.fillna(0)).prod() - 1)
            tabs["j_flips"] = tab[tab["当日切换"] == "是"][["美元日元", "60日均线", "持有"]]
    # 均线长度对比（修订版口径：扣 5 个基点，截至 2026-06-30）
    r = px[["EWJ", "HEWJ"]].pct_change()
    wins = []
    for w in (20, 40, 60, 120):
        hold = (px.USDJPY > px.USDJPY.rolling(w).mean()).shift(1)
        fl = (hold.astype(float).diff().abs() > 0)
        s = (pd.Series(np.where(hold == True, r.HEWJ, r.EWJ), index=px.index) - fl * cost).loc["2022-04-01":]
        st = _stats(s)
        nav = (1 + s).cumprod(); dd = nav / nav.cummax() - 1
        wins.append([w, int(fl.loc["2022-04-01":].sum()), st["cum"], st["ann"], st["mdd"], nav.loc[:dd.idxmin()].idxmax(), dd.idxmin()])
        out[f"j_w{w}_flips"] = int(fl.loc["2022-04-01":].sum()); out[f"j_w{w}_cum"] = st["cum"]; out[f"j_w{w}_mdd"] = st["mdd"]
    tabs["j_wins"] = wins
    for k, s in (("hewj", r.HEWJ), ("ewj", r.EWJ)):
        nav = (1 + s.loc["2022-04-01":].fillna(0)).cumprod(); dd = nav / nav.cummax() - 1
        out[f"j_{k}_mdd_peak"] = nav.loc[:dd.idxmin()].idxmax(); out[f"j_{k}_mdd_low"] = dd.idxmin()
    out["j_start"] = "2022-04-01"
    out["j_jpy_start"] = px.USDJPY.loc["2022-04-01":].iloc[0]
    out["j_jpy_end"] = px.USDJPY.iloc[-1]
    out["j_jpy_max"] = px.USDJPY.max(); out["j_jpy_max_day"] = px.USDJPY.idxmax()
    out["j_hewj_vol20"] = px["HEWJ量"].loc["2026-06-01":].mean()
    out["j_ewj_vol20"] = px["EWJ量"].loc["2026-06-01":].mean()
    out["j_dxj_vol20"] = px["DXJ量"].loc["2026-06-01":].mean()
    out["j_hewj_px"] = px.HEWJ.iloc[-1]; out["j_ewj_px"] = px.EWJ.iloc[-1]
    return out, tabs


# ---------- 美股隔夜收益 ----------
def overnight():
    out, tabs = {}, {}
    raw = {}
    for t in ("DIA", "IWM"):
        _, d = load(f"{t}_5y")
        d = d.loc[:"2026-05-29"]
        raw[t] = d
        on = d.Open / d.Close.shift(1) - 1
        intra = d.Close / d.Open - 1
        g = pd.DataFrame({"on": on, "in": intra, "cc": d.Close.pct_change()}).dropna().loc["2022-01-03":]
        tabs[f"o_{t}"] = g
        yr = g.groupby(g.index.str[:4]).apply(lambda x: pd.Series({
            "交易日数": len(x), "隔夜累计": (1 + x.on).prod() - 1, "日内累计": (1 + x["in"]).prod() - 1,
            "收盘到收盘累计": (1 + x.cc).prod() - 1, "隔夜为正占比": (x.on > 0).mean()}))
        tabs[f"o_year_{t}"] = yr
        for y_, row in yr.iterrows():
            out[f"o_{t}_y{y_}_on"] = row["隔夜累计"]; out[f"o_{t}_y{y_}_in"] = row["日内累计"]
        mo = g.groupby(g.index.str[:7]).apply(lambda x: pd.Series({
            "隔夜累计": (1 + x.on).prod() - 1, "日内累计": (1 + x["in"]).prod() - 1}))
        tabs[f"o_month_{t}"] = mo
        out[f"o_{t}_n"] = len(g)
        out[f"o_{t}_on"] = (1 + g.on).prod() - 1
        out[f"o_{t}_in"] = (1 + g["in"]).prod() - 1
        out[f"o_{t}_cc"] = (1 + g.cc).prod() - 1
        out[f"o_{t}_onpos"] = (g.on > 0).mean()
        out[f"o_{t}_mo_on_pos"] = int((mo["隔夜累计"] > 0).sum()); out["o_months"] = len(mo)
        for bp in (1, 2, 4, 6):
            out[f"o_{t}_on_{bp}bp"] = (1 + g.on - bp / 10000).prod() - 1
        wd = pd.to_datetime(g.index).dayofweek
        tabs[f"o_wd_{t}"] = g.groupby(wd).agg(样本数=("on", "size"), 隔夜均值=("on", "mean"), 日内均值=("in", "mean"))
        out[f"o_{t}_on_mean_bp"] = g.on.mean() * 1e4
        out[f"o_{t}_on_std_bp"] = g.on.std() * 1e4
    tabs["o_raw"] = raw
    return out, tabs


# ---------- 比特币现货 ETF ----------
def bitcoin():
    out, tabs = {}, {}
    _, ib = load("IBIT_5y"); _, bt = load("BTC-USD_5y"); _, dia = load("DIA_5y"); _, iwm = load("IWM_5y"); _, lqd = load("LQD_2y")
    ib = ib.loc[:"2026-08-31"]
    tabs["b_raw"] = ib
    tabs["b_btc"] = bt.Close
    r = ib.Close.pct_change().dropna()
    nav = ib.Close / ib.Close.iloc[0]
    dd = nav / nav.cummax() - 1
    out.update(b_first=ib.index[0], b_last=ib.index[-1], b_px0=ib.Close.iloc[0], b_px1=ib.Close.iloc[-1],
               b_cum=nav.iloc[-1] - 1, b_vol=r.std() * np.sqrt(252), b_mdd=dd.min(), b_mdd_day=dd.idxmin(),
               b_peak_day=nav.loc[:dd.idxmin()].idxmax(), b_worst1=r.min(), b_worst1_day=r.idxmin(),
               b_best1=r.max(), b_best1_day=r.idxmax(), b_n=len(r))
    r20 = ib.Close.pct_change(20).dropna()
    out.update(b_worst20=r20.min(), b_worst20_day=r20.idxmin())
    mo = r.groupby(r.index.str[:7]).apply(lambda x: (1 + x).prod() - 1)
    tabs["b_month"] = mo
    out["b_mo_pos"] = int((mo > 0).sum()); out["b_mo_n"] = len(mo)
    rr = pd.DataFrame({"IBIT": r, "DIA": dia.Close.pct_change(), "IWM": iwm.Close.pct_change(),
                       "LQD": lqd.Close.pct_change()}).dropna()
    r2 = pd.DataFrame({"i": r, "d": dia.Close.pct_change()}).dropna()
    down = r2[r2.d < -0.01]
    out.update(b_down_n=len(down), b_down_mean=down.i.mean(), b_down_share=(down.i < 0).mean(), b_down_start=r2.index[0])
    tabs["b_corr_all"] = rr.corr()
    tabs["b_corr_12m"] = rr.loc["2025-09-01":].corr()
    out["b_corr_dia"] = rr.corr().loc["IBIT", "DIA"]; out["b_corr_iwm"] = rr.corr().loc["IBIT", "IWM"]
    out["b_corr_dia_12m"] = tabs["b_corr_12m"].loc["IBIT", "DIA"]
    out["b_corr_start"] = rr.index[0]
    vol60 = r.rolling(60).std() * np.sqrt(252)
    tabs["b_vol60"] = vol60.dropna()
    out.update(b_vol60_max=vol60.max(), b_vol60_max_day=vol60.idxmax(), b_vol60_min=vol60.min(),
               b_vol60_min_day=vol60.idxmin(), b_vol60_last=vol60.iloc[-1])
    out["b_dia_vol"] = rr.DIA.std() * np.sqrt(252)
    out["b_adv"] = ib.Volume.loc["2026-08-01":].mean()
    # 回撤区间：回撤超过 20% 的段
    seg, inq, start = [], False, None
    for d0, v in dd.items():
        if not inq and v < 0:
            inq, start, low, lowd = True, d0, v, d0
        elif inq:
            if v < low:
                low, lowd = v, d0
            if v == 0:
                seg.append((start, lowd, d0, low)); inq = False
    if inq:
        seg.append((start, lowd, "未修复", low))
    tabs["b_dd"] = [s for s in seg if s[3] < -0.15]
    return out, tabs


# ---------- 全球市场周报与月度风险 ----------
UNIVERSE = [("DIA", "DIA_2y", 0, "道琼斯工业指数ETF"), ("IWM", "IWM_2y", 0, "罗素2000指数ETF"),
            ("^N225", "_N225_2y", 9, "日经225指数"), ("EWY", "EWY_2y", 0, "韩国股票ETF"),
            ("EWT", "EWT_2y", 0, "台湾股票ETF"), ("INDA", "INDA_2y", 0, "印度股票ETF"),
            ("LQD", "LQD_2y", 0, "美元投资级公司债ETF"), ("^TNX", "_TNX_2y", 0, "美国10年期国债收益率（%）"),
            ("JPY=X", "JPY_X_2y", 0, "美元兑日元"), ("EURUSD=X", "EURUSD_X_2y", 0, "欧元兑美元"),
            ("BTC-USD", "BTC-USD_2y", 0, "比特币美元价格")]


def markets():
    out, tabs = {}, {}
    closes = {}
    for code, f, hrs, name in UNIVERSE:
        _, d = load(f, hrs)
        closes[code] = d.Close.loc["2025-12-01":"2026-09-30"]
    tabs["m_closes"] = closes
    fridays = pd.date_range("2026-06-26", "2026-09-25", freq="W-FRI").strftime("%Y-%m-%d")
    wk = {}
    for code, s in closes.items():
        vals = []
        for fr in fridays:
            ss = s.loc[:fr]
            vals.append((ss.index[-1], ss.iloc[-1]))
        wk[code] = vals
    tabs["m_weeks"] = (list(fridays), wk)
    # 月度风险
    mon = {}
    for code, s in closes.items():
        s = s.loc["2025-12-01":]
        rows = []
        for m in [f"2026-{i:02d}" for i in range(1, 10)]:
            prev = s.loc[:f"{m}-01"].iloc[:-1] if s.loc[:f"{m}-01"].index[-1] == f"{m}-01" else s.loc[:f"{m}-01"]
            base = prev.iloc[-1]
            ms = s[s.index.str[:7] == m]
            if code == "^TNX":
                ret = (ms.iloc[-1] - base) * 100  # 基点
                dr = ms.diff().fillna(ms.iloc[0] - base) * 100
                vol = dr.std() * np.sqrt(252)
                mdd = None
            else:
                ret = ms.iloc[-1] / base - 1
                dr = pd.concat([pd.Series([base]), ms]).pct_change().dropna()
                ann = 365 if code == "BTC-USD" else 252
                vol = dr.std() * np.sqrt(ann)
                path = pd.concat([pd.Series([base]), ms.reset_index(drop=True)])
                mdd = (path / path.cummax() - 1).min()
            rows.append((m, ms.index[-1], ms.iloc[-1], ret, vol, mdd, len(ms)))
        mon[code] = rows
    tabs["m_month"] = mon
    return out, tabs


# ---------- 数据源一致性抽检 ----------
def vendor():
    out, tabs = {}, {}
    rows = []
    for sym, f in (("AMZN.US", "AMZN_1y"), ("TSLA.US", "TSLA_1y")):
        _, a = lp(sym)
        _, b = load(f)
        for d0 in a.index:
            if d0 not in b.index:
                rows.append((d0, sym, a.close[d0], None, None, a.volume[d0], None, None, "Yahoo 缺这一天"))
                continue
            c1, c2 = a.close[d0], round(float(b.Close[d0]), 4)
            v1, v2 = int(a.volume[d0]), int(b.Volume[d0])
            rows.append((d0, sym, c1, c2, round(c2 - c1, 4) + 0.0, v1, v2, (round(v2 / v1 - 1, 4) + 0.0) if v1 else None, ""))
        extra = sorted(set(b.loc["2026-01-02":"2026-05-29"].index) - set(a.index))
        for d0 in extra:
            rows.append((d0, sym, None, round(float(b.Close[d0]), 4), None, None, int(b.Volume[d0]), None, "LongPort 缺这一天"))
    rows.sort(key=lambda r: (r[1], r[0]))
    tabs["v_rows"] = rows
    df = pd.DataFrame(rows, columns=["d", "sym", "c1", "c2", "dc", "v1", "v2", "dv", "note"])
    for sym in ("AMZN.US", "TSLA.US"):
        g = df[df.sym == sym].dropna(subset=["dc"])
        k = sym.split(".")[0]
        out[f"v_{k}_n"] = len(g)
        out[f"v_{k}_maxdc"] = g.dc.abs().max()
        out[f"v_{k}_eq"] = int((g.dc.abs() < 0.0051).sum())
        out[f"v_{k}_dv_med"] = g.dv.median()
        out[f"v_{k}_dv_max"] = g.dv.abs().max()
        out[f"v_{k}_dv_5"] = int((g.dv.abs() > 0.05).sum())
    out["v_total"] = len(rows)
    return out, tabs


def all_numbers():
    nums, tabs = {}, {}
    for f in (japan, overnight, bitcoin, markets, vendor):
        n, t = f()
        nums.update(n); tabs.update(t)
    return nums, tabs


if __name__ == "__main__":
    n, t = all_numbers()
    for k, v in n.items():
        print(k, f"{v:.4f}" if isinstance(v, float) else v)
    print(t["j_year"]); print(t["o_year_DIA"]); print(t["o_year_IWM"]); print(t["b_month"].tail(13)); print(t["b_dd"])
    print(t["b_corr_all"]); print(t["o_wd_DIA"]); print(t["o_wd_IWM"])
    fr, wk = t["m_weeks"]
    for c, v in wk.items():
        print(c, [f"{x[1]:.2f}" for x in v])
    for c, v in t["m_month"].items():
        print(c, [(r[0], f"{r[3]:.4f}", f"{r[4]:.3f}") for r in v])
