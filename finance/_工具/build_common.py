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
CASES = REPO / "high-econ"
OUT = REPO / "finance"


def fresh_dir(path: Path) -> Path:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True)
    return path


def copy_as(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)


MAX_COL_WIDTH = 46
LINE_HEIGHT = 15.0


def text_width(value) -> int:
    """单元格文字在 Excel 里大约占几个字符宽：中文和全角符号算 2，其余算 1。"""
    import unicodedata
    if value is None:
        return 0
    if isinstance(value, float):
        value = f"{value:,.4f}"
    return sum(2 if unicodedata.east_asian_width(ch) in "WF" else 1 for ch in str(value))


def _lines(value, width: float) -> int:
    import math
    return max(1, sum(math.ceil(max(text_width(part), 1) / max(width - 1, 1)) for part in str(value).split("\n")))


def write_xlsx(path: Path, sheets: list[tuple[str, list[str], list[list]]], notes: dict[str, list[str]] | None = None,
               formats: dict[str, dict[str, str]] | None = None) -> None:
    """sheets: [(工作表名, 表头, 行)]。notes: 工作表名 -> 表格下方的说明行。
    formats: 工作表名 -> {表头: 数字格式}，例如 {"净收益": "#,##0.00", "开仓z值": "0.0000"}。"""
    wb = Workbook()
    wb.remove(wb.active)
    wrap = Alignment(vertical="top", wrap_text=True)
    for name, header, rows in sheets:
        ws = wb.create_sheet(name)
        ws.append(header)
        for c in ws[1]:
            c.font = Font(bold=True)
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        for r in rows:
            ws.append(r)
        ws.freeze_panes = "A2"
        fmt = (formats or {}).get(name, {})
        widths = []
        for i, h in enumerate(header, 1):
            col = [r[i - 1] for r in rows if i - 1 < len(r)]
            need = max([text_width(h)] + [text_width(v) for v in col] + [8])
            width = min(need + 2, MAX_COL_WIDTH)
            widths.append(width)
            ws.column_dimensions[get_column_letter(i)].width = width
            if h in fmt:
                for cell in ws.iter_rows(min_row=2, max_row=len(rows) + 1, min_col=i, max_col=i):
                    if isinstance(cell[0].value, (int, float)):
                        cell[0].number_format = fmt[h]
        ws.row_dimensions[1].height = LINE_HEIGHT * max(_lines(h, w) for h, w in zip(header, widths))
        for ri, r in enumerate(rows, 2):
            n = 1
            for ci, v in enumerate(r):
                if ci < len(widths) and isinstance(v, str) and text_width(v) > widths[ci] - 2:
                    ws.cell(ri, ci + 1).alignment = wrap
                    n = max(n, _lines(v, widths[ci]))
            if n > 1:
                ws.row_dimensions[ri].height = LINE_HEIGHT * n
        span = max(len(header), 6)
        span_width = sum(widths) + sum(10 for _ in range(span - len(widths)))
        for c in range(len(widths) + 1, span + 1):
            ws.column_dimensions[get_column_letter(c)].width = 10
        for line in (notes or {}).get(name, []):
            ws.append([])
            ws.append([line])
            row = ws.max_row
            ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=span)
            ws.cell(row, 1).alignment = wrap
            ws.row_dimensions[row].height = LINE_HEIGHT * _lines(line, span_width)
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)
    scrub_office(path)


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
    scrub_office(path)


_APP_DOCX = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
             '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
             'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
             '<Template>Normal.dotm</Template><TotalTime>0</TotalTime><Words>{words}</Words><Characters>{chars}</Characters>'
             '<DocSecurity>0</DocSecurity><Paragraphs>{paras}</Paragraphs><ScaleCrop>false</ScaleCrop>'
             '<LinksUpToDate>false</LinksUpToDate><CharactersWithSpaces>{chars_sp}</CharactersWithSpaces>'
             '<SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged></Properties>')


