# SWK Properties OS — Complete Staff Workbook

**SWK Properties L.L.C · Dubai · RERA ORN 51517 · https://os.swk.properties**
**For:** Shabib Siraj (Owner & Managing Director) · SWK Admin · Mohammad Haseeb (Operations Manager) · all staff
**Version:** November 2026, written from the live code of the system (repository `swkpropertiesuae/SWKOS`).

This workbook has two parts:

- **Part A (this file)** explains the system: who can do what, every screen and button, and the full workflow from the first enquiry to the paid commission. For each form it says **what** to fill, **when**, and **why**.
- **Part B — [SWK-OS-WORKBOOK-FORMS.md](SWK-OS-WORKBOOK-FORMS.md)** lists every form field by field (required, automatic, the choices in each drop-down). It is generated from the system itself, so it is always exact.

> **Where this workbook differs from older handbooks** ([OWNER_MASTER_HANDBOOK.md](OWNER_MASTER_HANDBOOK.md), [MANAGER_OPERATIONS_HANDBOOK_HASEEB.md](MANAGER_OPERATIONS_HANDBOOK_HASEEB.md)), this workbook is correct: it was checked against the current code.

---

## Contents

1. [Read this first: which chapters are for you](#1-read-this-first-which-chapters-are-for-you)
2. [Who's who and who can see what](#2-whos-who-and-who-can-see-what)
3. [Signing in, passwords and the app](#3-signing-in-passwords-and-the-app)
4. [The screen: every permanent button](#4-the-screen-every-permanent-button)
5. [How every list, record and form works](#5-how-every-list-record-and-form-works)
6. [The seven golden rules the system enforces](#6-the-seven-golden-rules-the-system-enforces)
7. [Daily routines by role](#7-daily-routines-by-role)
8. [The master workflow, start to end](#8-the-master-workflow-start-to-end)
9. [Workflow A — Leads: from enquiry to qualified client](#9-workflow-a--leads-from-enquiry-to-qualified-client)
10. [Workflow B — Inventory: from new property to live advert](#10-workflow-b--inventory-from-new-property-to-live-advert)
11. [Workflow C — Secondary sale: from viewing to title deed](#11-workflow-c--secondary-sale-from-viewing-to-title-deed)
12. [Workflow D — Off-plan sale](#12-workflow-d--off-plan-sale)
13. [Workflow E — Leasing: from landlord to key handover and renewal](#13-workflow-e--leasing-from-landlord-to-key-handover-and-renewal)
14. [Workflow F — Money: invoice, receipt, commission, payout](#14-workflow-f--money-invoice-receipt-commission-payout)
15. [Workflow G — When things go wrong: exceptions, withdrawals, refunds, deletions](#15-workflow-g--when-things-go-wrong)
16. [Workflow H — CRM Vault and the lead handover chain](#16-workflow-h--crm-vault-and-the-lead-handover-chain)
17. [Workflow I — People: attendance, daily reports, leave, visas, broker cards, payroll](#17-workflow-i--people)
18. [Screen-by-screen guide to all 12 apps](#18-screen-by-screen-guide-to-all-12-apps)
19. [Messages the system shows when it blocks you, and what to do](#19-messages-the-system-shows-when-it-blocks-you)
20. [What the system does by itself](#20-what-the-system-does-by-itself)
21. [Settings and administration (Owner, Admin)](#21-settings-and-administration)
22. [Frequently asked questions](#22-frequently-asked-questions)
23. [One-page cheat sheets](#23-one-page-cheat-sheets)

---

## 1. Read this first: which chapters are for you

| You are | Read in this order | You can skip |
|---|---|---|
| **Owner (Shabib)** | 2, 6, 7.1, 8, 14, 15, 16, 20, 21, 23 | Nothing is hidden from you; skim 18 as a reference |
| **Admin** | 2, 3, 6, 7.2, 16, 17.1, 21, 19 | — |
| **Operations Manager (Haseeb)** | 2, 4, 5, 6, 7.3, 8 to 17 in full, 18, 19 | 21 (Owner/Admin settings) |
| **Staff** (Talha, Saifullah, Samarth, Meenakshi, Fareed, Shahid, Umar, Sanketh) | 2.3, 3, 4, 7.4, 16.4, 17.1 to 17.3, 22, 23.4 | Chapters about modules you cannot open |

---

## 2. Who's who and who can see what

### 2.1 The accounts

| Role | Person | Sign-in e-mail | Access |
|---|---|---|---|
| **Owner & Managing Director** | Shabib Siraj | `shabib@swk.properties` | Everything. Final approver of deletions, refunds and withdrawals. The only person who can change the Owner account or the Admin account. |
| **Admin** | SWK Admin | `admin@swk.properties` | Everything, under the Owner. The **only** account that can lock or change the office Wi-Fi for attendance. Custodian of imported lead data (CRM Vault "Admin Custody"). |
| **Operations Manager** | Mohammad Haseeb | `haseeb@swk.properties` | All business modules, employee records, the CRM Vault (dispatch to staff) and the reception code screen. Deletions and administrative decisions he raises go to the Owner. |
| **Staff** | Talha Shabbir (BDM & Digital Ops), Saifullah, Samarth, Meenakshi | `name@swk.properties` | Attendance and general work (see 2.3). |
| **Staff** | Fareed, Shahid, Umar, Sanketh | `name@swk.rent` (old `@swk.properties` address still works) | Same as Staff. |

### 2.2 What each role can do

| Action | Owner | Admin | Haseeb | Staff |
|---|:-:|:-:|:-:|:-:|
| Open all 12 apps (Dashboards, Properties, CRM, Sales, Leasing, Landlords, Accounting, Compliance, Employees, Field Service, Documents, Settings) | ✅ | ✅ | ✅ | ❌ |
| Approvals inbox, Delete Bin, Withdrawals, Daily Operations | ✅ | ✅ | ✅ | ❌ |
| Approve a deletion permanently / approve a client refund | ✅ **final** | ✅ | Reviews, sends to Owner | ❌ |
| CRM Vault: see real phone numbers, dispatch leads | ✅ | ✅ | ✅ | ❌ (masked queue only) |
| Release lead batches from Admin Custody to Haseeb | ✅ | ✅ | ❌ | ❌ |
| Reception code screen, print/regenerate the QR | ✅ | ✅ | ✅ | ❌ |
| Lock / change office Wi-Fi | ❌ | ✅ **only** | ❌ | ❌ |
| Open employee records | ✅ | ✅ | ✅ | ❌ |
| Employee "Access & usage" tab | ✅ | ✅ | ❌ | ❌ |
| Check in, see own attendance, apply for leave, submit daily report | ✅ | ✅ | ✅ | ✅ |
| Calculators, Market Pulse, Calendar, AI Assistant, My Assigned Deals | ✅ | ✅ | ✅ | ✅ |

The three "leadership" accounts (`shabib@`, `admin@`, `haseeb@`) are written into the code. No screen can add a fourth person to the QR or CRM Vault list.

### 2.3 What staff see

Staff accounts land on a reduced home screen with **four apps**:

| App | Inside it | Why |
|---|---|---|
| **Attendance Check-In** | Scan & Check-In, My Attendance Log, Gate Scan Events, Leave Requests, Daily Work Summary | Daily presence, holidays and the end-of-day report |
| **Deal Calculators** | DLD fee, cost-to-close, mortgage, rent index, yield, commission split, Golden Visa, off-plan schedule | Answer client money questions on the spot |
| **Market Pulse** | Live prices and yields for 24 Dubai areas, Communities, Developers, Market News | Talk to clients with real numbers |
| **General Workspace** | My Assigned Deals, Calendar, AI Assistant | Work the leads Haseeb dispatches; see your schedule |

Staff see **only their own** attendance, leave and daily reports, and **only the leads dispatched to them**, with the client's phone number and e-mail always hidden. If a staff member is later given a fuller role (for example Sales), the matching apps appear automatically.

---

## 3. Signing in, passwords and the app

### 3.1 Sign in

1. Open **https://os.swk.properties** on a computer or phone.
2. Type your **Email address** and **Password**. "Caps Lock is on" warns you if Caps Lock is on.
3. If you turned on the authenticator, type the 6-digit **Authenticator code** from your phone app.
4. Tick **Keep me signed in on this device** only on your own device.
5. Press **Sign in**.

**First sign-in for staff:** you start with a temporary password. The system makes you **choose your own password before anything else**, and you cannot check in until you do. A yellow bar ("You are signed in with the default password. Change it now") reminds anyone still on a default password.

**Locked out?** After repeated wrong passwords the account locks for **15 minutes** ("Account temporarily locked after repeated failures"). The Owner or Admin can unlock it at once: *Settings → Roles & Access → user → ⋯ → Unlock account*. They can also **Sign out everywhere** (lost phone) and **Reset 2-step verification** (new phone).

### 3.2 Install it as an app

Account menu (your initials, top right) → **Install app**. It then opens like a normal phone or desktop app. When a new version is released, a bar says "A new version of SWK OS is ready" → press **Reload**.

### 3.3 Demo workspace

The sign-in page has **Explore the demo workspace**. It is a separate copy with sample data, rebuilt every night. Practise there; nothing you do touches real records. The top bar shows "Demo workspace" and a **Reset demo** button while you are in it.

---

## 4. The screen: every permanent button

### 4.1 The home screen ("All apps")

After sign-in you see one tile per app you are allowed to open, a **search box** ("Search leads, properties…") and a **Recent** strip with the last pages you opened. Click a tile to enter the app; its first screen opens.

### 4.2 The top bar (on every screen)

| Button | What it does |
|---|---|
| **SWK logo / "All apps"** | Back to the home screen. |
| **Breadcrumb & title** | Shows where you are, e.g. *All apps › Leasing & management › Rent Cheques*. |
| **Dubai clock & AED** | Gulf Standard Time (UTC+4). Every time in the system is Dubai time; every amount is AED unless the record says otherwise. |
| **Search (magnifier) / Ctrl K** | Quick search across leads, properties, units, contacts, deals, invoices. Type and press Enter. |
| **Bell (Notifications)** | Your alerts: approvals waiting for you, new leads assigned, cheques due, overdue follow-ups. "You're all caught up" when empty. |
| **+ Quick Add** | Create in two clicks from anywhere: **New Lead**, **Submit Property**, **Book Viewing**, **New Sale File**, **New Lease (Ejari)**, **Request NOC**, **Daily Report**. You only see the ones your role allows. |
| **Help guide (?)** | Short guides: *App icons & workflow*, *Selling a property*, *Leasing a property*, *Off-plan sales*. |
| **Initials (account menu)** | *My profile & password*, *Language & preferences* (English / Arabic), *Install app*, *Reception check-in code screen* (leadership only), *Sign out*. |

### 4.3 The left sidebar inside an app

Each app shows its screens as icons **in the order the work happens**. Descriptions such as "Step 1 · New enquiries" tell you the step number. Work from the top down and you follow the correct Dubai process.

---

## 5. How every list, record and form works

About 70 screens are built the same way. Learn it once.

### 5.1 A list screen (example: CRM → Leads)

| Control | What it does |
|---|---|
| **Search box** | Finds records by number, name, phone, e-mail and other key text. |
| **All statuses** drop-down | Shows only one status (e.g. only *New* leads). |
| **Filters → Apply / Clear** | Narrow by any column; *Remove filter* (×) drops one. |
| **Refresh** | Reloads the list. |
| **+ New** | Opens an empty form. |
| **Select all / Select row** tick boxes | Choose rows for a bulk action in **Actions** (e.g. export). |
| **Import** | Upload a CSV file to create many records at once. Tick **Validate only** first: the system checks every row and lists errors without saving anything. Then import for real. "Drop here" accepts a dragged file. |
| **Export** | Download the current list (needs export permission). |
| **Board view** | Some lists (Opportunities, Deal Pipeline) show cards in columns by stage; drag a card to move it. |

### 5.2 A record screen (open any row)

| Control | What it does |
|---|---|
| **Back** | Returns to the list. |
| **Status badge / Approval badge** | Where the record is in its workflow; "Approval: Pending / Approved / Rejected" when sign-off applies. |
| **Key facts strip** | The 4–5 most important values at a glance. |
| **Workflow buttons (coloured)** | The next allowed steps for this record, e.g. **Post**, **Record receipt**, **Convert to customer**, **Approve**. They appear only when the step is allowed and you have the right. |
| **Print** | Opens the branded PDF (letterhead, seal) for printable documents. |
| **E-mail** | Sends the PDF: choose the **From** company address (Sales, Accounts, Info, Contact or Support @swkpropertiesuae.com), **To**, **Subject**, **Message**, and whether to include the company seal. |
| **Edit** | Opens the form. |
| **Delete** | Asks for a **mandatory reason** and sends the record to the **Pending Delete Bin**. It is *not* erased until the Owner approves. Owner, Haseeb and Talha (IT/BDM) are notified. |
| **⋯ (More)** | Less common actions: Void, Duplicate, E-invoice, revisions. |
| **Tabs** | *Details*, child tables (e.g. Invoice lines, Rent Schedule), and *related records* (e.g. a client's Deals, Invoices, Receipts, Calls). |

**The side panel** (right side of most records) keeps the full story of the record:

| Tab | Use it to |
|---|---|
| **Comments** | Write notes for colleagues; mention people. |
| **Follow Up** | Set a reminder with a date; it appears in the bell and calendar. Tick **Done** when finished. |
| **Attachments** | Drop files (passport, title deed, Form A, cheque copy). Optional **expiry date** for documents that expire. |
| **History** | Every change: who, what, when (Dubai time). |
| **Tags / Links / References** | Group and connect records. |
| **Likes, Complaints, Video Call** | Acknowledge, log a client complaint, start a call. |

### 5.3 A form

- Fields marked **\*** are required; the form will not save without them.
- **Grey (automatic) fields** are filled by the system: numbers like `L2600012`, totals, VAT, approver names, time stamps.
- **Pick-record fields** (e.g. *Property*, *Tenant*) choose from existing records. If the person or property is missing, create it first.
- **Reason for editing this record \*** appears when you change an existing record. Write a real reason ("client changed budget after call 21 Nov"). It is saved in the Audit Trail.
- **Custom fields** may appear at the bottom if the Owner added extra fields for that record type.
- Some forms (invoices, bills) have a **lines table**: add one line per item.

---

## 6. The seven golden rules the system enforces

These are not suggestions. The server refuses the action when a rule is broken.

1. **One clean record.** Each client, property and deal exists once, with full history. Duplicate units are caught at submission.
2. **Documents first, advertising second.** No advert without owner authority (signed **Form A**), a valid **Trakheesi** permit, an independent property check and a compliance check.
3. **Four eyes (two people).** The person who creates a request can never approve it: listings, NOCs, commission payouts, IBAN changes, price changes, bills, payments, messages, daily reports.
4. **No personal accounts, ever.** Client money goes only through the five legal channels (chapter 14.1). The system blocks any record that says money went to a staff member's personal account.
5. **Nothing disappears.** Deletions wait in the Delete Bin for the Owner. Posted invoices are voided or credited, never edited. Contracts, payouts and filings cannot be deleted.
6. **Reasons are mandatory.** Every edit and every delete needs a written reason; lost leads need a lost reason; refunds need a narrative.
7. **Every action is recorded.** Who did what and when, in Dubai time, in the Audit Trail and the Activity Log.

---

## 7. Daily routines by role

### 7.1 Owner — 10 minutes a day

| Time | Do this | Where |
|---|---|---|
| 07:30 | Read the WhatsApp daily report | Your WhatsApp |
| 08:30 | Read the morning briefing | WhatsApp |
| 10:30 | Read the attendance report (on time / late / absent) | WhatsApp |
| Any time | Overview: pipeline, expected commission, today's viewings, compliance watch | Dashboards → **Overview** |
| Any time | Approve or reject requests waiting for you | Dashboards → **Approvals** |
| Any time | Approve or restore deletions; decide Haseeb's administrative requests | Dashboards → **Delete Bin** |
| Any time | Approve client refunds after Haseeb's review | Sales → **Withdrawals** |
| Weekly | Commission payouts ready to approve; staff visas and broker cards expiring | Dashboards → **Daily Operations** (tabs *Commission Payouts*, *Visas & Agent Cards*) |

### 7.2 Admin

- Keep the office Wi-Fi locked (*Settings → Company Info → Attendance Wi-Fi*).
- Import new lead workbooks into the CRM Vault and release verified desks to Haseeb (chapter 16).
- Create users, reset passwords, unlock accounts (*Settings → Roles & Access*).
- Check **Backups** weekly and record a restore test in **Safety Checks** monthly.

### 7.3 Operations Manager (Haseeb)

| When | Do this | Where |
|---|---|---|
| 10:00 | Check attendance, approve new phones | Dashboards → **Attendance Check-In** (Attendance control) |
| 10:15 | New leads: assign anyone unassigned, chase the 15-minute first response | CRM → **Leads**, **Routing Rules**, Dashboard "Lead queue" |
| Morning | Dispatch the day's batch of vault leads to staff (masked) | CRM → **CRM Property Vault** |
| Morning | Verify new property submissions (steps 1–3) | Dashboards → **Daily Operations → New Properties & Permits** |
| During day | Viewings, offers, Form F, NOC progress | Dashboards → **Deal Pipeline**, **Daily Operations → Developer NOCs / Sales & Transfers** |
| During day | Approve requests raised by staff (you cannot approve your own) | Dashboards → **Approvals** |
| 17:30 | **Haseeb sign-off** on each staff member's vault results | CRM → **CRM Property Vault** |
| 19:00 | Review and approve submitted daily reports; run "Missing report check" | Dashboards → **Daily Operations → Daily Work Reports** |
| Weekly | Rent cheques due, renewals in 90 days, maintenance open | Leasing → **Rent Cheques**, **Leases & Ejari**, **Maintenance** |

### 7.4 Staff

| When | Do this |
|---|---|
| **By 10:05 AM** (Mon–Fri 10:00–19:00, Sat 10:00–16:00, Sunday off) | Connect to office Wi-Fi → scan the reception QR → sign in within 90 seconds. After 10:05 you are marked **late** with the exact minutes. |
| Day | Open **My Assigned Deals**, call and WhatsApp each owner through the masked buttons, update the status of every deal. |
| Before leaving | Submit **Daily Work Summary**: results today and tomorrow's plan, **at least 30 characters each**. |
| As needed | **Leave Requests** for holidays or sick days. |

---

## 8. The master workflow, start to end

SWK works in **three departments**. Every lead, deal and lease is tagged with one of them (the *Core Department* / *Department* field).

| | Dept 01 — **Off-Plan Sales** | Dept 02 — **Secondary Sales** | Dept 03 — **Leasing** |
|---|---|---|---|
| Stock comes from | Developer launches | Sellers and 3rd-party agents (A2A) | Landlords and A2A partners |
| Promotion | Campaigns, portals | Bayut, Dubizzle, Property Finder | Bayut, Dubizzle |
| Contract | EOI → Booking → **SPA** → **Oqood** | **Form F (MOU)** → Developer **NOC** → **DLD transfer** | Tenancy contract → **Ejari** → PDC cheques |
| Money | Developer escrow / SWK account | Escrow / manager's cheque / SWK account | Rent PDCs, deposit to landlord / SWK |
| Closing | Handover, developer commission invoice | Title deed, commission invoice | Key handover, agency fee invoice |
| Split | 50/50 of net commission | 50/50 after A2A share | 50/50 after A2A share |

The **Deal Pipeline** (Dashboards) shows every deal in **8 stages**, with the checklist the stage needs:

| Stage | Off-plan checklist | Secondary checklist | Leasing checklist |
|---|---|---|---|
| **1. Lead & Qualify** | Lead logged, budget and finance known | Form A seller agreement + seller requirements verified | Landlord Form A permit & portal ad live |
| **2. Site Visit** | Show apartment visit | Viewing logged | Viewing logged |
| **3. Offer & Finance** | Reservation form & developer SPA signed | Written offer accepted by seller; bank offer letter / seller mortgage clearance | Tenant KYC: passport, UAE visa, Emirates ID |
| **4. Negotiation / A2A** | Payment plan agreed | If no internal stock, A2A partner matched (**Form I**) | Form I if A2A unit |
| **5. Form F / SPA / Ejari** | EOI / booking paid to developer escrow or SWK account | **Form B** buyer agreement & KYC; **Form F (MOU)** signed by buyer & seller; 10% deposit via legal mode | Unified Dubai Tenancy Contract signed; **Ejari** registered |
| **6. NOC & DLD / Oqood** | **Oqood** registered with DLD (4% + admin fee) | Developer **NOC** after service-charge clearance | Rent PDCs & deposit to landlord / company account |
| **7. Legal Payment & Keys** | Construction & handover payment plan scheduled | Title deed issued at DLD trustee | DEWA activated & move-in inspection |
| **8. Closed & 50/50 Split** | Developer tax invoice (+5% VAT) & split logged | 50/50 net split after A2A share | Key handover & 50/50 + A2A settlement |

Buttons on the Deal Pipeline: department filter (**All 3 Departments**, **1. Off-Plan**, **2. Secondary**, **3. Leasing**), **All Sales Advisors** filter, **New Deal File**, **Log Withdrawal**, drag-and-drop between stages ("Drop a deal here"), **RERA forms timeline** per card. Each card shows the **Gross Comm**, **SWK 50%**, **Advisor 50%**, **A2A Co-Broke**, buyer finance status and legal payment channel.

The rest of this workbook walks through each workflow in order.

---

## 9. Workflow A — Leads: from enquiry to qualified client

### 9.1 Where leads come from

| Source | How it arrives |
|---|---|
| **Website** (swkpropertiesuae.com forms) | Automatically, as a lead with source *Website*. The note holds the enquiry, the property, the viewing date the visitor asked for and the page. A repeat enquiry from the same phone/e-mail becomes a comment on the open lead, not a duplicate. |
| **Bayut, Dubizzle, Property Finder, WhatsApp, calls, walk-ins, referrals** | Staff with CRM access create it with **+ Quick Add → New Lead** or CRM → Leads → **+ New**. |
| **CRM Vault workbooks** (Ejari 0–60 day renewals, vacant units) | Imported by the Admin; dispatched by Haseeb (chapter 16). |

### 9.2 Form: **New Lead** (CRM → Leads)

| Fill | Why |
|---|---|
| **Company / Client Name \*** | Who the client is. |
| **Department** | Off-plan, Secondary or Leasing: decides the pipeline and the routing rule. |
| **Contact person, E-mail, Phone / WhatsApp** | To reach the client. The phone is also used to find duplicates. |
| **Source** | Where the lead came from: drives campaign return and the routing rule. |
| **Marketing consent (PDPL)** | UAE data-protection law: never send marketing to *Opted out*. |
| **Campaign** | Links the lead to the campaign that produced it. |
| **Owner** | The responsible advisor (filled by routing if left empty). |
| **Interested in** | Apartment sale, villa lease, off-plan, commercial… |
| **Client Finance Status** | Cash buyer / mortgage pre-approved / mortgage required / developer payment plan / multi-cheque tenant. Decides which deals are realistic and which documents you will need. |
| **Current area, Target area, Estimated value, Bedrooms wanted** | The requirement, used for matching and the lead score. |
| **Search 3rd-Party Agent (A2A) Inventory** | Tick when our stock does not match: someone will look for a partner's unit (Form I). |
| **Non-Conversion / Lost Reason + Detailed Explanation** | **Required before you set the status to *Unqualified*.** Feeds the lost-reason report so management knows why deals are lost. |

Automatic on the lead: **Lead no.**, **Score** and **Heat** (Hot / Warm / Cold), **First response due** (the clock starts on creation — the dashboard reminds you to *respond within 15 minutes*), **First response**, **In lead pool**, **Routed by**.

### 9.3 Lead statuses

**New → Contacted → Qualified → Converted**, or **Unqualified** (with a lost reason). A converted lead cannot be reopened.

### 9.4 Buttons on a lead

- **Convert to customer** — creates a *Contact* (customer party) from the lead and links them. Do it once the client is real and you need to open a deal, offer or contract.
- Side panel **Follow Up** — schedule the callback.

### 9.5 Who gets the lead: **Routing Rules** (CRM)

A rule says: for leads with **Lead source** X and **Department** Y, share them among **Team** (role names, e.g. `Sales, Manager`) using **Round robin** or **Least open leads**. **Priority** 1 runs first. **Active** turns a rule on. Every assignment and reassignment is written to **Lead History** (assignment mode, reason, manager who approved). Reassigning a lead needs a reason and a target user.

### 9.6 Working the lead

| Screen | Use it to |
|---|---|
| **Phone Calls** | Call log (from the phone system when connected). |
| **WhatsApp** | Company WhatsApp chats inside the system (keeps history in the company, not on a personal phone). |
| **Email** | Company inbox and sending. |
| **Follow-Ups** (Calls & Activities) | Every call, meeting, visit, WhatsApp: **Type \***, **Subject \***, **Outcome** (Connected / No answer / Callback requested / Not interested…), **Follow-up date**. |
| **Message Drafts** | Messages that need a second person to approve before sending (e.g. review requests). "Another person must approve a message you wrote." |
| **Follow-up Sequences** | Drip messages: one step per line as `days|channel|message`, e.g. `1|WhatsApp|Hi {name}, thanks for your enquiry…`. **Sequence Enrolments** shows who is in which sequence. |
| **Messages Log** | Archive of company WhatsApp / phone / e-mail conversations with reply timers. Flags *personal WhatsApp diversion* (staff asking a client to move to a personal number). |
| **Mortgage Cases** | When the buyer needs a mortgage: bank referral and milestones. The bank must be chosen before the case moves past *Referred*; commission is marked received only after disbursal. |

### 9.7 Form: **Opportunity** (CRM → Opportunities)

Turn a qualified lead into an opportunity when there is a real requirement and a likely deal. It sits on a board by stage: **Prospecting → Qualification → Quotation → Negotiation → Won / Lost**. Marking it **Lost** requires the reason. Marking it **Won** queues a **Google review request** draft in Message Drafts (if the review link is set in Settings), which a second person approves and sends. Button: **Create quotation**.

---

## 10. Workflow B — Inventory: from new property to live advert

### 10.1 Step 1 — Form: **New Property Submission** (Properties → New Submissions, or + Quick Add → Submit Property)

Any advisor who sources a property fills it. **Why:** nothing enters company stock until it is checked, so we never advertise a fake, duplicate or unpermitted unit.

| Section | Fill | Why |
|---|---|---|
| Property details | **Core Department**, **Community**, **Building / Tower \***, **Unit No. \***, **Property type \***, **Listing purpose \*** (Sale / Rent / Both), **Area (sq ft) \***, floor, bedrooms, bathrooms, **Current occupancy** | Identifies the unit; building + unit number are checked for duplicates. |
| | **Seller / Unit Finance Status** (Cash title deed clear / Mortgaged — liability letter needed / Off-plan payment plan) | A mortgaged unit needs a bank liability letter before transfer. |
| | **Sourced via 3rd-Party Agent (A2A)** + agency, agent name, **agent RERA BRN**, **A2A split %** | The partner's share comes off the commission before the 50/50 split. |
| | **Detailed Seller / Landlord / 3rd-Party Agent Requirements** | What the owner wants (price, timing, cheques, tenant profile). |
| | **Asking sale price / Asking annual rent** | |
| Owner & permit | **Owner / developer name \***, verified owner (contact record), owner phone, **Owner ID & phone verified**, preferred contact method, **Inventory source \*** | Proves the person is the real owner. |
| | **Signed Form A / agreement no.**, **Price confirmation date**, **Trakheesi permit no.**, **Permit expiry date** | Required by RERA before any advert. |
| Review | **Sourcing broker \*** | Who gets credit. |

### 10.2 Steps 2–3 — the three checks (Dashboards → Daily Operations → *New Properties & Permits*)

| Button | Who presses it | What the system checks |
|---|---|---|
| **1. Check Property Details** | Inventory verifier (not the sourcing broker) | Unit exists and is available; owner authority. Blocked if a duplicate conflict is open. |
| **2. Check Permit** | Compliance verifier | Valid, non-expired **Trakheesi** permit number and expiry date. |
| **3. Approve & Publish** | A manager who is neither the sourcing broker nor the verifier | Everything above. Creates the **Property** record. |
| **Merge duplicate unit** | Independent listings manager | Resolves a "Potential Duplicate" while keeping the original broker's credit. Needs at least 10 characters of resolution notes. |

Workflow stage moves **Submitted → Inventory Verified → Compliance Verified → Approved for Publication → Published to Stock** (or Duplicate / Conflict Hold / Rejected). If you try to publish without all checks: *"Publication blocked (Control 3.07 / 7.07)… Incident logged."*

### 10.3 Form: **Owner Permits** (Properties → Owner Permits = Owner Agreements & Permits)

One record per approved listing: **Property \***, unit, **Verified owner \***, **Listing agent \***, **DLD Form A contract no. \***, *Title deed / Oqood verified*, *Owner ID / passport verified*, **Trakheesi permit no. \***, **Permit expiry date \***, authorised sale price / annual rent.
**Price changes:** enter the new price and the **Reason for price update**; a second manager must approve ("Price change requires second-person manager approval"). Status: *Pending Verification → Verified & Active*, or *Price Change Pending Approval*, *Suspended – Permit Expired*, *Expired*, *Revoked*. An expired permit suspends advertising.

### 10.4 Properties, Units, Communities, Developers

- **Properties** — buildings, towers, villa communities. Buttons: **Send to WhatsApp** (send the property to a client's number), related tabs *Mandates*, *Viewings*.
- **Units** — each apartment/villa/office with bedrooms, size, view, price/rent and status (*Available, Reserved, Sold, Leased*).
- **Communities** — 24 Dubai areas with average price per sq ft and rent. **Developers** — master developers and contacts. Keep both current; Market Pulse and the listing price check use them.
- **Payment Plans** — off-plan instalment templates. **Inspection Templates** — move-in/move-out checklists (one item per line).
- **Smart Search** — type a requirement in plain words ("2 bed Marina under 2.5M sea view") and get a shortlist for a buyer.

### 10.5 Listing Studio (Properties → Listing Studio)

The advertising room. Each listing gets a **quality score** from a weighted check:

| Check | Why |
|---|---|
| **Trakheesi / RERA advert permit** + **Madmoun QR** | Mandatory by DLD/RERA for every advert. |
| **Active Form A** (listing agreement) | Proof of owner authority. |
| **Photo set (≥ 10 HD photos)** | Portals rank complete listings higher. |
| **Description ≥ 300 characters**, **EN + AR** | Bilingual copy reaches more buyers. |
| **Price & area present**, **AED/sq ft within ±20% of community** | Catches typos and unrealistic prices. |
| **Fresh (listed ≤ 30 days)**, **Exclusive mandate** | Freshness and exclusivity. |

Buttons and filters: *All / Ready / Off-plan / Exclusive / Luxury / Family / Investor*, sort *Newest / Price / Quality score*, **AI listing copy**, **Send Listing Directly to WhatsApp** (**Open WhatsApp** or **Send via OS API**), *Portal syndication & leads* chart (live listings vs leads per portal). The **Compliance gate** keeps any listing without permit and Form A off the portals.

---

## 11. Workflow C — Secondary sale: from viewing to title deed

Follow the **Sales & mandates** sidebar top to bottom. Each step is a form; each form unlocks the next.

### Step 1 — **Seller Form A** (Sales → Seller Form A = Mandates)

The seller's agreement to let SWK market the property. **Fill:** Core Department, **Property \***, unit, **Type \*** (Exclusive Sale / Open Sale / Co-Broker…), **Owner / Landlord \***, **Listing Agent \***, co-agent, A2A details if co-brokering, asking price, **seller / buyer commission %**, minimum acceptable price, **Start Date \***, **Expiry Date \***, auto-renew, *Publish to Portals*, *Featured*, marketing instructions, special terms. **Why:** RERA requires a signed Form A before marketing; the commission % here flows into the deal.

### Step 2 — **Viewings** (+ Quick Add → Book Viewing)

**Fill:** **Mandate \***, **Property \***, unit, **Lead / Buyer \***, **Accompanying Agent \***, **Scheduled At \***, duration, meeting point. After the visit: **Status** (Completed / No-Show / Rescheduled…), **Feedback**, **Interest (1–10)**, **Follow-up Required / By**, notes. The agent can **check in live by GPS** at the site (*Site Visit Live Check-in At*). **Why:** proves the viewing happened (protects against invented-viewing disputes over who introduced the buyer) and feeds the agent's activity count.

### Step 3 — **Buyer Offers**

Record every written offer: property, buyer, amount, terms, status. **Why:** the accepted offer becomes the base of the sale contract.

### Step 4 — **KYC Checks** (Compliance) — before Form F

For buyer **and** seller, one record per check: **Client \***, **Check \*** (Identity document, Residence visa, Proof of address, Trade licence, Beneficial owners 25%+, Source of funds, Sanctions screening, PEP screening, Adverse media), **Result** (Pass / Fail / Pending), dates, evidence. **Why:** UAE AML law for real-estate brokers. **The system will not let you sign Form F until KYC & compliance are cleared** ("Complete KYC & Compliance clearance before signing MOU / Form F"). A client with a *confirmed sanctions match* is blocked from new deals and documents.

### Step 5 — **Sale Contract (F)** (Sales Contracts)

The signed **Form F / MOU**. Record property, buyer, seller, price, deposit, dates and the signed status. Printable.

### Step 6 — **Escrow**

**Fill:** **Sales Contract \***, **Bank \***, account name, masked account number, IBAN, **Expected Amount**, opened date, **DLD Escrow Reference**, release conditions. Status moves *Opened → Funds Received → Funds Verified → DLD Submitted → Title Transfer Pending → Title Transferred → Funds Released → Closed*. **Why:** the deposit is held safely until transfer.

### Step 7 — **Developer NOC** (+ Quick Add → Request NOC)

**Fill:** **Developer \***, **Property \***, unit, **Sales contract (Form F)** or **Qualifying deal file** (one is required — an NOC is never raised from inventory alone), **Seller \***, **Buyer \*** (must be different people), **Transaction type \***, *Developer checklist complete*, signed seller NOC form no., **unpaid service charges** + *Service charges paid* + receipt no., NOC fee, developer portal ref.

Then three buttons (Daily Operations → *Developer NOCs*):

| Button | Rule |
|---|---|
| **1. Submit to Developer** | Checklist complete, seller authorisation recorded, service charges settled with evidence. |
| **2. Attach NOC Certificate** | Only after submission. Enter certificate number, issue and expiry dates, file. |
| **3. Approve NOC** | By a **different person** from the one who submitted. Needs the portal reference, the certificate number and a **future** expiry date. Unlocks the closing stage. |
| **Hold NOC for review** | Suspected fake or unverified NOC: stage held and escalated. |

### Step 8 — **DLD Transfer** (DLD filings)

One record for each government filing: **Type \*** (Form A, Form B, Form I, Form F, Developer NOC, Oqood, Title deed transfer, Mortgage registration, Ejari, Ejari renewal…), status, **reference number** (required once *Registered*), deal, property, contract, client, agent, due / issued / valid-until / submitted / registered dates, **Government fee** and *Fee paid*. **Why:** nothing expires unnoticed; fees are tracked. A registered filing can only become Expired or Cancelled.

### Step 9 — **Sales Tracker** (+ Quick Add → New Sale File)

The full sale file that ties everything together: category, buyer finance status, **Legal UAE Payment Channel**, A2A details, **Verified property \***, **Buyer \***, seller, **Primary broker \***, **Agreed sale price \***, deposit, links to the lead, accepted offer, Form F, deal file, NOC request, commission invoice and bank receipt.

Its **controlled stage** moves only through the official order — no jumping:

**Lead Qualified → Viewing Completed → Offer Accepted → KYC & Compliance Cleared → MOU / Form F Signed → Developer NOC Verified → Transfer / Title Deed Verified → Invoiced & Reconciled → Closed**

Each step is checked: KYC verified, RERA forms signed, NOC independently verified, external title deed / Oqood reference verified, and finally *both* a posted tax invoice and a verified bank receipt. If the primary broker's RERA card has lapsed, the deal cannot move until an authorised **cover broker** is assigned.

**Special cases** (field *Special case / hold reason*), each with a "How this issue is being solved" note: buyer fails mortgage approval; seller has an outstanding mortgage; power of attorney; company buyer with several beneficial owners; buyer requests a price change; and others (11 in total). While a special case is open the deal is *On Hold – Exception Active*. Buttons: **Flag Power of Attorney check**, **Clear special case**, **Move to Form F Signed**.

### Step 10 — **Deal Folders** (Deal Files)

The closing and billing file: **Deal Name \***, department, **Deal Type \***, status, **Branch \***, property, unit, client, owner, listing and buyer agents, A2A share, **Buyer Finance Status**, **Legal UAE Payment Channel**, **Deal Date \***, deal value, commission %. Automatic: Deal No. (`DL-YY00000`), commission, **SWK 50%** and **Advisor 50%** net shares, revenue, cost, profit. Child tables: **Charges** (what to bill and pay) and **Timeline**.
Buttons: **Share client status link** (a private link the client opens to follow progress), **Print deal file report**. Branch and deal date cannot change once the number is issued; completed deals are locked and cannot be deleted.

### Step 11 — **Withdrawals** — only if the deal falls through (chapter 15.2)

---

## 12. Workflow D — Off-plan sale

1. **Off-Plan** screen (Properties): launch catalogue — developer, community, *Launch price from*, *Handover*, *Payment plan*, *Units left*, escrow bank, RERA project, *Total incl. 4% Oqood*, *SWK commission estimate*. Buttons **Add developer**, **View payment plan**, **Open property record**.
2. **Payment Plans**: instalment templates (e.g. 60/40, post-handover months). The calculator **Off-Plan Schedule** turns a plan into dated milestones.
3. Lead → viewing of the show apartment → **reservation / EOI**. Money goes **only** to the developer's DLD escrow or the SWK company account.
4. **Developer SPA** signed → enter *Developer booking / SPA no.* and tick *Developer SPA signed* on the Sales Tracker.
5. **Oqood** registered at DLD (4% + admin fee) → DLD filing of type *Oqood registration*.
6. Commission: invoice the **developer** (+5% VAT), record the receipt, then the 50/50 split (chapter 14).
7. Assignments (resale before handover) need the revised SPA / Oqood reference to complete.

---

## 13. Workflow E — Leasing: from landlord to key handover and renewal

### 13.1 Before the lease

- **Landlord mandate** (Sales → Seller Form A with type *Exclusive Lease / Open Lease*) and the Form A permit; or, when no direct stock matches, an **A2A partner** unit (Form I).
- Advert on **Bayut & Dubizzle** through Listing Studio.
- Tenant lead → viewing → **tenant KYC** (passport, UAE visa, Emirates ID).

### 13.2 Form: **New Lease (Ejari)** (Leasing → Leases & Ejari, or + Quick Add)

| Fill | Why |
|---|---|
| **Unit \***, property, **Landlord \***, **Tenant \***, leasing agent | Parties to the Unified Dubai Tenancy Contract. |
| A2A details (agency, agent, BRN, %, AED) | Partner share comes off before the 50/50. |
| **Promoted Portal** | Which portal produced the tenant. |
| **Type \*** (Residential, Commercial, Office…), **Start Date \***, **End Date \*** | Term (months) is calculated. |
| **Annual Rent \***, **Payment Frequency**, **Number of Cheques** | Builds the rent schedule. |
| **RERA index average rent** | The system calculates the **Allowed increase %** and **Maximum renewal rent** under Decree 43/2013. |
| Security deposit, **Agency Fee / %**, deposit escrow | What the tenant pays upfront. |
| **Ejari Number**, registration date, certificate | Fill when Ejari is registered. |
| VAT applicable / treatment (residential is usually exempt; commercial 5%) | Correct invoicing. |
| Service charge, special clauses, landlord / tenant obligations, witnesses, signed date | Contract content. |

Statuses: *Draft → Pending Ejari → Ejari Registered → Active → Notice Served → Expiring → Expired / Renewed / Terminated / Disputed*. Leases cannot be deleted. Child tables: **Rent Schedule** and **Service Charges**.

### 13.3 After signing

| Step | Screen | What to do |
|---|---|---|
| 2 | **Rent Schedules** | One line per rent instalment (due date, amount, status). |
| 3 | **Rent Cheques** (PDC Vault) | Register every post-dated cheque: cheque no., drawer bank, amount, maturity date. Filters *In Vault, Due Soon, Deposited, Cleared, Bounced*. Shows exposure by bank and the **bounced-cheque procedure** (UAE Federal Decree-Law 14/2020; civil execution through the Rental Dispute Centre) and **UAEDDS direct debit** readiness. Button **Log rent schedule**. |
| 4 | **Rent Receipts** | Record rent collected (printable receipt). |
| 5 | **Inspections** | Move-in / move-out: **Unit \***, **Type \***, **Scheduled At \***, inspector, tenant present, checklist (from a template), findings, actions, *Signed by*, rectification cost. The **Inspection App** (Properties) does the same on a phone with photos and signature. |
| 6 | **Handovers** | Keys and access cards: **Unit \***, **Type \*** (Move-In / Move-Out / Snagging…), **Scheduled At \***, meter readings (DEWA / gas / chiller), keys & cards handed over, defects. |
| 7 | **Maintenance** | Repairs and work orders. Quotes needing landlord sign-off appear in Landlord Hub. |
| 8 | **Service Charges** | Building fees per unit. |

### 13.4 Renewal

The Leases list shows leases near their end. Use the **RERA Rent Index** calculator (or the lease's own *Maximum renewal rent*) to set the new rent, send the rent-change notice (the system calculates the *Notice deadline*: the end date minus *Renewal Notice (days)*, 90 days if left empty), then create the renewal and an **Ejari renewal** filing.

### 13.5 Landlords

- **Landlord Hub** (Owner 360): each landlord's units, current rent, market value, net yield, RERA renewal cap, *Hold vs Sell* signal, Golden Visa status, open repair approvals. Buttons **Add Landlord**, **Assign Units**, **Manage Units**.
- **Statements**: owner payout statements (rent collected less fees and expenses), printable.
- **Service Portal**: tenants, landlords and vendors can see their own items when given portal access.

---

## 14. Workflow F — Money: invoice, receipt, commission, payout

### 14.1 The five legal payment channels (only these)

1. **SWK Company Bank Account** (AED / FX)
2. **Developer DLD Escrow Account**
3. **Manager's Cheque** (in seller / developer name) or **Post-Dated Cheques** (to landlord / company)
4. **Licensed UAE Exchange House** (worldwide currency exchange)
5. **UAE-permitted crypto / USDT** through a **VARA-licensed gateway** to the company account

**Never** a Sales Advisor's or staff member's personal account. The system refuses any receipt, deal or sale that says otherwise and asks you to confirm that no client money went to a personal account.

### 14.2 The 50/50 formula

```
Company Net Pool      = Gross commission (excluding VAT) − 3rd-party A2A share (− external referral fee)
SWK Company share     = 50% of the Net Pool
Sales Advisor share   = 50% of the Net Pool
```

**Example:** a secondary sale with gross commission AED 100,000 (excl. VAT). The buyer came through a partner agency that takes 20%.
A2A share = 20,000 → Net Pool = 80,000 → **SWK 40,000**, **Advisor 40,000**. The tax invoice to the client is 100,000 + 5% VAT = **105,000**. The **Commission Split** calculator does this for you.

### 14.3 Customer side

| Step | Screen | Buttons and rules |
|---|---|---|
| 1 | **Invoices** — Tax Invoice / Proforma / Debit Note / Credit Note | Fill **Document type \***, **Customer \***, deal / property / unit / lease, **Invoice date \*** (a tax invoice must be issued within 14 days of supply), due date, **Currency \***, lines (each line with VAT). Buttons: **Post** (locks it and posts to the books), **Record receipt**, **Issue credit note** (the only way to reduce a posted invoice; reason required), **Convert to tax invoice** (from a proforma), **E-invoice XML (PINT AE)** / **Submit e-invoice to provider**, **Void** (with reason; not possible once paid — void the receipts first), **Print**, **E-mail**. Optional **Own invoice number** if a specific number must print. Credit limits are checked: over the limit, a finance approver must post. |
| 2 | **Receipts** | Money received: party, amount, method, bank account, allocation to invoices. **Post**, **Allocate on-account balance** (spread an advance over later invoices), **Void**. |
| — | Client's **Statement of account** | Contact record → *Statement of account*. |

### 14.4 Commission and payout

| Step | Screen | What happens |
|---|---|---|
| 3 | **Commissions** (Agent Commissions) | One per deal and agent: **Agent \***, contract / lease / mandate, **Source \***, **Gross Commission (Excl. VAT) \***, A2A share; the net pool and the two 50% shares are calculated. Optional **holdback %** with release date. Statuses *Pending → Approved → Paid* (or Disputed / Cancelled). |
| 4 | **Agent Payouts** (Commission Entitlements) | Tracks the commission from *Forecast → Earned → Invoiced → Collected → Eligible for Payout → Approved for Payout → Paid & Reconciled*. Three buttons in Daily Operations → *Commission Payouts*: **1. Request Payout** (Finance), **2. Manager Approve** (a different person), **3. Mark Paid** (a third person, the treasury payer). |

Payout rules: **no payout before the commission is invoiced and the cash is collected**; any open lead or co-broker dispute blocks the payout; if the agent's **IBAN changed recently**, two different people must verify it (with a phone call-back reference) first; the agent can never request, approve or pay their own commission; a manager who arranged the deal cannot approve its payout.

### 14.5 Supplier side and books

| Screen | Use |
|---|---|
| **Supplier Bills** | Vendor invoices. Same vendor invoice number cannot be entered twice. Bills above the approval limit (Settings → Finance & approvals) need **Request approval** → **Approve** (another person) → **Post** → **Pay**. |
| **Payments** | Money paid out. Same approval rule above the limit. **Allocate advance**, **Void**. |
| **Purchases** | Office supply requests. |
| **Bank Matching** | Import bank statement lines (CSV) and **Reconcile…** each one to a receipt or payment. |
| **Profit & VAT** | Profit & loss, balance sheet, VAT return figures. |

Posted documents cannot be changed — void or credit them. Months before the **accounting lock date** cannot receive new postings.

---

## 15. Workflow G — When things go wrong

### 15.1 Approvals (Dashboards → Approvals)

Any special request goes here: high-value payment, listing publication, price reduction, commission advance or split override, contract execution, HR offer or salary change, staff exit, policy exception. **Fill:** **Request summary \***, **Workflow type \***, risk level, approval mode (Single / Four-eyes sequential / Committee), step 1 and step 2 approvers, deadline, **Supporting documents & justification \***. Approvers press **Approve** or **Reject** with comments (at least 5 characters). The requester can never approve their own request, and step 2 must be a different person from step 1.

### 15.2 Deal withdrawals and client refunds (Sales → Withdrawals)

Use when a buyer, tenant, seller, landlord or developer pulls out after money was paid.

**Form: Submit Withdrawal** — Department, client, linked deal file and property (optional), **Withdrawn By / Situation** (client withdrawal / mortgage contingency, secondary seller or landlord, developer, mutual agreement), **Amount Paid by Client \***, **Original Legal Payment Mode**, **Terms Agreed at Time of Payment** (per signed booking / Form F terms), **Agreed Forfeiture / Deduction %**, **Refund Settlement Channel** (SWK company bank wire, developer escrow refund cheque, manager's cheque to client, return of undeposited PDCs, licensed exchange house, VARA-licensed USDT to the verified client wallet), **Detailed Reason & Situation Narrative \***.
The system calculates the **Deduction** and the **Net Refundable to Client** from the agreed terms. Press **Submit Withdrawal & Alert Owner / Manager**.
Status: **Pending Review → Manager Reviewed – Awaiting Owner → Owner Approved → Refund Paid** (or Rejected). **Only the Owner can approve the refund**, and no refund is processed before that approval.

### 15.3 Deletions (Dashboards → Delete Bin)

1. Anyone other than the Owner who has delete rights presses **Delete** and writes the **mandatory reason**.
2. The record goes to the **Pending Delete Bin** with a full snapshot ("Awaiting Owner Shabib Siraj"). Owner, Haseeb and Talha are notified.
3. The Owner either **approves** (permanently deleted, snapshot kept in the audit log) or **rejects** (record restored).

The same screen holds **Pending Manager Admin Decisions**: Haseeb raises a decision (*Client Refund / Deal Settlement*, *Special Commission / A2A Split Exception*, *Portal Marketing Spend (Bayut / Dubizzle)*, *HR / Staff Visa / Onboarding*, *Operational Policy / Budget*) with subject, reasoning and financial impact, then **Send to Owner Shabib Siraj**. The Owner records the decision and an optional note.

### 15.4 Lost leads and failed deals

A lead set to *Unqualified* needs a **Non-Conversion / Lost Reason**; an opportunity set to *Lost* needs the reason. The **lost-reason report** (Documents → Reports) shows where deals are lost.

### 15.5 Complaints and compliance reviews (Compliance → Risk Cases)

Client complaints and system alerts (personal WhatsApp diversion, invented viewing dispute, fake NOC, unauthorised advert, lapsed broker card, off-hours location access, AML escalation). A person implicated in a case can never investigate or decide it. The staff member can **Submit explanation** (appeal); an independent person reviews the appeal. Records under **Legal Hold** cannot be changed or deleted.

---

## 16. Workflow H — CRM Vault and the lead handover chain

Client phone numbers are company property and personal data under UAE PDPL. They move through a fixed chain, and staff never receive a raw number.

| Stage | Holder | Who sees it | Exit |
|---|---|---|---|
| 1. **Admin Custody** | SWK Admin | Owner, Admin | Admin presses **Release desk** (or **Release everything to Operations Manager**) |
| 2. **With Operations Manager** | Haseeb | Owner, Admin, Haseeb | Haseeb dispatches leads (masked) and releases personal documents |
| 3. **Staff** | Named staff member | That person only | Works the lead and records the outcome |

Owner and Admin can **Recall** any document to Admin Custody at any time.

### 16.1 Admin — intake

1. CRM → **CRM Property Vault** → tab **Import Excel & Masked Bridge Setup** → upload the desk dialer workbooks. Leads land in Admin Custody, numbers encrypted ("Importing & Encrypting…"). Re-importing updates leads without changing their stage.
2. Check the count per desk against the roster.
3. Tab **Custody & Handover** → upload documents (playbooks, field guides, booklets). Dialer workbooks are refused there (their leads are already in the vault). Unknown file names: choose the type and staff member first.
4. **View** a sample, then **Release desk** per verified desk.

### 16.2 Haseeb — dispatch

1. Master vault list: filter by dataset, desk, division, territory, dispatch state, status.
2. Tick leads → **Assign** → **Select Sales / Leasing Agent** → under **Choose Exactly Which Details the Agent Can See**, set visibility. Phone and e-mail are **always hidden**; owner name and commission hidden by default; unit, floor, rent, expiry and playbook shown as needed.
3. Dispatch in working batches (about a week of calls), not a whole desk at once. **Unassign** leads not worked in time and re-dispatch them; unassign everything the same day a staff member leaves.
4. Release each **Personal Playbook** and **Field Guide** with **Release to staff**. **Calling Booklets** hold raw numbers and can never be released.
5. Each evening: **Haseeb 5:30 PM Sign-Off** on the day's results.

Other tabs: **Daily Routes / Masked Calls** (log of every masked call and WhatsApp relay), **Direct Phone Contacts**, **Dispatched to Agents**. The masked-calling bridge (Twilio two-leg bridge, or a UAE SIP / PBX webhook) is set in the same tab; calls can be recorded for quality review.

### 16.3 Leads statuses in the vault

**Assigned → In Progress → Viewing Scheduled → Offer / MOU → Closed Won / Closed Lost / On Hold**

### 16.4 Staff — My Assigned Deals

1. Open **General Workspace → My Assigned Deals**. You see only your dispatched properties: cluster, target doors, QR serials, Haseeb sign-off and the **Closing Playbook**.
2. **Call Owner (Masked Bridge)** — the system calls you and the owner and joins the two lines. Neither side sees the other's number.
3. **Masked WhatsApp** → write the message → **Send Masked WhatsApp**.
4. Change the **status** after every contact.
5. **My documents** shows your playbook and field guide page by page, watermarked with your name, e-mail and date. Downloading, copying and printing are blocked.

**Do not** screenshot, export or forward lead data outside SWK OS. If the masked call says the bridge is not configured, tell Admin, Shabib or Haseeb; your staff phone number must be set in your HR record.

---

## 17. Workflow I — People

### 17.1 Attendance (everyone)

1. Be on the **office Wi-Fi** (locked by the Admin). Off the office network: "Not on the office Wi-Fi. Connect to …".
2. Scan the reception QR — inside SWK OS (**Attendance Check-In → Scan & Check-In**) or with your phone camera (the QR is a link to the sign-in step).
3. Sign in with **your own** e-mail and password within **90 seconds** ("Code read. Sign in within 90 seconds.").
4. The time is saved in Dubai time.

Rules: one phone belongs to one person; one phone checks in one person per day; a new phone needs **Approve** by management (Owner/Admin/Haseeb can also **Block** a device); attempts are rate-limited; staff on a temporary password must change it first. **10:05 AM** is the on-time limit. Three late arrivals in seven days raise an alert.

Leadership tools on the same screen: **Attendance control (Owner / Manager)**, **Devices** (approve / block), **Open the reception code screen** (fixed code for a printed poster, or a code that changes every 30 seconds; **Regenerate** makes all printed codes useless after a leak).

Records: **Attendance** (one row per person per day: check-in, check-out, hours, status Present / Late / Field Site Visit / Half day / Remote / On leave…, check-in mode) and **Gate Logs** (every scan with method, late minutes, overtime, GPS for field duty, manager correction reason). Corrections need a written reason and are audited.

### 17.2 Daily Work Report (everyone, before leaving)

**Form:** Employee \*, **Workday date \***, day classification. The system fills **calls logged, tasks completed, leads progressed, viewings & visits, offers / reservations** automatically. You write **Key results achieved today** and **Next workday top priorities** — **at least 30 characters each** — plus blockers and evidence references. Optional *Flag private HR or compliance concern*.
**Submit** freezes it ("Submitted (Frozen)"). Your line manager (not you) **Approves** or **returns it for clarification**. To change a frozen report, ask the manager to return it. Missing reports are found by **Missing report check** and become manager tasks.

### 17.3 Leave

**Form:** **Employee \***, **Leave type \*** (Annual, Sick, Unpaid, Maternity/paternity, Compassionate, Hajj, Public holiday swap), **From \***, To, reason. Manager presses **Approve**, **Reject** or **Cancel leave**. The system blocks leave beyond the annual entitlement and overlapping requests.

### 17.4 Field visits (Field Service)

**Field Visits** are appointment check-ins for viewings and client meetings. They work **only during the scheduled appointment window** and turn off by themselves outside work hours (privacy). Fields: employee, **Duty date**, **Scheduled start / end**, **Assigned community / building**, linked viewing, arrival / departure, GPS, **SOS emergency** flag, manager review. Location data is purged automatically after its retention date.

### 17.5 Staff records (Haseeb, Owner, Admin)

| Screen | Fill and why |
|---|---|
| **Staff List** (Employees) | Personal and document details: passport, Emirates ID, visa, labour card, work permit and **expiry dates** (alerts before expiry), compensation model (**Commission only — 50/50 company visa, 0 basic** / salaried + commission / salaried), salary, **IBAN**, WPS routing code, MOHRE person ID, leave entitlement. |
| **Brokers (BRN)** (Agents) | **Full Name \***, **DLD Broker ID (RERA No.) \***, card no., expiry, department, team lead, commission split %, tier, monthly target, commission IBAN. |
| **Joining & Exit** | Hiring, onboarding, transfer, probation, disciplinary, resignation, emergency exit. On exit, name the colleague who receives the clients and chats: the system disables the account, revokes sessions, reassigns leads, WhatsApp threads, viewings and NOC tasks, and keeps all history. |
| **Visas & IDs** | PRO cases step by step: checklist → application (needs signed offer letter and MOHRE contract) → medical → Emirates ID biometrics → approved (official reference required) → stamped → completed (signed off by HR, not the PRO who submitted). |
| **Payroll (WPS)** | Monthly payslips: **Approve** → **Mark paid**. One payslip per person per month; paid payslips are locked. |
| **Leaderboard** | Top advisors by deals, value and activity. |
| **Targets** (CRM) | Monthly goal per advisor: leads converted, calls, viewings, deals won, won value. |

### 17.6 Broker activation (Compliance → Broker Cards)

Before an agent can do regulated work: work visa verified, **RERA exam** passed, **AML & privacy training** done, **code of conduct** signed, valid **BRN** and future card expiry. Two buttons, two different people: **1. HR Confirm Visa** → **2. Activate Agent** (compliance officer). A lapsed card blocks the agent's deals until a cover broker is assigned.

---

## 18. Screen-by-screen guide to all 12 apps

*(Owner, Admin and Haseeb see all of these. Fields for every `/e/…` screen are in Part B.)*

### 18.1 Dashboards

| Screen | What it is | Main buttons |
|---|---|---|
| **Overview** | Daily summary: pipeline value, commission & revenue, deals by stage, lead queue, new leads, viewings, offers awaiting decision, portfolio (units, vacant, mandates), compliance watch (RERA, DLD, licence health), price per sq ft, latest listings, live activity. | **New lead**, **Book viewing**, **Open a deal**, **Deal toolkit**, **Open Department Pipeline**, **Jump into a workspace**, step-by-step company operation buttons |
| **Deal Pipeline** | 8-stage board for all three departments (chapter 8). | Department & advisor filters, **New Deal File**, **Log Withdrawal**, drag cards |
| **Approvals** | All two-person requests (15.1). | **Approve**, **Reject** |
| **Delete Bin** | Deletions waiting for the Owner, and Haseeb's administrative decisions (15.3). | Approve delete, Restore, **Send to Owner Shabib Siraj** |
| **Calendar** | Every dated item: viewings, closings, expiries, follow-ups, leave, document expiries. Month / Week / Day / Agenda views. | **Today**, Previous/Next, Go to date, search, *Assigned to me*, *Include completed*, **Schedule activity** |
| **Daily Operations** | Control centre with tabs: *Company Overview*, *Daily Work Reports*, *New Properties & Permits*, *Developer NOCs*, *Sales & Transfers*, *Commission Payouts*, *Visas & Agent Cards*, *WhatsApp & Field Visits*, *Compliance & Quality*, *Approvals & Staff Handover*. | The step buttons described in chapters 10–17 (**1. Check Property Details**, **3. Approve NOC**, **2. Manager Approve**, **Missing report check**, **Manager Quality Check**, **Queue Retry**, **Verify Appointment Check-In**, **Request second review**…) |
| **Market Pulse** | 24 Dubai areas with price/sq ft, year-on-year change, gross yield, transaction volume; rental yield league; SWK portfolio vs market; area companion (landmarks, metro, schools, hospitals, beach/park, outlook to 2041, pitch phrases — tap to copy); mortgage calculator (expat 80% / national 85% LTV, bank rates, DBR). | **Add comps**, **Add property**, **Apply Rate**, **Open Full Toolkit** |
| **Attendance Check-In** | Reception QR scan (17.1). | **Scan again**, **Approve** / **Block** device |
| **AI Assistant** | Ask questions about company data and draft messages ("Which leases expire in 60 days?"). | — |

### 18.2 Properties

New Submissions · Owner Permits · Properties · Units · Listing Studio · Off-Plan · Inspection App · Inspection Templates · Service Portal · Smart Search · Payment Plans · Communities · Developers — all described in chapters 10, 12 and 13.

### 18.3 CRM

CRM Property Vault · My Assigned Deals · Leads · Phone Calls · WhatsApp · Team Chat (message colleagues) · Email · Follow-Ups · Opportunities · Contacts · Messages Log · Campaigns · Message Drafts · Follow-up Sequences · Sequence Enrolments · Routing Rules · Mortgage Cases · Targets · Lead History · Reviews — chapters 9 and 16.

- **Contacts** (Customers & Parties): one record per buyer, seller, landlord, tenant, vendor or co-broker. Tick **at least one role**. KYC status and expiry, **sanctions screening** (a *confirmed match* blocks new deals and invoices), PEP, beneficial owners (25%+), source of funds, **marketing consent**, TRN (15 digits for UAE). Duplicate names are refused. Buttons **New job**, **New quotation**, **Statement of account**; tabs Contacts, Deals, Invoices, Receipts, Opportunities, Calls & activities, Contracts, Mandates.
- **Campaigns**: name, channel, dates, budget, actual cost; tab *Leads* shows what each campaign produced.
- **Reviews** (Quality Reviews): service ratings (accuracy, service, overall). A staff member can challenge an assessment; a different manager decides.

### 18.4 Sales & mandates

E-Signatures · Seller Form A · Viewings · Buyer Offers · Sale Contract (F) · Escrow · Developer NOC · DLD Transfer · Sales Tracker · Deal Folders · Withdrawals — chapter 11.
**E-Signatures:** **Document \***, **Text to be signed \***, **Signer name \***, signer e-mail → **Sent** → the client signs by typing their name through the signing link. The system stores the document fingerprint, time and IP. A signed or declined request cannot be edited.

### 18.5 Leasing & management

Leases & Ejari · Rent Schedules · Rent Cheques · Rent Receipts · Inspections · Handovers · Maintenance · Service Charges — chapter 13.

### 18.6 Landlords

Landlord Hub · Statements — chapter 13.5.

### 18.7 Accounting

Invoices · Receipts · Commissions · Agent Payouts · Supplier Bills · Payments · Purchases · Bank Matching · Profit & VAT — chapter 14.

### 18.8 Compliance

| Screen | Use |
|---|---|
| **KYC Checks** | Client due diligence (chapter 11 step 4). |
| **RERA Centre** | Tabs *Regulatory Overview & Licences*, *Trakheesi & Madmoun Permits* (which listings are cleared for Property Finder / Bayut / dubizzle, which are locked), *goAML / KYC & DNFBP Screening*, *Statutory RERA Forms Library* (open forms in the Letter Studio). Also UAE PDPL controls. |
| **Broker Cards** | Agent activation (17.6). |
| **AML Reports** | goAML reports: STR, SAR, REAR (real-estate activity report, e.g. cash at or above the threshold), FFR, PNMR. **Never tell a client a report is being considered or filed — tipping off is a crime.** A filed report cannot be changed; *Not required* needs the compliance officer's written decision. |
| **Risk Cases** | Complaints and alerts (15.5). |
| **Trade Licences** | Company licences and renewal dates. |
| **Registrations** | Every licence, permit and registration (trade licence, ORN, BRNs, Trakheesi, goAML, VAT, corporate tax, MOHRE, WPS, insurance…) with **expiry date** and **Remind before expiry (days)**: drives alerts and the compliance score. |
| **File Vault** | All uploaded documents. |

### 18.9 Employees

Staff List · Brokers (BRN) · Joining & Exit · Visas & IDs · Attendance · Leave · Payroll (WPS) · Leaderboard — chapter 17.

### 18.10 Field Service

Reception QR · Gate Logs · Field Visits · Daily Reports — chapter 17.

### 18.11 Documents & Manual

| Screen | Use |
|---|---|
| **Calculators** (Toolkit) | **Buyer Cost-to-Close** (DLD 4%, trustee, agency, mortgage registration, total cash to close), **CBUAE Mortgage** (LTV caps: expat/non-resident, UAE national, off-plan 50%; 50% DBR ceiling; monthly EMI; max affordable price), **RERA Rent Index** (Decree 43/2013 slab, allowed increase, maximum new rent), **Tenant Move-In** (deposit 5% / 10% furnished, DEWA deposit, agency fee, Dubai Municipality 5% housing fee, cheque split), **Yield & ROI**, **Commission Split** (50/50 after A2A, tax invoice incl. 5% VAT), **Golden Visa** (progress to AED 2,000,000), **Off-Plan Schedule**. |
| **Letter Studio** | Contracts, letters and the 82 company document templates. Built-in templates cannot be changed: **Duplicate** to make your own. An issued document cannot be changed or deleted: duplicate it for a new version or mark it Cancelled. |
| **Reports** | Business exports and reports (including the lost-reason analysis). |

### 18.12 Settings — chapter 21.

---

## 19. Messages the system shows when it blocks you

| You see | It means | Do this |
|---|---|---|
| "Complete KYC & Compliance clearance before signing MOU / Form F" | Buyer/seller KYC not passed. | Finish the KYC Checks for both parties. |
| "Publication blocked (Control 3.07 / 7.07)…" | Listing lacks owner authority, permit or one of the checks. | Complete New Submission checks 1–3 and the Owner Permit. |
| "Valid, non-expired RERA Trakheesi advertising permit number and expiry date are required…" | Permit missing or expired. | Get / renew the Trakheesi permit and enter number + expiry. |
| "Resolve the duplicate building/unit conflict before verifying this submission" | Same building + unit already submitted. | Ask a listings manager to **Merge duplicate unit**. |
| "Developer NOC Control (3.08): An NOC request requires a qualifying sales contract or deal file" | NOC raised without Form F or deal. | Link the sales contract or deal file. |
| "Outstanding service charges must be settled and supported by payment evidence…" | Service charges unpaid. | Record payment and the receipt number. |
| "Independent Reviewer Control…" / "A different user must decide this approval" / "Maker-Checker Control…" | You submitted it, so you cannot approve it. | Ask another authorised person. |
| "Stage Control (4.04): Direct stage jumps are prohibited" | Tried to skip a sale stage. | Move one stage at a time with the stage buttons. |
| "Transaction has an active unresolved exception" | Special case open. | Resolve it and press **Clear special case**. |
| "Regulated Action Blocked (7.08 / 10.6): Primary broker RERA card has lapsed…" | Broker card expired. | Renew it, or assign an authorised cover broker. |
| "Collection Gate (4.08): Commission must be invoiced and cash-collected before initiating payout" | Invoice not posted or money not received. | Post the invoice, record and reconcile the receipt. |
| "IBAN Swap Gate (7.06)…" | Agent's bank account changed. | Two different people verify the new IBAN with a call-back reference. |
| "UAE Compliance Violation: Client payments cannot be received into a Sales Advisor … personal account" | Personal account selected / implied. | Use one of the five legal channels. |
| "Select a non-conversion / disqualification reason before marking the lead as Unqualified" | Lost reason missing. | Choose the reason and explain. |
| "Both the workday outcomes (min 30 characters) and the next-day plan (min 30 characters) are mandatory" | Daily report too short. | Write proper sentences. |
| "Submitted daily accountability reports are frozen…" | Report already submitted. | Ask your manager to return it. |
| "Exceeds annual leave entitlement" / "This overlaps another leave request" | Leave rule. | Change the dates or type. |
| "Posted … cannot be changed. Void it or issue a credit note." | Invoice/bill already posted. | Credit note or void + new document. |
| "Accounting period is locked up to …" | Month closed. | Use a date after the lock, or ask the Owner. |
| "Bills / Payments of … or more need approval. Request approval first." | Over the limit. | **Request approval**, then another person approves. |
| "Credit limit exceeded for …" | Client over credit limit. | A finance approver must post it. |
| "A party with this name already exists" | Duplicate contact. | Use the existing contact. |
| "Not on the office Wi-Fi…" / "This device is registered to another person…" / "The check-in expired…" | Attendance rule. | Join office Wi-Fi; use your own phone; scan again. |
| "Change your temporary password before using the application" | First sign-in. | Choose your own password. |
| "Account temporarily locked…" | Too many wrong passwords. | Wait 15 minutes or ask Admin/Owner to unlock. |
| "… of the selected leads are still in Admin Custody…" | Vault leads not yet released to Haseeb. | Admin must **Release desk** first. |
| "This file contains client phone numbers and cannot be given to staff…" | Tried to release a calling booklet. | Dispatch the leads through the vault instead. |
| "Masked Bridge Calling (Twilio) is not fully configured yet…" | Calling bridge not set. | Admin/Owner/Haseeb set it in CRM Vault → Import Excel & Masked Bridge Setup. |
| "Record is locked under Legal Hold by Compliance Case …" | Under investigation. | Wait for the compliance case to close. |
| "Deal withdrawal refund must be approved by Owner (Shabib Siraj) before processing refund" | Refund not approved. | Owner approves in Withdrawals. |

---

## 20. What the system does by itself

| Time (Dubai) | Automatic job |
|---|---|
| Every 15 seconds | Runs workflow automations (follow-ups, sequences). |
| Every minute | Sends queued e-mails; daily plan reminders. |
| Every 5 minutes / hourly | Routine checks (SLA timers, expiry alerts, notifications). |
| 02:00–05:00 | Nightly backup (when enabled); purge of old call recordings per retention; demo workspace rebuilt (03:00). |
| 06:00 | Daily DLD transactions and real-estate news sync (Market Pulse, Market News). |
| 07:30 | WhatsApp daily report to the Owner. |
| 08:30 | Owner morning briefing. |
| 10:00 | WhatsApp reminders for overdue items. |
| 10:30 | Owner attendance report (on time, late, absent). |
| On events | New website enquiry → lead; won opportunity → review-request draft; lead created → routing + first-response clock; document expiry → alerts and calendar; 3 late arrivals in 7 days → alert; 1st and mid-month → target notifications. |

WhatsApp messages need the WhatsApp connection to be live (Settings → Connections).

---

## 21. Settings and administration

| Screen | Who | Use |
|---|---|---|
| **Company Info** | Owner, Admin | Tabs: *Company* (name, logo, **Google review link**), *Document text*, **Company seal** (PNG/JPEG up to 1 MB; *Include the company seal by default*), *Finance & approvals* (base currency AED, **approval limits**, **accounting lock date**, VAT filing frequency monthly/quarterly, **invoice numbering**, credit rules), *UAE compliance* (licensed-activity check: block or warn), *Tracking & tools* (time zone Asia/Dubai, default viewing slot minutes), *E-mail (SMTP)* (sender accounts; **Retry queued / failed e-mails**), **Attendance Wi-Fi** (Admin only: **Lock this network as the office** / **Clear to change the network**). |
| **Branches** | Owner, Admin | Office locations: branch code (2–5 letters, prefixes deal numbers, e.g. DXB), TRN, licence, geofence. |
| **Roles & Access** | Owner, Admin | Users and roles: **New role**, tick view / create / edit / delete / approve / export per module. System roles cannot be renamed or changed — create a new role. You cannot give more access than you have; at least one full-access user must remain. User actions: **Unlock account**, **Sign out everywhere**, **Reset 2-step verification**, reset password. |
| **Signing Rules** | Owner | Company policies, signature authority, department budgets, bank signatory mandates, business-continuity plan, with authority limits and review dates. |
| **Connections** | Owner, Admin | WhatsApp, e-mail, portals, phone/voice, website **Lead webhook secret** (intake address `https://os.swk.properties/api/public/lead/<secret>`). |
| **Backups** | Owner, Admin | Database snapshots, storage use, uploaded files, sign-in security events; **Load SWK OS starter data**; **Clear all business data…** (permanent — type the confirmation; use only with the Owner's written decision). |
| **Safety Checks** | Admin | Record each backup-restore drill: target and measured recovery time, restored records verified, evidence. |
| **Activity Log** | Owner, Admin | Automatic log of important actions and approvals. |
| **Audit Trail** | Owner, Admin | Every record change with old and new values, user and reason. |

---

## 22. Frequently asked questions

**I can't see a menu that a colleague sees.** Your role decides the apps. Staff see four apps (2.3). Ask the Owner/Admin if your job needs more.

**I made a mistake on a posted invoice.** Issue a **credit note** (reason required) or **Void** it (only if nothing is paid), then create a new one.

**A client paid into the wrong account.** Stop. Record nothing as received. Tell Haseeb and the Owner at once. Personal-account receipts are forbidden.

**The client changed the price after Form A.** Update the Owner Permit price with the reason; a second manager approves.

**The broker who owns the deal has left.** Haseeb opens a **Joining & Exit** case and names the receiving colleague; leads, chats, viewings and NOC tasks move automatically.

**Can I delete a lead I created by mistake?** Press Delete and give the reason. It waits in the Delete Bin until the Owner approves.

**Why can't I approve my own request?** Two-person control. Another authorised person must approve.

**The QR scan doesn't work.** Check: office Wi-Fi, your own phone, signed in within 90 seconds, own password set. Then ask Haseeb (new phone approval) or the Admin (Wi-Fi lock).

**Where do I find the rules of a form?** Part B: [SWK-OS-WORKBOOK-FORMS.md](SWK-OS-WORKBOOK-FORMS.md).

---

## 23. One-page cheat sheets

### 23.1 Owner

- Morning: WhatsApp reports (07:30, 08:30, 10:30) → **Overview** → **Approvals** → **Delete Bin** → **Withdrawals**.
- Only you: approve permanent deletions, approve client refunds, change the Owner/Admin accounts.
- Weekly: Daily Operations → *Commission Payouts* (step 2 approvals), *Visas & Agent Cards*; Compliance → **Registrations** expiring.

### 23.2 Admin

- Wi-Fi locked once; re-lock only after **Clear**.
- Vault: Import → check counts → upload documents → View sample → **Release desk**.
- Users: create, reset, unlock, sign out everywhere. Backups weekly; restore drill monthly.

### 23.3 Haseeb

- 10:00 attendance & device approvals · leads within 15 minutes · dispatch vault batch · verify submissions (1-2-3) · NOC steps · approvals (not your own) · 17:30 sign-off · 19:00 daily reports + missing-report check.
- Never: release calling booklets, dispatch a whole desk at once, approve something you created.

### 23.4 Staff

- **By 10:05:** Wi-Fi → scan QR → sign in within 90 s.
- **All day:** My Assigned Deals → masked call / masked WhatsApp → update status.
- **Before leaving:** Daily Work Summary (results + tomorrow's plan, 30+ characters each).
- **Never:** take client money into a personal account; move a client to your personal WhatsApp; screenshot or forward lead data.

### 23.5 The sale in one line

Lead → Opportunity → **Form A** → Viewing → Offer → **KYC** → **Form F** → Escrow → **NOC (submit · attach · verify)** → **DLD transfer** → Sales Tracker stages → Deal File → **Invoice → Receipt** → Commission → **Payout (request · approve · pay)** → review request.

### 23.6 The lease in one line

Landlord **Form A** / A2A → Listing → Tenant lead → Viewing → Tenant **KYC** → **Lease** → **Ejari** → Rent schedule → **PDCs** → Move-in inspection & **Handover** → Agency-fee invoice → Receipt → 50/50 → Maintenance → **Renewal** (RERA cap, 90-day notice) → Ejari renewal.
