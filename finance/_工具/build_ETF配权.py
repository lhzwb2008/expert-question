#!/usr/bin/env python3
"""打包「ETF配权方案」这道题：题目附件、标准答案附件。

底稿是 high-econ/二期/etf_weights，附件内容没有改，只改了文件名。
在线 MCP 查的是上证指数日线，两个用途：核对 A01 的交易日是否齐全；算同期指数的收益和回撤作对照。

脚本做的核对：
1. 用改名后的附件重算，四种方案的判定表和 D 的 70 个月明细应与原标答一致。
2. 上证指数的交易日和 A01 比对，找出 A01 缺的交易日。
3. 按 A01 的 71 个月末交易日取指数收盘价，算期末净值、年化收益、最大回撤。
"""
from __future__ import annotations

import shutil

import numpy as np
import pandas as pd

from build_common import CASES, OUT, copy_as, fresh_dir, load_mcp_prices, load_module, source_line, write_docx, write_xlsx

SRC = CASES / "二期" / "etf_weights"
DST = OUT / "题目" / "04_ETF配权方案"
PREFIX = "ETF配权_"
MCP_FILE = f"{PREFIX}MCP_000001.SS日线.json"
RENAME = {
    "A01_prices.csv": "A01_ETF复权日线.csv",
    "A02_pool.csv": "A02_ETF名单.csv",
    "A03_口径说明.md": "A03_口径说明.md",
    "A04_合格线与交付.md": "A04_合格线与交付.md",
}
LOOK = 250


