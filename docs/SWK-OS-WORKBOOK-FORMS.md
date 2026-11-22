# SWK OS Workbook — Part B: Form Field Reference

> Generated from the system itself (`npx tsx tools/docs/gen-form-reference.ts`). Do not edit by hand: re-run the command after a form changes.
>
> **How to read it.** *Required* = the form will not save without it. *Automatic* = filled by the system (numbers, totals, approver names, time stamps); you never type it. *Pick record* = choose an existing record from a drop-down (create that record first if it is missing).

## Dashboards

### Approvals — Manager Approval Requests

Menu: **Dashboards → Approvals** (Items waiting for sign-off) · Address: `/e/universal_approvals`

Record rules: numbered automatically (APR-YY00000) · cannot be deleted (cancel or void instead).

*Two-person manager approval requests for deals, pricing changes, payments, and special cases.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Approval Request | Approval No. | Text | Automatic |  |
| Approval Request | Request summary | Text | **Required** |  |
| Approval Request | Department | Pick record (Department) | Optional |  |
| Approval Request | Workflow type | Choose one | **Required** | High-Risk Financial Payment · Listing Publication · Mandate Price Reduction · Commission Advance / Split Override · Contract Execution · HR Offer / Salary Revision · Employee Separation & Access Revocation · Policy Exception · Production Release |
| Approval Request | Target entity | Text | Optional |  |
| Approval Request | Target record ID | Whole number | Optional |  |
| Approval Request | Risk level | Choose one | Optional | Standard · High – Four-Eyes Required · Critical – Executive + Compliance |
| Approval Request | Approval mode | Choose one | Optional | Single Approver · Four-Eyes Sequential · Parallel Committee |
| Approval Request | Status | Choose one | Automatic | Pending Step 1 · Pending Step 2 (Four-Eyes) · Approved · Rejected · Returned for Resubmission · Overdue Escalated |
| Approvers & Deadlines | Requested by | Pick record (User) | Automatic |  |
| Approvers & Deadlines | Step 1 approver | Pick record (User) | Optional |  |
| Approvers & Deadlines | Step 1 decided by | Pick record (User) | Automatic |  |
| Approvers & Deadlines | Step 1 decided at | Date & time | Automatic |  |
| Approvers & Deadlines | Step 2 (Four-Eyes) approver | Pick record (User) | Optional |  |
| Approvers & Deadlines | Step 2 decided by | Pick record (User) | Automatic |  |
| Approvers & Deadlines | Step 2 decided at | Date & time | Automatic |  |
| Approvers & Deadlines | Substitute / delegated approver | Pick record (User) | Optional |  |
| Approvers & Deadlines | Delegation valid until | Date | Optional |  |
| Approvers & Deadlines | SLA due at | Date & time | Optional |  |
| Approvers & Deadlines | Overdue escalation owner | Pick record (User) | Optional |  |
| Approvers & Deadlines | Supporting documents & justification | Long text | **Required** |  |
| Approvers & Deadlines | Approval / rejection audit comments | Long text | Automatic |  |

## Properties

### New Submissions — New Property Submissions

Menu: **Properties → New Submissions** (Step 1 · Agent property intake) · Address: `/e/inventory_submissions`

Record rules: numbered automatically (INV-YY00000) · cannot be deleted (cancel or void instead).

*Submit newly sourced properties, check for duplicates, verify owner documents and Trakheesi permits, and approve for listing.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Property Details | Submission No. | Text | Automatic |  |
| Property Details | Core Department | Choose one | Optional | Sales of Off-Plan Projects · Secondary Projects · Leasing |
| Property Details | Community | Pick record (Community) | Optional |  |
| Property Details | Building / Tower | Text | **Required** |  |
| Property Details | Unit No. | Text | **Required** |  |
| Property Details | Property type | Choose one | **Required** | Apartment · Villa · Townhouse · Studio · Penthouse · Duplex · Office · Retail · Land |
| Property Details | Listing purpose | Choose one | **Required** | Sale · Rent · Sale & Rent |
| Property Details | Seller / Unit Finance Status | Choose one | Optional | Cash (Title Deed Clear) · Mortgaged (Liability Letter Required) · Off-Plan Payment Plan (Oqood) · Pre-Approved |
| Property Details | Sourced via 3rd-Party Agent (A2A) | Tick box | Optional |  |
| Property Details | 3rd-Party Agency Name | Text | Optional |  |
| Property Details | 3rd-Party Agent Name | Text | Optional |  |
| Property Details | 3rd-Party Agent RERA BRN | Text | Optional |  |
| Property Details | 3rd-Party A2A Split % | % | Optional |  |
| Property Details | Detailed Seller / Landlord / 3rd-Party Agent Requirements | Long text | Optional |  |
| Property Details | Asking sale price (AED) | Amount (AED) | Optional |  |
| Property Details | Asking annual rent (AED) | Amount (AED) | Optional |  |
| Property Details | Area (sq ft) | Number | **Required** |  |
| Property Details | Floor | Whole number | Optional |  |
| Property Details | Bedrooms | Number | Optional |  |
| Property Details | Bathrooms | Number | Optional |  |
| Property Details | Current occupancy | Choose one | Optional | Vacant · Owner Occupied · Tenanted · Under Construction |
| Owner & Permit Details | Verified owner / landlord | Pick record (Customer / Party) | Optional |  |
| Owner & Permit Details | Owner / developer name | Text | **Required** |  |
| Owner & Permit Details | Owner verified phone | Phone | Optional |  |
| Owner & Permit Details | Owner ID & phone verified | Tick box | Optional |  |
| Owner & Permit Details | Preferred contact method | Choose one | Optional | Phone Call · WhatsApp · Email Only · Via POA / Representative |
| Owner & Permit Details | Inventory source | Choose one | **Required** | Direct Owner Cold Call · Existing Landlord · Developer Release · Portal / Inbound · Referral · Co-Broker Mandate |
| Owner & Permit Details | Signed Form A / agreement no. | Text | Optional |  |
| Owner & Permit Details | Price confirmation date | Date | Optional |  |
| Owner & Permit Details | Trakheesi permit no. | Text | Optional |  |
| Owner & Permit Details | Permit expiry date | Date | Optional |  |
| Review & Approval | Sourcing broker | Pick record (Agent (DLD Registered)) | **Required** |  |
| Review & Approval | Submitted by user | Pick record (User) | Automatic |  |
| Review & Approval | Duplicate of submission | Pick record (Property Submission) | Automatic |  |
| Review & Approval | Duplicate / conflict check | Choose one | Automatic | Clear · Potential Duplicate – Review Required · Conflict Under Arbitration · Merged Preserving Attribution · Rejected Duplicate |
| Review & Approval | Workflow stage | Choose one | Automatic | Submitted · Duplicate / Conflict Hold · Inventory Verified · Compliance Verified · Approved for Publication · Published to Stock · Rejected |
| Review & Approval | Inventory team verifier | Pick record (User) | Automatic |  |
| Review & Approval | Inventory verified at | Date & time | Automatic |  |
| Review & Approval | Compliance verifier | Pick record (User) | Automatic |  |
| Review & Approval | Compliance verified at | Date & time | Automatic |  |
| Review & Approval | Second-person manager approver | Pick record (User) | Automatic |  |
| Review & Approval | Publication approved at | Date & time | Automatic |  |
| Review & Approval | Created property record | Pick record (Property) | Automatic |  |
| Review & Approval | Rejection / conflict resolution notes | Long text | Optional |  |
| Review & Approval | Marketing & inspection notes | Long text | Optional |  |

### Owner Permits — Owner Agreements & Permits

Menu: **Properties → Owner Permits** (Step 2 · Signed owner forms) · Address: `/e/listing_mandates`

Record rules: numbered automatically (LMD-YY00000) · cannot be deleted (cancel or void instead).

*Approved owner agreements (Form A), Trakheesi advertising permits, and approved price updates.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Owner Agreement & Permit | Listing Mandate No. | Text | Automatic |  |
| Owner Agreement & Permit | Property | Pick record (Property) | **Required** |  |
| Owner Agreement & Permit | Unit | Pick record (Unit) | Optional |  |
| Owner Agreement & Permit | Commercial mandate | Pick record (Mandate) | Optional |  |
| Owner Agreement & Permit | Verified owner | Pick record (Customer / Party) | **Required** |  |
| Owner Agreement & Permit | Listing agent | Pick record (Agent (DLD Registered)) | **Required** |  |
| Owner Agreement & Permit | DLD Form A contract no. | Text | **Required** |  |
| Owner Agreement & Permit | Title deed / Oqood verified | Tick box | Optional |  |
| Owner Agreement & Permit | Owner ID / passport verified | Tick box | Optional |  |
| Owner Agreement & Permit | Trakheesi permit no. | Text | **Required** |  |
| Owner Agreement & Permit | Permit expiry date | Date | **Required** |  |
| Pricing & Approval | Authorised sale price (AED) | Amount (AED) | Optional |  |
| Pricing & Approval | Authorised annual rent (AED) | Amount (AED) | Optional |  |
| Pricing & Approval | Previous price (AED) | Amount (AED) | Automatic |  |
| Pricing & Approval | Reason for price update | Text | Optional |  |
| Pricing & Approval | Price change approved by | Pick record (User) | Automatic |  |
| Pricing & Approval | Second-person publication approver | Pick record (User) | Automatic |  |
| Pricing & Approval | Approved at | Date & time | Automatic |  |
| Pricing & Approval | Status | Choose one | Optional | Pending Verification · Verified & Active · Price Change Pending Approval · Suspended – Permit Expired · Expired · Revoked |
| Pricing & Approval | Restricted ownership & valuation notes | Long text | Optional |  |

### Properties — Properties

Menu: **Properties → Properties** (Step 3 · Approved buildings & villas) · Address: `/e/properties`

Record rules: numbered automatically (PRP-YY00000).

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Identity | Property No. | Text | Automatic |  |
| Identity | Title | Text | **Required** |  |
| Identity | Core Department | Choose one | Optional | Sales of Off-Plan Projects · Secondary Projects · Leasing |
| Identity | Inventory Source | Choose one | Optional | Direct Developer · Direct Seller / Owner · Direct Landlord · 3rd-Party Agent (A2A) |
| Identity | Type | Choose one | **Required** | Apartment · Villa · Townhouse · Studio · Penthouse · Duplex · Loft · Bungalow · Compound · Bulk |
| Identity | Status | Choose one | Optional | Available · Under Offer · Sold · Off-Plan · Rented · Reserved · Withdrawn |
| Identity | Seller / Unit Finance Status | Choose one | Optional | Cash (Title Deed Clear) · Mortgaged (Liability Letter Required) · Off-Plan Payment Plan (Oqood) · Pre-Approved |
| Identity | Developer | Pick record (Developer) | Optional |  |
| Identity | Community | Pick record (Community) | Optional |  |
| Identity | Sub-community | Text | Optional |  |
| Identity | Building / Tower | Text | Optional |  |
| Identity | Floor | Whole number | Optional |  |
| Identity | Furnishing | Choose one | Optional | Unfurnished · Semi-Furnished · Fully Furnished |
| Identity | Tenure | Choose one | Optional | Freehold · Leasehold · Usufruct · Musataha |
| Identity | Bedrooms | Number | Optional |  |
| Identity | Bathrooms | Number | Optional |  |
| Identity | Area (sq ft) | Number | Optional |  |
| Identity | Area (sq m) | Number | Optional |  |
| Identity | Plot Area (sq ft) | Number | Optional |  |
| Identity | Sale Price | Amount (AED) | Optional |  |
| Identity | Price / sq ft | Amount (AED) | Automatic |  |
| Identity | Annual Rent | Amount (AED) | Optional |  |
| Identity | ROI % | Number | Optional |  |
| Identity | Year Built | Whole number | Optional |  |
| Identity | Completion Year | Whole number | Optional |  |
| Identity | Payment Plan | Choose one | Optional | 100% on completion · 50/50 · 60/40 · 70/30 · 80/20 · Post-handover 2y · Post-handover 3y · Custom |
| Identity | Off-Plan | Tick box | Optional |  |
| Identity | Exclusive Mandate | Tick box | Optional |  |
| Identity | Trakheesi permit no. | Text | Optional | DLD advertising permit. Required to advertise a listing on portals. |
| Identity | Permit expiry | Date | Optional | Advertising stops being allowed after this date. |
| Identity | Ejari No. | Text | Optional |  |
| Identity | Title Deed No. | Text | Optional |  |
| Identity | Makani Number | Text | Optional |  |
| Identity | Full Address | Text | Optional |  |
| Identity | Description | Long text | Optional |  |
| Identity | Key Features | Long text | Optional |  |
| Identity | Amenities | Long text | Optional |  |
| Identity | Listing Agent | Pick record (Agent (DLD Registered)) | Optional |  |
| Identity | Co-Agent | Pick record (Agent (DLD Registered)) | Optional |  |
| Identity | Branch | Pick record (Branch) | Optional |  |
| Identity | Listed Date | Date | Optional |  |
| Identity | Available From | Date | Optional |  |
| 3rd-Party Agent (A2A) & Portals | Sourced via 3rd-Party Agent (A2A) | Tick box | Optional |  |
| 3rd-Party Agent (A2A) & Portals | 3rd-Party Agency Name | Text | Optional |  |
| 3rd-Party Agent (A2A) & Portals | 3rd-Party Agent Name | Text | Optional |  |
| 3rd-Party Agent (A2A) & Portals | 3rd-Party Agent Phone | Phone | Optional |  |
| 3rd-Party Agent (A2A) & Portals | 3rd-Party Agent RERA BRN | Text | Optional |  |
| 3rd-Party Agent (A2A) & Portals | 3rd-Party A2A Commission Split % | % | Optional |  |
| 3rd-Party Agent (A2A) & Portals | Detailed Seller / Landlord / 3rd-Party Agent Requirements | Long text | Optional |  |
| 3rd-Party Agent (A2A) & Portals | Promote on Bayut | Tick box | Optional |  |
| 3rd-Party Agent (A2A) & Portals | Promote on Dubizzle | Tick box | Optional |  |
| 3rd-Party Agent (A2A) & Portals | Promote on Property Finder | Tick box | Optional |  |
| 3rd-Party Agent (A2A) & Portals | Active | Tick box | Optional |  |
| 3rd-Party Agent (A2A) & Portals | Internal Notes | Long text | Optional |  |

### Units — Units

Menu: **Properties → Units** (Step 4 · Apartments & offices) · Address: `/e/units`

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Identity | Unit No. | Text | **Required** |  |
| Identity | Property | Pick record (Property) | **Required** |  |
| Identity | Unit Type | Choose one | Optional | Residential · Commercial · Retail · Office · Industrial · Warehouse · Showroom · Land · Parking · Storage |
| Identity | Status | Choose one | Optional | Available · Reserved · Under Offer · Sold · Rented · Under Maintenance · Blocked |
| Identity | Bedrooms | Number | Optional |  |
| Identity | Bathrooms | Number | Optional |  |
| Identity | Area (sq ft) | Number | Optional |  |
| Identity | Area (sq m) | Number | Optional |  |
| Identity | Sale Price | Amount (AED) | Optional |  |
| Identity | Annual Rent | Amount (AED) | Optional |  |
| Identity | Service Charge / yr | Amount (AED) | Optional |  |
| Identity | SC / sq ft | Amount (AED) | Automatic |  |
| Identity | Furnishing | Choose one | Optional | Unfurnished · Semi-Furnished · Fully Furnished |
| Identity | Floor | Whole number | Optional |  |
| Identity | View | Text | Optional |  |
| Identity | Floor plan link | Link | Optional |  |
| Identity | Virtual tour link (360° / video) | Link | Optional |  |
| Identity | Parking | Text | Optional |  |
| Identity | Balcony | Tick box | Optional |  |
| Identity | Maid's Room | Tick box | Optional |  |
| Identity | Study | Tick box | Optional |  |
| Identity | Corner Unit | Tick box | Optional |  |
| Identity | Owner | Pick record (Customer / Party) | Optional |  |
| Identity | Current Tenant | Pick record (Customer / Party) | Optional |  |
| Identity | Available From | Date | Optional |  |
| Identity | Assigned Agent | Pick record (Agent (DLD Registered)) | Optional |  |
| Identity | Unit Notes | Long text | Optional |  |
| Identity | Active | Tick box | Optional |  |

### Inspection Templates — Inspection Templates

Menu: **Properties → Inspection Templates** (Move-in / move-out checklists) · Address: `/e/inspection_templates`

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Template | Template | Text | **Required** |  |
| Template | Type | Choose one | Optional | Move-in · Move-out · Periodic · Snagging |
| Template | Checklist (one area or item per line) | Long text | **Required** |  |

### Payment Plans — Payment Plans

Menu: **Properties → Payment Plans** (Off-plan instalment plans) · Address: `/e/payment_plan_templates`

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Plan | Plan | Text | **Required** |  |
| Plan | Developer | Pick record (Developer) | Optional |  |
| Plan | Active | Tick box | Optional |  |
| Split (must total 100%) | Booking / down payment % | % | Optional |  |
| Split (must total 100%) | During construction % | % | Optional |  |
| Split (must total 100%) | Construction instalments | Number | Optional |  |
| Split (must total 100%) | On handover % | % | Optional |  |
| Split (must total 100%) | Post-handover % | % | Optional |  |
| Split (must total 100%) | Post-handover months | Number | Optional |  |
| Split (must total 100%) | Months between construction instalments | Whole number | Optional |  |
| Split (must total 100%) | Notes | Long text | Optional |  |

