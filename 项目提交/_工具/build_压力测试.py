#!/usr/bin/env python3
"""打包「多资产压力测试」这道题：题目附件、标准答案附件。

这道题没有底稿，是 2026-11-11 新出的。行情全部来自 US Stocks MCP 的实际调用（新题数据/压力测试/），
口径文件在 新题口径/压力测试/。A01 快照收录五项资产，恒生指数留给在线 MCP 查询。

脚本做的事：
1. 从五项资产的 MCP 返回生成 A01 快照（换成当地交易日，2017-01-03 至 2026-10-30）。
2. 只用题目附件（A01 至 A05）加恒生指数的 MCP 结果文件重算，生成标准答案附件。
3. 检查两条限额在各档倍数下离门槛的距离，距离太近时报错。
"""
from __future__ import annotations

import math
from pathlib import Path

import pandas as pd

from build_common import OUT, copy_as, fresh_dir, load_mcp_prices, source_line, write_docx, write_xlsx

HERE = Path(__file__).resolve().parent
RAW = HERE / "新题数据" / "压力测试"
DOC = HERE / "新题口径" / "压力测试"
DST = OUT / "题目" / "10_多资产压力测试"
PREFIX = "压力测试_"
MCP_FILE = f"{PREFIX}MCP_恒生指数日线.json"
SNAP = {"000001.SH": ("000001.SS", 8), "SPX": ("^GSPC", 0), "NDX": ("^NDX", 0), "TLT": ("TLT", 0), "GC": ("GC=F", 0)}
FIRST, LAST = "2017-01-03", "2026-10-30"
NAV, L_NOW, RATE = 800_000_000, 1.4, 0.03
LIM_TOTAL, LIM_ONE = 0.35, 0.10
GRID = [round(0.5 + 0.1 * i, 1) for i in range(16)]


def at(series: pd.Series, day: str):
    s = series[series.index <= day]
    return s.index[-1], float(s.iloc[-1])


