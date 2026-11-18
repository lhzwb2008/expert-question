#!/usr/bin/env python3
"""打包「港股红利组合恒指期货对冲与保证金储备核定」（三轮链的第三轮）：题目附件、标准答案附件。

输入是第二轮标准答案《港股红利组合建仓方案表.xlsx》的「建仓清单」和「汇总」（评测时由项目组从前题标答提供，不放进本题附件），
加上本题自己的附件：A01 候选池前复权日线（LongPort，换成以基准日为锚点）、A02 对冲口径、A03 保证金储备与交付，
以及恒生指数日线的 MCP 结果文件。保证金标准是 A03 里拟的。

脚本做的事：
1. 生成 A01，复制 A02、A03 和 MCP 结果文件。
2. 只用第二轮的建仓方案表、本题附件和 MCP 结果文件重算，生成标准答案附件。
3. 算一遍常见错误的结果。
"""
from __future__ import annotations

import csv
import json
import math
from decimal import Decimal
from fractions import Fraction as F
from pathlib import Path

import pandas as pd
from openpyxl import load_workbook

from build_common import OUT, copy_as, fresh_dir, load_mcp_prices, source_line, write_docx, write_xlsx

HERE = Path(__file__).resolve().parent
RAW = HERE / "新题数据" / "港股红利对冲"
LP = HERE / "新题数据" / "港股红利_longport"
DOC = HERE / "新题口径" / "红利对冲"
PREV = OUT / "题目" / "14_港股红利组合建仓" / "标准答案附件" / "港股红利组合建仓方案表.xlsx"
DST = OUT / "题目" / "15_港股红利组合期货对冲"
PREFIX = "红利对冲_"
MCP_FILE = f"{PREFIX}MCP_恒生指数日线.json"
BASE, STRESS0 = "2026-10-30", "2021-11-01"
HEDGE = F(1, 2)
MULT, MINI = 50, 10
IM, IM_MINI = 148_000, 29_600
KEEP = F(1, 100)
FLOOR = F(3, 10)
WINDOWS = (250, 120)
POOL = ["0939.HK", "1398.HK", "3988.HK", "1288.HK", "3968.HK", "3328.HK", "0005.HK", "2388.HK", "0883.HK", "0857.HK",
        "0386.HK", "1088.HK", "1898.HK", "1171.HK", "0941.HK", "0728.HK", "0762.HK", "0002.HK", "0003.HK", "0006.HK",
        "0836.HK", "0902.HK", "0016.HK", "1972.HK", "0823.HK", "1919.HK", "0177.HK", "0548.HK", "0914.HK", "2318.HK"]


def read_plan(path: Path):
    wb = load_workbook(path, data_only=True)
    ws = wb["建仓清单"]
    head = [c.value for c in ws[1]]
    hold = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row and isinstance(row[0], str) and row[0].endswith(".HK") and isinstance(row[5], int):
            r = dict(zip(head, row))
            hold.append(dict(code=r["代码"], name=r["名称"], sh=r["建仓股数"], close=F(str(r["基准日收盘价(港元)"]))))
    assert len(hold) == 15
    summ = {}
    for row in wb["汇总"].iter_rows(min_row=2, values_only=True):
        if row and row[0] and row[1] is not None:
            summ[row[0]] = row[1]
    return hold, F(str(summ["产品资产(港元)"])), F(str(summ["现金(港元)"])), F(str(summ["建仓市值合计(港元)"]))


def beta(prices: pd.DataFrame, wt: dict[str, F], hsi: pd.Series, n: int):
    p = prices.tail(n + 1)
    ret = p.astype(float).pct_change().iloc[1:]
    rp = sum(ret[c] * float(wt[c]) for c in wt)
    rm = hsi.reindex(p.index).astype(float).pct_change().iloc[1:]
    assert not rm.isna().any() and len(rp) == n
    cov, var = rp.cov(rm), rm.var()
    return dict(n=n, first=ret.index[0], last=ret.index[-1], cov=cov, var=var, beta=cov / var, rp=rp, rm=rm)


def contracts(target: float):
    big = math.floor(target)
    mini = int(Decimal(str((target - big) * 5)).quantize(Decimal("1"), rounding="ROUND_HALF_UP"))
    return big, mini