### Communities — Communities

Menu: **Properties → Communities** (Dubai areas & districts) · Address: `/e/communities`

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Community | Code | Text | **Required** |  |
| Community | Name | Text | **Required** |  |
| Community | Emirate | Text | Optional |  |
| Community | Area | Choose one | Optional | Dubai · Abu Dhabi · Sharjah · Ajman · Umm Al Quwain · Ras Al Khaimah · Fujairah |
| Community | Master Developer | Text | Optional |  |
| Community | RERA Community ID | Text | Optional |  |
| Community | Description | Text | Optional |  |
| Community | Key Landmarks | Text | Optional |  |
| Community | Avg Price/sq ft | Number | Optional |  |
| Community | Avg Annual Rent | Number | Optional |  |
| Community | Active | Tick box | Optional |  |

### Developers — Developers

Menu: **Properties → Developers** (Master developers) · Address: `/e/developers`

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Developer | Code | Text | **Required** |  |
| Developer | Name | Text | **Required** |  |
| Developer | RERA Developer ID | Text | Optional |  |
| Developer | Trade Licence | Text | Optional |  |
| Developer | Contact Person | Text | Optional |  |
| Developer | Phone | Phone | Optional |  |
| Developer | Email | E-mail | Optional |  |
| Developer | Website | Text | Optional |  |
| Developer | Address | Text | Optional |  |
| Developer | Profile | Long text | Optional |  |
| Developer | Active | Tick box | Optional |  |

## CRM

### Leads — Leads

Menu: **CRM → Leads** (Step 1 · New enquiries) · Address: `/e/leads`

Record rules: numbered automatically (LYY00000).

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Lead | Lead no. | Text | Automatic |  |
| Lead | Company / Client Name | Text | **Required** |  |
| Lead | Department | Choose one | Optional | Sales of Off-Plan Projects · Secondary Projects · Leasing |
| Lead | Contact person | Text | Optional |  |
| Lead | E-mail | E-mail | Optional |  |
| Lead | Phone / WhatsApp | Phone | Optional |  |
| Lead | Status | Choose one | Optional | New · Contacted · Qualified · Unqualified · Converted |
| Lead | Source | Choose one | Optional | Website · Property Finder · Bayut · Dubizzle · Referral · Cold call · Exhibition / event · Email campaign · WhatsApp · LinkedIn · Agent network · Existing customer · Portal enquiry · Inbound call · Other |
| Lead | Marketing consent (PDPL) | Choose one | Optional | Unknown · Opted in · Opted out |
| Lead | Campaign | Pick record (Campaign) | Optional |  |
| Lead | Owner | Pick record (User) | Optional |  |
| Lead | Interested in | Choose one | Optional | Apartment Sale · Villa Sale · Off-Plan Sale · Apartment Lease · Villa Lease · Commercial Sale · Commercial Lease · Property Management · Land Sale · Bulk Deal |
| Lead | Client Finance Status | Choose one | Optional | Cash Buyer · Mortgage Pre-Approved · Mortgage Required (In Process) · Developer Payment Plan · Annual / Multi-Cheque Tenant |
| Lead | Current area (where you own / live) | Text | Optional |  |
| Lead | Target area (community / building) | Text | Optional |  |
| Lead | Estimated value (AED) | Amount (AED) | Optional |  |
| Lead | Search 3rd-Party Agent (A2A) Inventory | Tick box | Optional |  |
| Lead | Non-Conversion / Lost Reason | Choose one | Optional | None (Active / Converted) · Price / Budget Mismatch · Location / Community Preference Changed · Mortgage Rejection / Financing Delay · Unit Sold / Leased to Another Client · Bought Through Competitor / Direct Developer · Client Postponed Decision · Payment Plan / Cheque Terms Not Agreed · Unresponsive / Invalid Contact |
| Lead | Non-Conversion Detailed Explanation | Long text | Optional |  |
| Lead | Bedrooms wanted | Number | Optional |  |
| Lead | Score | Number | Automatic |  |
| Lead | Heat | Choose one | Automatic | Hot · Warm · Cold |
| Lead | First response due | Date & time | Automatic |  |
| Lead | First response | Date & time | Automatic |  |
| Lead | In lead pool | Tick box | Automatic |  |
| Lead | Routed by | Text | Automatic |  |
| Lead | Converted to customer | Pick record (Customer / Party) | Automatic |  |
| Lead | Notes | Long text | Optional |  |

### Phone Calls — Voice calls

Menu: **CRM → Phone Calls** (Step 2 · Call log & notes) · Address: `/e/voice_calls`

Record rules: cannot be deleted (cancel or void instead) · read-only: rows are written by the system.

*Every call handled by the AI receptionist: who called, what they wanted, what was done, and the full transcript. Calls are matched to a customer or lead by phone number.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Call | Started | Date & time | Optional |  |
| Call | Direction | Choose one | Optional | in · out |
| Call | From | Text | Optional |  |
| Call | To | Text | Optional |  |
| Call | Caller | Text | Optional |  |
| Call | Customer | Pick record (Customer / Party) | Optional |  |
| Call | Lead | Pick record (Lead) | Optional |  |
| Call | Ticket | Pick record (Ticket / Complaint) | Optional |  |
| Call | Language | Choose one | Optional | English · Arabic · Hindi / Urdu · Russian · Other |
| Call | Outcome | Choose one | Optional | Lead captured · Viewing requested · Callback requested · Maintenance logged · Transferred to staff · Information given · Abandoned · Other |
| Call | Status | Choose one | Optional | In progress · Completed · Failed |
| Call | Duration (s) | Whole number | Optional |  |
| Call | Handed to staff | Tick box | Optional |  |
| Call | Ended | Date & time | Optional |  |
| Call | Telephony call id | Text | Optional | Id supplied by the voice platform; used to continue the same call across turns. |
| Call | Summary | Long text | Optional |  |
| Call | Error | Text | Optional |  |

### Follow-Ups — Calls & Activities

Menu: **CRM → Follow-Ups** (Step 5 · Tasks & callbacks) · Address: `/e/activities`

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Activity | Type | Choose one | **Required** | Call · Meeting · E-mail · Visit · Video call · WhatsApp |
| Activity | Subject | Text | **Required** |  |
| Activity | Company | Pick record (Customer / Party) | Optional |  |
| Activity | Contact | Pick record (Contact) | Optional |  |
| Activity | Contact name | Text | Optional |  |
| Activity | Phone | Phone | Optional |  |
| Activity | Direction | Choose one | Optional | Outbound · Inbound |
| Activity | Status | Choose one | Optional | Planned · Done · Cancelled |
| Activity | Outcome | Choose one | Optional | Connected · No answer · Voicemail · Callback requested · Quote requested · Not interested · Follow-up needed |
| Activity | Date & time | Date & time | Optional |  |
| Activity | Ends | Date & time | Optional |  |
| Activity | Duration (min) | Whole number | Optional |  |
| Activity | Owner | Pick record (User) | Optional |  |
| Activity | Location | Text | Optional |  |
| Activity | Video call link | Link | Optional |  |
| Activity | Follow-up date | Date | Optional |  |
| Activity | Notes | Long text | Optional |  |

### Opportunities — Opportunities

Menu: **CRM → Opportunities** (Step 6 · Active requirements) · Address: `/e/opportunities`

Record rules: numbered automatically (OPPYY00000) · has a board view by stage.

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Opportunity | Opp. no. | Text | Automatic |  |
| Opportunity | Title | Text | **Required** |  |
| Opportunity | Department | Choose one | Optional | Sales of Off-Plan Projects · Secondary Projects · Leasing |
| Opportunity | Customer | Pick record (Customer / Party) | **Required** |  |
| Opportunity | Contact | Pick record (Contact) | Optional |  |
| Opportunity | Stage | Choose one | Optional | Prospecting · Qualification · Quotation · Negotiation · Won · Lost |
| Opportunity | Expected revenue | Amount (AED) | Optional |  |
| Opportunity | Probability % | % | Optional |  |
| Opportunity | Expected close | Date | Optional |  |
| Opportunity | Owner | Pick record (User) | Optional |  |
| Opportunity | Service | Choose one | Optional | Apartment Sale · Villa Sale · Off-Plan Sale · Apartment Lease · Villa Lease · Commercial Sale · Commercial Lease · Property Management · Land Sale · Bulk Deal |
| Opportunity | Selling / current area | Text | Optional |  |
| Opportunity | Target area | Text | Optional |  |
| Opportunity | Client Finance Status | Choose one | Optional | Cash Buyer · Mortgage Pre-Approved · Mortgage Required (In Process) · Developer Payment Plan · Annual / Multi-Cheque Tenant |
| Opportunity | Legal UAE Payment Channel | Choose one | Optional | SWK Company Bank Account (AED/FX) · Developer DLD Escrow Account · Manager Cheque (In Seller/Developer Name) · Post-Dated Cheques (PDC to Landlord/Company) · Worldwide Currency Exchange (Licensed UAE Exchange House) · UAE-Permitted Crypto / USDT (VARA-Licensed Gateway to Company Account) |
| Opportunity | Volume | Choose one | Optional | One-off · Monthly · Quarterly · Annual contract |
| Opportunity | Lost / Non-Conversion Reason | Text | Optional |  |
| Opportunity | Notes | Long text | Optional |  |

### Contacts — Customers & Parties

Menu: **CRM → Contacts** (Buyers, sellers & tenants) · Address: `/e/parties`

Record rules: numbered automatically (P00000) · can be printed / e-mailed as PDF.

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Company | Code | Text | Automatic |  |
| Company | Company name | Text | **Required** |  |
| Company | Legal name | Text | Optional |  |
| Company | Status | Choose one | Optional | Prospect · Active · On hold · Blocked · Inactive |
| Company | Customer | Tick box | Optional |  |
| Company | Landlord | Tick box | Optional |  |
| Company | Tenant | Tick box | Optional |  |
| Company | Notify party | Tick box | Optional |  |
| Company | Vendor | Tick box | Optional |  |
| Company | Agent | Tick box | Optional |  |
| Company | Custodian | Tick box | Optional |  |
| Company | Broker | Tick box | Optional |  |
| Address & contact | Address line 1 | Text | Optional |  |
| Address & contact | Address line 2 | Text | Optional |  |
| Address & contact | City | Text | Optional |  |
| Address & contact | Emirate / state | Text | Optional |  |
| Address & contact | Country | Pick record (Country) | Optional |  |
| Address & contact | PO box / postcode | Text | Optional |  |
| Address & contact | Phone | Phone | Optional |  |
| Address & contact | E-mail | E-mail | Optional |  |
| Address & contact | Website | Link | Optional |  |
| Address & contact | Primary contact | Text | Optional |  |
| Tax & credit | Tax registration no. (TRN) | Text | Optional |  |
| Tax & credit | Trade licence no. | Text | Optional |  |
| Tax & credit | EORI / importer code | Text | Optional |  |
| Tax & credit | Credit limit | Amount (AED) | Optional |  |
| Tax & credit | Credit days | Whole number | Optional |  |
| Tax & credit | Payment term | Pick record (Payment term) | Optional |  |
| Tax & credit | Billing currency | Choose one | Optional | AED · USD · EUR · GBP · SAR · INR · CNY · ZAR |
| Tax & credit | KYC status | Choose one | Optional | Pending · Verified · Expired · Rejected |
| Tax & credit | KYC / licence expiry | Date | Optional |  |
| Compliance (UAE) | Sanctions screening | Choose one | Optional | Not screened · Clear · Potential match · Confirmed match — Screen against the UAE Local Terrorist List and UN Consolidated List. A confirmed match blocks new jobs, quotations and invoices. |
| Compliance (UAE) | Screened on | Date | Optional |  |
| Compliance (UAE) | Risk rating | Choose one | Optional | Low · Medium · High |
| Compliance (UAE) | Related party / connected person | Tick box | Optional | Owner, shareholders, group companies – disclosed in the corporate tax return |
| Compliance (UAE) | Politically exposed person (PEP) | Tick box | Optional | Tick for a PEP, or a family member or close associate of one. Needs senior approval and enhanced due diligence. |
| Compliance (UAE) | PEP details | Text | Optional |  |
| Compliance (UAE) | Beneficial owners (25%+) | Long text | Optional | Names, nationality and percentage held by each person who ultimately owns or controls a company client. |
| Compliance (UAE) | Beneficial owners verified on | Date | Optional |  |
| Compliance (UAE) | Source of funds | Choose one | Optional | Salary / employment · Business income · Savings · Sale of property · Inheritance · Investment returns · Loan / mortgage · Other |
| Compliance (UAE) | Source of funds notes | Text | Optional |  |
| Compliance (UAE) | Last KYC review | Date | Optional |  |
| Compliance (UAE) | Marketing consent (PDPL) | Choose one | Optional | Unknown · Opted in · Opted out |
| Compliance (UAE) | Consent date | Date | Optional |  |
| Relationship | Salesperson | Pick record (User) | Optional |  |
| Relationship | Industry | Choose one | Optional | Manufacturing · Trading · FMCG · Automotive · Pharma / healthcare · Oil & gas · Construction · Retail · Electronics · Agriculture / food · Textiles · Other |
| Relationship | Source | Choose one | Optional | Website · Property Finder · Bayut · Dubizzle · Referral · Cold call · Exhibition / event · Email campaign · WhatsApp · LinkedIn · Agent network · Existing customer · Portal enquiry · Inbound call · Other |
| Relationship | Notes | Long text | Optional |  |

### Messages Log — Company WhatsApp & Chat Logs

Menu: **CRM → Messages Log** (All client messages) · Address: `/e/communications`

Record rules: numbered automatically (COM-YY000000) · cannot be deleted (cancel or void instead).

*Client conversations on official company WhatsApp, phone, and email lines with response timers and follow-up tasks.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Channel & Routing | Communication No. | Text | Automatic |  |
| Channel & Routing | Company channel | Choose one | **Required** | WhatsApp Business · Inbound Phone / AI Voice · Company Email · Customer Portal |
| Channel & Routing | Approved company WABA / line ID | Text | Optional |  |
| Channel & Routing | Customer phone (normalised) | Phone | **Required** |  |
| Channel & Routing | Linked client / party | Pick record (Customer / Party) | Optional |  |
| Channel & Routing | Linked lead | Pick record (Lead) | Optional |  |
| Channel & Routing | Linked property | Pick record (Property) | Optional |  |
| Channel & Routing | Linked viewing | Pick record (Viewing) | Optional |  |
| Channel & Routing | Linked deal file | Pick record (Deal File) | Optional |  |
| Channel & Routing | Linked complaint / ticket | Pick record (Ticket / Complaint) | Optional |  |
| Channel & Routing | Assigned staff member | Pick record (User) | **Required** |  |
| Channel & Routing | Previous owner (handoff) | Pick record (User) | Automatic |  |
| Channel & Routing | Direction | Choose one | Optional | Inbound · Outbound |
| Channel & Routing | Delivery status | Choose one | Optional | Received · Queued · Sent · Delivered · Read · Provider Outage – Retry Queued |
| Response Time & Review | Reply SLA deadline | Date & time | Optional |  |
| Response Time & Review | First response at | Date & time | Optional |  |
| Response Time & Review | SLA breached | Tick box | Optional |  |
| Response Time & Review | Supervisor tag | Choose one | Optional | None · Complaint · Dispute · VIP Urgent · Personal Number Diversion Flag · Outage Fallback Needed |
| Response Time & Review | Personal WhatsApp diversion detected | Tick box | Automatic |  |
| Response Time & Review | Detected diversion phrase / evidence | Text | Automatic |  |
| Response Time & Review | Extracted commitment task | Pick record (Task) | Optional |  |
| Response Time & Review | Retention policy | Choose one | Optional | Standard 2 Years · Transaction Record 5 Years · Legal Hold – Do Not Purge |
| Response Time & Review | Conversation status | Choose one | Optional | Open · Responded · Handed Over · Escalated to Supervisor · Closed |
| Response Time & Review | Message content / commitment summary | Long text | **Required** |  |
| Response Time & Review | AI-generated conversation summary | Long text | Optional |  |

### Campaigns — Campaigns

Menu: **CRM → Campaigns** (Marketing campaigns) · Address: `/e/campaigns`

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Campaign | Campaign | Text | **Required** |  |
| Campaign | Channel | Choose one | Optional | E-mail · WhatsApp · Exhibition · Webinar · LinkedIn · Direct visit · Referral |
| Campaign | Status | Choose one | Optional | Planned · Running · Completed · Cancelled |
| Campaign | Start | Date | Optional |  |
| Campaign | End | Date | Optional |  |
| Campaign | Budget | Amount (AED) | Optional |  |
| Campaign | Actual cost | Amount (AED) | Optional |  |
| Campaign | Owner | Pick record (User) | Optional |  |
| Campaign | Target audience & notes | Long text | Optional |  |

### Message Drafts — Message Drafts

Menu: **CRM → Message Drafts** (Approve before sending) · Address: `/e/message_drafts`

Record rules: numbered automatically (MSG-YY00000).

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Message | Draft No. | Text | Automatic |  |
| Message | Channel | Choose one | **Required** | WhatsApp · Email |
| Message | Lead | Pick record (Lead) | Optional |  |
| Message | To | Text | **Required** |  |
| Message | Phone | Text | Optional |  |
| Message | Email | Text | Optional |  |
| Message | Subject | Text | Optional |  |
| Message | Message | Long text | **Required** |  |
| Message | Status | Choose one | Optional | Pending approval · Approved · Sent · Rejected · Failed |
| Message | Created by | Text | Automatic |  |
| Message | Approved by | Pick record (User) | Automatic |  |
| Message | Sent | Date & time | Automatic |  |
| Message | Send error | Long text | Automatic |  |

