# Shabib's Workspace — Complete Executive Operations & Forensic Command Suite

**Date:** 2026-11-27
**Repository:** `swkpropertiesuae/SWKOS`
**Branch:** `feat/shabib-workspace-command-suite`
**Selected Approach:** Approach 1 — Unified Shabib's Workspace Hub (`/shabibs-corner`) + Live Cross-OS Relational Schema & Staff Capture

---

## 1. Intent & Why

Owner **Shabib Siraj** needs a single, well-structured, quick-access **Shabib's Workspace** inside SWK OS that gives him real-time operational and forensic visibility without hunting across disconnected modules or re-entering data manually:

1. **Team, Job Roles & Daily To-Do List:** See every team/staff member's exact role, today's tasks to be done, tasks completed today, individual & team checklists, quick task assignment, and one-click assignment of **any staff member in the list as a Site-Visit Verification Authority**.
2. **Forensic Site Visits & Viewings (GPS-Pinned + Authority-Verified):** Every site visit and property viewing submitted by field staff is GPS-pinned in-app, verified by the Owner-assigned authority (or Shabib), and stored as a complete stage-wise forensic dossier (who they met, unit photos, owner/agent details, full 3rd-party details [agency, agent, BRN, phone, email], asking vs. final price, yearly rent, cheques count, Closed / Not Closed outcome, exact non-closing reason, or full payment & stage breakdown if closed) with PDF / Word (`.docx`) / `.jpeg` export.
3. **Rich Creator + Brochure Theme & Template Customizer (Community, Developer, Project, Unit):** Just like the existing Project Launch Wizard, give Shabib/authorized leadership a unified creator to add **Communities, Developers, Projects, and Units** with complete details, materials/media, and a **Brochure Look & Color Customizer** (named luxury templates + custom primary/accent hex colors, cover layout & footer preferences saved **per-record** and as a **company default**, reflected in generated PDF brochures, Payment Plan PDFs, PPTX decks, and public client share links).
4. **Legal & Brokerage Forms Studio (A2A / Form I, LOI, Tenancy Contract, Ejari, NOC, Agreements):** Dedicated quick-access shelf inside Shabib's Workspace with **Fillable Form Mode** (auto-parsed `[placeholder]` fields + live preview), rich-text template editing, and export to **Word (`.docx`), `.jpeg`, and `.pdf`**.
5. **Pin-to-Pin Closing Forensic Dossiers (Scratch → Handover):** Unified 5-track closing dossiers (**Off-Plan, Secondary, Handover, Leasing, Property Management**) tracking every stage from lead/viewing through KYC, agreements, **cheque-by-cheque payment ledger**, NOC/Ejari/DLD transfer, snagging, and handover — exportable as a formatted forensic report (PDF / Word / JPEG).
6. **Agent Commissions & Agent Expenses Ledger:** Unified owner template tracking **Paid / Received / Pending** commissions and agent expenses with payment modes **Cash, Bank Transfer (BT), Botim, Cheque / PDC, Manager's Cheque**, complete **3rd-party agent details**, and live net payout calculation (`Commission Earned − Agent Expenses / Advances`).

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- Keep **Shabib's Workspace** (`/shabibs-corner`) strictly Owner-only (`canAccessShabibsCorner`), preserving 100% of existing Privacy Fast Track, 12-Stage Playbook, Approvals, Bulk AI Upload, and Consolidated Ledger functionality.
- Organize Shabib's Workspace into a simple, scannable, well-structured layout with grouped navigation pills & summary KPIs for fast owner access.
- Allow **any active staff member** (including restricted field agents) to submit GPS-pinned forensic site visit / viewing dossiers from `/field-duty`, and allow **any staff member Shabib selects in the Team list** to verify/flag those dossiers.
- Maintain 100% SQLite + PostgreSQL 16 compatibility, Zero-Shabib public privacy lock on client-facing brochures/exports/share links, and zero regressions across all 36 existing CI test suites.

