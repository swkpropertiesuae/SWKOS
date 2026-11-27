# SWK OS — UAE Projects, Developers, Communities, Off-Plan Promotions & Marketing Kit Overhaul

**Date:** 2026-11-27  
**Repository:** `swkpropertiesuae/SWKOS`  
**Selected Approach:** Approach 1 — Safe Catalog-Only Reset + UI Rename (`Properties → Projects`) + Full Dubai & Abu Dhabi Master Catalog + On-Demand Branded Asset & Social Engine

---

## 1. Intent & Why

SWK Properties OS currently contains legacy property inventory (5,000+ rows in live production Postgres), only 14 seeded developers (13 Dubai + 1 Abu Dhabi), 24 Dubai-only communities, 105 legacy Dubai-only off-plan launches, inconsistent listing titles, and media tools restricted only to properties/units.

The business goal is to rebuild SWK OS into a complete, clean-slate **Dubai & Abu Dhabi Project Intelligence & Marketing OS** where:
1. All legacy non-website property/project, developer, community, and off-plan seed records are cleanly reset to zero before loading authoritative UAE data—**without losing a single published website listing/promotion, user/owner/admin/staff account, HR/attendance record, CRM lead/client/vault record, deal, or accounting entry**.
2. Every real estate asset is consistently structured and presented as a **Project** (`<Project Name> by <Developer>`, e.g., `Shahrukhz by Danube` where Developer = `Danube Properties` and Project = `Shahrukhz`), linked cleanly to its **Developer** and **Community**.
3. Sales advisors and marketing staff can immediately browse **75+ top Dubai & Abu Dhabi developers**, **every major Dubai & Abu Dhabi community** with deep intelligence, **all flagship projects**, and a dedicated **Off-Plan Launches & Promotions** catalog covering every active launched-to-date unhanded-over project—and download or share a complete branded kit (**PDF Brochure, PDF Payment Plan, PowerPoint `.pptx` Deck, Interactive 3D Exterior & 3D Floor Plan, Video Tour, HD Images, Amenities, and Multi-Platform Social Media Drafts**) for **every single Community, Developer, and Project**.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- **G1 — Safe One-Time Catalog-Only Reset:** On first server boot after deployment, automatically back up the database and clear **only** `properties`, `units`, `developers`, `communities`, `payment_plan_templates`, and legacy catalog seed/launch markers (`seed:communities*`, `seed:developers*`, `offplan-launch:*`, `offplan-launch-enrich:*`). Re-runs are idempotent via a persisted settings key (`catalog_reset:uae_projects_v5_2026_11_27`).
- **G2 — Strict Preservation Guarantee:** Zero deletions or destructive mutations to:
  - Published website data (`website_listings`, `website_promotions`, `website_social_campaigns`, `website:site_updates`, `website:last_deploy`)
  - Owner, Admin, Manager, Staff, and Portal accounts (`users`, `roles`, `sessions`, `staff_devices`, `user_invites`)
  - HR & Attendance (`employees`, `agents`, `attendance`, `attendance_events`, `leave_requests`, `payslips`, `immigration_cases`, `field_sessions`, `duty_location_batches`, `reception_qr_tokens`, `workday_states`, `staff_live_locations`, `late_contemptor_alerts`)
  - CRM Leads, Clients & Vault (`leads`, `parties`, `contacts`, `opportunities`, `activities`, `whatsapp_messages`, `crm_vault_properties`, `crm_vault_route_tracker`, `crm_masked_call_logs`, `custody_documents`)
  - Deals & Operations (`jobs`, `mandates`, `viewings`, `offers`, `sales_contracts`, `leases`, `rent_schedules`, `rent_receipts`, `dld_filings`, `mortgage_cases`, `handovers`, `snagging_items`, `deal_withdrawals`, `developer_requests`, `maintenance`, `inspections`, `service_charges`, `share_links`)
  - Accounting & Finance (`invoices`, `bills`, `receipts`, `payments`, `bank_transactions`, `expenses`, `purchase_orders`, `owner_statements`, `agent_commissions`, `journal_entries`, `journal_lines`, `accounts`, `vat_codes`, `currencies`, `payment_terms`, `charge_codes`, `bank_accounts`)
- **G3 — Non-Breaking `Properties → Projects` UI & Domain Rename:**
  - Keep internal database table name `properties` and REST routes `/api/e/properties`, `/api/properties/*`, `/e/properties` intact so live production deals, share links, and mobile clients never break.
  - Rename user-facing labels everywhere (`EntityDef.label: 'Project'`, `plural: 'Projects'`, `property_no` label `'Project No.'`, `title` label `'Project Title (e.g. Shahrukhz by Danube)'`, navigation items, Master Log, Listing Studio → **Project Listing Studio**, Off-Plan Launches & Promotions, Record views, Launch Wizard, and WhatsApp/brochure copy).
  - Add dedicated structured fields on `properties` (`project_name`, `emirate`, `handover_quarter`, `payment_plan_summary`, `ppt_url`, `payment_plan_pdf_url`, `launch_status`, `promo_headline`, `promo_badge`, `promo_benefits`, `amenities`) while keeping full compatibility with all existing columns.
