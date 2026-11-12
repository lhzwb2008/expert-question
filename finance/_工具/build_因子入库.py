#!/usr/bin/env python3
"""打包「因子入库检验」这道题：题目附件、标准答案附件。

和 high-econ/二期/factor_library 相比只有一处改动：A01 去掉贵州茅台（600519.SH），改由在线 MCP 查询。

脚本做的核对：
1. MCP 返回的贵州茅台收盘价和原快照逐日比对。
2. 把 MCP 返回的价格并回去重算，五个因子的判定表和 F3 的 70 个月明细应与原标答一致。
3. 把 MCP 价格整体乘一个系数再重算，结果不变（以后再分红，返回的复权价会整体缩小，不影响标答）。
4. 不查 MCP、只用 59 只时算出来是什么。
"""
from __future__ import annotations

import shutil

import pandas as pd

from build_common import CASES, OUT, copy_as, fresh_dir, load_mcp_prices, load_module, source_line, write_docx, write_xlsx

SRC = CASES / "二期" / "factor_library"
DST = OUT / "题目" / "05_因子入库检验"
PREFIX = "因子入库_"
CODE, TICKER, NAME = "600519.SH", "600519.SS", "贵州茅台"
MCP_FILE = f"{PREFIX}MCP_{TICKER}日线.json"
RENAME = {"A02_口径说明.md": "A02_口径说明.md", "A03_合格线与交付.md": "A03_合格线与交付.md"}


def fmt(table: pd.DataFrame):
    return [(r.factor, f"{r.ic_mean:.4f}", f"{r.ic_t:.2f}", int(r.ic_pos_months), f"{r.ls_gross_pct:.3f}",
             f"{r.ls_net_pct:.3f}", bool(r["pass"])) for _, r in table.iterrows()]