### Non-Goals
- Replacing existing HR payroll, core accounting GL posting, or RERA compliance engines — Shabib's Workspace connects to and enriches live operational data without breaking existing workflows.
- Adding heavy external headless-browser dependencies for JPEG export — use the already-installed `@napi-rs/canvas` for fast, deterministic server-side JPEG document rendering.

### Anti-Goals
- Weakening RBAC or exposing Shabib's private workspace/fast-track ledger to staff, admin, or managers (`rbac-zero-leak` must remain 100% airtight).
- Breaking existing `/api/catalog-kit`, `/api/utilities/word`, `/api/field-gps`, or `library.json` doc templates.
- Exposing Shabib's personal identity inside client-facing generated brochures or share links (`assertZeroShabibPublicPayload` remains enforced).

---

## 3. Approaches Considered

1. **Approach 1 (Selected): Unified Shabib's Workspace Hub + Shared Relational Schema & Cross-OS Staff Capture**
   - Extends `/shabibs-corner` with 6 structured executive sections backed by new relational tables + links to live operational entities (`employees`, `tasks`, `viewings`, `field_sessions`, `properties`, `developers`, `communities`, `units`, `jobs`, `leases`, `handovers`, `agent_commissions`, `expenses`), plus a staff submission tab on `/field-duty` and dynamic Owner-assigned verification authority.
   - *Trade-off:* Touches schema, routes, PDF/PPTX/JPEG engines, and UI, requiring full SQLite + PostgreSQL CI verification — delivers real-time zero-duplication visibility.
2. **Approach 2 (Rejected): Isolated Owner-Only Manual Spreadsheets**
   - Keeps all 6 sections disconnected inside `/shabibs-corner`. Rejected because agents couldn't submit GPS-pinned forensic reports and Shabib would have to manually re-enter deals, viewings, and tasks.
3. **Approach 3 (Rejected): Scattered Sidebar Pages**
   - Splits features across HR, Field, Studio, and Finance menus. Rejected because Shabib explicitly asked for one clean, well-structured Shabib Workspace for quick access.

---

## 4. Architecture & Detailed Design

### 4.1 Database Schema (`018_shabib_workspace_command_suite` in `src/server/schema.ts` + Entity Columns)

All DDL uses SQLite dialect translated cleanly via `translateDdlForPg()` for PostgreSQL 16:

1. **Dynamic Verification Authorities** (stored in `settings` via direct SQL `ON CONFLICT(key) DO UPDATE` under key `shabib:field_verifiers_json` — intentionally NOT in `SETTING_DEFAULTS` so `publicSettings()` never exposes it):
   - JSON array of `{ user_id, name, email, assigned_by, assigned_at }`.
   - Shabib toggles verification authority on/off for **any** staff user in the Team list via `PUT /api/shabib-workspace/verifiers`.
   - Helper `isFieldVerificationAuthority(user)` returns `true` for Owner Shabib OR any active `user.id` listed in `shabib:field_verifiers_json`. Never alters `users.role_id` or `RESTRICTED_STAFF_PERMISSIONS`.
