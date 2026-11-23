"""Builds src/server/studio/library.json. Run: PYTHONDONTWRITEBYTECODE=1 python tools/studio/build_library.py
Templates in corp/policies/hr/fin_comp/sales/leasing/letters are generated; e-mail and marketing templates
(and SC-03) are kept and aligned to swkpropertiesuae.com official company details (RERA ORN 51517, DET Licence 1511391,
25th Floor Al Saqr Building Sheikh Zayed Road, +971 56 433 0448, info@swkpropertiesuae.com, official hours).
Codes are stable so saved documents keep their template link."""
import json, os, re, sys
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(__file__))
import corp, policies, hr, fin_comp, sales, leasing, letters

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "src", "server", "studio", "library.json")
new = [d for m in (corp, policies, hr, fin_comp, sales, leasing, letters) for d in m.DOCS]
codes = [d["code"] for d in new]
dupes = {c for c in codes if codes.count(c) > 1}
assert not dupes, f"duplicate codes: {dupes}"
old = json.load(open(OUT, encoding="utf-8"))
keep = [t for t in old if t["code"] not in codes and (t["category"] in ("E-mail templates", "Marketing & Brochures") or t["code"] == "SC-03")]

CONTACT_STRIP = (
    '<div class="contact-strip">'
    '<p><strong>{{company.name}}</strong> · RERA ORN {{company.orn}} · DET Licence {{company.trade_license}}</p>'
    '<p>{{company.address}}</p>'
    '<p>{{company.phone}} · {{company.email}} · {{company.website}}</p>'
    '<p>{{company.hours}}</p>'
    '</div>'
)

def align_kept(t):
    h = t["html"]
    # Strip any previously injected <span class="ph"> wrapper around company ORN placeholders so clean tokens replace them
    h = re.sub(r'<span class="ph">\[Broker / ORN number\]</span>|\[Broker / ORN number\]', 'RERA ORN {{company.orn}} · DET Licence {{company.trade_license}}', h)
    h = re.sub(r'ORN\s*(?:<span class="ph">\[Number\]</span>|\[Number\])', 'RERA ORN {{company.orn}} · DET Licence {{company.trade_license}}', h)
    # Align outdated working hours across marketing & e-mail templates to swkpropertiesuae.com official hours
    h = h.replace("Sun–Thu 09:00–18:00; Saturday viewings by appointment", "{{company.hours}}")
    h = h.replace("Sun–Thu 09:00–18:00 GST; Saturday viewings by appointment", "{{company.hours}}")
    h = h.replace("Sunday–Friday 09:00–18:00 GST (Saturday 11:00–17:00)", "{{company.hours}}")
    # Standardise every marketing contact strip to include RERA ORN 51517, DET Licence 1511391, address, phone, email, website & hours
    h = re.sub(r'<div class="contact-strip">[\s\S]*?</div>', CONTACT_STRIP, h)
    # Upgrade MKT-01 (Company profile) & MKT-03 (Capability statement) details table with website facts
    if t["code"] == "MKT-01":
        h = h.replace(
            "SWK Properties UAE · Dubai. Sales, leasing, property management and advisory.",
            "SWK Properties LLC · RERA ORN {{company.orn}} · DET Licence {{company.trade_license}} · Sheikh Zayed Road, Dubai.",
        )
        h = h.replace(
            "{{company.name}} is a Dubai real estate brokerage serving buyers, sellers, landlords and tenants — residential, commercial and off-plan — with verified inventory and clear mandates.",
            "{{company.name}} (RERA ORN {{company.orn}}, DET Trade Licence {{company.trade_license}}) is a Dubai real estate brokerage operating from {{company.address}}. Backed by 18+ years of UAE market experience since 2008 across 5 Emirates, we advise buyers, investors, landlords and corporate occupiers across direct master-developer off-plan launches (Nakheel, Emaar, Binghatti, DAMAC, Azizi, Sobha & Omniyat), secondary homes, Ejari leasing, and Grade-A commercial spaces.",
        )
        h = h.replace("<tr><th>ORN</th>", "<tr><th>RERA ORN &amp; Licence</th>")
    elif t["code"] == "MKT-02":
        h = h.replace(
            "We price with evidence, market with permits, and hand over with receipts.",
            "18+ years advising UAE buyers & investors · RERA ORN {{company.orn}} · DET Licence {{company.trade_license}} · 0% primary off-plan buyer fee.",
        )
    elif t["code"] == "MKT-03":
        h = h.replace(
            '<span class="ph">[List only licences, memberships, permits and insurances currently held, with numbers and expiry dates. Add client references with their permission.]</span>',
            "{{company.name}} is licensed by the Department of Economy and Tourism (DET), Dubai under Trade Licence No. {{company.trade_license}} and registered with the Real Estate Regulatory Agency (RERA / DLD) under ORN {{company.orn}}. Operating from {{company.address}} across Dubai, Abu Dhabi, Sharjah, Ras Al Khaimah and Umm Al Quwain. Additional project permits, Trakheesi numbers and client references are supplied on request.",
        )
        h = h.replace(
            '<span class="ph">[Add the communities and asset classes you actively serve.]</span>',
            "Active across Downtown Dubai, Palm Jumeirah, Palm Jebel Ali, Dubai Marina, Business Bay, Dubai Hills Estate, Dubai Creek Harbour, JVC, DIFC, Sheikh Zayed Road and UAE master-developer corridors.",
        )
    elif t["category"] == "E-mail templates":
        # Append RERA ORN & Licence cleanly to the company signature line when not already present
        if "RERA ORN" not in h:
            h = h.replace(
                "{{company.name}}<br>{{company.phone}} · {{company.email}}",
                "{{company.name}} · RERA ORN {{company.orn}} · DET Licence {{company.trade_license}}<br>{{company.address}}<br>{{company.phone}} · {{company.email}} · {{company.website}}",
            )
    t = dict(t)
    t["html"] = h
    return t

keep = [align_kept(t) for t in keep]
lib = new + keep
for t in lib:
    assert t["html"].count("<table") == t["html"].count("</table>"), t["code"]
    assert "{{company." not in re.sub(r"\{\{company\.(name|address|phone|email|website|trade_license|orn|trn|hours)\}\}", "", t["html"]), f"unknown company token in {t['code']}"
    t["tags"] = t.get("tags") or t["title"].lower()
order = ["Corporate Governance", "Policies", "HR & Administration", "Finance & Procurement", "Compliance & Permits", "Control & Guidance", "Sales (Secondary)", "Off-Plan", "Leasing", "Property Management", "Letters & Notices", "Sales & Customers", "Marketing & Brochures", "E-mail templates"]
lib.sort(key=lambda t: (order.index(t["category"]) if t["category"] in order else 99, t["code"]))
json.dump(lib, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{len(lib)} templates ({len(new)} generated, {len(keep)} kept) -> {OUT}")
from collections import Counter
for k, v in Counter(t["category"] for t in lib).items(): print(f"  {v:3}  {k}")
