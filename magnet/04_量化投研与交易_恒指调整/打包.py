"""核对恒指调整附件并打上传包。不上传。

供应商日线只覆盖快照里没有的宁德时代两只代码。事件规则与底稿一致时，重算仍用 high-econ 的 rebuild.py。
"""

import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ATT = HERE / "附件"
NEED = [
    "恒指调整_AH不复权收盘价.csv",
    "恒指调整_美元汇率.csv",
    "恒指调整_成份股变动表.md",
    "恒指调整_300750.SZ日线.json",
    "恒指调整_3750.HK日线.json",
    "恒指调整_研究说明.md",
    "恒指调整_事件与持有.md",
    "恒指调整_开展标准.md",
    "恒指调整_公司代码.csv",
]


def check() -> None:
    missing = [name for name in NEED if not (ATT / name).exists()]
    if missing:
        raise SystemExit(f"缺少文件: {missing}")
    text = "\n".join((ATT / name).read_text(encoding="utf-8") for name in NEED if name.endswith((".md", ".csv")))
    for word in ("本题", "出题", "评分点", "标准答案", "考点", "题目给定"):
        if word in text:
            raise SystemExit(f"附件里还有「{word}」")
    prices = (ATT / "恒指调整_AH不复权收盘价.csv").read_text(encoding="utf-8")
    if "300750.SZ" in prices or "3750.HK" in prices:
        raise SystemExit("行情快照不该含宁德时代，这两只在供应商导出里")
    for name in ("恒指调整_300750.SZ日线.json", "恒指调整_3750.HK日线.json"):
        if (ATT / name).stat().st_size > 20 * 1024 * 1024:
            raise SystemExit(f"{name} 超过 20MB")
    print(f"核对通过：{len(NEED)} 个文件，快照不含宁德时代")


def pack() -> None:
    dest = HERE / "恒指调整_附件包.zip"
    if dest.exists():
        dest.unlink()
    with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name in NEED:
            info = zipfile.ZipInfo(name)
            if any(ord(ch) > 127 for ch in name):
                info.flag_bits |= 0x800
            info.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(info, (ATT / name).read_bytes())
            print("  ", name)
    print(f"{dest.name} {dest.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    check()
    pack()
