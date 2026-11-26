#!/usr/bin/env python3
"""打包「行业轮动一号」的三道题（16 仓位核定 → 17 人民币回撤回放 → 18 11月调仓与换汇）。

17 读 16 的标准答案《专户11月仓位核定表.xlsx》，18 只读 17 的结论《专户回撤回放意见.docx》（最终仓位和五只 ETF 的权重）。
2026-11-26 最终质检返修：后一轮的题目附件不再放前一轮的标答，模型用自己上一轮做的成果；
本脚本的标答仍直接读前一轮 `标准答案附件/` 里正确的结果。17、18 另外复制 `_工具/补充材料/17|18/` 里的背景、历史和版本材料，
并检查这些材料里没有出现本题的答案数字。16 默认不重跑；要重跑写 `python3 build_行业专户.py 16 17 18`。

ETF 日线、VIX、汇率都是 fetch_新题.py 通过 US Stocks MCP 查回来的。每道题留一项给在线查询：
16 是 VIX（近 5 年），17 是美元兑人民币，18 是 7 只 ETF 近 3 个月的日线（11-02 收盘价和成交量）。
目标权重、目标波动率、开关门槛、20% 回撤上限、18 的持仓、申购款、购汇价、容忍带和成交上限是按题目需要拟的。
"""
from __future__ import annotations

import csv
import math

import numpy as np
import pandas as pd
from openpyxl import load_workbook

from build_common import OUT, copy_as, copy_materials, fresh_dir, load_mcp_prices, source_line, text_width, write_docx, write_xlsx
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
DD_LIMIT = 0.20

D16 = OUT / "题目" / "16_专户目标波动率仓位"
D17 = OUT / "题目" / "17_专户人民币回撤回放"
D18 = OUT / "题目" / "18_专户调仓与换汇"
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


def check_visible(path: Path, cells: dict[str, list[str]]) -> None:
    """核对指定单元格在正常列宽下能看全：不合并的单元格要么列宽够，要么自动换行且行高够；
    合并的说明行要自动换行，行高按合并区的总列宽够放下全部文字。2026-11-26 质检点名 16 的这几格。"""
    from openpyxl.utils import column_index_from_string, get_column_letter
    wb = load_workbook(path)
    for sheet, refs in cells.items():
        ws = wb[sheet]
        merged = {r.coord.split(":")[0]: r for r in ws.merged_cells.ranges}
        for ref in refs:
            c = ws[ref]
            need = text_width(c.value)
            if ref in merged:
                rg = merged[ref]
                width = sum(ws.column_dimensions[get_column_letter(i)].width or 8.43 for i in range(rg.min_col, rg.max_col + 1))
            else:
                width = ws.column_dimensions[get_column_letter(column_index_from_string(c.column_letter))].width or 8.43
            lines = math.ceil(need / max(width - 1, 1))
            height = ws.row_dimensions[c.row].height or 15.0
            ok = need <= width - 1 or (c.alignment.wrap_text and height >= 15.0 * lines)
            assert ok, (sheet, ref, need, width, height)
            print(f"     {sheet}!{ref} 文字宽 {need}，可用宽 {width:.0f}，{lines} 行，行高 {height:.0f}：能看全")


def material_text(path: Path) -> str:
    """补充材料的全部文字，用来查有没有写出本题答案。"""
    if path.suffix == ".xlsx":
        wb = load_workbook(path, data_only=True)
        return "\n".join(str(v) for ws in wb for row in ws.iter_rows(values_only=True) for v in row if v is not None)
    if path.suffix == ".docx":
        from docx import Document
        return "\n".join(p.text for p in Document(path).paragraphs)
    return path.read_text(encoding="utf-8-sig")


def check_no_leak(att: Path, names: list[str], banned: list[str]) -> None:
    import re
    for n in names:
        text = material_text(att / n)
        for b in banned:
            hit = re.search(rf"(?<![\d.,]){re.escape(b)}(?!\d)", text)
            assert not hit, (n, b, text[max(0, hit.start() - 30):hit.end() + 30])
    print(f"     补充材料 {len(names)} 份，没有出现 {len(banned)} 个答案数字")


