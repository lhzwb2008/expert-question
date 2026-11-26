#!/usr/bin/env python3
"""就地清理 docx 里 python-docx 留下的痕迹，规则同 build_common.scrub_office。正文不动。

用法：
  python3 清理docx属性.py                # 清理 finance/ 下全部 docx
  python3 清理docx属性.py a.docx b.docx  # 只清理指定文件
  python3 清理docx属性.py --check        # 只检查，列出还带痕迹的文件
"""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path

from build_common import OUT, scrub_office

MARKS = [b"python-docx", b"thumbnail.jpeg", b"customXml", b"2013-12-23T23:15:00Z", b"Microsoft Macintosh Word",
         b"<w:rsids>", b"w14:docId", b"<Words>0</Words>"]


def marks(path: Path) -> list[str]:
    hit = []
    with zipfile.ZipFile(path) as z:
        for n in z.namelist():
            if n.startswith("customXml/") or n == "docProps/thumbnail.jpeg":
                hit.append(n)
                continue
            if n.endswith((".xml", ".rels")):
                b = z.read(n)
                hit += [f"{n}:{m.decode()}" for m in MARKS if m in b]
    return hit


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--check"]
    check = "--check" in sys.argv
    paths = [Path(a) for a in args] or sorted(p for p in OUT.rglob("*.docx") if not p.name.startswith("~$"))
    left = 0
    for p in paths:
        if not check:
            scrub_office(p)
        m = marks(p)
        if m:
            left += 1
            print("仍有痕迹", p.relative_to(OUT) if p.is_relative_to(OUT) else p, m)
    print(f"{'检查' if check else '清理'} {len(paths)} 个 docx，带痕迹的 {left} 个")
    sys.exit(1 if left else 0)


if __name__ == "__main__":
    main()