- **G4 — Strict `<Project Name> by <Developer>` Naming Standard:**
  - Every seeded project follows `<Project Name> by <DeveloperShort>` (e.g., `Shahrukhz by Danube`, `Burj Binghatti Jacob & Co Residences by Binghatti`, `Saadiyat Lagoons by Aldar`, `Creek Haven by Emaar`).
  - `project_name` holds the clean project name (`Shahrukhz`), `developer_ref` links to the `developers` row (`Danube Properties`), and `title` holds `Shahrukhz by Danube`.
  - The Developer Project Launch Wizard (`DeveloperProjectLaunchModal.tsx`) automatically composes `<Project Name> by <Developer>` when staff enter a Project Name and select a Developer (while allowing manual override).
- **G5 — 75+ Top UAE Developers (55+ Dubai + 22+ Abu Dhabi):**
  - Authoritative master data module (`src/shared/uae-catalog/developers.ts`) seeded into `developers` and exposed across Market/Off-Plan/Launch tools.
  - Every developer includes: unique `code`, full `name`, `short_name` (used in `by <Short>`), `emirate` (`Dubai` | `Abu Dhabi`), `rera_id` / `dmt_id`, `website`, `headquarters`, `founded_year`, `tier` (`Master` | `Tier-1` | `Luxury Boutique`), `description` (detailed corporate profile), `specialties`, `flagship_projects`, `amenities_standard`, `video_url`, `virtual_tour_url`, `brochure_url`, `ppt_url`, `media` (logo/brand artwork + showcase visuals).
- **G6 — Complete Dubai & Abu Dhabi Communities (155+ Total: ~110+ Dubai + ~45+ Abu Dhabi):**
  - Replace the legacy 24-area Dubai-only list across DB seeding (`seed/index.ts`), `src/web/swk/uae.ts`, `src/server/routes/swk-ops.ts` (`DUBAI_AREAS_24` → `UAE_AREAS_FULL` while keeping `DUBAI_AREAS_24` export alias for backwards compatibility), and `MarketPage.tsx`.
  - Sourced from verified DLD area registries (`D:\04_Dubai_Real_Estate_Open_Data\...`) and Abu Dhabi DMT/island/district data.
  - Every community includes: `code`, `ticker` (e.g. `PALM.DXB`, `SAAD.AUH`), `name`, `emirate` (`Dubai` | `Abu Dhabi`), `area` (district/corridor), `master_developer`, `rera_community_id`, `segment` (`Prime` | `Upper-mid` | `Mid` | `Value`), `avg_price_sqft`, `avg_price_sqft_ly`, `yoy_pct`, `avg_rent_annual`, rent breakdown (`Studio`, `1BR`, `2BR`, `3BR`), `gross_yield_pct`, `service_charge_sqft`, `transactions_q`, `off_plan_share`, `lat`/`lng`, `description`, `key_landmarks`, `metro_transit`, `schools`, `hospitals`, `beach_parks`, `amenities`, `ongoing_projects`, `future_15y_outlook`, `forecast_15y` (2026–2041), `closing_keywords`, `field_visit_pitch_script`, `media` (HD photography + 3D satellite tour).
- **G7 — Comprehensive Projects + Dedicated Off-Plan Launches & Promotions:**
  - Replace all 105 legacy `OFFPLAN_LAUNCHES` with a comprehensive Dubai & Abu Dhabi master project catalog (`src/shared/uae-catalog/projects.ts`, re-exported/integrated with `src/shared/offplan-launches.ts`):
    - **Active Unhanded-Over Off-Plan Projects (250+ across Dubai & Abu Dhabi):** Every major off-plan project launched to date whose handover is upcoming (Q4 2026 – 2032+), with `is_off_plan = true`, `status = 'Off-Plan'`, `launch_status = 'Active Off-Plan'`, handover quarter/date, payment plan split (booking/construction/handover/post-handover), unit typologies, price from (AED), size range (sq ft), amenities, promo headline/badge/benefits, coordinates, and renders.
    - **Flagship Ready & Completed Projects (150+ across Dubai & Abu Dhabi):** Landmark ready developments across all 75+ developers (`is_off_plan = false`, `status = 'Available'`, `launch_status = 'Ready / Completed'`) so every developer has its complete signature portfolio in SWK OS.
  - **Off-Plan Listings & Promotions Hub (`OffPlanPage.tsx`):**
    - Shows every active unhanded-over off-plan project across Dubai & Abu Dhabi (`pageSize: 2000`, zero 500-row truncation).
    - Adds **Emirate filter (`All UAE`, `Dubai`, `Abu Dhabi`)**, **Search**, Developer filter, Community filter, Handover Year, Budget slider, Post-Handover toggle, and a **Promotions & Spotlight Carousel** highlighting active off-plan campaigns.
    - Adds a safe **"Promote to Website Studio"** action per off-plan project (creates/updates a single off-plan listing & promotion in `website_listings` / `website_promotions` on demand without ever deleting any existing published website content).