def main() -> None:
    att = fresh_dir(DST / "题目附件")
    ans = fresh_dir(DST / "标准答案附件")
    (DST / "MCP结果文件").mkdir(exist_ok=True)
    copy_as(RAW / "^HSI.json", DST / "MCP结果文件" / MCP_FILE)

    # 1. 快照
    frames = []
    for asset, (ticker, hours) in SNAP.items():
        rec0, d = load_mcp_prices(RAW / f"{ticker}.json", hours)
        d = d[(d.index >= FIRST) & (d.index <= LAST)]
        frames.append(pd.DataFrame({"date": d.index, "asset": asset, "close": d.Close.round(4).values}))
        print(f"快照 {asset:10} {ticker:10} {rec0['查询时间']} {len(d)} 行 {d.index[0]} ~ {d.index[-1]}")
    snap = pd.concat(frames, ignore_index=True)
    snap.to_csv(att / f"{PREFIX}A01_资产日线快照.csv", index=False)
    for f in ["A02_组合敞口.csv", "A03_情景库.csv", "A04_口径说明.md", "A05_限额与交付.md"]:
        copy_as(DOC / f, att / f"{PREFIX}{f}")
    copy_as(DST / "MCP结果文件" / MCP_FILE, att / MCP_FILE)

    # 2. 只用题目附件重算
    a01 = pd.read_csv(att / f"{PREFIX}A01_资产日线快照.csv")
    w = pd.read_csv(att / f"{PREFIX}A02_组合敞口.csv", dtype={"asset": str}).set_index("asset")
    scn = pd.read_csv(att / f"{PREFIX}A03_情景库.csv")
    assert abs(w.weight.sum() - 1) < 1e-12
    rec, h = load_mcp_prices(att / MCP_FILE, 8)
    assert set(h.Date.str[11:13]) == {"16"}
    px = {a: g.set_index("date").close for a, g in a01.groupby("asset")}
    px["HSI"] = h.Close
    assets = list(w.index)

    cell = {}      # (情景, 资产) -> (起点日, 起点价, 终点日, 终点价, 涨跌幅)
    for _, s in scn.iterrows():
        for a in assets:
            d0, p0 = at(px[a], s.start)
            d1, p1 = at(px[a], s.end)
            cell[s.scenario, a] = (d0, p0, d1, p1, p1 / p0 - 1)
    R = {s.scenario: sum(w.weight[a] * cell[s.scenario, a][4] for a in assets) for _, s in scn.iterrows()}
    days = {s.scenario: (pd.Timestamp(s.end) - pd.Timestamp(s.start)).days for _, s in scn.iterrows()}
    sname = dict(zip(scn.scenario, scn.name))
    aname = w.name.to_dict()

    def total(sc, L):
        return -L * R[sc] + max(L - 1, 0) * RATE * days[sc] / 365

    def one(sc, a, L):
        return -L * w.weight[a] * cell[sc, a][4]

    def ok1(L):
        return all(total(sc, L) <= LIM_TOTAL for sc in R)

    def ok2(L):
        return all(one(sc, a, L) <= LIM_ONE for sc in R for a in assets)

    max1 = max(L for L in GRID if ok1(L))
    max2 = max(L for L in GRID if ok2(L))
    best = max(L for L in GRID if ok1(L) and ok2(L))
    # 离门槛的距离
    gaps = [abs(total(sc, L) - LIM_TOTAL) for sc in R for L in GRID] + [abs(one(sc, a, L) - LIM_ONE) for sc in R for a in assets for L in GRID]
    print(f"各档倍数离限额最近的距离 {min(gaps) * 100:.3f} 个百分点")
    assert min(gaps) > 0.0015, "有一档离限额太近"
    breaches = []
    for sc in R:
        if total(sc, L_NOW) > LIM_TOTAL:
            breaches.append((sc, "情景总损失", "", total(sc, L_NOW)))
        for a in assets:
            if one(sc, a, L_NOW) > LIM_ONE:
                breaches.append((sc, "单一资产损失贡献", a, one(sc, a, L_NOW)))
    cut = round((L_NOW - best) * NAV)
    print("R:", {k: round(v * 100, 2) for k, v in R.items()}, "自然日", days)
    print(f"只按限额一 {max1}，只按限额二 {max2}，最大合规 {best}，现行 {L_NOW} 超限 {[(b[0], b[1], b[2], round(b[3] * 100, 2)) for b in breaches]}，压降 {cut:,}")
    for L in (best, round(best + 0.1, 1), max1, round(max1 + 0.1, 1), L_NOW):
        worst_t = max(R, key=lambda sc: total(sc, L))
        worst_o = max(((sc, a) for sc in R for a in assets), key=lambda k: one(k[0], k[1], L))
        print(f"  L={L}: 最大总损失 {worst_t} {total(worst_t, L) * 100:.2f}%   最大单一贡献 {worst_o} {one(*worst_o, L) * 100:.2f}%")
    assert (max1, max2, best) == (1.4, 1.2, 1.2) and len(breaches) == 2
    # 卡住最大合规倍数的那一项：再高一档时超限的项
    nxt = round(best + 0.1, 1)
    bind = [(sc, a, one(sc, a, nxt)) for sc in R for a in assets if one(sc, a, nxt) > LIM_ONE]
    assert [(b[0], b[1]) for b in bind] == [("S4", "HSI")] and ok1(nxt)

    # 3. 标准答案附件
    pc = lambda x: round(x * 100, 2)
    c_head = ["情景", "情景名称", "资产代码", "资产", "权重", "起点交易日", "起点收盘价", "终点交易日", "终点收盘价", "涨跌幅(%)", "权重×涨跌幅(%)"]
    c_rows = [[sc, sname[sc], a, aname[a], float(w.weight[a]), cell[sc, a][0], round(cell[sc, a][1], 4), cell[sc, a][2], round(cell[sc, a][3], 4),
               pc(cell[sc, a][4]), pc(w.weight[a] * cell[sc, a][4])] for sc in R for a in assets]
    k_head = ["情景", "情景名称", "起始日", "结束日", "情景自然日数", "组合情景收益R(%)", f"倍数{L_NOW}融资成本(%)", f"倍数{L_NOW}情景总损失(%)",
              f"倍数{L_NOW}损失贡献最大的资产", f"倍数{L_NOW}最大单一资产损失贡献(%)", f"倍数{L_NOW}是否超限",
              f"倍数{best}情景总损失(%)", f"倍数{best}最大单一资产损失贡献(%)", f"倍数{best}是否超限"]
    k_rows = []
    for _, s in scn.iterrows():
        sc = s.scenario
        top = max(assets, key=lambda a: one(sc, a, L_NOW))
        bad = total(sc, L_NOW) > LIM_TOTAL or one(sc, top, L_NOW) > LIM_ONE
        top2 = max(one(sc, a, best) for a in assets)
        k_rows.append([sc, s["name"], s.start, s.end, days[sc], pc(R[sc]), pc(max(L_NOW - 1, 0) * RATE * days[sc] / 365), pc(total(sc, L_NOW)),
                       aname[top], pc(one(sc, top, L_NOW)), "超限" if bad else "未超限", pc(total(sc, best)), pc(top2),
                       "超限" if (total(sc, best) > LIM_TOTAL or top2 > LIM_ONE) else "未超限"])
    g_rows = [[L, pc(max(total(sc, L) for sc in R)), "合规" if ok1(L) else "超限",
               pc(max(one(sc, a, L) for sc in R for a in assets)), "合规" if ok2(L) else "超限",
               "合规" if ok1(L) and ok2(L) else "不合规"] for L in GRID if 1.0 <= L <= 1.6]
    o_head = ["情景", "起始日", "起点实际交易日", "起点收盘", "结束日", "终点实际交易日", "终点收盘", "涨跌幅(%)"]
    o_rows = [[s.scenario, s.start, cell[s.scenario, "HSI"][0], round(cell[s.scenario, "HSI"][1], 2), s.end, cell[s.scenario, "HSI"][2],
               round(cell[s.scenario, "HSI"][3], 2), pc(cell[s.scenario, "HSI"][4])] for _, s in scn.iterrows()]
    parts = []
    for _, s in scn.iterrows():
        for label, day, k in (("起始日", s.start, 0), ("结束日", s.end, 2)):
            used = {}
            for a in assets:
                if cell[s.scenario, a][k] != day:
                    used.setdefault(cell[s.scenario, a][k], []).append(aname[a])
            for d, names in used.items():
                parts.append(f"{s.scenario} 的{label} {day}，{'、'.join(names)}休市，取 {d}")
    shift_txt = "；".join(parts)
    assert len(parts) == 3
    b_txt = "；".join(f"{sc}（{sname[sc]}）{aname[a]}的单一资产损失贡献 {v * 100:.2f}%" for sc, _, a, v in breaches)
    worst_now = max(R, key=lambda sc: total(sc, L_NOW))
    write_xlsx(
        ans / "多资产压力测试测算表.xlsx",
        [("情景涨跌幅", c_head, c_rows), ("限额检查", k_head, k_rows),
         ("各档倍数", ["总敞口倍数", "六个情景里最大的情景总损失(%)", "限额一（≤35%）", "六个情景里最大的单一资产损失贡献(%)", "限额二（≤10%）", "是否合规"], g_rows),
         ("在线数据", o_head, o_rows)],
        notes={
            "情景涨跌幅": ["起点、终点当天休市时，取之前最近一个交易日。实际取到的交易日和情景表日期不同的有：" + shift_txt + "。"],
            "限额检查": [
                f"现行倍数 {L_NOW} 下，情景总损失最大的是 {worst_now}（{sname[worst_now]}）{total(worst_now, L_NOW) * 100:.2f}%，没有超过 35%。",
                f"现行倍数 {L_NOW} 下超限 {len(breaches)} 处，都是限额二：{b_txt}。",
                f"最大合规倍数 {best}。升到 {nxt} 时 S4 恒生指数的单一资产损失贡献为 {bind[0][2] * 100:.2f}%，超过 10%。",
                f"需要压降的名义敞口 =（{L_NOW} − {best}）× {NAV:,} = {cut:,} 元。",
            ],
            "各档倍数": [f"只按限额一，最大合规倍数 {max1}；只按限额二，最大合规倍数 {max2}；两条都满足的最大倍数 {best}。"],
            "在线数据": [
                source_line(rec),
                f"返回 {len(h)} 行，{h.index[0]} 至 {h.index[-1]}。返回的 Date 是 UTC 时间（16:00），加 8 小时后的日期是香港的交易日。",
                "恒生指数是价格指数，没有分红和拆分调整，收盘价直接使用。A01 没有收录恒生指数，六个情景的起点、终点收盘价都取自这次查询。",
            ],
        },
    )
    hs4 = cell["S4", "HSI"]
    write_docx(
        ans / "多资产压力测试与敞口倍数建议.docx",
        "多资产配置组合压力测试与总敞口倍数建议",
        [
            ("结论", [f"现行总敞口倍数 {L_NOW} 不合规，建议降到 {best}，需要压降名义敞口 {cut:,} 元。"]),
            ("现行倍数下的超限项", [
                f"限额一（情景总损失不超过 35%）没有超限。六个情景里损失最大的是 {worst_now}（{sname[worst_now]}），情景总损失 {total(worst_now, L_NOW) * 100:.2f}%，"
                f"其中融资成本 {max(L_NOW - 1, 0) * RATE * days[worst_now] / 365 * 100:.2f}%。",
                f"限额二（单一资产损失贡献不超过 10%）超限 {len(breaches)} 处：{b_txt}。",
            ]),
            ("最大合规倍数", [
                f"只按限额一算，最大合规倍数是 {max1}；只按限额二算是 {max2}。两条都满足的最大倍数是 {best}。",
                f"卡住倍数的是 S4（{sname['S4']}）里的恒生指数：{hs4[0]} 收盘 {hs4[1]:.2f}，{hs4[2]} 收盘 {hs4[3]:.2f}，跌 {-hs4[4] * 100:.2f}%。"
                f"恒生指数权重 {w.weight['HSI']:.0%}，倍数 {best} 时损失贡献 {one('S4', 'HSI', best) * 100:.2f}%，倍数 {nxt} 时 {bind[0][2] * 100:.2f}%，超过 10%。",
                f"倍数 {best} 下，六个情景里最大的情景总损失是 {max(total(sc, best) for sc in R) * 100:.2f}%，两条限额都满足。",
            ]),
            ("六个情景的组合收益", ["倍数为 1 时：" + "；".join(f"{sc}（{sname[sc]}）{R[sc] * 100:+.2f}%" for sc in R) + "。"]),
            ("在线数据", [
                "研究部的快照 A01 没有收录恒生指数。恒生指数日线通过 US Stocks MCP 查询，代码 ^HSI。返回的日期是 UTC 时间，加 8 小时后才是香港的交易日。",
                "各资产只用自己的交易日，起点、终点当天休市时取之前最近一个交易日。" + shift_txt + "。",
            ]),
            ("对应材料", ["36 个情景涨跌幅见《多资产压力测试测算表.xlsx》的「情景涨跌幅」，六个情景的限额检查见「限额检查」，各档倍数的结果见「各档倍数」，"
                      "恒生指数的取数见「在线数据」。两份文件的建议倍数、超限项和压降金额相同。"]),
        ],
    )
    print("恒生指数查询时间", rec["查询时间"], len(h), "行", h.index[0], h.index[-1])
    print("HSI:", [(sc, cell[sc, "HSI"]) for sc in R])
    print("日期有调整的：", shift_txt)
    print(pd.DataFrame([[sc] + [pc(cell[sc, a][4]) for a in assets] + [pc(R[sc])] for sc in R], columns=["情景"] + assets + ["R"]).to_string(index=False))


if __name__ == "__main__":
    main()
