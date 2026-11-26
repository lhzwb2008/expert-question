#!/usr/bin/env python3
"""把重跑后的 xlsx 单元格和 docx 正文跟 Git 里的旧版逐项比对，确认改格式、改属性没有动到数字和文字。

用法：
  python3 核对改动.py                 # 比对 finance/题目 下所有和 HEAD 不同的 xlsx、docx
  python3 核对改动.py 06 07           # 只比对这几题
  python3 核对改动.py --ref 9ecc761   # 指定比对的提交，默认 HEAD
  python3 核对改动.py --max 30        # 每个文件最多列多少处差异，默认 20

只比内容：xlsx 比每个工作表的单元格值（数字按 1e-9 相对误差比），docx 比段落和表格文字，
md、csv、json 和 ③填写稿.md 逐行比。数字格式、列宽、行高、文件属性不算差异。新增或删掉的文件单独列出。
重跑脚本会覆盖直接改过的成品（例如 2026-11-19 用户手改的「Yahoo Finance 导出」口径），
所以重跑之后先看这里列出的「内容有变」是不是都在预期之内。
"""
from __future__ import annotations

import argparse
import difflib
import io
import subprocess
import zipfile
from pathlib import Path

from openpyxl import load_workbook

HERE = Path(__file__).resolve().parent
FIN = HERE.parent
REPO = FIN.parent


def git(*args: str) -> bytes:
    return subprocess.run(["git", "-c", "core.quotepath=off", *args], cwd=REPO, capture_output=True, check=True).stdout


def old_bytes(ref: str, rel: str) -> bytes | None:
    try:
        return git("show", f"{ref}:{rel}")
    except subprocess.CalledProcessError:
        return None


def xlsx_cells(data: bytes) -> dict[str, dict[str, object]]:
    wb = load_workbook(io.BytesIO(data), data_only=False)
    out = {}
    for ws in wb.worksheets:
        out[ws.title] = {c.coordinate: c.value for row in ws.iter_rows() for c in row if c.value not in (None, "")}
    return out


def same(a, b) -> bool:
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        return abs(a - b) <= 1e-9 * max(1.0, abs(a), abs(b))
    return a == b


def diff_xlsx(old: bytes, new: bytes, limit: int) -> list[str]:
    a, b = xlsx_cells(old), xlsx_cells(new)
    lines = []
    for s in sorted(set(a) | set(b), key=lambda x: (list(b) + list(a)).index(x)):
        if s not in b:
            lines.append(f"  删掉工作表「{s}」")
            continue
        if s not in a:
            lines.append(f"  新增工作表「{s}」（{len(b[s])} 个非空单元格）")
            continue
        keys = sorted(set(a[s]) | set(b[s]), key=lambda k: (int("".join(ch for ch in k if ch.isdigit())), k))
        bad = [k for k in keys if not same(a[s].get(k), b[s].get(k))]
        if bad:
            lines.append(f"  「{s}」{len(bad)} 处不同：")
            for k in bad[:limit]:
                lines.append(f"    {k}: {a[s].get(k)!r} → {b[s].get(k)!r}")
            if len(bad) > limit:
                lines.append(f"    ……另有 {len(bad) - limit} 处")
    return lines


def docx_text(data: bytes) -> list[str]:
    from docx import Document
    d = Document(io.BytesIO(data))
    out = [p.text for p in d.paragraphs]
    for t in d.tables:
        for r in t.rows:
            out.append(" | ".join(c.text for c in r.cells))
    return [x for x in out if x.strip()]


def diff_docx(old: bytes, new: bytes, limit: int) -> list[str]:
    a, b = docx_text(old), docx_text(new)
    if a == b:
        return []
    d = [ln for ln in difflib.unified_diff(a, b, lineterm="", n=0) if not ln.startswith(("---", "+++", "@@"))]
    out = [f"  正文 {sum(ln.startswith('-') for ln in d)} 段删改、{sum(ln.startswith('+') for ln in d)} 段新增："]
    out += [f"    {ln}" for ln in d[:limit]]
    if len(d) > limit:
        out.append(f"    ……另有 {len(d) - limit} 行")
    return out


def diff_text(old: bytes, new: bytes, limit: int) -> list[str]:
    a, b = old.decode("utf-8").splitlines(), new.decode("utf-8").splitlines()
    if a == b:
        return []
    d = [ln for ln in difflib.unified_diff(a, b, lineterm="", n=0) if not ln.startswith(("---", "+++", "@@"))]
    out = [f"  {sum(ln.startswith('-') for ln in d)} 行删改、{sum(ln.startswith('+') for ln in d)} 行新增："]
    out += [f"    {ln[:200]}" for ln in d[:limit]]
    if len(d) > limit:
        out.append(f"    ……另有 {len(d) - limit} 行")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("nums", nargs="*")
    ap.add_argument("--ref", default="HEAD")
    ap.add_argument("--max", type=int, default=20)
    o = ap.parse_args()
    dirs = [next((FIN / "题目").glob(f"{int(n):02d}_*")) for n in o.nums] or [FIN / "题目"]
    rels = set()
    for d in dirs:
        rel = d.relative_to(REPO).as_posix()
        rels |= {ln for ln in git("diff", "--name-only", o.ref, "--", rel).decode().splitlines()}
        rels |= {ln for ln in git("ls-files", "--others", "--exclude-standard", "--", rel).decode().splitlines()}
    rels = sorted(r for r in rels if r.endswith((".xlsx", ".docx", ".md", ".csv", ".json")))
    same_n = 0
    for rel in rels:
        p = REPO / rel
        old = old_bytes(o.ref, rel)
        name = rel.removeprefix("finance/题目/")
        if not p.exists():
            print(f"[删掉] {name}")
            continue
        if old is None:
            print(f"[新增] {name}")
            continue
        new = p.read_bytes()
        try:
            if rel.endswith(".xlsx"):
                lines = diff_xlsx(old, new, o.max)
            elif rel.endswith(".docx"):
                lines = diff_docx(old, new, o.max)
            else:
                lines = diff_text(old, new, o.max)
        except zipfile.BadZipFile as e:
            print(f"[读不开] {name}: {e}")
            continue
        if lines:
            print(f"[内容有变] {name}")
            print("\n".join(lines))
        else:
            same_n += 1
            print(f"[内容不变] {name}")
    print(f"共 {len(rels)} 个文件和 {o.ref} 不同，其中内容不变 {same_n} 个")


if __name__ == "__main__":
    main()
