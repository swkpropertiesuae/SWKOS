from lib import *

def F(code, title, kind, desc, html, tags="", cat="Finance & Procurement"):
    return dict(code=code, title=title, category=cat, kind=kind, orientation="Portrait", letterhead=True, description=desc, tags=tags, html=html)

AMOUNT = lambda: fields([("Amount", "AED [0,000.00]"), ("Amount in words", "[UAE Dirhams ... only]"), ("Payment method", "[Bank transfer / Cheque no. [000000] / Card]"), ("Bank / cheque date", "[Bank] · [Date]")])

DOCS = [
F("FN-01", "Statement of account", "Letter", "Client statement of account cover letter with open items.",
  letter("Statement", "[Client name]<br>[Address]", "Statement of account as at {{today}}", ["Dear [Client name],", "Please find below your statement of account with {{company.name}}.", table(["Date", "Document", "Description", "Debit (AED)", "Credit (AED)", "Balance (AED)"], [["[Date]", "[INV-0000]", "[Description]", "[0,000.00]", "", "[0,000.00]"], ["[Date]", "[RCT-0000]", "Payment received", "", "[0,000.00]", "[0.00]"]]), "Kindly settle the outstanding balance of <b>AED [0,000.00]</b> by [Date]. If you have already paid, please disregard this notice and share the remittance advice."], "[Name]<br>Accounts"), "statement account client balance"),
F("FN-02", "Friendly reminder – invoice due", "Letter", "Courteous reminder before the due date.",
  letter("Reminder", "[Client name]", "Invoice due on [Date]", ["Dear [Client name],", "This is a friendly reminder that invoice <b>[Invoice no.]</b> for <b>AED [0,000.00]</b> falls due on <b>[Date]</b>.", "Payment can be made by bank transfer to {{company.name}}, IBAN [AE00 0000 0000 0000 0000 000], quoting the invoice number. Thank you for your business."], "[Name]<br>Accounts"), "reminder invoice due"),
F("FN-03", "Overdue invoice – please arrange payment", "Letter", "Firm reminder for an overdue invoice.",
  letter("Overdue notice", "[Client name]", "Overdue invoice [INV-0000]", ["Dear [Client name],", "Our records show that invoice <b>[INV-0000]</b> dated [Date] for <b>AED [0,000.00]</b> remains unpaid [00] days after its due date.", "Please arrange payment within <b>7 days</b> of this letter. If there is a query on the invoice, contact us immediately so we can resolve it.", "If payment is not received, we may suspend services and take further steps to recover the amount."], "[Name]<br>Accounts"), "overdue invoice collection"),
F("FN-04", "Payment receipt cover", "Letter", "Cover letter sent with an official receipt.",
  letter("Receipt", "[Client name]", "Receipt of payment – [RCT-0000]", ["Dear [Client name],", "Thank you for your payment of <b>AED [0,000.00]</b> received on [Date] against [invoice / booking / agreement]. The official receipt [RCT-0000] is attached.", "We appreciate your prompt payment."], "[Name]<br>Accounts"), "receipt payment cover"),
F("FN-RV", "Receipt voucher", "Form", "Official receipt for money received (cheque, transfer or cash).",
  head("Accounts", "Receipt voucher", [("Receipt no.", "[RV-0000]"), ("Date", "{{today}}")]) +
  fields([("Received from", "[Payer name]"), ("Against", "[Agency fee / Security deposit / Booking amount / Other]"), ("Property / deal", "[Reference]")]) + AMOUNT() +
  note("Cash of AED 55,000 or more in a real estate transaction must be reported through goAML.") + sig(["Received by (Accounts)", "Payer"]), "receipt voucher RV cash cheque"),
F("FN-PV", "Payment voucher", "Form", "Authorises an outgoing payment.",
  head("Accounts", "Payment voucher", [("Voucher no.", "[PV-0000]"), ("Date", "{{today}}")]) +
  fields([("Pay to", "[Payee]"), ("Purpose", "[Commission / Vendor invoice / Refund / Other]"), ("Supporting documents", "[Invoice no., agreement, approval]"), ("Cost centre", "[Department]")]) + AMOUNT() +
  sig(["Prepared by", "Reviewed by (Operations Manager)", "Approved by (Owner)", "Received by"]), "payment voucher PV"),
F("FN-PETTY", "Petty cash voucher", "Form", "Small cash expense record.",
  head("Accounts", "Petty cash voucher", [("Voucher no.", "[PC-0000]"), ("Date", "{{today}}")]) +
  table(["Date", "Description", "Receipt attached", "AED"], [["[Date]", "[Description]", "☐", "[00.00]"], ["", "", "☐", ""], ["", "<b>Total</b>", "", "<b>[00.00]</b>"]]) + sig(["Claimed by", "Approved by"]), "petty cash"),
F("FN-EXPENSE", "Expense claim form", "Form", "Employee claim for business expenses.",
  head("Accounts", "Expense claim", [("Employee", "[Name]"), ("Period", "[Month]")]) +
  table(["Date", "Category", "Description / client", "Receipt", "AED"], [["[Date]", "[Fuel / Parking / Client meeting / Printing]", "[Details]", "☐", "[00.00]"], ["", "", "", "☐", ""], ["", "", "<b>Total claimed</b>", "", "<b>[00.00]</b>"]]) +
  paras("I confirm these expenses were incurred wholly for company business.") + sig(["Employee", "Line manager", "Accounts"]), "expense claim reimbursement"),
F("FN-PR", "Purchase requisition", "Form", "Internal request to buy goods or services.",
  head("Procurement", "Purchase requisition", [("Request no.", "[PR-0000]"), ("Requested by", "[Name]"), ("Date", "{{today}}")]) +
  table(["Item / service", "Qty", "Est. unit price (AED)", "Total (AED)", "Preferred supplier"], [["[Item]", "[1]", "[0.00]", "[0.00]", "[Supplier]"]]) +
  fields([("Business reason", "[Why it is needed]"), ("Budget line", "[Budget]"), ("Required by", "[Date]")]) + sig(["Requested by", "Approved by"]), "purchase requisition procurement"),
F("FN-PO-TERMS", "Purchase order terms and conditions", "Contract", "Standard terms attached to company purchase orders.",
  head("Procurement", "Purchase order – terms and conditions") +
  clauses([("Acceptance", ["Delivery of goods or services against this purchase order constitutes acceptance of these terms."]), ("Price and VAT", ["Prices are fixed in AED and exclusive of VAT unless stated. Tax invoices must show the supplier's TRN and the purchase order number."]), ("Delivery", ["Goods are delivered to {{company.address}} on the agreed date. Risk passes on acceptance."]), ("Payment", ["Payment within [30] days of receipt of a correct tax invoice."]), ("Warranty", ["The supplier warrants that goods and services are fit for purpose and free from defects for [12] months."]), ("Confidentiality", ["The supplier keeps company and client information confidential and complies with the data protection policy."]), ("Law", ["These terms are governed by the laws of Dubai and the UAE."])]), "purchase order terms supplier"),
F("FN-VENDOR", "Supplier registration form", "Form", "Collects supplier details, bank and tax information.",
  head("Procurement", "Supplier registration") + party_block("Supplier", "co") +
  fields([("TRN", "[TRN]"), ("Bank name", "[Bank]"), ("Account name", "[Name]"), ("IBAN", "[AE00 ...]"), ("Payment terms", "[30 days]"), ("Goods / services supplied", "[Description]")], "Tax and banking") +
  checklist(["Trade licence copy", "VAT certificate", "Bank letter confirming IBAN", "Owner / signatory ID"], "Documents attached") + sig(["Supplier – authorised signatory", "For {{company.name}}"]), "supplier vendor registration"),
F("FN-COMM-INV-LTR", "Commission claim letter to developer", "Letter", "Claims brokerage commission from a developer after a booking.",
  letter("Letter", "[Developer name]<br>Sales & Broker Relations", "Commission claim – [Project], unit [Unit]", ["Dear Sir / Madam,", "We refer to the sale of unit <b>[Unit]</b> in <b>[Project]</b> to <b>[Buyer name]</b>, booked on [Date] under {{company.name}} (RERA ORN {{company.orn}}, DET Trade Licence {{company.trade_license}}, Developer Broker ID: [Broker ID]).", table(["Item", "Details"], [["Purchase price", "AED [0,000,000]"], ["Commission rate", "[0]%"], ["Commission", "AED [000,000]"], ["VAT 5%", "AED [00,000]"], ["Total claimed", "<b>AED [000,000]</b>"]]), "The buyer has paid [the required percentage] and the SPA has been signed. Our tax invoice [INV-0000] is attached. Kindly transfer the amount to {{company.name}}, IBAN [AE00 ...]."], "[Name]<br>Business Development Manager"), "commission claim developer off-plan"),
F("FN-BANK-INSTR", "Bank transfer instruction letter", "Letter", "Instruction to the bank to transfer funds.",
  letter("Letter", "[Bank name]<br>[Branch]", "Transfer instruction from account [Account no.]", ["Dear Sir / Madam,", "Please debit our account no. <b>[Account no.]</b> and transfer the amount below:", table(["Beneficiary", "Bank", "IBAN", "Amount (AED)", "Purpose"], [["[Name]", "[Bank]", "[AE00 ...]", "[0,000.00]", "[Purpose]"]]), "Charges to be borne by [us / beneficiary]."], "[Authorised signatory]<br>[Authorised signatory]"), "bank transfer instruction"),
F("FN-BOUNCED", "Returned cheque notice", "Letter", "Formal notice of a returned (bounced) cheque.",
  letter("Notice", "[Drawer name]", "Returned cheque no. [000000]", ["Dear [Name],", "Cheque no. <b>[000000]</b> dated [Date] drawn on [Bank] for <b>AED [0,000.00]</b> was returned unpaid on [Date] with reason: <b>[reason]</b>.", "Please replace the cheque or pay the amount by bank transfer within <b>[7] days</b>, together with bank charges of AED [000]. Failing this, we may take the legal steps available under UAE law."], "[Name]<br>Accounts"), "bounced returned cheque notice"),
F("FN-REFUND", "Refund request and approval form", "Form", "Request to refund a deposit or fee, with approvals.",
  head("Accounts", "Refund request", [("Request no.", "[RF-0000]"), ("Date", "{{today}}")]) +
  fields([("Client", "[Name]"), ("Original receipt", "[RV-0000] · [Date]"), ("Amount received", "AED [0,000.00]"), ("Refund amount", "AED [0,000.00]"), ("Reason", "[Reason]"), ("Refund to", "[Bank, IBAN / cheque in name of]")]) + sig(["Requested by", "Operations Manager", "Owner (approval)"]), "refund deposit approval"),
F("CP-01", "Advertising permit (Trakheesi) register", "Report", "Register of listing advertising permits and expiry dates.", 
  head("Compliance", "Advertising permit register", [("Period", "[Month]"), ("Maintained by", "[Name]")]) +
  table(["Listing ref.", "Property", "Permit no.", "Issued", "Expiry", "Portals", "Status"], [["[SWK-000]", "[Community, unit]", "[Permit]", "[Date]", "[Date]", "[Bayut, PF]", "[Active]"]]), "Trakheesi permit register advertising", cat="Compliance & Permits"),
F("CP-02", "Broker credentials and compliance calendar", "Form", "Tracks broker cards, licences and renewal dates.",
  head("Compliance", "Broker credentials register") +
  table(["Broker", "BRN", "Card expiry", "Certification", "AML training date", "Status"], [["[Name]", "[000000]", "[Date]", "[RERA exam passed]", "[Date]", "[Active]"]]) +
  table(["Obligation", "Frequency", "Next due", "Owner"], [["Trade licence renewal", "Annual", "[Date]", "Admin"], ["ORN / office registration", "Annual", "[Date]", "Admin"], ["VAT return", "Quarterly", "[Date]", "Accounts"], ["Corporate tax return", "Annual", "[Date]", "Accounts"], ["AML risk assessment review", "Annual", "[Date]", "Compliance Officer"], ["goAML user access review", "Annual", "[Date]", "Compliance Officer"]], "Compliance calendar"), "broker card BRN compliance calendar", cat="Compliance & Permits"),
F("CP-KYC-IND", "Customer due diligence – individual (KYC)", "Form", "KYC form for individual buyers, sellers, landlords and tenants.",
  head("AML / KYC", "Customer due diligence – individual") + party_block("Customer") +
  fields([("Occupation / employer", "[Details]"), ("Source of funds", "[Salary / Business / Sale of property / Mortgage / Other]"), ("Source of wealth", "[Details]"), ("Politically exposed person?", "[No / Yes – details]"), ("Acting on own behalf?", "[Yes / No – details of principal]"), ("Payment method", "[Bank transfer / Mortgage / Cheque / Cash / Virtual asset]")], "Profile") +
  checklist(["Passport copy (valid)", "Emirates ID / visa (if resident)", "Proof of address", "Sanctions screening result saved", "Risk rating assigned: Low / Medium / High"], "Verification") +
  paras("I declare that the information given is true and complete and that the funds used are from legitimate sources.") + sig(["Customer", "Agent", "Compliance Officer"]), "KYC due diligence individual AML", cat="Compliance & Permits"),
F("CP-KYC-CO", "Customer due diligence – company (KYB)", "Form", "KYC for company clients including UBOs.",
  head("AML / KYC", "Customer due diligence – company") + party_block("Company", "co") +
  table(["UBO name", "Nationality", "Passport / EID", "Ownership %", "PEP?"], [["[Name]", "[Nationality]", "[No.]", "[%]", "[No]"]], "Ultimate beneficial owners (25% or more)") +
  checklist(["Trade licence / certificate of incorporation", "Memorandum / articles of association", "Board resolution authorising the transaction", "Passport and EID of signatory and UBOs", "Proof of registered address", "Sanctions screening of company, UBOs and signatory"], "Documents") + sig(["Authorised signatory", "Compliance Officer"]), "KYB company KYC UBO AML", cat="Compliance & Permits"),
F("CP-SOF", "Source of funds declaration", "Form", "Client's declaration on the origin of funds for the purchase.",
  head("AML / KYC", "Source of funds and wealth declaration") +
  fields([("Client", "[Name]"), ("Transaction", "[Purchase of unit [Unit], [Project]]"), ("Purchase price", "AED [0,000,000]")]) +
  table(["Source", "Amount (AED)", "Evidence"], [["Own savings", "[0]", "[Bank statements]"], ["Sale of property", "[0]", "[Sale agreement]"], ["Mortgage", "[0]", "[Bank offer letter]"], ["Business income", "[0]", "[Accounts]"], ["Gift / family", "[0]", "[Gift letter + donor ID]"]]) +
  paras("I confirm the funds are not derived from any unlawful activity.") + sig(["Client", "Compliance Officer"]), "source of funds wealth AML declaration", cat="Compliance & Permits"),
F("CP-PEP", "Politically exposed person declaration", "Form", "Declaration and enhanced due diligence record for PEPs.",
  head("AML / KYC", "Politically exposed person (PEP) declaration") +
  table(["Question", "Answer"], [["Do you hold, or have you held in the last 12 months, a prominent public function?", "[Yes / No]"], ["Is a family member or close associate a PEP?", "[Yes / No]"], ["Position, country and dates", "[Details]"]]) +
  fields([("Enhanced due diligence performed", "[Details]"), ("Senior management approval", "[Owner name, date]")], "Compliance use") + sig(["Client", "Compliance Officer"]), "PEP politically exposed enhanced due diligence", cat="Compliance & Permits"),
F("CP-STR-INT", "Internal suspicious activity report", "Form", "Staff report to the Compliance Officer. Do not tell the client.",
  head("AML – confidential", "Internal suspicious activity report", [("Report no.", "[SAR-000]"), ("Date", "{{today}}")]) +
  fields([("Reported by", "[Name]"), ("Client / parties", "[Names]"), ("Property / transaction", "[Details]"), ("What is suspicious", "[Facts: unusual payment, inconsistent story, third-party funds, rush to complete, etc.]"), ("Documents held", "[List]")]) +
  fields([("Decision", "[File STR on goAML / No further action – reason]"), ("goAML reference", "[Reference]"), ("Decision date", "[Date]")], "Compliance Officer") +
  note("Tipping off the client is a criminal offence. Keep this form confidential.") + sig(["Reporting employee", "Compliance Officer"]), "suspicious activity STR goAML internal", cat="Compliance & Permits"),
F("CP-SANCTIONS", "Sanctions screening record", "Form", "Evidence of screening against UAE Local Terrorist List and UN lists.",
  head("AML", "Sanctions screening record") +
  table(["Name screened", "Type", "Lists checked", "Result", "Screened by", "Date"], [["[Name]", "[Buyer / Seller / UBO]", "UAE Local Terrorist List, UN Consolidated List", "[No match / Potential match]", "[Name]", "[Date]"]]) +
  note("A confirmed match requires immediate freezing and reporting to the Executive Office for Control and Non-Proliferation and through goAML."), "sanctions screening UN UAE list", cat="Compliance & Permits"),
F("CP-CONSENT", "Client consent and privacy notice", "Form", "PDPL consent for processing personal data and marketing.",
  head("Data protection", "Client consent and privacy notice") +
  paras("{{company.name}} collects your personal data (name, contact details, ID documents, property and payment details) to provide brokerage, leasing and management services, to meet legal obligations including AML checks, and, with your consent, to send you property updates.", "Your data may be shared with developers, landlords, tenants, banks, the Dubai Land Department and RERA only as needed for your transaction or as the law requires. You may ask to access, correct or delete your data, or withdraw consent, by writing to {{company.email}}.") +
  table(["Consent", "Yes", "No"], [["Processing my data for the requested service", "☐", "☐"], ["Receiving property offers by WhatsApp, e-mail and phone", "☐", "☐"]]) + sig(["Client"]), "consent privacy PDPL marketing", cat="Compliance & Permits"),
F("CP-COMPLAINT-LOG", "Complaints register", "Report", "Register of complaints and their resolution.",
  head("Client service", "Complaints register", [("Period", "[Month / quarter]")]) +
  table(["Ref.", "Date", "Complainant", "Subject", "Owner", "Response date", "Outcome"], [["[CMP-000]", "[Date]", "[Name]", "[Subject]", "[Name]", "[Date]", "[Resolved]"]]), "complaints register log", cat="Compliance & Permits"),
F("CG-01", "Sale transaction checklist", "Form", "Step-by-step checklist from listing to transfer for a secondary sale.",
  head("Transaction control", "Secondary sale – transaction checklist", [("Property", "[Community, unit]"), ("Seller / buyer", "[Names]"), ("Agent", "[Name]")]) +
  checklist(["Form A signed with seller; title deed and seller ID verified", "Trakheesi permit issued before advertising", "Form B signed with buyer", "KYC, sanctions screening and source of funds completed for both parties", "Offer accepted in writing", "Form F (MOU) signed; 10% security deposit cheque received", "Mortgage valuation and final offer (if financed)", "Developer NOC applied and issued", "Service charges and DEWA cleared", "Transfer appointment booked at the trustee office", "Manager's cheques prepared; DLD 4% fee and trustee fee paid", "Title deed issued in buyer's name", "Keys, access cards and documents handed over", "Commission invoices issued and paid"]), "sale checklist transaction transfer", cat="Control & Guidance"),
]