- **G8 — Dedicated Brochure, Images, Amenities, 3D Plan, Video, PPT, PDF Payment Plan & Multi-Platform Social Media Kit for EVERY Community, Developer, and Project:**
  - **Extended Media Studio (`ProjectMediaStudio.tsx` & `/api/media/:entity/:id`):**
    - Supported entities expanded from `['properties', 'units', 'website_listings']` to **`['properties', 'units', 'website_listings', 'developers', 'communities']`**.
    - `ProjectMediaKind` expanded to **`'photo' | 'video' | 'tour3d' | 'floorplan' | 'brochure' | 'ppt' | 'payment_plan'`**.
    - All five entity record pages (`EntityPages.tsx`) display both the **Media, Video & 3D** tab and the new **Brochure, PPT, Payment Plan & Social Kit** tab (`CatalogMarketingKit.tsx`).
  - **On-Demand Branded File Generators (`/api/catalog-kit/:entity/:id/...`):**
    - `GET /api/catalog-kit/:entity/:id/brochure.pdf` — Server-generated multi-page branded SWK PDF Brochure (`pdf-lib`) containing cover banner, executive profile, key specifications, pricing/yields, structured amenities, community/landmarks intelligence, developer credentials, and SWK Properties LLC RERA ORN 51517 footer.
    - `GET /api/catalog-kit/:entity/:id/payment-plan.pdf` — Server-generated branded SWK PDF Payment Plan Schedule (`pdf-lib`) with exact milestone instalment table, booking/construction/handover/post-handover split, statutory fee breakdown (4% DLD for Dubai / 2% ADM for Abu Dhabi + Oqood/Escrow protection), and UAE Golden Visa qualification notes. (For Developers/Communities, generates their representative flagship payment plan guide & comparative fee sheet.)
    - `GET /api/catalog-kit/:entity/:id/deck.pptx` — Server-generated valid multi-slide PowerPoint presentation (`.pptx`, OpenXML PresentationML zip built in pure TypeScript + `node:zlib` with zero brittle binary dependencies) featuring Title Slide, Market/Location Positioning, Architectural & Amenities Showcase, Financial / Payment Plan & ROI Slide, 3D & Media Highlights, and SWK Advisory Contact Slide.
    - Every generated file respects any custom uploaded/linked official developer brochure, payment plan PDF, or PPTX first (showing both *"Official Developer File"* if uploaded and *"SWK Instant Branded Generator"* so zero records ever have an empty download!).
  - **Interactive 3D Plan & Video Tour on Every Community, Developer & Project:**
    - Interactive 3D architectural exterior + 3D cutaway spatial floor plan (`Property3DViewer.tsx`) + Google Satellite 3D aerial view (`satelliteViewUrl(lat, lng)`) + custom `.glb`/Matterport/Kuula/Sketchfab embed support.
    - Narrated multi-chapter cinematic video walkthrough (`PropertyVideoTour.tsx`, updated to support Dubai & Abu Dhabi, Developer showcases, and Community tours) + official YouTube/Vimeo/MP4 launch film embed support.
  - **Multi-Platform Social Media Templates & Message Drafts (`/api/catalog-kit/:entity/:id/social-kit` + `CatalogMarketingKit.tsx`):**
    - Dedicated, tailored drafts in **English & Arabic** for every single **Community**, **Developer**, and **Project** across **8 platforms**:
      1. **Instagram** (Feed Caption + Carousel Slide Deck Copy + Reel 30s Script + Story Cards + Hashtags)
      2. **Facebook** (Lead-Gen Ad Primary Text/Headline/CTA + Organic Post)
      3. **LinkedIn** (Executive Market & Investment Brief)
      4. **TikTok** (Hook + 30s Shot-by-Shot Script + On-Screen Text + Caption)
      5. **YouTube / Shorts** (SEO Title + Full Description + Shorts Script + Tags)
      6. **X (Twitter)** (3-Tweet Concise Investor Thread)
      7. **WhatsApp** (1-to-1 Client Pitch + Broadcast Blast + Direct `wa.me` Launch)
      8. **Email** (Subject Line + Executive Client Outreach Email Body)
    - One-click **Copy**, **Download All Drafts (.txt/.json)**, **WhatsApp Send**, and **Push to Website & Social Studio** (`POST /api/website/social-campaigns`).
    - Strictly validated by `assertZeroShabibPublicPayload` (Zero-Shabib Public Privacy Lock).

### Non-Goals
- No physical SQL table rename from `properties` to `projects` (preserves 100% compatibility with live Postgres rows in `jobs`, `mandates`, `leases`, `invoices`, `share_links`, and Android/iOS WebView routes).
- No modification or deletion of any live published `website_listings` or `website_promotions`.
- No scraping behind broker-authenticated developer portals or committing multi-GB raw MP4/PPTX binaries into Git.

### Anti-Goals
- No generic dummy/lorem data—every developer, community, and project must be real Dubai or Abu Dhabi real estate data.
- No broken local `/media/...` image paths (automated test asserts every referenced local image exists on disk).
- No SQLite-only or Postgres-only SQL syntax regressions.
- No leakage of restricted Owner personal identity into public brochures, PPTX decks, or social media drafts.

