#!/usr/bin/env python3
"""打包「ETF配权方案超额归因」这道题：题目附件、标准答案附件。

2026-11-14 按质检意见重做。原来是四种配权方案选一个，和招行拆单、VaR 两道题的任务链重复；
现在方案已定（低波动前三），任务是把它相对 10 只等权基准的超额拆到每只 ETF 和每个年份，再按披露规则下结论。

A01、A02 仍取 high-econ/二期/etf_weights 的附件，口径文件在 新题口径/ETF归因/。
在线 MCP 查的是上证指数日线，两个用途：核对 A01 的交易日是否齐全；取年末收盘算各年涨跌幅，用于行情适应性那条披露规则。

脚本做的核对：
1. 每个月 10 只 ETF 的贡献之和等于当月超额。
2. 上证指数的交易日和 A01 比对，找出 A01 缺的交易日。
3. 两条披露规则离门槛的距离。
"""
from __future__ import annotations

import pandas as pd

from build_common import CASES, OUT, copy_as, fresh_dir, load_mcp_prices, load_module, source_line, write_docx, write_xlsx

HERE = OUT / "_工具"
SRC = CASES / "二期" / "etf_weights"
DOC = HERE / "新题口径" / "ETF归因"
DST = OUT / "题目" / "04_ETF配权归因"
PREFIX = "ETF配权_"
MCP_FILE = f"{PREFIX}MCP_000001.SS日线.json"
LOOK = 250
SHARE_MIN = 0.5


