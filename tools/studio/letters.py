from lib import *

def G(code, title, desc, html, tags="", kind="Letter"):
    return dict(code=code, title=title, category="Letters & Notices", kind=kind, orientation="Portrait", letterhead=True, description=desc, tags=tags, html=html)

DOCS = [
G("LT-TWIMC", "To whom it may concern letter", "General certificate or confirmation letter.",
  head("To whom it may concern", "[Subject]") + paras("This is to certify / confirm that [statement].", "This letter is issued at the request of [Name] for [purpose] without any liability on the part of the company.") + company_sig(), "to whom it may concern certificate"),
G("LT-AUTH", "Authorisation letter", "Authorises a named person to act or collect on the company's behalf.",
  letter("Letter", "[Authority / organisation]", "Authorisation – [purpose]", ["Dear Sir / Madam,", "We authorise <b>[Name]</b>, holder of passport / Emirates ID no. <b>[No.]</b>, to [collect / submit / sign] [documents or items] on behalf of {{company.name}} on [Date].", "Please extend your cooperation."], "[Name]<br>Owner & Managing Director"), "authorisation letter collect submit"),
G("LT-DEV-REG", "Broker registration request to developer", "Introduction and request for broker registration with a developer.",
  letter("Letter", "[Developer name]<br>Broker Relations", "Broker registration – {{company.name}} (ORN 51517)", ["Dear Sir / Madam,", "{{company.name}}, a RERA-registered brokerage (ORN 51517) based on Sheikh Zayed Road, requests registration as an authorised sales partner for your projects.", "We serve local and international investors, with a team specialised in off-plan launches and a strong digital presence at {{company.website}}.", "Attached: trade licence, ORN certificate, VAT certificate, bank letter and broker cards. Our contact for allocations is [Name, mobile, e-mail]."], "[Name]<br>Business Development Manager"), "developer registration broker partner"),
G("LT-THANKS", "Thank-you letter after completion", "Client thank-you after closing a deal.",
  letter("Letter", "[Client name]", "Thank you for choosing SWK Properties", ["Dear [Client name],", "Congratulations on [purchasing / leasing / selling] [property]. Thank you for trusting {{company.name}} with this important step.", "We remain at your service for property management, resale or future investments. A short review of your experience would mean a lot to our team."], "[Agent name]<br>Property Consultant"), "thank you client closing"),
G("LT-COMPLAINT-RESP", "Complaint response letter", "Formal response to a client complaint.",
  letter("Letter", "[Client name]", "Your complaint ref. [CMP-000]", ["Dear [Client name],", "Thank you for raising your concern on [Date] regarding [subject]. We have reviewed the matter with the team involved.", "[Findings and explanation.]", "[Action taken / remedy offered.]", "If you are not satisfied with this response, you may contact the Real Estate Regulatory Agency (RERA)."], "[Name]<br>Operations Manager"), "complaint response client"),
G("LT-DEMAND", "Letter of demand", "Formal demand before legal action.",
  letter("Letter", "[Recipient]", "Demand for payment / performance", ["Dear [Recipient],", "Despite our previous reminders dated [Dates], [amount of AED [0,000] / the obligation to ...] under [agreement] dated [Date] remains outstanding.", "We demand that you [pay / perform] within <b>[7] days</b> of this letter. Otherwise we will take legal action without further notice, at your cost."], "[Name]<br>Owner & Managing Director") + note("Have a lawyer review demand letters before sending where the amount or risk is significant."), "demand letter legal notice"),
G("LT-APPOINT", "Appointment confirmation", "Confirms a meeting, viewing or signing appointment.",
  letter("Letter", "[Client name]", "Appointment confirmation – [purpose]", ["Dear [Client name],", "We confirm your appointment for <b>[purpose]</b> on <b>[Date]</b> at <b>[Time]</b> at [location].", "Please bring [original passport / Emirates ID / cheques / documents]. Contact [Agent name] on [mobile] if you need to reschedule."], "[Agent name]<br>Property Consultant"), "appointment confirmation meeting"),
G("LT-MEETING", "Meeting invitation", "Invitation to a client or partner meeting.",
  letter("Letter", "[Invitee]", "Invitation – [meeting]", ["Dear [Invitee],", "We are pleased to invite you to [meeting / launch / presentation] on <b>[Date]</b> at <b>[Time]</b> at {{company.address}}.", "Agenda: [summary]. Kindly confirm attendance by [Date]."], "[Name]<br>[Designation]"), "meeting invitation event"),
]
