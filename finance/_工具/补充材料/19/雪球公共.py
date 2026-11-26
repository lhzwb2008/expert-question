"""雪球凭证三轮链（19、20、21）补充材料共用的场景常量、行情读取和写文件小工具。
由 19、20、21 三个目录里的 生成补充材料.py 导入，不复制进题目附件（.py 不复制）。

场景延续「多策略稳健1号」：凭证台账、报价、券商额度、估值表直接从 build_雪球凭证.py 导入，保证和题目附件一致。
行情全部是真实数据：
- 新题数据/雪球回测_longport/：LongPort 拉的 510500、512100、000905、000852 日线（不复权 noadj、前复权 fwd），2022-09-09 至 2026-10-30；
- 新题数据/雪球比选/：US Stocks MCP 十年日线（含 Dividends 列）。
人员、编号、会议、往来过程、净值历史是延续场景拟的。
"""
from __future__ import annotations

import csv
import json
import re
import sys
import zipfile
from pathlib import Path

import pandas as pd

TOOLS = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(TOOLS))
import build_雪球凭证 as B  # noqa: E402
from build_common import write_docx, write_xlsx  # noqa: E402,F401

RAW = TOOLS / "新题数据"
LP = RAW / "雪球回测_longport"
NAME = dict(B.NAME, **{"000905": "中证500指数", "000852": "中证1000指数"})
SUF = {"510500": "SH", "512100": "SH", "000905": "SH", "000852": "SH"}

# 人员（全链一致）
P = dict(
    主任="陈立",          # 投资决策委员会主任委员、分管投资副总经理
    固收="罗绍华",        # 固收投资部总监，投委会委员
    经理="周启明",        # 多策略稳健1号投资经理
    风控总监="沈文澜",    # 风险管理部总监，投委会委员
    风控="何嘉怡",        # 风险管理部风控专员，月末排查经办
    风控复核="孙浩",      # 风险管理部，排查复核
    估值="林晓雯",        # 运营部估值会计
    运营="唐卫东",        # 运营部负责人
    交易="赵一鸣",        # 交易部场外衍生品交易员
    交易总监="郭振华",    # 交易部负责人
    量化="许诺",          # 量化研究部负责人，投委会委员
    回测="韩笑",          # 量化研究部研究员，回测程序开发
    合规="吕婧",          # 合规负责人，投委会委员
    数据="钱斌",          # 信息技术部数据组
)


def px(code: str, kind: str = "noadj") -> pd.DataFrame:
    df = pd.DataFrame(json.load(open(LP / f"{code}.{SUF[code]}_{kind}.json", encoding="utf-8")))
    for c in ("open", "high", "low", "close", "turnover"):
        df[c] = df[c].astype(float)
    return df.set_index("date")


def ledger() -> list[dict]:
    return B.ledger_rows()


def days500() -> list[str]:
    return list(px("510500").index)


def shift(days: list[str], d: str, n: int) -> str:
    """d 之后（n>0）或之前（n<0）第 |n| 个交易日；n=0 取不早于 d 的第一个交易日。"""
    import bisect
    i = bisect.bisect_left(days, d)
    if n == 0:
        return days[i]
    if n < 0:
        return days[i + n]
    j = i + n if (i < len(days) and days[i] == d) else i + n - 1
    return days[j]


def md(out: Path, name: str, text: str) -> str:
    (out / name).write_text(text.strip() + "\n", encoding="utf-8")
    return name


def csvw(out: Path, name: str, header: list[str], rows: list[list]) -> str:
    with open(out / name, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    return name


def docx(out: Path, name: str, title: str, blocks: list[tuple[str, list[str]]]) -> str:
    write_docx(out / name, title, blocks)
    return name


def xlsx(out: Path, name: str, sheets, notes=None, formats=None) -> str:
    write_xlsx(out / name, sheets, notes=notes, formats=formats)
    return name


def clean(out: Path) -> None:
    for p in out.iterdir():
        if p.is_file() and p.suffix in (".md", ".csv", ".docx", ".xlsx"):
            p.unlink()


def body_text(p: Path) -> str:
    if p.suffix in (".md", ".csv"):
        return p.read_text(encoding="utf-8")
    with zipfile.ZipFile(p) as z:
        if p.suffix == ".docx":
            return re.sub(r"<[^>]+>", "", z.read("word/document.xml").decode().replace("</w:p>", "\n"))
        return "\n".join(re.sub(r"<[^>]+>", " ", z.read(n).decode()) for n in z.namelist()
                         if n.startswith(("xl/sharedStrings", "xl/worksheets/sheet")))


def report(out: Path) -> None:
    for p in sorted(out.iterdir()):
        if p.suffix in (".md", ".docx", ".csv", ".xlsx"):
            t = body_text(p)
            n = len(re.sub(r"\s", "", t))
            extra = f"，{t.count(chr(10))} 行" if p.suffix == ".csv" else ""
            print(f"  {p.name}  {n} 字{extra}")