2. **`forensic_field_reports` table** (Site Visits & Viewings complete forensic dossier):
   - Core: `id, report_no (UNIQUE, e.g. FSR-2600001), report_type ('Site Visit' | 'Viewing'), submitted_by_user_id, employee_id, agent_id, field_session_id, viewing_id, property_id, unit_id, job_id`
   - Location & Verification: `visit_date, community, building_or_project, unit_no, gps_lat, gps_lng, gps_accuracy_m, gps_address_label, verification_status ('Pending Verification' | 'Verified' | 'Flagged' | 'Rejected'), verified_by_user_id, verified_by_name, verified_at, verification_notes`
   - People Met & 3rd Party: `met_person_name, met_person_role ('Owner' | 'Buyer' | 'Tenant' | 'Developer Rep' | '3rd-Party Agent' | 'Other'), met_person_phone, met_person_email, owner_or_agent_name, owner_or_agent_phone, owner_or_agent_email, is_third_party (INTEGER 0/1), third_party_agency, third_party_agent_name, third_party_brn, third_party_phone, third_party_email`
   - Commercials & Outcome: `deal_category ('Sale' | 'Lease' | 'Off-Plan' | 'Handover' | 'Property Management'), asking_price_aed, final_price_aed, yearly_rent_aed, cheques_count, outcome ('Closed' | 'Not Closed' | 'Follow-Up Pending'), not_closed_reason, next_action_date`
   - Payment & Stage Forensic Details: `payment_summary_json` (array of stage/payment/cheque items: stage, payment_mode, cheque_no, bank_name, cheque_date, amount_aed, status, notes), `stage_log_json` (chronological stage-by-stage forensic timeline), `photos_json` (array of `{ stored_name, original_name, mime, caption, uploaded_at }`), `forensic_notes, created_at, updated_at, deleted_at`
   - **PostgreSQL 16 compatibility rule:** All flag predicates use `= 1` / `= 0`, `COALESCE(...)`, `ON CONFLICT (...) DO UPDATE/NOTHING`, and JSON parsing in TypeScript (never `json_extract`, `IFNULL`, or `INSERT OR IGNORE`).
3. **Brochure Theme Customization** (declared directly as `J('brochure_theme_json', 'Brochure Theme', { hidden: true })` on `properties`, `units`, `developers`, and `communities` in `src/shared/entities/properties.ts` so `rowToApi()` exposes it and `syncSchema()` adds it automatically on SQLite + PG16; company default stored via direct SQL in `settings` under `catalog:default_brochure_theme`):
   - Schema (`BrochureThemeConfig` in `src/shared/brochure-theme.ts`):
     - `preset`: `'emerald_gold' | 'navy_platinum' | 'swiss_mono' | 'desert_champagne' | 'burgundy_ivory' | 'custom'`
     - `primaryHex`, `accentHex`, `surfaceHex`, `inkHex`
     - `coverLayout`: `'executive_band' | 'editorial_split' | 'minimal_frame'`
     - `headerTagline`, `footerNote`, `showPaymentPlan`, `showAmenities`, `showQrCode`
   - Validated via `assertZeroShabibPublicPayload` on save and render so owner identity never leaks into public PDFs, PPTX decks, or share links.
   - `catalog-kit.ts` resolves theme priority: query override (live preview) → record's `brochure_theme_json` → company default `catalog:default_brochure_theme` → classic Emerald & Gold fallback. Applied to **PDF Brochures, Payment Plan PDFs, and OOXML PPTX Decks**, and extended across `catalog-kit.ts`, `routes/catalog-kit.ts`, and `routes/share.ts` to support `'units'` (falling back to parent `properties` row for developer/community/emirate/payment plan)!