### Follow-up Sequences — Follow-up Sequences

Menu: **CRM → Follow-up Sequences** (Drip follow-ups) · Address: `/e/followup_sequences`

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Sequence | Sequence | Text | **Required** |  |
| Sequence | Active | Tick box | Optional |  |
| Sequence | Steps (one per line: days/channel/message) | Long text | **Required** | Example: 1/WhatsApp/Hi {name}, thanks for your enquiry. Would you like to view the unit? |
| Sequence | Enrolled leads | Number | Automatic |  |
| Sequence | Replied | Number | Automatic |  |

### Sequence Enrolments — Sequence Enrolments

Menu: **CRM → Sequence Enrolments** (Who is in a sequence) · Address: `/e/sequence_enrolments`

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Enrolment | Sequence | Pick record (Follow-up Sequence) | **Required** |  |
| Enrolment | Lead | Pick record (Lead) | **Required** |  |
| Enrolment | Lead | Text | Automatic |  |
| Enrolment | Status | Choose one | Optional | Running · Replied · Finished · Stopped |
| Enrolment | Next step (0 = first) | Number | Automatic |  |
| Enrolment | Next due | Date & time | Automatic |  |

### Routing Rules — Lead Routing Rules

Menu: **CRM → Routing Rules** (Who gets new leads) · Address: `/e/lead_routing_rules`

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Rule | Rule | Text | **Required** |  |
| Rule | Active | Tick box | Optional |  |
| Rule | Priority (1 = first) | Whole number | Optional |  |
| Rule | Lead source | Choose one | Optional | Any · Website · Property Finder · Bayut · Dubizzle · Referral · Cold call · Exhibition / event · Email campaign · WhatsApp · LinkedIn · Agent network · Existing customer · Portal enquiry · Inbound call · Other |
| Rule | Department | Choose one | Optional | Any · Sales of Off-Plan Projects · Secondary Projects · Leasing |
| Rule | Strategy | Choose one | Optional | Round robin · Least open leads |
| Rule | Team (role names, comma separated) | Text | Optional | Active users in these roles share the leads. Example: Sales, Manager |
| Rule | Last assigned | Pick record (User) | Automatic |  |

### Mortgage Cases — Mortgage Cases

Menu: **CRM → Mortgage Cases** (Bank referrals & milestones) · Address: `/e/mortgage_cases`

Record rules: numbered automatically (MTG-YY00000) · has a board view by status.

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Case | Case No. | Text | Automatic |  |
| Case | Lead | Pick record (Lead) | Optional |  |
| Case | Client | Pick record (Customer / Party) | Optional |  |
| Case | Client | Text | **Required** |  |
| Case | Sales advisor | Pick record (User) | Optional |  |
| Case | Unit | Pick record (Unit) | Optional |  |
| Loan | Bank | Choose one | Optional | Emirates NBD · Mashreq · First Abu Dhabi Bank · Abu Dhabi Commercial Bank · Dubai Islamic Bank · RAKBANK · HSBC · Standard Chartered · Commercial Bank of Dubai · Ajman Bank · Other |
| Loan | Property value | Amount (AED) | **Required** |  |
| Loan | Loan amount | Amount (AED) | **Required** |  |
| Loan | LTV % | % | Automatic |  |
| Loan | Tenor (years) | Number | Optional |  |
| Loan | Rate % | Number | Optional |  |
| Milestones | Milestone | Choose one | Optional | Referred · Documents Collected · Submitted to Bank · Pre-Approved · Valuation Done · Final Offer Letter · Offer Signed · Disbursed · Declined · Cancelled |
| Milestones | Submitted to bank | Date | Automatic |  |
| Milestones | Pre-approved | Date | Automatic |  |
| Milestones | Offer letter | Date | Automatic |  |
| Milestones | Disbursed | Date | Optional |  |
| Milestones | Decline / cancel reason | Long text | Optional |  |
| Referral commission | Bank referral commission % of loan | % | Optional |  |
| Referral commission | Referral commission | Amount (AED) | Automatic |  |
| Referral commission | Commission received from bank | Tick box | Optional |  |
| Referral commission | Notes | Long text | Optional |  |

### Targets — Targets

Menu: **CRM → Targets** (Monthly goals per advisor) · Address: `/e/agent_targets`

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Target | Advisor | Pick record (User) | **Required** |  |
| Target | Advisor | Text | Automatic |  |
| Target | Month (YYYY-MM) | Text | **Required** |  |
| Target | Metric | Choose one | **Required** | Leads converted · Calls logged · Viewings held · Deals won · Won value (AED) |
| Target | Target | Number | **Required** |  |

### Lead History — Lead Assignment History

Menu: **CRM → Lead History** (Lead routing log) · Address: `/e/lead_assignment_logs`

Record rules: numbered automatically (LAL-YY000000) · cannot be deleted (cancel or void instead) · read-only: rows are written by the system.

*Complete history of who each lead was assigned to and why.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
|  | Log No. | Text | Optional |  |
|  | Lead | Pick record (Lead) | **Required** |  |
|  | Previous agent / owner | Pick record (User) | Optional |  |
|  | Assigned agent / owner | Pick record (User) | **Required** |  |
|  | Assignment mode | Choose one | Optional | Initial Capture · Round-Robin · Weighted Conversion Score · Territory & Language Match · VIP Priority Routing · Approved Manager Reassignment · SLA Breach Reallocation · Employee Separation / Leave Handover · Dispute Arbitration Decision |
|  | Reason / attribution notes | Text | Optional |  |
|  | Approved by manager | Pick record (User) | Optional |  |
|  | First-response SLA due at | Date & time | Optional |  |
|  | Assigned at | Date & time | Optional |  |

### Reviews — Quality Reviews

Menu: **CRM → Reviews** (Client service ratings) · Address: `/e/qa_reviews`

Record rules: numbered automatically (QAR-YY00000) · cannot be deleted (cancel or void instead).

*Helpful quality scores and feedback for calls, chats, and property listings.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Review Scope | QA Review No. | Text | Automatic |  |
| Review Scope | Reviewed broker | Pick record (Agent (DLD Registered)) | **Required** |  |
| Review Scope | Staff user | Pick record (User) | Optional |  |
| Review Scope | QA reviewer | Pick record (User) | Optional |  |
| Review Scope | Reviewed channel | Choose one | **Required** | WhatsApp Business Sample · Inbound / Outbound Call · Viewing Follow-up Audit · Published Listing Accuracy · Client Satisfaction Survey |
| Review Scope | Linked communication | Pick record (Company Chat Log) | Optional |  |
| Review Scope | Linked voice call | Pick record (Voice call) | Optional |  |
| Review Scope | Linked property | Pick record (Property) | Optional |  |
| Scores & Feedback | Accuracy score (1–100) | Whole number | **Required** |  |
| Scores & Feedback | Communication etiquette (1–100) | Whole number | **Required** |  |
| Scores & Feedback | Follow-ups done on time | Tick box | Optional |  |
| Scores & Feedback | Overall QA score (1–100) | Whole number | Optional |  |
| Scores & Feedback | Status | Choose one | Automatic | Completed · Challenged by Broker · Upheld by Manager · Adjusted after Challenge |
| Scores & Feedback | QA findings & published criteria assessment | Long text | **Required** |  |
| Scores & Feedback | Corrective coaching & development actions | Long text | Optional |  |
| Scores & Feedback | Broker exercised right to challenge | Tick box | Automatic |  |
| Scores & Feedback | Broker challenge grounds & evidence | Long text | Optional |  |
| Scores & Feedback | Manager final sign-off by | Pick record (User) | Automatic |  |
| Scores & Feedback | Signed off at | Date & time | Automatic |  |

## Sales & mandates

### E-Signatures — Signature Requests

Menu: **Sales & mandates → E-Signatures** (Send documents to sign) · Address: `/e/esign_requests`

Record rules: numbered automatically (SIG-YY00000).

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Request | Request No. | Text | Automatic |  |
| Request | Document | Text | **Required** |  |
| Request | Text to be signed | Long text | **Required** |  |
| Request | Signer (client) | Pick record (Customer / Party) | Optional |  |
| Request | Signer name | Text | **Required** |  |
| Request | Signer email | Text | Optional |  |
| Request | Status | Choose one | Optional | Draft · Sent · Signed · Declined · Expired |
| Request | Signing link | Text | Automatic |  |
| Request | Document fingerprint (SHA-256) | Text | Automatic |  |
| Request | Signed at | Date & time | Automatic |  |
| Request | Typed signature | Text | Automatic |  |
| Request | Signer IP | Text | Automatic |  |

### Seller Form A — Mandates

Menu: **Sales & mandates → Seller Form A** (Step 1 · Seller agreement) · Address: `/e/mandates`

Record rules: numbered automatically (MND-YY00000).

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Mandate | Mandate No. | Text | Automatic |  |
| Mandate | Core Department | Choose one | Optional | Sales of Off-Plan Projects · Secondary Projects · Leasing |
| Mandate | Property | Pick record (Property) | **Required** |  |
| Mandate | Property | Text | Automatic |  |
| Mandate | Unit (if specific) | Pick record (Unit) | Optional |  |
| Mandate | Type | Choose one | **Required** | Exclusive Sale · Exclusive Lease · Open Sale · Open Lease · Co-Broker Sale · Co-Broker Lease |
| Mandate | Status | Choose one | Optional | Draft · Active · Paused · Expired · Withdrawn · Completed · Cancelled |
| Mandate | Owner / Landlord | Pick record (Customer / Party) | **Required** |  |
| Mandate | Listing Agent | Pick record (Agent (DLD Registered)) | **Required** |  |
| Mandate | Co-Agent | Pick record (Agent (DLD Registered)) | Optional |  |
| Mandate | 3rd-Party Agent (A2A) Co-Brokering | Tick box | Optional |  |
| Mandate | 3rd-Party Agency Name | Text | Optional |  |
| Mandate | 3rd-Party Agent Name | Text | Optional |  |
| Mandate | 3rd-Party Agent RERA BRN | Text | Optional |  |
| Mandate | 3rd-Party A2A Split % | % | Optional |  |
| Mandate | Detailed Seller / Agent Requirements | Long text | Optional |  |
| Mandate | Branch | Pick record (Branch) | Optional |  |
| Mandate | Asking Price | Amount (AED) | Optional |  |
| Mandate | Asking Annual Rent | Amount (AED) | Optional |  |
| Mandate | Seller Commission % | % | Optional |  |
| Mandate | Buyer Commission % | % | Optional |  |
| Mandate | Landlord Commission % | % | Optional |  |
| Mandate | Tenant Commission % | % | Optional |  |
| Mandate | Minimum Acceptable | Amount (AED) | Optional |  |
| Mandate | Start Date | Date | **Required** |  |
| Mandate | Expiry Date | Date | **Required** |  |
| Mandate | Auto-Renew | Tick box | Optional |  |
| Mandate | Renewal Notice (days) | Whole number | Optional |  |
| Mandate | Exclusive | Tick box | Optional |  |
| Mandate | Allow Co-Brokerage | Tick box | Optional |  |
| Mandate | Marketing Instructions | Text | Optional |  |
| Mandate | Special Terms | Long text | Optional |  |
| Mandate | Signed By (Agent) | Pick record (User) | Optional |  |
| Mandate | Signed Date | Date | Optional |  |
| Mandate | Publish to Portals | Tick box | Optional |  |
| Mandate | Featured Listing | Tick box | Optional |  |
| Mandate | Last Activity | Date | Automatic |  |
| Mandate | Internal Notes | Long text | Optional |  |

### Viewings — Viewings

Menu: **Sales & mandates → Viewings** (Step 2 · Property visits) · Address: `/e/viewings`

Record rules: numbered automatically (VW-YY000000).

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Viewing | Viewing No. | Text | Automatic |  |
| Viewing | Mandate | Pick record (Mandate) | **Required** |  |
| Viewing | Property | Pick record (Property) | **Required** |  |
| Viewing | Property | Text | Automatic |  |
| Viewing | Unit | Pick record (Unit) | Optional |  |
| Viewing | Lead / Buyer | Pick record (Lead) | **Required** |  |
| Viewing | Accompanying Agent | Pick record (Agent (DLD Registered)) | **Required** |  |
| Viewing | Scheduled At | Date & time | **Required** |  |
| Viewing | Duration (min) | Whole number | Optional |  |
| Viewing | Status | Choose one | Optional | Scheduled · Confirmed · Completed · Cancelled · No-Show · Rescheduled |
| Viewing | Meeting Point | Text | Optional |  |
| Viewing | Feedback | Text | Optional |  |
| Viewing | Interest (1-10) | Number | Optional |  |
| Viewing | Follow-up Required | Tick box | Optional |  |
| Viewing | Follow-up By | Date & time | Optional |  |
| Viewing | Agent Notes | Long text | Optional |  |
| Viewing | Client Notes | Long text | Optional |  |
| Viewing | Virtual Viewing | Tick box | Optional |  |
| Viewing | Virtual Link | Text | Optional |  |
| Viewing | Live GPS Check-in Latitude | Text | Optional |  |
| Viewing | Live GPS Check-in Longitude | Text | Optional |  |
| Viewing | Site Visit Live Check-in At | Date & time | Optional |  |
| Viewing | Site Visit Check-out At | Date & time | Optional |  |

### Buyer Offers — Offers

Menu: **Sales & mandates → Buyer Offers** (Step 3 · Client offers) · Address: `/e/offers`

Record rules: numbered automatically (OFF-YY00000).

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Offer | Offer No. | Text | Automatic |  |
| Offer | Property | Pick record (Property) | **Required** |  |
| Offer | Property | Text | Automatic |  |
| Offer | Unit | Pick record (Unit) | Optional |  |
| Offer | Buyer / Tenant | Pick record (Customer / Party) | **Required** |  |
| Offer | Buyer Agent | Pick record (Agent (DLD Registered)) | Optional |  |
| Offer | Listing Agent | Pick record (Agent (DLD Registered)) | Optional |  |
| Offer | Type | Choose one | **Required** | Purchase · Lease |
| Offer | Status | Choose one | Optional | Draft · Submitted · Under Review · Negotiating · Accepted · Rejected · Countered · Withdrawn · Expired |
| Offer | Offer Price / Rent | Amount (AED) | **Required** |  |
| Offer | Deposit Amount | Amount (AED) | Optional |  |
| Offer | Buyer Finance Status | Choose one | Optional | Cash · Mortgaged · Mortgage Pre-Approved · Off-Plan Payment Plan |
| Offer | Legal UAE Payment Channel | Choose one | Optional | SWK Company Bank Account (AED/FX) · Developer DLD Escrow Account · Manager Cheque (In Seller/Developer Name) · Post-Dated Cheques (PDC to Landlord/Company) · Worldwide Currency Exchange (Licensed UAE Exchange House) · UAE-Permitted Crypto / USDT (VARA-Licensed Gateway to Company Account) |
| Offer | Payment Terms | Choose one | Optional | Cash · Mortgage · Mortgage Pre-Approved · 50/50 · Post-handover · Installments · Annual · Quarterly · Monthly |
| Offer | Financing Details | Text | Optional |  |
| Offer | Offer Date | Date | **Required** |  |
| Offer | Valid Until | Date | Optional |  |
| Offer | Special Conditions | Text | Optional |  |
| Offer | Responded By | Pick record (User) | Optional |  |
| Offer | Responded At | Date & time | Optional |  |
| Offer | Counter Price | Amount (AED) | Optional |  |
| Offer | Counter Terms | Long text | Optional |  |
| Offer | Subject to Sale | Tick box | Optional |  |
| Offer | Subject to Finance | Tick box | Optional |  |
| Offer | Subject to Inspection | Tick box | Optional |  |
| Offer | Internal Notes | Long text | Optional |  |

### Sale Contract (F) — Sales Contracts

Menu: **Sales & mandates → Sale Contract (F)** (Step 4 · Signed Form F / MOU) · Address: `/e/sales_contracts`