---

## 3. Approaches Considered

| Approach | Summary | Trade-offs | Decision |
| :--- | :--- | :--- | :--- |
| **Approach 1 (Selected)** | Safe catalog-only one-time reset + UI/domain rename (`Properties → Projects`) + comprehensive Dubai & Abu Dhabi master catalog (75+ developers, 155+ communities, 400+ projects / 250+ active off-plan) + extended Media Studio + on-demand PDF Brochure, PDF Payment Plan, PPTX Deck, 3D Plan, Video Tour & 8-Platform Social Engine. | Lean Git/Docker footprint; zero breakage to live deals/accounts/published website; 100% asset completeness on every single record; staff can upload official developer PDFs/videos/PPTs anytime to supplement or override generated kits. | **Selected** |
| **Approach 2 (Rejected)** | Physical SQL table rename (`properties → projects`) across 40+ files + scraping raw developer PDF/MP4/PPTX binaries into external R2/S3 storage. | High risk of breaking live Postgres deal/invoice/share references; developer portals gate raw PPT/PDF files behind broker logins leaving incomplete data; requires external R2 bucket credentials during build. | Rejected |

---

## 4. Technical Architecture & File-Level Plan

### 4.1 Safe One-Time Catalog Reset, Referential Integrity & Seeding (`src/server/`)
- **New module:** `src/server/domain/uae-catalog-sync.ts`
  - Key: `CATALOG_RESET_KEY = 'catalog_reset:uae_projects_v5_2026_11_27'`
  - Key: `CATALOG_SEED_VERSION_KEY = 'catalog_seed:uae_projects_v5_2026_11_27'`
  - **Step 1 (Reset once — Referentially Safe):** *(Design Call — preserves 100% editability of live deals, leases, mandates, invoices & share links)*
    - When `!q.val('SELECT 1 FROM settings WHERE key = ?', CATALOG_RESET_KEY)`:
      - In non-test mode, creates a backup via `backupBeforeReset('before-uae-catalog-v5')` (best-effort; logs warning if backup dir unavailable rather than crashing boot).
      - Scans preserved operational tables (`jobs`, `mandates`, `viewings`, `offers`, `sales_contracts`, `leases`, `handovers`, `invoices`, `bills`, `receipts`, `payments`, `mortgage_cases`, `developer_requests`, `unit_holds`, `offplan_assignments`, `property_visits`, `maintenance`, `inspections`, `service_charges`, `share_links`) to collect any **actively referenced** legacy `property_id`, `unit_id`, `developer_id`, or `community_id`.
      - Inside a single `tx(() => { ... })`:
        - **Hard-deletes** (`DELETE FROM`) every unreferenced legacy row in `units`, `properties`, `developers`, `communities`, `payment_plan_templates` (plus orphan `attachments`/`comments`/`record_refs`/`record_tags`/`record_links`/`record_likes` belonging strictly to those deleted IDs).
        - For the rare rows actively referenced by an existing live deal/lease/invoice/share link: **soft-archives** them (`SET deleted_at = nowIso(), active = 0`) so **zero legacy rows appear anywhere** in Projects, Units, Developers, Communities, Listing Studio, or Off-Plan (all list queries filter `deleted_at IS NULL`), while preserving historical deal titles and joins.
        - **Engine resilience (`src/server/engine.ts` `assertRefs()`):** On `updateRecord()`, if an existing record already holds a `ref` ID that is unchanged in the update payload and points to a soft-archived legacy row (`deleted_at IS NOT NULL`), allow the save without throwing HTTP 400. New records or newly selected refs still strictly require active (`deleted_at IS NULL`) targets.
        - Resets sequences ONLY for `properties|%`, `units|%`, `developers|%`, `communities|%`, `payment_plan_templates|%` (advancing past any soft-archived max ID so no collisions occur).
        - Clears legacy seed/launch flags ONLY: `DELETE FROM settings WHERE key IN ('seed:communities','seed:communities_swk_v2','seed:developers','seed:developers_swk_v4') OR key LIKE 'offplan-launch:%' OR key LIKE 'offplan-launch-enrich:%'`.
        - Inserts `CATALOG_RESET_KEY = '1'` into `settings` and writes one `audit_log` summary row.
      - **NEVER** deletes or modifies `website_listings`, `website_promotions`, `website_social_campaigns`, `users`, `roles`, `sessions`, `employees`, `agents`, `attendance*`, `leave_requests`, `payslips`, `leads`, `parties`, `contacts`, `opportunities`, `crm_vault_*`, `jobs`, `mandates`, `leases`, `invoices`, `bills`, `receipts`, `payments`, `journal_*`, etc.
  - **Step 2 (Seed Master Catalog once per catalog version):**
    - Seeds all **75+ Developers** (55+ Dubai + 22+ Abu Dhabi) into `developers`.
    - Seeds all **155+ Communities** (~110+ Dubai + ~45+ Abu Dhabi) into `communities`.
    - Seeds standard UAE **Payment Plan Templates** (`1% Monthly 70/30 Post-Handover`, `80/20 Construction-Linked`, `70/30 Construction-Linked`, `60/40 Construction-Linked`, `50/50 Handover`, `40/60 Abu Dhabi Aldar Plan`, `65/35 Luxury Waterfront`, `100% Ready Cash / Mortgage`).
    - Seeds all **400+ UAE Projects** (ready flagship projects + 250+ active unhanded-over off-plan projects) into `properties` with:
      - `title = "<Project Name> by <DeveloperShort>"`
      - `project_name = "<Project Name>"`
      - `developer_ref = <developer.id>`, `developer_id = <developer.name>`
      - `community_ref = <community.id>`, `community_id = <community.name>`
      - `emirate = "Dubai" | "Abu Dhabi"`
      - Full `media` array (verified project render images + 3D satellite location tour + brochure/payment-plan/ppt kit URLs), `amenities`, `features`, `description`, `payment_plan`, `payment_plan_summary`, `completion_year`, `handover_quarter`, `promo_headline`, `promo_badge`, `promo_benefits`, `is_off_plan`, `status`.
    - **Performance Call:** Batched inside a single transaction using fast direct inserts (no synthetic child `units` explosion on boot — unit mix & unit counts live directly on each project record) so seeding completes in **< 2 seconds** on SQLite and **< 5 seconds** on Stockholm Supabase Postgres.