4. **`closing_forensic_dossiers` & `closing_cheque_ledger` tables** (Pin-to-Pin Scratch → Handover across 5 tracks):
   - `closing_forensic_dossiers`:
     - `id, dossier_no (UNIQUE, e.g. CLS-2600001), track ('Off-Plan' | 'Secondary' | 'Handover' | 'Leasing' | 'Property Management'), title, status ('In Progress' | 'Ready for Transfer' | 'Handed Over' | 'Closed' | 'On Hold'), job_id, property_id, unit_id, lease_id, handover_id, agent_id`
     - Client & Counterparty: `client_name, client_phone, client_email, client_passport_eid, counterparty_name, counterparty_phone, counterparty_email, is_third_party, third_party_agency, third_party_agent, third_party_brn, third_party_phone, third_party_email`
     - Financials: `asking_price_aed, agreed_price_aed, yearly_rent_aed, deposit_aed, dld_or_adm_fee_aed, agency_commission_aed, vat_aed, total_cheques_count, payment_mode, escrow_or_bank_ref, ejari_or_oqood_or_deed_ref, noc_ref, handover_date, keys_and_meters_summary`
     - `stages_json` (pin-to-pin ordered checklist tailored per track: e.g., Off-Plan [EOI → Booking → SPA → 1st Instalment → Oqood → Escrow SOA → Construction Milestones → Pre-Handover Snagging → Final Balance → Key Handover], Secondary [Lead/Viewing → Offer/LOI → Form A/B/I → KYC/AML → Form F MOU → 10% Security Cheque → Mortgage Valuation/FOL → Developer NOC → DLD Trustee Transfer → Title Deed → Handover], Handover, Leasing [Viewing → Offer → Tenancy Contract → Security Deposit → PDC Cheques → Ejari → DEWA → Move-In Inspection → Keys], Property Management [Onboarding → PMA → Snagging → Marketing → Tenant Placement → Rent Collection → Maintenance → Owner Statement])
     - `notes, created_by, created_at, updated_at, deleted_at`
   - `closing_cheque_ledger`:
     - `id, dossier_id, cheque_no, bank_name, payee_name, payer_name, purpose ('Booking Deposit' | 'Security Deposit' | 'Down Payment' | 'Rent Instalment' | 'DLD/ADM Fee' | 'Agency Commission' | 'Developer Instalment' | 'Manager Cheque' | 'Other'), payment_method ('Cheque / PDC' | 'Manager Cheque' | 'Bank Transfer (BT)' | 'Cash' | 'Botim' | 'Escrow'), amount_aed, cheque_date, status ('Pending' | 'Received' | 'Deposited' | 'Cleared' | 'Bounced' | 'Paid' | 'Replaced'), cleared_date, notes, created_at`
5. **`shabib_commission_expenses` table** (Unified Agent Commissions & Expenses Ledger):
   - `id, entry_no (UNIQUE, e.g. CEX-2600001), entry_type ('Commission' | 'Expense' | 'Advance' | '3rd-Party Split'), agent_id, employee_id, agent_name, deal_ref, property_label, track ('Off-Plan' | 'Secondary' | 'Handover' | 'Leasing' | 'Property Management'), gross_amount_aed, split_pct, net_amount_aed, status ('Pending' | 'Received' | 'Paid'), payment_mode ('Cash' | 'Bank Transfer (BT)' | 'Botim' | 'Cheque / PDC' | 'Manager Cheque' | 'Other'), payment_reference, entry_date, settled_date, expense_category, is_third_party, third_party_agency, third_party_agent_name, third_party_brn, third_party_phone, third_party_email, third_party_payment_details, notes, created_by, created_at, updated_at, deleted_at`
   - Plus add `'Botim'` to `PAY_METHODS` in `src/shared/entities/finance.ts`.

### 4.2 Legal Templates, Fillable Form Mode & JPEG Export

1. **New Seeded Templates in `src/server/studio/library.json`** (without disturbing existing 158 templates):
   - `SL-LOI-RES`: **Letter of Intent (LOI) — Residential / Commercial Purchase & Lease**
   - `LS-TENANCY-FULL`: **Unified UAE Tenancy Contract & Ejari Registration Pack**
   - `SL-NOC-PACK`: **Developer / Bank / Owner No Objection Certificate (NOC) Pack**
   - `SL-A2A-PACK`: **Agent-to-Agent (A2A / Form I) Co-Brokering & Commission Protection Agreement**
   - `FN-COMM-EXP-TPL`: **Agent Commission & Expense Settlement Statement Template**
2. **JPEG Export Endpoint (`POST /api/utilities/word/export-jpeg` in `src/server/routes/utilities.ts`)**:
   - Accepts `{ id, source_id, title, html_content, rtl, include_letterhead, include_seal, include_signature }` (aligning with existing `exportSchema` `id` + optional `source_id` alias, enforcing the exact same `assertSealAllowed` owner/approval rule as `.docx` and `.pdf`!).
   - Renders crisp A4-proportioned JPEG pages (`1240×1754` per page, stacked vertically up to 6 pages so multi-page contracts like Tenancy/A2A/LOI are never truncated) via `@napi-rs/canvas` with letterhead, structured headings/tables/body text, authorized seal/signature (when authorized), and corporate footer. Returns `image/jpeg` attachment.