Record rules: numbered automatically (SCT-YY00000) · cannot be deleted (cancel or void instead) · can be printed / e-mailed as PDF.

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Contract | Contract No. | Text | Automatic |  |
| Contract | Property | Pick record (Property) | **Required** |  |
| Contract | Property | Text | Automatic |  |
| Contract | Unit | Pick record (Unit) | Optional |  |
| Contract | Seller | Pick record (Customer / Party) | **Required** |  |
| Contract | Buyer | Pick record (Customer / Party) | **Required** |  |
| Contract | Listing Agent | Pick record (Agent (DLD Registered)) | Optional |  |
| Contract | Buyer Agent | Pick record (Agent (DLD Registered)) | Optional |  |
| Contract | Originating Offer | Pick record (Offer) | Optional |  |
| Contract | Status | Choose one | Optional | Draft · Signed · In Escrow · DLD Submitted · DLD Approved · Title Deed Issued · Completed · Cancelled · Disputed |
| Contract | Sale Price | Amount (AED) | **Required** |  |
| Contract | Deposit (10%) | Amount (AED) | Optional |  |
| Contract | Contract Date | Date | **Required** |  |
| Contract | Target Completion | Date | Optional |  |
| Contract | Actual Handover | Date | Optional |  |
| Contract | Payment Method | Choose one | Optional | SWK Company Bank Account (AED/FX) · Developer DLD Escrow Account · Manager's Cheque · Post-Dated Cheques (PDC) · Worldwide Currency Exchange (Licensed UAE Exchange House) · UAE-Permitted Crypto / USDT (VARA-Licensed Gateway) · Bank Transfer · Escrow · Mortgage Disbursement · Cash |
| Contract | Buyer Finance Status | Choose one | Optional | Cash · Mortgaged · Mortgage Pre-Approved · Off-Plan Payment Plan |
| Contract | Verified No Sales Advisor Personal Account Used | Tick box | Optional |  |
| Contract | 3rd-Party Agent (A2A) Involved | Tick box | Optional |  |
| Contract | 3rd-Party Agency Name | Text | Optional |  |
| Contract | 3rd-Party Agent Name | Text | Optional |  |
| Contract | 3rd-Party A2A Share % | % | Optional |  |
| Contract | 3rd-Party A2A Commission (AED) | Amount (AED) | Optional |  |
| Contract | Payment Schedule | Text | Optional |  |
| Contract | Mortgage Involved | Tick box | Optional |  |
| Contract | Mortgage Bank | Text | Optional |  |
| Contract | Mortgage Reference | Text | Optional |  |
| Contract | DLD Fee % | Number | Optional |  |
| Contract | DLD Fee (AED) | Amount (AED) | Automatic |  |
| Contract | Agency Fee % | Number | Optional |  |
| Contract | Agency Fee (AED) | Amount (AED) | Automatic |  |
| Contract | Seller Net Proceeds | Amount (AED) | Automatic |  |
| Contract | Escrow Account | Pick record (Escrow Account) | Optional |  |
| Contract | Special Conditions | Long text | Optional |  |
| Contract | Seller Obligations | Long text | Optional |  |
| Contract | Buyer Obligations | Long text | Optional |  |
| Contract | Prepared By | Pick record (User) | Optional |  |
| Contract | Signed Date | Date | Optional |  |
| Contract | Witness 1 | Pick record (Customer / Party) | Optional |  |
| Contract | Witness 2 | Pick record (Customer / Party) | Optional |  |
| Contract | DLD Application No. | Text | Optional |  |
| Contract | DLD Submitted | Date | Optional |  |
| Contract | DLD Approved | Date | Optional |  |
| Contract | Title Deed No. | Text | Optional |  |
| Contract | Title Deed Date | Date | Optional |  |
| Contract | VAT Applicable | Tick box | Optional |  |
| Contract | VAT Treatment | Choose one | Optional | Standard 5% · Zero-Rated · Exempt · Out of Scope |
| Contract | Internal Notes | Long text | Optional |  |

### Escrow — Escrow Accounts

Menu: **Sales & mandates → Escrow** (Step 5 · Deposit & escrow) · Address: `/e/escrow_accounts`

Record rules: numbered automatically (ESC-YY00000).

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Escrow | Escrow No. | Text | Automatic |  |
| Escrow | Sales Contract | Pick record (Sales Contract) | **Required** |  |
| Escrow | Contract | Text | Automatic |  |
| Escrow | Bank | Pick record (Customer / Party) | **Required** |  |
| Escrow | Account Name | Text | Optional |  |
| Escrow | Status | Choose one | Optional | Opened · Funds Received · Funds Verified · DLD Submitted · Title Transfer Pending · Title Transferred · Funds Released · Closed · Disputed · Cancelled |
| Escrow | Expected Amount | Amount (AED) | Optional |  |
| Escrow | Received Amount | Amount (AED) | Automatic |  |
| Escrow | Opened Date | Date | Optional |  |
| Escrow | Closed Date | Date | Optional |  |
| Escrow | DLD Escrow Reference | Text | Optional |  |
| Escrow | Release Conditions | Long text | Optional |  |
| Escrow | Opened By | Pick record (User) | Optional |  |
| Escrow | Closed By | Pick record (User) | Optional |  |
| Escrow | Notes | Long text | Optional |  |

### Developer NOC — Developer NOC Requests

Menu: **Sales & mandates → Developer NOC** (Step 6 · Developer clearance) · Address: `/e/developer_requests`

Record rules: numbered automatically (NOC-YY00000) · cannot be deleted (cancel or void instead).

*Track developer NOC applications, service-charge clearances, and uploaded NOC certificates required before property transfer.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Deal & Parties | NOC Request No. | Text | Automatic |  |
| Deal & Parties | Developer | Pick record (Developer) | **Required** |  |
| Deal & Parties | Property | Pick record (Property) | **Required** |  |
| Deal & Parties | Unit | Pick record (Unit) | Optional |  |
| Deal & Parties | Sales contract (Form F) | Pick record (Sales Contract) | Optional |  |
| Deal & Parties | Qualifying deal file | Pick record (Deal File) | Optional |  |
| Deal & Parties | Seller (Current Owner) | Pick record (Customer / Party) | **Required** |  |
| Deal & Parties | Buyer | Pick record (Customer / Party) | **Required** |  |
| Deal & Parties | Transaction type | Choose one | **Required** | Secondary Resale · Mortgage Release + Resale · Off-Plan Assignment / Resale · Corporate Buyer / Seller Transfer · POA Executed Transfer |
| Deal & Parties | NOC workflow status | Choose one | Automatic | Draft · Prerequisite Checklist Pending · Owner Authorised · Submitted to Developer Portal · Service Charge Settlement Pending · NOC Uploaded – Pending Independent Review · Verified & Valid (Closing Unlocked) · Held – Fraud / Unverified Escalation · Expired · Rejected |
| Service Charges & Application | Developer checklist complete | Tick box | Optional |  |
| Service Charges & Application | Signed seller NOC form no. | Text | Optional |  |
| Service Charges & Application | Unpaid service charges (AED) | Amount (AED) | Optional |  |
| Service Charges & Application | Service charges paid | Tick box | Optional |  |
| Service Charges & Application | Service charge receipt no. | Text | Optional |  |
| Service Charges & Application | Developer NOC fee (AED) | Amount (AED) | Optional |  |
| Service Charges & Application | Fee approved by | Pick record (User) | Automatic |  |
| Service Charges & Application | Developer portal ref. no. | Text | Optional |  |
| Service Charges & Application | Authorised company sender email | E-mail | Optional |  |
| Service Charges & Application | Submitted by coordinator | Pick record (User) | Automatic |  |
| Service Charges & Application | Submitted at | Date & time | Automatic |  |
| NOC Certificate & Review | Issued NOC certificate no. | Text | Optional |  |
| NOC Certificate & Review | NOC issue date | Date | Optional |  |
| NOC Certificate & Review | NOC validity expiry date | Date | Optional |  |
| NOC Certificate & Review | Uploaded NOC file / link | Text | Optional |  |
| NOC Certificate & Review | Independent reviewer (must differ from submitter) | Pick record (User) | Automatic |  |
| NOC Certificate & Review | Independently verified at | Date & time | Automatic |  |
| NOC Certificate & Review | Subsequent closing stage unlocked | Tick box | Automatic |  |
| NOC Certificate & Review | Developer correspondence & follow-up log | Long text | Optional |  |
| NOC Certificate & Review | Invalid / unverified NOC escalation notes | Long text | Optional |  |

### DLD Transfer — DLD filings

Menu: **Sales & mandates → DLD Transfer** (Step 7 · Title deed transfer) · Address: `/e/dld_filings`

Record rules: numbered automatically (DLD-YY00000) · cannot be deleted (cancel or void instead).

*Every government form and registration for a deal: broker forms, NOC, Oqood, title deed, mortgage registration and Ejari. Record the reference, dates and fees so nothing is missed or left to expire.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Filing | Filing No. | Text | Automatic |  |
| Filing | Type | Choose one | **Required** | Form A – Listing agreement (seller / landlord) · Form B – Buyer / tenant agreement · Form I – Co-broking agreement · Form F – Sale MOU · Developer NOC · Oqood registration (off-plan) · Title deed transfer · Mortgage registration · Ejari registration · Ejari renewal · Other filing |
| Filing | Status | Choose one | Optional | Draft · Prepared · Signed · Submitted · Registered · Rejected · Expired · Cancelled |
| Filing | Reference / registration no. | Text | Optional | Number issued by DLD, the developer or Ejari. Required once registered. |
| Filing | Authority | Text | Optional |  |
| Filing | Deal file | Pick record (Deal File) | Optional |  |
| Filing | Property | Pick record (Property) | Optional |  |
| Filing | Sales contract | Pick record (Sales Contract) | Optional |  |
| Filing | Lease | Pick record (Lease) | Optional |  |
| Filing | Client | Pick record (Customer / Party) | Optional |  |
| Filing | Agent | Pick record (Agent (DLD Registered)) | Optional |  |
| Filing | Due by | Date | Optional |  |
| Filing | Issued on | Date | Optional |  |
| Filing | Valid until | Date | Optional |  |
| Filing | Submitted on | Date | Optional |  |
| Filing | Registered on | Date | Optional |  |
| Filing | Government fee (AED) | Amount (AED) | Optional |  |
| Filing | Fee paid | Tick box | Optional |  |
| Filing | Notes | Long text | Optional |  |

### Sales Tracker — Property Sales & Transfers

Menu: **Sales & mandates → Sales Tracker** (Step 8 · Full sale progress) · Address: `/e/transactions`

Record rules: numbered automatically (TXN-YY00000) · cannot be deleted (cancel or void instead).

*Track property sales and off-plan deals from offer to title deed transfer, including ID checks, developer NOCs, and special cases.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Sale & Parties | Transaction No. | Text | Automatic |  |
| Sale & Parties | Core Department | Choose one | Optional | Sales of Off-Plan Projects · Secondary Projects · Leasing |
| Sale & Parties | Category | Choose one | **Required** | Secondary Sale · Off-Plan Reservation & Sale · Commercial Sale · Leasing Transaction |
| Sale & Parties | Buyer Finance Status | Choose one | Optional | Cash · Mortgaged · Mortgage Pre-Approved · Off-Plan Payment Plan |
| Sale & Parties | Legal UAE Payment Channel | Choose one | Optional | SWK Company Bank Account (AED/FX) · Developer DLD Escrow Account · Manager Cheque (In Seller/Developer Name) · Post-Dated Cheques (PDC to Landlord/Company) · Worldwide Currency Exchange (Licensed UAE Exchange House) · UAE-Permitted Crypto / USDT (VARA-Licensed Gateway to Company Account) |
| Sale & Parties | 3rd-Party Agent (A2A) Involved | Tick box | Optional |  |
| Sale & Parties | 3rd-Party Agency Name | Text | Optional |  |
| Sale & Parties | 3rd-Party Agent Name | Text | Optional |  |
| Sale & Parties | 3rd-Party A2A Commission (AED) | Amount (AED) | Optional |  |
| Sale & Parties | SWK Company 50% Net Share (AED) | Amount (AED) | Optional |  |
| Sale & Parties | Sales Advisor 50% Net Share (AED) | Amount (AED) | Optional |  |
| Sale & Parties | Controlled stage | Choose one | Automatic | Lead Qualified · Viewing Completed · Offer Accepted · KYC & Compliance Cleared · MOU / Form F Signed · Developer NOC Verified · Transfer / Title Deed Verified · Invoiced & Reconciled · Closed · On Hold – Exception Active · Cancelled |
| Sale & Parties | Originating lead | Pick record (Lead) | Optional |  |
| Sale & Parties | Verified property | Pick record (Property) | **Required** |  |
| Sale & Parties | Unit | Pick record (Unit) | Optional |  |
| Sale & Parties | Accepted offer | Pick record (Offer) | Optional |  |
| Sale & Parties | Sales contract (Form F) | Pick record (Sales Contract) | Optional |  |
| Sale & Parties | Deal file | Pick record (Deal File) | Optional |  |
| Sale & Parties | Seller | Pick record (Customer / Party) | Optional |  |
| Sale & Parties | Buyer / Investor | Pick record (Customer / Party) | **Required** |  |
| Sale & Parties | Primary broker | Pick record (Agent (DLD Registered)) | **Required** |  |
| Sale & Parties | Co-broker | Pick record (Agent (DLD Registered)) | Optional |  |
| Sale & Parties | Developer | Pick record (Developer) | Optional |  |
| Payment, ID & NOC Checks | Agreed sale price (AED) | Amount (AED) | **Required** |  |
| Payment, ID & NOC Checks | Security deposit (AED) | Amount (AED) | Optional |  |
| Payment, ID & NOC Checks | Deposit status | Choose one | Optional | Not Collected · Held in Escrow / Trust · Disputed (Frozen) · Released on Transfer · Refunded |
| Payment, ID & NOC Checks | Buyer & seller ID verified | Tick box | Optional |  |
| Payment, ID & NOC Checks | RERA forms signed | Tick box | Optional |  |
| Payment, ID & NOC Checks | Developer NOC request | Pick record (Developer NOC Request) | Optional |  |
| Payment, ID & NOC Checks | Developer NOC independently verified | Tick box | Automatic |  |
| Payment, ID & NOC Checks | Title Deed / Oqood no. | Text | Optional |  |
| Payment, ID & NOC Checks | External transfer evidence verified | Tick box | Automatic |  |
| Payment, ID & NOC Checks | Transfer verified by | Pick record (User) | Automatic |  |
| Payment, ID & NOC Checks | Commission tax invoice | Pick record (Invoice) | Optional |  |
| Payment, ID & NOC Checks | Reconciled bank receipt | Pick record (Receipt) | Optional |  |
| Payment, ID & NOC Checks | Invoiced & bank receipt reconciled | Tick box | Automatic |  |
| Special Cases & Off-Plan | Special case / hold reason | Choose one | Optional | None · 1. Buyer fails mortgage approval · 2. Seller has an outstanding mortgage · 3. Deal involves a power of attorney (POA) · 4. One party is a company with multiple beneficial owners · 5. Buyer requests a change in property after signing · 6. Transaction is delayed by documentation · 7. Seller or buyer attempts to cancel · 8. Booking deposit is disputed · 9. Two brokers claim the same transaction · 10. The deal is partially completed but cannot proceed · 11. A client alleges misrepresentation |
| Special Cases & Off-Plan | How this issue is being solved | Long text | Optional |  |
| Special Cases & Off-Plan | Exception resolved & cleared | Tick box | Optional |  |
| Special Cases & Off-Plan | Power of Attorney checked | Tick box | Optional |  |
| Special Cases & Off-Plan | Company owners (25%+) checked | Tick box | Optional |  |
| Special Cases & Off-Plan | Developer booking / SPA no. | Text | Optional |  |
| Special Cases & Off-Plan | Developer SPA signed | Tick box | Optional |  |
| Special Cases & Off-Plan | Projected commission (AED) | Amount (AED) | Optional |  |
| Special Cases & Off-Plan | Cash collected commission (AED) | Amount (AED) | Automatic |  |
| Special Cases & Off-Plan | Conveyancing & audit notes | Long text | Optional |  |

### Deal Folders — Deal Files

Menu: **Sales & mandates → Deal Folders** (Step 9 · Closing & billing file) · Address: `/e/jobs`

Record rules: numbered automatically (DL-YY00000) · can be printed / e-mailed as PDF.

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Deal | Deal No. | Text | Automatic |  |
| Deal | Deal Name | Text | **Required** |  |
| Deal | Core Department | Choose one | Optional | Sales of Off-Plan Projects · Secondary Projects · Leasing |
| Deal | Deal Type | Choose one | **Required** | Sale · Lease · Off-Plan Sale · Commercial Lease · Staff Housing · Bulk Deal |
| Deal | Status | Choose one | Optional | Lead · Active Mandate · Offer Submitted · Offer Accepted · Contract Signed · DLD Submitted · DLD Approved · Title Deed Issued · Completed · Cancelled · On Hold |
| Deal | Branch | Pick record (Branch) | **Required** |  |
| Deal | Property | Pick record (Property) | Optional |  |
| Deal | Unit | Pick record (Unit) | Optional |  |
| Deal | Client (Buyer/Tenant) | Pick record (Customer / Party) | Optional |  |
| Deal | Owner/Landlord | Pick record (Customer / Party) | Optional |  |
| Deal | Listing Agent | Pick record (Agent (DLD Registered)) | Optional |  |
| Deal | Buyer Agent | Pick record (Agent (DLD Registered)) | Optional |  |
| Deal | 3rd-Party Agent (A2A) Involved | Tick box | Optional |  |
| Deal | 3rd-Party Agency Name | Text | Optional |  |
| Deal | 3rd-Party Agent Name | Text | Optional |  |
| Deal | 3rd-Party A2A Share % | % | Optional |  |
| Deal | 3rd-Party A2A Commission (AED) | Amount (AED) | Optional |  |
| Deal | SWK Company 50% Net Share (AED) | Amount (AED) | Automatic |  |
| Deal | Sales Advisor 50% Net Share (AED) | Amount (AED) | Automatic |  |
| Deal | Buyer Finance Status | Choose one | Optional | Cash · Mortgaged · Mortgage Pre-Approved · Off-Plan Payment Plan · Annual / Multi-Cheque Lease |
| Deal | Legal UAE Payment Channel | Choose one | Optional | SWK Company Bank Account (AED/FX) · Developer DLD Escrow Account · Manager Cheque (In Seller/Developer Name) · Post-Dated Cheques (PDC to Landlord/Company) · Worldwide Currency Exchange (Licensed UAE Exchange House) · UAE-Permitted Crypto / USDT (VARA-Licensed Gateway to Company Account) |
| Deal | Deal Date | Date | **Required** |  |
| Deal | Deal Value | Amount (AED) | Optional |  |
| Deal | Commission % | % | Optional |  |
| Deal | Commission (AED) | Amount (AED) | Automatic |  |
| Deal | Target Close Date | Date | Optional |  |
| Deal | Actual Close Date | Date | Optional |  |
| Pipeline | Stage | Choose one | Optional | Inquiry · Viewing · Offer · Negotiation · Contract · DLD Process · Handover · Closed |
| Pipeline | Revenue (AED) | Amount (AED) | Automatic |  |
| Pipeline | Cost (AED) | Amount (AED) | Automatic |  |
| Pipeline | Profit (AED) | Amount (AED) | Automatic |  |
| Pipeline | Sales Contract | Pick record (Sales Contract) | Optional |  |
| Pipeline | Lease | Pick record (Lease) | Optional |  |
| Pipeline | Mandate | Pick record (Mandate) | Optional |  |
| Pipeline | Internal Notes | Long text | Optional |  |

