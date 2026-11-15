"""核对本题正式口径。只读附件，不参与出题上传。"""
import csv
from datetime import date
from pathlib import Path

root = Path(__file__).resolve().parent / "附件"
as_of = date(2026, 11, 1)
products = {r["product_code"]: r for r in csv.DictReader(open(root / "报价权限_产品.csv"))}
qual = {r["person_id"]: r for r in csv.DictReader(open(root / "报价权限_资格.csv"))}
reasons = ["冻结", "执照到期", "产品无效", "额度超限", "冷静期", "缺少跨产品资格"]

rows = []
for r in csv.DictReader(open(root / "报价权限_申请人.csv")):
    q = qual[r["person_id"]]
    p = products.get(r["product_code"])
    flags = {
        "冻结": q["frozen"] == "Y",
        "执照到期": date.fromisoformat(r["license_expiry"]) < as_of,
        "产品无效": p is None,
        "额度超限": p is not None and int(r["limit_wan"]) > int(p["cap_wan"]),
        "冷静期": bool(r["loss_date"]) and (as_of - date.fromisoformat(r["loss_date"])).days <= 10,
        "缺少跨产品资格": p is not None and p["cross"] == "Y" and q["extra"] != "Y",
    }
    reason = next((name for name in reasons if flags[name]), "")
    rows.append({
        "id": r["person_id"],
        "open": reason == "",
        "reason": reason,
        "cross": p is not None and p["cross"] == "Y",
        "colleague": r["colleague"],
    })

opened = [r for r in rows if r["open"]]
cross_open = [r for r in opened if r["cross"]]
frozen_open = [r for r in rows if r["open"] and r["id"] in {i for i, q in qual.items() if q["frozen"] == "Y"}]
diff = [r for r in rows if (r["colleague"] == "开通") != r["open"]]
gates = [len(opened) >= 8, len(cross_open) <= 2, len(frozen_open) == 0]
print("开通", len(opened), ",".join(r["id"] for r in opened))
print("跨产品开通", len(cross_open), ",".join(r["id"] for r in cross_open))
print("冻结误开", len(frozen_open))
print("与同事不同", len(diff), ",".join(r["id"] for r in diff))
print("门槛", gates, "结论", "签发" if all(gates) else "搁置")
for r in rows:
    print(r["id"], "开通" if r["open"] else "不开通", r["reason"] or "-", r["colleague"])