3. **Fillable Form Mode in `WordStudioPage.tsx` AND Embedded Quick-Launch Legal Desk inside Shabib's Workspace**:
   - Auto-extracts every unique `[placeholder]` token from the loaded template HTML into a clean left/right **Fillable Form Panel** (with 1-click auto-fill from any Client/Deal record via `/api/studio/fill-data`), dynamically replacing placeholders live while still allowing free-form rich-text editing and 1-click export to **Word (`.docx`), `.jpeg`, and `.pdf`**.

### 4.3 Unified Forensic Report Export (`src/server/domain/forensic-exports.ts`)

- Single reusable exporter supporting **Forensic Site Visit / Viewing Dossiers**, **Pin-to-Pin Closing Forensic Dossiers**, and **Agent Commission & Expense Statements** in all 3 formats:
  - **PDF** (`pdf-lib`, WinAnsi-safe via `toPdfSafeText`)
  - **Word `.docx`** (`docx` package)
  - **JPEG `.jpg`** (`@napi-rs/canvas`)
- Enforces `assertZeroShabibPublicPayload` ONLY on public/client-facing catalog exports; internal Owner forensic reports remain authenticated and strictly role-gated (`requireOwnerOnly` or `isFieldVerificationAuthority`).

### 4.4 API Endpoints (`src/server/routes/shabib-workspace.ts`, registered in `src/server/app.ts`)

- **Team, Roles, Daily To-Do & Verification Authority (STRICTLY Owner-only `/api/shabib-workspace/*`):**
  - `GET /api/shabib-workspace/team-daily?date=YYYY-MM-DD` (Owner-only): returns all staff (`employees` + `users` joined with role/designation, attendance check-in status, today's open tasks, today's completed tasks, overdue tasks, team to-do list, and `is_verifier` flag).
  - `POST /api/shabib-workspace/tasks` (Owner-only): quick-assign individual or team task (inserts into real `tasks` table — non-restricted staff see it in `My Work`, and restricted field staff see their own assigned tasks via `/api/field-reports/my-context` on `/field-duty`!).
  - `PATCH /api/shabib-workspace/tasks/:id/toggle` (Owner-only): toggle Done / Open status.
  - `PUT /api/shabib-workspace/verifiers` (Owner-only): assign/revoke any staff `user_id` as a Site-Visit Verification Authority.
- **Forensic Site Visits, Viewings & Staff Self-Tasks (Staff Submit + Dedicated Scoped Photo Upload + Authority Verify):**
  - `GET /api/field-reports/my-context` (Any authenticated staff): returns `{ is_verifier, my_tasks }` so any staff member sees their assigned tasks and knows automatically if Shabib assigned them Verification Authority.
  - `PATCH /api/field-reports/my-tasks/:id/toggle` (Any authenticated staff, strictly scoped to `assigned_to_id = req.user.id`): lets restricted field agents mark their own assigned daily tasks Done/Open from `/field-duty`.
  - `GET /api/field-reports` (Owner sees all; designated verifiers see all; regular staff see only their own submitted reports).
  - `POST /api/field-reports` (Any authenticated staff — including restricted agents — submits GPS-pinned site visit / viewing with met person, owner/agent, 3rd-party details, asking/final price, rent, cheques, closed/not-closed reason, payment stages).
  - `POST /api/field-reports/:id/photos` & `GET /api/field-reports/:id/photos/:idx` (Dedicated scoped photo upload/download via `storeBuffer`/`openStored` + `verifyFileMagicBytes` + image MIME allowlist — gated strictly to report submitter, Owner, or `isFieldVerificationAuthority(user)` so restricted staff can attach & preview unit photos without opening `/api/files` or touching HR PII!).
  - `PUT /api/field-reports/:id` (Submitter while `Pending Verification`, or Owner / designated verifier).
  - `POST /api/field-reports/:id/verify` (STRICTLY Owner OR Owner-assigned Verification Authority — records verifier user, timestamp, status `Verified` / `Flagged` / `Rejected`, and verification notes, notifying Owner & submitter).
  - `GET /api/field-reports/:id/export?format=pdf|docx|jpeg` (Owner or designated verifier or own submitter).
