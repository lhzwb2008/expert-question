"""各题打包脚本共用的小工具：复制附件、写 xlsx、写 docx。只在本地用，不上传。"""
from __future__ import annotations

import shutil
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.shared import Pt
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from openpyxl.utils import get_column_letter

REPO = Path(__file__).resolve().parents[2]
CASES = REPO / "cases"
OUT = REPO / "项目提交"


def fresh_dir(path: Path) -> Path:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True)
    return path


def copy_as(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)


def write_xlsx(path: Path, sheets: list[tuple[str, list[str], list[list]]], notes: dict[str, list[str]] | None = None) -> None:
    """sheets: [(工作表名, 表头, 行)]。notes: 工作表名 -> 表格下方的说明行。"""
    wb = Workbook()
    wb.remove(wb.active)
    for name, header, rows in sheets:
        ws = wb.create_sheet(name)
        ws.append(header)
        for c in ws[1]:
            c.font = Font(bold=True)
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        for r in rows:
            ws.append(r)
        ws.freeze_panes = "A2"
        for i, h in enumerate(header, 1):
            width = max([len(str(h)) * 2] + [len(str(r[i - 1])) for r in rows if i - 1 < len(r)] + [8])
            ws.column_dimensions[get_column_letter(i)].width = min(width + 2, 60)
        for line in (notes or {}).get(name, []):
            ws.append([])
            ws.append([line])
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)


def write_docx(path: Path, title: str, blocks: list[tuple[str, list[str]]]) -> None:
    """blocks: [(小标题, 段落列表)]。小标题为空时只写段落。"""
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "宋体"
    style.font.size = Pt(11)
    style.element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")
    h = doc.add_heading(title, level=1)
    for run in h.runs:
        run.font.name = "黑体"
        run._element.rPr.rFonts.set(qn("w:eastAsia"), "黑体")
    for head, paras in blocks:
        if head:
            hh = doc.add_heading(head, level=2)
            for run in hh.runs:
                run.font.name = "黑体"
                run._element.rPr.rFonts.set(qn("w:eastAsia"), "黑体")
        for p in paras:
            doc.add_paragraph(p)
    path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(path)


def num(x: str):
    """csv 里的数字串转成数字，转不了就原样返回。"""
    try:
        f = float(x)
    except (TypeError, ValueError):
        return x
    return int(f) if f.is_integer() and "." not in str(x) else f


# ---- 下面是读 MCP 结果文件、借用底稿重算脚本的小工具 ----

MCP_NAME = "US Stocks MCP（https://mcp-stocks-us.gino.im/mcp，数据来自 Yahoo Finance）"


def load_mcp(path: Path):
    """读 mcp_call.py --save 存下的文件，返回（留痕信息, 原始返回里的文本）。"""
    import json
    rec = json.load(open(path, encoding="utf-8"))
    return rec, rec["原始返回"]["content"][0]["text"]


def load_mcp_prices(path: Path, hours: int):
    """日线结果转成以交易日为索引的表。hours：返回的 UTC 时间加几小时后的日期是交易日（A 股、港股 8，美股 0）。"""
    import json
    import pandas as pd
    rec, text = load_mcp(path)
    d = pd.DataFrame(json.loads(text))
    d["day"] = (pd.to_datetime(d.Date.str[:19]) + pd.Timedelta(hours=hours)).dt.strftime("%Y-%m-%d")
    assert not d.day.duplicated().any()
    return rec, d.set_index("day")


def source_line(rec: dict) -> str:
    q = rec["参数"]
    cond = "、".join(f"{k}={v}" for k, v in q.items() if k != "ticker")
    return (f"来源：{MCP_NAME}，工具 {rec['工具']}，代码 {q['ticker']}" + (f"，参数 {cond}" if cond else "")
            + f"。查询时间：{rec['查询时间']}。")


def load_module(path: Path, name: str):
    import importlib.util
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
