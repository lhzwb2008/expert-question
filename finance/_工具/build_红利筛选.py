#!/usr/bin/env python3
"""打包「港股红利候选池股息稳定性筛选」（三轮链的第一轮）：题目附件、标准答案附件。

除息记录来自 US Stocks MCP 的实际调用（新题数据/港股红利/），日行情和名称来自 LongPort（新题数据/港股红利_longport/），
口径文件在 新题口径/红利筛选/。行业分类是下面 IND 里拟的。A02 除息记录收录 29 只，中国神华（1088.HK）留给在线 MCP 查询。

脚本做的事：
1. 生成 A01（候选池）、A02（除息记录）、A03（日行情）。
2. 只用题目附件加中国神华的 MCP 结果文件重算，生成标准答案附件。第二轮读这里生成的筛选表。
3. 算一遍常见错误的结果。
"""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from fractions import Fraction as F
from pathlib import Path

import pandas as pd

from build_common import OUT, copy_as, fresh_dir, load_mcp_prices, source_line, write_docx, write_xlsx

HERE = Path(__file__).resolve().parent
RAW = HERE / "新题数据" / "港股红利"
LP = HERE / "新题数据" / "港股红利_longport"
DOC = HERE / "新题口径" / "红利筛选"
DST = OUT / "题目" / "13_港股红利候选池筛选"
PREFIX = "红利筛选_"
MCP_CODE = "1088.HK"
MCP_FILE = f"{PREFIX}MCP_1088.HK日线.json"
BASE, WIN0, QUOTE0 = "2026-10-30", "2025-10-30", "2026-07-02"
YEARS = (2022, 2023, 2024, 2025)
TURNOVER = F(100_000_000)
CUT = F(7, 10)
CAP, N = 4, 15
IND = [  # 代码, 行业
    ("0939.HK", "银行"), ("1398.HK", "银行"), ("3988.HK", "银行"), ("1288.HK", "银行"), ("3968.HK", "银行"),
    ("3328.HK", "银行"), ("0005.HK", "银行"), ("2388.HK", "银行"),
    ("0883.HK", "能源"), ("0857.HK", "能源"), ("0386.HK", "能源"), ("1088.HK", "能源"), ("1898.HK", "能源"), ("1171.HK", "能源"),
    ("0941.HK", "电信"), ("0728.HK", "电信"), ("0762.HK", "电信"),
    ("0002.HK", "公用事业"), ("0003.HK", "公用事业"), ("0006.HK", "公用事业"), ("0836.HK", "公用事业"), ("0902.HK", "公用事业"),
    ("0016.HK", "地产"), ("1972.HK", "地产"), ("0823.HK", "地产"),
    ("1919.HK", "交通运输"), ("0177.HK", "交通运输"), ("0548.HK", "交通运输"),
    ("0914.HK", "建材"), ("2318.HK", "保险"),
]


def dividends_from_mcp(path: Path) -> list[tuple[str, F]]:
    _, d = load_mcp_prices(path, 8)
    d = d[(d.Dividends > 0) & (d.index <= BASE)]
    return [(day, F(f"{v:.4f}")) for day, v in d.Dividends.items()]


