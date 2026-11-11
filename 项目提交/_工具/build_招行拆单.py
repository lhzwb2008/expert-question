#!/usr/bin/env python3
"""打包「招行拆单算法」这道题：题目附件、标准答案附件。

底稿是 cases/二期/exec_algo，附件内容没有改，只是改了文件名。
在线 MCP 查的是招商银行日线，用来核对 A01 分钟行情是否齐全。MCP 结果文件放在
题目/02_招行拆单算法/MCP结果文件/，由 mcp_call.py --save 生成，本脚本只读不改。

脚本做的核对：
1. 用改名后的附件重算，四种算法的判定表和 VWAP 的 61 天明细应与原标答一致。
2. MCP 日线与 A01 逐日比对：缺哪几个交易日，哪几天分钟成交量合计与日线相差超过 0.5%。
3. 缺失日影响到哪几个评估日的成交量分布窗口。
"""
from __future__ import annotations

import importlib.util
import json
import shutil

import pandas as pd

from build_common import CASES, OUT, copy_as, fresh_dir, write_docx, write_xlsx

SRC = CASES / "二期" / "exec_algo"
DST = OUT / "题目" / "02_招行拆单算法"
MCP = DST / "MCP结果文件"
PREFIX = "招行拆单_"
MCP_FILE = f"{PREFIX}MCP_600036.SS日线.json"
D_FROM, D_TO = "2026-07-01", "2026-10-30"
TOL = 0.005
PROFILE_DAYS = 20

RENAME = {
    "A01_minute.csv": "A01_招商银行1分钟行情.csv",
    "A02_口径说明.md": "A02_口径说明.md",
    "A03_合格线与交付.md": "A03_合格线与交付.md",
}


def load_mcp():
    rec = json.load(open(MCP / MCP_FILE, encoding="utf-8"))
    d = pd.DataFrame(json.loads(rec["原始返回"]["content"][0]["text"]))
    # 返回的 Date 是 UTC 时间，加 8 小时后的日期是交易日
    d["day"] = (pd.to_datetime(d.Date.str[:19]) + pd.Timedelta(hours=8)).dt.strftime("%Y-%m-%d")
    d = d[(d.day >= D_FROM) & (d.day <= D_TO)].set_index("day")
    return rec, d


