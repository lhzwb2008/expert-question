#!/usr/bin/env python3
"""打包「中概互联精选」ADR 回港转换的两道题（22 体检分组 → 23 11-02 执行方案）。
23 作答时用模型自己在 22 完成的《ADR回港转换体检表.xlsx》「转换分组」。2026-11-26 最终质检返修后，22 的标答不再放进 23 的题目附件；
23 的标准答案直接读 22 的标准答案附件（同一次运行里先生成），并和 22 的计算结果逐只核对，也就是按正确的前轮结果计算。
23 另有 _工具/补充材料/23/ 下的 B 系列背景、历史和版本材料（xlsx、docx、csv 由同目录的 生成补充材料.py 生成，md 手写），打包时原样复制。
ADR、H 股不复权日线和每手股数是 fetch_longport.py 拉的内部快照；汇率和 11-02 收盘价是 fetch_新题.py 通过 US Stocks MCP 查的。
持仓、主数据里的比率、存托协议摘要的整理格式、分组门槛和费用是按题目需要拟的。
"""
from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import pandas as pd
from openpyxl import load_workbook

from build_common import OUT, copy_as, copy_materials, fresh_dir, load_mcp, load_mcp_prices, source_line, write_docx, write_xlsx

HERE = Path(__file__).resolve().parent
RAW = HERE / "新题数据"
LP = RAW / "双重上市_longport"
DOC = HERE / "新题口径"
D22 = OUT / "题目" / "22_ADR持仓回港转换体检"
D23 = OUT / "题目" / "23_ADR回港转换执行方案"
BASE, EXE = "2026-10-30", "2026-11-02"
# ADR, 公司, H股代码, 持有 ADS, 主数据比率, 现行比率
HOLD = [("BABA", "阿里巴巴集团", "9988", 401237, 8, 8), ("JD", "京东集团", "9618", 600000, 2, 2), ("BIDU", "百度集团", "9888", 200333, 8, 8),
        ("NTES", "网易", "9999", 350050, 5, 5), ("TCOM", "携程集团", "9961", 300000, 1, 1), ("BILI", "哔哩哔哩", "9626", 500013, 1, 1),
        ("ZTO", "中通快递", "2057", 500075, 1, 1), ("LI", "理想汽车", "2015", 1400060, 1, 2), ("EDU", "新东方", "9901", 100000, 1, 10),
        ("YUMC", "百胜中国", "9987", 600000, 1, 1)]
N_DAYS, PART, BAD = 60, 0.20, 0.03

pc = lambda x: f"{x * 100:.2f}%"
w2 = lambda x: f"{x:,.2f}"
r2 = lambda x: round(x + 1e-9, 2)


def lp(sym):
    d = pd.DataFrame(json.load(open(LP / f"{sym}_noadj.json", encoding="utf-8")))
    return d.set_index("date")


def fx_series(path: Path):
    rec, text = load_mcp(path)
    d = pd.DataFrame(json.loads(text))
    d["bj"] = (pd.to_datetime(d.Date.str[:19]) + pd.Timedelta(hours=8)).dt.strftime("%Y-%m-%d")
    d["raw"] = d.Date.str[:10]
    assert not d.bj.duplicated().any()
    return rec, d


