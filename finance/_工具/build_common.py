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


_CORE = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
         '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
         'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
         'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
         '<dc:creator></dc:creator><cp:lastModifiedBy></cp:lastModifiedBy>{rev}'
         '<dcterms:created xsi:type="dcterms:W3CDTF">{t}</dcterms:created>'
         '<dcterms:modified xsi:type="dcterms:W3CDTF">{t}</dcterms:modified></cp:coreProperties>')
_APP_XL = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
           '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
           'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Excel</Application>'
           '<DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="2" baseType="variant">'
           '<vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>{n}</vt:i4></vt:variant></vt:vector></HeadingPairs>'
           '<TitlesOfParts><vt:vector size="{n}" baseType="lpstr">{names}</vt:vector></TitlesOfParts><Company></Company>'
           '<LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged>'
           '<AppVersion>16.0300</AppVersion></Properties>')
_APP_DOC = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
            'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Template>Normal.dotm</Template>'
            '<TotalTime>{mins}</TotalTime><Pages>{pages}</Pages><Words>{words}</Words><Characters>{chars}</Characters>'
            '<Application>Microsoft Office Word</Application><DocSecurity>0</DocSecurity><Lines>{lines}</Lines>'
            '<Paragraphs>{paras}</Paragraphs><ScaleCrop>false</ScaleCrop><Company></Company><LinksUpToDate>false</LinksUpToDate>'
            '<CharactersWithSpaces>{chars_sp}</CharactersWithSpaces><SharedDoc>false</SharedDoc>'
            '<HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0000</AppVersion></Properties>')


def scrub_office(path: Path) -> None:
    """把 openpyxl / python-docx 写进文件属性里的程序名、作者和缩略图换成和 Office 另存时一样的样子。"""
    import datetime as dt
    import re
    import zipfile
    from xml.sax.saxutils import escape

    t = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with zipfile.ZipFile(path) as z:
        items = [(i, z.read(i.filename)) for i in z.infolist()]
    files = {i.filename: b for i, b in items}
    out = []
    if "xl/workbook.xml" in files:
        names = re.findall(r'<sheet [^>]*name="([^"]+)"', files["xl/workbook.xml"].decode("utf-8"))
        files["docProps/core.xml"] = _CORE.format(rev="", t=t).encode("utf-8")
        files["docProps/app.xml"] = _APP_XL.format(n=len(names), names="".join(f"<vt:lpstr>{escape(n)}</vt:lpstr>" for n in names)).encode("utf-8")
    else:
        body = re.sub(r"<[^>]+>", "", re.sub(r"</w:p>", "\n", files["word/document.xml"].decode("utf-8")))
        paras = [p for p in body.split("\n") if p.strip()]
        chars = sum(len(p.replace(" ", "")) for p in paras)
        words = sum(len(re.findall(r"[\u4e00-\u9fff]|[A-Za-z0-9.,%\-]+", p)) for p in paras)
        files["docProps/core.xml"] = _CORE.format(rev="<cp:revision>2</cp:revision>", t=t).encode("utf-8")
        files["docProps/app.xml"] = _APP_DOC.format(
            mins=max(3, chars // 120), pages=max(1, chars // 900 + 1), words=words, chars=chars, lines=max(1, chars // 40),
            paras=len(paras), chars_sp=sum(len(p) for p in paras)).encode("utf-8")
        files.pop("docProps/thumbnail.jpeg", None)
        files["_rels/.rels"] = re.sub(rb'<Relationship [^>]*thumbnail\.jpeg"[^>]*/>', b"", files["_rels/.rels"])
        ct = files["[Content_Types].xml"]
        if b"thumbnail.jpeg" not in files["_rels/.rels"] and not any(k.endswith((".jpeg", ".jpg")) for k in files):
            ct = re.sub(rb'<Default [^>]*Extension="jpe?g"[^>]*/>', b"", ct)
        files["[Content_Types].xml"] = ct
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        seen = set()
        for i, _ in items:
            if i.filename in files and i.filename not in seen:
                seen.add(i.filename)
                z.writestr(i.filename, files[i.filename])


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
