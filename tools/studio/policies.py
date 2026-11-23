from lib import *

def P(code, title, purpose, scope, statements, owner="Operations Manager", law=None, tags=""):
    body = head("Company policy", title, [("Policy owner", owner), ("Approved by", "Owner & Managing Director"), ("Effective date", "[Date]"), ("Version", "[1.0]"), ("Next review", "[Date]")])
    secs = [("Purpose", [purpose]), ("Scope", [scope])]
    if law: secs.append(("Legal basis", [law]))
    secs.append(("Policy", statements))
    secs += [("Responsibilities", ["All staff must read, acknowledge and follow this policy.", f"The {owner} maintains this policy, trains staff and monitors compliance.", "Managers must report breaches immediately to the Owner."]),
             ("Breaches", ["Breach of this policy may lead to disciplinary action up to termination of employment, and may be reported to the authorities where the law requires."]),
             ("Review", ["This policy is reviewed at least once a year and whenever the law or the business changes."])]
    body += clauses(secs) + sig(["Policy owner", "Owner & Managing Director"], "Approval")
    return dict(code=code, title=title, category="Policies", kind="Policy", orientation="Portrait", letterhead=True, description=purpose, tags=tags, html=body)

DOCS = [
P("PL-CODE", "Code of conduct and professional ethics", "Set the standard of honest, fair and professional behaviour expected from everyone at SWK Properties.", "All employees, agents, consultants and interns.", [
  "Act honestly and in the client's best interest; never misrepresent a property, price, size, view, service charge or permit status.", "Advertise only listings with a valid Trakheesi permit and an active listing agreement (Form A / Form B).",
  "Disclose all fees in writing before an agreement is signed; never charge undisclosed commissions or accept secret payments.", "Treat clients, colleagues and counterparties with respect; harassment and discrimination of any kind are prohibited.",
  "Protect confidential and personal data and use it only for the purpose it was given.", "Carry a valid RERA broker card at all times and follow the RERA Code of Ethics for real estate brokers."], tags="code conduct ethics RERA"),
P("PL-ABC", "Anti-bribery and corruption policy", "Prevent bribery, kickbacks and improper payments in all dealings.", "All staff and anyone acting for the company.", [
  "No one may offer, give, request or accept any bribe, facilitation payment or improper advantage, directly or through others.", "Gifts and hospitality above AED [500] in value must be approved in advance by the Operations Manager and recorded in the gifts register.",
  "Referral fees and agent splits are paid only under a written agreement and through the company's bank account.", "Cash payments to or from staff in connection with a transaction are prohibited."], law="UAE Federal Decree-Law No. 31 of 2021 (Penal Code) on bribery offences.", tags="bribery corruption gifts"),
P("PL-PDPL", "Data protection and privacy policy", "Protect personal data of clients, owners, tenants and staff.", "All personal data processed by the company in any form.", [
  "Collect only the personal data needed for a defined purpose and tell the person why it is collected.", "Obtain consent before sending marketing messages; record opt-outs and honour them immediately.",
  "Store passports, Emirates IDs and KYC documents only in SWK OS; do not keep copies on personal phones, chats or e-mail.", "Share personal data with developers, banks or authorities only as needed for the transaction or as required by law.",
  "Report any suspected data breach to the Admin within 24 hours.", "Keep records only as long as the retention policy allows, then delete them securely."], owner="Admin", law="UAE Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data.", tags="privacy PDPL data protection consent"),
P("PL-INFOSEC", "Information security and acceptable use policy", "Keep company systems, accounts and devices secure.", "All users of SWK OS, e-mail, phones, laptops and networks.", [
  "Use a unique password of at least 10 characters for SWK OS and turn on two-step verification where available.", "Never share log-ins; each person is accountable for actions under their own account.",
  "Lock screens when away; report lost devices immediately so sessions can be signed out.", "Do not install unapproved software or connect unknown USB devices.",
  "Do not forward company data to personal e-mail or messaging accounts.", "Access is granted strictly by role; requesting or using access beyond your role is a disciplinary offence."], owner="Admin", tags="security passwords acceptable use"),
P("PL-WHISTLE", "Whistleblowing policy", "Give staff a safe way to report wrongdoing.", "All staff, agents and suppliers.", [
  "Report suspected fraud, bribery, money laundering, harassment or breach of law directly to the Owner by e-mail or in person.", "Reports may be anonymous. The identity of a whistleblower is kept confidential.",
  "No one will be dismissed, demoted or treated unfairly for raising a concern in good faith.", "Every report is acknowledged within 5 working days and investigated."], owner="Owner & Managing Director", tags="whistleblowing report concern"),
P("PL-AML", "Anti-money laundering and counter-terrorist financing policy", "Prevent the company from being used for money laundering, terrorist financing or sanctions evasion.", "All sale and purchase transactions and all staff involved in them.", [
  "Identify and verify every buyer and seller (individuals and companies, including UBOs) before the transaction proceeds.", "Apply enhanced due diligence to politically exposed persons, high-risk countries, cash or virtual-asset payments and complex ownership structures.",
  "Screen all parties against UAE and UN sanctions lists before contracting and on any change.", "Report cash transactions of AED 55,000 or more, and suspicious transactions, through goAML without tipping off the client.",
  "Keep KYC and transaction records for at least 5 years after the business relationship ends.", "Train all relevant staff at least once a year."], owner="Compliance Officer (Owner)", law="Federal Decree-Law No. 20 of 2018 on AML/CFT and its implementing regulations, as amended; Ministry of Economy guidance for real estate brokers.", tags="AML CFT KYC goAML sanctions"),
P("PL-RETENTION", "Record retention policy", "Keep records as long as the law and business need, and no longer.", "All paper and electronic records.", [
  "Transaction files, KYC and AML records: 5 years after the transaction or end of relationship.", "Accounting records and tax invoices: at least 5 years (7 years recommended) from the end of the tax period.",
  "Employee files: the duration of employment plus 5 years.", "Tenancy files: the tenancy term plus 5 years.", "At the end of retention, records are destroyed securely and the destruction is logged."], owner="Admin", tags="retention records archive"),
P("PL-COMPLAINT", "Complaints handling policy", "Resolve client complaints fairly and quickly.", "Complaints from clients, owners, tenants and the public.", [
  "Log every complaint in SWK OS with a reference number on the day it is received.", "Acknowledge within 1 working day and give a full response within 10 working days.",
  "Escalate complaints about fees, misrepresentation or staff conduct to the Operations Manager.", "Inform the complainant of the right to approach RERA if not satisfied."], tags="complaints client service"),
P("PL-ADVERT", "Advertising and marketing compliance policy", "Ensure every advertisement is lawful, accurate and permitted.", "All listings, social media posts, portals, brochures and campaigns.", [
  "Advertise a property only after a signed listing agreement and a valid Trakheesi permit; show the permit number and QR code where required.", "Prices, sizes and features must match the title deed and the owner's instructions.",
  "Off-plan projects may be advertised only when registered with RERA and approved by the developer.", "Use renders only when clearly labelled as artist impressions.", "Remove expired or sold listings within 24 hours."], tags="advertising Trakheesi permit portals marketing"),
P("PL-BCP", "Business continuity policy", "Keep critical services running during disruption.", "Office, systems, staff and key suppliers.", [
  "SWK OS data is backed up automatically every day; backups are tested every quarter.", "If the office is unavailable, staff work remotely through SWK OS and Inside messenger.",
  "The Owner and Operations Manager hold the emergency contact list for staff, landlords and key developers.", "After any incident, a short review is written and actions are tracked to closure."], owner="Admin", tags="business continuity backup disaster"),
P("PL-SOCIAL", "Social media policy", "Protect the brand and clients on social media.", "Company and personal accounts when they refer to SWK Properties.", [
  "Only approved staff may post on company accounts.", "Personal posts about listings must follow the advertising policy and show the permit number.", "Never share client details, documents or private conversations.", "Report negative or false posts to the Operations Manager rather than replying."], tags="social media brand"),
P("PL-HSE", "Health, safety and site visit policy", "Keep staff and clients safe in the office and on site visits.", "Office, viewings, inspections and handovers.", [
  "Share viewing details (address, client, time) in SWK OS before leaving the office.", "Do not enter construction sites without the developer's permission and safety equipment.", "Report accidents and near misses on the same day.", "Follow building rules and fire evacuation procedures."], tags="health safety site visit"),
]