- **Hook into `src/server/startup-data.ts`:** Call `runUaeCatalogMigrationAndSeed()` in `runStartupDataTasks()` (replacing the legacy `ensureOffPlanLaunches()` call so old 105 launches are never re-inserted). Also update `src/server/seed/index.ts` so fresh/test DBs seed the new UAE developers & communities directly instead of the old 14 developers / 24 communities.
- **Note on `seedWebsiteContent()`:** Leave existing published `website_listings` / `website_promotions` completely untouched. Keep `seedWebsiteContent()` guarded by `seed:website_content_v1` so production website data is never modified or deleted.

### 4.1.1 RBAC & Security Policy Alignment *(Design Call)*
- **Zero weakening of existing RBAC lockdown (`src/shared/swk-staff-access.ts`):** Existing hardcoded role/zero-leak boundaries and `tests/rbac-zero-leak.ts` / `tests/zero-leak-superapp.ts` remain **100% intact**.
- `/api/catalog-kit/:entity/:id/*` inherits exact entity RBAC: users with `properties:view` (Owner, Admin, Manager, Sales/Operations roles) access Project kits; users with `masters:view` (including staff who already have read access to `communities` and `developers`) access Developer & Community kits.
- `POST /api/website/social-campaigns` retains its existing `canAccessSwkAdminLogic` gate (Owner, Admin, Manager).
- `POST /api/catalog-kit/offplan/:id/promote-website` enforces `need(req, 'website', 'edit')` (Owner & Admin only, matching `src/server/routes/website.ts`).

### 4.1.2 Data Sourcing, Visual Assets & Compliance Disclaimers *(Design Call)*
- **Dubai data:** Compiled from official local DLD live registries (`D:\04_Dubai_Real_Estate_Open_Data\...\dld_developers_live_registry`, `dld_projects_master_merged_live`, `dld_carea_lookup_437_areas`, `datadubai` communities/developers/projects) + verified 2025–2026 UAE launch specs.
- **Abu Dhabi data:** Compiled from local Abu Dhabi district data (`eVoost__abu-dhabi-ai-proptech-challenge/districts.csv` & `sample_communities.csv`) + curated authoritative Abu Dhabi developer, island/district, and flagship/off-plan project data (Aldar, Modon, Bloom, Imkan, Reportage, Ohana, Taraf, Jubail Island, Radiant, Eagle Hills, Masdar, etc.).
- **Local visual assets (zero 404s):** Reuse all matching authentic renders in `public/media/launches/`, `public/media/communities/`, and `public/media/properties/`, generate crisp local **SVG brand emblem logos** in `public/media/developers/` for every developer without an existing PNG logo, and add curated local architectural SVG/WebP hero visuals for Abu Dhabi districts so **100% of image paths exist on disk** and pass automated existence checks.
- **Regulatory disclaimer:** Every generated PDF brochure, PDF payment plan, PPTX deck, and social media draft carries an explicit RERA/ADM footer: *"Indicative pricing, payment plan & specifications — verify live developer availability and valid Trakheesi / ADM advertising permit prior to external publication. SWK Properties LLC · RERA ORN 51517."*

