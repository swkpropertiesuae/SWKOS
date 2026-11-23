from lib import *

def S(code, title, kind, desc, html, tags="", cat="Sales (Secondary)"):
    return dict(code=code, title=title, category=cat, kind=kind, orientation="Portrait", letterhead=True, description=desc, tags=tags, html=html)

PRICE = lambda: fields([("Asking / agreed price", "AED [0,000,000]"), ("Price in words", "[UAE Dirhams ... only]"), ("Payment", "[Cash / Mortgage]"), ("Mortgage on property?", "[No / Yes – bank, outstanding AED [0]]")], "Price")

DOCS = [
S("LC-01", "Seller listing agreement (Form A)", "Contract", "Agreement between the seller and the broker to market a property for sale. RERA Form A must be signed on the DLD system.",
  head("Listing agreement", "Seller listing agreement (Form A)", [("Agreement no.", "[FA-0000]"), ("Date", "{{today}}"), ("Type", "[Exclusive / Non-exclusive]")]) +
  party_block("Seller") + BROKER + PROPERTY() + PRICE() +
  clauses([("Appointment", ["The Seller appoints the Broker to market and sell the Property on [an exclusive / a non-exclusive] basis for [90] days from the date of this agreement."]),
           ("Commission", ["The Seller shall pay the Broker a commission of [2]% of the final sale price plus VAT on completion of the transfer at the Dubai Land Department."]),
           ("Seller's obligations", ["The Seller confirms that they are the registered owner, that the information given is accurate, and that there are no undisclosed mortgages, disputes or tenancies.", "The Seller shall give reasonable access for viewings and provide the documents needed for the NOC and transfer."]),
           ("Broker's obligations", ["The Broker shall obtain a Trakheesi advertising permit, market the Property accurately, qualify buyers, conduct viewings, report offers promptly and assist until the transfer is completed."]),
           ("Termination", ["Either party may terminate by written notice according to the RERA Form A terms. Commission remains payable for any sale to a buyer introduced by the Broker during the term."])]) +
  note("This document mirrors RERA Form A for internal record. The legally binding Form A must be generated and signed electronically through the Dubai REST / DLD system.") +
  sig(["Seller", "Broker – for {{company.name}}"]), "Form A listing agreement seller RERA"),
S("LC-03", "Buyer representation agreement (Form B)", "Contract", "Agreement between a buyer and the broker. RERA Form B must be signed on the DLD system.",
  head("Buyer agreement", "Buyer representation agreement (Form B)", [("Agreement no.", "[FB-0000]"), ("Date", "{{today}}")]) +
  party_block("Buyer") + BROKER +
  fields([("Property type", "[Apartment / Villa / Townhouse]"), ("Preferred communities", "[Communities]"), ("Budget", "AED [0,000,000]"), ("Bedrooms", "[0]"), ("Purchase method", "[Cash / Mortgage]")], "Requirement") +
  clauses([("Appointment", ["The Buyer appoints the Broker to identify and negotiate the purchase of a property matching the requirement for [90] days."]), ("Commission", ["The Buyer shall pay a commission of [2]% of the purchase price plus VAT on transfer, unless agreed otherwise in writing."]), ("Viewings", ["Properties shown by the Broker are recorded in the viewing log signed by the Buyer."])]) +
  note("The binding Form B is generated on the Dubai REST / DLD system.") + sig(["Buyer", "Broker – for {{company.name}}"]), "Form B buyer agreement RERA"),
S("SL-FORM-F", "Memorandum of understanding (Form F)", "Contract", "Sale and purchase MOU between buyer and seller. RERA Form F must be signed on the DLD system.",
  head("Sale and purchase", "Memorandum of understanding (Form F)", [("MOU no.", "[MOU-0000]"), ("Date", "{{today}}")]) +
  party_block("Seller") + party_block("Buyer") + PROPERTY() +
  fields([("Purchase price", "AED [0,000,000]"), ("Security deposit (10%)", "AED [000,000] by cheque no. [000000] held by [the Broker]"), ("Balance", "AED [0,000,000] at transfer"), ("Mortgage", "[Cash buyer / Mortgage of AED [0] with [Bank]]"), ("Transfer date", "On or before [Date]"), ("Vacant / tenanted", "[Vacant on transfer / Tenanted until [Date], rent AED [0]]")], "Terms") +
  clauses([("Costs", ["DLD transfer fee of 4% paid by [the Buyer]; trustee fee and NOC fee paid by [the party]; service charges up to transfer paid by the Seller."]),
           ("Default", ["If the Buyer defaults, the Seller may keep the security deposit. If the Seller defaults, the Seller shall return the deposit and pay an equal amount to the Buyer as compensation, as set out in Form F."]),
           ("Brokerage", ["Commission of [2]% plus VAT is payable to {{company.name}} by [the Buyer / Seller] on transfer."])]) +
  note("The binding Form F is created on the Dubai REST / DLD system; this copy is the internal summary.") + sig(["Seller", "Buyer", "Broker – for {{company.name}}"]), "Form F MOU sale purchase"),
S("SC-02", "Offer letter to purchase", "Letter", "Buyer's written offer submitted to the seller through the broker.",
  letter("Offer", "[Seller name]<br>c/o {{company.name}}", "Offer to purchase [Unit], [Building], [Community]", ["Dear [Seller name],", "On behalf of our client <b>[Buyer name]</b>, we submit the following offer for your property:", table(["Term", "Offer"], [["Price", "AED [0,000,000]"], ["Payment", "[Cash / Mortgage pre-approved with [Bank]]"], ["Security deposit", "10% on signing Form F"], ["Transfer", "Within [30] days"], ["Conditions", "[Vacant on transfer / furniture included / other]"]]), "This offer is valid until <b>[Date, time]</b> and is subject to signing Form F."], "[Agent name]<br>Property Consultant"), "offer purchase buyer seller"),
S("SL-COUNTER", "Counter-offer / offer response", "Letter", "Seller's acceptance or counter-offer.",
  letter("Response", "[Buyer name]<br>c/o {{company.name}}", "Response to your offer for [Unit]", ["Dear [Buyer name],", "Our client <b>[Seller name]</b> has considered your offer of AED [0,000,000] dated [Date] and [accepts it / makes the following counter-offer]:", table(["Term", "Counter-offer"], [["Price", "AED [0,000,000]"], ["Transfer", "[Date]"], ["Other", "[Terms]"]]), "This response is valid until <b>[Date, time]</b>."], "[Agent name]<br>Property Consultant"), "counter offer response seller"),
S("SL-RESERVE", "Reservation and deposit receipt", "Form", "Holds a property for a buyer against a deposit pending Form F.",
  head("Sales", "Reservation form and deposit receipt", [("Reservation no.", "[RES-0000]"), ("Date", "{{today}}")]) +
  party_block("Buyer") + PROPERTY() +
  fields([("Agreed price", "AED [0,000,000]"), ("Deposit received", "AED [00,000] by [cheque no. / transfer]"), ("Held by", "{{company.name}} in trust"), ("Reservation valid until", "[Date]")], "Reservation") +
  clauses([("Terms", ["The deposit is held in trust and will form part of the 10% security deposit when Form F is signed.", "If Form F is not signed by the validity date because of the Buyer, the deposit is [forfeited / refundable as agreed]. If the Seller withdraws, the deposit is refunded in full."])]) +
  sig(["Buyer", "For {{company.name}}"]), "reservation deposit receipt hold"),
S("SL-NOC-REQ", "Developer NOC request letter", "Letter", "Requests the developer's No Objection Certificate for transfer.",
  letter("Letter", "[Developer name]<br>Customer Relations / NOC Department", "NOC request – unit [Unit], [Project]", ["Dear Sir / Madam,", "On behalf of the owner <b>[Seller name]</b>, we request a No Objection Certificate for the transfer of unit <b>[Unit]</b> in <b>[Project]</b> to <b>[Buyer name]</b>.", "Attached: owner's passport and Emirates ID, title deed / Oqood, signed Form F, buyer's passport, and the NOC fee of AED [0,000]. Please confirm any outstanding service charges."], "[Agent name]<br>For {{company.name}}"), "NOC developer request transfer"),
S("SL-DISCLOSURE", "Seller property disclosure statement", "Form", "Seller's disclosure of known defects, disputes and charges.",
  head("Sales", "Seller disclosure statement") + PROPERTY() +
  table(["Item", "Yes / No", "Details"], [["Any known structural, water or AC defects?", "", ""], ["Any unapproved alterations?", "", ""], ["Any disputes, court cases or rental disputes?", "", ""], ["Is the property tenanted? (lease end, rent)", "", ""], ["Service charges paid to date?", "", ""], ["Mortgage outstanding?", "", ""], ["Any special assessments or fines?", "", ""]]) +
  paras("The Seller confirms the information is true to the best of their knowledge.") + sig(["Seller", "Agent"]), "disclosure seller defects"),
S("SL-CMA", "Comparative market analysis (CMA)", "Report", "Pricing report using recent DLD transactions and active listings.",
  head("Market report", "Comparative market analysis", [("Property", "[Community, building, unit]"), ("Prepared for", "[Owner name]"), ("Prepared by", "[Agent name]")]) +
  fields([("Size / bedrooms", "[0,000] sq ft · [0] BR"), ("View / floor", "[View] · [Floor]"), ("Condition", "[Original / Upgraded]")], "Subject property") +
  table(["Date", "Building / unit", "Size (sq ft)", "Price (AED)", "AED / sq ft"], [["[Date]", "[Unit]", "[0,000]", "[0,000,000]", "[0,000]"]], "Recent registered sales (DLD)") +
  table(["Listing", "Size (sq ft)", "Asking (AED)", "Days on market"], [["[Listing]", "[0,000]", "[0,000,000]", "[00]"]], "Competing listings") +
  fields([("Recommended asking price", "AED [0,000,000]"), ("Expected sale range", "AED [0,000,000] – [0,000,000]"), ("Expected time to sell", "[00] days")], "Recommendation") +
  note("Based on Dubai Land Department transactions and portal listings at the date of the report. Not a formal valuation."), "CMA comparative market analysis pricing valuation"),
S("SL-VAL-LETTER", "Market opinion of value letter", "Letter", "Broker's opinion of value (not a RERA-certified valuation).",
  letter("Letter", "[Owner name]", "Market opinion of value – [Unit], [Community]", ["Dear [Owner name],", "Based on recent registered transactions and current market activity, our opinion of the market value of the above property as at {{today}} is <b>AED [0,000,000] to AED [0,000,000]</b>.", "This is a brokerage opinion to help with pricing decisions. It is not a valuation by a RERA-registered valuer and should not be used for mortgage or legal purposes."], "[Agent name]<br>Property Consultant"), "opinion of value market valuation letter"),
S("SC-01", "Viewing report and feedback", "Document", "Record of viewings and client feedback for the owner.",
  head("Sales & leasing", "Viewing report", [("Property", "[Community, unit]"), ("Period", "[From] – [To]")]) +
  table(["Date", "Client", "Agent", "Interest (1–5)", "Feedback"], [["[Date]", "[Client]", "[Agent]", "[3]", "[Feedback]"]]) +
  fields([("Summary", "[Viewings, offers received, common feedback]"), ("Recommendation", "[Price / presentation advice]")]), "viewing report feedback owner"),
S("SL-VIEW-SLIP", "Viewing confirmation slip", "Form", "Client signs to confirm the properties shown by the broker.",
  head("Viewings", "Viewing confirmation", [("Date", "{{today}}"), ("Agent", "[Name] · BRN [000000]")]) + party_block("Client") +
  table(["Time", "Property", "Asking price (AED)", "Client initials"], [["[Time]", "[Community, unit]", "[0,000,000]", ""]]) +
  paras("I confirm that {{company.name}} introduced and showed me the properties above.") + sig(["Client", "Agent"]), "viewing slip confirmation introduction"),
S("SL-OPENHOUSE", "Open house sign-in sheet", "Form", "Visitor log for open houses.",
  head("Sales", "Open house sign-in", [("Property", "[Community, unit]"), ("Date", "{{today}}")]) +
  table(["Name", "Mobile", "E-mail", "Buying / renting", "Agent?", "Consent to contact"], [["", "", "", "", "", "☐"] for _ in range(10)]), "open house sign in visitors"),
S("SC-04", "Transaction status update", "Document", "Progress report to the client on the sale.",
  head("Client update", "Transaction status", [("Property", "[Community, unit]"), ("Client", "[Name]")]) +
  table(["Step", "Status", "Date"], [["Form F signed", "[Done]", "[Date]"], ["Mortgage valuation", "[In progress]", "[Date]"], ["Developer NOC", "[Applied]", "[Date]"], ["Transfer appointment", "[Booked]", "[Date]"], ["Title deed", "[Pending]", ""]]) + fields([("Next action", "[Action]"), ("Your agent", "[Name, mobile]")]), "transaction status update progress"),
S("SL-TRANSFER-COSTS", "Buyer transfer cost estimate", "Document", "Estimated cash needed at transfer.",
  head("Sales", "Transfer cost estimate", [("Property", "[Unit]"), ("Price", "AED [0,000,000]")]) +
  table(["Item", "Basis", "AED"], [["DLD transfer fee", "4% of price", "[000,000]"], ["DLD admin fee", "Fixed", "[580]"], ["Trustee office fee", "[AED 4,000 + VAT]", "[4,200]"], ["Title deed fee", "Fixed", "[250]"], ["Mortgage registration", "0.25% of loan + AED 290", "[0,000]"], ["Agency commission", "[2]% + VAT", "[00,000]"], ["Developer NOC", "[Developer fee]", "[0,000]"], ["<b>Total estimated</b>", "", "<b>[000,000]</b>"]]) +
  note("Fees change; confirm the current DLD and trustee fees before the client prepares cheques."), "transfer costs DLD fee buyer estimate"),
S("SC-05", "Key handover certificate", "Form", "Confirms keys and access cards handed to the new owner or tenant.",
  head("Handover", "Key handover certificate") + PROPERTY() +
  table(["Item", "Quantity", "Notes"], [["Main door keys", "[0]", ""], ["Access cards / fobs", "[0]", ""], ["Mailbox key", "[0]", ""], ["Parking remote / sticker", "[0]", ""], ["Manuals and warranties", "", ""]]) +
  fields([("Meter readings – DEWA", "[Reading]"), ("Meter readings – cooling", "[Reading]")]) + sig(["Handed over by", "Received by"]), "key handover certificate"),
S("SL-CANCEL", "Sale cancellation and release agreement", "Contract", "Mutual cancellation of an MOU with deposit settlement.",
  head("Sales", "Mutual cancellation and release", [("MOU reference", "[MOU-0000]"), ("Date", "{{today}}")]) +
  party_block("Seller") + party_block("Buyer") + PROPERTY() +
  clauses([("Cancellation", ["The parties agree to cancel the Form F dated [Date] for the Property."]), ("Deposit", ["The security deposit of AED [000,000] shall be [returned to the Buyer / released to the Seller / split as follows: ...]."]), ("Release", ["Upon settlement, each party releases the other and the Broker from all claims relating to the cancelled sale."])]) +
  sig(["Seller", "Buyer", "Broker"]), "cancellation MOU release deposit"),
S("SL-PRICE-AUTH", "Price change authorisation", "Form", "Owner's written instruction to change the asking price.",
  head("Listing", "Price change authorisation") + PROPERTY() +
  fields([("Current asking price", "AED [0,000,000]"), ("New asking price", "AED [0,000,000]"), ("Effective from", "[Date]")]) + sig(["Owner", "Agent"]), "price change reduction owner authorisation"),
S("LC-FORM-I", "Co-brokerage agreement (Form I)", "Contract", "Agreement between two brokers to share a transaction. Binding Form I is signed on the DLD system.",
  head("Broker to broker", "Co-brokerage agreement (Form I)", [("Agreement no.", "[FI-0000]"), ("Date", "{{today}}")]) + BROKER +
  party_block("Co-broker", "co") + PROPERTY() +
  clauses([("Roles", ["{{company.name}} represents the [seller / landlord]; the Co-broker represents the [buyer / tenant]."]), ("Fee split", ["The commission of [2]% shall be shared [50 / 50] between the brokers, each invoicing its own client or the other broker as agreed."]), ("Conduct", ["Neither broker may contact the other's client directly to bypass this agreement."])]) +
  sig(["{{company.name}}", "Co-broker"]), "Form I co-broker agreement split"),
# ---------------------------------------------------------------- off-plan
S("OP-EOI", "Expression of interest (EOI) form", "Form", "Buyer's EOI for a new off-plan launch with refundable token.", 
  head("Off-plan", "Expression of interest", [("Project", "[Project name]"), ("Developer", "[Developer]"), ("Date", "{{today}}")]) + party_block("Buyer") +
  fields([("Unit preference", "[Type, bedrooms, view, floor]"), ("Budget", "AED [0,000,000]"), ("EOI amount", "AED [00,000] by [cheque / transfer] payable to [Developer]"), ("Refundable?", "[Fully refundable if no unit is allocated]")], "Interest") + BROKER +
  note("EOI cheques must be made payable to the developer, never to the broker or an individual.") + sig(["Buyer", "Agent"]), "EOI expression of interest off-plan launch", cat="Off-Plan"),
S("OP-BOOKING", "Off-plan booking form", "Form", "Booking of a specific off-plan unit with payment plan.",
  head("Off-plan", "Unit booking form", [("Project", "[Project]"), ("Developer", "[Developer]"), ("Booking date", "{{today}}")]) + party_block("Buyer") +
  fields([("Unit no.", "[Unit]"), ("Type / size", "[Type] · [0,000] sq ft"), ("Price", "AED [0,000,000]"), ("Booking amount", "[10]% = AED [000,000]"), ("DLD fee (4%)", "AED [00,000] payable to [Developer / DLD]"), ("Escrow account", "[Bank, account no.]")], "Unit") +
  table(["Milestone", "%", "AED", "Due"], [["Booking", "[10]", "[000,000]", "On booking"], ["During construction", "[50]", "[000,000]", "[Schedule]"], ["On handover", "[40]", "[000,000]", "[Est. date]"]], "Payment plan") + BROKER + sig(["Buyer", "Agent"]), "booking form off-plan unit payment plan", cat="Off-Plan"),
S("OP-PAYPLAN", "Payment plan schedule", "Document", "Detailed instalment schedule for an off-plan unit.",
  head("Off-plan", "Payment plan schedule", [("Project / unit", "[Project] · [Unit]"), ("Price", "AED [0,000,000]")]) +
  table(["#", "Milestone", "% of price", "Amount (AED)", "Due date", "Paid"], [["1", "Down payment", "[20]", "[000,000]", "[Date]", "☐"], ["2", "[Construction 20%]", "[10]", "[000,000]", "[Date]", "☐"], ["3", "[Construction 50%]", "[10]", "[000,000]", "[Date]", "☐"], ["4", "Handover", "[60]", "[000,000]", "[Date]", "☐"], ["", "<b>Total</b>", "<b>100</b>", "<b>[0,000,000]</b>", "", ""]]) +
  note("All instalments are paid into the project escrow account registered with RERA."), "payment plan schedule instalments off-plan", cat="Off-Plan"),
S("OP-ASSIGN", "Assignment (resale) agreement – off-plan", "Contract", "Transfer of an off-plan contract from the original buyer to a new buyer.",
  head("Off-plan resale", "Assignment agreement", [("Project / unit", "[Project] · [Unit]"), ("Date", "{{today}}")]) +
  party_block("Assignor (original buyer)") + party_block("Assignee (new buyer)") +
  fields([("Original price", "AED [0,000,000]"), ("Amount paid to developer", "AED [000,000] ([00]%)"), ("Premium payable to Assignor", "AED [000,000]"), ("Outstanding to developer", "AED [000,000] per the payment plan")], "Financials") +
  clauses([("Assignment", ["The Assignor assigns all rights and obligations under the SPA dated [Date] to the Assignee, subject to the developer's written consent."]), ("Developer consent", ["The parties shall obtain the developer NOC and pay the developer's assignment fee of [AED / %] paid by [party]."]), ("Oqood", ["The Oqood registration shall be updated with the Dubai Land Department into the Assignee's name."]), ("Commission", ["Commission of [2]% plus VAT payable to {{company.name}} by [party]."])]) +
  sig(["Assignor", "Assignee", "Broker"]), "assignment resale off-plan Oqood", cat="Off-Plan"),
S("OP-HANDOVER-CHK", "Off-plan handover readiness checklist", "Form", "Buyer checklist for handover of a completed unit.",
  head("Off-plan", "Handover readiness checklist", [("Project / unit", "[Project] · [Unit]"), ("Buyer", "[Name]")]) +
  checklist(["Handover notice received from developer", "Final payment and any late fees settled", "Title deed fee paid / title deed issued", "Service charges paid in advance as required", "DEWA, cooling and gas accounts registered", "Snagging inspection booked", "Snag list submitted and rectification confirmed", "Keys, access cards and warranties received", "Home insurance arranged", "Mortgage final disbursement completed (if financed)"]), "handover checklist off-plan completion", cat="Off-Plan"),
S("OP-SNAG", "Snagging inspection report", "Report", "Defects found at inspection, by room.",
  head("Inspection", "Snagging report", [("Property", "[Unit]"), ("Inspection date", "[Date]"), ("Inspector", "[Name]")]) +
  table(["#", "Room / area", "Defect", "Severity", "Photo ref.", "Rectified"], [["1", "[Living room]", "[Description]", "[Minor / Major]", "[P01]", "☐"], ["2", "[Kitchen]", "[Description]", "[Minor]", "[P02]", "☐"], ["3", "[Bathroom]", "[Description]", "[Major]", "[P03]", "☐"]]) + sig(["Inspector", "Owner / developer representative"]), "snagging report defects inspection", cat="Off-Plan"),
S("OP-ESCROW", "Escrow payment instruction", "Letter", "Instruction confirming payment into the RERA project escrow account.",
  letter("Letter", "[Buyer name]", "Payment instructions – [Project], unit [Unit]", ["Dear [Buyer name],", "Please make all payments for your unit directly to the project escrow account below. SWK Properties never collects instalments on behalf of the developer.", table(["Item", "Details"], [["Account name", "[Developer project escrow account]"], ["Bank", "[Bank]"], ["IBAN", "[AE00 ...]"], ["Reference", "[Unit no. and buyer name]"]]), "Please verify these details directly with the developer before transferring."], "[Agent name]<br>Property Consultant"), "escrow payment off-plan developer", cat="Off-Plan"),
]