Inside this form: a **Charges** table (add one line per item).

Inside this form: a **Timeline** table (add one line per item).

## Leasing & management

### Leases & Ejari — Leases

Menu: **Leasing & management → Leases & Ejari** (Step 1 · Tenancy contracts) · Address: `/e/leases`

Record rules: numbered automatically (LSE-YY00000) · cannot be deleted (cancel or void instead) · can be printed / e-mailed as PDF.

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Lease | Lease No. | Text | Automatic |  |
| Lease | Unit | Pick record (Unit) | **Required** |  |
| Lease | Unit | Text | Automatic |  |
| Lease | Property | Pick record (Property) | Optional |  |
| Lease | Landlord | Pick record (Customer / Party) | **Required** |  |
| Lease | Tenant | Pick record (Customer / Party) | **Required** |  |
| Lease | Leasing Agent | Pick record (Agent (DLD Registered)) | Optional |  |
| Lease | Sourced via 3rd-Party Agent (A2A) | Tick box | Optional |  |
| Lease | 3rd-Party Agency Name | Text | Optional |  |
| Lease | 3rd-Party Agent Name | Text | Optional |  |
| Lease | 3rd-Party Agent RERA BRN | Text | Optional |  |
| Lease | 3rd-Party A2A Commission % | % | Optional |  |
| Lease | 3rd-Party A2A Commission (AED) | Amount (AED) | Optional |  |
| Lease | SWK Company 50% Net Share (AED) | Amount (AED) | Automatic |  |
| Lease | Sales Advisor 50% Net Share (AED) | Amount (AED) | Automatic |  |
| Lease | Promoted Portal | Choose one | Optional | Bayut · Dubizzle · Property Finder · Direct Website · 3rd-Party Agent A2A Network |
| Lease | Type | Choose one | **Required** | Residential · Commercial · Retail · Office · Industrial · Warehouse · Showroom · Land · Staff Accommodation |
| Lease | Status | Choose one | Optional | Draft · Pending Ejari · Ejari Registered · Active · Notice Served · Expiring · Expired · Terminated · Renewed · Disputed |
| Lease | Start Date | Date | **Required** |  |
| Lease | End Date | Date | **Required** |  |
| Lease | Notice Date | Date | Optional |  |
| Lease | Term (months) | Whole number | Automatic |  |
| Lease | Auto-Renew | Tick box | Optional |  |
| Lease | Renewal Notice (days) | Whole number | Optional |  |
| Lease | Annual Rent | Amount (AED) | **Required** |  |
| Lease | RERA index average rent | Amount (AED) | Optional | Average rent for this unit type and area from the RERA rental index. Used to cap a renewal increase. |
| Lease | Allowed increase % | Number | Automatic |  |
| Lease | Maximum renewal rent | Amount (AED) | Automatic |  |
| Lease | Rent-change notice sent on | Date | Optional |  |
| Lease | Notice deadline | Date | Automatic |  |
| Lease | Monthly Rent | Amount (AED) | Automatic |  |
| Lease | Payment Frequency | Choose one | Optional | Monthly · Quarterly · Semi-Annual · Annual · Post-Dated Cheques · Custom |
| Lease | Number of Cheques | Whole number | Optional |  |
| Lease | Security Deposit | Amount (AED) | Optional |  |
| Lease | Agency Fee | Amount (AED) | Optional |  |
| Lease | Agency Fee % | % | Optional |  |
| Lease | Deposit Escrow | Pick record (Escrow Account) | Optional |  |
| Lease | Ejari Number | Text | Optional |  |
| Lease | Ejari Registration Date | Date | Optional |  |
| Lease | Ejari Certificate | Text | Optional |  |
| Lease | VAT Applicable | Tick box | Optional |  |
| Lease | VAT Treatment | Choose one | Optional | Standard 5% · Zero-Rated · Exempt · Out of Scope |
| Lease | Annual Service Charge | Amount (AED) | Optional |  |
| Lease | SC Paid By | Amount (AED) | Optional |  |
| Lease | Special Clauses | Long text | Optional |  |
| Lease | Landlord Obligations | Long text | Optional |  |
| Lease | Tenant Obligations | Long text | Optional |  |
| Lease | Prepared By | Pick record (User) | Optional |  |
| Lease | Signed Date | Date | Optional |  |
| Lease | Witness 1 | Pick record (Customer / Party) | Optional |  |
| Lease | Witness 2 | Pick record (Customer / Party) | Optional |  |
| Lease | Internal Notes | Long text | Optional |  |

Inside this form: a **Rent Schedule** table (add one line per item).

Inside this form: a **Service Charges** table (add one line per item).

### Rent Schedules — Rent Schedules

Menu: **Leasing & management → Rent Schedules** (Step 2 · Rent payment dates) · Address: `/e/rent_schedules`

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
|  | Lease | Text | Automatic |  |
|  | Due Date | Date | **Required** |  |
|  | Amount Due | Amount (AED) | **Required** |  |
|  | VAT | Amount (AED) | Optional |  |
|  | Total Due | Amount (AED) | Automatic |  |
|  | Status | Choose one | Optional | Pending · Partial · Paid · Overdue · Waived · Disputed |
|  | Paid Date | Date | Optional |  |
|  | Paid Amount | Amount (AED) | Optional |  |
|  | Receipt No. | Text | Optional |  |
|  | Receipt | Pick record (Receipt) | Optional |  |
|  | Payment Method | Text | Optional |  |
|  | Cheque No. | Text | Optional |  |
|  | Cheque Date | Date | Optional |  |
|  | Bank | Pick record (Customer / Party) | Optional |  |
|  | Post-Dated Cheque | Tick box | Optional |  |
|  | Notes | Long text | Optional |  |

### Rent Receipts — Rent Receipts

Menu: **Leasing & management → Rent Receipts** (Step 4 · Collected rent) · Address: `/e/rent_receipts`

Record rules: numbered automatically (RCT-YY000000) · cannot be deleted (cancel or void instead) · can be printed / e-mailed as PDF.

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Receipt | Receipt No. | Text | Automatic |  |
| Receipt | Lease | Pick record (Lease) | **Required** |  |
| Receipt | Schedule Item | Pick record (Rent Schedule) | Optional |  |
| Receipt | Tenant | Pick record (Customer / Party) | **Required** |  |
| Receipt | Date | Date | **Required** |  |
| Receipt | Amount | Amount (AED) | **Required** |  |
| Receipt | VAT | Amount (AED) | Optional |  |
| Receipt | Total | Amount (AED) | Automatic |  |
| Receipt | Method | Choose one | Optional | SWK Company Bank Account (AED/FX) · Post-Dated Cheques (PDC) · Manager's Cheque · Worldwide Currency Exchange (Licensed UAE Exchange House) · UAE-Permitted Crypto / USDT (VARA-Licensed Gateway) · Bank Transfer · Cheque · Cash · Card · PDC · Online |
| Receipt | Cheque No. | Text | Optional |  |
| Receipt | Cheque Date | Date | Optional |  |
| Receipt | Bank | Pick record (Customer / Party) | Optional |  |
| Receipt | Reference | Text | Optional |  |
| Receipt | Status | Choose one | Optional | Issued · Cleared · Bounced · Cancelled · Refunded |
| Receipt | PDC Replacement | Tick box | Optional |  |
| Receipt | Notes | Long text | Optional |  |

### Inspections — Inspections

Menu: **Leasing & management → Inspections** (Step 5 · Move-in & move-out) · Address: `/e/inspections`

Record rules: numbered automatically (INS-YY00000).

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Inspection | Inspection No. | Text | Automatic |  |
| Inspection | Lease | Pick record (Lease) | Optional |  |
| Inspection | Unit | Pick record (Unit) | **Required** |  |
| Inspection | Unit | Text | Automatic |  |
| Inspection | Type | Choose one | **Required** | Move-In · Move-Out · Periodic · Snagging · Compliance · Insurance |
| Inspection | Status | Choose one | Optional | Scheduled · In Progress · Completed · Cancelled · Requires Action |
| Inspection | Scheduled At | Date & time | **Required** |  |
| Inspection | Inspector | Pick record (Employee) | Optional |  |
| Inspection | Tenant Present | Pick record (Customer / Party) | Optional |  |
| Inspection | Checklist | Long text | Optional |  |
| Inspection | Findings | Long text | Optional |  |
| Inspection | Action Required | Long text | Optional |  |
| Inspection | Checklist template | Pick record (Inspection Template) | Optional |  |
| Inspection | Signed by | Text | Optional |  |
| Inspection | Signed at | Date & time | Automatic |  |
| Inspection | Completed Date | Date | Optional |  |
| Inspection | Estimated Rectification Cost | Amount (AED) | Optional |  |
| Inspection | Notes | Long text | Optional |  |

### Handovers — Property Handovers

Menu: **Leasing & management → Handovers** (Step 6 · Keys & access cards) · Address: `/e/handovers`

Record rules: numbered automatically (HDO-YY00000).

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Handover | Handover No. | Text | Automatic |  |
| Handover | Unit | Pick record (Unit) | **Required** |  |
| Handover | Unit | Text | Automatic |  |
| Handover | Lease | Pick record (Lease) | Optional |  |
| Handover | Sales Contract | Pick record (Sales Contract) | Optional |  |
| Handover | Type | Choose one | **Required** | Move-In · Move-Out · Snagging Inspection · Pre-Handover · Post-Handover |
| Handover | Status | Choose one | Optional | Scheduled · In Progress · Completed · Cancelled · Requires Re-Inspection |
| Handover | Scheduled At | Date & time | **Required** |  |
| Handover | Inspector | Pick record (Employee) | Optional |  |
| Handover | Tenant Present | Pick record (Customer / Party) | Optional |  |
| Handover | Landlord Present | Pick record (Customer / Party) | Optional |  |
| Handover | Agent | Pick record (Agent (DLD Registered)) | Optional |  |
| Handover | Checklist | Long text | Optional |  |
| Handover | Condition Report | Long text | Optional |  |
| Handover | Meter Readings (DEWA / Gas / Chiller) | Long text | Optional |  |
| Handover | Keys / Access Cards Handed Over | Long text | Optional |  |
| Handover | Defects Noted | Long text | Optional |  |
| Handover | Estimated Rectification Cost | Amount (AED) | Optional |  |
| Handover | Completed Date | Date | Optional |  |
| Handover | Notes | Long text | Optional |  |

### Maintenance — Maintenance Requests

Menu: **Leasing & management → Maintenance** (Step 7 · Repairs & work orders) · Address: `/e/maintenance`

Record rules: numbered automatically (MNT-YY00000).

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Request | Request No. | Text | Automatic |  |
| Request | Lease | Pick record (Lease) | Optional |  |
| Request | Unit | Pick record (Unit) | **Required** |  |
| Request | Unit | Text | Automatic |  |
| Request | Reported By (Tenant) | Pick record (Customer / Party) | Optional |  |
| Request | Landlord | Pick record (Customer / Party) | Optional |  |
| Request | Category | Choose one | **Required** | Plumbing · Electrical · HVAC · Appliances · Carpentry · Painting · Cleaning · Pest Control · Structural · Security · Common Area · Other |
| Request | Priority | Choose one | Optional | Low · Medium · High · Urgent · Emergency |
| Request | Status | Choose one | Optional | Reported · Scheduled · In Progress · Awaiting Parts · Awaiting Approval · Completed · Cancelled · On Hold |
| Request | Description | Long text | **Required** |  |
| Request | Location in Unit | Long text | Optional |  |
| Request | Reported At | Date & time | Optional |  |
| Request | Scheduled For | Date & time | Optional |  |
| Request | Assigned Vendor | Pick record (Customer / Party) | Optional |  |
| Request | Technician | Pick record (Employee) | Optional |  |
| Request | Estimated Cost | Amount (AED) | Optional |  |
| Request | Actual Cost | Amount (AED) | Optional |  |
| Request | Cost Responsibility | Choose one | Optional | Landlord · Tenant · Shared · Warranty · Insurance · Service Charge |
| Request | Completed Date | Date | Optional |  |
| Request | Resolution | Long text | Optional |  |
| Request | Tenant Feedback | Long text | Optional |  |
| Request | Requires Approval | Tick box | Optional |  |
| Request | Landlord approval | Choose one | Optional | Not needed · Awaiting · Approved · Declined |
| Request | Approved By | Pick record (User) | Optional |  |
| Request | Approved At | Date & time | Optional |  |
| Request | Internal Notes | Long text | Optional |  |

### Service Charges — Service Charges

Menu: **Leasing & management → Service Charges** (Step 8 · Building fees) · Address: `/e/service_charges`

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
|  | Lease | Pick record (Lease) | **Required** |  |
|  | Lease | Text | Automatic |  |
|  | Period From | Date | **Required** |  |
|  | Period To | Date | **Required** |  |
|  | Amount | Amount (AED) | **Required** |  |
|  | VAT | Amount (AED) | Optional |  |
|  | Total | Amount (AED) | Automatic |  |
|  | Status | Choose one | Optional | Pending · Partial · Paid · Overdue · Waived · Disputed |
|  | Due Date | Date | Optional |  |
|  | Paid Date | Date | Optional |  |
|  | Paid By | Pick record (Customer / Party) | Optional |  |
|  | Receipt | Pick record (Receipt) | Optional |  |
|  | Breakdown | Long text | Optional |  |
|  | Notes | Long text | Optional |  |

## Landlords

### Statements — Owner Statements

Menu: **Landlords → Statements** (Step 2 · Payout statements) · Address: `/e/owner_statements`

Record rules: numbered automatically (OST-YY00000) · cannot be deleted (cancel or void instead) · can be printed / e-mailed as PDF.

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Statement | Statement No. | Text | Automatic |  |
| Statement | Owner | Pick record (Customer / Party) | **Required** |  |
| Statement | Owner | Text | Automatic |  |
| Statement | Period From | Date | **Required** |  |
| Statement | Period To | Date | **Required** |  |
| Statement | Status | Choose one | Optional | Draft · Generated · Sent · Paid |
| Statement | Opening Balance | Amount (AED) | Optional |  |
| Statement | Rental Income | Amount (AED) | Optional |  |
| Statement | Service Charges Collected | Amount (AED) | Optional |  |
| Statement | Commission Deducted | Amount (AED) | Optional |  |
| Statement | Maintenance Deducted | Amount (AED) | Optional |  |
| Statement | Other Deductions | Amount (AED) | Optional |  |
| Statement | Closing Balance | Amount (AED) | Optional |  |
| Statement | Generated Date | Date | Optional |  |
| Statement | Sent Date | Date | Optional |  |
| Statement | Generated By | Pick record (User) | Optional |  |
| Statement | Notes | Long text | Optional |  |

## Accounting

### Invoices — Invoices & notes

Menu: **Accounting → Invoices** (Step 1 · Client tax invoices) · Address: `/e/invoices`

Record rules: numbered automatically ({prefix}YY00000) · cannot be deleted (cancel or void instead) · can be printed / e-mailed as PDF.

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Document | Document no. | Text | Automatic |  |
| Document | Document type | Choose one | **Required** | Tax Invoice · Proforma Invoice · Debit Note · Credit Note |
| Document | Customer | Pick record (Customer / Party) | **Required** |  |
| Document | Deal File | Pick record (Deal File) | Optional |  |
| Document | Property | Pick record (Property) | Optional |  |
| Document | Unit | Pick record (Unit) | Optional |  |
| Document | Lease | Pick record (Lease) | Optional |  |
| Document | Invoice date | Date | **Required** |  |
| Document | Date of supply | Date | Optional | If different from the invoice date. A tax invoice must be issued within 14 days of supply. |
| Document | Due date | Date | Optional |  |
| Document | Payment term | Pick record (Payment term) | Optional |  |
| Document | Branch | Pick record (Branch) | Optional |  |
| Document | Currency | Choose one | **Required** | AED · USD · EUR · GBP · SAR · INR · CNY · ZAR · USDT |
| Document | Exchange rate to AED | Number | Optional |  |
| Document | Customer reference / PO | Text | Optional |  |
| Document | Reason for credit / debit note | Text | Optional | Required on credit notes |
| Document | Against invoice | Pick record (Invoice) | Optional | For credit / debit notes |
| Document | Status | Choose one | Automatic | Draft · Posted · Partially paid · Paid · Void |
| Document | Subtotal | Amount (AED) | Automatic |  |
| Document | VAT | Amount (AED) | Automatic |  |
| Document | Total | Amount (AED) | Automatic |  |
| Document | Paid | Amount (AED) | Automatic |  |
| Document | Balance | Amount (AED) | Automatic |  |
| Document | Total (AED) | Amount (AED) | Automatic |  |
| Document | Remit to bank account | Pick record (Bank account) | Optional |  |
| Document | Journal | Pick record (Journal entry) | Automatic |  |
| Document | Void reason | Text | Automatic |  |
| Document | E-invoice | Choose one | Automatic | Not sent · Submitted · Accepted · Rejected |
| Document | E-invoice reference | Text | Automatic |  |
| Document | E-invoice sent at | Date & time | Automatic |  |
| Document | Notes to customer | Long text | Optional |  |
| Document | Terms | Long text | Optional |  |
| Numbering & rounding | Own invoice number | Text | Optional | Optional. Type the number exactly as it should print (for example DXB/INV/103A). Leave blank to use the next number in the series when the invoice is posted. |
| Numbering & rounding | Rounding | Choose one | Optional | No rounding · Round total to whole amount |
| Numbering & rounding | Rounding adjustment | Amount (AED) | Automatic |  |