- **Unified Catalog Creator & Brochure Theme Customizer:**
  - `POST /api/catalog-kit/create` (Enforces entity-specific create permissions: `properties:create` for `properties`/`units`, `masters:create` + existing Office Admin Master Log gate for `developers`/`communities`; Owner & Admin have full direct access; creates Community, Developer, Project, or Unit with all details, amenities, media, and validated `brochure_theme_json` in one step).
  - `GET /api/catalog-kit/theme/default` & `PUT /api/catalog-kit/theme/default` (Owner/Admin save/read company default brochure theme).
  - `PUT /api/catalog-kit/:entity/:id/theme` (`properties | developers | communities | units`, save per-record brochure color/template theme validated with `assertZeroShabibPublicPayload`).
  - Extend `/api/catalog-kit/:entity/:id/{brochure.pdf,payment-plan.pdf,deck.pptx,social}` to support `'units'` AND accept live preview query params (`?preset=...&primary=...&accent=...&layout=...`).
- **Pin-to-Pin Closing Forensic Dossiers (5 Tracks — STRICTLY Owner-only `/api/shabib-workspace/*`):**
  - `GET /api/shabib-workspace/closings?track=...` (Owner-only)
  - `POST /api/shabib-workspace/closings` (create from scratch OR bootstrap from existing `job_id` / `lease_id` / `handover_id`!)
  - `PUT /api/shabib-workspace/closings/:id` (update stages, client/3rd-party/financial fields)
  - `POST /api/shabib-workspace/closings/:id/cheques` & `PUT /api/shabib-workspace/closings/:id/cheques/:chequeId` & `DELETE ...`
  - `GET /api/shabib-workspace/closings/:id/export?format=pdf|docx|jpeg`
- **Agent Commissions & Agent Expenses Ledger (STRICTLY Owner-only `/api/shabib-workspace/*`):**
  - `GET /api/shabib-workspace/commissions-expenses` (Owner-only — returns unified ledger + per-agent summary of Received, Paid, Pending, Expenses, 3rd-Party Splits, and Net Balance, plus live synced stats from `agent_commissions` / `expenses` converted accurately via `fromCents()`).
  - `POST /api/shabib-workspace/commissions-expenses` / `PUT .../:id` / `DELETE .../:id`
  - `GET /api/shabib-workspace/commissions-expenses/export?format=pdf|docx|jpeg&agent_id=...`

### 4.5 Frontend Layout (`ShabibsCornerPage.tsx` + Modular Components + Staff Capture on `FieldDutyPage.tsx`)

