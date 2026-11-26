#!/usr/bin/env python3
"""检查 2026-11 返修补的背景材料（题目附件里的 *_B 系列、项目冗余文件里的新增文件）像不像真实业务文件。

用法：
  python3 材料自查.py 19 20 21     # 只查这几题的 B 系列
  python3 材料自查.py 项目          # 查项目冗余文件里未入库的新增文件
  python3 材料自查.py               # 全部

列出三类问题：
1. 出题口吻：真实业务文件不会写「本题」「作答」「答案」「考点」「不要用来作答」这类话。
2. 免责声明式的句子：「本纪要不含具体数字结论」「本材料不含…金额」这种为了防泄露硬加的说明。
   真实文件该写什么就写什么，不需要声明自己没写什么；不想写的数字直接不写。
3. 篇幅：md、docx 正文少于 800 字。csv、xlsx 不查篇幅（短表格本来就短）。
"""
from __future__ import annotations

import re
import subprocess
import sys

from pathlib import Path

FIN = Path(__file__).resolve().parent.parent
META = re.compile(r"本题|非本题|作答|答题|答案|考点|出题|质检|评审侧|题面|题目附件|模型试跑")
DISCLAIM = re.compile(r"(本|该|此)(纪要|记录|材料|说明|回顾|意见|清单|制度|流程|件|稿|表|模板|审批|安排|指引|往来|底稿)[^。\n]{0,12}"
                      r"(不含|不涉及|不给出|不填)[^。\n]{0,30}|不含[^。；\n]{0,25}(结论|结果|数值|数字|金额)|仅留档对照|不要用来")
MIN_CHARS = 800


def text(p: Path) -> str:
    if p.suffix in (".md", ".csv"):
        return p.read_text(encoding="utf-8")
    if p.suffix == ".docx":
        from docx import Document
        d = Document(p)
        return "\n".join([x.text for x in d.paragraphs] + [c.text for t in d.tables for r in t.rows for c in r.cells])
    from openpyxl import load_workbook
    wb = load_workbook(p, read_only=True)
    return "\n".join(str(v) for ws in wb.worksheets for row in ws.iter_rows(values_only=True) for v in row if v is not None)


def files(keys: list[str]) -> list[Path]:
    out = []
    for d in sorted((FIN / "题目").iterdir()):
        if d.is_dir() and (not keys or d.name[:2] in keys):
            out += sorted(p for p in (d / "题目附件").iterdir() if re.search(r"_B\d", p.name))
    if not keys or "项目" in keys:
        new = subprocess.run(["git", "-c", "core.quotepath=off", "ls-files", "--others", "--exclude-standard",
                              "项目/项目冗余文件"], cwd=FIN, capture_output=True, text=True).stdout.split("\n")
        out += [FIN / x for x in new if x]
    return [p for p in out if p.suffix in (".md", ".csv", ".docx", ".xlsx")]


def main() -> None:
    keys = sys.argv[1:]
    bad = 0
    for p in files(keys):
        t = text(p)
        probs = [f"出题口吻「{m.group(0)}」…{t[max(0, m.start() - 15):m.end() + 15]!r}" for m in META.finditer(t)]
        probs += [f"免责声明「{m.group(0)}」" for m in DISCLAIM.finditer(t)]
        body = len(re.sub(r"\s", "", t))
        if p.suffix in (".md", ".docx") and body < MIN_CHARS:
            probs.append(f"篇幅只有 {body} 字")
        if probs:
            bad += 1
            print(p.relative_to(FIN))
            for x in probs[:12]:
                print("   ", x)
    print(f"有问题的文件 {bad} 个")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
