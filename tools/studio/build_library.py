"""Builds src/server/studio/library.json. Run: python3 tools/studio/build_library.py
Templates in corp/policies/hr/fin_comp/sales/leasing/letters are generated; e-mail and marketing templates
(and SC-03) are kept from the current library. Codes are stable so saved documents keep their template link."""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import corp, policies, hr, fin_comp, sales, leasing, letters

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "src", "server", "studio", "library.json")
new = [d for m in (corp, policies, hr, fin_comp, sales, leasing, letters) for d in m.DOCS]
codes = [d["code"] for d in new]
dupes = {c for c in codes if codes.count(c) > 1}
assert not dupes, f"duplicate codes: {dupes}"
old = json.load(open(OUT))
keep = [t for t in old if t["code"] not in codes and (t["category"] in ("E-mail templates", "Marketing & Brochures") or t["code"] == "SC-03")]
lib = new + keep
for t in lib:
    assert t["html"].count("<table") == t["html"].count("</table>"), t["code"]
    assert "{{company." not in re.sub(r"\{\{company\.(name|address|phone|email|website)\}\}", "", t["html"]), f"unknown company token in {t['code']}"
    t["tags"] = t.get("tags") or t["title"].lower()
order = ["Corporate Governance", "Policies", "HR & Administration", "Finance & Procurement", "Compliance & Permits", "Control & Guidance", "Sales (Secondary)", "Off-Plan", "Leasing", "Property Management", "Letters & Notices", "Sales & Customers", "Marketing & Brochures", "E-mail templates"]
lib.sort(key=lambda t: (order.index(t["category"]) if t["category"] in order else 99, t["code"]))
json.dump(lib, open(OUT, "w"), ensure_ascii=False, indent=1)
print(f"{len(lib)} templates ({len(new)} generated, {len(keep)} kept) -> {OUT}")
from collections import Counter
for k, v in Counter(t["category"] for t in lib).items(): print(f"  {v:3}  {k}")