def _scrub_docx_parts(files: dict[str, bytes]) -> set[str]:
    """去掉 python-docx 默认模板带进来的痕迹，返回要删掉的部件名。
    - core.xml 的「generated by python-docx」说明和空的标题、主题、关键词、类别；
    - 模板自带的缩略图（docProps/thumbnail.jpeg）和 settings 里的 savePreviewPicture；
    - 模板自带的 customXml（固定 itemID 的参考文献数据源）；
    - settings 里模板固定的 rsid 列表和 w14:docId；
    - core.xml 里模板自带的创建时间 2013-12-23，换成生成时间；
    - document、styles 里模板的 rsid；
    - app.xml 里模板的程序名、零字数和 AppVersion，按正文重新数字数，不写程序名。"""
    import re
    drop = {n for n in files if n == "docProps/thumbnail.jpeg" or n.startswith("customXml/")}
    core = files.get("docProps/core.xml")
    if core is not None:
        core = re.sub(rb"<dc:description>[^<]*</dc:description>|<dc:description/>", b"", core)
        for tag in (rb"dc:title", rb"dc:subject", rb"cp:keywords", rb"cp:category"):
            core = re.sub(rb"<" + tag + rb"/>|<" + tag + rb"></" + tag + rb">", b"", core)
        if b"2013-12-23T23:15:00Z" in core:  # 模板自带的创建时间，换成这次生成的时间
            import datetime as dt
            now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ").encode()
            core = core.replace(b"2013-12-23T23:15:00Z", now)
        files["docProps/core.xml"] = core
    files["_rels/.rels"] = re.sub(rb'<Relationship [^>]*Target="docProps/thumbnail\.jpeg"[^>]*/>', b"", files["_rels/.rels"])
    rels = "word/_rels/document.xml.rels"
    if rels in files:
        files[rels] = re.sub(rb'<Relationship [^>]*Target="\.\./customXml/[^"]*"[^>]*/>', b"", files[rels])
    ct = files["[Content_Types].xml"]
    ct = re.sub(rb'<Override PartName="/customXml/[^"]*"[^>]*/>', b"", ct)
    if not any(n.lower().endswith((".jpeg", ".jpg")) for n in files if n not in drop):
        ct = re.sub(rb'<Default Extension="jpe?g"[^>]*/>', b"", ct)
    files["[Content_Types].xml"] = ct
    st = files.get("word/settings.xml")
    if st is not None:
        st = re.sub(rb"<w:savePreviewPicture/>", b"", st)
        st = re.sub(rb"<w:rsids>.*?</w:rsids>", b"", st, flags=re.S)
        st = re.sub(rb'<w14:docId [^>]*/>', b"", st)
        st = st.replace(b'w:eastAsia="ja-JP"', b'w:eastAsia="zh-CN"')
        files["word/settings.xml"] = st
    for n in ("word/document.xml", "word/styles.xml", "word/stylesWithEffects.xml"):
        if n in files:
            b = re.sub(rb' w:rsid[A-Za-z]*="[0-9A-F]{8}"', b"", files[n])
            files[n] = re.sub(rb'<w:rsid w:val="[0-9A-F]{8}"/>', b"", b)
    app = files.get("docProps/app.xml", b"")
    if b"<Words>0</Words>" in app or b"<Application></Application>" in app or b"<Application/>" in app:
        body = re.sub(rb"<[^>]+>", b"", re.sub(rb"</w:p>", b"\n", files["word/document.xml"])).decode("utf-8")
        paras = [p for p in body.split("\n") if p.strip()]
        files["docProps/app.xml"] = _APP_DOCX.format(
            words=sum(len(re.findall(r"[\u4e00-\u9fff]|[A-Za-z0-9.,%\-]+", p)) for p in paras),
            chars=sum(len(p.replace(" ", "")) for p in paras), paras=len(paras),
            chars_sp=sum(len(p) for p in paras)).encode("utf-8")
    return drop


def scrub_office(path: Path) -> None:
    """清掉文件属性里的作者和最后修改人；docx 另外去掉 python-docx 默认模板的痕迹（见 _scrub_docx_parts）。
    不改写 xlsx 的程序名，也不伪造编辑时长。"""
    import re
    import zipfile

    with zipfile.ZipFile(path) as z:
        items = [(i, z.read(i.filename)) for i in z.infolist()]
    files = {i.filename: b for i, b in items}
    core = files.get("docProps/core.xml")
    if core is not None:
        # openpyxl 写的是 <dc:creator xmlns:dc="...">openpyxl</dc:creator>，标签里带命名空间属性
        core = re.sub(rb"<dc:creator([^>]*?)(?:/>|>.*?</dc:creator>)", rb"<dc:creator\1></dc:creator>", core)
        core = re.sub(rb"<cp:lastModifiedBy([^>]*?)(?:/>|>.*?</cp:lastModifiedBy>)", rb"<cp:lastModifiedBy\1></cp:lastModifiedBy>", core)
        files["docProps/core.xml"] = core
    drop = _scrub_docx_parts(files) if "word/document.xml" in files else set()
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for i, _ in items:
            if i.filename not in drop:
                z.writestr(i, files[i.filename])


def copy_materials(key: str, att: Path) -> list[str]:
    """把 `_工具/补充材料/<key>/` 下的文件（不含隐藏文件和 .py）原样复制进题目附件，返回文件名。
    补充材料是 2026-11 最终质检返修时补的背景、历史和版本材料，由各链的脚本生成或手写在这里。"""
    src = Path(__file__).resolve().parent / "补充材料" / key
    names = []
    for p in sorted(src.iterdir()) if src.exists() else []:
        if p.is_file() and not p.name.startswith(".") and p.suffix != ".py":
            copy_as(p, att / p.name)
            names.append(p.name)
    return names


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
