"""核对本题正式口径。只读附件，不参与出题上传。"""
import csv
from datetime import date, timedelta
from collections import defaultdict
from pathlib import Path

root = Path(__file__).resolve().parent / "附件"
funds = {r["fund_id"]: r for r in csv.DictReader(open(root / "赎回划付_基金.csv"))}
days = [(r["date"], r["is_business_day"]) for r in csv.DictReader(open(root / "赎回划付_工作日.csv"))]
bds = [date.fromisoformat(d) for d, flag in days if flag == "Y"]

def add_bd(start, n):
    after = [d for d in bds if d > start]
    return after[n - 1]

def official(submit, n, large):
    base = submit if submit in bds else next(d for d in bds if d > submit)
    return add_bd(base, n + (2 if large else 0))

day_amt = defaultdict(int)
large_n = 0
bad_day = 0
diffs = 0
for r in csv.DictReader(open(root / "赎回划付_预约.csv")):
    fund = funds[r["fund_id"]]
    amt = int(r["shares"]) * int(r["nav"])
    large = amt > int(fund["aum_yuan"]) * 0.10
    pay = official(date.fromisoformat(r["submit_date"]), int(fund["n_days"]), large)
    col = date.fromisoformat(r["colleague_pay_date"])
    day_amt[(r["fund_id"], pay)] += amt
    large_n += large
    bad_day += pay not in bds
    diffs += pay != col
    print(r["order_id"], amt, "Y" if large else "N", pay, col)

breach = 0
for (fund_id, pay), amt in sorted(day_amt.items()):
    cash = int(funds[fund_id]["cash_yuan"])
    breach += amt > cash
    print(fund_id, pay, amt, "BREACH" if amt > cash else "ok")

gates = [breach == 0, large_n <= 2, bad_day == 0]
print("超限日", breach, "巨额", large_n, "非工作日", bad_day, "与同事不同", diffs)
print("门槛", gates, "结论", "签发" if all(gates) else "搁置")