def screen(pool: list[dict], divs: dict[str, list], quotes: dict[str, pd.DataFrame], closed: bool = False,
           nocap: bool = False, nofilter: bool = False):
    """按 A04 走一遍。closed、nocap、nofilter 只在算常见错误时用。"""
    rows = []
    for p in pool:
        c = p["code"]
        q = quotes[c]
        q = q[q.date <= BASE]
        assert len(q) >= 60 and q.date.iloc[-1] == BASE
        to60 = sum(F(x) for x in q.turnover.tail(60)) / 60
        dv = divs[c]
        yr = {y: sum((v for d, v in dv if d[:4] == str(y)), F(0)) for y in YEARS}
        cont = all(yr[y] > 0 for y in YEARS)
        ratio = {y: (yr[y] / yr[y - 1] if yr[y - 1] else None) for y in YEARS[1:]}
        nocut = all(ratio[y] is not None and ratio[y] >= CUT for y in YEARS[1:])
        liq = to60 >= TURNOVER
        ttm = sum((v for d, v in dv if (WIN0 <= d if closed else WIN0 < d) and d <= BASE), F(0))
        close = F(q.close.iloc[-1])
        rows.append(dict(code=c, name=p["name"], ind=p["industry"], to60=to60, yr=yr, ratio=ratio, liq=liq, cont=cont,
                         nocut=nocut, ok=nofilter or (liq and cont and nocut), ttm=ttm, close=close, y=ttm / close))
    ranked = sorted([r for r in rows if r["ok"]], key=lambda r: -r["y"])
    assert len({r["y"] for r in ranked}) == len(ranked)
    sel, cnt = [], defaultdict(int)
    for i, r in enumerate(ranked, 1):
        r["rank"] = i
        if len(sel) == N:
            r["why"] = "名额已满"
            continue
        if not nocap and cnt[r["ind"]] >= CAP:
            r["why"] = f"{r['ind']}已选满{CAP}只"
            continue
        cnt[r["ind"]] += 1
        r["sel"] = True
        sel.append(r)
    for r in rows:
        if not r["ok"]:
            bad = [s for s, ok in (("流动性", r["liq"]), ("连续派息", r["cont"]), ("不削减", r["nocut"])) if not ok]
            r["why"] = "、".join(bad) + "不满足"
    assert len(sel) == N
    return rows, sel


