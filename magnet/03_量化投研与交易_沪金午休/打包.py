"""生成沪金午休的三份行情附件，核对后打上传包。不上传。

行情取自 high-econ/一期/au_lunch_gate/attachments 和 finance/题目/08_沪金午休实盘准入，内容不改：
沪金 5 分钟线按 DateTime 的年份分成两份，各自不超过 20MB。标答重算仍用 high-econ 的 rebuild.py。
"""

import shutil
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ATT = HERE / "附件"
REPO = HERE.parent.parent
SRC = REPO / "high-econ/一期/au_lunch_gate/attachments"
COMEX = REPO / "finance/题目/08_沪金午休实盘准入/题目附件/沪金午休_MCP_COMEX黄金期货日线.json"
EARLY = "沪金午休_沪金5分钟线_2020至2023.csv"
LATE = "沪金午休_沪金5分钟线_2024至2026.csv"
XAU = "沪金午休_伦敦金午休1分钟线.csv"
GC = "沪金午休_COMEX黄金期货日线.json"
NEED = [
    EARLY,
    LATE,
    XAU,
    GC,
    "沪金午休_行情说明.md",
    "沪金午休_策略说明.md",
    "沪金午休_账户与费用.md",
    "沪金午休_上线标准.md",
]


def export() -> None:
    with open(SRC / "A01_au_5m.csv", encoding="utf-8") as src, \
            open(ATT / EARLY, "w", encoding="utf-8") as early, open(ATT / LATE, "w", encoding="utf-8") as late:
        head = src.readline()
        early.write(head)
        late.write(head)
        for line in src:
            (early if line[:4] <= "2023" else late).write(line)
    shutil.copyfile(SRC / "A02_xau_lunch_1m.csv", ATT / XAU)
    shutil.copyfile(COMEX, ATT / GC)


def rows(name: str) -> int:
    with open(ATT / name, encoding="utf-8") as f:
        return sum(1 for _ in f) - 1


def check() -> None:
    missing = [name for name in NEED if not (ATT / name).exists()]
    if missing:
        raise SystemExit(f"缺少文件: {missing}")
    text = "\n".join((ATT / name).read_text(encoding="utf-8") for name in NEED if name.endswith(".md"))
    for word in ("本题", "出题", "评分点", "标准答案", "考点", "题目给定", "A01", "A02"):
        if word in text:
            raise SystemExit(f"附件里还有「{word}」")
    n_early, n_late, n_xau = rows(EARLY), rows(LATE), rows(XAU)
    if n_early + n_late != 638227 or n_xau != 245827:
        raise SystemExit(f"行数对不上：{n_early} + {n_late}，{n_xau}")
    for name in NEED:
        size = (ATT / name).stat().st_size
        if size > 20 * 1024 * 1024:
            raise SystemExit(f"{name} 超过 20MB")
    print(f"核对通过：{len(NEED)} 个文件，沪金 {n_early} + {n_late} 行，伦敦金 {n_xau} 行")


def pack() -> None:
    dest = HERE / "沪金午休_附件包.zip"
    if dest.exists():
        dest.unlink()
    with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for name in NEED:
            info = zipfile.ZipInfo(name)
            if any(ord(ch) > 127 for ch in name):
                info.flag_bits |= 0x800
            info.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(info, (ATT / name).read_bytes(), compresslevel=9)
            print("  ", name, f"{(ATT / name).stat().st_size / 1e6:.1f} MB")
    print(f"{dest.name} {dest.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    if not all((ATT / name).exists() for name in (EARLY, LATE, XAU, GC)):
        export()
    check()
    pack()