def main() -> None:
    att = fresh_dir(DST / "题目附件")
    ans = fresh_dir(DST / "标准答案附件")
    a01 = pd.read_csv(SRC / "attachments" / "A01_prices.csv", dtype={"adj_close": str})
    kept = a01[a01.code != CODE]
    snap = a01[a01.code == CODE].set_index("date").adj_close.astype(float)
    kept.to_csv(att / f"{PREFIX}A01_股票复权日线.csv", index=False)
    for old, new in RENAME.items():
        copy_as(SRC / "attachments" / old, att / f"{PREFIX}{new}")
    copy_as(DST / "MCP结果文件" / MCP_FILE, att / MCP_FILE)
    print(f"A01 原 {len(a01)} 行，去掉 {CODE} {len(a01) - len(kept)} 行，留 {len(kept)} 行，{kept.code.nunique()} 只")

    # 核对 1
    rec, d = load_mcp_prices(DST / "MCP结果文件" / MCP_FILE, 8)
    days = sorted(kept.date.unique())
    assert all(x in d.index for x in days), "MCP 返回没有覆盖全部交易日"
    use = d.loc[days]
    worst = (use.Close - snap.loc[days]).abs().max()
    divs = d[(d.Dividends != 0) & (d.index >= days[0]) & (d.index <= days[-1])].Dividends
    splits = d[d["Stock Splits"] != 0]
    print(f"核对 1：返回 {len(d)} 行（{d.index[0]} 至 {d.index[-1]}），本题用 {len(use)} 行，与原快照最大相差 {worst:.6f}")
    print(f"        区间内分红 {len(divs)} 次，最近一次 {divs.index[-1]} 每股 {divs.iloc[-1]}；拆分 {len(splits)} 次")
    assert worst < 1e-3 and len(splits) == 0

    # 核对 2、3、4
    mod = load_module(SRC / "rebuild.py", "factor_rebuild")
    tmp = fresh_dir(DST / "_核对用临时目录")
    mod.ATT = tmp
    want = fmt(pd.read_csv(SRC / "answer" / "summary.csv").assign(**{"pass": lambda x: x["pass"] == "是"}))
    want_led = pd.read_csv(SRC / "answer" / "admitted_monthly.csv", dtype=str)

    def run(prices):
        frames = [kept.assign(adj_close=kept.adj_close.astype(float))]
        if prices is not None:
            frames.append(pd.DataFrame({"code": CODE, "date": days, "adj_close": prices.to_numpy()}))
        pd.concat(frames).to_csv(tmp / "A01_prices.csv", index=False)
        return mod.build()

    table, books = run(use.Close)
    led = books["F3"]
    assert fmt(table) == want, "并入 MCP 数据后的结果和原标答不一致"
    assert [f"{x:.4f}" for x in led.ic] == want_led.ic.tolist()
    gap = (led.net * 100 - want_led.net_pct.astype(float)).abs()
    flips = [led.signal_date[i] for i in range(len(led)) if f"{led.net[i] * 100:.3f}" != want_led.net_pct[i]]
    assert gap.max() < 0.00051, "F3 逐月净多空收益和原标答相差超过舍入误差"
    print(f"核对 2：并入 MCP 返回的贵州茅台（原始精度），判定表和 F3 的 70 个月 IC 与原标答一致；"
          f"净多空收益最大相差 {gap.max():.6f} 个百分点，第三位小数舍入不同的月份 {flips}")
    assert fmt(run(use.Close.round(4))[0]) == want
    assert fmt(run(use.Close * 0.97)[0]) == want
    print("核对 3：四舍五入到 4 位小数、或整体乘 0.97 后再并入，结果相同")
    t59, _ = run(None)
    print("核对 4：只用 59 只：", [(x[0], x[1], x[2], x[5], x[6]) for x in fmt(t59)])
    shutil.rmtree(tmp)

    # 标准答案附件：xlsx
    t_head = ["因子", "名称", "月数", "IC均值", "t值", "IC为正的月数", "多空收益月均值(%)", "净多空收益月均值(%)", "是否入库"]
    t_rows = [[r.factor, r["name"], int(r.months), round(r.ic_mean, 4), round(r.ic_t, 2), int(r.ic_pos_months),
               round(r.ls_gross_pct, 3), round(r.ls_net_pct, 3), "是" if r["pass"] else "否"] for _, r in table.iterrows()]
    l_head = ["因子", "调仓日", "持有到期日", "IC", "多空收益(%)", "换手", "净多空收益(%)"]
    l_rows = [["F3", r.signal_date, r.hold_to, round(r.ic, 4), round(r.long_short * 100, 3), round(r.turnover, 4),
               round(r.net * 100, 3)] for _, r in led.iterrows()]
    o_head = ["交易日", f"{TICKER} MCP返回收盘价（复权，人民币元）", "Dividends", "Stock Splits"]
    o_rows = [[day, round(float(use.Close[day]), 4), float(use.Dividends[day]), float(use["Stock Splits"][day])] for day in days]
    p0, p1 = float(use.Close[days[0]]), float(use.Close[days[-1]])
    write_xlsx(
        ans / "因子入库检验测算表.xlsx",
        [("因子判定表", t_head, t_rows), ("入库因子逐月明细", l_head, l_rows), ("在线数据", o_head, o_rows)],
        notes={
            "因子判定表": ["入库要同时满足：IC 均值不低于 0.03，t 值不低于 2.0，净多空收益月均值大于 0。只有 F3 满足。"],
            "入库因子逐月明细": ["入库因子为 F3 低波动，2020-12-31 至 2026-10-30，共 70 个月。"],
            "在线数据": [
                source_line(rec),
                f"A01 里的代码是 {CODE}，在这个 MCP 上对应 {TICKER}。返回 {len(d)} 行，{d.index[0]} 至 {d.index[-1]}。"
                f"本表只列与其余 59 只相同的 {len(days)} 个交易日（{days[0]} 至 {days[-1]}），区间内没有停牌缺行。",
                "返回的 Date 是 UTC 时间，加 8 小时后的日期是交易日。",
                f"返回的收盘价已按现金分红做过复权：区间内 Dividends 不为 0 的有 {len(divs)} 天，最近一次是 {divs.index[-1]} 每股 {divs.iloc[-1]} 元；"
                "Stock Splits 全部为 0，没有送转。口径和 A01 的 adj_close 一致，直接并入。",
                f"查询当日返回值：{days[0]} 为 {p0:.4f}，{days[-1]} 为 {p1:.4f}，后者是前者的 {p1 / p0:.4f} 倍。"
                "以后每次分红，返回的历史复权价会整体按同一比例缩小，这个倍数和五个因子的结果不变。",
            ],
        },
    )

    # 标准答案附件：docx
    row = {r.factor: r for _, r in table.iterrows()}
    first, last = led.iloc[0], led.iloc[-1]

    def s(k):
        r = row[k]
        return (f"IC 均值 {r.ic_mean:.4f}，t 值 {r.ic_t:.2f}，IC 为正 {int(r.ic_pos_months)} 个月，"
                f"净多空收益月均 {r.ls_net_pct:.3f}%")

    write_docx(
        ans / "因子入库检验建议.docx",
        "A 股量价因子入库检验建议",
        [
            ("结论", ["只有 F3 低波动因子入库。其余四个因子各有至少一条标准不满足。"]),
            ("五个因子", [
                "检验从 2020-12-31 到 2026-10-30，共 70 个月，股票池 60 只。入库要同时满足 IC 均值不低于 0.03、t 值不低于 2.0、净多空收益月均值大于 0。",
                f"F3 低波动：{s('F3')}，多空收益月均 {row['F3'].ls_gross_pct:.3f}%。三条都满足，入库。",
                f"F4 52周高点：{s('F4')}。IC 均值达标，IC 为正的月数是五个里最多的，但 t 值不到 2.0，不入库。",
                f"F5 彩票：{s('F5')}。IC 均值达标，但 t 值不到 2.0，净多空收益为负，不入库。",
                f"F1 动量：{s('F1')}。IC 均值不到 0.03，不入库。",
                f"F2 反转：{s('F2')}。IC 均值为负，不入库。",
            ]),
            ("F3 的首末两期", [
                f"第一期调仓日 {first.signal_date}，持有到 {first.hold_to}，IC 为 {first.ic:.4f}，多空收益 {first.long_short * 100:.3f}%，"
                f"换手 {first.turnover:g}，净多空收益 {first.net * 100:.3f}%。",
                f"最后一期调仓日 {last.signal_date}，持有到 {last.hold_to}，IC 为 {last.ic:.4f}，多空收益 {last.long_short * 100:.3f}%，"
                f"换手 {last.turnover:g}，净多空收益 {last.net * 100:.3f}%。",
            ]),
            ("在线数据", [
                f"研究部给的行情快照 A01 只有 59 只股票，没有{NAME}（{CODE}）。它的日线通过 US Stocks MCP 查询，代码用 {TICKER}，"
                f"取与其余 59 只相同的 {len(days)} 个交易日并入检验。",
                f"返回的收盘价已按现金分红复权，区间内有 {len(divs)} 次分红记录，没有送转，口径和 A01 的 adj_close 一致，没有再做调整。"
                "五个因子都只用价格的比值和日收益，复权价整体缩放不影响结果。",
            ]),
            ("对应材料", ["五个因子的统计见《因子入库检验测算表.xlsx》的「因子判定表」，F3 的 70 个月明细见「入库因子逐月明细」，"
                      f"{NAME}的逐日价格见「在线数据」。两份文件的数字和结论相同。"]),
        ],
    )
    print("抽查：", first.to_dict(), last.to_dict(), sep="\n  ")
    print(f"{NAME}：{days[0]} {p0:.4f}，{days[-1]} {p1:.4f}，倍数 {p1 / p0:.4f}；查询时间 {rec['查询时间']}")
    print("分红：", divs.to_dict())


if __name__ == "__main__":
    main()
