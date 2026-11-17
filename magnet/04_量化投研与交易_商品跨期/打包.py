"""生成商品跨期的行情附件和策略组初筛结果，核对后打上传包。不上传。

行情取自本机天勤日线导出（~/workspace/laplace/data/cn_fut/1d），逐行原样拼接，只在每行加上合约代码，按交易所分成三份。
上证指数日线取自 finance/题目/09_商品跨期品种准入，内容不改。
初筛结果是同一批行情按策略组的做法算出来的，做法写在《商品跨期_策略组初筛备忘.md》。
成文口径下的十八行判定与 high-econ/一期/carry_screen/answer/summary.csv 逐项相同，check() 每次都会重算。
"""

import csv
import datetime as dt
import json
import shutil
import zipfile
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ATT = HERE / "附件"
REPO = HERE.parent.parent
SRC = Path.home() / "workspace/laplace/data/cn_fut/1d"
INDEX = REPO / "finance/题目/09_商品跨期品种准入/题目附件/商品跨期_MCP_000001.SS日线.json"
ANSWER = REPO / "high-econ/一期/carry_screen/answer/summary.csv"

QUOTES = {
    "SHFE": "商品跨期_上期所合约日线.csv",
    "DCE": "商品跨期_大商所合约日线.csv",
    "CZCE": "商品跨期_郑商所合约日线.csv",
}
SPEC = "商品跨期_合约规格.csv"
SSE = "商品跨期_上证指数日线.json"
PRE = "商品跨期_策略组初筛结果.csv"
DOCS = ["商品跨期_行情说明.md", "商品跨期_配对口径.md", "商品跨期_准入标准.md", "商品跨期_策略组初筛备忘.md"]
NEED = [*QUOTES.values(), SPEC, SSE, PRE, *DOCS]
ROWS = {"SHFE": 94957, "DCE": 78518, "CZCE": 86767}

FIRST, LAST = dt.date(2023, 1, 1), dt.date(2026, 10, 30)
NAME = {
    "cu": "铜", "al": "铝", "zn": "锌", "rb": "螺纹钢", "hc": "热轧卷板", "ru": "天然橡胶",
    "m": "豆粕", "y": "豆油", "p": "棕榈油", "c": "玉米", "i": "铁矿石", "pp": "聚丙烯",
    "SR": "白糖", "CF": "棉花", "TA": "PTA", "MA": "甲醇", "RM": "菜粕", "FG": "玻璃",
}


