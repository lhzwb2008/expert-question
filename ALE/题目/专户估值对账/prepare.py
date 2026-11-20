#!/usr/bin/env python3
"""重算参考成品、核对关键数字，并打包两个隐藏参考 ZIP。

用法（工程根目录）：python3 -B ALE/题目/专户估值对账/prepare.py
"""
import hashlib
import importlib.util
import json
import platform
import re
import sys
import zipfile
from decimal import Decimal
from pathlib import Path

import docx
import openpyxl

ROOT = Path(__file__).resolve().parent
INPUT = ROOT / "input"
REF = ROOT / "reference"
OUT = REF / "成果"

spec = importlib.util.spec_from_file_location("oracle", REF / "oracle.py")
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)

inputs = sorted(p for p in INPUT.iterdir() if p.is_file() and not p.name.startswith("."))
assert len(inputs) == 15, [p.name for p in inputs]

res = oracle.produce(INPUT, OUT)
ok = res["ok"]
expect = {
    "nav": "67281559.85", "stock": "62080160.00", "cash": "5117439.85", "rec": "54720.00", "refund": "29240.00",
}
for k, v in expect.items():
    assert ok[k] == Decimal(v), (k, ok[k])
assert res["mgr"]["nav"] - ok["nav"] == Decimal("234594.90")
assert ok["nav"] - res["cus"]["nav"] == Decimal("83960.00")
assert f"{res['rate'] * 100:.2f}" == "0.35"
assert res["level"].endswith("报告监管机构") and "公告" not in res["level"]
assert res["pos_diff"] == {"NFLX": -2700, "KLAC": 2700}
assert res["klac_gap"] == Decimal("24146.10")
assert len(ok["detail"]) == 24
assert sum((x["net"] for x in ok["detail"]), Decimal(0)) == Decimal("471546.00")

# 从成品回读，确认写进文件的数字和计算一致
wb = openpyxl.load_workbook(OUT / oracle.BOOK)
assert wb.sheetnames == ["持仓重建", "股利明细", "净值汇总", "公司行为"]
summary = {r[0]: r[1:] for r in wb["净值汇总"].iter_rows(values_only=True) if r[0]}
assert abs(summary["资产净值"][0] - 67281559.85) < 0.005
assert abs(summary["估值差错率（管理人）"][0] - 0.0034868) < 1e-7
memo = "\n".join(p.text for p in docx.Document(OUT / oracle.MEMO).paragraphs)
for s in ["67,281,559.85", "234,594.90", "0.35%", "83,960.00", "24,146.10", "29,240.00", "54,720.00"]:
    assert s in memo, s
assert not re.search(r"[\[\]{}]", memo), "报告里不应出现程序数据结构"

rules = (ROOT / "rubrics.txt").read_text(encoding="utf-8")
weights = [int(x) for x in re.findall(r"^.+（(\d+) 分）$", rules, flags=re.M)]
assert sum(weights) == 100, weights
assert "得分=" not in rules

manifest = [{"name": p.name, "bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
            for p in inputs]
record = {
    "python": sys.version.split()[0], "os": platform.platform(),
    "dependencies": {m.__name__: m.__version__ for m in [openpyxl, docx]},
    "rubric_items": len(weights), "inputs": len(inputs),
    "pending": ["Linux 平台实际运行", "平台评分器 Oracle=1、nop=0", "指定模型难度测试"],
}
with zipfile.ZipFile(REF / "标准成品.zip", "w", compression=zipfile.ZIP_DEFLATED) as z:
    for name in [oracle.BOOK, oracle.MEMO]:
        z.write(OUT / name, name)
with zipfile.ZipFile(REF / "参考解与复核材料.zip", "w", compression=zipfile.ZIP_DEFLATED) as z:
    for p in [REF / "oracle.py", REF / "复核说明.txt", ROOT / "rubrics.txt"]:
        z.write(p, p.name)
    for name, obj in [("核对基准.json", oracle.basis(res)), ("input-manifest.json", manifest),
                      ("本地核对记录.json", record)]:
        z.writestr(name, json.dumps(obj, ensure_ascii=False, indent=1))
for name, n in [("标准成品.zip", 2), ("参考解与复核材料.zip", 6)]:
    with zipfile.ZipFile(REF / name) as z:
        assert z.testzip() is None and len(z.namelist()) == n
print(json.dumps(record, ensure_ascii=False, indent=1))
print("评分条数", len(weights), "总分", sum(weights), "输入文件", len(inputs))
