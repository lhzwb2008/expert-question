#!/usr/bin/env python3
"""制作独立的 ALE 试标副本，不改动旧项目。"""
import hashlib
import importlib.util
import json
import platform
import re
import shutil
import zipfile
import sys
import time
from pathlib import Path

import docx
import numpy
import openpyxl
import pandas

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
SOURCE = REPO / "finance/题目/04_ETF配权归因/题目附件"
ATT = ROOT / "input"
ATT.mkdir(parents=True, exist_ok=True)
for file in SOURCE.iterdir():
    if file.is_file() and file.suffix in (".csv", ".json", ".md"):
        shutil.copy2(file, ATT / file.name)

p = ATT / "ETF配权_A03_口径说明.md"
text = p.read_text(encoding="utf-8")
text = text.replace("10 只 ETF 的交易日完全一致。", "10 只 ETF 的交易日完全一致。只使用所附冻结数据，不下载替代行情。若与指数交易日有差异，列出差异；ETF 缺失日不插补，窗口按 A01 实际交易日计数。波动率完全并列时按 A02 顺序取前者。")
p.write_text(text, encoding="utf-8")
p = ATT / "ETF配权_A04_披露规则与交付.md"
text = p.read_text(encoding="utf-8").replace("「在线数据」：通过在线查询得到的行情和查询信息。", "「来源核对」：读取随附 ETF配权_MCP_000001.SS日线.json，列出 2020 至 2025 年末和 2026-10-30 的指数日期、收盘点位和 2021 至 2026 年涨跌幅；注明原导出的查询时间、代码、工具与参数、UTC 到交易日的处理、ETF 与指数日历核对及处理。这里是使用既有导出，不要求本次实际调用 MCP。")
text += """
## 文件与保存位置

输入文件运行时位于 /input/，不得改写。交付目录为 /output/；如果目录不存在，可自行创建。
提交 ETF配权方案归因测算表.xlsx 和 ETF配权方案归因说明.docx，不只提交截图、空表或文字摘要。不要求交源代码，不强制 Excel 公式；计算结果必须真实可编辑、可复核。
工作表名称分别为逐只归因表、分年归因表、逐月明细、来源核对。列必须含上述业务信息，允许列顺序、等价列名、字体与排版不同；逐只行序同 A02，逐年、逐月按时间排序。持仓可以用代码或名称，以集合核对。
说明文件还须写明方案与基准的收益算术合计、累计超额、超额为正月数；最大贡献及其占比、指数上涨年份及其超额合计、前三项正贡献和前三项负贡献及其贡献数值与正负方向。解释正贡献是否必然代表实际持有获利。明确给定区间、2026年截至日期、不扣交易成本、算术汇总与不作未来收益承诺的边界。

## 核对精度

收益、超额、贡献允许绝对误差 0.005 个百分点；占比允许 0.1 个百分点；指数点位允许 0.01 点，指数涨跌幅允许 0.01 个百分点。日期、代码、持有月份数及判断结论不允许误差。显示精度按上文要求，内部可保留更多位数。
0.005 个百分点等于收益小数 0.00005。百分数单元格或带(%)单位的普通数值均可，但单位必须明确。行内汇总或跨表核对允许由公开显示精度产生的舍入误差，不因此误判实质正确的结果。
来源元数据可写在来源核对表的说明区。说明文件和工作簿的共同数字、结论必须一致；来源无需重复完整抄写到所有文件。
"""
p.write_text(text, encoding="utf-8")
(ATT / "环境与输入说明.txt").write_text("""运行方式：冻结文件输入，离线完成，原始输入位于 /input/，两份最终成品写入 /output/。输入不可覆盖，初始输出目录不含成品。
平台目标系统为 Linux；页面已有 Python 为 3.10.12、LibreOffice 为 7.3.7。可用 Python 数据分析及文档处理，所需依赖 pandas 2.3.3、numpy 2.0.2、openpyxl 3.1.5、python-docx 1.2.0 须由平台预装，作答期间不得联网安装。开始前缺依赖应先修复环境，不能算作作答失败。
不强制特定实现语言或 Excel 公式；必须生成可打开、可编辑的 xlsx 和 docx 文件。需要图形查看器时由平台预置兼容 Office OOXML 的查看软件，不要求 Microsoft Office 专属功能。
ETF配权_A01_ETF复权日线.csv：code、date、adj_close；复权收盘价，供计算。
ETF配权_A02_ETF名单.csv：code、name；资产范围及规定顺序。
ETF配权_A03_口径说明.md：配权和归因的业务口径。
ETF配权_A04_披露规则与交付.md：披露条件、输出内容、路径、精度和解释边界。
ETF配权_MCP_000001.SS日线.json：原始导出含查询信息，原始返回中的 content[0].text 为行情JSON文本。Date 是 UTC 时间；单位为指数点。不得用新取行情替代冻结版本。
恢复起点：重新加载相同六份输入，校验文件版本；换用不含成品的输出目录。无需外部账号、MCP会话、密钥、GPU或网络。环境与字体缺失先由平台修复后再运行。
""", encoding="utf-8")

