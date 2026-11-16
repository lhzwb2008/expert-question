#!/usr/bin/env python3
"""从公开冻结输入生成参考成果；仅给出题与验收人员，不作为 Input。"""
import argparse
import json
from pathlib import Path

import pandas as pd
from docx import Document
from openpyxl import Workbook
from openpyxl.styles import Font

PREFIX = "ETF配权_"
BOOK = "ETF配权方案归因测算表.xlsx"
MEMO = "ETF配权方案归因说明.docx"


def compute(root):
    pool = pd.read_csv(root / (PREFIX + "A02_ETF名单.csv"))
    codes = pool.code.tolist()
    names = dict(zip(pool.code, pool.name))
    raw = pd.read_csv(root / (PREFIX + "A01_ETF复权日线.csv"))
    px = raw.pivot(index="date", columns="code", values="adj_close")[codes].sort_index()
    assert px.notna().all().all() and (px > 0).all().all()
    ret = px.pct_change(fill_method=None)
    ends = px.index.to_series().groupby(px.index.str[:7]).last()
    ends = ends.loc["2020-12":"2026-10"].tolist()
    assert len(ends) == 71
    monthly, weights, contributions = [], [], []
    for t, t1 in zip(ends[:-1], ends[1:]):
        i = px.index.get_loc(t)
        window = ret.iloc[i - 249:i + 1]
        assert len(window) == 250 and window.notna().all().all()
        selected = window.std(ddof=1).sort_values(kind="mergesort").index[:3]
        w = pd.Series(0.0, index=codes)
        w[selected] = 1 / 3
        r = px.loc[t1] / px.loc[t] - 1
        rb, rp = float(r.mean()), float((r * w).sum())
        c = (w - 0.1) * (r - rb)
        assert abs(float(c.sum()) - (rp - rb)) < 1e-12
        monthly.append([t, t1, "、".join(names[x] for x in codes if w[x] > 0), rp, rb, rp - rb])
        weights.append(w)
        contributions.append(c)
    w, c = pd.DataFrame(weights), pd.DataFrame(contributions)
    total = sum(r[5] for r in monthly)
    over, under, totals = (c * (w > 0)).sum(), (c * (w == 0)).sum(), c.sum()
    holds, shares = (w > 0).sum(), totals / total
    rec = json.loads((root / (PREFIX + "MCP_000001.SS日线.json")).read_text(encoding="utf-8"))
    ix = pd.DataFrame(json.loads(rec["原始返回"]["content"][0]["text"]))
    ix["day"] = (pd.to_datetime(ix.Date.str[:19]) + pd.Timedelta(hours=8)).dt.strftime("%Y-%m-%d")
    assert not ix.day.duplicated().any()
    ix = ix.set_index("day").sort_index()
    ix = ix.loc[px.index[0]:px.index[-1]]
    missing, extra = sorted(set(ix.index) - set(px.index)), sorted(set(px.index) - set(ix.index))
    ye = ix.index.to_series().groupby(ix.index.str[:4]).last().loc["2020":"2026"]
    years = []
    for y in range(2021, 2027):
        rows = [r for r in monthly if r[1].startswith(str(y))]
        change = float(ix.loc[ye[str(y)], "Close"] / ix.loc[ye[str(y - 1)], "Close"] - 1)
        years.append([str(y), len(rows), sum(r[3] for r in rows), sum(r[4] for r in rows), sum(r[5] for r in rows), change])
    up_years = [r[0] for r in years if r[5] > 0]
    up_ex = sum(r[4] for r in years if r[5] > 0)
    top = totals.idxmax()
    rule1, rule2 = bool(shares[top] >= 0.5), bool(up_ex < 0)
    verdict = ["无需补充披露", "补充披露一项", "补充披露两项"][int(rule1) + int(rule2)]
    p3 = lambda x: round(float(x) * 100, 3)
    sheets = {
        "逐只归因表": [["代码", "名称", "持有月数", "超配贡献(%)", "低配贡献(%)", "累计贡献(%)", "贡献占比(%)"]] + [
            [x, names[x], int(holds[x]), p3(over[x]), p3(under[x]), p3(totals[x]), round(float(shares[x]) * 100, 1)] for x in codes],
        "分年归因表": [["年份", "月数", "方案收益合计(%)", "基准收益合计(%)", "超额(%)", "上证指数当年涨跌幅(%)"]] + [
            [r[0], r[1], p3(r[2]), p3(r[3]), p3(r[4]), round(r[5] * 100, 2)] for r in years],
        "逐月明细": [["调仓日", "持有到期日", "持仓（各三分之一）", "方案当月收益(%)", "基准当月收益(%)", "当月超额(%)"]] + [
            r[:3] + [p3(x) for x in r[3:]] for r in monthly],
        "来源核对": [["年份", "当年最后一个交易日", "上证指数收盘", "当年涨跌幅(%)"]] + [
            [y, day, round(float(ix.loc[day, "Close"]), 2), "" if y == "2020" else round(years[int(y) - 2021][5] * 100, 2)] for y, day in ye.items()],
    }
    result = {
        "verdict": verdict, "total_pct": p3(total), "portfolio_pct": p3(sum(r[3] for r in monthly)),
        "benchmark_pct": p3(sum(r[4] for r in monthly)), "top": names[top], "top_pct": p3(totals[top]),
        "top_share_pct": round(float(shares[top]) * 100, 1), "up_years": up_years, "up_ex_pct": p3(up_ex),
        "missing": missing, "extra": extra, "etf_days": len(px), "index_days": len(ix),
        "source_time": rec["查询时间"], "source_parameters": rec["参数"],
        "positive_months": sum(r[5] > 0 for r in monthly),
        "gain": [[names[x], p3(totals[x])] for x in totals.sort_values(ascending=False).index[:3]],
        "loss": [[names[x], p3(totals[x])] for x in totals.sort_values().index[:3]],
        "sheets": sheets,
    }
    return result