### 4.2 Schema & Entity Definition Updates (`src/shared/entities/properties.ts` & `src/shared/media.ts`)
- **`properties` entity (`label: 'Project'`, `plural: 'Projects'`):**
  - Keep `key: 'properties'`, `numbering: { field: 'property_no', pattern: 'PRJ-{YY}{seq:5}' }` (display label `'Project No.'`).
  - Add fields (automatically added as columns by `syncSchema()` on both SQLite & Postgres):
    - `T('project_name', 'Project Name', { list: true, search: true })`
    - `S('emirate', 'Emirate', UAE_STATES, { default: 'Dubai', list: true })`
    - `T('handover_quarter', 'Handover Quarter', { list: true })`
    - `T('payment_plan_summary', 'Payment Plan Split', { list: true })`
    - `T('unit_mix', 'Unit Mix', { list: true })`
    - `I('total_units', 'Total Units')`
    - `I('available_units', 'Available Units')`
    - `S('launch_status', 'Launch Stage', ['New Launch', 'Active Off-Plan', 'Under Construction', 'Near Handover', 'Ready / Completed'], { list: true })`
    - `T('promo_headline', 'Promotion Headline', { span: 2 })`
    - `T('promo_badge', 'Promotion Badge', { list: true })`
    - `TA('promo_benefits', 'Promotion Highlights', { span: 3 })`
    - `U('ppt_url', 'Presentation Deck (.pptx) URL', { section: 'Media, Video & 3D Tours' })`
    - `U('payment_plan_pdf_url', 'Payment Plan PDF URL', { section: 'Media, Video & 3D Tours' })`
- **`communities` entity:**
  - Add fields: `T('ticker', 'Market Ticker', { list: true })`, `S('segment', 'Market Segment', ['Prime', 'Upper-mid', 'Mid', 'Value'], { list: true })`, `N('service_charge_sqft', 'Service Charge / sq ft')`, `T('latitude', 'Latitude', { hidden: true })`, `T('longitude', 'Longitude', { hidden: true })`, `TA('amenities', 'Community Amenities', { span: 3 })`, `TA('schools', 'Nearby Schools', { span: 2 })`, `TA('hospitals', 'Nearby Hospitals', { span: 2 })`, `T('metro_transit', 'Metro & Transit', { span: 2 })`, `TA('future_outlook', '15-Year Future Outlook', { span: 3 })`, `TA('closing_keywords', 'Closing Keywords', { span: 3 })`, `U('video_url', 'Community Video URL', { section: 'Media, Video & 3D Tours' })`, `U('virtual_tour_url', '3D Aerial / Tour URL', { section: 'Media, Video & 3D Tours' })`, `U('brochure_url', 'Community Brochure PDF URL', { section: 'Media, Video & 3D Tours' })`, `U('ppt_url', 'Community Deck (.pptx) URL', { section: 'Media, Video & 3D Tours' })`.
- **`developers` entity:**
  - Add fields: `T('short_name', 'Short Brand Name', { list: true, search: true })`, `S('tier', 'Developer Tier', ['Master Developer', 'Tier-1 Developer', 'Luxury Boutique'], { list: true })`, `I('founded_year', 'Founded Year')`, `T('headquarters', 'Headquarters', { list: true })`, `TA('specialties', 'Specialties & Positioning', { span: 2 })`, `TA('amenities_standard', 'Signature Amenities & Standards', { span: 3 })`, `TA('flagship_projects', 'Flagship Projects', { span: 3 })`, `U('video_url', 'Developer Brand Film URL', { section: 'Media, Video & 3D Tours' })`, `U('virtual_tour_url', '3D Portfolio / Experience Center URL', { section: 'Media, Video & 3D Tours' })`, `U('brochure_url', 'Developer Profile Brochure PDF URL', { section: 'Media, Video & 3D Tours' })`, `U('ppt_url', 'Developer Pitch Deck (.pptx) URL', { section: 'Media, Video & 3D Tours' })`.
- **`src/shared/media.ts`:**
  - Expand `ProjectMediaKind` to `'photo' | 'video' | 'tour3d' | 'floorplan' | 'brochure' | 'ppt' | 'payment_plan'`.
  - Support `.pptx`/`.ppt` inference as `'ppt'` and payment-plan filename inference as `'payment_plan'`.
  - Add `MEDIA_CATEGORIES.ppt` and `MEDIA_CATEGORIES.payment_plan`.

### 4.3 Master Data Modules (`src/shared/uae-catalog/`)
- `src/shared/uae-catalog/developers.ts` — 77+ verified UAE developers (**55+ Dubai** + **22+ Abu Dhabi**) with full corporate profiles, RERA/DMT codes, websites, amenities, and logo/media references.
- `src/shared/uae-catalog/communities.ts` — 155+ verified UAE communities (**110+ Dubai** from DLD official registry + **45+ Abu Dhabi** islands, waterfronts & master districts) with full pricing, rents, yields, coordinates, transit, schools, hospitals, landmarks, amenities, 15-year forecasts, closing keywords, and pitch scripts.
- `src/shared/uae-catalog/projects.ts` — 400+ verified Dubai & Abu Dhabi projects across all 75+ developers (**250+ active unhanded-over off-plan launches through 2032** + **150+ flagship ready projects**), every single one strictly formatted `<Project Name> by <DeveloperShort>`, reusing verified renders in `public/media/launches/` + `public/media/communities/` + `public/media/properties/` (verified 100% present on disk) and enriched with amenities, payment plans, unit mix, handover dates, coordinates, and promotional highlights.
- `src/shared/uae-catalog/index.ts` — unified exports + helper lookups (`developerByName`, `communityByName`, `projectsByDeveloper`, `projectsByCommunity`, `offPlanProjectsOnly`).
- `src/shared/offplan-launches.ts` — updated to derive cleanly from the new UAE off-plan projects catalog (all Dubai & Abu Dhabi active unhanded-over launches) so no stale legacy rows remain.