def export() -> None:
    shutil.copyfile(SRC / "contracts.csv", ATT / SPEC)
    shutil.copyfile(INDEX, ATT / SSE)
    out = {ex: open(ATT / name, "w", encoding="utf-8") for ex, name in QUOTES.items()}
    for f in out.values():
        f.write("date,symbol,open,high,low,close,volume,open_oi,close_oi\n")
    with open(SRC / "contracts.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            lines = (SRC / r["product"] / f"{r['symbol'].split('.')[1]}.csv").read_text(encoding="utf-8").splitlines()
            if lines[0] != "date,open,high,low,close,volume,open_oi,close_oi":
                raise SystemExit(f"{r['symbol']} 表头不对：{lines[0]}")
            for line in lines[1:]:
                day, rest = line.split(",", 1)
                out[r["exchange"]].write(f"{day},{r['symbol']},{rest}\n")
    for f in out.values():
        f.close()


def load():
    """按品种、交易日整理评估期内的行情：days[品种][交易日] = [(合约, 收盘价, 成交量, 收盘持仓, 最后交易日)]。"""
    spec = {}
    with open(ATT / SPEC, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            spec[r["symbol"]] = (r["product"], dt.date.fromisoformat(r["expire_date"]))
    days = {p: defaultdict(list) for p in NAME}
    counts = {}
    for ex, name in QUOTES.items():
        with open(ATT / name, encoding="utf-8") as f:
            n = 0
            for r in csv.DictReader(f):
                n += 1
                day = dt.date.fromisoformat(r["date"])
                if not FIRST <= day <= LAST or float(r["close"]) <= 0:
                    continue
                product, expire = spec[r["symbol"]]
                days[product][day].append((r["symbol"], float(r["close"]), float(r["volume"]), float(r["close_oi"]), expire))
            counts[ex] = n
    return days, counts


def screen(days, liquidity=True, far_next=False, first=FIRST, last=LAST):
    """liquidity、far_next 取默认值是成文口径；liquidity=False、far_next=True 是策略组初筛的做法。"""
    out = {}
    for product in NAME:
        trading = sorted(d for d in days[product] if first <= d <= last)
        anns, pos, neg = [], 0, 0
        for day in trading:
            pool = [r for r in days[product][day]
                    if (r[4] - day).days >= 10 and (not liquidity or (r[3] >= 20000 and r[2] >= 1000))]
            if len(pool) < 2:
                continue
            near = min(pool, key=lambda r: (r[4], -r[3], r[0]))
            rest = [r for r in pool if r[4] > near[4]]
            if not rest:
                continue
            far = min(rest, key=(lambda r: (r[4], r[0])) if far_next else (lambda r: (-r[3], r[4], r[0])))
            ann = (near[1] - far[1]) / near[1] * 365 / (far[4] - near[4]).days
            anns.append(ann)
            if abs(ann) >= 0.03:
                pos += ann > 0
                neg += ann < 0
        n_all, n_pair, big = len(trading), len(anns), pos + neg
        s = sorted(anns)
        med = 0.0 if not s else (s[len(s) // 2] if len(s) % 2 else (s[len(s) // 2 - 1] + s[len(s) // 2]) / 2)
        share = max(pos, neg) / big if big else 0.0
        ok = n_all > 0 and n_pair / n_all >= 0.95 and big / n_all >= 0.60 and share >= 0.85 and abs(med) >= 0.03
        out[product] = {"交易日数": n_all, "配对日数": n_pair, "大波动日数": big, "正号天数": pos, "负号天数": neg,
                        "方向占比": share, "年化展期中位数": med, "是否纳入": ok}
    return out


def prescreen(days) -> None:
    res = screen(days, liquidity=False, far_next=True)
    with open(ATT / PRE, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["品种代码", "品种", "交易日数", "配对日数", "大波动日数", "正号天数", "负号天数", "方向占比", "年化展期中位数", "是否纳入", "方向"])
        for p, r in res.items():
            side = "" if not r["是否纳入"] else ("贴水，多近空远" if r["年化展期中位数"] > 0 else "升水，空近多远")
            w.writerow([p, NAME[p], r["交易日数"], r["配对日数"], r["大波动日数"], r["正号天数"], r["负号天数"],
                        f"{r['方向占比']:.6f}", f"{r['年化展期中位数']:.6f}", "是" if r["是否纳入"] else "否", side])


def check(days, counts) -> None:
    missing = [name for name in NEED if not (ATT / name).exists()]
    if missing:
        raise SystemExit(f"缺少文件: {missing}")
    text = "\n".join((ATT / name).read_text(encoding="utf-8") for name in DOCS)
    for word in ("本题", "出题", "评分点", "标准答案", "考点", "题目给定", "A01", "A02", "A03", "A04", "A05"):
        if word in text:
            raise SystemExit(f"附件里还有「{word}」")
    if counts != ROWS:
        raise SystemExit(f"行数对不上：{counts}")
    for name in NEED:
        if (ATT / name).stat().st_size > 20 * 1024 * 1024:
            raise SystemExit(f"{name} 超过 20MB")

    base = screen(days)
    with open(ANSWER, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            b = base[r["product"]]
            same = (b["交易日数"], b["配对日数"], b["大波动日数"], b["正号天数"], b["负号天数"]) == tuple(
                int(r[k]) for k in ("trading_days", "pair_days", "big_days", "pos_days", "neg_days"))
            if not same or abs(b["年化展期中位数"] - float(r["median"])) > 1e-6 or b["是否纳入"] != (r["admitted"] == "是"):
                raise SystemExit(f"{r['product']} 与底稿标答不一致")

    raw = json.loads((ATT / SSE).read_text(encoding="utf-8"))
    bars = json.loads(raw["原始返回"]["structuredContent"]["result"])
    sse = {(dt.datetime.fromisoformat(b["Date"].replace("Z", "+00:00")) + dt.timedelta(hours=8)).date() for b in bars}
    sse = {d for d in sse if FIRST <= d <= LAST}
    for p in NAME:
        if set(days[p]) != sse:
            raise SystemExit(f"{p} 的交易日与上证指数不一致")

    def names(res):
        return " ".join(p for p, r in res.items() if r["是否纳入"]) or "无"

    print(f"核对通过：{len(NEED)} 个文件，日线 {sum(counts.values())} 行，评估期内每个品种 {len(sse)} 个交易日，与上证指数逐日相同")
    print("成文口径纳入：", names(base), "（与底稿标答逐项相同）")
    print("只改远月为下一到期月：", names(screen(days, far_next=True)))
    print("只去掉持仓和成交门槛：", names(screen(days, liquidity=False)))
    print("策略组初筛（两处都改）：", names(screen(days, liquidity=False, far_next=True)))


def pack() -> None:
    dest = HERE / "商品跨期_附件包.zip"
    if dest.exists():
        dest.unlink()
    with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for name in NEED:
            info = zipfile.ZipInfo(name)
            if any(ord(ch) > 127 for ch in name):
                info.flag_bits |= 0x800
            info.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(info, (ATT / name).read_bytes(), compresslevel=9)
            print("  ", name, f"{(ATT / name).stat().st_size / 1e6:.2f} MB")
    print(f"{dest.name} {dest.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    if not all((ATT / name).exists() for name in (*QUOTES.values(), SPEC, SSE)):
        export()
    days, counts = load()
    prescreen(days)
    check(days, counts)
    pack()
