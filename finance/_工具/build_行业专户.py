#!/usr/bin/env python3
"""打包「行业轮动一号」两轮半的三道题（16 仓位核定 → 17 人民币回撤回放 → 18 预警止损规则回放）。

三道题放在一个脚本里，按顺序跑：17 读 16 的标准答案《专户11月仓位核定表.xlsx》，18 读 17 的《专户回撤回放表.xlsx》。
前一轮定稿的成果原样复制进后一轮的题目附件，后一轮从自己的附件里读。

ETF 日线、VIX、汇率都是 fetch_新题.py 通过 US Stocks MCP 查回来的。每道题留一项给在线查询：
16 是 VIX（近 5 年），17 是美元兑人民币，18 是 VIX（近 10 年）。
目标权重、目标波动率、开关门槛、20% 和 16% 两条线、两套降仓规则是按题目需要拟的。
"""
from __future__ import annotations

import csv
import math

import numpy as np
import pandas as pd
from openpyxl import load_workbook

from build_common import OUT, copy_as, fresh_dir, load_mcp_prices, source_line, write_docx, write_xlsx
from pathlib import Path

HERE = Path(__file__).resolve().parent
RAW = HERE / "新题数据"
DOC = HERE / "新题口径"
BASE, START = "2026-10-30", "2018-06-29"
ETF = {"XLK": ("科技", "Technology Select Sector SPDR"), "XLF": ("金融", "Financial Select Sector SPDR"),
       "XLV": ("医疗保健", "Health Care Select Sector SPDR"), "XLY": ("可选消费", "Consumer Discretionary Select Sector SPDR"),
       "XLP": ("必需消费", "Consumer Staples Select Sector SPDR"), "XLE": ("能源", "Energy Select Sector SPDR"),
       "XLI": ("工业", "Industrial Select Sector SPDR"), "XLB": ("原材料", "Materials Select Sector SPDR"),
       "XLU": ("公用事业", "Utilities Select Sector SPDR"), "XLRE": ("房地产", "Real Estate Select Sector SPDR"),
       "XLC": ("通信服务", "Communication Services Select Sector SPDR")}
TARGET = {"XLK": 0.30, "XLC": 0.20, "XLF": 0.20, "XLI": 0.15, "XLV": 0.15}
TVOL, CUT, CUT_AT, STEP = 0.10, 0.8, 0.75, 0.05
DD_LIMIT, RULE_LIMIT = 0.20, 0.16
RULES = [("甲", -0.08, -0.12), ("乙", -0.10, -0.15)]
WAIT, VIX_OK = 20, 25
STATE = {0: "正常", 1: "预警", 2: "止损"}

D16 = OUT / "题目" / "16_专户目标波动率仓位"
D17 = OUT / "题目" / "17_专户人民币回撤回放"
D18 = OUT / "题目" / "18_专户预警止损规则"
pc = lambda x, n=2: f"{x * 100:.{n}f}%"


def etf_prices() -> pd.DataFrame:
    px = pd.DataFrame({t: load_mcp_prices(RAW / "行业轮动" / f"{t}.json", 0)[1].Close for t in ETF})
    return px[px.index <= BASE].round(4)


