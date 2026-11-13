#!/usr/bin/env python3
"""把行情存档导出成附件里的分年 CSV，核对它和底稿 A01 一致，再打上传包。

用带 pandas 的解释器跑：/opt/homebrew/bin/python3.13 打包.py
这个脚本不上传。
"""
from pathlib import Path
import zipfile

import pandas as pd

HERE = Path(__file__).resolve().parent
ATT = HERE / "附件"
SRC = HERE.parents[1] / "high-econ" / "一期" / "fx_news_window"
SIDES = {"BID": "gbpusd_1m_B.pkl", "ASK": "gbpusd_1m_A.pkl"}
COLS = ["Open", "High", "Low", "Close"]


def export() -> None:
    old = ATT / "A01_gbpusd_1m.csv"
    if old.exists():
        old.unlink()
    for side, name in SIDES.items():
        df = pd.read_pickle(SRC / "raw" / name)
        year = pd.to_datetime(df["UTC_ms"], unit="ms", utc=True).dt.year
        for y, part in df.groupby(year):
            out = part.copy()
            for c in COLS:
                out[c] = out[c].map(lambda x: f"{x:.5f}")
            path = ATT / f"GBPUSD_1min_{side}_{y}.csv"
            out.to_csv(path, index=False)
            print(f"{path.name} {len(out)} 行 {path.stat().st_size / 1e6:.1f} MB")


def check() -> None:
    """按《A03》写的回放范围从分年文件重建，逐行对上底稿 A01。"""
    def load(side: str) -> pd.DataFrame:
        files = sorted(ATT.glob(f"GBPUSD_1min_{side}_*.csv"))
        df = pd.concat([pd.read_csv(f, dtype=str) for f in files], ignore_index=True)
        return df[["UTC_ms"] + COLS].rename(columns={c: f"{side.lower()}_{c.lower()}" for c in COLS})

    df = load("BID").merge(load("ASK"), on="UTC_ms", how="inner")
    t = pd.to_datetime(df["UTC_ms"].astype("int64"), unit="ms", utc=True)
    lon = t.dt.tz_convert("Europe/London")
    day = lon.dt.strftime("%Y-%m-%d")
    keep = (lon.dt.weekday < 5) & (lon.dt.hour <= 20) & (day >= "2025-01-02") & (day <= "2026-10-30")
    df = df[keep].copy()
    df.insert(0, "utc", t[keep].dt.strftime("%Y-%m-%d %H:%M"))
    df = df.drop(columns="UTC_ms").reset_index(drop=True)
    ref = pd.read_csv(SRC / "attachments" / "A01_gbpusd_1m.csv", dtype=str)
    assert df.equals(ref), "分年文件重建的回放行情和底稿 A01 不一致"
    print(f"核对通过：回放行情 {len(df)} 行，{day[keep].nunique()} 个伦敦交易日，与底稿 A01 逐行一致")


def pack() -> None:
    dest = HERE / "新闻过滤_附件包.zip"
    if dest.exists():
        dest.unlink()
    with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(p for p in ATT.iterdir() if p.is_file() and not p.name.startswith(".")):
            info = zipfile.ZipInfo(f.name)
            if any(ord(ch) > 127 for ch in f.name):
                info.flag_bits |= 0x800
            info.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(info, f.read_bytes())
            print("  ", f.name)
    print(f"{dest.name} {dest.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    export()
    check()
    pack()
