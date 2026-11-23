from lib import *

def H(code, title, kind, desc, html, tags=""):
    return dict(code=code, title=title, category="HR & Administration", kind=kind, orientation="Portrait", letterhead=True, description=desc, tags=tags, html=html)

EMP = fields([("Employee name", "[Employee name]"), ("Employee no.", "[EMP-000]"), ("Designation", "[Designation]"), ("Department", "[Department]"), ("Date of joining", "[Date]"), ("Passport / EID", "[No.]")], "Employee")

DOCS = [
H("HR-01", "Offer of employment", "Letter", "Conditional offer of employment with package summary.",
  letter("Offer", "[Candidate name]<br>[Address / e-mail]", "Offer of employment – [Designation]", [
    "Dear [Candidate name],", "We are pleased to offer you the position of <b>[Designation]</b> with {{company.name}}, subject to the conditions below.",
    table(["Item", "Details"], [["Start date", "[Date]"], ["Contract type", "[Unlimited / Limited]"], ["Probation", "[6] months"], ["Basic salary", "AED [0,000] per month"], ["Allowances", "Housing AED [0,000] · Transport AED [000] · [Other]"], ["Commission", "As per the commission plan annex"], ["Working hours", "{{company.hours}}"], ["Annual leave", "30 calendar days after one year of service"], ["Visa & medical insurance", "Provided by the company"]]),
    "This offer is conditional on satisfactory references, a valid RERA broker certification where applicable, medical fitness and issue of the UAE residence and work permit.", "Please sign and return a copy of this letter by <b>[Date]</b> to confirm your acceptance."], "[Name]<br>HR Executive") +
  sig(["Accepted by the candidate"], "Acceptance"), "offer employment job candidate"),
H("HR-CONTRACT", "Employment contract", "Contract", "Employment contract aligned to UAE Federal Decree-Law No. 33 of 2021. The MOHRE contract remains the official version.",
  head("Employment", "Employment contract", [("Employer", "{{company.name}}"), ("Employee", "[Employee name]"), ("Contract date", "{{today}}")]) +
  party_block("Employee") +
  clauses([
    ("Position and duties", ["The Employee is employed as [Designation] and shall perform the duties in the job description and any reasonable duties assigned by management.", "The Employee shall comply with company policies, the RERA Code of Ethics and all applicable laws."]),
    ("Term and probation", ["This contract is [unlimited / limited to [period]] commencing on [Date].", "The first [6] months are probation. Either party may end the contract during probation with the notice required by law."]),
    ("Remuneration", ["Basic salary AED [0,000] per month and allowances of AED [0,000], paid monthly through the Wage Protection System.", "Commission, if any, is governed by the commission plan annex in force from time to time."]),
    ("Working hours and leave", ["Normal working hours are [48] per week. Overtime is compensated as required by law.", "Annual leave, sick leave, public holidays and other leave are granted in accordance with the law and company policy."]),
    ("Confidentiality and data", ["The Employee shall keep confidential all client, owner, pricing and company information during and after employment and shall comply with the data protection policy."]),
    ("Non-solicitation", ["For [12] months after employment ends, the Employee shall not solicit the company's clients, landlords or staff with whom the Employee dealt, to the extent permitted by law."]),
    ("Termination and end of service", ["Either party may terminate with [30] days' written notice. End-of-service gratuity is paid in accordance with the law."]),
    ("Governing law", ["This contract is governed by UAE Federal Decree-Law No. 33 of 2021 and its executive regulations. In case of conflict, the MOHRE-registered contract prevails."])]) +
  sig(["For the Employer", "Employee"]), "employment contract MOHRE labour law"),
H("HR-JD", "Job description", "Document", "Role purpose, duties, KPIs and requirements.",
  head("Human resources", "Job description – [Designation]", [("Department", "[Department]"), ("Reports to", "[Manager]"), ("Grade", "[Grade]")]) +
  fields([("Role purpose", "[One-sentence purpose of the role]")]) +
  bullets(["[Key responsibility]", "[Key responsibility]", "[Key responsibility]", "Maintain accurate records in SWK OS for every lead, viewing and deal.", "Follow company policies, RERA rules and AML procedures."], "Key responsibilities") +
  table(["KPI", "Target"], [["[Leads handled]", "[Target]"], ["[Viewings]", "[Target]"], ["[Deals closed]", "[Target]"]], "Performance indicators") +
  bullets(["[Education]", "[Experience]", "RERA broker certification (for brokerage roles)", "UAE driving licence [if required]", "English; Arabic or other languages an advantage"], "Requirements"), "job description role KPI"),
H("HR-02", "Certificate of employment", "Certificate", "Confirms employment for the employee's requested purpose.",
  head("To whom it may concern", "Certificate of employment", [("Reference", "[Reference no.]"), ("Date", "{{today}}")]) +
  paras("This is to certify that <b>[Employee name]</b>, holder of passport no. <b>[Passport no.]</b>, nationality <b>[Nationality]</b>, has been employed with {{company.name}} since <b>[Date]</b> and currently holds the position of <b>[Designation]</b>.",
        "This certificate is issued at the employee's request for <b>[purpose]</b> without any liability on the part of the company.") + company_sig(), "employment certificate to whom it may concern"),
H("HR-SAL-CERT", "Salary certificate", "Certificate", "Salary certificate addressed to a bank or authority.",
  letter("Certificate", "[Bank / authority name]", "Salary certificate – [Employee name]", ["Dear Sir / Madam,", "We certify that <b>[Employee name]</b> (passport no. [Passport no.]) is employed with {{company.name}} as <b>[Designation]</b> since <b>[Date]</b> and receives a monthly salary as follows:",
    table(["Component", "AED per month"], [["Basic salary", "[0,000]"], ["Housing allowance", "[0,000]"], ["Transport allowance", "[000]"], ["Other allowances", "[000]"], ["<b>Total</b>", "<b>[0,000]</b>"]]), "This certificate is issued at the employee's request and implies no guarantee or liability on the part of the company."], "[Name]<br>HR Executive"), "salary certificate bank loan"),
H("HR-SAL-TRANSFER", "Salary transfer letter", "Letter", "Undertaking to transfer the employee's salary to a named bank.",
  letter("Letter", "[Bank name]<br>[Branch]", "Salary transfer – [Employee name]", ["Dear Sir / Madam,", "At the request of our employee <b>[Employee name]</b> (passport no. [No.], employee no. [No.]), we confirm that we will transfer the monthly salary of AED <b>[0,000]</b> to account <b>[IBAN]</b> held with you, and that we will not change the salary transfer without the bank's written clearance.", "In case of resignation or termination, we will transfer the end-of-service benefits to the same account, subject to applicable law."], "[Name]<br>Owner & Managing Director"), "salary transfer bank undertaking"),
H("HR-EXPERIENCE", "Experience certificate", "Certificate", "Issued at the end of employment.",
  head("To whom it may concern", "Experience certificate") +
  paras("This is to certify that <b>[Employee name]</b>, passport no. <b>[No.]</b>, worked with {{company.name}} from <b>[Date]</b> to <b>[Date]</b> as <b>[Designation]</b>.", "During this period [he / she / they] handled [summary of responsibilities]. We found [him / her / them] [professional, diligent and reliable].", "We wish [him / her / them] success in future endeavours.") + company_sig(), "experience certificate relieving"),
H("HR-NOC", "No objection certificate (employee)", "Certificate", "NOC for travel, visa, driving licence or other purposes.",
  letter("NOC", "[Embassy / authority / organisation]", "No objection certificate – [Employee name]", ["Dear Sir / Madam,", "{{company.name}} has no objection to our employee <b>[Employee name]</b>, [Designation], passport no. [No.], [travelling to [country] from [date] to [date] / applying for [purpose]].", "[He / She / They] will resume duties on [Date]. This certificate is issued at the employee's request."], "[Name]<br>HR Executive"), "NOC no objection employee travel visa"),
H("HR-PROB-CONF", "Probation confirmation letter", "Letter", "Confirms successful completion of probation.",
  letter("Letter", "[Employee name]", "Confirmation of employment", ["Dear [Employee name],", "We are pleased to confirm that you have successfully completed your probation period. Your employment as [Designation] is confirmed with effect from <b>[Date]</b>.", "All other terms of your employment contract remain unchanged. Thank you for your contribution."], "[Name]<br>Operations Manager"), "probation confirmation"),
H("HR-INCREMENT", "Salary increment / promotion letter", "Letter", "Notifies an increment or promotion.",
  letter("Letter", "[Employee name]", "Revision of salary and position", ["Dear [Employee name],", "In recognition of your performance, we are pleased to inform you of the following changes effective <b>[Date]</b>:", table(["Item", "Current", "Revised"], [["Designation", "[Current]", "[Revised]"], ["Basic salary (AED)", "[0,000]", "[0,000]"], ["Allowances (AED)", "[0,000]", "[0,000]"]]), "All other terms remain unchanged. We look forward to your continued success."], "[Name]<br>Owner & Managing Director"), "increment promotion salary revision"),
H("HR-WARN", "Warning letter", "Letter", "First or final written warning following a disciplinary meeting.",
  letter("Letter", "[Employee name]<br>[Designation]", "[First / Final] written warning", ["Dear [Employee name],", "This letter follows the meeting held on [Date] regarding <b>[describe the misconduct or performance issue, with dates]</b>.", "This conduct breaches [policy / contract clause]. You are hereby issued a <b>[first / final] written warning</b>, which will remain on your file for [12] months.", "You are expected to [describe the required improvement] by [Date]. Further breaches may result in further disciplinary action, up to termination in accordance with the law.", "You may respond in writing within 5 working days."], "[Name]<br>Operations Manager") + sig(["Received by the employee"], "Acknowledgement"), "warning disciplinary letter"),
H("HR-SHOWCAUSE", "Show-cause notice", "Letter", "Asks the employee to explain an incident before any decision.",
  letter("Notice", "[Employee name]", "Show-cause notice", ["Dear [Employee name],", "It has been reported that on [Date] you [describe the alleged act].", "Please explain in writing, within <b>[3] working days</b>, why disciplinary action should not be taken. Failure to respond will lead to a decision on the information available.", "This notice is issued to give you a fair opportunity to be heard and is not a finding of misconduct."], "[Name]<br>HR Executive"), "show cause notice disciplinary"),
H("HR-TERM", "Termination letter", "Letter", "Termination with notice and end-of-service summary.",
  letter("Letter", "[Employee name]", "Termination of employment", ["Dear [Employee name],", "We regret to inform you that your employment with {{company.name}} will end on <b>[Date]</b> [after the notice period of [30] days / for the reasons set out below].", "[Reason, where applicable.]", "Your final settlement, including salary to the last working day, accrued leave and end-of-service gratuity, will be paid in accordance with the law within 14 days of your last day. Please return all company property and complete the exit clearance form.", "We thank you for your service."], "[Name]<br>Owner & Managing Director") + sig(["Received by the employee"], "Acknowledgement"), "termination dismissal end of service"),
H("HR-RESIGN-ACC", "Resignation acceptance letter", "Letter", "Accepts an employee's resignation.",
  letter("Letter", "[Employee name]", "Acceptance of resignation", ["Dear [Employee name],", "We acknowledge your resignation letter dated [Date]. Your resignation is accepted and your last working day will be <b>[Date]</b>.", "Please hand over your responsibilities to [Name], return company property and complete the exit clearance. Your final settlement will be processed in accordance with the law."], "[Name]<br>HR Executive"), "resignation acceptance"),
H("HR-EOS", "End-of-service settlement", "Form", "Final settlement calculation: salary, leave encashment and gratuity.",
  head("Human resources", "Final settlement statement") + EMP +
  fields([("Last working day", "[Date]"), ("Reason for leaving", "[Resignation / Termination / End of contract]"), ("Total service", "[0] years [0] months [0] days"), ("Last basic salary", "AED [0,000]")], "Service") +
  table(["Item", "Basis", "AED"], [["Salary to last working day", "[days]", "[0,000]"], ["Accrued annual leave", "[days] × daily basic", "[0,000]"], ["End-of-service gratuity", "21 days' basic per year (first 5 years), 30 days thereafter", "[0,000]"], ["Commission due", "As per commission statement", "[0,000]"], ["Air ticket", "[If applicable]", "[000]"], ["Less: advances / deductions", "[Details]", "([000])"], ["<b>Net payable</b>", "", "<b>[0,000]</b>"]], "Settlement") +
  paras("I confirm receipt of the above amount in full and final settlement of all my dues from {{company.name}}.") + sig(["Employee", "HR Executive", "Owner & Managing Director"]), "end of service gratuity final settlement"),
H("HR-LEAVE", "Leave application form", "Form", "Application for annual, sick or other leave.",
  head("Human resources", "Leave application") + EMP +
  fields([("Leave type", "[Annual / Sick / Compassionate / Maternity / Paternity / Unpaid / Hajj]"), ("From", "[Date]"), ("To", "[Date]"), ("Working days", "[0]"), ("Balance before leave", "[0] days"), ("Contact during leave", "[Phone]"), ("Duties handed over to", "[Name]"), ("Reason / notes", "[Notes]")], "Leave requested") +
  sig(["Employee", "Line manager", "HR Executive"], "Approval"), "leave application annual sick"),
H("HR-APPRAISAL", "Performance appraisal form", "Form", "Annual or probation performance review.",
  head("Human resources", "Performance appraisal", [("Review period", "[From] – [To]"), ("Reviewer", "[Name]")]) + EMP +
  table(["Competency", "Rating (1–5)", "Comments"], [["Sales / service results against target", "", ""], ["Client relationship and service", "", ""], ["Market and product knowledge", "", ""], ["Compliance (RERA, AML, data)", "", ""], ["Teamwork and communication", "", ""], ["Use of SWK OS and record keeping", "", ""], ["Punctuality and attendance", "", ""]], "Ratings") +
  fields([("Overall rating", "[0] / 5"), ("Strengths", "[Text]"), ("Areas to improve", "[Text]"), ("Goals for next period", "[Text]"), ("Training needs", "[Text]")], "Summary") +
  sig(["Employee", "Reviewer", "Owner & Managing Director"]), "performance appraisal review"),
H("HR-ASSET", "Company asset handover form", "Form", "Records laptops, phones, keys and cards issued to an employee.",
  head("Administration", "Company asset handover") + EMP +
  table(["Asset", "Make / model", "Serial / ID", "Condition", "Issued on", "Returned on"], [["Laptop", "[Model]", "[S/N]", "[Good]", "[Date]", ""], ["Mobile phone & SIM", "[Model]", "[IMEI / no.]", "[Good]", "[Date]", ""], ["Access card / keys", "", "[ID]", "", "[Date]", ""], ["Company vehicle", "[Model]", "[Plate]", "", "[Date]", ""]]) +
  paras("I acknowledge receipt of the above assets, will use them for company business only and will return them in good condition on request or when my employment ends.") + sig(["Employee", "Office Admin"]), "asset handover laptop phone keys"),
H("HR-EXIT", "Exit clearance form", "Form", "Department sign-offs before final settlement.",
  head("Human resources", "Exit clearance") + EMP +
  table(["Department", "Item", "Cleared", "Signature"], [["Operations", "Leads, deals and client files handed over in SWK OS", "☐", ""], ["Accounts", "Advances, petty cash and commissions reconciled", "☐", ""], ["Administration", "Assets, keys and access card returned", "☐", ""], ["IT / Admin", "SWK OS, e-mail and portal accounts disabled", "☐", ""], ["Compliance", "RERA broker card cancellation requested", "☐", ""], ["HR", "Visa cancellation and final settlement", "☐", ""]]) + sig(["HR Executive", "Owner & Managing Director"]), "exit clearance offboarding"),
H("HR-NDA", "Confidentiality and non-solicitation agreement", "Contract", "Employee confidentiality, data and non-solicitation undertaking.",
  head("Employment", "Confidentiality and non-solicitation agreement", [("Employee", "[Employee name]"), ("Date", "{{today}}")]) +
  clauses([("Confidential information", ["Confidential information includes client and owner details, listings not yet public, prices, commissions, developer allocations, marketing plans, SWK OS data and any information marked or reasonably understood as confidential."]),
           ("Obligations", ["The Employee shall use confidential information only for company business, shall not copy or remove it from SWK OS, and shall not disclose it to anyone outside the company without written approval.", "These obligations continue after employment ends."]),
           ("Return of information", ["On request or when employment ends, the Employee shall return or delete all company information and confirm this in writing."]),
           ("Non-solicitation", ["For [12] months after employment ends, the Employee shall not, directly or indirectly, solicit any client, landlord or employee of the company with whom the Employee dealt in the last [12] months of employment."]),
           ("Remedies", ["A breach entitles the company to seek injunctive relief and damages in addition to any other remedy."])]) +
  sig(["For the Company", "Employee"]), "confidentiality NDA employee non-solicitation"),
H("HR-03", "Commission plan annex", "Contract", "Annex to the employment contract setting the commission structure.",
  head("Employment annex", "Commission plan", [("Employee", "[Employee name]"), ("Effective", "[Date]")]) +
  table(["Deal type", "Company share", "Agent share", "Payable when"], [["Off-plan sale", "[50]%", "[50]%", "Developer commission received"], ["Secondary sale", "[50]%", "[50]%", "Transfer completed and commission received"], ["Leasing", "[50]%", "[50]%", "Ejari registered and fee received"], ["Referral to colleague", "—", "[10]% of agent share", "As above"]]) +
  clauses([("Conditions", ["Commission is earned only on fees actually received by the company, net of VAT, third-party splits and refunds.", "If a fee is refunded or clawed back, the related commission is deducted from future payments.", "Deals must be recorded in SWK OS with complete KYC to qualify."])]) +
  sig(["For the Company", "Employee"]), "commission plan annex split"),
H("HR-MEMO", "Internal memo / circular", "Document", "Company-wide memo or circular to staff.",
  head("Internal memo", "[Subject]", [("To", "[All staff / Department]"), ("From", "[Name, designation]"), ("Date", "{{today}}"), ("Reference", "[MEMO-000]")]) +
  paras("[Body of the memo: what is changing, from when, and what staff must do.]", "Questions may be directed to [Name].") + paras("<b>[Name]</b><br>[Designation]"), "memo circular announcement internal"),
]