def num_forms(x: float, nd: int = 2) -> list[str]:
    """一个数在材料里可能的写法：带千分位和不带千分位。"""
    return list(dict.fromkeys([f"{x:,.{nd}f}", f"{x:.{nd}f}"]))


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
                  "VIX 日线通过 US Stocks MCP 查询（数据来自 Yahoo Finance，2026-11-18 查询），代码 ^VIX，数据说明见核定表「风险开关」。"]),
        ("各 ETF 占净值权重", ["、".join(f"{t}（{ETF[t][0]}）{pc(w[t] * pos)}" for t in w.index) + f"，现金 {pc(1 - pos)}。"]),
    ])
    check_visible(ans / "专户11月仓位核定表.xlsx", {"仓位": ["A2", "A3", "A9"], "风险开关": ["A4"]})


def read_q16():
    """17 的标答按正确的第一轮结果算：直接读 16 的标准答案附件。"""
    wb = load_workbook(D16 / "标准答案附件" / "专户11月仓位核定表.xlsx", data_only=True)
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
    extra = copy_materials("17", att)  # 第一轮的核定表不再放进来，模型用自己上一轮做的

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
    # 补充材料不能写出本题和上一轮的答案：各档回撤、峰谷日、配不到汇率的日子、最终仓位，以及 16 的核定仓位和权重
    banned = [pc(t["dd"])[1:] for t in tiers] + [pc(-fin["usd"])] + [tiers[0]["peak"], tiers[0]["trough"]] + miss
    banned += [pc(fin["pos"], 0), pc(pos0, 0), f"{nav.iloc[-1]:.6f}", f"{f[START]:.4f}", f"{f[BASE]:.4f}"]
    banned += [pc(v) for v in wt0.values()] + [pc(wt0[t] * fin["pos"] / pos0) for t in wt0]
    check_no_leak(att, extra, list(dict.fromkeys(banned)))
    assert len(list(att.iterdir())) == 3 + len(extra) and not (att / "专户11月仓位核定表.xlsx").exists()

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
EXE, DAY1, DAY2 = "2026-11-02", "2026-11-03", "2026-11-04"
HOLD18 = {"XLK": 482000, "XLF": 950000, "XLI": 215000, "XLV": 184000, "XLY": 213000, "XLE": 312000}
USD0, SUB_CNY, SELL_FX = 119650000.00, 300000000.00, 6.6820
BAND, PART, COMM, COMM_MIN = 0.0025, 0.05, 0.005, 1.00
ETF18 = ["XLK", "XLC", "XLF", "XLI", "XLV", "XLY", "XLE"]
r2 = lambda x: round(x + 1e-9, 2)
usd = lambda x: f"{x:,.2f}"


def read_q17_weights(path: Path):
    """从回放意见「调整后的持仓权重」那一段读最终仓位下五只 ETF 的占净值权重。"""
    import re
    from docx import Document
    doc = Document(path)
    paras = [p.text for p in doc.paragraphs]
    i = paras.index("调整后的持仓权重")
    text = paras[i + 1]
    wt = {t: float(v) / 100 for t, v in re.findall(r"(XL[A-Z]+) ([\d.]+)%", text)}
    cash = float(re.search(r"现金 ([\d.]+)%", text).group(1)) / 100
    assert abs(sum(wt.values()) + cash - 1) < 1e-9
    return wt


