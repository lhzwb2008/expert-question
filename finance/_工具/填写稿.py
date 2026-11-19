#!/usr/bin/env python3
"""读各题 `③填写稿.md`，导出填表用的字段，供 Kiro 在浏览器里填表时读取。填写稿是唯一的来源。

用法：
  python3 填写稿.py export 13 14 ... 30   # 生成 _工具/表单文字/<题号>.json 和 manifest.json（不入库）
  python3 填写稿.py show 22               # 打印各字段长度和段落数，核对用

规则：每个「## 字段名」下面以 `> ` 开头的每一行是一段，段与段之间在表单里用两个换行。
「题目轮次」一节写「单选：第一轮」这样的一行。附件名单直接取题目文件夹里的文件。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIN = HERE.parent
OUT = HERE / "表单文字"
SECTIONS = {"项目／岗位／题目": "title", "题面": "body", "题目附件说明": "attach_note", "跨软件说明": "cross",
            "考点": "points", "标准答案": "answer"}
ROUND = {"单轮题": "optC1peHUw", "第一轮": "opt6tSM92w", "第二轮": "optpLuP5Fz", "第三轮": "optl06IQnK"}


def folder(n: int) -> Path:
    return next((FIN / "题目").glob(f"{n:02d}_*"))


def parse(n: int) -> dict:
    lines = (folder(n) / "③填写稿.md").read_text(encoding="utf-8").splitlines()
    out, cur, rnd = {}, None, None
    for ln in lines:
        if ln.startswith("## "):
            cur = ln[3:].strip()
            continue
        if cur in SECTIONS and ln.startswith("> "):
            out.setdefault(SECTIONS[cur], []).append(ln[2:].rstrip())
        if cur == "题目轮次" and ln.startswith("单选："):
            rnd = ln.split("：", 1)[1].strip()
    res = {k: "\n\n".join(v) for k, v in out.items()}
    assert set(res) == set(SECTIONS.values()), (n, set(SECTIONS.values()) - set(res))
    assert rnd in ROUND, (n, rnd)
    res["round"] = ROUND[rnd]
    res["round_name"] = rnd
    return res


def files(n: int):
    d = folder(n)
    q = sorted(p for p in (d / "题目附件").iterdir() if not p.name.startswith("."))
    a = sorted(p for p in (d / "标准答案附件").iterdir() if not p.name.startswith("."))
    return d, q, a


def main():
    cmd, nums = sys.argv[1], [int(x) for x in sys.argv[2:]]
    OUT.mkdir(exist_ok=True)
    man = {}
    for n in nums:
        t = parse(n)
        d, q, a = files(n)
        # 附件说明里点名的文件必须都在题目附件里
        for p in q:
            assert p.name in t["attach_note"], (n, "附件说明没写", p.name)
        if cmd == "export":
            json.dump(t, open(OUT / f"{n}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        man[str(n)] = dict(dir=str(d.relative_to(FIN)), q=[p.name for p in q], a=[p.name for p in a],
                           qs={p.name: p.stat().st_size for p in q}, **{"as": {p.name: p.stat().st_size for p in a}})
        print(n, t["round_name"], t["title"], {k: len(v) for k, v in t.items() if k not in ("round", "round_name", "title")},
              f"附件 {len(q)}/{len(a)}")
    if cmd == "export":
        json.dump(man, open(OUT / "manifest.json", "w", encoding="utf-8"), ensure_ascii=False)


if __name__ == "__main__":
    main()
