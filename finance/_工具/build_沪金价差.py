#!/usr/bin/env python3
"""打包第 08 题「沪金境内外价差序列编制与11月预警带校准」。

2026-11-20 按质检返修意见从「沪金午休跟随规则实盘准入」换了方向：原题和 07 一样是逐笔回测、滚动权益、三条门槛定准入，
被判重复考察。新题不做交易回测，核心是跨市场比价：夜盘归属交易日、主力合约、11:30 两边的价格、盎司换克、汇率时点和时区、
期货持有成本折现货、滚动分位数预警带。

沿用底稿 high-econ/一期/au_lunch_gate 的两份行情附件（沪金 5 分钟线、伦敦金午休 1 分钟线），内容不改，只改文件名。
美元兑人民币日线是 fetch_新题.py 通过 US Stocks MCP 查的（新题数据/沪金价差/CNY=X.json）。
口径（11:30 时点、2.00% 资金成本、250 日 5%/95% 分位）是按题目需要拟的。
"""
from __future__ import annotations

import bisect
import datetime as dt
import json

import numpy as np
import pandas as pd

from build_common import CASES, OUT, copy_as, fresh_dir, load_mcp, source_line, write_docx, write_xlsx
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = CASES / "一期" / "au_lunch_gate" / "attachments"
DST = OUT / "题目" / "08_沪金境内外价差"
DOC = HERE / "新题口径" / "沪金价差"
RAW = HERE / "新题数据" / "沪金价差" / "CNY=X.json"
P = "价差_"
MCP = f"{P}MCP_美元兑人民币日线.json"
START, END = "2021-11-01", "2026-10-30"
OZ, RATE, WIN, LO, HI = 31.1034768, 0.02, 250, 5, 95
NA = "缺数"  # 「逐日价差」里真正缺失的单元格写这两个字；空白只用在备注列


def trading_day(ts: pd.Series) -> pd.Series:
    t = ts + pd.Timedelta(hours=3)
    wd = t.dt.weekday
    add = np.where(wd == 5, 2, np.where(wd == 6, 1, 0))
    return (t.dt.normalize() + pd.to_timedelta(add, unit="D")).dt.strftime("%Y-%m-%d")


def pct_inc(x, q):
    return float(np.percentile(np.asarray(x, dtype=float), q, method="linear"))


def check_missing_days(xlsx: Path, a: pd.DataFrame, x: pd.Series, fx: pd.DataFrame, days: list[str], miss: list[str]) -> None:
    """回读「逐日价差」，逐个缺数日直接从 A01、A02 和汇率返回重新取数核对（不复用上面的中间结果）：
    已取得的七列和来源一致，依赖伦敦金的四列写「缺数」；有效日的十二列都是取得的数。"""
    from openpyxl import load_workbook
    ws = load_workbook(xlsx)["逐日价差"]
    head = [c.value for c in ws[1]]
    got = {}
    for cells in ws.iter_rows(min_row=2, values_only=True):
        if cells[0] and str(cells[0])[:2] == "20" and len(str(cells[0])) == 10:
            got[cells[0]] = dict(zip(head, cells))
    london = ["伦敦金价(美元/盎司)", "伦敦金人民币价(元/克)", "境内外价差(元/克)", "不折持有成本的价差(元/克)"]
    known = ["合约", "最后交易日", "剩余自然日", "沪金价(元/克)", "沪金折现货价(元/克)", "汇率所属伦敦日期", "美元兑人民币"]
    fxs = fx.assign(c4=fx.Close.round(4)).set_index("ld").c4.sort_index()
    for d, g in got.items():
        if d not in miss:
            assert all(g[h] not in (None, "", NA) for h in known + london), d
            continue
        prev = days[days.index(d) - 1]
        v = a[a.td == prev].groupby("Contract").Volume.sum()
        c = sorted(v[v == v.max()].index)[0]
        d15 = dt.date(2000 + int(c[2:4]), int(c[4:6]), 15)
        ltd_ = next(day for day in days if day >= d15.isoformat())
        assert all(not (d15.isoformat() <= day < ltd_) for day in days)
        n = (dt.date.fromisoformat(ltd_) - dt.date.fromisoformat(d)).days
        bar = a[(a.DateTime == f"{d} 11:25:00") & (a.Contract == c)].Close
        assert len(bar) == 1
        fd = fxs.index[fxs.index < d][-1]
        want = {"合约": c, "最后交易日": ltd_, "剩余自然日": n, "沪金价(元/克)": float(bar.iloc[0]),
                "沪金折现货价(元/克)": round(float(bar.iloc[0]) / (1 + RATE * n / 365), 4), "汇率所属伦敦日期": fd, "美元兑人民币": float(fxs[fd])}
        assert {h: g[h] for h in known} == want, (d, {h: g[h] for h in known}, want)
        assert not any(t.startswith(d) for t in x.index), d          # A02 这一天确实没有午休 1 分钟线
        assert all(g[h] == NA for h in london) and g["备注"].startswith("缺数日：伦敦金11:29 没有 K 线"), d
        print(f"     缺数日 {d}：{c} 最后交易日 {ltd_} 剩 {n} 天，沪金 {want['沪金价(元/克)']} 折现货 {want['沪金折现货价(元/克)']}，"
              f"汇率 {fd} {want['美元兑人民币']}；伦敦金四列「{NA}」")
    assert sorted(miss) == sorted(d for d in got if d in miss) and len(miss) == 10