def q18() -> None:
    att, ans = fresh_dir(D18 / "题目附件"), fresh_dir(D18 / "标准答案附件")
    fresh_dir(D18 / "MCP结果文件")
    mcps = {}
    for t in ETF18:
        fn = f"调仓_MCP_{t}日线.json"
        copy_as(RAW / "行业轮动调仓" / f"{t}.json", D18 / "MCP结果文件" / fn)
        copy_as(D18 / "MCP结果文件" / fn, att / fn)
        mcps[t] = fn
    extra = copy_materials("18", att)  # 第二轮的回放意见不再放进来，模型用自己上一轮做的
    with open(att / "调仓_A01_11月2日持仓与资金.csv", "w", newline="", encoding="utf-8") as fo:
        wr = csv.writer(fo)
        wr.writerow(["项目", "代码", "名称", "数量", "金额", "币种", "说明"])
        for t, q in HOLD18.items():
            wr.writerow(["ETF持仓", t, ETF[t][1], q, "", "USD", "2026-11-02日终持股数(股)"])
        wr.writerow(["美元现金", "", "", "", f"{USD0:.2f}", "USD", "托管账户美元活期，2026-11-02日终"])
        wr.writerow(["申购款", "", "", "", f"{SUB_CNY:.2f}", "CNY", "2026-11-02到账，托管行2026-11-03购汇"])
        wr.writerow(["购汇测算价", "", "", "", f"{SELL_FX:.4f}", "CNY/USD", "托管行2026-11-02公布的美元现汇卖出价，1美元合人民币"])
    copy_as(DOC / "专户调仓" / "A02_调仓口径与交付.md", att / "调仓_A02_调仓口径与交付.md")

    # ---- 只用附件重算 ----
    wt = read_q17_weights(D17 / "标准答案附件" / "专户回撤回放意见.docx")  # 按正确的第二轮结果算
    a01 = pd.read_csv(att / "调仓_A01_11月2日持仓与资金.csv", dtype={"代码": str})
    hold = {r["代码"]: int(r["数量"]) for _, r in a01[a01["项目"] == "ETF持仓"].iterrows()}
    cash0 = float(a01[a01["项目"] == "美元现金"]["金额"].iloc[0])
    sub = float(a01[a01["项目"] == "申购款"]["金额"].iloc[0])
    fx = float(a01[a01["项目"] == "购汇测算价"]["金额"].iloc[0])
    names = list(dict.fromkeys(list(hold) + list(wt)))
    names = [t for t in ETF18 if t in names]
    recs, px, adv, win = {}, {}, {}, {}
    for t in names:
        rec, m = load_mcp_prices(att / mcps[t], 0)
        recs[t] = (rec, m)
        px[t] = round(float(m.Close[EXE]), 2)
        w20 = m[m.index <= EXE].tail(20)
        assert w20.index[-1] == EXE and len(w20) == 20
        adv[t] = float(w20.Volume.mean())
        win[t] = (w20.index[0], w20.index[-1])
        assert float(m.Dividends.loc[EXE:].abs().sum()) == 0
    sub_usd = r2(sub / fx)
    mv0 = {t: r2(hold.get(t, 0) * px[t]) for t in names}
    nav = r2(sum(mv0.values()) + cash0 + sub_usd)
    cap = {t: math.floor(adv[t] * PART) for t in names}
    rows = []
    for t in names:
        cw = mv0[t] / nav
        tw = wt.get(t, 0.0)
        tgt = math.floor(nav * tw / px[t]) if tw else 0
        keep = tw > 0 and abs(cw - tw) <= BAND + 1e-12
        new = hold.get(t, 0) if keep else tgt
        rows.append(dict(t=t, held=hold.get(t, 0), cw=cw, tw=tw, tgt=tgt, keep=keep, new=new, dq=new - hold.get(t, 0)))
    orders = []
    for r in rows:
        q = abs(r["dq"])
        if not q:
            continue
        side = "买入" if r["dq"] > 0 else "卖出"
        for day in (DAY1, DAY2):
            n = min(q, cap[r["t"]])
            if n <= 0:
                break
            lim = math.ceil(round(px[r["t"]] * 1.005 * 100, 6)) / 100 if side == "买入" else math.floor(round(px[r["t"]] * 0.995 * 100, 6)) / 100
            amt = r2(n * px[r["t"]])
            orders.append(dict(day=day, t=r["t"], side=side, q=n, lim=lim, amt=amt, comm=max(COMM_MIN, r2(n * COMM)), cap=cap[r["t"]]))
            q -= n
        assert q == 0
    sells = r2(sum(o["amt"] for o in orders if o["side"] == "卖出"))
    buys = r2(sum(o["amt"] for o in orders if o["side"] == "买入"))
    comm = r2(sum(o["comm"] for o in orders))
    cash1 = r2(cash0 + sub_usd + sells - buys - comm)
    mv1 = {r["t"]: r2(r["new"] * px[r["t"]]) for r in rows}
    nav1 = r2(sum(mv1.values()) + cash1)
    assert cash1 > 0 and abs(nav1 - (nav - comm)) < 0.011
    split = [o for o in orders if o["day"] == DAY2]

    print(f"[18] 申购折美元 {sub_usd}，净值 {nav}，测算价 {px}")
    for r in rows:
        print(f"     {r['t']} 现 {r['held']} {pc(r['cw'], 3)} 目标 {pc(r['tw'])} 目标股数 {r['tgt']} 容忍带 {r['keep']} 调后 {r['new']} 变动 {r['dq']} 上限 {cap[r['t']]}")
    for o in orders:
        print("     ", o)
    print(f"     卖 {sells} 买 {buys} 佣金 {comm} 调后现金 {cash1} 调后净值 {nav1}")
    # 题目要成立：XLV 在容忍带内但不贴边；XLI 在带外；XLC 要分两天；不加申购款时 XLV 落到带外
    kv = {r["t"]: r for r in rows}
    assert kv["XLV"]["keep"] and BAND - abs(kv["XLV"]["cw"] - kv["XLV"]["tw"]) > 0.0005
    assert not kv["XLI"]["keep"] and abs(kv["XLI"]["cw"] - kv["XLI"]["tw"]) - BAND > 0.001
    assert [o["t"] for o in split] == ["XLC"]
    nav_nosub = nav - sub_usd
    assert abs(mv0["XLV"] / nav_nosub - wt["XLV"]) > BAND
    print(f"     错法：不加申购款 XLV 现权重 {pc(mv0['XLV'] / nav_nosub, 3)}；按 65% 仓位 XLC 目标 {math.floor(nav * 0.13 / px['XLC'])} 股")
    # 补充材料不能写出本题的下单股数、限价、换汇金额、测算价、日均量和资金结果，也不能写出上一轮的占净值权重
    banned = [f"{v:,}" for r in rows for v in (r["tgt"], abs(r["dq"])) if v] + [str(abs(r["dq"])) for r in rows if r["dq"]]
    banned += [f"{o['q']:,}" for o in orders] + [str(o["q"]) for o in orders] + [f"{o['lim']:.2f}" for o in orders]
    banned += [f"{px[t]:.2f}" for t in names] + [f"{math.floor(adv[t]):,}" for t in names] + [f"{cap[t]:,}" for t in names]
    for x in (sub_usd, nav, sells, buys, comm, cash1, nav1, r2(sum(mv0.values()))):
        banned += num_forms(x)
    banned += [pc(v) for v in wt.values()] + [pc(1 - sum(wt.values()))]
    given = {f"{v:,}" for v in hold.values()} | {str(v) for v in hold.values()}  # 清仓股数就是 A01 的持股数，不算泄露
    check_no_leak(att, extra, [x for x in dict.fromkeys(banned) if x not in given])
    assert len(list(att.iterdir())) == 2 + len(mcps) + len(extra) and not (att / "专户回撤回放意见.docx").exists()

    t_rows = [[r["t"], ETF[r["t"]][0], r["held"], px[r["t"]], mv0[r["t"]], round(r["cw"] * 100, 2), round(r["tw"] * 100, 2), r["tgt"],
               ("是" if r["keep"] else "否") if r["tw"] else "不在名单，清仓", r["new"], round(mv1[r["t"]] / nav1 * 100, 2)] for r in rows]
    t_rows.append(["美元现金", "", "", "", r2(cash0 + sub_usd), round((cash0 + sub_usd) / nav * 100, 2), round((1 - sum(wt.values())) * 100, 2), "", "", "",
                   round(cash1 / nav1 * 100, 2)])
    o_rows = [[o["day"], o["t"], o["side"], o["q"], o["lim"], o["amt"], o["comm"], o["cap"]] for o in orders]
    f_rows = [["人民币申购款（元）", sub], ["购汇测算价（1美元合人民币）", fx], ["申购款折算美元", sub_usd],
              ["ETF持仓市值（按测算价）", r2(sum(mv0.values()))], ["美元现金", cash0], ["调仓用的净值", nav],
              ["预计卖出金额合计", sells], ["预计买入金额合计", buys], ["佣金合计", comm], ["调仓后美元现金", cash1], ["调仓后净值", nav1]]
    n_rows = [[t, ETF[t][0], px[t], str(recs[t][1].Date[EXE]), round(adv[t], 2), win[t][0], win[t][1], cap[t]] for t in names]
    write_xlsx(ans / "专户11月调仓指令表.xlsx",
               [("目标持仓", ["代码", "行业", "现持股数(股)", "测算价(美元)", "现市值(美元)", "现占净值权重(%)", "目标权重(%)", "目标股数(股)", "是否在容忍带内",
                          "调仓后持股数(股)", "调仓后占净值权重(%)"], t_rows),
                ("下单指令", ["执行日", "代码", "方向", "股数", "限价(美元)", "预计成交金额(美元)", "佣金(美元)", "当日上限(股)"], o_rows),
                ("资金测算", ["项目", "金额"], f_rows),
                ("在线数据", ["代码", "行业", "11-02收盘价(美元，保留2位)", "返回的Date(UTC)", "20日日均成交量(股)", "窗口起始日", "窗口截止日", "单日上限(股)"], n_rows)],
               notes={"目标持仓": [f"目标权重取自回放意见：股票仓位 {pc(sum(wt.values()), 0)}。目标股数 = {usd(nav)} × 目标权重 ÷ 测算价，向下取整。",
                               "现占净值权重和目标权重相差不超过 0.25 个百分点的不调；不在 11 月名单里的全部卖出。"],
                      "下单指令": [f"单日上限 = 20 日日均成交量 × 5%，向下取整。XLC 需要买入 {kv['XLC']['dq']:,} 股，超过上限，11-03 做 {cap['XLC']:,} 股，其余 {split[0]['q']:,} 股 11-04 做。",
                               "限价：买入按测算价 × 1.005 向上取到 0.01，卖出按测算价 × 0.995 向下取到 0.01。佣金每股 0.005 美元，每条不低于 1 美元。"],
                      "资金测算": [f"申购款 {usd(sub)} 元 ÷ {fx:.4f} = {usd(sub_usd)} 美元。"],
                      "在线数据": [source_line(recs[t][0]) for t in names] + ["美股的 Date 是美东零点换成的 UTC 时间，日期部分就是交易日；11-01 起美东换成冬令时，Date 从 04:00 变成 05:00。"]})
    sells_txt = "；".join(f"{o['t']} {o['q']:,} 股" for o in orders if o["side"] == "卖出")
    buys_txt = "；".join(f"{r['t']} {r['dq']:,} 股（" + "，".join(f"{o['day'][5:]} 买 {o['q']:,} 股" for o in orders if o["t"] == r["t"]) + "）"
                         for r in rows if r["dq"] > 0)
    write_docx(ans / "专户11月调仓方案.docx", "行业轮动一号 11月调仓与换汇方案", [
        ("结论", [f"按 11-02 收盘价测算，调仓用的净值 {usd(nav)} 美元。11-03 卖出 {sells_txt}；买入 {buys_txt}。XLV 在容忍带内，不调。",
                f"调仓后股票仓位 {pc(sum(mv1.values()) / nav1)}，美元现金 {usd(cash1)} 美元，占 {pc(cash1 / nav1)}。"]),
        ("申购款购汇", [f"11-02 到账申购款 {usd(sub)} 元，按托管行 11-02 美元现汇卖出价 {fx:.4f} 折算 {usd(sub_usd)} 美元，由托管行 11-03 购汇。实际购汇价不同的，差额留在现金里。"]),
        ("目标持仓", [f"股票仓位和权重按回放意见：" + "、".join(f"{t} {pc(wt[t])}" for t in wt) + "。"]
         + [f"{r['t']}：现持 {r['held']:,} 股，占 {pc(r['cw'])}，" + (f"目标 {pc(r['tw'])}，目标股数 {r['tgt']:,}，" if r["tw"] else "不在 11 月名单，")
            + ("相差不超过 0.25 个百分点，不调。" if r["keep"] else (f"调到 {r['new']:,} 股。" if r["tw"] else "全部卖出。")) for r in rows]),
        ("分两天执行", [f"XLC 近 20 个交易日（{win['XLC'][0]} 至 {win['XLC'][1]}）日均成交 {adv['XLC']:,.0f} 股，单日上限 {cap['XLC']:,} 股。"
                    f"要买 {kv['XLC']['dq']:,} 股，11-03 买 {cap['XLC']:,} 股，11-04 买 {split[0]['q']:,} 股。其余指令都在当日上限以内，11-03 一天做完。"]),
        ("资金", [f"卖出预计 {usd(sells)} 美元，买入预计 {usd(buys)} 美元，佣金 {usd(comm)} 美元。调仓后美元现金 {usd(cash1)} 美元，调仓后净值 {usd(nav1)} 美元。",
                "调仓后权重：" + "、".join(f"{t} {pc(mv1[t] / nav1)}" for t in wt) + f"，现金 {pc(cash1 / nav1)}。"]),
        ("数据", ["11-02 收盘价和成交量通过 US Stocks MCP 查询 7 只 ETF 近 3 个月的日线，收盘价保留两位小数，日均成交量取 11-02 往前 20 个交易日。"]),
    ])


if __name__ == "__main__":
    import sys
    todo = sys.argv[1:] or ["17", "18"]
    for n in ("16", "17", "18"):
        if n in todo:
            globals()[f"q{n}"]()