### 4.4 On-Demand Branded Asset, PPTX, PDF & Social Kit Engine
- **Pure-TS PPTX Generator (`src/server/domain/pptx-builder.ts`):**
  - Builds standards-compliant `.pptx` OpenXML ZIP packages using Node's built-in `zlib` (zero extra external native dependencies, instant execution <20ms, opens cleanly in Microsoft PowerPoint, Google Slides, Apple Keynote, and LibreOffice).
  - SWK Matte Gold (`#8A621C` / `#D4AF37`) & Deep Navy (`#0F2A33`) architectural slide master, 6–7 tailored slides per Project, Developer, or Community.
- **Branded PDF Brochure & PDF Payment Plan Generator (`src/server/domain/catalog-kit.ts`):**
  - Uses existing `pdf-lib` dependency to render crisp, multi-page A4 PDF brochures and dedicated Payment Plan Schedule PDFs (with milestone dates, AED amounts, DLD 4% / ADM 2% fees, Oqood/Escrow protection clause, Golden Visa indicator, and SWK RERA ORN 51517 branding).
  - Enforces `assertZeroShabibPublicPayload` on every generated text payload.
- **Multi-Platform Social Media Template Engine (`src/shared/social-templates.ts`):**
  - Deterministic, rich, entity-aware social kit generator producing ready-to-post **English & Arabic** drafts for **every Community, Developer, and Project** across all 8 platforms: **Instagram (Post + Carousel + Reel + Story), Facebook, LinkedIn, TikTok, YouTube Shorts, X (Twitter), WhatsApp (1-to-1 + Broadcast), and Email**.
- **API Routes (`src/server/routes/catalog-kit.ts`, registered in `src/server/app.ts`):**
  - `GET /api/catalog-kit/:entity/:id/summary` — returns complete asset inventory (uploaded + generated URLs, amenities, 3D/video specs, related projects/counts, payment plan breakdown).
  - `GET /api/catalog-kit/:entity/:id/brochure.pdf` — streams downloadable PDF Brochure (`application/pdf`).
  - `GET /api/catalog-kit/:entity/:id/payment-plan.pdf` — streams downloadable PDF Payment Plan (`application/pdf`).
  - `GET /api/catalog-kit/:entity/:id/deck.pptx` — streams downloadable PowerPoint deck (`application/vnd.openxmlformats-officedocument.presentationml.presentation`).
  - `GET /api/catalog-kit/:entity/:id/social-kit` — returns all 8 platform templates in EN + AR.
  - `POST /api/catalog-kit/offplan/:id/promote-website` — *(Design Call: Draft-First & Idempotent Upsert)* Requires `website:edit` (Owner/Admin). Creates or updates (`upsert` by deterministic slug `op-<project-slug>`) a **draft** `website_listings` entry (`published: false`, `hot_offer: true`) and a **paused draft** `website_promotions` entry (`active: false`) with Zero-Shabib validation and absolute `config.publicUrl`-prefixed image URLs (when `/media/...` is used, avoiding broken cross-domain links on `swkpropertiesuae.com`). Never alters or deletes any existing published website listing; Owner/Admin reviews Trakheesi permit & publishes in Website Studio when ready.
- **Public Share Links (`/l/:token`) Expansion (`src/server/routes/share.ts`, `src/web/components/ShareWithClient.tsx`, `src/web/pages/PublicListing.tsx`):** *(Design Call)*
  - Expand `SHAREABLE` to `['properties', 'units', 'website_listings', 'developers', 'communities']` so **every Project, Developer, and Community** supports branded client share links (`/l/:token`), including token-gated public download routes (`/api/public/share/:token/kit/:idx/:kind` for `brochure.pdf`, `payment-plan.pdf`, and `deck.pptx`) with strict Zero-Shabib guard enforcement.
- **Extended Media Studio API (`src/server/routes/properties.ts`):**
  - Expand `MEDIA_ENTITIES` to `new Set(['properties', 'units', 'website_listings', 'developers', 'communities'])`.
  - Allow `.pptx` and `.ppt` uploads in Media Studio (and update magic byte verification in `src/server/routes/files.ts` so `.pptx` ZIP magic bytes `PK\x03\x04` pass cleanly).

### 4.5 Frontend UI Updates (`src/web/`)
1. **Rename `Properties → Projects` across UI:**
   - `src/shared/entities/properties.ts`, `src/shared/swk-pipeline.ts`, `src/web/swk/nav.ts`, `src/web/pages/swk/MasterLogPage.tsx`, `src/web/pages/swk/ListingsStudio.tsx` ("Project Listing Studio"), `src/web/pages/swk/OffPlanPage.tsx` ("Off-Plan Projects & Promotions"), `src/web/components/DeveloperProjectLaunchModal.tsx`, `src/web/lib/actions.tsx`, `src/web/pages/EntityPages.tsx`.