def size(big: int, mini: int, idx: F, m10: F):
    notional = (big * MULT + mini * MINI) * idx
    margin = big * IM + mini * IM_MINI
    stress = notional * m10
    return dict(big=big, mini=mini, notional=notional, margin=margin, stress=stress, reserve=margin + stress)


def plan(b: float, mv: F, idx: F, m10: F, usable: F):
    tgt_n = HEDGE * F(b) * mv / (idx * MULT)
    big, mini = contracts(float(tgt_n))
    target = size(big, mini, idx, m10)
    fb, fm = big, mini
    while size(fb, fm, idx, m10)["reserve"] > usable:
        if fb > 0:
            fb -= 1
        elif fm > 0:
            fm -= 1
        else:
            break
    final = size(fb, fm, idx, m10)
    if (fb, fm) == (big, mini):
        verdict = "按目标张数对冲"
    elif fb >= FLOOR * big:
        verdict = "缩减张数对冲"
    else:
        verdict = "暂不对冲"
    for s in (target, final):
        s["ratio"] = s["notional"] / (F(b) * mv)
    return tgt_n, target, final, verdict


def main() -> None:
    att = fresh_dir(DST / "题目附件")
    ans = fresh_dir(DST / "标准答案附件")
    (DST / "MCP结果文件").mkdir(exist_ok=True)
    copy_as(RAW / "^HSI.json", DST / "MCP结果文件" / MCP_FILE)

    # 1. 附件：前复权价换成以基准日为锚点（基准日之后除息的几只，乘一个常数，日收益不变）
    with open(att / f"{PREFIX}A01_候选池前复权日线.csv", "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["code", "date", "adj_close"])
        for c in POOL:
            raw = {r["date"]: r["close"] for r in json.load(open(LP / f"{c}_noadj.json", encoding="utf-8"))}
            fwd = [r for r in json.load(open(LP / f"{c}_fwd.json", encoding="utf-8")) if r["date"] <= BASE]
            k = F(raw[BASE]) / F(fwd[-1]["close"])
            for r in fwd:
                v = r["close"] if k == 1 else f"{float(F(r['close']) * k):.4f}"
                wr.writerow([c, r["date"], v])
    copy_as(DOC / "A02_对冲口径.md", att / f"{PREFIX}A02_对冲口径.md")
    copy_as(DOC / "A03_保证金储备与交付.md", att / f"{PREFIX}A03_保证金储备与交付.md")
    copy_as(DST / "MCP结果文件" / MCP_FILE, att / MCP_FILE)

    # 2. 只用第二轮建仓方案表、本题附件和 MCP 结果文件重算
    hold, assets, cash, mv = read_plan(PREV)
    assert sum(h["sh"] * h["close"] for h in hold) == mv
    a01 = pd.read_csv(att / f"{PREFIX}A01_候选池前复权日线.csv", dtype={"code": str, "date": str, "adj_close": str})
    prices = a01.pivot(index="date", columns="code", values="adj_close").sort_index()
    prices = prices[[h["code"] for h in hold]]
    assert not prices.isna().any().any()
    rec, h = load_mcp_prices(att / MCP_FILE, 8)
    assert set(h.Date.str[11:13]) == {"16"}
    hsi = h.Close.round(2)
    assert set(prices.index) <= set(hsi.index)
    wt = {x["code"]: x["sh"] * x["close"] / mv for x in hold}
    bs = {n: beta(prices, wt, hsi, n) for n in WINDOWS}
    use_n = max(WINDOWS, key=lambda n: bs[n]["beta"])
    b = bs[use_n]["beta"]
    idx = F(f"{hsi[BASE]:.2f}")
    win = hsi[(hsi.index >= STRESS0) & (hsi.index <= BASE)]
    r10 = win / win.shift(10) - 1
    end10 = r10.idxmax()
    start10 = win.index[win.index.get_loc(end10) - 10]
    m10 = F(f"{win[end10]:.2f}") / F(f"{win[start10]:.2f}") - 1
    usable = cash - assets * KEEP
    tgt_n, target, final, verdict = plan(b, mv, idx, m10, usable)

    fl = float
    pc = lambda x: f"{fl(x) * 100:.2f}%"
    print(f"Beta250 {bs[250]['beta']:.6f}（{bs[250]['first']}~{bs[250]['last']}），Beta120 {bs[120]['beta']:.6f}（{bs[120]['first']}~），用 {use_n} 日")
    print(f"恒指 {BASE} 收盘 {idx}；最大10日涨幅 {pc(m10)}（{start10} {win[start10]:.2f} → {end10} {win[end10]:.2f}）")
    print(f"股票市值 {fl(mv):,.2f}，现金 {fl(cash):,.2f}，可动用 {fl(usable):,.2f}")
    for lab, s in (("目标", target), ("最终", final)):
        print(f"  {lab}：恒指 {s['big']} 张，小型 {s['mini']} 张，名义 {fl(s['notional']):,.2f}，保证金 {fl(s['margin']):,.2f}，"
              f"压力 {fl(s['stress']):,.2f}，储备 {fl(s['reserve']):,.2f}，对冲比例 {pc(s['ratio'])}")
    print(f"  目标张数 {fl(tgt_n):.4f}，结论 {verdict}，最终/目标 {final['big'] / target['big']:.4f}")
    assert verdict == "缩减张数对冲"
    assert final["big"] / target["big"] > 0.33

    # 常见错误
    errs = {}
    errs["不扣1%"] = plan(b, mv, idx, m10, cash)
    errs["只用250日Beta"] = plan(bs[250]["beta"], mv, idx, m10, usable)
    r5 = (win / win.shift(5) - 1).max()
    errs["用5日涨幅"] = plan(b, mv, idx, F(r5), usable)
    hu = h.Close.round(2)
    hu.index = pd.to_datetime(h.Date.str[:10]).dt.strftime("%Y-%m-%d").values
    hu = hu.reindex(prices.index).ffill()
    bu = max(beta(prices, wt, hu, n)["beta"] for n in WINDOWS)
    errs["恒指日期不加8小时"] = plan(bu, mv, idx, m10, usable)
    for k, (tn, tg, fn, v) in errs.items():
        print(f"  {k}：目标 {tg['big']}+{tg['mini']}，最终 {fn['big']}+{fn['mini']}，结论 {v}" + (f"（Beta {bu:.4f}）" if k.startswith("恒指") else ""))

    # 3. 标准答案附件
    r2 = lambda x: round(fl(x), 2)
    b250 = bs[250]
    d_rows = [[d, round(fl(b250["rp"][d]), 8), round(fl(b250["rm"][d]), 8)] for d in b250["rp"].index]
    b_rows = [[f"{n}日", bs[n]["first"], bs[n]["last"], bs[n]["n"], round(bs[n]["cov"], 10), round(bs[n]["var"], 10),
               round(bs[n]["beta"], 4), "是" if n == use_n else "否"] for n in WINDOWS]
    c_head = ["方案", "恒指期货(张)", "小型恒指期货(张)", "对冲名义(港元)", "初始保证金合计(港元)", "压力追加(港元)", "保证金储备(港元)",
              "可动用现金(港元)", "实际对冲比例(%)"]
    c_rows = [[lab, s["big"], s["mini"], r2(s["notional"]), r2(s["margin"]), r2(s["stress"]), r2(s["reserve"]), r2(usable),
               round(fl(s["ratio"]) * 100, 2)] for lab, s in (("目标张数", target), ("最终张数", final))]
    o_rows = [["基准日收盘", BASE, h.Date[BASE], fl(idx)], ["最大10日涨幅起点", start10, h.Date[start10], round(win[start10], 2)],
              ["最大10日涨幅终点", end10, h.Date[end10], round(win[end10], 2)]]
    gap = target["reserve"] - usable
    write_xlsx(
        ans / "港股红利组合对冲测算表.xlsx",
        [("组合日收益", ["交易日", "组合日收益", "恒生指数日收益"], d_rows),
         ("Beta估计", ["窗口", "起始交易日", "截止交易日", "样本天数", "协方差", "方差", "Beta", "对冲使用"], b_rows),
         ("对冲张数", c_head, c_rows),
         ("在线数据", ["项目", "香港交易日", "MCP返回的Date(UTC)", "恒生指数收盘价"], o_rows)],
        notes={
            "组合日收益": ["权重为15只股票基准日建仓市值占比，回看期间固定；个股日收益用A01前复权收盘价。"],
            "Beta估计": [f"Beta = 样本协方差 ÷ 恒生指数日收益的样本方差。对冲用两者中较大的 {use_n} 日 Beta {b:.4f}。"],
            "对冲张数": [f"股票市值 {fl(mv):,.2f} 港元，恒生指数基准日收盘 {fl(idx):,.2f}。目标张数 = 50% × {b:.4f} × 股票市值 ÷（恒指 × 50）= {fl(tgt_n):.4f}，"
                     f"整数部分 {target['big']} 张恒指期货，小数部分乘5四舍五入得 {target['mini']} 张小型恒指期货。",
                     f"压力追加 = 对冲名义 × 最大10日涨幅 {pc(m10)}。可动用现金 = 现金 {fl(cash):,.2f} − 产品资产 {fl(assets):,.2f} × 1% = {fl(usable):,.2f} 港元。",
                     f"目标张数的储备比可动用现金多 {fl(gap):,.2f} 港元；保持小型恒指 {final['mini']} 张，恒指期货减到 {final['big']} 张后储备 {fl(final['reserve']):,.2f} 港元，"
                     f"不超过可动用现金。{final['big']} ÷ {target['big']} = {final['big'] / target['big']:.4f}，不少于30%。",
                     f"结论：{verdict}。"],
            "在线数据": [source_line(rec),
                     f"返回 {len(h)} 行，{h.index[0]} 至 {h.index[-1]}。Date 是 UTC 时间 16:00，加 8 小时后的日期是香港的交易日，换算后与 A01 的交易日逐日一致。",
                     f"最大10日涨幅取 {STRESS0} 至 {BASE}，{start10} 收盘 {win[start10]:.2f} 到 {end10} 收盘 {win[end10]:.2f}，涨幅 {pc(m10)}。"]},
    )
    write_docx(
        ans / "港股红利组合对冲方案意见.docx",
        "港股红利组合恒指期货对冲方案意见",
        [
            ("结论", [f"{verdict}。最终做空恒指期货 {final['big']} 张、小型恒指期货 {final['mini']} 张，对冲名义 {fl(final['notional']):,.2f} 港元，"
                    f"实际对冲比例 {pc(final['ratio'])}，低于投委会定的50%。"]),
            ("目标张数", [f"250 日 Beta {bs[250]['beta']:.4f}，120 日 Beta {bs[120]['beta']:.4f}，对冲用较大的 {use_n} 日 Beta {b:.4f}。",
                       f"股票市值 {fl(mv):,.2f} 港元，恒生指数基准日收盘 {fl(idx):,.2f}，目标张数 {fl(tgt_n):.4f}，即恒指期货 {target['big']} 张、小型恒指期货 {target['mini']} 张，"
                       f"对冲名义 {fl(target['notional']):,.2f} 港元。"]),
            ("保证金储备", [f"目标张数的初始保证金 {fl(target['margin']):,.2f} 港元，压力追加 {fl(target['stress']):,.2f} 港元，储备合计 {fl(target['reserve']):,.2f} 港元。",
                        f"建仓后现金 {fl(cash):,.2f} 港元，扣除产品资产1%留作赎回和费用后，可动用现金 {fl(usable):,.2f} 港元，差 {fl(gap):,.2f} 港元。",
                        f"恒指期货减到 {final['big']} 张后，储备 {fl(final['reserve']):,.2f} 港元（初始保证金 {fl(final['margin']):,.2f}，压力追加 {fl(final['stress']):,.2f}），"
                        f"不超过可动用现金；{final['big']} 张是目标 {target['big']} 张的 {final['big'] / target['big'] * 100:.2f}%，不少于30%。"]),
            ("压力情景", [f"过去五年（{STRESS0} 至 {BASE}）恒生指数最大10日涨幅 {pc(m10)}，从 {start10} 的 {win[start10]:.2f} 涨到 {end10} 的 {win[end10]:.2f}。"]),
            ("在线数据", ["内部快照没有恒生指数，日线通过 US Stocks MCP 查询，代码 ^HSI。返回的 Date 是 UTC 时间，加 8 小时后才是香港的交易日；"
                      f"不换算会把恒指日收益整体错开一天，Beta 会算成 {bu:.4f}。"]),
            ("对应材料", ["逐日收益见《港股红利组合对冲测算表.xlsx》的「组合日收益」，两个窗口的 Beta 见「Beta估计」，目标和最终张数、储备和可动用现金见「对冲张数」，"
                      "恒生指数收盘价和查询信息见「在线数据」。"]),
        ],
    )
    print("查询时间", rec["查询时间"], len(h), "行", h.index[0], h.index[-1])


if __name__ == "__main__":
    main()
