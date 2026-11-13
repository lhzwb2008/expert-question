"""核对考试账户附件并打上传包。不上传。"""

import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ATT = HERE / "附件"
NEED = [
    "考试账户_QQQ_1min.csv",
    "考试账户_交易环境.md",
    "考试账户_DualThrust策略.md",
    "考试账户_Aqua_PayLater_200K.md",
    "考试账户_FTMO_2Step_100K.md",
    "考试账户_测算与交付.md",
    "考试账户_同事测算说明.md",
    "考试账户_同事测算摘要.csv",
]


def check() -> None:
    missing = [name for name in NEED if not (ATT / name).exists()]
    if missing:
        raise SystemExit(f"缺少文件: {missing}")
    text = "\n".join((ATT / name).read_text(encoding="utf-8") for name in NEED if name.endswith(".md"))
    for word in ("本题", "出题", "评分点", "标准答案", "考点"):
        if word in text:
            raise SystemExit(f"附件里还有「{word}」")
    bars = ATT / "考试账户_QQQ_1min.csv"
    if bars.stat().st_size > 20 * 1024 * 1024:
        raise SystemExit("分钟行情超过 20MB")
    print(f"核对通过：{len(NEED)} 个文件，分钟行情 {bars.stat().st_size / 1e6:.1f} MB")


def pack() -> None:
    dest = HERE / "考试账户_附件包.zip"
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