def main() -> None:
    att = fresh_dir(DST / "题目附件")
    ans = fresh_dir(DST / "标准答案附件")
    for old, new in RENAME.items():
        copy_as(SRC / "attachments" / old, att / f"{PREFIX}{new}")
    copy_as(MCP / MCP_FILE, att / MCP_FILE)

    # 核对 1：重算
    spec = importlib.util.spec_from_file_location("exec_rebuild", SRC / "rebuild.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    tmp = fresh_dir(DST / "_核对用临时目录")
    for old, new in RENAME.items():
        copy_as(att / f"{PREFIX}{new}", tmp / old)
    mod.ATT = tmp
    table, book, choice = mod.build()
    shutil.rmtree(tmp)
    want = pd.read_csv(SRC / "answer" / "summary.csv", dtype=str)
    cols = ["mean_vs_vwap_bp", "std_vs_vwap_bp", "worst_vs_vwap_bp", "mean_vs_arrival_bp"]
    got = table.copy()
    for c in cols:
        got[c] = got[c].map(lambda x: f"{x:.2f}")
    assert choice == "VWAP" and (got[cols].to_numpy() == want[cols].to_numpy()).all(), "重算和原标答不一致"
    led = book[book.algo == choice].reset_index(drop=True)
    want_led = pd.read_csv(SRC / "answer" / "chosen_daily.csv", dtype=str)
    assert [f"{x:.2f}" for x in led.vs_vwap_bp] == want_led.vs_vwap_bp.tolist(), "逐日明细和原标答不一致"
    print("核对 1：重算结果与原标答一致，选择", choice, "，评估", len(led), "天")

    # 核对 2：MCP 日线与 A01 比对
    rec, daily = load_mcp()
    m = pd.read_csv(SRC / "attachments" / "A01_minute.csv")
    m["day"] = m.time.str[:10]
    minute = m.groupby("day").volume_lots.sum() * 100
    missing = sorted(set(daily.index) - set(minute.index))
    extra = sorted(set(minute.index) - set(daily.index))
    cmp_rows, over = [], []
    for day in daily.index:
        dv = int(daily.Volume[day])
        if day in minute.index:
            mv = int(minute[day])
            dev = mv / dv - 1
            note = "相差超过0.5%" if abs(dev) > TOL else ""
            if abs(dev) > TOL:
                over.append((day, mv, dv, dev))
            cmp_rows.append([day, dv, mv, round(dev * 100, 4), note])
        else:
            cmp_rows.append([day, dv, None, None, "A01没有这一天的分钟行情"])
    devs = sorted((abs(r[3]), r[0]) for r in cmp_rows if r[3] is not None)
    print(f"核对 2：MCP {len(daily)} 个交易日，A01 {len(minute)} 个；A01 缺 {missing}，多 {extra}")
    print("        超过 0.5%：", [(d, mv, dv, f"{x:.4%}") for d, mv, dv, x in over])
    print("        其余偏差最大的三天：", [(d, f"{x:.4f}%") for x, d in devs[-4:-1]])
    assert len(missing) == 1 and not extra and len(over) == 1

    # 核对 3：缺失日影响到哪些评估日的分布窗口
    true_days = daily.index.tolist()
    have_days = minute.index.tolist()
    hit = []
    for d in led.date:
        used = have_days[have_days.index(d) - PROFILE_DAYS:have_days.index(d)]
        real = true_days[true_days.index(d) - PROFILE_DAYS:true_days.index(d)]
        if used != real:
            hit.append((d, used[0], real[0]))
    print("核对 3：分布窗口受缺失日影响的评估日", hit)
    miss = missing[0]
    miss_vol = int(daily.Volume[miss])
    o_day, o_mv, o_dv, o_dev = over[0]

    # 标准答案附件：xlsx
    names = dict(mod.ALGOS)
    t_head = ["算法", "名称", "评估天数", "相对VWAP滑点平均值(bp)", "相对VWAP滑点标准差(bp)", "相对VWAP滑点最大值(bp)",
              "相对到达价滑点平均值(bp)", "是否合格"]
    t_rows = [[r.algo, names[r.algo], int(r.days), round(r.mean_vs_vwap_bp, 2), round(r.std_vs_vwap_bp, 2),
               round(r.worst_vs_vwap_bp, 2), round(r.mean_vs_arrival_bp, 2), "是" if r["pass"] else "否"]
              for _, r in table.iterrows()]
    l_head = ["日期", "成交均价", "市场VWAP", "相对VWAP的滑点(bp)", "买完时间"]
    l_rows = [[r.date, round(r.avg_price, 4), round(r.market_vwap, 4), round(r.vs_vwap_bp, 2), r.done_at]
              for _, r in led.iterrows()]
    o_head = ["交易日", "MCP日线成交量(股)", "A01分钟成交量合计(股)", "偏差(%)", "备注"]
    q = rec["参数"]
    write_xlsx(
        ans / "招行拆单算法测算表.xlsx",
        [("算法判定表", t_head, t_rows), ("默认算法逐日明细", l_head, l_rows), ("在线数据", o_head, cmp_rows)],
        notes={
            "算法判定表": ["标准差不超过 10 bp 为合格。合格的算法里相对 VWAP 平均滑点最低的是 VWAP。"],
            "默认算法逐日明细": ["默认算法为 VWAP，评估区间 2026-07-30 至 2026-10-30，共 61 个交易日。"],
            "在线数据": [
                f"来源：US Stocks MCP（https://mcp-stocks-us.gino.im/mcp，数据来自 Yahoo Finance），工具 get_historical_stock_prices，"
                f"代码 {q['ticker']}，参数 period={q['period']}、interval={q['interval']}。查询时间：{rec['查询时间']}。",
                "返回的 Date 是 UTC 时间，加 8 小时后的日期是交易日。返回的 Volume 单位是股，A01 的 volume_lots 单位是手，合计后乘 100 再比。",
                "偏差 = A01 分钟成交量合计 ÷ MCP 日线成交量 − 1。A01 每天 241 根，合计包含 14:57 至 15:00 的收盘集合竞价。",
                f"{D_FROM} 至 {D_TO} 实际有 {len(daily)} 个交易日，A01 只有 {len(minute)} 个，缺 {miss}。",
                f"偏差绝对值超过 0.5% 的只有 {o_day}：分钟合计 {o_mv:,} 股，日线 {o_dv:,} 股，偏差 {o_dev:+.2%}。",
                f"缺失日不补。受影响的是 {'、'.join(h[0] for h in hit)} 三个评估日的成交量分布窗口，评估区间仍是 61 天。",
            ],
        },
    )

    # 标准答案附件：docx
    row = {r.algo: r for _, r in table.iterrows()}

    def s(a):
        r = row[a]
        return (f"平均 {r.mean_vs_vwap_bp:.2f} bp，标准差 {r.std_vs_vwap_bp:.2f} bp，"
                f"最大 {r.worst_vs_vwap_bp:.2f} bp")

    write_docx(
        ans / "招行拆单算法选型建议.docx",
        "招商银行大单拆单算法选型建议",
        [
            ("结论", ["默认算法用 VWAP。它相对市场 VWAP 的滑点标准差在 10 bp 以内，在两个合格的算法里平均滑点更低。"]),
            ("四种算法", [
                "评估区间 2026-07-30 至 2026-10-30，共 61 个交易日，每天买入 200 万股。下面的滑点都是相对市场 VWAP。",
                f"POV：{s('POV')}。平均滑点是四种里最低的，但标准差超过 10 bp，不合格。"
                "它开盘后很快买完，成交价和全天均价的差距每天忽高忽低。",
                f"AM：{s('AM')}。标准差超过 10 bp，不合格。",
                f"TWAP：{s('TWAP')}。合格。",
                f"VWAP：{s('VWAP')}。合格，平均滑点低于 TWAP，因此选它。",
                f"相对到达价的平均滑点，TWAP 为 {row['TWAP'].mean_vs_arrival_bp:.2f} bp，VWAP 为 {row['VWAP'].mean_vs_arrival_bp:.2f} bp，"
                f"POV 为 {row['POV'].mean_vs_arrival_bp:.2f} bp，AM 为 {row['AM'].mean_vs_arrival_bp:.2f} bp，只作参考。",
            ]),
            ("分钟行情核对", [
                f"用 US Stocks MCP 查询了招商银行（600036.SS）的日线，和 A01 逐日比对。{D_FROM} 至 {D_TO} 实际有 {len(daily)} 个交易日，"
                f"A01 只有 {len(minute)} 个，缺 {miss} 这一天，当天日线成交量 {miss_vol:,} 股。A02 写的 81 个交易日是 A01 里的天数。",
                f"缺失日在前 20 天的预热期里，没有补。成交量分布取 A01 里此前有分钟数据的 20 个交易日，"
                f"所以 {'、'.join(h[0] for h in hit)} 这三天的分布窗口各往前多取了一天，只影响 VWAP 算法在这三天的计划量。评估区间仍是 61 天。",
                f"其余 {len(minute)} 天里，分钟成交量合计与日线成交量相差超过 0.5% 的只有 {o_day}，"
                f"分钟合计 {o_mv:,} 股，日线 {o_dv:,} 股，偏差 {o_dev:+.2%}。这一天在评估区间内，按 A01 原样计算。",
            ]),
            ("对应材料", ["四种算法的统计见《招行拆单算法测算表.xlsx》的「算法判定表」，VWAP 的 61 天明细见「默认算法逐日明细」，"
                      "逐日核对见「在线数据」。两份文件的数字和选择相同。"]),
        ],
    )
    print("抽查：", led.iloc[0].to_dict())
    print("      ", led.sort_values("vs_vwap_bp").iloc[-1].to_dict())
    print("      ", led.iloc[-1].to_dict())
    print("缺失日日线成交量", miss_vol)


if __name__ == "__main__":
    main()