# ---------------- 22 ----------------
def q22():
    att, ans = fresh_dir(D22 / "题目附件"), fresh_dir(D22 / "标准答案附件")
    (D22 / "MCP结果文件").mkdir(exist_ok=True)
    mcp = "体检_MCP_美元兑港元汇率.json"
    copy_as(RAW / "ADR体检" / "HKD=X.json", D22 / "MCP结果文件" / mcp)
    copy_as(D22 / "MCP结果文件" / mcp, att / mcp)
    info = {i["symbol"]: i for i in json.load(open(LP / "static_info.json", encoding="utf-8"))}
    with open(att / "体检_A01_ADR持仓与证券主数据.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["ADR代码", "公司", "持有ADS数(份)", "主数据ADS比率(1ADS=股)", "H股代码", "港股简称", "H股每手股数"])
        for h in HOLD:
            i = info[f"{h[2]}.HK"]
            wr.writerow([h[0], h[1], h[3], h[4], h[2], i["name_cn"], i["lot_size"]])
    copy_as(DOC / "ADR体检" / "A02_存托协议摘要.md", att / "体检_A02_存托协议摘要.md")
    with open(att / "体检_A03_ADR日线.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["date", "adr", "open", "high", "low", "close", "volume", "turnover_usd"])
        for h in HOLD:
            for d, r in lp(f"{h[0]}.US").iterrows():
                wr.writerow([d, h[0], r.open, r.high, r.low, r.close, r.volume, r.turnover])
    with open(att / "体检_A04_H股日线.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["date", "code", "open", "high", "low", "close", "volume", "turnover_hkd"])
        for h in HOLD:
            for d, r in lp(f"{h[2]}.HK").iterrows():
                wr.writerow([d, h[2], r.open, r.high, r.low, r.close, r.volume, r.turnover])
    copy_as(DOC / "ADR体检" / "A05_体检口径与交付.md", att / "体检_A05_体检口径与交付.md")

    # ---- 只用附件重算 ----
    a01 = pd.read_csv(att / "体检_A01_ADR持仓与证券主数据.csv", dtype={"H股代码": str})
    a03 = pd.read_csv(att / "体检_A03_ADR日线.csv", dtype={"date": str})
    a04 = pd.read_csv(att / "体检_A04_H股日线.csv", dtype={"date": str, "code": str})
    rec, fx = fx_series(att / mcp)
    fxc = fx.set_index("bj").Close
    fx_raw = fx.set_index("raw").Close  # 错法：直接取 Date 的日期部分
    res = []
    for h, row in zip(HOLD, a01.itertuples(index=False)):
        us = a03[a03.adr == h[0]].set_index("date").close
        hk = a04[a04.code == h[2]].set_index("date")
        common = [d for d in us.index if d in hk.index and d in fxc.index and d <= BASE][-N_DAYS:]
        assert len(common) == N_DAYS

        def prem(ratio, fxs=fxc, days=common):
            return pd.Series({d: us[d] * fxs[d] / ratio / hk.close[d] - 1 for d in days})
        p_master = prem(row[3])
        ratio = row[3]
        fixed = False
        if abs(p_master.median()) > BAD:
            ratio = h[5]
            fixed = True
        assert ratio == h[5]
        p = prem(ratio)
        common_raw = [d for d in us.index if d in hk.index and d in fx_raw.index and d <= BASE][-N_DAYS:]
        p_raw = prem(ratio, fx_raw, common_raw)
        hk60 = hk[hk.index <= BASE].iloc[-N_DAYS:]
        adv = float(hk60.turnover_hkd.mean())
        adv_common = float(hk.turnover_hkd.reindex(common).mean())
        eq = h[3] * ratio
        val = r2(eq * float(hk.close[BASE]))
        dl = val / (adv * PART)
        sec = "S" in row[5].split("-")[-1] if "-" in row[5] else False
        dl_master = h[3] * row[3] * float(hk.close[BASE]) / (adv * PART)
        if sec:
            grp, why = "C", "第二上市，本轮暂缓"
        elif abs(p.median()) > BAD:
            grp, why = "C", "比率核对后溢价仍异常"
        elif dl <= 1.0:
            grp, why = "A", f"变现天数 {dl:.2f} ≤ 1.00"
        elif dl <= 3.0:
            grp, why = "B", f"变现天数 {dl:.2f}，在 1.00 至 3.00 之间"
        else:
            grp, why = "C", f"变现天数 {dl:.2f} > 3.00"
        n_conv = h[3] if grp == "A" else (h[3] // 2 if grp == "B" else 0)
        res.append(dict(adr=h[0], co=h[1], hk=h[2], name=row[5], lot=int(row[6]), ads=h[3], master=row[3], a02=h[5], ratio=ratio, fixed=fixed,
                        pm_med=p_master.median(), mean=p.mean(), med=p.median(), last=p[BASE], raw_med=p_raw.median(), eq=eq, close=float(hk.close[BASE]),
                        val=val, adv=adv, adv_common=adv_common, dl=dl, dl_master=dl_master, sec=sec, grp=grp, why=why, n=n_conv,
                        n_raw_days=len(common_raw), common0=common[0]))
    for x in res:
        print(f"[22] {x['adr']:5} {x['name']:8} 比率 {x['master']}->{x['ratio']} 主数据中位 {x['pm_med'] * 100:7.2f}% 均 {x['mean'] * 100:5.2f}% 中 {x['med'] * 100:5.2f}% "
              f"末 {x['last'] * 100:5.2f}% 错日期中位 {x['raw_med'] * 100:5.2f}% 变现 {x['dl']:.2f}（共同日 {x['val'] / (x['adv_common'] * PART):.2f}，主数据 {x['dl_master']:.2f}） {x['grp']} {x['n']}")
    g = {k: [x for x in res if x["grp"] == k] for k in "ABC"}
    assert [x["adr"] for x in g["A"]] == ["BABA", "BIDU", "BILI"] and [x["adr"] for x in g["B"]] == ["NTES", "ZTO", "LI"]
    for x in res:
        if not x["sec"]:
            assert min(abs(x["dl"] - 1), abs(x["dl"] - 3)) > 0.15, x["adr"]
    lix = next(x for x in res if x["adr"] == "LI")
    assert lix["dl_master"] <= 1.0  # 不改比率，理想汽车会落到 A 组
    # ---- 输出 ----
    c_rows = [[x["adr"], x["co"], x["master"], x["a02"], x["ratio"], round(x["pm_med"] * 100, 2), round(x["mean"] * 100, 2), round(x["med"] * 100, 2),
               round(x["last"] * 100, 2), (f"主数据 1 ADS = {x['master']} 股，中位数 {pc(x['pm_med'])}，超过 3%；按 A02 现行比率 1 ADS = {x['ratio']} 股更正"
                                           if x["fixed"] else "主数据和 A02 一致")] for x in res]
    l_rows = [[x["adr"], x["hk"], x["ads"], x["eq"], x["close"], x["val"], r2(x["adv"]), round(x["dl"], 2)] for x in res]
    g_rows = [[x["adr"], x["hk"], x["name"], "是" if x["sec"] else "否", x["ratio"], x["ads"], x["lot"], round(x["dl"], 2), x["grp"], x["n"], x["why"]] for x in res]
    o_rows = [[d, str(fx.set_index("bj").Date[d]), float(fxc[d])] for d in res[0] and sorted(set(d for d in fxc.index if res[0]["common0"] <= d <= BASE))]
    n_tot = sum(x["n"] for x in res)
    write_xlsx(ans / "ADR回港转换体检表.xlsx",
               [("比率核对", ["ADR", "公司", "主数据比率", "A02比率", "使用比率", "按主数据比率的溢价率中位数(%)", "平均溢价率(%)", "溢价率中位数(%)",
                          "10-30溢价率(%)", "说明"], c_rows),
                ("流动性", ["ADR", "H股代码", "持有ADS数", "等值H股股数", "10-30 H股收盘价(港元)", "等值市值(港元)", "H股60日日均成交额(港元)", "变现天数"], l_rows),
                ("转换分组", ["ADR代码", "H股代码", "港股简称", "是否第二上市", "ADS比率(更正后)", "持有ADS数", "每手股数", "变现天数", "分组",
                          "本轮转换的ADS数", "原因"], g_rows),
                ("在线数据", ["交易日(北京时间)", "返回的Date(UTC)", "美元兑港元收盘价"], o_rows)],
               notes={"比率核对": [f"溢价率 = ADR 收盘价 × 美元兑港元收盘价 ÷ ADS 比率 ÷ H 股收盘价 − 1，取截至 {BASE} 的 60 个共同交易日（{res[0]['common0']} 起）。"],
                      "流动性": ["变现天数 = 等值市值 ÷ (H 股 60 个港股交易日日均成交额 × 20%)。"],
                      "转换分组": [f"A 组本轮全部转，B 组本轮转一半（向下取整），C 组暂缓。本轮合计 {n_tot:,} 份 ADS。"],
                      "在线数据": [source_line(rec), "Date 是 UTC 时间：英国夏令时期间是前一天 23:00，之后是当天 00:00。加 8 小时换成北京时间后取日期，才是这一天的汇率。",
                               "直接取 Date 的日期部分，夏令时期间每天都会错成前一天，周五的汇率会被记到周四。"]})
    write_docx(ans / "ADR回港转换体检报告.docx", "中概互联精选 ADR 持仓回港转换体检报告", [
        ("结论", [f"A 组（本轮全部转）：" + "、".join(f"{x['adr']} {x['ads']:,} 份" for x in g["A"]) + "。",
                f"B 组（分两批，本轮转一半）：" + "、".join(f"{x['adr']} {x['n']:,} 份" for x in g["B"]) + "。",
                f"C 组（暂缓）：" + "、".join(f"{x['adr']}（{x['why']}）" for x in g["C"]) + "。",
                f"本轮合计转 {n_tot:,} 份 ADS。"]),
        ("比率核对", [f"{x['adr']}：主数据 1 ADS = {x['master']} 股，按它算的溢价率中位数是 {pc(x['pm_med'])}，明显不对。A02 存托协议摘要的现行比率是 1 ADS = {x['ratio']} 股，"
                    f"更正后中位数 {pc(x['med'])}。" for x in res if x["fixed"]]
         + ["其余 8 只主数据和 A02 一致，60 天溢价率中位数都在 ±1% 以内。"]
         + [f"理想汽车如果不改比率，等值市值少一半，变现天数会算成 {lix['dl_master']:.2f}，落到 A 组；更正后是 {lix['dl']:.2f}，属于 B 组。"]),
        ("流动性", [f"{x['adr']}：等值 {x['eq']:,} 股 H 股，市值 {w2(x['val'])} 港元，H 股日均成交额 {w2(x['adv'])} 港元，变现天数 {x['dl']:.2f}。" for x in res]),
        ("数据", ["ADR、H 股用内部快照的不复权日线。美元兑港元汇率通过 US Stocks MCP 查询（数据来自 Yahoo Finance，2026-11-19 查询），代码 HKD=X，日期按北京时间归属。"]),
    ])
    return res


# ---------------- 23 ----------------
def read_q22(path: Path):
    wb = load_workbook(path, data_only=True)
    out = []
    for r in wb["转换分组"].iter_rows(min_row=2, values_only=True):
        if r and r[0] and r[8] in ("A", "B", "C"):
            out.append(dict(adr=r[0], hk=str(r[1]), name=r[2], ratio=int(r[4]), ads=int(r[5]), lot=int(r[6]), grp=r[8], n=int(r[9])))
    return out


def hk_stamp(v):
    return float(math.ceil(v * 0.001 - 1e-9))


def us_sell(n, p):
    amt = r2(n * p)
    c, s = r2(amt * 0.0005), r2(amt * 0.0000278)
    return amt, c, s, r2(amt - c - s)


def hk_buy_cost(v):
    return r2(v * 0.0005), hk_stamp(v), r2(v * 0.000027), r2(v * 0.0000565), r2(v * 0.0000015)


def material_text(path: Path) -> str:
    """补充材料的全部文字，用来检查有没有写出本题答案。"""
    if path.suffix == ".xlsx":
        wb = load_workbook(path, data_only=True)
        return "\n".join(str(c) for ws in wb.worksheets for row in ws.iter_rows(values_only=True) for c in row if c is not None)
    if path.suffix == ".docx":
        from docx import Document
        d = Document(str(path))
        return "\n".join([x.text for x in d.paragraphs] + [c.text for t in d.tables for r in t.rows for c in r.cells])
    return path.read_text(encoding="utf-8")


def q23(r22):
    att, ans = fresh_dir(D23 / "题目附件"), fresh_dir(D23 / "标准答案附件")
    (D23 / "MCP结果文件").mkdir(exist_ok=True)
    copy_as(DOC / "ADR转换" / "A01_转换执行口径与费用.md", att / "转换_A01_转换执行口径与费用.md")
    extra = copy_materials("23", att)
    # 正确的前轮结果：22 的标准答案附件，和 22 本次的计算结果逐只核对
    rows = [x for x in read_q22(D22 / "标准答案附件" / "ADR回港转换体检表.xlsx") if x["grp"] in ("A", "B")]
    assert [(x["adr"], x["hk"], x["ratio"], x["lot"], x["grp"], x["n"]) for x in rows] == \
        [(y["adr"], y["hk"], y["ratio"], y["lot"], y["grp"], y["n"]) for y in r22 if y["grp"] in ("A", "B")]
    files = {}
    for x in rows:
        for t, tag in ((x["adr"], "ADR"), (f"{x['hk']}.HK", "H股")):
            fn = f"转换_MCP_{x['adr']}_{tag}日线.json"
            copy_as(RAW / "ADR转换" / f"{t}.json", D23 / "MCP结果文件" / fn)
            copy_as(D23 / "MCP结果文件" / fn, att / fn)
            files[(x["adr"], tag)] = fn
    fn = "转换_MCP_美元兑港元汇率.json"
    copy_as(RAW / "ADR转换" / "HKD=X.json", D23 / "MCP结果文件" / fn)
    copy_as(D23 / "MCP结果文件" / fn, att / fn)
    frec, fx = fx_series(att / fn)
    FX = float(fx.set_index("bj").Close[EXE])
    out, online = [], []
    for x in rows:
        ru, mu = load_mcp_prices(att / files[(x["adr"], "ADR")], 0)
        rh, mh = load_mcp_prices(att / files[(x["adr"], "H股")], 8)
        assert float(mu.Dividends.abs().sum()) == 0 and float(mh.Dividends.abs().sum()) == 0
        pu, ph = round(float(mu.Close[EXE]), 4), round(float(mh.Close[EXE]), 3)
        online += [[x["adr"], ru["参数"]["ticker"], ru["查询时间"], str(mu.Date[EXE]), EXE, pu], [x["adr"], rh["参数"]["ticker"], rh["查询时间"], str(mh.Date[EXE]), EXE, ph]]
        n, R, lot = x["n"], x["ratio"], x["lot"]
        orig = r2(n * pu * FX)
        # 方式一
        step = lot // math.gcd(lot, R)
        nc = n - n % step
        sh1 = nc * R
        assert sh1 % lot == 0
        odd = n - nc
        if odd:
            _, _, _, net_odd = us_sell(odd, pu)
            cash_odd = r2(net_odd * FX * (1 - 0.001))
        else:
            cash_odd = 0.0
        f_dep = r2(nc * 0.05 * FX)
        f_stp = hk_stamp(sh1 * ph)
        f_brk = 1000.0
        cash1 = r2(cash_odd - f_dep - f_stp - f_brk)
        v1 = r2(sh1 * ph + cash1)
        # 方式二
        amt, cm, sec, net = us_sell(n, pu)
        hkd = r2(net * FX * (1 - 0.001))
        k = int(hkd // (ph * lot))
        while k > 0:
            v = r2(k * lot * ph)
            if v + sum(hk_buy_cost(v)) <= hkd:
                break
            k -= 1
        v = r2(k * lot * ph)
        bc = hk_buy_cost(v)
        sh2 = k * lot
        cash2 = r2(hkd - v - sum(bc))
        v2 = r2(sh2 * ph + cash2)
        best = 1 if v1 >= v2 else 2
        val = v1 if best == 1 else v2
        prem = pu * FX / R / ph - 1
        out.append(dict(x=x, pu=pu, ph=ph, orig=orig, nc=nc, odd=odd, sh1=sh1, cash_odd=cash_odd, f_dep=f_dep, f_stp=f_stp, f_brk=f_brk, cash1=cash1, v1=v1,
                        amt=amt, cm=cm, sec=sec, net=net, hkd=hkd, lots=k, sh2=sh2, bc=bc, cash2=cash2, v2=v2, best=best,
                        sh=sh1 if best == 1 else sh2, cash=cash1 if best == 1 else cash2, loss=r2(orig - val), prem=prem))
    for o in out:
        print(f"[23] {o['x']['adr']:5} n={o['x']['n']} 溢价 {o['prem'] * 100:6.2f}% 方式一 {o['v1']:,.2f}（注销 {o['nc']} 零头 {o['odd']}） 方式二 {o['v2']:,.2f} "
              f"选 {o['best']} 差 {(o['v1'] - o['v2']) / o['orig'] * 100:+.3f}% 损耗 {o['loss']:,.2f}")
    for o in out:
        assert abs(o["v1"] - o["v2"]) / o["orig"] > 0.0005, o["x"]["adr"]
    tot = dict(orig=r2(sum(o["orig"] for o in out)), sh=sum(o["sh"] for o in out), cash=r2(sum(o["cash"] for o in out)), loss=r2(sum(o["loss"] for o in out)))
    m_rows = [[o["x"]["adr"], o["x"]["grp"], o["x"]["n"], o["pu"], o["ph"], o["orig"], o["nc"], o["odd"], o["sh1"], o["cash_odd"], o["f_dep"], o["f_stp"], o["f_brk"],
               o["v1"], o["net"], o["hkd"], o["lots"], o["sh2"], r2(sum(o["bc"])), o["cash2"], o["v2"], "方式一 注销转换" if o["best"] == 1 else "方式二 市场换股"] for o in out]
    e_rows = []
    for o in out:
        x = o["x"]
        todo = (f"注销 {o['nc']:,} 份 ADS 换 {o['sh1']:,} 股" + (f"，美股卖出零头 {o['odd']:,} 份" if o["odd"] else "")) if o["best"] == 1 else \
            f"美股卖出 {x['n']:,} 份 ADS，港股买入 {o['sh2']:,} 股（{o['lots']:,} 手）"
        e_rows.append([x["adr"], x["hk"], "注销转换" if o["best"] == 1 else "市场换股", todo, o["sh"], o["cash"], o["orig"], o["loss"], round(o["loss"] / o["orig"] * 100, 2)])
    assert tot["sh"] == sum(r[4] for r in e_rows) == 7_881_520, tot["sh"]
    e_rows.append(["合计", "", "", f"{len(out)} 只 H 股合计", tot["sh"], tot["cash"], tot["orig"], tot["loss"], round(tot["loss"] / tot["orig"] * 100, 2)])
    online.append(["美元兑港元", "HKD=X", frec["查询时间"], str(fx.set_index("bj").Date[EXE]), EXE, FX])
    write_xlsx(ans / "ADR回港转换执行方案表.xlsx",
               [("方式比较", ["ADR", "分组", "本轮转换ADS数", "ADR收盘价(美元)", "H股收盘价(港元)", "原值(港元)", "方式一注销ADS数", "方式一零头ADS数", "方式一换出股数",
                          "方式一零头卖出所得(港元)", "存托注销费(港元)", "印花税(港元)", "转换手续费(港元)", "方式一换后价值(港元)",
                          "方式二卖出净额(美元)", "方式二换汇所得(港元)", "方式二买入手数", "方式二买入股数", "方式二买入费用(港元)", "方式二剩余现金(港元)",
                          "方式二换后价值(港元)", "选定方式"], m_rows),
                ("执行清单", ["ADR", "H股代码", "选定方式", "交易部要做的事", "得到H股股数", "港元现金", "原值(港元)", "转换损耗(港元)", "损耗率(%)"], e_rows),
                ("在线数据", ["ADR", "查询代码", "查询时间", "返回的Date(UTC)", "对应交易日", "收盘价"], online)],
               notes={"方式比较": [f"测算价用 {EXE} 两地收盘价，汇率 {FX:.4f}（{EXE}），交易部 11-03 起执行。方式一只注销能换成整手的 ADS，零头在美股卖掉；方式二只买整手。"],
                      "在线数据": [source_line(frec), "美股 Date 是美东零点对应的 UTC 时间，日期部分就是交易日；港股 Date 是 UTC 16:00，加 8 小时；汇率 Date 加 8 小时。",
                               "这段时间返回的 Dividends 都是 0，Close 就是不复权收盘价。"]})
    pick = lambda b: [o for o in out if o["best"] == b]
    write_docx(ans / "ADR回港转换执行方案.docx", "中概互联精选 ADR 回港转换执行方案（按 2026-11-02 收盘价测算，11-03 起执行）", [
        ("结论", ["按 11-02 收盘价测算，交易部 11-03 起执行。注销转换：" + ("、".join(o["x"]["adr"] for o in pick(1)) or "无") + "。市场换股：" + ("、".join(o["x"]["adr"] for o in pick(2)) or "无") + "。",
                f"本轮六只合计得到 H 股 {tot['sh']:,} 股（" + "、".join(f"{o['x']['name']} {o['sh']:,} 股" for o in out) + "）。",
                f"本轮原值合计 {w2(tot['orig'])} 港元，转换损耗合计 {w2(tot['loss'])} 港元，损耗率 {tot['loss'] / tot['orig'] * 100:.2f}%；换完剩港元现金 {w2(tot['cash'])} 港元。"]),
        ("逐只", [f"{o['x']['adr']}（{o['x']['grp']} 组，{o['x']['n']:,} 份）：11-02 溢价率 {pc(o['prem'])}。方式一换后 {w2(o['v1'])} 港元，方式二 {w2(o['v2'])} 港元，"
                f"选{'注销转换' if o['best'] == 1 else '市场换股'}。{e_rows[i][3]}，得到 {o['sh']:,} 股，现金 {w2(o['cash'])} 港元，损耗 {w2(o['loss'])} 港元。"
                for i, o in enumerate(out)]),
        ("为什么这样选", ["ADR 相对 H 股有溢价时，在美股卖、港股买能多换出股数，溢价够抵掉两边交易费用就选市场换股；溢价小或是折价时，注销转换只付印花税和每份 0.05 美元的注销费，更省。",
                      "每手股数和 ADS 比率不整除的，注销转换会留下零头 ADS，零头在美股卖掉。"]
         + [f"{o['x']['adr']} 每手 {o['x']['lot']} 股、比率 {o['x']['ratio']}，注销 {o['nc']:,} 份，零头 {o['odd']:,} 份。" for o in out if o["odd"]]),
        ("数据", [f"11-02 收盘价和汇率通过 US Stocks MCP 查询（数据来自 Yahoo Finance，2026-11-19 查询），汇率 {FX:.4f}。这段时间没有分红，该收盘价就是不复权价。"]),
    ])
    # 补充材料不能写出本题答案：本轮 ADS 数、注销数、得到的股数、两种方式的换后价值、合计、11-02 汇率
    banned = [str(tot["sh"]), f"{tot['orig']:.2f}", f"{tot['loss']:.2f}", f"{tot['cash']:.2f}", f"{FX:.4f}"]
    for o in out:
        banned += [str(o["x"]["n"]), str(o["nc"]), str(o["sh1"]), str(o["sh2"]), f"{o['v1']:.2f}", f"{o['v2']:.2f}", f"{o['loss']:.2f}"]
    banned = [b for b in banned if len(b.replace(".", "")) >= 6] + [f"{FX:.4f}"]
    for n in extra:
        text = material_text(att / n).replace(",", "")
        hit = [b for b in banned if b in text]
        assert not hit, (n, hit)
    n_att = len(list(att.iterdir()))
    assert len(extra) >= 6 and n_att >= 20, (extra, n_att)
    print(f"[23] 补充材料 {len(extra)} 份，没有写出本题答案数字；题目附件共 {n_att} 份；H 股合计 {tot['sh']:,} 股")
    return out


if __name__ == "__main__":
    r22 = q22()
    q23(r22)