Inside this form: a **Invoice lines** table (add one line per item).

### Receipts — Customer receipts

Menu: **Accounting → Receipts** (Step 2 · Money received) · Address: `/e/receipts`

Record rules: numbered automatically (RCTYY00000) · cannot be deleted (cancel or void instead) · can be printed / e-mailed as PDF.

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Receipt | Receipt no. | Text | Automatic |  |
| Receipt | Customer | Pick record (Customer / Party) | **Required** |  |
| Receipt | Date | Date | **Required** |  |
| Receipt | Method | Choose one | Optional | SWK Company Bank Account (AED/FX) · Developer DLD Escrow Account · Manager's Cheque · Post-Dated Cheques (PDC) · Worldwide Currency Exchange (Licensed UAE Exchange House) · UAE-Permitted Crypto / USDT (VARA-Licensed Gateway) · Bank transfer · Cheque · Cash · Card · Online / gateway · Set-off |
| Receipt | Deposit to | Pick record (Bank account) | **Required** |  |
| Receipt | Currency | Choose one | Optional | AED · USD · EUR · GBP · SAR · INR · CNY · ZAR · USDT |
| Receipt | Exchange rate to AED | Number | Optional |  |
| Receipt | Amount received | Amount (AED) | **Required** |  |
| Receipt | Allocated | Amount (AED) | Automatic |  |
| Receipt | Unallocated (on account) | Amount (AED) | Automatic |  |
| Receipt | Reference / cheque no. | Text | Optional |  |
| Receipt | Status | Choose one | Automatic | Draft · Posted · Void |
| Receipt | Journal | Pick record (Journal entry) | Automatic |  |
| Receipt | Notes | Long text | Optional |  |

Inside this form: a **Allocated to invoices** table (add one line per item).

### Commissions — Agent Commissions

Menu: **Accounting → Commissions** (Step 3 · Agent deal shares) · Address: `/e/agent_commissions`

Record rules: numbered automatically (COM-YY00000) · cannot be deleted (cancel or void instead).

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Commission | Commission No. | Text | Automatic |  |
| Commission | Agent | Pick record (Agent (DLD Registered)) | **Required** |  |
| Commission | Agent | Text | Automatic |  |
| Commission | Sales Contract | Pick record (Sales Contract) | Optional |  |
| Commission | Lease | Pick record (Lease) | Optional |  |
| Commission | Mandate | Pick record (Mandate) | Optional |  |
| Commission | Source | Choose one | **Required** | Sale · Lease · Off-Plan Sale · Renewal · Referral |
| Commission | Gross Commission (Excl. VAT) | Amount (AED) | **Required** |  |
| Commission | Less: 3rd-Party Agent (A2A) Share | Amount (AED) | Optional |  |
| Commission | Company Net Commission Pool | Amount (AED) | Optional |  |
| Commission | SWK Company 50% Share | Amount (AED) | Optional |  |
| Commission | Sales Advisor 50% Share | Amount (AED) | Optional |  |
| Commission | Agent Split % | % | Optional |  |
| Commission | Transaction Date | Date | Optional |  |
| Commission | Due Date | Date | Optional |  |
| Commission | Status | Choose one | Optional | Pending · Approved · Paid · Disputed · Cancelled |
| Commission | Holdback % of agent share | % | Optional |  |
| Commission | Held back | Amount (AED) | Automatic |  |
| Commission | Holdback release date | Date | Optional |  |
| Commission | Holdback released | Tick box | Optional |  |
| Commission | Paid Date | Date | Optional |  |
| Commission | Payment Record | Pick record (Payment) | Optional |  |
| Commission | Approved By | Pick record (User) | Optional |  |
| Commission | Approved Date | Date | Optional |  |
| Commission | Notes | Long text | Optional |  |

### Agent Payouts — Commission Payouts

Menu: **Accounting → Agent Payouts** (Step 4 · Approved payouts) · Address: `/e/commission_entitlements`

Record rules: numbered automatically (CEN-YY00000) · cannot be deleted (cancel or void instead).

*Track earned, collected, and paid agent commissions clearly with three-step payout sign-off and bank change protection.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Agent & Deal Details | Entitlement No. | Text | Automatic |  |
| Agent & Deal Details | Enterprise transaction | Pick record (Property Sale & Transfer) | Optional |  |
| Agent & Deal Details | Sales contract | Pick record (Sales Contract) | Optional |  |
| Agent & Deal Details | Deal file | Pick record (Deal File) | Optional |  |
| Agent & Deal Details | Broker / Payee | Pick record (Agent (DLD Registered)) | **Required** |  |
| Agent & Deal Details | Employee record | Pick record (Employee) | Optional |  |
| Agent & Deal Details | Developer | Pick record (Developer) | Optional |  |
| Agent & Deal Details | Commission agreement version | Text | Optional |  |
| Agent & Deal Details | Deal type | Choose one | **Required** | Secondary Sale · Off-Plan Developer · Leasing · Co-Brokerage Split · Referral |
| Commission Amounts | Gross brokerage commission (AED) | Amount (AED) | **Required** |  |
| Commission Amounts | Less: 3rd-Party Agent (A2A) Share (AED) | Amount (AED) | Optional |  |
| Commission Amounts | Less: External Referral Fee (AED) | Amount (AED) | Optional |  |
| Commission Amounts | Company Net Commission Pool (AED) | Amount (AED) | Optional |  |
| Commission Amounts | SWK Company 50% Share (AED) | Amount (AED) | Optional |  |
| Commission Amounts | Sales Advisor 50% Share (AED) | Amount (AED) | Optional |  |
| Commission Amounts | Agent split % | % | **Required** |  |
| Commission Amounts | 1. Base entitlement (AED) | Amount (AED) | Optional |  |
| Commission Amounts | 2. Earned amount (AED) | Amount (AED) | Optional |  |
| Commission Amounts | 3. Invoiced amount (AED) | Amount (AED) | Optional |  |
| Commission Amounts | 4. Cash collected (AED) | Amount (AED) | Optional |  |
| Commission Amounts | Developer adjustment (AED) | Amount (AED) | Optional |  |
| Commission Amounts | 5. Net payable (AED) | Amount (AED) | Optional |  |
| Commission Amounts | 6. Paid & reconciled (AED) | Amount (AED) | Automatic |  |
| Commission Amounts | Lifecycle status | Choose one | Automatic | Forecast / Projected · Earned · Invoiced · Collected · Eligible for Payout · Approved for Payout · Paid & Reconciled · Frozen – Open Dispute · Frozen – IBAN Swap Verification · Clawback Adjusted |
| Payout & Bank Checks | Linked tax invoice | Pick record (Invoice) | Optional |  |
| Payout & Bank Checks | Verified bank receipt | Pick record (Receipt) | Optional |  |
| Payout & Bank Checks | Executed payout record | Pick record (Payment) | Automatic |  |
| Payout & Bank Checks | Lead / co-broker dispute status | Choose one | Optional | No Dispute · Open Dispute (Payout Blocked) · Under Management Arbitration · Resolved |
| Payout & Bank Checks | Dispute & arbitration evidence | Long text | Optional |  |
| Payout & Bank Checks | Payee IBAN | Text | Optional |  |
| Payout & Bank Checks | IBAN changed recently (requires 2-person approval) | Tick box | Automatic |  |
| Payout & Bank Checks | Phone callback ref. no. | Text | Optional |  |
| Payout & Bank Checks | IBAN verifier 1 (HR/Finance) | Pick record (User) | Automatic |  |
| Payout & Bank Checks | IBAN verifier 2 (Independent Approver) | Pick record (User) | Automatic |  |
| Payout & Bank Checks | Clawback / cancellation audit reason | Long text | Optional |  |
| Payout & Bank Checks | 1. Payout initiator (Finance) | Pick record (User) | Automatic |  |
| Payout & Bank Checks | 2. Independent approver | Pick record (User) | Automatic |  |
| Payout & Bank Checks | Approved at | Date & time | Automatic |  |
| Payout & Bank Checks | 3. Treasury batch executor (Payer) | Pick record (User) | Automatic |  |
| Payout & Bank Checks | Executed at | Date & time | Automatic |  |
| Payout & Bank Checks | Bank statement reconciled | Tick box | Automatic |  |

### Supplier Bills — Vendor bills

Menu: **Accounting → Supplier Bills** (Step 5 · Incoming bills) · Address: `/e/bills`

Record rules: numbered automatically (BILLYY00000) · cannot be deleted (cancel or void instead).

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Bill | Bill no. | Text | Automatic |  |
| Bill | Vendor | Pick record (Customer / Party) | **Required** |  |
| Bill | Vendor invoice no. | Text | **Required** |  |
| Bill | Deal File | Pick record (Deal File) | Optional |  |
| Bill | Property | Pick record (Property) | Optional |  |
| Bill | Unit | Pick record (Unit) | Optional |  |
| Bill | Lease | Pick record (Lease) | Optional |  |
| Bill | Bill date | Date | **Required** |  |
| Bill | Due date | Date | Optional |  |
| Bill | Payment term | Pick record (Payment term) | Optional |  |
| Bill | Currency | Choose one | **Required** | AED · USD · EUR · GBP · SAR · INR · CNY · ZAR · USDT |
| Bill | Exchange rate to AED | Number | Optional |  |
| Bill | Branch | Pick record (Branch) | Optional |  |
| Bill | Status | Choose one | Automatic | Draft · Posted · Partially paid · Paid · Void |
| Bill | Subtotal | Amount (AED) | Automatic |  |
| Bill | VAT | Amount (AED) | Automatic |  |
| Bill | Total | Amount (AED) | Automatic |  |
| Bill | Paid | Amount (AED) | Automatic |  |
| Bill | Balance | Amount (AED) | Automatic |  |
| Bill | Total (AED) | Amount (AED) | Automatic |  |
| Bill | Approval | Choose one | Automatic | Not required · Pending · Approved · Rejected |
| Bill | Journal | Pick record (Journal entry) | Automatic |  |
| Bill | Void reason | Text | Automatic |  |
| Bill | Notes | Long text | Optional |  |

Inside this form: a **Bill lines** table (add one line per item).

### Payments — Vendor payments

Menu: **Accounting → Payments** (Step 6 · Outgoing transfers) · Address: `/e/payments`

Record rules: numbered automatically (PAYYY00000) · cannot be deleted (cancel or void instead) · can be printed / e-mailed as PDF.

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Payment | Payment no. | Text | Automatic |  |
| Payment | Vendor | Pick record (Customer / Party) | **Required** |  |
| Payment | Date | Date | **Required** |  |
| Payment | Method | Choose one | Optional | SWK Company Bank Account (AED/FX) · Developer DLD Escrow Account · Manager's Cheque · Post-Dated Cheques (PDC) · Worldwide Currency Exchange (Licensed UAE Exchange House) · UAE-Permitted Crypto / USDT (VARA-Licensed Gateway) · Bank transfer · Cheque · Cash · Card · Online / gateway · Set-off |
| Payment | Paid from | Pick record (Bank account) | **Required** |  |
| Payment | Currency | Choose one | Optional | AED · USD · EUR · GBP · SAR · INR · CNY · ZAR · USDT |
| Payment | Exchange rate to AED | Number | Optional |  |
| Payment | Amount paid | Amount (AED) | **Required** |  |
| Payment | Allocated | Amount (AED) | Automatic |  |
| Payment | Unallocated (advance) | Amount (AED) | Automatic |  |
| Payment | Reference / cheque no. | Text | Optional |  |
| Payment | Status | Choose one | Automatic | Draft · Posted · Void |
| Payment | Approval | Choose one | Automatic | Not required · Pending · Approved · Rejected |
| Payment | Journal | Pick record (Journal entry) | Automatic |  |
| Payment | Notes | Long text | Optional |  |

Inside this form: a **Allocated to bills** table (add one line per item).

### Purchases — Office Purchases & Equipment

Menu: **Accounting → Purchases** (Step 7 · Office supplies) · Address: `/e/procurement_requests`

Record rules: numbered automatically (PRC-YY00000).

*Track office purchases, staff laptops and phones, company cars, access cards, and portal subscriptions.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Request & Item Details | Request No. | Text | Automatic |  |
| Request & Item Details | Item / service description | Text | **Required** |  |
| Request & Item Details | Category | Choose one | **Required** | Purchase Requisition / PO · Portal / SaaS Subscription · Laptop / Phone / SIM Assignment · Company Vehicle & Maintenance · Office Access Card / Key · Office Lease / DEWA / Internet · Facilities & Cleaning / Security · Corporate Travel & Petty Cash |
| Request & Item Details | Cost centre / department | Pick record (Department) | Optional |  |
| Request & Item Details | Requested by | Pick record (User) | Optional |  |
| Request & Item Details | Approved supplier / vendor | Pick record (Customer / Party) | Optional |  |
| Request & Item Details | Assigned staff member | Pick record (Employee) | Optional |  |
| Request & Item Details | Amount (AED) | Amount (AED) | **Required** |  |
| Request & Item Details | Renewal date | Date | Optional |  |
| Request & Item Details | Serial / plate / card no. | Text | Optional |  |
| Request & Item Details | Comparative quotation references | Text | Optional |  |
| Request & Item Details | Status | Choose one | Optional | Draft · Submitted · Approved · Ordered / Assigned · Active / In Use · Returned / Recovered · Closed · Rejected |
| Request & Item Details | Approved by | Pick record (User) | Automatic |  |
| Request & Item Details | Approved at | Date & time | Automatic |  |
| Request & Item Details | Supplier invoice 3-way matched | Tick box | Optional |  |
| Request & Item Details | Specifications & handover notes | Long text | Optional |  |

### Bank Matching — Bank reconciliation

Menu: **Accounting → Bank Matching** (Step 8 · Bank reconciliation) · Address: `/e/bank_transactions`

*Import bank statement lines (CSV) and match them to posted receipts and payments.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Statement line | Bank account | Pick record (Bank account) | **Required** |  |
| Statement line | Date | Date | **Required** |  |
| Statement line | Description | Text | Optional |  |
| Statement line | Reference | Text | Optional |  |
| Statement line | Withdrawal | Amount (AED) | Optional |  |
| Statement line | Deposit | Amount (AED) | Optional |  |
| Statement line | Status | Choose one | Optional | Unreconciled · Reconciled |
| Statement line | Matched to | Text | Optional | e.g. RCT2600012 |
| Statement line | Reconciled on | Date | Optional |  |

## Compliance

### KYC Checks — KYC checks

Menu: **Compliance → KYC Checks** (Step 1 · Client ID & screening) · Address: `/e/kyc_checks`

*The due-diligence file for each client: one record per check, with the result, date and evidence. Use “Create KYC checklist” on a client to add the standard checks.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Check | Client | Pick record (Customer / Party) | **Required** |  |
| Check | Check | Choose one | **Required** | Identity document (Emirates ID / passport) · Residence visa or entry stamp · Proof of address · Trade licence (companies) · Beneficial owner identification (25%+) · Source of funds · Sanctions screening · PEP screening · Adverse media screening · Other |
| Check | Result | Choose one | Optional | Pending · Pass · Fail · Not applicable |
| Check | Checked on | Date | Optional |  |
| Check | Valid until | Date | Optional |  |
| Check | Checked by | Pick record (User) | Optional |  |
| Check | Evidence / document reference | Text | Optional |  |
| Check | Notes | Long text | Optional |  |

### Broker Cards — Agent RERA Cards & Approvals

Menu: **Compliance → Broker Cards** (Step 3 · Agent RERA licences) · Address: `/e/agent_authorisations`

Record rules: numbered automatically (AUT-YY00000) · cannot be deleted (cancel or void instead).

