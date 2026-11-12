#!/usr/bin/env python3
"""从公开接口预取几项数据，只用来提前核算标答。正式证据以本人调用在线 MCP 的返回文件为准，这里的文件不上传。"""
import datetime as dt
import json
import time
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent / "预取"
OUT.mkdir(exist_ok=True)


def get(url: str) -> str:
    for k in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            return urllib.request.urlopen(req, timeout=30).read().decode()
        except Exception as e:  # noqa: BLE001
            err = e
            time.sleep(2 + 2 * k)
    raise SystemExit(f"拉取失败 {url}: {err!r}")


def yahoo(sym: str, start: str, end: str) -> dict:
    a = int(dt.datetime.fromisoformat(start).replace(tzinfo=dt.timezone.utc).timestamp())
    b = int(dt.datetime.fromisoformat(end).replace(tzinfo=dt.timezone.utc).timestamp())
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
           f"?period1={a}&period2={b}&interval=1d&events=div%2Csplits")
    res = json.loads(get(url))["chart"]["result"][0]
    off = res["meta"]["gmtoffset"]
    day = lambda t: dt.datetime.utcfromtimestamp(int(t) + off).strftime("%Y-%m-%d")
    q = res["indicators"]["quote"][0]
    ev = res.get("events", {})
    return {
        "bars": [{"date": day(t), "open": o, "close": c} for t, o, c in zip(res["timestamp"], q["open"], q["close"])],
        "splits": [{"date": day(k), "ratio": v["splitRatio"]} for k, v in sorted(ev.get("splits", {}).items())],
        "dividends": [{"date": day(k), "amount": v["amount"]} for k, v in sorted(ev.get("dividends", {}).items())],
    }


def tx_kline(code: str, beg: str, end: str) -> list:
    """腾讯公开日线，不复权。成交量单位是手。"""
    six, mkt = code.split(".")
    sym = mkt.lower() + six
    url = f"https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={sym},day,{beg},{end},400,"
    data = json.loads(get(url))["data"][sym]["day"]
    time.sleep(0.5)
    return [{"date": r[0], "open": float(r[1]), "close": float(r[2]), "high": float(r[3]), "low": float(r[4]),
             "volume_lots": float(r[5])} for r in data]


def main() -> None:
    # 题1：8 只 ETF 的拆分、合股
    var = {s: yahoo(s, "2019-06-01", "2026-10-31")["splits"]
           for s in ["SPY", "EFA", "EEM", "TLT", "IEF", "HYG", "GLD", "USO"]}
    (OUT / "题1_ETF拆分合股.json").write_text(json.dumps(var, ensure_ascii=False, indent=1))
    print("题1", var)
    # 题2：10 只 ETF 在缺口前后的不复权收盘价
    etf = {c: tx_kline(c, "2025-10-22", "2025-10-28") for c in
           ["510300.SH", "159915.SZ", "510880.SH", "159920.SZ", "513100.SH", "518880.SH", "511010.SH",
            "512880.SH", "512010.SH", "512400.SH"]}
    (OUT / "题2_ETF_20251024前后不复权.json").write_text(json.dumps(etf, ensure_ascii=False, indent=1))
    print("题2", {c: [(r["date"], r["close"]) for r in v] for c, v in etf.items()})
    # 题4：招商银行日线
    cmb = tx_kline("600036.SH", "2026-07-01", "2026-10-30")
    (OUT / "题4_招商银行日线.json").write_text(json.dumps(cmb, ensure_ascii=False, indent=1))
    print("题4", len(cmb), cmb[:2])
    # 题8：QQQ 未复权价和分红
    qqq = yahoo("QQQ", "2020-12-28", "2026-10-31")
    keep = {"first": [b for b in qqq["bars"] if b["date"] in ("2021-01-04",)],
            "last": [b for b in qqq["bars"] if b["date"] in ("2026-10-30",)],
            "splits": qqq["splits"],
            "dividends": [d for d in qqq["dividends"] if "2021-01-04" <= d["date"] <= "2026-10-30"]}
    (OUT / "题8_QQQ未复权与分红.json").write_text(json.dumps(keep, ensure_ascii=False, indent=1))
    print("题8", keep["first"], keep["last"], keep["splits"], len(keep["dividends"]),
          round(sum(d["amount"] for d in keep["dividends"]), 4))


if __name__ == "__main__":
    main()