def main() -> None:
    att, ans = fresh_dir(DST / "题目附件"), fresh_dir(DST / "标准答案附件")
    fresh_dir(DST / "MCP结果文件")
    copy_as(SRC / "A01_au_5m.csv", att / f"{P}A01_沪金5分钟线.csv")
    copy_as(SRC / "A02_xau_lunch_1m.csv", att / f"{P}A02_伦敦金午休1分钟线.csv")
    copy_as(DOC / "A03_价差口径.md", att / f"{P}A03_价差口径.md")
    copy_as(DOC / "A04_预警带与交付.md", att / f"{P}A04_预警带与交付.md")
    copy_as(RAW, DST / "MCP结果文件" / MCP)
    copy_as(RAW, att / MCP)

    # ---- 只用附件重算 ----
    a = pd.read_csv(att / f"{P}A01_沪金5分钟线.csv")
    a["td"] = trading_day(pd.to_datetime(a.DateTime))
    days = sorted(a.td.unique())
    tds = set(days)
    vol = a.groupby(["td", "Contract"]).Volume.sum().reset_index().sort_values(["td", "Volume", "Contract"], ascending=[True, False, True])
    top = vol.groupby("td").Contract.first()
    main_c = {days[i]: top[days[i - 1]] for i in range(1, len(days))}
    sh = a.set_index(["DateTime", "Contract"]).Close
    x = pd.read_csv(att / f"{P}A02_伦敦金午休1分钟线.csv").set_index("DateTime").Close

    rec, text = load_mcp(att / MCP)
    fx = pd.DataFrame(json.loads(text))
    utc = pd.to_datetime(fx.Date.str[:19])
    assert set(fx.Date.str[11:13]) <= {"23", "00"}
    fx["ld"] = (utc + pd.Timedelta(hours=1)).dt.strftime("%Y-%m-%d")
    assert not fx.ld.duplicated().any()
    fx = fx.sort_values("ld")
    fdays, fclose = list(fx.ld), list(fx.Close.round(4))

    def fx_before(d):
        i = bisect.bisect_left(fdays, d) - 1
        return fdays[i], float(fclose[i])

    def ltd(c):
        d = dt.date(2000 + int(c[2:4]), int(c[4:6]), 15)
        while (d.isoformat() not in tds) if d.isoformat() <= days[-1] else d.weekday() >= 5:
            d += dt.timedelta(days=1)
        return d.isoformat()

    last_bar = a.groupby("Contract").td.max()
    for c in {main_c[d] for d in days if START <= d <= END and d in main_c}:
        if c in last_bar and last_bar[c] < days[-1]:
            assert ltd(c) == last_bar[c], (c, ltd(c), last_bar[c])

    rows, miss = [], []
    for d in days:
        if not (START <= d <= END):
            continue
        c = main_c[d]
        k = (f"{d} 11:25:00", c)
        lk = f"{d} 11:29:00"
        lack = [n for n, ok in (("沪金11:25", k in sh.index), ("伦敦金11:29", lk in x.index)) if not ok]
        # 2026-11-26 最终质检：缺数日只缺伦敦金 11:29，沪金价、合约规则和汇率仍能取得，照常算出来列进表里
        assert lack in ([], ["伦敦金11:29"]), (d, lack)
        p_sh = float(sh[k])
        fd, f = fx_before(d)
        l = ltd(c)
        n = (dt.date.fromisoformat(l) - dt.date.fromisoformat(d)).days
        spot = p_sh / (1 + RATE * n / 365)
        if lack:
            miss.append((d, c, "、".join(lack) + " 没有 K 线", dict(ltd=l, n=n, sh=p_sh, spot=spot, fd=fd, fx=f)))
            continue
        p_x = float(x[lk])
        ext = p_x * f / OZ
        rows.append(dict(d=d, c=c, ltd=l, n=n, sh=p_sh, spot=spot, x=p_x, fd=fd, fx=f, ext=ext, pr=spot - ext, raw=p_sh - ext))
    r = pd.DataFrame(rows)
    pr = r.pr.values
    # 每天的预警带：之前 250 个有效日
    band = {}
    for i in range(WIN, len(r)):
        w = pr[i - WIN:i]
        band[r.d.iloc[i]] = (pct_inc(w, LO), pct_inc(w, HI))
    alerts = []
    for i, row in r[(r.d >= "2026-01-01")].iterrows():
        lo, hi = band[row.d]
        if row.pr > hi or row.pr < lo:
            alerts.append(dict(d=row.d, pr=row.pr, lo=lo, hi=hi, side="溢价预警" if row.pr > hi else "折价预警"))
    last = r.iloc[-1]
    w_nov = pr[-WIN:]
    nov = (pct_inc(w_nov, LO), pct_inc(w_nov, HI))
    pos = float((w_nov < last.pr).sum()) / WIN
    lo30, hi30 = band[last.d]
    st30 = "溢价预警" if last.pr > hi30 else ("折价预警" if last.pr < lo30 else "不预警")
    yr = []
    for y, g in r.groupby(r.d.str[:4]):
        imax, imin = g.pr.idxmax(), g.pr.idxmin()
        yr.append(dict(y=y, n=len(g), mean=g.pr.mean(), med=g.pr.median(), max=g.pr[imax], dmax=g.d[imax], min=g.pr[imin], dmin=g.d[imin],
                       neg=int((g.pr < 0).sum())))
    octo = r[r.d >= "2026-10-01"]
    oct_pr, oct_raw = float(octo.pr.mean()), float(octo.raw.mean())
    n_alert_hi = sum(1 for e in alerts if e["side"] == "溢价预警")

    print(f"[08] 有效日 {len(r)}，缺数日 {len(miss)}：{[m[0] for m in miss]}")
    for z in yr:
        print(f"     {z['y']} {z['n']} 天 均值 {z['mean']:.4f} 中位 {z['med']:.4f} 最大 {z['max']:.4f}({z['dmax']}) 最小 {z['min']:.4f}({z['dmin']}) 负 {z['neg']}")
    print(f"     2026 预警 {len(alerts)} 天（溢价 {n_alert_hi}）：{[(e['d'], e['side'][:2], round(e['pr'], 2)) for e in alerts]}")
    print(f"     10-30 价差 {last.pr:.4f}（未折 {last.raw:.4f}），位置 {pos:.2%}，当天带 [{lo30:.4f}, {hi30:.4f}] {st30}；11月带 [{nov[0]:.4f}, {nov[1]:.4f}]")
    print(f"     10 月平均 {oct_pr:.4f}，未折 {oct_raw:.4f}；窗口起点 {r.d.iloc[-WIN]}")
    # 错法
    print(f"     错法：汇率用当天那一行 10-30 价差 {last.spot - last.x * float(fx.set_index('ld').Close.round(4)[last.d]) / OZ:.4f}")
    assert len(miss) == 10 and st30 == "不预警" and abs(nov[1] - nov[0]) > 5
    assert min(abs(e["pr"] - e["hi"]) if e["side"] == "溢价预警" else abs(e["pr"] - e["lo"]) for e in alerts) > 0.27

    # ---- 输出 ----
    d_rows = [[z.d, z.c, z.ltd, int(z.n), z.sh, round(z.spot, 4), z.x, z.fd, z.fx, round(z.ext, 4), round(z.pr, 4), round(z.raw, 4), ""] for z in r.itertuples()]
    d_rows += [[m[0], m[1], m[3]["ltd"], int(m[3]["n"]), m[3]["sh"], round(m[3]["spot"], 4), NA, m[3]["fd"], m[3]["fx"], NA, NA, NA,
                f"缺数日：{m[2]}。伦敦金价、伦敦金人民币价和两列价差记「{NA}」，其余字段已取得。"] for m in miss]
    d_rows.sort(key=lambda q: q[0])
    y_rows = [[z["y"], z["n"], round(z["mean"], 4), round(z["med"], 4), round(z["max"], 4), z["dmax"], round(z["min"], 4), z["dmin"], z["neg"]] for z in yr]
    a_rows = [[e["d"], round(e["pr"], 4), round(e["lo"], 4), round(e["hi"], 4), e["side"]] for e in alerts]
    a_rows += [[], ["11月预警带（截至2026-10-30的250个有效日）", "", round(nov[0], 4), round(nov[1], 4), f"窗口 {r.d.iloc[-WIN]} 至 {END}"],
               ["2026-10-30", round(last.pr, 4), round(lo30, 4), round(hi30, 4), f"{st30}；低于它的天数占 {pos * 100:.2f}%"]]
    o_rows = [[z.d, z.fd, z.fx] for z in octo.itertuples()]
    raw_n = len(fx)
    write_xlsx(ans / "沪金境内外价差监测表.xlsx",
               [("逐日价差", ["交易日", "合约", "最后交易日", "剩余自然日", "沪金价(元/克)", "沪金折现货价(元/克)", "伦敦金价(美元/盎司)", "汇率所属伦敦日期",
                          "美元兑人民币", "伦敦金人民币价(元/克)", "境内外价差(元/克)", "不折持有成本的价差(元/克)", "备注"], d_rows),
                ("年度统计", ["年份", "有效日数", "均值(元/克)", "中位数(元/克)", "最大值(元/克)", "最大值日期", "最小值(元/克)", "最小值日期", "价差为负的天数"], y_rows),
                ("预警记录", ["交易日", "境内外价差(元/克)", "下限(元/克)", "上限(元/克)", "预警方向"], a_rows),
                ("在线数据", ["交易日", "汇率所属伦敦日期", "美元兑人民币(收盘，保留4位)"], o_rows)],
               notes={"逐日价差": [f"{START} 至 {END}，有效日 {len(r)} 个，缺数日 {len(miss)} 个（伦敦金 11:29 没有 K 线）。",
                               f"缺数日只缺伦敦金 11:29 的价格，依赖它的四列写「{NA}」，其余各列照常取得、算法同有效日；缺数日不进年度统计和预警带。",
                               "沪金折现货价 = 沪金价 ÷ (1 + 2.00% × 剩余自然日 ÷ 365)；伦敦金人民币价 = 伦敦金价 × 汇率 ÷ 31.1034768。"],
                      "预警记录": [f"每天的预警带用这一天之前 250 个有效日价差的 5%、95% 分位（线性插值）。2026 年触发 {len(alerts)} 天，其中溢价 {n_alert_hi} 天、折价 {len(alerts) - n_alert_hi} 天。"],
                      "在线数据": [source_line(rec), f"返回 {raw_n} 行，伦敦日期 {fdays[0]} 至 {fdays[-1]}。",
                               "Date 是伦敦时间零点：英国夏令时期间写成前一天 23:00 UTC，其余写成当天 00:00 UTC，加 1 小时后取日期就是伦敦日期。",
                               "11:30 时当天外汇日线还没收盘，每个交易日用伦敦日期早于它的最近一行的收盘价。上表列出 2026 年 10 月用到的汇率。"]})
    check_missing_days(ans / "沪金境内外价差监测表.xlsx", a, x, fx, days, [m[0] for m in miss])
    f2 = lambda v: f"{v:.2f}"
    write_docx(ans / "沪金境内外价差监测说明.docx", "沪金境内外价差序列编制与11月预警带", [
        ("结论", [f"11 月的价差预警带是 {f2(nov[0])} 至 {f2(nov[1])} 元/克（截至 2026-10-30 的 250 个有效日价差的 5% 和 95% 分位）。",
                f"2026-10-30 价差 {f2(last.pr)} 元/克，在 250 个有效日里低于它的天数占 {pos * 100:.2f}%，按当天的预警带 {f2(lo30)} 至 {f2(hi30)} 元/克{('没有触发预警' if st30 == '不预警' else '触发' + st30)}。",
                f"2026 年 1 月至 10 月有 {len(alerts)} 天触发预警，溢价 {n_alert_hi} 天、折价 {len(alerts) - n_alert_hi} 天。"]),
        ("怎么算的", ["每个交易日比较 11:30 的价格：沪金用上一交易日成交量最大的合约 11:25 那根 5 分钟线的收盘价，伦敦金用 11:29 那根 1 分钟线的收盘价。",
                   "沪金先按 2.00% 的年化资金成本和到最后交易日的自然日数折成现货口径；伦敦金按美元兑人民币汇率和 31.1034768 克/盎司折成元/克。",
                   "汇率通过 US Stocks MCP 查询 CNY=X 日线，11:30 时当天还没收盘，用伦敦日期早于当天的最近一个收盘价；时间戳先加 1 小时换成伦敦日期。",
                   f"缺数日 {len(miss)} 个，都是伦敦金 11:29 没有 K 线（圣诞节和耶稣受难日前后伦敦金休市）：" + "、".join(m[0] for m in miss) + "。"]),
        ("各年的情况", [f"{z['y']} 年 {z['n']} 天，均值 {f2(z['mean'])}，中位数 {f2(z['med'])}，最高 {f2(z['max'])}（{z['dmax']}），最低 {f2(z['min'])}（{z['dmin']}），折价 {z['neg']} 天。" for z in yr]
         + ["2023 年境内溢价最高，2023-09-15 到过 26.79 元/克；2025 年以后均值回到 1 元/克以内，折价的天数明显增多。"]),
        ("2026 年的预警", ["；".join(f"{e['d']} {f2(e['pr'])}（{e['side']}，带 {f2(e['lo'])} 至 {f2(e['hi'])}）" for e in alerts) + "。"]),
        ("持有成本的影响", [f"2026 年 10 月不折持有成本的平均价差是 {f2(oct_raw)} 元/克，折了以后是 {f2(oct_pr)} 元/克。"
                       "沪金期货价格里含着到最后交易日的资金成本，离交割越远越高，换月那天价差会跳一下；不折的话会把这部分当成境内溢价。"]),
    ])


if __name__ == "__main__":
    main()