2. **New Reusable Component: `src/web/components/CatalogMarketingKit.tsx`:**
   - Mounted as a dedicated **"Brochure, PPT, 3D, Video & Social Kit"** tab on every **Project** (`/e/properties/:id`), **Developer** (`/e/developers/:id`), and **Community** (`/e/communities/:id`) record page, AND embedded inside the `OffPlanPage.tsx` detail drawer.
   - Displays:
     - **One-click Downloads:** Official/Branded **PDF Brochure**, **PDF Payment Plan**, **PowerPoint Deck (`.pptx`)**, and **Client Watermarked Share Link**.
     - **Amenities & Features Showcase** (structured chips + highlights).
     - **Interactive 3D Exterior & 3D Cutaway Floor Plan + Satellite 3D View** (`Property3DViewer` + `MediaTour3DEmbed`).
     - **Video Walkthrough & Launch Film** (`PropertyVideoTour` + `MediaVideoPlayer`).
     - **All-Platform Social Media Studio** (tabs for Instagram, Facebook, LinkedIn, TikTok, YouTube Shorts, X, WhatsApp, Email; EN / AR language switch; Copy Draft button; Direct WhatsApp button; *"Schedule to Website & Social Studio"* button).
3. **Related Projects Tabs (`src/web/lib/actions.tsx`):**
   - On every **Developer** record page: add Related tab **Projects** (`properties` filtered by `developer_ref`).
   - On every **Community** record page: add Related tab **Projects** (`properties` filtered by `community_ref`).
4. **Upgraded `OffPlanPage.tsx`:**
   - Loads full UAE catalog (`pageSize: 2000`), adds **Emirate filter (All UAE / Dubai / Abu Dhabi)**, **Search input**, **Promotion Spotlight Banner**, **Off-Plan Promotion Cards** (showing promo badges, payment plan bar, handover countdown, quick downloads for Brochure/Payment Plan/PPT/3D/Video/Social, and safe *"Promote to Website"* button), plus paginated/virtual-friendly grid rendering (`Load More` / page slices so 250+ cards stay silky fast on desktop & mobile!).
5. **Upgraded `ListingsStudio.tsx` ("Project Listing Studio"):**
   - Loads `pageSize: 2000`, adds Emirate & Developer filters, clean `<Project> by <Developer>` display, and paginated grid rendering for instant speed.
6. **Upgraded `MarketPage.tsx`:**
   - Supports **Dubai + Abu Dhabi** toggle across all 155+ communities (with search & segment filters), feeding from the unified UAE communities catalog (`GET /api/swk-ops/market-pulse`).
7. **Upgraded `ProjectMediaStudio.tsx`:**
   - Supports `developers` and `communities` entities + new `'ppt'` and `'payment_plan'` media kinds.

---

## 5. Verification & Testing Plan

- Update `tests/offplan-launches.ts` and add a comprehensive new test suite `tests/uae-projects-catalog.ts` (and wire it into `tests/run-all.sh`) verifying:
  1. **Zero-loss preservation:** Pre-populate published `website_listings`, `website_promotions`, `users`, `employees`, `attendance`, `leads`, `parties`, `jobs`, `invoices`, `crm_vault_properties`, plus legacy `properties`/`developers`/`communities`; run `runUaeCatalogMigrationAndSeed()`; assert **100% of published website, accounts, HR, CRM, deals, and accounting rows remain untouched**, while all legacy properties/developers/communities were wiped and replaced.
  2. **Catalog completeness:** Assert `≥ 50` Dubai developers, `≥ 20` Abu Dhabi developers, `≥ 100` Dubai communities, `≥ 40` Abu Dhabi communities, `≥ 250` active unhanded-over off-plan projects, `≥ 400` total projects, 100% strict `<Project> by <Developer>` naming, and 100% valid on-disk image paths.
  3. **Asset & Social Kit endpoints:** Verify `200 OK` and valid binary headers (`%PDF-` for brochure & payment plan PDFs, `PK\x03\x04` valid ZIP/OOXML with `ppt/presentation.xml` for `.pptx` decks) and all 8 social platforms (EN + AR, zero Shabib leak) for a Project, a Developer, and a Community.
  4. **Media Studio on Developers & Communities:** Upload a photo, PDF, and `.pptx` onto a Developer and a Community and verify persistence.
  5. **Full repo checks:** `npm run typecheck`, `npm run build`, and existing tests (`tests/smoke.ts`, `tests/project-launch-media.ts`, `tests/offplan-launches.ts`, `tests/zero-leak-superapp.ts`, `tests/uae-projects-catalog.ts`).

---

## 6. Decisions Left to the Builder

- Exact visual layout styling of slide typography/cards inside `pptx-builder.ts` and `catalog-kit.ts` PDFs (following SWK Matte Gold & Deep Navy brand palette from `DESIGN.md`).
- Client-side pagination slice size (e.g., 24 or 36 cards per page) on `OffPlanPage.tsx` and `ListingsStudio.tsx` for optimal mobile WebView performance.
- Exact selection of additional niche sub-communities beyond the core 110+ Dubai and 45+ Abu Dhabi districts from local DLD/Abu Dhabi datasets.
