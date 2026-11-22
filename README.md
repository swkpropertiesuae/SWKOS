# SWK Properties OS v1.0

<p align="center">
  <img src="public/brand/logo-png/swk-logo-gold-512.png" alt="SWK Properties LLC" width="180" />
</p>

**Complete UAE Real Estate Operating System (ERP, CRM, Portal Syndication & DLD Market Pulse)** built for **SWK Properties LLC (Dubai, UAE)** — live at **[https://os.swk.properties](https://os.swk.properties)**.

---

## 🏛️ 1. Company Hierarchy, Roles & Governance

| Role | Account holder | Sign-in email | Access |
| :--- | :--- | :--- | :--- |
| **Owner & Managing Director** | Shabib Siraj | `shabib@swk.properties` | Full control. Only the Owner can change the Owner account. Final approver for deletions and withdrawals. |
| **Admin** | SWK Admin | `admin@swk.properties` | Full access, under the Owner. The only account that can lock or change the office Wi-Fi (Settings, Attendance Wi-Fi). |
| **Operations Manager** | Mohammad Haseeb | `haseeb@swk.properties` | Broad operational access, employee records, the CRM Vault and the reception code screen. Deletions and administrative decisions need Owner approval. |
| **Staff** | Talha, Saifullah, Samarth, Meenakshi | `@swk.properties` | Attendance and general work. Staff see leads only through masked dispatch. |
| **Staff (swk.rent addresses)** | Fareed, Shahid, Umar, Sanketh | `@swk.rent` | Same as Staff. Their old `@swk.properties` address stays as an alias. |

The roster lives in `src/shared/swk-staff-access.ts`. Passwords and access rules are explained in [docs/ACCESS-AND-PASSWORDS.md](docs/ACCESS-AND-PASSWORDS.md).

---

## 🏢 2. Three Core Operational Departments & Step-by-Step UAE Workflow

The entire web OS (`/home` Launcher, `AppSidebar`, `/dashboard`, and `/swk/pipeline`) is organized into **3 Core Operational Departments** following the exact sequential UAE brokerage workflow:

1. **DEPT 01 — Sales of Off-Plan Projects (`OFFPLAN`)**
   - Developer Inventory & Launches → Promote & Campaign Syndication → Platform Leads Intake → Calls, Meetings & Follow-Ups → Site Visit & Show-Apartment Companion → EOI, Booking, SPA & Oqood (or Mandatory Non-Conversion Reason) → Legal UAE Payment / Escrow Collection → Handover & 50/50 Commission Split.
2. **DEPT 02 — Secondary Projects (`SECONDARY`)**
   - Seller / 3rd-Party A2A Inventory & Detailed Seller Requirements → Bayut, Dubizzle & Portal Promotion → Leads Intake → Qualification & Follow-Ups → Property Site Visits & Live Area Companion → Buyer Finance Status (`Cash`, `Mortgaged`, `Mortgage Pre-Approved`), **RERA Form F (MOU)**, Developer NOC & DLD Trustee Transfer (or Non-Conversion Reason) → Legal UAE Payment & Deal Withdrawal/Refund Protection → Title Deed Handover & 50/50 Commission Split (after 3rd-Party A2A share).
3. **DEPT 03 — Leasing Department (`LEASING`)**
   - Landlord Mandate or 3rd-Party A2A Partner Search (when direct inventory doesn't match client requirements) → **Bayut & Dubizzle** Live Portal Promotion → Tenant Leads Intake → Calls & Qualification → Property Viewings & Area Companion → Tenancy Contract, **Ejari Registration** & PDC Cheques → Legal Rent & Deposit Collection → Key Handover & 50/50 + A2A Commission Settlement.

---

## 🕒 3. Office Reception QR Attendance & Working Hours

- **Working hours (Dubai time):** Monday to Friday 10:00 AM to 7:00 PM, Saturday 10:00 AM to 4:00 PM, Sunday holiday. Check-in up to 10:05 AM is on time; later is late with the exact minutes.
- **How check-in works:** staff scan the reception QR with the camera inside SWK OS, or with their phone's normal camera (the QR is a link that opens the sign-in step). They must be on the locked office network, use their own registered phone, and sign in with their own password. One phone can check in only one person per day.
- **Office Wi-Fi lock:** only the Admin locks the office network, once, in Settings, Attendance Wi-Fi. Changing it means clearing it there first. Until it is locked nobody can check in.
- **Reception code:** a fixed code (default) or a code that rotates every 30 seconds. The reception code screen and the setup are visible only to the Owner, Admin and Haseeb.
- **Times are stored in Dubai time.** A check-in at 10:11 shows as 10:11 AM.
- **Owner briefings:** a 09:30 AM morning briefing and a 10:30 AM attendance report go to the Owner by WhatsApp (when WhatsApp is connected).

Full detail: [docs/ATTENDANCE.md](docs/ATTENDANCE.md).

---

## 💳 4. Strictly Legal UAE Payment Modes, 50/50 Split & Deal Withdrawal Refunds

- **Zero Tolerance for Personal Accounts**: No client funds may ever be received in a Sales Advisor's personal bank account (`400 Bad Request` domain guard across `receipts`, `jobs`, and `transactions`).
- **Permitted Legal UAE Payment Channels**:
  - `SWK Company Bank Account (AED/FX)`
  - `Developer DLD Escrow Account`
  - `Manager's Cheque` / `Post-Dated Cheques (PDC)`
  - `Worldwide Currency Exchange (Licensed UAE Exchange House)`
  - `UAE-Permitted Crypto / USDT (VARA-Licensed Gateway)`
- **50–50% Net Commission Formula**:
  $$\text{Company Net Pool} = \text{Gross Commission (excl. VAT)} - \text{3rd-Party A2A Partner Share}$$
  $$\text{SWK Company Share (50\%)} = 0.50 \times \text{Company Net Pool}, \quad \text{Sales Advisor Share (50\%)} = 0.50 \times \text{Company Net Pool}$$
- **Deal Withdrawals & Client Refunds (`/swk/withdrawals` / `deal_withdrawals`)**:
  - Tracks developer/seller or client/buyer withdrawals post-booking or post-closing, computes the refundable amount vs. forfeiture/deduction based on payment stage and agreed SPA/Form F terms, routes through Manager review, and requires **Owner Shabib Siraj** approval before refund release.

---

## 🛡️ 5. Universal Audit Log, Mandatory Edit/Delete Reason & Pending Delete Bin (`Recycle Bin`)

- Every create, edit, delete request, status change, and approval is recorded in `audit_log`.
- **Mandatory Reason on Edit & Delete**: Any edit or delete requires a specific reason and immediately notifies **Owner (Shabib Siraj)**, **Manager (Mohammad Haseeb)**, and **IT/BDM (Talha Shabbir)**.
- **Pending Delete Bin (`/swk/recycle-bin` / `recycle_bin_requests`)**: When a non-Owner user deletes a record, it is held in the **Pending Delete Bin** (`Pending Owner Approval`) with a full snapshot and is **only permanently deleted after Owner Shabib Siraj approves**.

---

## 📈 6. Market Pulse (24 Dubai Areas), Daily DLD Sync, Site-Visit Companion & UAE Mortgage Calculator

- **24 Dubai Communities with Stock-Style Tickers (`/swk/market`)**: Covers Palm Jumeirah, Downtown Dubai, Dubai Marina, Business Bay, Dubai Hills Estate, Dubai Creek Harbour, JVC, JLT, Emaar Beachfront, MBR City / Sobha Hartland, DIFC, Arabian Ranches, DAMAC Hills & Lagoons, Dubai South & Expo City, Palm Jebel Ali, Al Furjan, City Walk, Bluewaters Island, Dubai Islands, Al Barari, Jumeirah Golf Estates, Arjan, Sheikh Zayed Road, and Motor City / Sports City.
- **Daily DLD Open-Data Transactions Sync (`dld_market_transactions`) & Real Estate News (`real_estate_news`)**.
- **Site-Visit Area Companion**: Provides Sales Advisors on a field visit with the community's stock-style price/sqft & yield ticker, nearby landmarks/metro/schools, ongoing projects, **15-year future outlook (2026–2041)**, and **top closing keywords & pitch phrases** tailored to the client.
- **UAE Mortgage Calculator**: Interactive calculator with Expat (80% LTV) / UAE National (85% LTV) / Off-Plan rules, DLD 4% fee + trustee/agency fee breakdown, and live UAE bank rates (FAB, Emirates NBD, ADCB, DIB, Mashreq, HSBC UAE).

---

## 🎨 7. Brand — single source: swkpropertiesuae.com

Logo, emblem, favicons, PWA icon, OG image and the shared hero/community photos are the **Matte Gold** assets of the company website ([swkpropertiesuae.com](https://www.swkpropertiesuae.com), repo `swkpropertiesuae/swkpropertiesuae.com`). Committed copies live in `public/brand/site/`, `public/favicon/`, `public/media/{hero,communities}`; code reads them via `src/web/lib/brand.ts`.

```bash
npm run brand:sync                                              # pull from the live website
BRAND_SOURCE=../swkpropertiesuae.com/public npm run brand:sync   # or from a local website checkout
```

Never edit synced files by hand; update the website, then re-run the sync and commit. Gold artwork is for dark surfaces (navy/onyx plates); use the `-charcoal` variants on light backgrounds.

---

## ▶️ 8. Running, Verifying & Deploying

```bash
npm install
npm run dev                  # API on :8080 + Web on :5173
npm run typecheck            # TypeScript validation
npm run build                # Build Web (dist/web) + API (dist/server/index.mjs)
bash tests/run-all.sh        # All API suites, each on a fresh server (build first)
```

**Production** runs on AWS Lightsail (Stockholm) as a Docker Compose stack behind a Cloudflare Tunnel, with data in Supabase Postgres and nightly backups to Cloudflare R2. Updating the server is two commands, listed in [docs/OPERATIONS-RUNBOOK.md](docs/OPERATIONS-RUNBOOK.md). The older Cloudflare Containers deployment is retired ([docs/DEPLOY-CLOUDFLARE.md](docs/DEPLOY-CLOUDFLARE.md)).

---

## 📚 9. Documentation

| Topic | Document |
| :--- | :--- |
| Run and update the live server, backups, password reset, troubleshooting | [docs/OPERATIONS-RUNBOOK.md](docs/OPERATIONS-RUNBOOK.md) |
| Production architecture and the AWS setup | [docs/DEPLOY-FREE.md](docs/DEPLOY-FREE.md), [docs/DEPLOY.md](docs/DEPLOY.md) |
| Accounts, roles, passwords, who sees what | [docs/ACCESS-AND-PASSWORDS.md](docs/ACCESS-AND-PASSWORDS.md) |
| Attendance, Wi-Fi lock, reception QR | [docs/ATTENDANCE.md](docs/ATTENDANCE.md) |
| CRM Vault and lead/document custody | [docs/HANDOVER-PROCESS.md](docs/HANDOVER-PROCESS.md) |
| Database (Supabase Postgres) | [docs/POSTGRES.md](docs/POSTGRES.md) |
| Dashboard and navigation | [docs/DASHBOARD.md](docs/DASHBOARD.md) |
| Owner and Manager handbooks | [docs/OWNER_MASTER_HANDBOOK.md](docs/OWNER_MASTER_HANDBOOK.md), [docs/MANAGER_OPERATIONS_HANDBOOK_HASEEB.md](docs/MANAGER_OPERATIONS_HANDBOOK_HASEEB.md) |