def main() -> None:
    att = fresh_dir(DST / "题目附件")
    ans = fresh_dir(DST / "标准答案附件")
    (DST / "MCP结果文件").mkdir(exist_ok=True)
    copy_as(RAW / f"{MCP_CODE}.json", DST / "MCP结果文件" / MCP_FILE)
    info = {x["symbol"]: x for x in json.load(open(LP / "static_info.json", encoding="utf-8"))}

    # 1. 附件
    with open(att / f"{PREFIX}A01_候选池.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["code", "name", "industry"])
        for c, ind in IND:
            w.writerow([c, info[c]["name_cn"], ind])
    with open(att / f"{PREFIX}A02_除息记录.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["code", "ex_date", "dps"])
        for c, _ in IND:
            if c == MCP_CODE:
                continue
            for d, v in dividends_from_mcp(RAW / f"{c}.json"):
                w.writerow([c, d, f"{float(v):.4f}"])
    with open(att / f"{PREFIX}A03_日行情.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["code", "date", "close", "turnover"])
        for c, _ in IND:
            for r in json.load(open(LP / f"{c}_noadj.json", encoding="utf-8")):
                if QUOTE0 <= r["date"] <= BASE:
                    w.writerow([c, r["date"], r["close"], f"{float(r['turnover']):.2f}"])
    copy_as(DOC / "A04_筛选口径与交付.md", att / f"{PREFIX}A04_筛选口径与交付.md")
    copy_as(DST / "MCP结果文件" / MCP_FILE, att / MCP_FILE)

    # 2. 只用题目附件重算
    pool = list(csv.DictReader(open(att / f"{PREFIX}A01_候选池.csv", encoding="utf-8")))
    a02 = pd.read_csv(att / f"{PREFIX}A02_除息记录.csv", dtype=str)
    a03 = pd.read_csv(att / f"{PREFIX}A03_日行情.csv", dtype=str)
    divs = {c: [(r.ex_date, F(r.dps)) for r in g.itertuples()] for c, g in a02.groupby("code")}
    rec, m = load_mcp_prices(att / MCP_FILE, 8)
    assert set(m.Date.str[11:13]) == {"16"} and float(m["Stock Splits"].abs().sum()) == 0
    divs[MCP_CODE] = dividends_from_mcp(att / MCP_FILE)
    quotes = {c: g.sort_values("date").reset_index(drop=True) for c, g in a03.groupby("code")}
    assert len(divs) == 30 and len(quotes) == 30
    rows, sel = screen(pool, divs, quotes)

    fl = float
    pc = lambda x: f"{fl(x) * 100:.2f}%"
    print(f"A02 {len(a02)} 行，A03 {len(a03)} 行")
    for r in sorted(rows, key=lambda r: -r["y"]):
        print(f"  {r['code']} {r['name']:8} {r['ind']:4} 成交额 {fl(r['to60']) / 1e8:6.2f}亿 比值 "
              f"{[round(fl(v), 4) if v is not None else None for v in r['ratio'].values()]} 股息率 {pc(r['y'])} "
              f"{'入选' if r.get('sel') else r.get('why', '')}")
    print("入选", [r["code"] for r in sel])
    sh = next(r for r in rows if r["code"] == MCP_CODE)
    mcp_div = divs[MCP_CODE]
    on_edge = [d for d, _ in mcp_div if d == WIN0]
    assert on_edge, "中国神华应有一次除息日正好落在 2025-10-30"
    assert sh.get("sel")

    # 常见错误
    keep = {r["code"] for r in sel}
    wrong = {}
    for kw, label in ((dict(closed=True), "窗口含 2025-10-30"), (dict(nocap=True), "不设行业上限"), (dict(nofilter=True), "不做三条筛选")):
        r2, s2 = screen(pool, divs, quotes, **kw)
        wrong[label] = (r2, s2)
        print(f"  {label}：多 {[r['code'] for r in s2 if r['code'] not in keep]}，少 {[r['code'] for r in sel if r['code'] not in {x['code'] for x in s2}]}")
    sh_closed = next(r for r in wrong["窗口含 2025-10-30"][0] if r["code"] == MCP_CODE)
    pool29 = [p for p in pool if p["code"] != MCP_CODE]
    _, s3 = screen(pool29, divs, quotes)
    print(f"  漏掉中国神华：多 {[r['code'] for r in s3 if r['code'] not in keep]}")
    print(f"  中国神华窗口含 2025-10-30 时股息率 {pc(sh_closed['y'])}，正确 {pc(sh['y'])}")

    # 3. 标准答案附件
    r4 = lambda x: round(fl(x), 4)
    j_head = ["代码", "名称", "行业", "60日日均成交额(港元)"] + [f"{y}年每股派息(港元)" for y in YEARS] + \
             [f"{y}/{y - 1}" for y in YEARS[1:]] + ["流动性", "连续派息", "不削减", "近12个月每股派息(港元)", "基准日收盘价(港元)",
                                                  "近12个月股息率(%)", "排序名次", "是否入选", "未入选原因"]
    yn = lambda b: "满足" if b else "不满足"
    j_rows = []
    for r in rows:
        j_rows.append([r["code"], r["name"], r["ind"], round(fl(r["to60"]), 2)] + [r4(r["yr"][y]) for y in YEARS] +
                      [r4(r["ratio"][y]) if r["ratio"][y] is not None else "上年无派息" for y in YEARS[1:]] +
                      [yn(r["liq"]), yn(r["cont"]), yn(r["nocut"]), r4(r["ttm"]), fl(r["close"]), round(fl(r["y"]) * 100, 2),
                       r.get("rank", "—"), "是" if r.get("sel") else "否", "" if r.get("sel") else r["why"]])
    s_head = ["入选顺序", "代码", "名称", "行业", "近12个月每股派息(港元)", "基准日收盘价(港元)", "近12个月股息率(%)"]
    s_rows = [[i, r["code"], r["name"], r["ind"], r4(r["ttm"]), fl(r["close"]), round(fl(r["y"]) * 100, 2)] for i, r in enumerate(sel, 1)]
    o_head = ["除息日(香港)", "MCP返回的Date(UTC)", "每股派息(港元)", "归属年份", "计入近12个月"]
    raw_dates = dict(zip(m.index, m.Date))
    o_rows = [[d, raw_dates[d], r4(v), d[:4], "是" if WIN0 < d <= BASE else "否"] for d, v in mcp_div]
    cnt = defaultdict(int)
    for r in sel:
        cnt[r["ind"]] += 1
    skipped = sorted([r for r in rows if r.get("why", "").endswith("只") and not r.get("sel")], key=lambda r: -r["y"])
    failed = [r for r in rows if not r["ok"]]
    ind_txt = "，".join(f"{k}{v}只" for k, v in cnt.items())
    write_xlsx(
        ans / "港股红利候选池筛选表.xlsx",
        [("候选池判定表", j_head, j_rows), ("入选名单", s_head, s_rows), ("在线数据", o_head, o_rows)],
        notes={
            "候选池判定表": ["60日日均成交额取基准日和之前共60个交易日；各年每股派息按除息日所在自然年汇总。",
                        "近12个月每股派息取除息日晚于2025-10-30、不晚于2026-10-30的派息；近12个月股息率 = 近12个月每股派息 ÷ 基准日不复权收盘价。",
                        f"排序名次只给通过三条筛选的股票编号。{'、'.join(r['name'] for r in skipped)}因行业已选满{CAP}只被跳过。"],
            "入选名单": [f"各行业入选：{ind_txt}。"],
            "在线数据": [
                source_line(rec),
                f"返回 {len(m)} 行，{m.index[0]} 至 {m.index[-1]}。Date 是 UTC 时间 16:00，加 8 小时后的日期是香港的交易日，也就是除息日。",
                "返回期间内 Stock Splits 全部为 0，没有送转；Dividends 是每股派息，单位港元。上表只列基准日及之前的派息。",
                f"2025-10-30 那一次（{fl(dict(mcp_div)[WIN0]):.4f} 港元）除息日正好在窗口起点，不计入近12个月。",
                f"近12个月每股派息 {fl(sh['ttm']):.4f} 港元，基准日收盘价 {fl(sh['close']):.2f} 港元，股息率 {pc(sh['y'])}。",
                "2022 至 2025 年每股派息：" + "，".join(f"{y}年 {fl(sh['yr'][y]):.4f}" for y in YEARS) + " 港元；三条筛选都满足。",
            ],
        },
    )
    write_docx(
        ans / "港股红利候选池筛选说明.docx",
        "港股红利产品候选池筛选说明",
        [
            ("入选名单", ["按近12个月股息率从高到低依次选入，同一行业最多4只，选满15只：" +
                      "；".join(f"{i}. {r['name']}（{r['code']}，{r['ind']}，{pc(r['y'])}）" for i, r in enumerate(sel, 1)) + "。",
                      f"各行业入选：{ind_txt}。"]),
            ("因行业满额被跳过", [f"{'、'.join(r['name'] + '（' + pc(r['y']) + '）' for r in skipped)}通过了三条筛选，"
                           f"但排到它们时银行已经选满4只，被跳过。最后一个名额给了中电控股（{pc(next(r for r in rows if r['code'] == '0002.HK')['y'])}）。"]),
            ("没有通过筛选的股票", [f"{r['name']}（{r['code']}）：{r['why']}" + (
                f"，股息率 {pc(r['y'])}" if r["y"] > 0 else "") + "。" for r in sorted(failed, key=lambda r: -r["y"])] + [
                "中国海洋石油 2023 年每股派息是 2022 年的 " + f"{r4(next(r for r in rows if r['code'] == '0883.HK')['ratio'][2023])}，"
                "中国电信是 " + f"{r4(next(r for r in rows if r['code'] == '0728.HK')['ratio'][2023])}，都不低于 0.7，满足不削减。"]),
            ("在线数据", [
                "研究部的除息记录快照没有收录中国神华，它的除息记录通过 US Stocks MCP 查询，代码 1088.HK。返回的 Date 是 UTC 时间，加 8 小时后才是香港的除息日；返回期间没有送转。",
                f"中国神华 2025-10-30 除息的 {fl(dict(mcp_div)[WIN0]):.4f} 港元正好在窗口起点，不计入近12个月；"
                f"近12个月每股派息 {fl(sh['ttm']):.4f} 港元，股息率 {pc(sh['y'])}，在通过筛选的股票里排第 {sh['rank']}，入选。"
                f"如果把这一次算进去，股息率会变成 {pc(sh_closed['y'])}。",
            ]),
            ("对应材料", ["30只股票的逐项判定见《港股红利候选池筛选表.xlsx》的「候选池判定表」，15只入选股票见「入选名单」，中国神华的除息记录和查询信息见「在线数据」。"]),
        ],
    )
    print("查询时间", rec["查询时间"], len(m), "行", m.index[0], m.index[-1])


if __name__ == "__main__":
    main()