def main() -> None:
    att = fresh_dir(DST / "题目附件")
    ans = fresh_dir(DST / "标准答案附件")
    copy_as(SRC / "attachments" / "A01_prices.csv", att / f"{PREFIX}A01_ETF复权日线.csv")
    copy_as(SRC / "attachments" / "A02_pool.csv", att / f"{PREFIX}A02_ETF名单.csv")
    copy_as(DOC / "A03_口径说明.md", att / f"{PREFIX}A03_口径说明.md")
    copy_as(DOC / "A04_披露规则与交付.md", att / f"{PREFIX}A04_披露规则与交付.md")
    copy_as(DST / "MCP结果文件" / MCP_FILE, att / MCP_FILE)

    mod = load_module(SRC / "rebuild.py", "etf_rebuild")
    codes, name = mod.CODES, dict(mod.POOL)
    px = pd.read_csv(att / f"{PREFIX}A01_ETF复权日线.csv").pivot(index="date", columns="code", values="adj_close")[codes]
    ret = px.pct_change()
    days = px.index.tolist()
    s = px.index.to_series()
    ends = s.groupby(s.str[:7]).last()
    ends = ends[(ends.index >= mod.FIRST) & (ends.index <= mod.LAST)].tolist()
    pos = {d: i for i, d in enumerate(days)}
    assert len(ends) == 71

    months, contrib, wts = [], [], []
    for k in range(70):
        t, t1 = ends[k], ends[k + 1]
        w = mod.weights("D", px, ret, pos[t])
        r = px.loc[t1] / px.loc[t] - 1
        rb = float(r.mean())
        rp = float((w * r).sum())
        c = (w - 0.1) * (r - rb)
        assert abs(c.sum() - (rp - rb)) < 1e-12
        held = [x for x in codes if w[x] > 0]
        months.append(dict(t=t, t1=t1, held=" ".join(name[x] for x in held), rp=rp, rb=rb, ex=rp - rb))
        contrib.append(c)
        wts.append(w)
    m = pd.DataFrame(months)
    C = pd.DataFrame(contrib).reset_index(drop=True)
    W = pd.DataFrame(wts).reset_index(drop=True)
    total = float(m.ex.sum())
    print(f"核对 1：70 个月逐月贡献之和等于当月超额。方案合计 {m.rp.sum():.5%}，基准合计 {m.rb.sum():.5%}，累计超额 {total:.5%}")

    over = (C * (W > 0)).sum()
    under = (C * (W == 0)).sum()
    tot = C.sum()
    held_n = (W > 0).sum()
    share = tot / total
    top = tot.idxmax()
    order = tot.sort_values(ascending=False)
    for x in codes:
        print(f"  {name[x]:　<8} 持有 {held_n[x]:>2} 月 超配 {over[x]:+.5%} 低配 {under[x]:+.5%} 累计 {tot[x]:+.5%} 占比 {share[x]:+.3%}")
    print(f"  超配合计 {over.sum():.5%}（{over.sum() / total:.2%}），低配合计 {under.sum():.5%}（{under.sum() / total:.2%}）")

    # 核对 2
    rec, ix = load_mcp_prices(DST / "MCP结果文件" / MCP_FILE, 8)
    ix_days = [d for d in ix.index if days[0] <= d <= days[-1]]
    missing = sorted(set(ix_days) - set(days))
    extra = sorted(set(days) - set(ix_days))
    print(f"核对 2：{days[0]} 至 {days[-1]} 上证指数 {len(ix_days)} 个交易日，A01 {len(days)} 个；A01 缺 {missing}，多 {extra}")
    assert len(missing) == 1 and not extra
    miss = missing[0]
    miss_close = float(ix.Close[miss])
    nxt = days[pos[max(d for d in days if d < miss)] + 1]
    reb = ends[:-1]
    hit = [t for t in reb if pos[nxt] <= pos[t] < pos[nxt] + LOOK]
    print(f"        缺失日 {miss} 指数收盘 {miss_close:.2f}；窗口跨过缺失日的调仓日 {len(hit)} 个：{hit[0]} 至 {hit[-1]}")

    # 分年
    m["year"] = m.t1.str[:4]
    ysrc = pd.Series(ix_days)
    yend = ysrc.groupby(ysrc.str[:4]).last()
    yend = {y: d for y, d in yend.items() if "2020" <= y <= "2026"}
    assert yend["2026"] == ends[-1] and yend["2020"] == ends[0]
    close = {y: float(ix.Close[d]) for y, d in yend.items()}
    years = []
    for y in ["2021", "2022", "2023", "2024", "2025", "2026"]:
        g = m[m.year == y]
        years.append(dict(y=y, n=len(g), rp=float(g.rp.sum()), rb=float(g.rb.sum()), ex=float(g.ex.sum()),
                          end=yend[y], close=close[y], chg=close[y] / close[str(int(y) - 1)] - 1))
    up = [r for r in years if r["chg"] > 0]
    down = [r for r in years if r["chg"] <= 0]
    up_ex, down_ex = sum(r["ex"] for r in up), sum(r["ex"] for r in down)
    for r in years:
        print(f"  {r['y']} {r['n']:>2} 月 方案 {r['rp']:+.5%} 基准 {r['rb']:+.5%} 超额 {r['ex']:+.5%} 指数 {r['end']} {r['close']:.2f} {r['chg']:+.4%}")
    print(f"  2020 年末 {yend['2020']} {close['2020']:.2f}；上涨年份 {[r['y'] for r in up]} 超额合计 {up_ex:+.5%}，其余年份 {down_ex:+.5%}")

    rule1, rule2 = share[top] >= SHARE_MIN, up_ex < 0
    verdict = {0: "无需补充披露", 1: "补充披露一项", 2: "补充披露两项"}[int(rule1) + int(rule2)]
    print(f"核对 3：贡献最大 {name[top]} 占比 {share[top]:.3%}（门槛 50%）；上涨年份超额 {up_ex:+.5%}（门槛 0）；结论 {verdict}")
    assert verdict == "补充披露两项" and share[top] > 0.55 and up_ex < -0.05
    assert min(abs(r["chg"]) for r in years) > 0.02

    pos_m = int((m.ex > 0).sum())
    best, worst = m.loc[m.ex.idxmax()], m.loc[m.ex.idxmin()]
    print(f"  超额为正 {pos_m} 个月；最大 {best.t1} {best.ex:+.5%}；最小 {worst.t1} {worst.ex:+.5%}")
    print("  首月", months[0], "\n  末月", months[-1])

    # 标准答案附件：xlsx
    p3 = lambda x: round(float(x) * 100, 3)
    e_head = ["代码", "名称", "持有月数", "超配贡献(%)", "低配贡献(%)", "累计贡献(%)", "贡献占比(%)"]
    e_rows = [[x, name[x], int(held_n[x]), p3(over[x]), p3(under[x]), p3(tot[x]), round(float(share[x]) * 100, 1)] for x in codes]
    y_head = ["年份", "月数", "方案收益合计(%)", "基准收益合计(%)", "超额(%)", "上证指数当年涨跌幅(%)"]
    y_rows = [[r["y"], r["n"], p3(r["rp"]), p3(r["rb"]), p3(r["ex"]), round(r["chg"] * 100, 2)] for r in years]
    m_head = ["调仓日", "持有到期日", "持仓（各三分之一）", "方案当月收益(%)", "基准当月收益(%)", "当月超额(%)"]
    m_rows = [[r.t, r.t1, r.held, p3(r.rp), p3(r.rb), p3(r.ex)] for r in m.itertuples()]
    o_head = ["年份", "当年最后一个交易日", "上证指数收盘", "当年涨跌幅(%)"]
    o_rows = [["2020", yend["2020"], round(close["2020"], 2), ""]] + [[r["y"], r["end"], round(r["close"], 2), round(r["chg"] * 100, 2)] for r in years]
    up_txt = "、".join(r["y"] for r in up)
    write_xlsx(
        ans / "ETF配权方案归因测算表.xlsx",
        [("逐只归因表", e_head, e_rows), ("分年归因表", y_head, y_rows), ("逐月明细", m_head, m_rows), ("在线数据", o_head, o_rows)],
        notes={
            "逐只归因表": [
                f"结论：{verdict}。",
                f"累计超额 {total:.3%}（方案收益合计 {m.rp.sum():.3%}，基准收益合计 {m.rb.sum():.3%}）。"
                f"超配贡献合计 {over.sum():.3%}，低配贡献合计 {under.sum():.3%}。",
                f"集中度：贡献最大的是{name[top]}，累计贡献 {tot[top]:.3%}，占比 {share[top]:.1%}，达到 50%，要披露。",
            ],
            "分年归因表": [
                f"行情适应性：上证指数上涨的年份是 {up_txt}，这三年超额合计 {up_ex:.3%}，小于 0，要披露。其余年份超额合计 {down_ex:.3%}。",
                "年份按持有到期日归属。",
            ],
            "逐月明细": [f"2020-12-31 至 2026-10-30 共 70 个月，都不扣交易成本。超额为正的有 {pos_m} 个月。"],
            "在线数据": [
                source_line(rec),
                "返回的 Date 是 UTC 时间，加 8 小时后的日期是交易日。指数没有分红和拆分，收盘价直接使用。2026 年算到 2026-10-30。",
                f"交易日核对：{days[0]} 至 {days[-1]} 上证指数有 {len(ix_days)} 个交易日，A01 只有 {len(days)} 个，缺 {miss}，"
                f"当天上证指数收盘 {miss_close:.2f}。",
                f"缺失日不补，波动率的窗口按 A01 里实际有的交易日往前数。窗口跨过缺失日的是 {hit[0]} 至 {hit[-1]} 的 {len(hit)} 个调仓日。",
            ],
        },
    )

    # 标准答案附件：docx
    gain = [x for x in order.index[:3]]
    loss = [x for x in order.index[::-1][:3]]
    line = lambda x: f"{name[x]} {tot[x]:+.3%}（占比 {share[x]:+.1%}，持有 {held_n[x]} 个月）"
    write_docx(
        ans / "ETF配权方案归因说明.docx",
        "ETF 组合低波动配权方案超额收益归因说明",
        [
            ("结论", [f"{verdict}。集中度和行情适应性两条规则都触发，定期报告的业绩说明里要写「超额收益集中于单只 ETF」和「上涨行情中落后于基准」。"]),
            ("累计超额", [
                f"2020-12-31 至 2026-10-30 共 70 个月。方案各月收益合计 {m.rp.sum():.3%}，10 只等权基准合计 {m.rb.sum():.3%}，累计超额 {total:.3%}。"
                f"超额为正的有 {pos_m} 个月。单月超额最高的是持有到 {best.t1} 的那个月，{best.ex:+.3%}；最低的是持有到 {worst.t1} 的那个月，{worst.ex:+.3%}。",
            ]),
            ("集中度", [
                f"贡献最大的是{name[top]}，70 个月里持有 {held_n[top]} 个月，累计贡献 {tot[top]:.3%}，占累计超额的 {share[top]:.1%}，达到 50% 的门槛。",
                "超额主要来自：" + "；".join(line(x) for x in gain) + "。",
                "主要亏在：" + "；".join(line(x) for x in loss) + "。",
                f"按来源分，超配贡献合计 {over.sum():.3%}，低配贡献合计 {under.sum():.3%}。"
                f"{name[loss[0]]}几乎一直没有持有，它的表现好于基准，低配贡献 {under[loss[0]]:.3%}，是最大的拖累。"
                f"{name[gain[1]]}从未持有，它的表现不如基准，所以贡献为正。",
            ]),
            ("行情适应性", [
                "上证指数各年涨跌幅：" + "，".join(f"{r['y']} 年 {r['chg']:+.2%}" for r in years) + "（2026 年算到 2026-10-30）。",
                "各年超额：" + "，".join(f"{r['y']} 年 {r['ex']:+.3%}" for r in years) + "。",
                f"指数上涨的 {up_txt} 三年，超额合计 {up_ex:.3%}，小于 0。其余三年超额合计 {down_ex:.3%}。方案的超额几乎都是在指数下跌的年份拿到的。",
            ]),
            ("在线数据和交易日核对", [
                f"上证指数（000001.SS）日线通过 US Stocks MCP 查询，取 2020 至 2025 年各年最后一个交易日和 2026-10-30 的收盘价："
                + "，".join(f"{yend[y]} {close[y]:.2f}" for y in sorted(yend)) + "。",
                f"{days[0]} 至 {days[-1]} 上证指数有 {len(ix_days)} 个交易日，A01 只有 {len(days)} 个，缺 {miss} 这一天。"
                f"缺失日没有补，波动率的窗口按 A01 里实际有的交易日往前数。{miss} 不是月末，不影响调仓日和各月涨跌幅；"
                f"{hit[0]} 至 {hit[-1]} 这 {len(hit)} 个调仓日的 250 日窗口跨过了它，窗口比日历上多往前取了一天。",
            ]),
            ("对应材料", ["逐只和分年的结果见《ETF配权方案归因测算表.xlsx》的「逐只归因表」「分年归因表」，70 个月的明细见「逐月明细」，"
                      "上证指数年末收盘和交易日核对见「在线数据」。两份文件的数字和结论相同。"]),
        ],
    )
    print("查询时间", rec["查询时间"], "返回", len(ix), "行", ix.index[0], ix.index[-1])
    print(source_line(rec))


if __name__ == "__main__":
    main()