def main() -> None:
    att = fresh_dir(DST / "题目附件")
    ans = fresh_dir(DST / "标准答案附件")
    for old, new in RENAME.items():
        copy_as(SRC / "attachments" / old, att / f"{PREFIX}{new}")
    copy_as(DST / "MCP结果文件" / MCP_FILE, att / MCP_FILE)

    # 核对 1
    mod = load_module(SRC / "rebuild.py", "etf_rebuild")
    tmp = fresh_dir(DST / "_核对用临时目录")
    for old, new in RENAME.items():
        copy_as(att / f"{PREFIX}{new}", tmp / old)
    mod.ATT = tmp
    table, books, choice = mod.build()
    shutil.rmtree(tmp)
    want = pd.read_csv(SRC / "answer" / "summary.csv", dtype=str)
    got = [(f"{r.final_nav:.4f}", f"{r.ann_return_pct:.2f}", f"{r.ann_vol_pct:.2f}", f"{r.max_drawdown_pct:.2f}",
            f"{r.avg_turnover:.4f}") for _, r in table.iterrows()]
    assert choice == "D" and got == [tuple(x) for x in want[["final_nav", "ann_return_pct", "ann_vol_pct",
                                                              "max_drawdown_pct", "avg_turnover"]].to_numpy()]
    led = books[choice]
    want_led = pd.read_csv(SRC / "answer" / "chosen_monthly.csv", dtype=str)
    assert [f"{x:.4f}" for x in led.nav] == want_led.nav.tolist()
    print("核对 1：重算结果与原标答一致，选择", choice, "，", len(led), "个月")

    # 核对 2
    rec, ix = load_mcp_prices(DST / "MCP结果文件" / MCP_FILE, 8)
    a01 = pd.read_csv(SRC / "attachments" / "A01_prices.csv")
    days = sorted(a01.date.unique())
    ix_days = [d for d in ix.index if days[0] <= d <= days[-1]]
    missing = sorted(set(ix_days) - set(days))
    extra = sorted(set(days) - set(ix_days))
    print(f"核对 2：{days[0]} 至 {days[-1]} 上证指数 {len(ix_days)} 个交易日，A01 {len(days)} 个；A01 缺 {missing}，多 {extra}")
    assert len(missing) == 1 and not extra
    miss = missing[0]
    miss_close = float(ix.Close[miss])
    pos = {d: i for i, d in enumerate(days)}
    nxt = days[pos[max(d for d in days if d < miss)] + 1]
    reb = led.rebalance_date.tolist()
    hit = [t for t in reb if pos[nxt] <= pos[t] < pos[nxt] + LOOK]
    print(f"        缺失日 {miss} 指数收盘 {miss_close:.2f}；窗口跨过缺失日的调仓日 {len(hit)} 个：{hit[0]} 至 {hit[-1]}")

    # 核对 3
    ends = reb + [led.hold_to.iloc[-1]]
    c = ix.Close.reindex(ends)
    assert not c.isna().any() and len(ends) == 71
    nav = (c / c.iloc[0]).to_numpy()
    r = nav[1:] / nav[:-1] - 1
    peak = np.maximum.accumulate(nav)
    dd = 1 - nav / peak
    k = int(dd.argmax())
    k0 = int(nav[:k + 1].argmax())
    n = len(r)
    b_ann = nav[-1] ** (12 / n) - 1
    b_vol = r.std(ddof=1) * np.sqrt(12)
    print(f"核对 3：上证指数 {ends[0]} 收盘 {c.iloc[0]:.2f}，{ends[-1]} 收盘 {c.iloc[-1]:.2f}，期末净值 {nav[-1]:.4f}，"
          f"年化 {b_ann:.2%}，年化波动 {b_vol:.2%}，最大回撤 {dd.max():.2%}（高点 {ends[k0]}，谷底 {ends[k]}）")

    # 标准答案附件：xlsx
    names = dict(mod.SCHEMES)
    t_head = ["方案", "名称", "月数", "期末净值", "年化收益(%)", "年化波动(%)", "最大回撤(%)", "平均换手（不含第一个月）", "是否合格"]
    t_rows = [[x.scheme, names[x.scheme], int(x.months), round(x.final_nav, 4), round(x.ann_return_pct, 2),
               round(x.ann_vol_pct, 2), round(x.max_drawdown_pct, 2), round(x.avg_turnover, 4), "是" if x["pass"] else "否"]
              for _, x in table.iterrows()]
    l_head = ["调仓日", "持有到期日", "持仓和权重", "当月组合收益(%)", "换手", "当月净收益(%)", "月末净值"]
    l_rows = [[x.rebalance_date, x.hold_to, x.holdings, round(x.gross_pct, 3), round(x.turnover, 4), round(x.net_pct, 3),
               round(x.nav, 4)] for _, x in led.iterrows()]
    o_head = ["月末交易日", "上证指数收盘", "指数净值（2020-12-31为1）", "相对此前最高的回撤(%)"]
    o_rows = [[d, round(float(c[d]), 2), round(float(nav[i]), 4), round(float(dd[i]) * 100, 2)] for i, d in enumerate(ends)]
    row = {x.scheme: x for _, x in table.iterrows()}
    write_xlsx(
        ans / "ETF配权方案测算表.xlsx",
        [("方案判定表", t_head, t_rows), ("正式方案逐月明细", l_head, l_rows), ("在线数据", o_head, o_rows)],
        notes={
            "方案判定表": ["最大回撤不超过 15% 为合格。合格的方案里年化收益最高的是 D。"],
            "正式方案逐月明细": ["正式方案为 D 低波动前三，2020-12-31 至 2026-10-30，共 70 个月。"],
            "在线数据": [
                source_line(rec),
                "返回的 Date 是 UTC 时间，加 8 小时后的日期是交易日。指数没有分红和拆分，收盘价直接使用。",
                f"交易日核对：{days[0]} 至 {days[-1]} 上证指数有 {len(ix_days)} 个交易日，A01 只有 {len(days)} 个，缺 {miss}，"
                f"当天上证指数收盘 {miss_close:.2f}。",
                f"缺失日不补，波动率和动量的窗口按 A01 里实际有的交易日往前数。窗口跨过缺失日的是 {hit[0]} 至 {hit[-1]} 的 {len(hit)} 个调仓日。",
                f"对照：上表是 A01 的 71 个月末交易日的指数收盘价。期末净值 {nav[-1]:.4f}，年化收益 {b_ann:.2%}，年化波动 {b_vol:.2%}，"
                f"最大回撤 {dd.max():.2%}（高点 {ends[k0]}，谷底 {ends[k]}）。算法同 A03，指数不扣成本。",
            ],
        },
    )

    # 标准答案附件：docx
    def s(key):
        x = row[key]
        return (f"年化收益 {x.ann_return_pct:.2f}%，期末净值 {x.final_nav:.4f}，最大回撤 {x.max_drawdown_pct:.2f}%，"
                f"年化波动 {x.ann_vol_pct:.2f}%")

    write_docx(
        ans / "ETF配权方案选型建议.docx",
        "ETF 组合月度配权方案选型建议",
        [
            ("结论", ["采用 D 低波动前三。它的最大回撤在 15% 以内，在两个合格的方案里年化收益更高。"]),
            ("四种方案", [
                "回测从 2020-12-31 到 2026-10-30，共 70 个月，每月最后一个交易日调仓。",
                f"M 动量前三：{s('M')}。年化收益是四种里最高的，但最大回撤超过 15%，不合格。",
                f"E 等权：{s('E')}。最大回撤超过 15%，不合格。",
                f"V 波动率倒数：{s('V')}。合格。",
                f"D 低波动前三：{s('D')}。合格，年化收益高于 V，因此选它。",
            ]),
            ("和上证指数的对照", [
                f"用 US Stocks MCP 查询了上证指数（000001.SS）日线。按同样的 71 个月末交易日计算，指数从 {c.iloc[0]:.2f} 到 {c.iloc[-1]:.2f}，"
                f"期末净值 {nav[-1]:.4f}，年化收益 {b_ann:.2%}，最大回撤 {dd.max():.2%}（高点 {ends[k0]}，谷底 {ends[k]}）。",
                f"方案 D 同期年化收益 {row['D'].ann_return_pct:.2f}%，最大回撤 {row['D'].max_drawdown_pct:.2f}%，收益高于指数，回撤小于指数。"
                "对照只作参考，不改变按 A04 得出的结论。",
            ]),
            ("交易日核对", [
                f"{days[0]} 至 {days[-1]} 上证指数有 {len(ix_days)} 个交易日，A01 只有 {len(days)} 个，缺 {miss} 这一天。",
                f"缺失日没有补，波动率和动量的窗口按 A01 里实际有的交易日往前数。{miss} 不是月末，不影响调仓日和各月涨跌幅；"
                f"{hit[0]} 至 {hit[-1]} 这 {len(hit)} 个调仓日的 250 日窗口跨过了它，窗口比日历上多往前取了一天。",
            ]),
            ("对应材料", ["四种方案的统计见《ETF配权方案测算表.xlsx》的「方案判定表」，D 的 70 个月明细见「正式方案逐月明细」，"
                      "上证指数的月末收盘价和交易日核对见「在线数据」。两份文件的数字和选择相同。"]),
        ],
    )
    print("抽查：", led.iloc[0].to_dict(), led.iloc[1].to_dict(), led.iloc[-1].to_dict(), sep="\n  ")
    print("查询时间", rec["查询时间"], "返回", len(ix), "行", ix.index[0], ix.index[-1])


if __name__ == "__main__":
    main()
