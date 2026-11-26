"""项目冗余材料用的行情读取：读 新题数据/项目冗余_补充/ 下 mcp_call.py --save 的原始返回。"""
import json
from pathlib import Path
import pandas as pd
RAW = Path(__file__).resolve().parents[2] / "新题数据" / "项目冗余_补充"
HOURS = {"N225": 9}
def load(name, hours=0):
    rec = json.load(open(RAW / f"{name}.json", encoding="utf-8"))
    d = pd.DataFrame(json.loads(rec["原始返回"]["content"][0]["text"]))
    d["day"] = (pd.to_datetime(d.Date.str[:19]) + pd.Timedelta(hours=hours)).dt.strftime("%Y-%m-%d")
    assert not d.day.duplicated().any(), name
    return rec, d.set_index("day")
def lp(sym):
    rec = json.load(open(RAW / "longport" / f"{sym}_noadj.json", encoding="utf-8"))
    d = pd.DataFrame(rec["rows"]).set_index("date")
    for c in ["open", "high", "low", "close", "turnover"]:
        d[c] = d[c].astype(float)
    return rec, d