spec = importlib.util.spec_from_file_location("ale_etf_oracle", ROOT / "reference/oracle.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
start = time.monotonic()
module.produce(ATT, ROOT / "reference/成果", write_basis=False)
result = module.compute(ATT)
assert result["verdict"] == "补充披露两项"
assert abs(result["total_pct"] - 19.898) < 0.005
assert abs(result["top_share_pct"] - 59.0) < 0.1
assert result["missing"] == ["2025-10-24"]
assert result["positive_months"] == 40
assert abs(result["up_ex_pct"] + 11.221) < 0.005

old = openpyxl.load_workbook(REPO / "finance/题目/04_ETF配权归因/标准答案附件/ETF配权方案归因测算表.xlsx", data_only=True)
new = openpyxl.load_workbook(ROOT / "reference/成果/ETF配权方案归因测算表.xlsx", data_only=True)
counts = {"逐只归因表": 10, "分年归因表": 6, "逐月明细": 70}
checks = 0
for name, count in counts.items():
    for row in range(2, count + 2):
        for col in range(1, new[name].max_column + 1):
            a, b = old[name].cell(row, col).value, new[name].cell(row, col).value
            if name == "逐月明细" and col == 3:
                assert set(str(a).replace("、", " ").split()) == set(str(b).replace("、", " ").split())
            elif isinstance(a, (int, float)):
                assert abs(float(a) - float(b)) < 1e-9, (name, row, col, a, b)
            else:
                assert str(a) == str(b), (name, row, col, a, b)
            checks += 1

manifest = [{"name": p.name, "bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(ATT.iterdir()) if p.is_file()]
record = {"status": "本地参考成果已复算并与旧参考主体明细一致；不是ALE评分验收", "python": sys.version, "os": platform.platform(), "dependencies": {m.__name__: m.__version__ for m in [pandas, numpy, openpyxl, docx]}, "elapsed_seconds": round(time.monotonic() - start, 3), "compared_cells": checks, "oracle_score": None, "nop_score": None, "model_scores": None, "pending": ["Linux平台依赖实际加载验证", "平台评分程序Oracle=1与nop=0", "指定模型难度测试", "使用许可及重复提交确认"]}
print(json.dumps(record, ensure_ascii=False, indent=2))
rules = (ROOT / "rubrics.txt").read_text(encoding="utf-8")
weights = [int(x) for x in re.findall(r"^.+（(\d+) 分）$", rules, flags=re.M)]
assert len(weights) == 17 and sum(weights) == 100
with zipfile.ZipFile(ROOT / "reference/标准成品.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for name in [module.BOOK, module.MEMO]:
        archive.write(ROOT / "reference/成果" / name, name)
with zipfile.ZipFile(ROOT / "reference/参考解与复核材料.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for path in [ROOT / "reference/oracle.py", ROOT / "reference/复核说明.txt", ROOT / "rubrics.txt"]:
        archive.write(path, path.name)
    for name, data in [("核对基准.json", result), ("input-manifest.json", manifest), ("本地核对记录.json", record)]:
        archive.writestr(name, json.dumps(data, ensure_ascii=False, indent=2))
for name, count in [("标准成品.zip", 2), ("参考解与复核材料.zip", 6)]:
    with zipfile.ZipFile(ROOT / "reference" / name) as archive:
        assert archive.testzip() is None and len(archive.namelist()) == count
print("评分条数", len(weights), "总分", sum(weights), "输入数", len(manifest))