*Check work visas, RERA Broker Cards (BRN), exam pass dates, and AML training before activating an agent.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Broker Credentials | Authorisation No. | Text | Automatic |  |
| Broker Credentials | Broker / Agent | Pick record (Agent (DLD Registered)) | **Required** |  |
| Broker Credentials | HR Employee record | Pick record (Employee) | Optional |  |
| Broker Credentials | System user account | Pick record (User) | Optional |  |
| Broker Credentials | Verified RERA BRN | Text | **Required** |  |
| Broker Credentials | RERA practice card no. | Text | Optional |  |
| Broker Credentials | RERA card expiry date | Date | **Required** |  |
| Broker Credentials | DLD registration status | Choose one | Optional | Pending Exam · Registered · Active · Expired · Suspended · Revoked |
| Broker Credentials | RERA exam passed | Tick box | Optional |  |
| Broker Credentials | Exam score % | Number | Optional |  |
| Training & Approvals | Work visa verified | Tick box | Optional |  |
| Training & Approvals | AML & privacy training done | Tick box | Optional |  |
| Training & Approvals | Code of conduct signed | Tick box | Optional |  |
| Training & Approvals | Conflict of interest status | Choose one | Optional | None Declared · Declared & Cleared · Restricted |
| Training & Approvals | Conflict of interest declaration details | Long text | Optional |  |
| Scope & Commercials | Authorised sales territories | Text | Optional |  |
| Scope & Commercials | Specialised communities | Text | Optional |  |
| Scope & Commercials | Approved developer specialisations | Text | Optional |  |
| Scope & Commercials | Spoken languages | Text | Optional |  |
| Scope & Commercials | Agreed commission structure | Choose one | Optional | Company Visa – 0 Basic, 50/50 Net Commission Split · Standard Progressive Tier · Senior 60/40 Split · Partner 70/30 Split · Salaried + Bonus · Custom Agreement |
| Scope & Commercials | Commission effective from | Date | Optional |  |
| Scope & Commercials | Max commission advance limit (AED) | Amount (AED) | Optional |  |
| Scope & Commercials | Compliance scorecard (0–100) | Number | Optional |  |
| Scope & Commercials | Regulated duty status | Choose one | Optional | Draft · Pending HR Verification · Pending Compliance Sign-off · Authorised · Restricted – Credential Expired · Suspended · Exited |
| Scope & Commercials | HR verified by | Pick record (User) | Automatic |  |
| Scope & Commercials | Compliance verified by | Pick record (User) | Automatic |  |
| Scope & Commercials | Regulated duties activated at | Date & time | Automatic |  |
| Scope & Commercials | Cover agent (when away) | Pick record (Agent (DLD Registered)) | Optional |  |
| Scope & Commercials | Governance & supervision notes | Long text | Optional |  |

### AML Reports — goAML reports

Menu: **Compliance → AML Reports** (Step 4 · goAML filings) · Address: `/e/aml_reports`

Record rules: numbered automatically (AML-YY0000) · cannot be deleted (cancel or void instead).

*Log of suspicious-activity and other goAML reports. Keep these records restricted to the compliance officer. Never tell the client a report is being considered or has been filed (tipping-off is an offence).*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Report | Report No. | Text | Automatic |  |
| Report | Report type | Choose one | **Required** | STR – Suspicious Transaction Report · SAR – Suspicious Activity Report · REAR – Real Estate Activity Report · FFR – Funds Freeze Report · PNMR – Partial Name Match Report · Other goAML report |
| Report | Status | Choose one | Optional | Draft · Under review · Filed · Not required · Closed |
| Report | Reason | Choose one | **Required** | Cash payment at or above the threshold · Payment from an unrelated third party · Source of funds unexplained or inconsistent · Sanctions match or partial match · PEP involvement · Client refuses or delays KYC · Unusual pricing or rapid resale · High-risk jurisdiction · Other |
| Report | Client | Pick record (Customer / Party) | Optional |  |
| Report | Deal file | Pick record (Deal File) | Optional |  |
| Report | Sales contract | Pick record (Sales Contract) | Optional |  |
| Report | Amount (AED) | Amount (AED) | Optional |  |
| Report | Transaction date | Date | Optional |  |
| Report | Detected on | Date | Optional |  |
| Report | File by | Date | Optional | Internal due date: the detection date plus the days set in Settings. Report without delay. |
| Report | Filed on | Date | Optional |  |
| Report | goAML reference | Text | Optional |  |
| Report | Filed by | Pick record (User) | Optional |  |
| Report | Facts and indicators | Long text | Optional |  |
| Report | Compliance officer decision | Long text | Optional | Required to close a report as “Not required”. |
| Report | Source record | Text | Automatic |  |
| Report | Created automatically | Tick box | Automatic |  |

### Risk Cases — Compliance Reviews & Complaints

Menu: **Compliance → Risk Cases** (Step 5 · Compliance reviews) · Address: `/e/compliance_cases`

Record rules: numbered automatically (CAS-YY00000) · cannot be deleted (cancel or void instead).

*Fair human review for customer complaints and compliance alerts, with full support for staff explanations and appeals.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Case Details | Case No. | Text | Automatic |  |
| Case Details | Case headline | Text | **Required** |  |
| Case Details | Category | Choose one | **Required** | Client Complaint (4.09) · Fraud / Collusion Lead (3.29) · Bulk Export / DLP Alert (3.30) · Personal WhatsApp Diversion (7.04) · Invented Viewing Dispute (7.02) · Fake / Unverified NOC Alert (7.05) · Unauthorised Listing Advert (7.07) · Broker Credential Lapse (7.08) · Off-Hours GPS Access Alert (7.03) · False Risk Flag Appeal (7.16) · AML / Sanctions Escalation (3.20) |
| Case Details | Source | Choose one | **Required** | Automated Anomaly Lead · Client Complaint · Supervisor Escalation · Confidential Whistleblowing · Internal Audit |
| Case Details | Severity | Choose one | Optional | Low · Medium · High · Critical |
| Case Details | Investigation status | Choose one | Automatic | Open – Pending Independent Owner · Under Human Investigation · Awaiting Subject Response · Pending Independent Approval · Remedy / Action Approved · Appealed by Subject · Corrected / Cleared (False Positive) · Closed |
| Case Details | Staff member involved | Pick record (User) | Optional |  |
| Case Details | Excluded manager / staff | Pick record (User) | Optional |  |
| Case Details | Independent case investigator | Pick record (User) | Optional |  |
| Case Details | Client / Complainant | Pick record (Customer / Party) | Optional |  |
| Case Details | Related property | Pick record (Property) | Optional |  |
| Case Details | Related transaction | Pick record (Property Sale & Transfer) | Optional |  |
| Review, Decision & Appeal | Protected record type | Text | Optional |  |
| Review, Decision & Appeal | Protected record ID | Whole number | Optional |  |
| Review, Decision & Appeal | Keep records locked | Tick box | Optional |  |
| Review, Decision & Appeal | Safeguard notice | Text | Automatic |  |
| Review, Decision & Appeal | Immutable case evidence & logs | Long text | **Required** |  |
| Review, Decision & Appeal | Independent investigation findings | Long text | Optional |  |
| Review, Decision & Appeal | Approved remedy / corrective action | Long text | Optional |  |
| Review, Decision & Appeal | Independently decided by | Pick record (User) | Automatic |  |
| Review, Decision & Appeal | Decided at | Date & time | Automatic |  |
| Review, Decision & Appeal | Staff member appealed | Tick box | Optional |  |
| Review, Decision & Appeal | Subject appeal submission & counter-evidence | Long text | Optional |  |
| Review, Decision & Appeal | Appeal reviewed by (independent authority) | Pick record (User) | Automatic |  |
| Review, Decision & Appeal | False flag corrected & record expunged | Tick box | Automatic |  |

### Registrations — Licences & registrations

Menu: **Compliance → Registrations** (Official certificates) · Address: `/e/compliance_items`

*Register of every licence, permit, registration and policy the company must hold. Expiry dates drive alerts, the compliance calendar and the readiness score.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Registration | Type | Choose one | **Required** | Trade licence · Commercial register · Chamber of Commerce membership · Real estate broker registration (RERA) · Office registration (ORN) · Property management licence · Broker card (BRN) · Trakheesi advertising permit · Holiday home permit (DTCM) · goAML registration · Additional office permit (DET) · Signage permit · VAT registration (FTA) · Corporate tax registration (FTA) · E-invoicing service provider (ASP) · MOHRE establishment card / WPS · ICP establishment card · Tenancy contract (Ejari) · Property insurance · Insurance policy · UBO register · Data protection / privacy · Other |
| Registration | Name | Text | **Required** |  |
| Registration | Number / reference | Text | Optional |  |
| Registration | Issuing authority | Text | Optional |  |
| Registration | Status | Choose one | Optional | Active · Pending · To obtain · To verify · Expired · Not applicable |
| Registration | Issue date | Date | Optional |  |
| Registration | Expiry date | Date | Optional |  |
| Registration | Remind before expiry (days) | Whole number | Optional |  |
| Registration | Responsible | Pick record (User) | Optional |  |
| Registration | Annual cost | Amount (AED) | Optional |  |
| Registration | Portal / verification link | Text | Optional |  |
| Registration | Notes | Long text | Optional |  |

## Employees

### Staff List — Employees

Menu: **Employees → Staff List** (Step 1 · Employee profiles) · Address: `/e/employees`

Record rules: numbered automatically (EMP0000).

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Employee | Employee no. | Text | Automatic |  |
| Employee | Full name | Text | **Required** |  |
| Employee | Linked user | Pick record (User) | Optional |  |
| Employee | Department | Pick record (Department) | Optional |  |
| Employee | Designation | Text | Optional |  |
| Employee | Branch | Pick record (Branch) | Optional |  |
| Employee | Reports to | Pick record (Employee) | Optional |  |
| Employee | Status | Choose one | Optional | Active · On leave · Probation · Resigned · Terminated |
| Employee | Join date | Date | Optional |  |
| Employee | Contract | Choose one | Optional | Unlimited · Limited · Part-time · Contractor |
| Employee | Phone | Phone | Optional |  |
| Employee | Work e-mail | E-mail | Optional |  |
| Employee | Nationality | Text | Optional |  |
| Employee | Gender | Choose one | Optional | Male · Female |
| Employee | Date of birth | Date | Optional |  |
| Documents | Passport no. | Text | Optional |  |
| Documents | Passport expiry | Date | Optional |  |
| Documents | Emirates ID | Text | Optional |  |
| Documents | Emirates ID expiry | Date | Optional |  |
| Documents | Visa / residence no. | Text | Optional |  |
| Documents | Visa expiry | Date | Optional |  |
| Documents | Labour card no. | Text | Optional |  |
| Documents | Health insurance expiry | Date | Optional |  |
| Documents | Work permit no. | Text | Optional |  |
| Documents | Work permit / labour contract expiry | Date | Optional |  |
| Documents | Unemployment insurance (ILOE) | Choose one | Optional | Subscribed · Not subscribed · Exempt |
| Compensation | Compensation Model | Choose one | Optional | Commission Only (50/50 Company Visa – 0 Basic) · Salaried + Commission · Salaried Management / Operations |
| Compensation | Company Visa Sponsored | Tick box | Optional |  |
| Compensation | Company Commission Share % | % | Optional |  |
| Compensation | Sales Advisor Share % | % | Optional |  |
| Compensation | Basic salary | Amount (AED) | Optional |  |
| Compensation | Housing | Amount (AED) | Optional |  |
| Compensation | Transport | Amount (AED) | Optional |  |
| Compensation | Other allowances | Amount (AED) | Optional |  |
| Compensation | Salary IBAN | Text | Optional |  |
| Compensation | Bank routing code (WPS, 9 digits) | Text | Optional |  |
| Compensation | Salary bank | Text | Optional |  |
| Compensation | MOHRE person ID (WPS, 14 digits) | Text | Optional |  |
| Compensation | Annual leave entitlement | Number | Optional |  |
| Compensation | Notes | Long text | Optional |  |

### Brokers (BRN) — Agents

Menu: **Employees → Brokers (BRN)** (Step 2 · Sales & leasing agents) · Address: `/e/agents`

Record rules: numbered automatically (AGT0000).

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Agent | Agent No. | Text | Automatic |  |
| Agent | Employee Record | Pick record (Employee) | Optional | Link to HR employee record for payroll |
| Agent | Full Name | Text | **Required** |  |
| Agent | Core Department | Choose one | Optional | Sales of Off-Plan Projects · Secondary Projects · Leasing |
| Agent | Company Visa (Zero Basic Salary – 50/50 Split) | Tick box | Optional |  |
| DLD Registration | DLD Broker ID (RERA No.) | Text | **Required** |  |
| DLD Registration | RERA Card No. | Text | Optional |  |
| DLD Registration | DLD Registration Expiry | Date | Optional |  |
| DLD Registration | License Type | Text | Optional |  |
| DLD Registration | Specialization | Text | Optional | e.g. Residential Sales, Commercial Leasing, Off-Plan |
| DLD Registration | Mobile | Phone | Optional |  |
| DLD Registration | Email | E-mail | Optional |  |
| DLD Registration | Branch | Pick record (Branch) | Optional |  |
| DLD Registration | Team Lead / Manager | Pick record (Agent (DLD Registered)) | Optional |  |
| DLD Registration | Status | Choose one | Optional | Active · On Leave · Suspended · Licence Expired · Resigned |
| DLD Registration | Join Date | Date | Optional |  |
| DLD Registration | Default Commission Split % | % | Optional | 50-50% net split between SWK Properties and Sales Advisor |
| DLD Registration | Commission Tier | Choose one | Optional | 50/50 Standard (Company Visa) · Standard · Senior · Partner · Custom |
| DLD Registration | Monthly Target (AED) | Amount (AED) | Optional | Monthly GCI target used for 1st-of-month & mid-month target notifications |
| DLD Registration | Commission IBAN | Text | Optional |  |
| DLD Registration | Bank | Text | Optional |  |
| DLD Registration | Social Media | Text | Optional | LinkedIn, Instagram, Property Finder, Bayut profile URLs |
| DLD Registration | Client Portal Access | Tick box | Optional |  |
| DLD Registration | Agent Bio | Long text | Optional |  |
| DLD Registration | Internal Notes | Long text | Optional |  |

### Joining & Exit — Hiring, Onboarding & Staff Handover

Menu: **Employees → Joining & Exit** (Step 3 · Onboarding checklist) · Address: `/e/hr_lifecycle_cases`

Record rules: numbered automatically (HRL-YY00000) · cannot be deleted (cancel or void instead).

*Manage candidate hiring, new joiner onboarding, and departing staff account and client handovers.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Staff & Request Details | Case No. | Text | Automatic |  |
| Staff & Request Details | Lifecycle type | Choose one | **Required** | Manpower Requisition · Candidate Offer & Onboarding · Branch / Department Transfer · Probation Review & Confirmation · Confidential Disciplinary / Grievance · Resignation & Standard Offboarding · Emergency Separation & Access Removal |
| Staff & Request Details | Employee | Pick record (Employee) | Optional |  |
| Staff & Request Details | Staff user account | Pick record (User) | Optional |  |
| Staff & Request Details | Candidate / employee name | Text | **Required** |  |
| Staff & Request Details | Department | Pick record (Department) | Optional |  |
| Staff & Request Details | Branch | Pick record (Branch) | Optional |  |
| Staff & Request Details | Effective date | Date | **Required** |  |
| Staff & Request Details | Status | Choose one | Automatic | Draft · Pending Approval · In Progress · Accounts Revoked & Portfolio Reassigned · Final EOSB Settlement Pending · Completed · Cancelled |
| Account & Client Handover | Hand over clients & chats to | Pick record (User) | Optional |  |
| Account & Client Handover | User account disabled | Tick box | Automatic |  |
| Account & Client Handover | Active sessions & tokens revoked | Tick box | Automatic |  |
| Account & Client Handover | Leads reassigned | Whole number | Automatic |  |
| Account & Client Handover | WhatsApp threads handed over | Whole number | Automatic |  |
| Account & Client Handover | Viewings reassigned | Whole number | Automatic |  |
| Account & Client Handover | NOC / deal tasks reassigned | Whole number | Automatic |  |
| Account & Client Handover | Laptop, phone & cards returned | Tick box | Optional |  |
| Account & Client Handover | Messages, customer history & payroll preserved (no erasure) | Tick box | Automatic |  |
| Account & Client Handover | Final settlement pay (AED) | Amount (AED) | Optional |  |
| Account & Client Handover | Approved by | Pick record (User) | Automatic |  |
| Account & Client Handover | Approved at | Date & time | Automatic |  |
| Account & Client Handover | Segmented HR / interview / disciplinary notes | Long text | Optional |  |
| Account & Client Handover | Handover & asset return evidence | Long text | Optional |  |

### Visas & IDs — Staff Visas & Work Permits

Menu: **Employees → Visas & IDs** (Step 4 · Visas & Emirates ID) · Address: `/e/immigration_cases`

Record rules: numbered automatically (PRO-YY00000) · cannot be deleted (cancel or void instead).

