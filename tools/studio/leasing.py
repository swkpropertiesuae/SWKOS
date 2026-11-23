from lib import *

def L(code, title, kind, desc, html, tags="", cat="Leasing"):
    return dict(code=code, title=title, category=cat, kind=kind, orientation="Portrait", letterhead=True, description=desc, tags=tags, html=html)

LEASE = lambda: fields([("Annual rent", "AED [000,000]"), ("Payment", "[1 / 2 / 4 / 12] cheques"), ("Security deposit", "AED [00,000] ([5]% unfurnished / [10]% furnished)"), ("Term", "[Start date] to [End date]"), ("Ejari no.", "[Number]")], "Tenancy")

DOCS = [
L("LC-02", "Residential tenancy contract (summary and special conditions)", "Contract", "Tenancy terms and addendum. The official Dubai unified tenancy contract and Ejari registration remain the legal documents.",
  head("Tenancy", "Residential tenancy agreement", [("Contract no.", "[TC-0000]"), ("Date", "{{today}}")]) +
  party_block("Landlord") + party_block("Tenant") + PROPERTY("Premises") + LEASE() +
  clauses([("Use", ["The premises shall be used for residential purposes only by the Tenant and immediate family. The maximum number of occupants is [0]."]),
           ("Rent and cheques", ["Rent is payable by post-dated cheques delivered on signing. A returned cheque incurs a charge of AED [500] and may lead to legal action."]),
           ("Security deposit", ["The deposit is refunded within [30] days after the end of the tenancy, less the cost of damage beyond normal wear and tear and any unpaid utilities."]),
           ("Maintenance", ["The Landlord is responsible for major maintenance and structural repairs; the Tenant is responsible for minor maintenance up to AED [500] per item and for damage caused by the Tenant."]),
           ("Utilities", ["DEWA, cooling, gas, internet and municipality fees are paid by the Tenant unless agreed otherwise."]),
           ("Sub-letting", ["The Tenant shall not sub-let or share the premises without the Landlord's written consent."]),
           ("Renewal and notices", ["Either party wishing to change the terms on renewal shall notify the other at least 90 days before expiry. Rent increases follow the RERA rental index (Decree No. 43 of 2013)."]),
           ("Governing law", ["This agreement is governed by Law No. 26 of 2007 as amended by Law No. 33 of 2008 regulating the relationship between landlords and tenants in Dubai. Disputes are referred to the Rental Dispute Settlement Centre."])]) +
  sig(["Landlord", "Tenant", "Broker – for {{company.name}}"]), "tenancy contract lease residential Ejari"),
L("LS-APPLY", "Tenancy application form", "Form", "Prospective tenant application with documents checklist.",
  head("Leasing", "Tenancy application", [("Property", "[Community, unit]"), ("Date", "{{today}}")]) + party_block("Applicant") +
  fields([("Employer / company", "[Employer]"), ("Monthly income", "AED [00,000]"), ("Occupants", "[Adults] adults, [Children] children"), ("Pets", "[None / details]"), ("Move-in date", "[Date]"), ("Offered rent", "AED [000,000] in [0] cheques")], "Application") +
  checklist(["Passport and visa copy", "Emirates ID", "Salary certificate or trade licence", "Company documents (if corporate lease)"], "Documents") + sig(["Applicant", "Agent"]), "tenancy application tenant form"),
L("LS-LL-AUTH", "Landlord leasing authorisation", "Contract", "Landlord appoints the broker to lease the property.",
  head("Leasing mandate", "Landlord leasing authorisation", [("Date", "{{today}}"), ("Type", "[Exclusive / Non-exclusive]")]) + party_block("Landlord") + BROKER + PROPERTY() +
  fields([("Target annual rent", "AED [000,000]"), ("Minimum acceptable", "AED [000,000]"), ("Cheques accepted", "[1–4]"), ("Furnished", "[Yes / No]"), ("Available from", "[Date]")], "Terms") +
  clauses([("Fee", ["The Landlord pays [5]% of the annual rent / AED [0,000] plus VAT on signing of the tenancy contract [or the fee is paid by the tenant as agreed]."]), ("Authority", ["The Broker may advertise (with Trakheesi permit), show the property, collect cheques and the deposit on the Landlord's behalf and hand them over within [3] working days."])]) +
  sig(["Landlord", "Broker – for {{company.name}}"]), "landlord authorisation leasing mandate"),
L("LS-HOLD", "Holding deposit receipt", "Form", "Tenant deposit to hold a property pending contract.",
  head("Leasing", "Holding deposit receipt", [("Receipt no.", "[HD-0000]"), ("Date", "{{today}}")]) +
  fields([("Received from", "[Tenant name]"), ("Property", "[Community, unit]"), ("Amount", "AED [0,000]"), ("Agreed rent", "AED [000,000] in [0] cheques"), ("Contract to be signed by", "[Date]")]) +
  clauses([("Terms", ["The holding deposit becomes part of the security deposit on signing.", "If the tenant withdraws, the deposit is [forfeited / refunded less AED [0]]. If the landlord withdraws, it is refunded in full."])]) + sig(["Tenant", "For {{company.name}}"]), "holding deposit receipt tenant"),
L("LS-EJARI-CHK", "Ejari registration checklist", "Form", "Documents for Ejari registration.",
  head("Leasing", "Ejari registration checklist", [("Property", "[Unit]"), ("Tenant", "[Name]")]) +
  checklist(["Signed unified tenancy contract", "Tenant passport, visa and Emirates ID", "Landlord passport / Emirates ID or company licence", "Title deed copy", "DEWA premise number", "Power of attorney (if signed by attorney)", "Ejari fee paid", "Ejari certificate issued and shared with tenant and landlord"]), "Ejari registration checklist"),
L("LS-ADDENDUM", "Tenancy addendum (special conditions)", "Contract", "Additional terms attached to the unified tenancy contract.",
  head("Tenancy", "Addendum to tenancy contract", [("Tenancy contract", "[Ejari / contract no.]"), ("Date", "{{today}}")]) +
  clauses([("Special conditions", ["[Rent-free period of [0] days from [Date].]", "[Landlord to repaint and deep-clean before move-in.]", "[Parking bay no. [000] allocated.]", "[Pets permitted: [details], subject to building rules.]", "[Early termination with [2] months' rent as compensation and [60] days' notice.]"])]) +
  paras("All other terms of the tenancy contract remain unchanged. In case of conflict, this addendum prevails to the extent permitted by law.") + sig(["Landlord", "Tenant"]), "addendum tenancy special conditions"),
L("LS-MOVEIN", "Move-in / move-out inspection report", "Report", "Condition report at the start or end of a tenancy.",
  head("Inspection", "Property condition report", [("Type", "[Move-in / Move-out]"), ("Property", "[Unit]"), ("Date", "{{today}}")]) +
  table(["Area", "Walls / ceiling", "Floor", "Fixtures & fittings", "Appliances", "Notes / photo ref."], [[a, "[Good]", "[Good]", "[Good]", "[Good]", ""] for a in ["Entrance", "Living / dining", "Kitchen", "Master bedroom", "Bedroom 2", "Bathroom(s)", "Balcony", "Maid's room / store"]]) +
  fields([("DEWA meter", "[Reading]"), ("Cooling meter", "[Reading]"), ("Keys handed", "[0] keys, [0] cards")]) + sig(["Landlord / agent", "Tenant"]), "move in move out inspection condition report"),
L("LS-PDC", "Post-dated cheque collection schedule", "Form", "Record of rent cheques received.",
  head("Leasing", "Rent cheque schedule", [("Property", "[Unit]"), ("Tenant", "[Name]")]) +
  table(["#", "Cheque no.", "Bank", "Date", "Amount (AED)", "Status"], [["1", "[000000]", "[Bank]", "[Date]", "[00,000]", "[Held]"], ["2", "[000000]", "[Bank]", "[Date]", "[00,000]", "[Held]"], ["3", "[000000]", "[Bank]", "[Date]", "[00,000]", "[Held]"], ["4", "[000000]", "[Bank]", "[Date]", "[00,000]", "[Held]"]]) + sig(["Received from tenant", "Handed to landlord"]), "PDC cheque schedule rent"),
L("LN-01", "Lease renewal offer", "Letter", "Renewal terms sent to the tenant at least 90 days before expiry.",
  letter("Letter", "[Tenant name]<br>[Unit, building]", "Renewal of tenancy – [Unit]", ["Dear [Tenant name],", "Your tenancy (Ejari [No.]) expires on <b>[Date]</b>. On behalf of the landlord, we offer renewal on the following terms:", table(["Term", "Current", "Renewal"], [["Annual rent (AED)", "[000,000]", "[000,000]"], ["Cheques", "[0]", "[0]"], ["Term", "[Dates]", "[Dates]"]]), "Any change in rent follows the RERA rental index. Please confirm your decision by <b>[Date]</b>."], "[Name]<br>Leasing Manager"), "lease renewal offer tenant"),
L("LS-RENT-INC", "Notice of rent change (90 days)", "Letter", "Landlord's 90-day notice of changed terms before renewal.",
  letter("Notice", "[Tenant name]", "Notice of amended tenancy terms on renewal", ["Dear [Tenant name],", "In accordance with Article 14 of Law No. 26 of 2007, we give notice at least 90 days before the expiry of your tenancy on <b>[Date]</b> that the landlord intends to amend the rent on renewal to <b>AED [000,000]</b> per year.", "This increase is within the limit allowed by the RERA rental index calculator (Decree No. 43 of 2013) for the property; the calculation is attached."], "[Name]<br>For the landlord"), "rent increase notice 90 days RERA index"),
L("LN-02", "Notice to vacate (12 months)", "Letter", "Landlord's 12-month eviction notice for permitted reasons. Must be served by notary public or registered mail.",
  letter("Notice", "[Tenant name]", "12-month notice to vacate – [Unit]", ["Dear [Tenant name],", "In accordance with Article 25(2) of Law No. 26 of 2007 as amended, we hereby give you twelve (12) months' notice to vacate the premises on or before <b>[Date]</b> because the landlord [intends to sell the property / requires it for personal use or for a first-degree relative / intends to demolish or renovate it].", "Please arrange to hand over the premises in good condition with all keys on that date."], "[Landlord name]<br>Landlord") +
  note("This notice is valid only when served through a notary public or registered mail and only for the reasons permitted by law."), "eviction notice 12 months vacate"),
L("LS-ARREARS", "Rent arrears notice", "Letter", "Formal notice of unpaid rent.",
  letter("Notice", "[Tenant name]", "Unpaid rent – [Unit]", ["Dear [Tenant name],", "Rent of <b>AED [00,000]</b> due on [Date] remains unpaid [cheque no. [000000] was returned].", "Please pay within <b>30 days</b> of this notice. If payment is not received, the landlord may file a case at the Rental Dispute Settlement Centre for payment and eviction as permitted by law."], "[Name]<br>For the landlord"), "rent arrears unpaid notice"),
L("LS-EARLY-TERM", "Early termination agreement", "Contract", "Mutual agreement to end a tenancy early.",
  head("Tenancy", "Early termination agreement", [("Tenancy contract", "[Ejari no.]"), ("Date", "{{today}}")]) + party_block("Landlord") + party_block("Tenant") +
  clauses([("Termination", ["The tenancy ends on <b>[Date]</b> by mutual agreement."]), ("Compensation", ["The Tenant pays [two months'] rent of AED [00,000] as compensation [as agreed in the contract]."]), ("Settlement", ["Unused cheques are returned; the security deposit is refunded after the move-out inspection and final utility bills."]), ("Ejari", ["The Ejari registration is cancelled after handover."])]) + sig(["Landlord", "Tenant"]), "early termination lease"),
L("LN-03", "Security deposit settlement", "Letter", "Deposit refund calculation after move-out.",
  letter("Letter", "[Tenant name]", "Security deposit settlement – [Unit]", ["Dear [Tenant name],", "Following the move-out inspection on [Date], the settlement of your security deposit is as follows:", table(["Item", "AED"], [["Security deposit held", "[0,000]"], ["Less: repairs beyond normal wear and tear", "([000])"], ["Less: final DEWA / cooling bills", "([000])"], ["<b>Refund due</b>", "<b>[0,000]</b>"]]), "The refund will be paid to [IBAN / cheque] within [7] working days."], "[Name]<br>Leasing Manager"), "security deposit refund settlement"),
L("LS-CLEARANCE", "Tenant clearance certificate", "Certificate", "Confirms the tenant has no dues at move-out.",
  head("Leasing", "Tenant clearance certificate") + paras("This certifies that <b>[Tenant name]</b> has vacated unit <b>[Unit]</b>, [Building], on <b>[Date]</b>, returned all keys and has no outstanding rent, utility or service obligations to the landlord as at this date.") + company_sig(), "clearance certificate tenant move out"),
L("LS-SUBLET", "Consent to sub-let / share", "Letter", "Landlord's written consent to sub-letting.",
  letter("Consent", "[Tenant name]", "Consent to sub-let – [Unit]", ["Dear [Tenant name],", "The landlord consents to you sub-letting [part of / the whole of] the premises to <b>[Sub-tenant name]</b> from [Date] to [Date], subject to building rules and the original tenancy terms, which remain your responsibility."], "[Landlord name]<br>Landlord"), "sublet consent"),
L("LN-05", "Maintenance access notice", "Letter", "Notice to the tenant of a maintenance visit.",
  letter("Notice", "[Tenant name]", "Access for maintenance – [Unit]", ["Dear [Tenant name],", "Our contractor [Contractor] will attend your unit on <b>[Date]</b> between <b>[Time]</b> to carry out [work]. Please arrange access or let us know a suitable alternative time."], "[Name]<br>Property Management"), "maintenance access notice"),
# ---------------------------------------------------------------- property management
L("LC-04", "Property management agreement", "Contract", "Owner appoints the company to manage a property.",
  head("Property management", "Property management agreement", [("Agreement no.", "[PM-0000]"), ("Date", "{{today}}")]) + party_block("Owner") + BROKER + PROPERTY() +
  clauses([("Services", ["Marketing and leasing, tenant screening, contracts and Ejari, rent and cheque collection, renewals, maintenance coordination, inspections, utility and service charge payments from rent, and monthly statements."]),
           ("Fees", ["Management fee of [5]% of rent collected plus VAT; leasing fee of [5]% of annual rent on new tenancies; maintenance at cost plus [10]% coordination fee for works over AED [1,000] with owner approval."]),
           ("Owner approvals", ["Repairs over AED [1,000], new tenancies and rent changes require the Owner's written approval, except emergencies to protect the property."]),
           ("Funds", ["Rent is paid to the Owner monthly after deducting approved costs and fees, with a statement and receipts."]),
           ("Term", ["[12] months, renewing automatically unless either party gives [60] days' written notice."])]) +
  sig(["Owner", "For {{company.name}}"]), "property management agreement owner", cat="Property Management"),
L("PM-ONBOARD", "Owner onboarding form", "Form", "Collects owner, property, bank and preference details for management.",
  head("Property management", "Owner onboarding") + party_block("Owner") + PROPERTY() +
  fields([("Bank name", "[Bank]"), ("IBAN", "[AE00 ...]"), ("Approval limit for repairs", "AED [1,000]"), ("Preferred contact", "[WhatsApp / e-mail]"), ("Service charge paid by", "[Owner / from rent]")], "Preferences") +
  checklist(["Title deed copy", "Owner passport / Emirates ID", "Power of attorney (if any)", "Keys and access cards received", "Existing tenancy contract and Ejari (if tenanted)", "DEWA and cooling account details"], "Documents") + sig(["Owner", "Property Manager"]), "owner onboarding property management", cat="Property Management"),
L("LN-04", "Owner statement cover letter", "Letter", "Monthly owner statement cover.",
  letter("Letter", "[Owner name]", "Owner statement – [Month]", ["Dear [Owner name],", "Please find your statement for [Month] for unit [Unit].", table(["Item", "AED"], [["Rent collected", "[0,000]"], ["Less: management fee", "([000])"], ["Less: maintenance", "([000])"], ["Less: service charges paid", "([000])"], ["<b>Net paid to you</b>", "<b>[0,000]</b>"]]), "The net amount was transferred to your account on [Date]."], "[Name]<br>Property Manager"), "owner statement monthly", cat="Property Management"),
L("PM-WORKORDER", "Maintenance work order", "Form", "Instruction to a contractor with approval and completion sign-off.",
  head("Property management", "Work order", [("Work order no.", "[WO-0000]"), ("Date", "{{today}}")]) +
  fields([("Property", "[Unit]"), ("Reported by", "[Tenant / Owner / Inspection]"), ("Issue", "[Description]"), ("Priority", "[Emergency / Urgent / Routine]"), ("Contractor", "[Name, phone]"), ("Quoted cost", "AED [0,000]"), ("Owner approval", "[Name, date]")]) +
  fields([("Work done", "[Description]"), ("Completion date", "[Date]"), ("Invoice no.", "[No.]")], "Completion") + sig(["Contractor", "Tenant / occupant", "Property Manager"]), "work order maintenance contractor", cat="Property Management"),
L("PM-REQUEST", "Maintenance request form", "Form", "Tenant request for repairs.",
  head("Property management", "Maintenance request") + fields([("Tenant", "[Name]"), ("Unit", "[Unit]"), ("Mobile", "[Mobile]"), ("Issue", "[Description]"), ("Location in unit", "[Room]"), ("Preferred visit time", "[Date, time]"), ("Permission to enter if absent", "[Yes / No]")]) + sig(["Tenant"]), "maintenance request tenant repair", cat="Property Management"),
L("PM-CONTRACTOR", "Contractor service agreement", "Contract", "Annual maintenance or service contract with a supplier.",
  head("Property management", "Contractor service agreement", [("Date", "{{today}}")]) + party_block("Contractor", "co") +
  clauses([("Services", ["[AC servicing / plumbing / electrical / cleaning / pest control] for the properties listed in the schedule."]), ("Response times", ["Emergency: within [4] hours; urgent: [24] hours; routine: [3] working days."]), ("Prices", ["As per the attached rate card, fixed for the term, exclusive of VAT."]), ("Insurance and licences", ["The Contractor holds a valid trade licence, third-party liability insurance of at least AED [1,000,000] and workers' insurance."]), ("Term", ["[12] months from [Date]; either party may terminate with [30] days' notice."])]) + sig(["For {{company.name}}", "Contractor"]), "contractor service agreement maintenance AMC", cat="Property Management"),
L("PM-ANNUAL", "Annual property report", "Report", "Annual performance report for the owner.",
  head("Property management", "Annual property report", [("Property", "[Unit]"), ("Year", "[2026]"), ("Owner", "[Name]")]) +
  table(["Metric", "Value"], [["Gross rent collected", "AED [000,000]"], ["Occupancy", "[100]%"], ["Maintenance spend", "AED [0,000]"], ["Service charges", "AED [00,000]"], ["Net income", "AED [000,000]"], ["Net yield on purchase price", "[0.0]%"]]) +
  fields([("Condition", "[Summary]"), ("Market rent today", "AED [000,000]"), ("Recommendations", "[Upgrades, renewal strategy, sale timing]")], "Summary"), "annual report owner yield", cat="Property Management"),
]