Keep `ShabibsCornerPage.tsx` clean, fast, and modular by splitting each workspace tab into dedicated components under `src/web/components/shabib/`:
- **Clean Grouped Navigation Bar inside Shabib's Workspace:**
  1. **Executive Command (Fast Track & Playbook)** — existing Privacy Fast Track + 12-Stage Playbook + Approvals + Bulk AI + Consolidated Ledger (sub-pills, zero lost functionality!).
  2. **Team & Daily To-Do** (`ShabibTeamTasksTab.tsx`) — Staff directory table with Job Role, Check-in badge, Today's To-Do, Completed Today, 1-click **"Verification Authority"** toggle switch per staff member, Team To-Do list, and Quick Assign form.
  3. **Forensic Visits & Viewings** (`ShabibForensicVisitsTab.tsx`) — Filter by Site Visit / Viewing / Verification Status / Closed vs Not Closed, inspect GPS map pin + unit photos + 3rd-party details + asking/final price + cheque/payment breakdown, Verify/Flag action, Create/Log form, and 1-click **PDF / Word / JPEG** forensic export.
  4. **Catalog & Brochure Studio** (`ShabibCatalogStudioTab.tsx`) — Unified 4-entity creator (**Community, Developer, Project, Unit**) + interactive **Brochure Color & Template Customizer** with live color swatches, preset picker, layout toggle, live PDF preview, and Save Per-Record / Save Company Default.
  5. **Legal Forms (Word / JPEG / Fillable)** (`ShabibLegalFormsTab.tsx`) — Quick-launch cards for **A2A (Form I), Letter of Intent (LOI), Tenancy Contract, Ejari Pack, Developer/Bank NOC, Sale/PM Agreements**, side-by-side **Fillable Form Mode** + live editable template editor + 1-click **Export Word (`.docx`) / Export `.jpeg` / Export `.pdf`**. (Also adds JPEG export & Fillable Form drawer to `WordStudioPage.tsx`!)
  6. **Pin-to-Pin Closing Dossiers** (`ShabibClosingsTab.tsx`) — 5 track pills (**Off-Plan, Secondary, Handover, Leasing, Property Management**), stage-by-stage checklist with timestamps/notes, client & 3rd-party details, Cheque-by-Cheque Ledger table, Bootstrap from Deal/Lease button, and **PDF / Word / JPEG** report export.
  7. **Commissions & Agent Expenses** (`ShabibCommissionsTab.tsx`) — Summary KPI cards (Received / Paid / Pending / Net Due), Agent Summary table, full entry ledger with Cash / BT / Botim / Cheque / 3rd-Party columns, quick Add/Settle form, and **PDF / Word / JPEG** statement export.
- **Staff Capture (`FieldDutyPage.tsx`):** Add a clean **"Submit Forensic Site Visit / Viewing Report"** panel (with 1-click current GPS pin capture, unit photo upload, met person, owner/3rd-party details, pricing, closed/not-closed & payment stages) + **"Verification Queue"** panel visible automatically whenever the logged-in user is assigned by Shabib as a Verification Authority!
- **Sidebar Nav (`src/web/swk/nav.ts`):** Update `Shabib's Corner` section shortcuts so Shabib can jump directly to any of these tabs with one click.

---

## 5. Verification Plan

- Add dedicated end-to-end test suite `tests/shabib-workspace.ts` (wired into `tests/run-all.sh` so CI runs it on BOTH SQLite and PostgreSQL 16!) verifying:
  1. Owner-only RBAC isolation (Admin, Manager, and Restricted Staff receive `403` on `/api/shabib-workspace/*`).
  2. Team daily tasks load, task creation/toggle, and dynamic assignment of ANY staff member as Verification Authority.
  3. Restricted staff agent submits GPS-pinned forensic viewing report with unit photo, 3rd-party details, pricing, and payment breakdown; non-assigned staff gets `403` on verify; Shabib-assigned verifier succeeds (`200`), and PDF/DOCX/JPEG exports return valid `%PDF-`, `PK` (ZIP), and JPEG (`FF D8 FF`) headers.
  4. Unified creator creates Community, Developer, Project, and Unit; per-record and company-default Brochure Theme customization updates generated PDF brochures & PPTX decks without violating Zero-Shabib guard.
  5. New LOI/A2A/Tenancy/Ejari/NOC templates are seeded, Fillable Form data loads, and `POST /api/utilities/word/export-jpeg` returns a valid JPEG image (and blocks unauthorized seal/signature).
  6. Pin-to-Pin Closing Dossier creation across all 5 tracks + cheque ledger CRUD + PDF/DOCX/JPEG forensic export.
  7. Agent Commission & Expense entries with Paid/Received/Pending, Cash/BT/Botim, and 3rd-party agent fields + net payout math + export.
- Run `npm run typecheck`, `npm run build`, `tests/shabib-workspace.ts`, `tests/rbac-zero-leak.ts`, `tests/uae-projects-catalog.ts`, `tests/executive-os-restructure.ts`, `tests/company-documents.ts`, and push to verify full GitHub Actions SQLite + PostgreSQL 16 CI before merging to `main`.