*Track staff visas, work permits, medical tests, and Emirates IDs step by step.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Visa & Work Permit | PRO Case No. | Text | Automatic |  |
| Visa & Work Permit | Employee | Pick record (Employee) | **Required** |  |
| Visa & Work Permit | Assigned PRO | Pick record (User) | Optional |  |
| Visa & Work Permit | Sponsoring legal entity | Pick record (Legal entity) | Optional |  |
| Visa & Work Permit | Sponsorship type | Choose one | **Required** | Company Sponsored · Family Sponsored · Golden Visa · Temporary Work Permit · Internal Transfer |
| Visa & Work Permit | Case type | Choose one | **Required** | New Employment Visa · Visa & Permit Renewal · Work Permit Only · Emirates ID Renewal · Dependant Sponsorship · Work Permit / Visa Cancellation |
| Visa & Work Permit | Work permit category | Choose one | Optional | Category 1 · Category 2 · Category 3 · Skilled Level 1–5 · Partner / Investor |
| Visa & Work Permit | Status | Choose one | Optional | Draft · Checklist Verification · Application Submitted · Medical Scheduled · Emirates ID Biometrics · Officially Approved · Stamped / Issued · Completed · Rejected – Reapplication · Delayed / Escalated · Cancelled |
| Visa & Work Permit | Eligibility checklist verified | Tick box | Optional |  |
| Visa & Work Permit | Offer letter & MOHRE contract signed | Tick box | Optional |  |
| Visa & Work Permit | MOHRE / ICP application ref. | Text | Optional |  |
| Visa & Work Permit | Submitted on | Date | Optional |  |
| Visa & Work Permit | Submitted by (PRO) | Pick record (User) | Automatic |  |
| Visa & Work Permit | Expected decision by | Date | Optional |  |
| Visa & Work Permit | Decision window exceeded | Tick box | Optional |  |
| Medical, EID & Insurance | Medical appointment date | Date | Optional |  |
| Medical, EID & Insurance | Medical result | Choose one | Optional | Pending · Scheduled · Fit · Retest Required · Unfit |
| Medical, EID & Insurance | Emirates ID application no. | Text | Optional |  |
| Medical, EID & Insurance | Emirates ID status | Choose one | Optional | Pending · Biometrics Completed · Card Printed · Card Delivered |
| Medical, EID & Insurance | Health insurance | Choose one | Optional | Pending · Enrolled · Active · Cancelled |
| Medical, EID & Insurance | Sponsored dependants count | Whole number | Optional |  |
| Approvals & Costs | Entry permit / approval no. | Text | Optional |  |
| Approvals & Costs | Officially approved on | Date | Optional |  |
| Approvals & Costs | Official approval verified by | Pick record (User) | Automatic |  |
| Approvals & Costs | New permit / residence expiry | Date | Optional |  |
| Approvals & Costs | Government fees (AED) | Amount (AED) | Optional |  |
| Approvals & Costs | Typing / vendor fees (AED) | Amount (AED) | Optional |  |
| Approvals & Costs | Typing centre / vendor | Pick record (Customer / Party) | Optional |  |
| Approvals & Costs | Official fee receipt ref. | Text | Optional |  |
| Approvals & Costs | Internally marked complete by | Pick record (User) | Automatic |  |
| Approvals & Costs | Completed at | Date & time | Automatic |  |
| Approvals & Costs | Rejection / missing document details | Long text | Optional |  |
| Approvals & Costs | PRO notes & escalation log | Long text | Optional |  |

### Attendance — Attendance

Menu: **Employees → Attendance** (Step 5 · Daily check-in log) · Address: `/e/attendance`

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Attendance | Employee | Pick record (Employee) | **Required** |  |
| Attendance | Date | Date | **Required** |  |
| Attendance | Check-in | Date & time | Optional |  |
| Attendance | Check-out | Date & time | Optional |  |
| Attendance | Hours | Number | Automatic |  |
| Attendance | Status | Choose one | Optional | Present · Absent · Late · Field Site Visit · Half day · Remote · On leave · Public holiday |
| Attendance | Check-in Mode | Choose one | Optional | Office Reception QR · Office QR Scan · Field Site Visit Live GPS · Field Site-Visit Live GPS · Manager Override |
| Attendance | Client-Based Variable Hours | Tick box | Optional |  |
| Attendance | Client / Site Visit Schedule Reason | Text | Optional |  |
| Attendance | Daily Report Submitted Before Checkout | Tick box | Optional |  |
| Attendance | Note | Text | Optional |  |

### Leave — Leave requests

Menu: **Employees → Leave** (Step 6 · Holiday & sick leave) · Address: `/e/leave_requests`

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Leave | Employee | Pick record (Employee) | **Required** |  |
| Leave | Leave type | Choose one | **Required** | Annual · Sick · Unpaid · Maternity / paternity · Compassionate · Hajj · Public holiday swap |
| Leave | From | Date | **Required** |  |
| Leave | To | Date | **Required** |  |
| Leave | Days | Number | Optional |  |
| Leave | Status | Choose one | Automatic | Pending · Approved · Rejected · Cancelled |
| Leave | Approver | Pick record (User) | Automatic |  |
| Leave | Reason | Long text | Optional |  |

### Payroll (WPS) — Payroll

Menu: **Employees → Payroll (WPS)** (Step 7 · Monthly salary slips) · Address: `/e/payslips`

Record rules: can be printed / e-mailed as PDF.

*Internal payroll records. Generation calculates pay from the employee record; bank/WPS salary transfer files are produced outside this system.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Payslip | Employee | Pick record (Employee) | **Required** |  |
| Payslip | Period (YYYY-MM) | Text | **Required** |  |
| Payslip | Basic | Amount (AED) | Optional |  |
| Payslip | Allowances | Amount (AED) | Optional |  |
| Payslip | Overtime | Amount (AED) | Optional |  |
| Payslip | Deductions | Amount (AED) | Optional |  |
| Payslip | Net pay | Amount (AED) | Automatic |  |
| Payslip | Unpaid leave days | Number | Optional |  |
| Payslip | Status | Choose one | Optional | Draft · Approved · Paid |
| Payslip | Paid on | Date | Optional |  |
| Payslip | Notes | Long text | Optional |  |

## Field Service

### Gate Logs — Attendance & Check-Ins

Menu: **Field Service → Gate Logs** (Step 2 · Arrival & exit scans) · Address: `/e/attendance_events`

Record rules: numbered automatically (ATT-YY000000) · cannot be deleted (cancel or void instead).

*Office and appointment check-in and check-out times, work shifts, and overtime records.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Check-In & Shift | Event No. | Text | Automatic |  |
| Check-In & Shift | Employee | Pick record (Employee) | **Required** |  |
| Check-In & Shift | User | Pick record (User) | Optional |  |
| Check-In & Shift | Work date | Date | **Required** |  |
| Check-In & Shift | Shift schedule | Choose one | Optional | Mon–Fri 10:00–19:00 · Saturday 10:00–16:00 · Sunday Holiday (Client Exception) · Client-Based Variable Hours · Field Sales Duty · Standard 09:00–18:00 · Early 08:00–17:00 · Late 10:00–19:00 · Weekend Roster |
| Check-In & Shift | Grace period (min) | Whole number | Optional |  |
| Check-In & Shift | Client-based variable hours | Tick box | Optional |  |
| Check-In & Shift | Client schedule / site visit reason | Text | Optional |  |
| Check-In & Shift | Daily report & site visits verified before check-out | Tick box | Optional |  |
| Check-In & Shift | Check-in method | Choose one | Optional | Office Kiosk · Dynamic QR · Approved Field Appointment · Live GPS Field Check-In · Manager Correction · Remote Authorised |
| Check-In & Shift | Dynamic QR / kiosk reference | Text | Optional |  |
| Check-In & Shift | Server check-in timestamp | Date & time | Optional |  |
| Check-In & Shift | Server check-out timestamp | Date & time | Optional |  |
| Check-In & Shift | Duty classification | Choose one | Optional | On Duty · Client Viewing · Developer Meeting · Late Arrival · Early Departure · Missed Punch · Overtime · Approved Leave / Holiday |
| Check-In & Shift | Late arrival (min) | Whole number | Optional |  |
| Check-In & Shift | Overtime (min) | Whole number | Optional |  |
| Check-In & Shift | Overtime approved | Tick box | Optional |  |
| Check-In & Shift | Overtime approver | Pick record (User) | Automatic |  |
| Field Duty & Audit | Linked viewing appointment | Pick record (Viewing) | Optional |  |
| Field Duty & Audit | Linked property visit | Pick record (Property Visit) | Optional |  |
| Field Duty & Audit | Check-in latitude | Text | Optional |  |
| Field Duty & Audit | Check-in longitude | Text | Optional |  |
| Field Duty & Audit | GPS accuracy (m) | Number | Optional |  |
| Field Duty & Audit | Field / flagged review | Choose one | Optional | Not needed · Pending · Approved · Rejected |
| Field Duty & Audit | Check-in method | Text | Optional |  |
| Field Duty & Audit | Security flags | Text | Optional |  |
| Field Duty & Audit | Device | Text | Optional |  |
| Field Duty & Audit | Connection IP | Text | Optional |  |
| Field Duty & Audit | Approved travel / mileage claim (AED) | Amount (AED) | Optional |  |
| Field Duty & Audit | Attendance correction reason (audit required) | Long text | Optional |  |
| Field Duty & Audit | Corrected / verified by | Pick record (User) | Automatic |  |
| Field Duty & Audit | Manager verified | Tick box | Optional |  |
| Field Duty & Audit | Notes | Long text | Optional |  |

### Field Visits — Field Visits & Viewings

Menu: **Field Service → Field Visits** (Step 3 · GPS site visits) · Address: `/e/field_sessions`

Record rules: numbered automatically (FLD-YY00000) · cannot be deleted (cancel or void instead).

*Work-hours appointment check-ins for property viewings and client meetings. Automatically turns off outside work hours.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Field Assignment | Session No. | Text | Automatic |  |
| Field Assignment | Employee | Pick record (Employee) | **Required** |  |
| Field Assignment | Broker / Agent | Pick record (Agent (DLD Registered)) | Optional |  |
| Field Assignment | Duty date | Date | **Required** |  |
| Field Assignment | Scheduled duty start | Date & time | **Required** |  |
| Field Assignment | Scheduled duty end | Date & time | **Required** |  |
| Field Assignment | Activated by staff at | Date & time | Optional |  |
| Field Assignment | Stopped / expired at | Date & time | Optional |  |
| Field Assignment | Session status | Choose one | Optional | Scheduled · Active (On Duty) · Completed (Off Duty) · Auto-Expired · SOS Emergency Active · Anomaly – For Review |
| Field Assignment | Assigned community / building | Text | **Required** |  |
| Field Assignment | Linked viewing appointment | Pick record (Viewing) | Optional |  |
| Field Assignment | Linked property | Pick record (Property) | Optional |  |
| Field Assignment | Appointment reference | Text | Optional |  |
| Arrival & Safety | Site arrival time | Date & time | Optional |  |
| Arrival & Safety | Site departure timestamp | Date & time | Optional |  |
| Arrival & Safety | Last location sample (UTC) | Date & time | Automatic |  |
| Arrival & Safety | Location received by server (UTC) | Date & time | Automatic |  |
| Arrival & Safety | Last duty latitude | Text | Optional |  |
| Arrival & Safety | Last duty longitude | Text | Optional |  |
| Arrival & Safety | GPS accuracy (meters) | Number | Optional |  |
| Arrival & Safety | Employee SOS emergency triggered | Tick box | Optional |  |
| Arrival & Safety | SOS emergency details | Text | Optional |  |
| Arrival & Safety | Manager review status | Choose one | Optional | Normal · Pending Human Review · Verified · Excused |
| Arrival & Safety | Anomaly / missed appointment note (for human review only) | Long text | Optional |  |
| Arrival & Safety | Reviewed by | Pick record (User) | Automatic |  |
| Arrival & Safety | Auto-purge telemetry on | Date | Optional |  |
| Arrival & Safety | Operational coordination notes | Long text | Optional |  |

### Daily Reports — Daily Work Reports

Menu: **Field Service → Daily Reports** (Step 4 · End-of-day summary) · Address: `/e/daily_reports`

Record rules: numbered automatically (DAR-YY000000) · cannot be deleted (cancel or void instead).

*Daily staff work reports combining automatic call, viewing, and task counts with each staff member's written summary.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Workday Details | Report No. | Text | Automatic |  |
| Workday Details | Employee | Pick record (Employee) | **Required** |  |
| Workday Details | Staff user | Pick record (User) | Optional |  |
| Workday Details | Department | Pick record (Department) | Optional |  |
| Workday Details | Line manager | Pick record (User) | Optional |  |
| Workday Details | Workday date | Date | **Required** |  |
| Workday Details | Day classification | Choose one | Optional | Assigned Workday · Field Duty Day · Approved Leave (Exempt) · Public Holiday (Exempt) · Medical / Approved Exemption |
| Workday Details | Status | Choose one | Optional | Draft · Submitted (Frozen) · Returned for Clarification · Approved by Manager · Exemption Logged · Overdue – Manager Task Created |
| Automatic Activity Count | System: Calls logged | Whole number | Automatic |  |
| Automatic Activity Count | System: Tasks completed | Whole number | Automatic |  |
| Automatic Activity Count | System: Leads progressed | Whole number | Automatic |  |
| Automatic Activity Count | System: Viewings & visits | Whole number | Automatic |  |
| Automatic Activity Count | System: Offers / reservations | Whole number | Automatic |  |
| Daily Written Summary | Key results achieved today | Long text | Optional |  |
| Daily Written Summary | Blockers & help needed | Long text | Optional |  |
| Daily Written Summary | Supporting record references / evidence | Long text | Optional |  |
| Daily Written Summary | Next workday top priorities | Long text | Optional |  |
| Daily Written Summary | Flag private HR or compliance concern | Tick box | Optional |  |
| Manager Review | Submitted at | Date & time | Automatic |  |
| Manager Review | Frozen at | Date & time | Automatic |  |
| Manager Review | Submission version | Whole number | Automatic |  |
| Manager Review | Reviewed by manager | Pick record (User) | Automatic |  |
| Manager Review | Reviewed at | Date & time | Automatic |  |
| Manager Review | Review decision version | Whole number | Automatic |  |
| Manager Review | Line manager review comments | Long text | Automatic |  |

## Settings

### Branches — Branches

Menu: **Settings → Branches** (Office locations & geofence) · Address: `/e/branches`

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Branch | Branch code | Text | **Required** | Used as the job-number prefix, e.g. DXB |
| Branch | Branch name | Text | **Required** |  |
| Branch | Address | Text | Optional |  |
| Branch | City | Text | Optional |  |
| Branch | Country | Text | Optional |  |
| Branch | Phone | Phone | Optional |  |
| Branch | Email | E-mail | Optional |  |
| Branch | Tax registration no. (TRN) | Text | Optional |  |
| Branch | Legal entity | Pick record (Legal entity) | Optional |  |
| Branch | Trade licence no. | Text | Optional |  |
| Branch | Head office | Tick box | Optional |  |
| Branch | Active | Tick box | Optional |  |

### Signing Rules — Company Policies & Approval Limits

Menu: **Settings → Signing Rules** (Approval limits & policies) · Address: `/e/corporate_governance_items`

Record rules: numbered automatically (GOV-YY0000) · cannot be deleted (cancel or void instead).

*Company policies, spending limits, authorised signers, department budgets, and emergency plans.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Governance | Governance No. | Text | Automatic |  |
| Governance | Title | Text | **Required** |  |
| Governance | Category | Choose one | **Required** | Board / Owner Decision · Company Policy · Signature Authority · Department Budget · Corporate Partner Contract · Bank Signatory Mandate · Business Continuity Plan (BCP) · Authorised Representative |
| Governance | Legal entity | Pick record (Legal entity) | Optional |  |
| Governance | Branch | Pick record (Branch) | Optional |  |
| Governance | Department | Pick record (Department) | Optional |  |
| Governance | Responsible owner | Pick record (User) | Optional |  |
| Governance | Authority / budget limit (AED) | Amount (AED) | Optional |  |
| Governance | Effective from | Date | Optional |  |
| Governance | Review / expiry date | Date | Optional |  |
| Governance | Status | Choose one | Optional | Draft · Pending Review · Approved · Active · Superseded · Archived |
| Governance | Version | Whole number | Optional |  |
| Governance | Approved by | Pick record (User) | Automatic |  |
| Governance | Approved at | Date & time | Automatic |  |
| Governance | Resolution / document reference | Text | Optional |  |
| Governance | Scope, authority rules & emergency procedures | Long text | Optional |  |
| Governance | Internal notes | Long text | Optional |  |

### Safety Checks — System Backup Checks

Menu: **Settings → Safety Checks** (Recovery drill logs) · Address: `/e/dr_exercises`

Record rules: numbered automatically (DRX-YY0000) · cannot be deleted (cancel or void instead).

*Regular backup restore tests and system checks to keep company records safe.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
| Backup Check Details | Drill No. | Text | Automatic |  |
| Backup Check Details | Exercise / release title | Text | **Required** |  |
| Backup Check Details | Type | Choose one | **Required** | Backup Restore Verification Drill · Primary Database Failover Simulation · WhatsApp / Telephony Outage Drill · Vulnerability & Penetration Test · Production Release & Migration Approval |
| Backup Check Details | Target RTO (minutes) | Whole number | Optional |  |
| Backup Check Details | Measured RTO (minutes) | Whole number | Optional |  |
| Backup Check Details | Target RPO (minutes) | Whole number | Optional |  |
| Backup Check Details | Measured RPO (minutes) | Whole number | Optional |  |
| Backup Check Details | Backup file tested | Text | Optional |  |
| Backup Check Details | Restored records verified | Whole number | Optional |  |
| Backup Check Details | Backup file verified | Tick box | Optional |  |
| Backup Check Details | Outcome status | Choose one | Optional | Scheduled · In Progress · Passed – RTO/RPO Verified · Passed with Remediation · Failed – Blocked |
| Backup Check Details | Conducted by | Pick record (User) | Optional |  |
| Backup Check Details | Independently verified by | Pick record (User) | Optional |  |
| Backup Check Details | Conducted at | Date & time | Optional |  |
| Backup Check Details | Restore / simulation verification evidence | Long text | **Required** |  |
| Backup Check Details | Migration rollback & incident recovery procedure | Long text | Optional |  |

### Activity Log — System Activity Log

Menu: **Settings → Activity Log** (Security event history) · Address: `/e/audit_events`

Record rules: cannot be deleted (cancel or void instead) · read-only: rows are written by the system.

*Automatic log of important actions, approvals, and updates across the system.*

| Section | Field | Type | Rule | Choices / help |
|---|---|---|---|---|
|  | Timestamp | Date & time | Optional |  |
|  | Module (3.01–3.35) | Text | Optional |  |
|  | Workflow (4.01–4.10) | Text | Optional |  |
|  | Event type | Text | Optional |  |
|  | Entity | Text | Optional |  |
|  | Record ID | Whole number | Optional |  |
|  | Actor | Pick record (User) | Optional |  |
|  | Audit summary | Text | Optional |  |