def write_prices(path: Path, px: pd.DataFrame) -> int:
    n = 0
    with open(path, "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["date", "code", "adj_close"])
        for d, row in px.iterrows():
            for t, v in row.items():
                if not math.isnan(v):
                    wr.writerow([d, t, f"{v:.4f}"])
                    n += 1
    return n


def read_prices(path: Path) -> pd.DataFrame:
    a = pd.read_csv(path, dtype={"date": str, "code": str})
    return a.pivot(index="date", columns="code", values="adj_close").sort_index()


def floor_step(x: float) -> float:
    return math.floor(round(x / STEP, 9)) * STEP


# ---------------- 16 ----------------
def q16() -> None:
    att, ans = fresh_dir(D16 / "题目附件"), fresh_dir(D16 / "标准答案附件")
    (D16 / "MCP结果文件").mkdir(exist_ok=True)
    mcp = "仓位核定_MCP_VIX日线.json"
    copy_as(RAW / "行业轮动仓位" / "^VIX.json", D16 / "MCP结果文件" / mcp)
    with open(att / "仓位核定_A01_11月目标权重.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["code", "name", "sector", "target_weight"])
        for t, w in TARGET.items():
            wr.writerow([t, ETF[t][1], ETF[t][0], f"{w:.2f}"])
    px = etf_prices()
    n_rows = write_prices(att / "仓位核定_A02_行业ETF日线.csv", px[px.index >= "2025-04-01"])
    copy_as(DOC / "专户仓位" / "A03_仓位口径与交付.md", att / "仓位核定_A03_仓位口径与交付.md")
    copy_as(D16 / "MCP结果文件" / mcp, att / mcp)

    # 只用附件重算
    p = read_prices(att / "仓位核定_A02_行业ETF日线.csv")
    w = pd.read_csv(att / "仓位核定_A01_11月目标权重.csv").set_index("code").target_weight
    assert p.index[-1] == BASE and abs(w.sum() - 1) < 1e-12
    ret = p[w.index].pct_change()
    vol = {}
    for n in (60, 120):
        r = ret.tail(n)
        vol[n] = dict(first=r.index[0], last=r.index[-1], vol=float(np.sqrt(w.values @ r.cov().values @ w.values * 252)))
    use = max(vol, key=lambda n: vol[n]["vol"])
    sig = vol[use]["vol"]
    rec, v = load_mcp_prices(att / mcp, 0)
    vix = v.Close.round(2)
    win = vix[vix.index <= BASE].tail(250)
    assert win.index[-1] == BASE
    below = int((win < win.iloc[-1]).sum())
    share = below / 250
    on = share >= CUT_AT
    pos_vol = min(1.0, TVOL / sig)
    pos_sw = pos_vol * (CUT if on else 1.0)
    pos = floor_step(pos_sw)
    print(f"[16] A02 {n_rows} 行；60日 {pc(vol[60]['vol'], 4)}（{vol[60]['first']}起），120日 {pc(vol[120]['vol'], 4)}（{vol[120]['first']}起）")
    print(f"     VIX {win.iloc[-1]}，窗口 {win.index[0]}~{win.index[-1]}，低于 {below} 天 {pc(share)}，触发 {on}")
    print(f"     波动率仓位 {pc(pos_vol, 4)}，开关后 {pc(pos_sw, 4)}，核定 {pc(pos, 0)}")
    assert on and abs(pos - 0.65) < 1e-9 and pos_sw - pos > 0.01 and pos + STEP - pos_sw > 0.01
    # 错法
    p60 = min(1, TVOL / vol[60]["vol"]) * CUT
    prev = vix[vix.index < BASE].tail(250)
    print(f"     错法：只用60日 {pc(floor_step(p60), 0)}；不看开关 {pc(floor_step(pos_vol), 0)}；"
          f"VIX取前一日 {prev.iloc[-1]} 低于 {(prev < prev.iloc[-1]).sum()} 天；最新一行 {vix.iloc[-1]}（{vix.index[-1]}）"
          f" 低于 {(vix.tail(250) < vix.iloc[-1]).sum()} 天")

    v_rows = [[f"{n}日", vol[n]["first"], vol[n]["last"], n, round(vol[n]["vol"] * 100, 4), "是" if n == use else "否"] for n in (60, 120)]
    s_rows = [[BASE, float(win.iloc[-1]), win.index[0], win.index[-1], below, round(share * 100, 2), "触发" if on else "不触发"]]
    pos_rows = [["目标年化波动率(%)", TVOL * 100], ["采用的组合年化波动率(%)", round(sig * 100, 4)], ["波动率仓位(%)", round(pos_vol * 100, 4)],
                ["开关系数", CUT if on else 1.0], ["开关后仓位(%)", round(pos_sw * 100, 4)], ["核定仓位(%)", round(pos * 100, 2)]]
    h_rows = [[t, ETF[t][0], round(w[t] * 100, 2), round(w[t] * pos * 100, 2)] for t in w.index] + [["现金", "美元现金", "", round((1 - pos) * 100, 2)]]
    write_xlsx(ans / "专户11月仓位核定表.xlsx",
               [("波动率", ["窗口", "起始交易日", "截止交易日", "样本天数", "组合年化波动率(%)", "是否采用"], v_rows),
                ("风险开关", ["基准日", "VIX基准日收盘价", "窗口起始交易日", "窗口截止交易日", "低于基准日收盘价的天数", "占比(%)", "开关"], s_rows),
                ("仓位", ["项目", "数值"], pos_rows),
                ("持仓权重", ["代码", "行业", "目标权重(%)", "占净值权重(%)"], h_rows)],
               notes={"波动率": ["日收益用A02复权收盘价，样本协方差（分母 n−1），年化乘 252。两个窗口取大的。"],
                      "风险开关": [source_line(rec), f"返回 {len(v)} 行，{v.index[0]} 至 {v.index[-1]}。美股指数的 Date 日期部分就是交易日，不用换算。",
                               f"窗口 250 个交易日含基准日。{below} ÷ 250 = {pc(share)}，不低于 75%，开关触发。"],
                      "仓位": [f"波动率仓位 = 10% ÷ {pc(sig, 4)} = {pc(pos_vol, 4)}；乘 0.8 后 {pc(pos_sw, 4)}；向下取到 5% 的整数倍，核定 {pc(pos, 0)}。"],
                      "持仓权重": ["占净值权重 = 核定仓位 × 目标权重。"]})
    write_docx(ans / "专户11月仓位核定意见.docx", "行业轮动一号 2026年11月股票仓位核定意见", [
        ("结论", [f"11 月股票仓位上限核定为 {pc(pos, 0)}，其余 {pc(1 - pos, 0)} 留美元现金。"]),
        ("波动率", [f"按 11 月目标权重，60 日组合年化波动率 {pc(vol[60]['vol'])}，120 日 {pc(vol[120]['vol'])}，采用较大的 {use} 日口径。",
                 f"目标波动率 10%，波动率仓位 {pc(pos_vol)}。"]),
        ("风险开关", [f"基准日 VIX 收盘 {win.iloc[-1]:.2f}。过去 250 个交易日（{win.index[0]} 至 {win.index[-1]}）里有 {below} 天低于这个水平，占 {pc(share)}，"
                  f"不低于 75%，开关触发，仓位乘 0.8 后为 {pc(pos_sw)}，向下取整到 {pc(pos, 0)}。",
                  "VIX 通过 US Stocks MCP 查询，代码 ^VIX，查询信息见核定表「风险开关」。"]),
        ("各 ETF 占净值权重", ["、".join(f"{t}（{ETF[t][0]}）{pc(w[t] * pos)}" for t in w.index) + f"，现金 {pc(1 - pos)}。"]),
    ])


def read_q16():
    wb = load_workbook(D17 / "题目附件" / "专户11月仓位核定表.xlsx", data_only=True)
    pos = {r[0]: r[1] for r in wb["仓位"].iter_rows(min_row=2, values_only=True) if r[0] and r[1] is not None}["核定仓位(%)"] / 100
    wt = {r[0]: r[3] / 100 for r in wb["持仓权重"].iter_rows(min_row=2, values_only=True) if r and r[0] in ETF}
    assert abs(sum(wt.values()) - pos) < 1e-9
    return pos, wt


# ---------------- 17 ----------------
def london_fx(path: Path):
    rec, fx = load_mcp_prices(path, 0)
    assert set(fx.Date.str[11:13]) <= {"23", "00"}
    day = (pd.to_datetime(fx.Date.str[:19]) + pd.Timedelta(hours=1)).dt.strftime("%Y-%m-%d")
    s = pd.Series(fx.Close.round(4).values, index=day.values)
    assert not s.index.duplicated().any()
    return rec, fx, s


def replay(rp: pd.Series, f: pd.Series):
    nav = ((1 + rp) * (f / f.shift(1)).reindex(rp.index)).cumprod()
    nav = pd.concat([pd.Series([1.0], index=[START]), nav])
    dd = nav / nav.cummax() - 1
    trough = dd.idxmin()
    return nav, dd, nav[:trough].idxmax(), trough


def q17() -> None:
    att, ans = fresh_dir(D17 / "题目附件"), fresh_dir(D17 / "标准答案附件")
    (D17 / "MCP结果文件").mkdir(exist_ok=True)
    mcp = "回撤回放_MCP_美元兑人民币日线.json"
    copy_as(RAW / "行业轮动风控线" / "CNY=X.json", D17 / "MCP结果文件" / mcp)
    px = etf_prices()
    n_rows = write_prices(att / "回撤回放_A01_行业ETF日线.csv", px[px.index >= START])
    copy_as(DOC / "专户回撤" / "A02_回放口径与交付.md", att / "回撤回放_A02_回放口径与交付.md")
    copy_as(D17 / "MCP结果文件" / mcp, att / mcp)
    copy_as(D16 / "标准答案附件" / "专户11月仓位核定表.xlsx", att / "专户11月仓位核定表.xlsx")

    pos0, wt0 = read_q16()
    p = read_prices(att / "回撤回放_A01_行业ETF日线.csv")
    assert p.index[0] == START and not p[list(wt0)].isna().any().any()
    ret = p[list(wt0)].pct_change().iloc[1:]
    rec, fxraw, fx = london_fx(att / mcp)
    miss = [d for d in p.index if d not in fx.index]
    f = fx.reindex(p.index).ffill()
    assert not f.isna().any()
    tiers = []
    pos = pos0
    while True:
        k = pos / pos0
        rp = sum(ret[t] * wt0[t] * k for t in wt0)
        nav, dd, peak, trough = replay(rp, f)
        usd = (1 + rp).cumprod()
        usd_dd = float((usd / usd.cummax() - 1).min())
        ok = -dd.min() <= DD_LIMIT
        tiers.append(dict(pos=pos, dd=float(dd.min()), peak=peak, trough=trough, ok=ok, usd=usd_dd))
        if ok:
            break
        pos = round(pos - STEP, 2)
    fin = tiers[-1]
    print(f"[17] A01 {n_rows} 行，{len(ret)} 个收益日；配不到汇率 {miss}")
    for t in tiers:
        print(f"     仓位 {pc(t['pos'], 0)} 最大回撤 {pc(t['dd'])}（{t['peak']}~{t['trough']}），只看美元 {pc(t['usd'])}，{'满足' if t['ok'] else '不满足'}")
    assert abs(fin["pos"] - 0.55) < 1e-9 and DD_LIMIT + fin["dd"] > 0.005 and -tiers[-2]["dd"] - DD_LIMIT > 0.003
    assert -fin["usd"] > DD_LIMIT  # 不换算汇率会多降一档
    # 错法：汇率不换伦敦日期（23:00 那些行早一天）
    raw = pd.Series(fxraw.Close.round(4).values, index=fxraw.Date.str[:10].values)
    raw = raw[~raw.index.duplicated(keep="last")].reindex(p.index).ffill().bfill()
    e_dd = replay(rp, raw)[1].min()
    print(f"     错法：汇率按UTC日期配，{pc(fin['pos'], 0)} 档最大回撤 {pc(e_dd)}；期末净值 {nav.iloc[-1]:.6f}")

    t_rows = [[round(t["pos"] * 100, 2), round(t["dd"] * 100, 2), t["peak"], t["trough"], "满足" if t["ok"] else "不满足"] for t in tiers]
    d_rows = [[START, "", float(f[START]), 1.0, 0.0]] + [[d, round(float(rp[d]), 8), float(f[d]), round(float(nav[d]), 6), round(float(dd[d]), 6)] for d in rp.index]
    o_rows = [["回放起点", START, float(f[START])], ["基准日", BASE, float(f[BASE])]] + [["配不到汇率，沿用前一交易日", d, float(f[d])] for d in miss]
    move = "下调" if fin["pos"] < pos0 else "维持"
    write_xlsx(ans / "专户回撤回放表.xlsx",
               [("仓位档位", ["仓位(%)", "最大回撤(%)", "峰值日", "谷值日", "是否满足"], t_rows),
                ("逐日回放", ["交易日", "组合美元日收益", "美元兑人民币", "人民币净值", "回撤"], d_rows),
                ("在线数据", ["项目", "美股交易日", "美元兑人民币"], o_rows)],
               notes={"仓位档位": [f"核定仓位 {pc(pos0, 0)}，最大回撤超过 20%，每次下调 5 个百分点，到 {pc(fin['pos'], 0)} 时满足。",
                               f"{pc(fin['pos'], 0)} 档只看美元净值的最大回撤是 {pc(fin['usd'])}。"],
                      "在线数据": [source_line(rec), f"返回 {len(fxraw)} 行。Date 是伦敦时间零点：英国夏令时期间写成前一天 23:00，其余写成当天 00:00，加 1 小时后取日期。",
                               f"{len(miss)} 个美股交易日配不到汇率，沿用前一个美股交易日。"]})
    write_docx(ans / "专户回撤回放意见.docx", "行业轮动一号 人民币净值回撤回放意见", [
        ("结论", [f"股票仓位由核定的 {pc(pos0, 0)} {move}至 {pc(fin['pos'], 0)}。"]),
        ("各档回放", [f"仓位 {pc(t['pos'], 0)}：人民币净值最大回撤 {pc(t['dd'])}，峰值 {t['peak']}，谷值 {t['trough']}，{'不超过' if t['ok'] else '超过'} 20%。" for t in tiers]),
        ("汇率的影响", [f"{pc(fin['pos'], 0)} 档只看美元净值，最大回撤 {pc(fin['usd'])}；折成人民币后是 {pc(fin['dd'])}。"
                   "2020 年 2 月至 3 月美股下跌期间美元兑人民币走高，抵掉了一部分跌幅。",
                   "汇率通过 US Stocks MCP 查询，代码 CNY=X。时间戳是伦敦时间零点，换成伦敦当地日期后再和美股交易日配对。"]),
        ("调整后的持仓权重", ["、".join(f"{t} {pc(wt0[t] * fin['pos'] / pos0)}" for t in wt0) + f"，现金 {pc(1 - fin['pos'])}。"]),
    ])


# ---------------- 18 ----------------
def run_rule(r: pd.Series, f: pd.Series, vix: pd.Series, warn: float | None, stop: float | None):
    nav, peak, state, since = 1.0, 1.0, 0, 0
    k = {0: 1.0, 1: 0.5, 2: 0.0}
    navs, ev = [1.0], []
    days = list(r.index)
    prev = START
    for d in days:
        nav *= (1 + k[state] * r[d]) * f[d] / f[prev]
        prev = d
        navs.append(nav)
        peak = max(peak, nav)
        dd = nav / peak - 1
        if warn is None:
            continue
        if state > 0:
            since += 1
        new = state
        if state == 0 and dd <= warn:
            new = 1
        if state <= 1 and dd <= stop:
            new = 2
        if new == state and state > 0 and since >= WAIT and vix[d] < VIX_OK:
            new = 0
            peak = nav
        if new != state:
            ev.append([d, STATE[state], STATE[new], round(dd, 6), float(vix[d])])
            state, since = new, 0
    s = pd.Series(navs, index=[START] + days)
    return s, ev


def rule_dd(s: pd.Series, ev: list):
    """最大回撤按净值序列本身的历史高点算（不随恢复重置），和「方案对比」的口径一致。"""
    dd = s / s.cummax() - 1
    t = dd.idxmin()
    return float(dd.min()), s[:t].idxmax(), t


def q18() -> None:
    att, ans = fresh_dir(D18 / "题目附件"), fresh_dir(D18 / "标准答案附件")
    (D18 / "MCP结果文件").mkdir(exist_ok=True)
    mcp = "风控规则_MCP_VIX日线.json"
    copy_as(RAW / "行业轮动风控规则" / "^VIX.json", D18 / "MCP结果文件" / mcp)
    with open(att / "风控规则_A01_候选规则.csv", "w", newline="", encoding="utf-8") as fo:
        wr = csv.writer(fo)
        wr.writerow(["方案", "预警回撤", "止损回撤", "预警仓位系数", "止损仓位系数", "最短观察交易日", "恢复时VIX须低于"])
        for name, a, b in RULES:
            wr.writerow([name, f"{a * 100:.0f}%", f"{b * 100:.0f}%", 0.5, 0, WAIT, VIX_OK])
    copy_as(DOC / "专户规则" / "A02_规则回放口径与交付.md", att / "风控规则_A02_规则回放口径与交付.md")
    copy_as(D18 / "MCP结果文件" / mcp, att / mcp)
    copy_as(D17 / "标准答案附件" / "专户回撤回放表.xlsx", att / "专户回撤回放表.xlsx")

    wb = load_workbook(att / "专户回撤回放表.xlsx", data_only=True)
    rows = [r for r in wb["逐日回放"].iter_rows(min_row=2, values_only=True) if r and isinstance(r[0], str) and r[0][:2] == "20"]
    assert rows[0][0] == START and rows[-1][0] == BASE
    f = pd.Series({r[0]: r[2] for r in rows})
    r = pd.Series({x[0]: x[1] for x in rows[1:]}).astype(float)
    rec, v = load_mcp_prices(att / mcp, 0)
    vix = v.Close.round(2)
    assert not vix.reindex(r.index).isna().any()
    n = len(r)
    out = {}
    for name, a, b in [("不设规则", None, None)] + RULES:
        s, ev = run_rule(r, f, vix, a, b)
        dd, peak, trough = rule_dd(s, ev)
        out[name] = dict(s=s, ev=ev, dd=dd, peak=peak, trough=trough, end=float(s.iloc[-1]), ann=float(s.iloc[-1] ** (252 / n) - 1))
    ok = {k: -out[k]["dd"] <= RULE_LIMIT for k, _, _ in RULES}
    cands = [k for k in ok if ok[k]]
    pick = max(cands, key=lambda k: out[k]["ann"]) if cands else None
    verdict = f"采用方案{pick}" if pick else "两套都不采用"
    print(f"[18] {n} 个收益日")
    for k, o in out.items():
        print(f"     {k}：最大回撤 {pc(o['dd'])}（{o['peak']}~{o['trough']}），期末 {o['end']:.6f}，年化 {pc(o['ann'])}，切换 {len(o['ev'])} 次")
        for e in o["ev"]:
            print("        ", e)
    print("     结论", verdict)
    assert pick == "乙" and all(ok.values()) and RULE_LIMIT + out["乙"]["dd"] > 0.01 and out["乙"]["ann"] - out["甲"]["ann"] > 0.005
    # 错法：恢复不看 VIX
    hi = pd.Series(0.0, index=vix.index)
    for name, a, b in RULES:
        s, ev = run_rule(r, f, hi, a, b)
        print(f"     错法（恢复不看VIX）方案{name}：最大回撤 {pc(rule_dd(s, ev)[0])}，年化 {pc(s.iloc[-1] ** (252 / n) - 1)}，切换 {len(ev)} 次")

    c_rows = [[("方案" + k) if k != "不设规则" else k, round(o["dd"] * 100, 2), o["peak"], o["trough"], round(o["end"], 6), round(o["ann"] * 100, 2), len(o["ev"]),
               "" if k == "不设规则" else ("可用" if ok[k] else "不可用"), "" if k == "不设规则" else ("选定" if k == pick else "否")] for k, o in out.items()]
    e_rows = [["方案" + k] + e[:3] + [round(e[3] * 100, 2), e[4]] for k, _, _ in RULES for e in out[k]["ev"]]
    back = sorted({e[0] for k, _, _ in RULES for e in out[k]["ev"] if e[2] == "正常"})
    o_rows = [["回放首日", r.index[0], float(vix[r.index[0]])], ["回放末日", BASE, float(vix[BASE])]] + [["恢复正常当天", d, float(vix[d])] for d in back]
    lose = {k: out["不设规则"]["ann"] - out[k]["ann"] for k, _, _ in RULES}
    write_xlsx(ans / "专户风控规则回放表.xlsx",
               [("方案对比", ["方案", "最大回撤(%)", "峰值日", "谷值日", "期末净值", "年化收益(%)", "状态切换次数", "是否可用", "是否选定"], c_rows),
                ("状态切换记录", ["方案", "交易日", "切换前状态", "切换后状态", "当日回撤(%)", "当日VIX收盘价"], e_rows),
                ("在线数据", ["项目", "交易日", "VIX收盘价"], o_rows)],
               notes={"方案对比": [f"回放 {START} 至 {BASE}，{n} 个交易日。最大回撤按净值序列自己的历史高点算。", f"两套都不超过 16%，选年化收益高的。结论：{verdict}。"],
                      "状态切换记录": ["当日回撤是切换判断用的回撤，恢复正常后高点重置为当日净值。切换从下一个交易日起生效。"],
                      "在线数据": [source_line(rec), f"返回 {len(v)} 行，{v.index[0]} 至 {v.index[-1]}。美股指数的 Date 日期部分就是交易日。收盘价保留两位小数。"]})
    desc = lambda k: "；".join(f"{e[0]} {e[1]}转{e[2]}" for e in out[k]["ev"])
    write_docx(ans / "专户风控规则选定意见.docx", "行业轮动一号 预警止损规则选定意见", [
        ("结论", [f"{verdict}：回撤达到 10% 仓位减半，达到 15% 清仓。"] if pick == "乙" else [verdict + "。"]),
        ("两套规则的回放结果", [f"方案{k}：最大回撤 {pc(out[k]['dd'])}（{out[k]['peak']} 至 {out[k]['trough']}），年化收益 {pc(out[k]['ann'])}，"
                        f"比不设规则少 {lose[k] * 100:.2f} 个百分点，状态切换 {len(out[k]['ev'])} 次。" for k, _, _ in RULES]
         + [f"不设规则：最大回撤 {pc(out['不设规则']['dd'])}，年化收益 {pc(out['不设规则']['ann'])}。"]),
        ("历史上的触发", [f"方案{k}：{desc(k)}。" for k, _, _ in RULES]),
        ("在线数据", ["恢复条件里的 VIX 通过 US Stocks MCP 查询，代码 ^VIX，覆盖 2018-07-02 至 2026-10-30。恢复正常当天的 VIX 收盘价见回放表「在线数据」。"]),
    ])


if __name__ == "__main__":
    q16()
    q17()
    q18()