def produce(root, out, write_basis=True):
    result = compute(root)
    out.mkdir(parents=True, exist_ok=True)
    wb = Workbook()
    wb.active.title = "逐只归因表"
    for i, (name, rows) in enumerate(result["sheets"].items()):
        ws = wb.active if i == 0 else wb.create_sheet(name)
        for row in rows:
            ws.append(row)
        for cell in ws[1]:
            cell.font = Font(bold=True)
        ws.freeze_panes = "A2"
        for column in ws.columns:
            ws.column_dimensions[column[0].column_letter].width = min(52, max(18, max(len(str(c.value or "")) for c in column) * 1.5))
    ws = wb["来源核对"]
    for line in [
        "来源：随附冻结的 US Stocks MCP 指数日线导出；数据来自 Yahoo Finance，不要求本次联网。",
        "查询时间：" + result["source_time"],
        "工具：get_historical_stock_prices；参数：" + json.dumps(result["source_parameters"], ensure_ascii=False),
        "日期：原返回 Date 为 UTC，转换为 UTC+8 后取交易日；指数点位不做分红复权。",
        "交易日核对：ETF %s 日，指数 %s 日；ETF 缺失 %s，多出 %s。" % (result["etf_days"], result["index_days"], result["missing"], result["extra"]),
        "处理：不插补 ETF 缺失日，波动率窗口按 A01 实际交易日；2026 年截至 2026-10-30。",
    ]:
        ws.append([])
        ws.append([line])
    wb.save(out / BOOK)
    doc = Document()
    doc.add_heading("ETF 组合低波动配权方案超额收益归因说明", 0)
    blocks = [
        ("结论", result["verdict"] + "。以下数字均使用冻结附件计算，未在本次重新联网取数。"),
        ("总体结果", "2020-12-31至2026-10-30共70个月，方案收益算术合计 %.3f%%，基准收益算术合计 %.3f%%，累计超额 %.3f%%；超额为正 %s 个月。不将月度超额复利化。" % (result["portfolio_pct"], result["benchmark_pct"], result["total_pct"], result["positive_months"])),
        ("集中度披露", "最大累计贡献来自%s，累计贡献 %.3f%%，占累计超额 %.1f%%，达到 50%% 门槛，需披露超额收益集中于单只 ETF。" % (result["top"], result["top_pct"], result["top_share_pct"])),
        ("行情适应性披露", "指数上涨年份为%s，这些年份方案超额算术合计 %.3f%%，小于 0，需披露上涨行情中落后于基准。" % ("、".join(result["up_years"]), result["up_ex_pct"])),
        ("正负贡献来源", "主要正贡献：" + "；".join("%s %.3f%%" % tuple(r) for r in result["gain"]) + "。主要负贡献：" + "；".join("%s %.3f%%" % tuple(r) for r in result["loss"]) + "。医药ETF未持有但有正的低配贡献；不能把正贡献等同于实际持有获利。纳指ETF主要因低配表现较好的资产拖累方案相对收益。"),
        ("来源与日期核对", "输入为预先冻结的指数导出，参数%s，查询时间%s。Date 从 UTC 换为 UTC+8。ETF 共%s个交易日，指数共%s个，ETF 缺失%s；不插补，窗口按 A01 实际日历计数。2026年仅截至10月30日，不代表全年结果。" % (json.dumps(result["source_parameters"], ensure_ascii=False), result["source_time"], result["etf_days"], result["index_days"], "、".join(result["missing"]))),
        ("口径与边界", "方案与基准均使用十只ETF的复权价；基准为十只ETF等权，不是上证指数。按含调仓日的250个日收益样本标准差配权，不扣交易成本；跨月贡献直接相加，年份按持有到期日。披露判断仅针对本次冻结区间及给定规则，不构成未来收益承诺。明细见同名测算表四张工作表。"),
    ]
    for title, text in blocks:
        doc.add_heading(title, 1)
        doc.add_paragraph(text)
    doc.save(out / MEMO)
    if write_basis:
        (out / "核对基准.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "sheets"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    produce(args.input, args.out)
