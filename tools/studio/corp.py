from lib import *

def T(code, title, kind, desc, html, tags="", cat="Corporate Governance"):
    return dict(code=code, title=title, category=cat, kind=kind, orientation="Portrait", letterhead=True, description=desc, tags=tags, html=html)

DOCS = [
T("CO-FACTS", "Company particulars", "Form", "Official company particulars sheet for banks, developers and government portals.",
  head("Corporate information", "Company particulars") +
  fields([("Legal name", "{{company.name}}"), ("Legal form", "Limited Liability Company (L.L.C.)"), ("Trade licence no.", "[Licence no.]"), ("Licensing authority", "Department of Economy and Tourism, Dubai"),
          ("Licence activities", "Real estate brokerage; leasing and management of property; [other]"), ("RERA Office Registration (ORN)", "51517"), ("Tax registration no. (TRN)", "[TRN]"),
          ("Date of establishment", "[Date]"), ("Registered office", "{{company.address}}"), ("Telephone", "{{company.phone}}"), ("E-mail", "{{company.email}}"), ("Website", "{{company.website}}")], "Registration") +
  table(["Name", "Role", "Nationality", "Shareholding"], [["[Name]", "Owner & Managing Director", "[Nationality]", "[100]%"], ["[Name]", "[Manager]", "[Nationality]", "—"]], "Ownership and management") +
  fields([("Bank", "[Bank name]"), ("Account name", "{{company.name}}"), ("IBAN", "[AE00 0000 0000 0000 0000 000]"), ("SWIFT", "[SWIFT]")], "Banking") +
  company_sig(), "company profile facts licence ORN TRN"),
T("CO-LETTER", "Company letterhead", "Letter", "Blank company letter on the official letterhead.",
  letter("Letter", "[Recipient name]<br>[Company]<br>[Address]", "[Subject]", ["Dear [Recipient],", "[Body of the letter.]", "Should you require any further information, please do not hesitate to contact us."]), "letter blank letterhead"),
T("CO-REG", "Corporate document register", "Form", "Register of the company's constitutional, licensing and regulatory documents with expiry dates.",
  head("Corporate records", "Corporate document register") +
  table(["Document", "Number", "Issued by", "Issue date", "Expiry", "Owner"], [[d, "[No.]", a, "[Date]", "[Date]", "[Name]"] for d, a in [
    ("Trade licence", "DET Dubai"), ("Memorandum of Association", "Notary Public"), ("RERA ORN certificate", "RERA / DLD"), ("Establishment card (Immigration)", "GDRFA"),
    ("MOHRE establishment registration", "MOHRE"), ("VAT registration certificate", "Federal Tax Authority"), ("Corporate tax registration", "Federal Tax Authority"),
    ("Office Ejari", "RERA"), ("goAML registration", "UAE FIU"), ("Chamber of Commerce membership", "Dubai Chambers"), ("Professional indemnity insurance", "[Insurer]"), ("Company stamp & seal register", "Internal")]]) +
  note("Review this register monthly; licences must be renewed before expiry to keep advertising permits and broker cards valid."), "register licence expiry corporate records"),
T("CG-BRD-RES", "Board / owner resolution", "Document", "Written resolution of the owner or board approving a corporate action.",
  head("Corporate resolution", "Written resolution of the owner(s)", [("Company", "{{company.name}}"), ("Resolution no.", "[RES-0000]"), ("Date", "{{today}}")]) +
  paras("The undersigned, being the owner(s) of {{company.name}} holding together 100% of the share capital, hereby adopt the following resolution in writing, which shall be as valid and effective as if passed at a duly convened meeting:") +
  clauses([("Recitals", ["WHEREAS the company wishes to [describe the matter, e.g. open a bank account / appoint an authorised signatory / enter into an agreement with ...];", "WHEREAS the owner(s) have reviewed the relevant documents and consider the matter to be in the best interests of the company;"]),
           ("Resolved", ["THAT the company approves [the action] on the terms presented to the owner(s).", "THAT [Name], holder of passport no. [Passport no.], is authorised to sign all documents, forms and instruments and to do all acts necessary to give effect to this resolution.", "THAT this resolution takes effect on [Date] and remains in force until revoked in writing."])]) +
  sig(["Owner / shareholder", "Owner / shareholder"]), "board resolution shareholders owner approval"),
T("CG-SH-RES", "Shareholders' resolution (general assembly)", "Document", "Minutes-style resolution of the general assembly of an LLC.",
  head("General assembly", "Resolution of the general assembly of partners", [("Company", "{{company.name}}"), ("Meeting date", "[Date]"), ("Venue", "{{company.address}}")]) +
  table(["Partner", "Shares", "Percentage", "Present / proxy"], [["[Partner name]", "[000]", "[00]%", "[Present]"], ["[Partner name]", "[000]", "[00]%", "[Proxy]"]], "Attendance and quorum") +
  paras("The quorum being present in accordance with the Memorandum of Association and the Federal Decree-Law No. 32 of 2021 on Commercial Companies, the meeting was declared open and the following resolutions were passed:") +
  clauses([("Approval of accounts", ["The audited financial statements for the year ended [31 December 2025] were approved."]), ("Appointment of manager(s)", ["[Name] is appointed / re-appointed as Manager with the powers set out in the Memorandum of Association."]), ("Auditors", ["[Audit firm] is appointed as auditor for the financial year [2026]."]), ("Other business", ["[Describe any other resolution.]"])]) +
  sig(["Partner", "Partner", "Chair of the meeting", "Secretary"]), "general assembly partners shareholders LLC"),
T("CG-MIN-BRD", "Minutes of board / management meeting", "Report", "Formal minutes with attendance, decisions and action owners.",
  head("Meeting minutes", "Minutes of the [board / management] meeting", [("Date & time", "[Date] · [Time]"), ("Venue", "{{company.address}} / [Online]"), ("Chair", "[Name]"), ("Minutes taken by", "[Name]")]) +
  table(["Name", "Designation", "Attendance"], [["[Name]", "[Designation]", "Present"], ["[Name]", "[Designation]", "Apologies"]], "Attendance") +
  table(["#", "Agenda item", "Discussion summary", "Decision"], [["1", "Confirmation of previous minutes", "[Summary]", "Confirmed"], ["2", "Sales & leasing performance", "[Summary]", "[Decision]"], ["3", "Finance & cash position", "[Summary]", "[Decision]"], ["4", "Compliance & licences", "[Summary]", "[Decision]"], ["5", "Any other business", "[Summary]", "[Decision]"]], "Agenda and decisions") +
  table(["Action", "Owner", "Due date", "Status"], [["[Action]", "[Name]", "[Date]", "Open"]], "Action log") +
  sig(["Chair", "Secretary"]), "minutes meeting board management decisions actions"),
T("CG-AGM-NOTICE", "Notice of general meeting", "Letter", "Formal notice convening a general assembly of partners.",
  letter("Notice", "All partners of {{company.name}}", "Notice of [annual / extraordinary] general assembly", ["Notice is hereby given that the [annual / extraordinary] general assembly of the partners of {{company.name}} will be held on <b>[Date]</b> at <b>[Time]</b> at {{company.address}} to consider the following agenda:", "1. [Agenda item]<br>2. [Agenda item]<br>3. Any other business.", "A partner may appoint a proxy by written power of attorney delivered to the company at least [24] hours before the meeting. Supporting documents are available for inspection at the registered office."], "[Name]<br>Manager"), "notice general assembly AGM EGM"),
T("CG-POA-GEN", "General power of attorney (company)", "Contract", "Company power of attorney appointing an attorney to act on its behalf before authorities. Must be notarised.",
  head("Power of attorney", "General power of attorney", [("Principal", "{{company.name}}"), ("Attorney", "[Attorney full name]"), ("Date", "{{today}}")]) +
  party_block("Principal (company)", "co") + party_block("Attorney") +
  clauses([("Appointment", ["The Principal appoints the Attorney as its lawful attorney to act in its name and on its behalf in the United Arab Emirates for the purposes below."]),
           ("Powers", ["To represent the Principal before the Dubai Land Department, RERA, Dubai Municipality, DEWA, the Department of Economy and Tourism, MOHRE, GDRFA, the Federal Tax Authority, courts, notaries and all government and semi-government entities.", "To sign, submit and receive applications, forms, permits, certificates and correspondence; to pay and collect fees and deposits.", "To open, operate and close bank accounts only where expressly authorised by a separate board resolution.", "To appoint lawyers and agents and to delegate any of these powers, in whole or in part, where permitted by law."]),
           ("Term and revocation", ["This power of attorney is valid from [Date] until [Date] unless revoked earlier by notarised notice served on the Attorney."]),
           ("Governing law", ["This power of attorney is governed by the laws of the Emirate of Dubai and the federal laws of the UAE."])]) +
  note("Powers of attorney take effect only once attested by a UAE Notary Public (or legalised if signed abroad). Translate into Arabic where the authority requires it.") +
  sig(["Principal – authorised signatory", "Attorney"]), "power of attorney POA notary company"),
T("CG-POA-PROP", "Special power of attorney – property transaction", "Contract", "Owner's special POA authorising sale, purchase or leasing of a specific property. Must be notarised.",
  head("Power of attorney", "Special power of attorney – real estate", [("Principal", "[Owner name]"), ("Attorney", "[Attorney name]"), ("Date", "{{today}}")]) +
  party_block("Principal") + party_block("Attorney") + PROPERTY("Property concerned") +
  clauses([("Purpose", ["The Principal authorises the Attorney to [sell / purchase / lease / manage] the property described above."]),
           ("Powers", ["To sign the Memorandum of Understanding (Form F), the sale and purchase agreement, tenancy contracts and Ejari registration.", "To apply for and collect the developer No Objection Certificate, attend the Dubai Land Department trustee office and sign the transfer.", "To receive the sale proceeds or rent by manager's cheque payable to the Principal only, unless the Principal authorises otherwise in writing.", "To settle service charges, DEWA and cooling accounts and obtain clearances."]),
           ("Limits", ["The Attorney may not sell below AED [000,000] or mortgage the property without the Principal's separate written consent."]),
           ("Validity", ["Valid until [Date] or completion of the transaction, whichever is earlier."])]) +
  note("DLD accepts property POAs only when notarised and, if issued outside the UAE, legalised and translated into Arabic.") +
  sig(["Principal", "Attorney"]), "power of attorney special property sale lease DLD"),
T("CG-AUTH-SIGN", "Authorised signatory letter", "Letter", "Confirms who may sign on behalf of the company and their limits.",
  letter("Letter", "[Bank / developer / authority]", "Authorised signatories of {{company.name}}", ["Dear Sir / Madam,", "We confirm that the persons below are authorised to sign on behalf of {{company.name}} within the limits shown. Specimen signatures are attached.", table(["Name", "Designation", "Passport no.", "Authority", "Limit"], [["[Name]", "Owner & Managing Director", "[No.]", "Sole", "Unlimited"], ["[Name]", "[Manager]", "[No.]", "Joint with MD", "AED [000,000]"]]), "This letter supersedes all previous signatory letters and remains valid until revoked in writing."], "[Name]<br>Owner & Managing Director"), "authorised signatory bank specimen"),
T("CG-SPECIMEN", "Specimen signature form", "Form", "Specimen signatures of authorised signatories for banks and developers.",
  head("Corporate records", "Specimen signature form") +
  table(["Name", "Designation", "Specimen signature 1", "Specimen signature 2", "Initials"], [["[Name]", "[Designation]", "", "", ""], ["[Name]", "[Designation]", "", "", ""], ["[Name]", "[Designation]", "", "", ""]]) +
  paras("Certified as true specimen signatures of the authorised signatories of {{company.name}}.") + company_sig(), "specimen signature form bank"),
T("CG-DOA", "Delegation of authority matrix", "Policy", "Who can approve what, and up to which value, across the company.",
  head("Governance", "Delegation of authority (DoA)", [("Approved by", "[Owner name]"), ("Effective", "[Date]"), ("Version", "[1.0]")]) +
  table(["Decision", "Prepare", "Review", "Approve", "Limit (AED)"], [
    ["Listing price changes", "Agent", "Operations Manager", "Operations Manager", "Any"], ["Agency fee discount", "Agent", "Operations Manager", "Owner", "> 10% of fee"],
    ["Commission payout to agents", "Accounts", "Operations Manager", "Owner", "Any"], ["Vendor payments", "Accounts", "Operations Manager", "Owner", "> 5,000"],
    ["Refunds and deposit releases", "Accounts", "Operations Manager", "Owner", "Any"], ["Hiring and termination", "HR", "Operations Manager", "Owner", "Any"],
    ["Marketing spend", "Marketing", "Operations Manager", "Owner", "> 10,000"], ["Contracts with developers", "BDM", "Operations Manager", "Owner", "Any"],
    ["Record deletion / deal withdrawal", "Staff", "Admin", "Owner", "Any"], ["Bank, licences and legal", "Admin", "Owner", "Owner", "Any"]]) +
  note("The same limits are enforced in SWK OS approvals. Amend both together."), "delegation authority DoA approvals limits"),
T("CG-ORG", "Organisation chart and reporting lines", "Document", "Company structure, departments and reporting lines.",
  head("Governance", "Organisation structure") +
  table(["Department", "Head", "Reports to", "Key responsibilities"], [
    ["Management", "Owner & Managing Director", "—", "Strategy, approvals, banking, licences"], ["Operations", "Operations Manager", "Owner", "Sales & leasing operations, compliance, team"],
    ["Off-plan sales", "[Team lead]", "Operations Manager", "Developer launches, EOIs, bookings"], ["Secondary sales", "[Team lead]", "Operations Manager", "Ready resale, Form A/F, transfers"],
    ["Leasing & property management", "[Team lead]", "Operations Manager", "Tenancies, Ejari, renewals, maintenance"], ["Business development & digital", "BDM", "Owner", "Developer relations, portals, marketing"],
    ["Human resources", "HR Executive", "Owner", "Recruitment, records, payroll, leave"], ["Office administration", "Office Admin", "Operations Manager", "Reception, documents, supplies"],
    ["Accounts", "[Accountant]", "Owner", "Invoicing, commissions, VAT"]]), "organisation chart structure departments reporting"),
T("CG-UBO", "Ultimate beneficial owner (UBO) declaration", "Form", "UBO register entry as required by Cabinet Decision No. 109 of 2023.",
  head("Regulatory register", "Declaration of ultimate beneficial owner(s)") +
  paras("{{company.name}} declares the following natural person(s) who ultimately own or control 25% or more of the company or otherwise exercise ultimate control:") +
  table(["Full name", "Nationality", "Passport / EID", "Date of birth", "Ownership %", "Basis of control", "Date became UBO"], [["[Name]", "[Nationality]", "[No.]", "[DOB]", "[%]", "[Direct shareholding]", "[Date]"]]) +
  fields([("Nominee arrangements", "[None / details]"), ("Register maintained by", "[Name, designation]")]) +
  paras("The company will update this register and notify the licensing authority within 15 days of any change.") + company_sig(), "UBO beneficial owner register declaration"),
T("CG-COI", "Conflict of interest declaration", "Form", "Annual declaration by staff of personal interests that could conflict with the company or clients.",
  head("Ethics & compliance", "Conflict of interest declaration", [("Employee", "[Name]"), ("Designation", "[Designation]"), ("Period", "[Year]")]) +
  table(["Question", "Yes / No", "Details"], [["Do you or a relative own property you may market or lease through the company?", "", ""], ["Do you hold an interest in a developer, contractor or supplier we deal with?", "", ""], ["Do you receive any payment, gift or benefit from a counterparty?", "", ""], ["Do you act for a client in a personal capacity outside the company?", "", ""], ["Any other potential conflict?", "", ""]]) +
  paras("I confirm the information is complete and I will declare any new conflict immediately in writing.") + sig(["Employee", "Operations Manager"]), "conflict of interest declaration ethics"),
]
