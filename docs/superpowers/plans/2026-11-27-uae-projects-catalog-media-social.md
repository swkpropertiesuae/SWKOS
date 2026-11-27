# SWK OS UAE Projects, Developers, Communities, Off-Plan Promotions & Marketing Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild SWK OS's real estate master catalog with a safe catalog-only reset, `Properties → Projects` UI rename (`<Project> by <Developer>`), 75+ Dubai & Abu Dhabi developers, 155+ Dubai & Abu Dhabi communities, 400+ real projects (250+ active unhanded-over off-plan launches & promotions), extended Media Studio, and on-demand PDF Brochure, PDF Payment Plan, PPTX Deck, 3D Plan, Video Tour, and 8-platform Social Media Kit for every Community, Developer, and Project.

**Architecture:** Keep internal SQL table/API keys (`properties`, `/api/e/properties`) stable while renaming all user-facing terminology to **Project / Projects**. Author unified TypeScript UAE master data modules (`src/shared/uae-catalog/`) plus local verified visual assets (`public/media/`), run a one-time referentially-safe startup catalog migration (`src/server/domain/uae-catalog-sync.ts`) that leaves published website data, accounts, HR/attendance, CRM leads/vault, deals, and accounting 100% untouched, and serve on-demand branded PDF/PPTX/Social kits via `/api/catalog-kit/*` and expanded `/l/:token` share links.

**Tech Stack:** TypeScript 5.9, Node 22+, Fastify 5, React 19, Vite 7, Tailwind CSS 4, `better-sqlite3` + PostgreSQL (`pgbridge.ts`), `pdf-lib`, pure-TS OpenXML `.pptx` builder (`node:zlib`), `zod`, `@tanstack/react-query`, `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-11-27-uae-projects-catalog-media-social-design.md`

---

## Global Constraints

- **Zero-Loss Preservation:** Never delete or mutate `website_listings`, `website_promotions`, `website_social_campaigns`, `users`, `roles`, `sessions`, `employees`, `agents`, `attendance*`, `leave_requests`, `payslips`, `leads`, `parties`, `contacts`, `opportunities`, `crm_vault_*`, `jobs`, `mandates`, `leases`, `invoices`, `bills`, `receipts`, `payments`, `journal_*`, `accounts`, `vat_codes`, or `share_links`.
- **RBAC Lockdown Intact:** Do not weaken `src/shared/swk-staff-access.ts`; `tests/rbac-zero-leak.ts` and `tests/zero-leak-superapp.ts` must remain green.
- **Naming Standard:** Every seeded project title must match `<Project Name> by <DeveloperShort>` (e.g., `Shahrukhz by Danube`).
- **Dual Database Compatibility:** All SQL and `syncSchema()` entity field definitions must run cleanly on both SQLite and PostgreSQL (`toPg()`).
- **Zero-Shabib Public Guard:** All generated PDFs, PPTX decks, social drafts, promoted website drafts, and public share payloads must pass `assertZeroShabibPublicPayload` and carry the RERA/ADM indicative disclaimer (`SWK Properties LLC · RERA ORN 51517`).
- **Zero Missing Media:** Every local `/media/...` path referenced in catalog data must exist on disk under `public/`.
- **Legacy Test Compatibility:** `OFFPLAN_LAUNCHES=false` in `tests/run-all.sh` must continue to skip seeding project rows in `properties` for older smoke suites that expect an empty business workspace.

## Review Focus

1. **Referential safety on live deals after reset:** An existing `job`/`mandate`/`lease` referencing a legacy property must still save on edit without HTTP 400 while the legacy property is soft-archived and invisible in `GET /api/e/properties`. (Pinned in Tasks 1 & 4)
2. **Idempotent double-boot & staff deletions:** Running startup tasks twice must not duplicate developers/communities/projects or re-wipe records added after the migration. (Pinned in Task 4)
3. **Zero-Shabib privacy leak in client kits:** Generated brochures, payment plans, PPTX decks, EN/AR social drafts, and website promotion drafts must pass `assertZeroShabibPublicPayload`. (Pinned in Tasks 5 & 8)
4. **Abu Dhabi 2% ADM fee & WinAnsi PDF safety:** Abu Dhabi payment plans must calculate 2% ADM fee (Dubai = 4% DLD fee), and PDF generation must sanitize non-WinAnsi Unicode characters without throwing. (Pinned in Task 5)
5. **No 500-row truncation & strict RBAC on kit/promote endpoints:** Project/Off-Plan queries must support 2,000+ rows; restricted staff must stay blocked from `/api/catalog-kit/properties/*` and `promote-website`, while permitted to view `/api/catalog-kit/developers/*` and `/api/catalog-kit/communities/*`. (Pinned in Tasks 5 & 8)

---

## File Map

| Area | Create | Modify |
| :--- | :--- | :--- |
| Schema, Media & Referential Engine | — | `src/shared/entities/properties.ts`, `src/shared/media.ts`, `src/server/engine.ts`, `src/server/routes/files.ts`, `src/server/routes/properties.ts` |
| UAE Master Catalog & Visuals | `src/shared/uae-catalog/types.ts`, `src/shared/uae-catalog/developers.ts`, `src/shared/uae-catalog/communities.ts`, `src/shared/uae-catalog/projects.ts`, `src/shared/uae-catalog/index.ts`, `public/media/developers/*.svg`, `public/media/communities/abudhabi-*.svg` | `src/shared/offplan-launches.ts`, `src/web/swk/uae.ts`, `src/server/routes/swk-ops.ts` |
| Reset Migration & Seeder | `src/server/domain/uae-catalog-sync.ts` | `src/server/startup-data.ts`, `src/server/seed/index.ts`, `src/server/domain/offplan-launches.ts` |
| PDF, PPTX, Social & Promote API | `src/server/domain/pptx-builder.ts`, `src/shared/social-templates.ts`, `src/server/domain/catalog-kit.ts`, `src/server/routes/catalog-kit.ts` | `src/server/app.ts` |
| Public Share Links Expansion | — | `src/server/routes/share.ts`, `src/web/components/ShareWithClient.tsx`, `src/web/pages/PublicListing.tsx` |
| Frontend UI & Marketing Kit | `src/web/components/CatalogMarketingKit.tsx` | `src/web/components/ProjectMediaStudio.tsx`, `src/web/components/DeveloperProjectLaunchModal.tsx`, `src/web/components/brochure/PropertyVideoTour.tsx`, `src/web/pages/EntityPages.tsx`, `src/web/pages/swk/OffPlanPage.tsx`, `src/web/pages/swk/ListingsStudio.tsx`, `src/web/pages/swk/MarketPage.tsx`, `src/web/pages/swk/MasterLogPage.tsx`, `src/web/swk/nav.ts`, `src/shared/swk-pipeline.ts`, `src/web/lib/actions.tsx` |
| Tests | `tests/uae-projects-catalog.ts` | `tests/offplan-launches.ts`, `tests/run-all.sh` |

---

### Task 1: Entity Schema, `Properties → Projects` Labels, Extended Media Kinds & Referential Safety

**Files:**
- Modify: `src/shared/entities/properties.ts:10-161`
- Modify: `src/shared/media.ts:1-130`
- Modify: `src/server/engine.ts:483-489, 706`
- Modify: `src/server/routes/files.ts:18-48`
- Modify: `src/server/routes/properties.ts:156-220, 260-340, 709`
- Test: `tests/uae-projects-catalog.ts` (initial unit/engine assertions)

**Interfaces:**
- Produces:
  - `ProjectMediaKind = 'photo' | 'video' | 'tour3d' | 'floorplan' | 'brochure' | 'ppt' | 'payment_plan'`
  - `ENTITIES.properties` (`label: 'Project'`, `plural: 'Projects'`, fields: `project_name`, `emirate`, `handover_quarter`, `payment_plan_summary`, `unit_mix`, `total_units`, `available_units`, `launch_status`, `promo_headline`, `promo_badge`, `promo_benefits`, `ppt_url`, `payment_plan_pdf_url`)
  - `ENTITIES.communities` (fields: `ticker`, `segment`, `service_charge_sqft`, `latitude`, `longitude`, `amenities`, `schools`, `hospitals`, `metro_transit`, `future_outlook`, `closing_keywords`, `video_url`, `virtual_tour_url`, `brochure_url`, `ppt_url`)
  - `ENTITIES.developers` (fields: `short_name`, `tier`, `founded_year`, `headquarters`, `specialties`, `amenities_standard`, `flagship_projects`, `video_url`, `virtual_tour_url`, `brochure_url`, `ppt_url`)
  - `assertRefs(def: EntityDef, rec: Rec, old?: Rec | null)` allowing unchanged soft-archived legacy refs on update
  - `/api/media/:entity/:id` accepting `entity ∈ {'properties', 'units', 'website_listings', 'developers', 'communities'}`

- [ ] **Step 1: Install dependencies if `node_modules` is absent & write failing schema/media/engine test**

Create initial `tests/uae-projects-catalog.ts` asserting:
- `getDef('properties').label === 'Project'` and `plural === 'Projects'`
- `inferMediaKindFromFile('deck.pptx') === 'ppt'` and `inferMediaKindFromFile('payment-plan.pdf', 'application/pdf') === 'payment_plan'`
- Updating a `jobs` record whose `property_id` points to a soft-deleted (`deleted_at IS NOT NULL`) property succeeds when `property_id` is unchanged, while creating a new `jobs` record pointing to a soft-deleted property fails with HTTP 400.
- `GET /api/media/developers/:id` and `GET /api/media/communities/:id` return `200 OK` (and accept `.pptx` upload).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd install` (if `node_modules` missing), then `node --import tsx tests/uae-projects-catalog.ts`
Expected: FAIL on label mismatch / missing `ppt` kind / `assertRefs` rejection / `Media Studio supports properties, units, and website_listings only`.

- [ ] **Step 3: Implement schema, media, engine & media route updates**

- Update `src/shared/entities/properties.ts`: rename `properties` entity display labels (`Project` / `Projects`, `Project No.`, `Project Title`), update `units` label `Property` → `Project`, add new fields on `properties`, `communities`, and `developers`.
- Update `src/shared/media.ts`: add `'ppt'` and `'payment_plan'` to `ProjectMediaKind`, `MEDIA_CATEGORIES`, `inferMediaKindFromFile()`, and `normalizeMediaList()`.
- Update `src/server/engine.ts`: change `assertRefs(def, rec, old)` so when `old` has the exact same ref ID as `rec`, check existence without `AND deleted_at IS NULL`; pass `old` from `updateRecord()`.
- Update `src/server/routes/files.ts`: add `pptx` and `ppt` to `INLINE_MEDIA_MIMES` (or keep attachment download with valid OOXML mime) and validate `.pptx` ZIP magic bytes (`PK\x03\x04`) safely in `verifyFileMagicBytes()`.
- Update `src/server/routes/properties.ts`: expand `MEDIA_ENTITIES` to `['properties', 'units', 'website_listings', 'developers', 'communities']`, sync `ppt_url` / `payment_plan_pdf_url` / `brochure_url` / `video_url` / `virtual_tour_url` in `syncPrimaryMediaFields()`, and allow `'ppt'` & `'payment_plan'` in media link/upload validators.

- [ ] **Step 4: Verify test & typecheck pass**

Run: `node --import tsx tests/uae-projects-catalog.ts` and `npm.cmd run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/entities/properties.ts src/shared/media.ts src/server/engine.ts src/server/routes/files.ts src/server/routes/properties.ts tests/uae-projects-catalog.ts
git commit -m "feat(schema,media): rename Properties to Projects, expand media studio to developers/communities and harden archived refs"
```

---

### Task 2: Authoritative UAE Developers (75+) & Communities (155+) Master Catalog + Local Visual Assets

**Files:**
- Create: `src/shared/uae-catalog/types.ts`
- Create: `src/shared/uae-catalog/developers.ts`
- Create: `src/shared/uae-catalog/communities.ts`
- Create: `public/media/developers/*.svg` (crisp Matte Gold / Deep Navy brand emblem SVGs for developers without PNGs)
- Create: `public/media/communities/abudhabi-*.svg` (curated architectural skyline/waterfront SVG hero art for Abu Dhabi islands & districts)
- Modify: `src/web/swk/uae.ts:162-224`
- Modify: `src/server/routes/swk-ops.ts:42-1285` (replace hardcoded 24-area array with unified `UAE_AREAS_FULL`, keeping `DUBAI_AREAS_24` alias export)
- Test: `tests/uae-projects-catalog.ts`

**Interfaces:**
- Produces:
  - `UaeDeveloperSpec`, `UaeCommunitySpec`, `UaeProjectSpec` in `src/shared/uae-catalog/types.ts`
  - `UAE_DEVELOPERS: readonly UaeDeveloperSpec[]` (≥ 55 Dubai + ≥ 22 Abu Dhabi = ≥ 77 developers, unique `code` & `name`)
  - `UAE_COMMUNITIES: readonly UaeCommunitySpec[]` (≥ 110 Dubai + ≥ 45 Abu Dhabi = ≥ 155 communities, unique `code`, `slug`, `ticker`, complete market stats, coordinates, landmarks, transit, schools, hospitals, amenities, 15-year forecast 2026–2041, closing keywords, pitch scripts)
  - `COMMUNITIES`, `DEVELOPERS`, `communityByName()` in `src/web/swk/uae.ts` backed by `UAE_COMMUNITIES` and `UAE_DEVELOPERS`

- [ ] **Step 1: Add failing assertions to `tests/uae-projects-catalog.ts`**

Assert:
- `UAE_DEVELOPERS.filter(d => d.emirate === 'Dubai').length >= 55`
- `UAE_DEVELOPERS.filter(d => d.emirate === 'Abu Dhabi').length >= 22`
- `UAE_COMMUNITIES.filter(c => c.emirate === 'Dubai').length >= 110`
- `UAE_COMMUNITIES.filter(c => c.emirate === 'Abu Dhabi').length >= 45`
- Zero duplicate codes/slugs/names; every `logo` and `image` path exists on disk under `public/`; every community has non-empty `landmarks`, `schools`, `hospitals`, `amenities`, `closingKeywords`, `fieldVisitPitchScript`, and 5-point `forecast15Y` (2026–2041).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx tests/uae-projects-catalog.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Author `types.ts`, `developers.ts`, `communities.ts`, local SVG visual assets, and wire `uae.ts` & `swk-ops.ts`**

- Read official Dubai DLD developer/area CSVs (`D:\04_Dubai_Real_Estate_Open_Data\...\dld_carea_lookup_437_areas_2026_11_21.csv`, `communities.csv`, `developers.csv`) and Abu Dhabi district data (`eVoost__abu-dhabi-ai-proptech-challenge/districts.csv`) to ground real names, median AED/sqft, yields, and coordinates.
- Generate clean local brand SVG emblems in `public/media/developers/` (matching existing `logo-01.png`..`logo-10.png` for the top 10 and crisp SVGs for the remaining 67+ developers) and Abu Dhabi architectural hero SVG cards in `public/media/communities/`.
- Update `src/web/swk/uae.ts` and `src/server/routes/swk-ops.ts` so `Market Pulse` and calculators consume the unified Dubai + Abu Dhabi communities catalog.

- [ ] **Step 4: Run test & typecheck**

Run: `node --import tsx tests/uae-projects-catalog.ts` and `npm.cmd run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/uae-catalog/types.ts src/shared/uae-catalog/developers.ts src/shared/uae-catalog/communities.ts src/web/swk/uae.ts src/server/routes/swk-ops.ts public/media/developers public/media/communities tests/uae-projects-catalog.ts
git commit -m "feat(catalog): add 77+ Dubai & Abu Dhabi developers and 155+ communities with full market intelligence"
```

---

### Task 3: Comprehensive UAE Projects (400+) & Active Unhanded-Over Off-Plan Launches (250+) Catalog

**Files:**
- Create: `src/shared/uae-catalog/projects.ts`
- Create: `src/shared/uae-catalog/index.ts`
- Modify: `src/shared/offplan-launches.ts` (replace legacy 105 Dubai-only array with unified projection from `UAE_PROJECTS.filter(p => p.isOffPlan)`)
- Test: `tests/uae-projects-catalog.ts`

**Interfaces:**
- Consumes: `UAE_DEVELOPERS`, `UAE_COMMUNITIES` from Task 2
- Produces:
  - `UAE_PROJECTS: readonly UaeProjectSpec[]` (≥ 400 total real projects across all 77+ developers; ≥ 250 active unhanded-over off-plan launches across Dubai & Abu Dhabi with handover ≥ Q4 2026; ≥ 150 flagship ready/completed projects)
  - `UAE_OFFPLAN_PROJECTS: readonly UaeProjectSpec[]`
  - `formatProjectTitle(projectName: string, developerShortName: string): string` → `"<Project Name> by <DeveloperShort>"`
  - `OFFPLAN_LAUNCHES` in `src/shared/offplan-launches.ts` synchronized with `UAE_OFFPLAN_PROJECTS`

- [ ] **Step 1: Add failing project catalog assertions to `tests/uae-projects-catalog.ts`**

Assert:
- `UAE_PROJECTS.length >= 400` and `UAE_OFFPLAN_PROJECTS.length >= 250`
- Every single developer in `UAE_DEVELOPERS` (all 77+) has at least 2 projects in `UAE_PROJECTS` (and all major developers have their full flagship + off-plan lineups, including `Shahrukhz by Danube` where `projectName === 'Shahrukhz'` and developer is `Danube Properties`)
- Both Dubai (`>= 180` off-plan) and Abu Dhabi (`>= 60` off-plan) are richly represented
- 100% of projects match `<ProjectName> by <DeveloperShort>` title convention, reference valid `developerCode` in `UAE_DEVELOPERS` and valid `communityCode` in `UAE_COMMUNITIES`, have non-empty `amenities`, `paymentPlan`, `unitMix`, `promoHeadline`, `promoBenefits`, and have 100% existing on-disk image paths under `public/`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx tests/uae-projects-catalog.ts`
Expected: FAIL.

- [ ] **Step 3: Author `src/shared/uae-catalog/projects.ts`, `index.ts`, and update `src/shared/offplan-launches.ts`**

- Reuse every matching authentic render from `public/media/launches/*.webp` (including `shahrukhz-residences-by-danube-1.webp`, `tilal-binghatti-*.webp`, `shione-by-beyond-*.webp`, `lumena-alta-by-omniyat-1.webp`, etc.) alongside community/property visuals so all 130 authentic developer renders are linked cleanly and zero paths break.
- Ensure every active off-plan launch has handover date ≥ `2026-12-01` (yet to be handed over as of 2026-11-27), realistic starting price (AED), bedrooms/unit mix, payment plan split, amenities list, and promotional highlight fields.

- [ ] **Step 4: Run test & typecheck**

Run: `node --import tsx tests/uae-projects-catalog.ts` and `npm.cmd run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/uae-catalog/projects.ts src/shared/uae-catalog/index.ts src/shared/offplan-launches.ts tests/uae-projects-catalog.ts
git commit -m "feat(catalog): add 400+ Dubai & Abu Dhabi projects and 250+ active off-plan launches with strict Project by Developer naming"
```

---

### Task 4: Safe One-Time Catalog-Only Reset Migration & Fast Batched UAE Seeder

**Files:**
- Create: `src/server/domain/uae-catalog-sync.ts`
- Modify: `src/server/startup-data.ts:1-76`
- Modify: `src/server/seed/index.ts:214-298`
- Modify: `src/server/domain/offplan-launches.ts:1-131`
- Modify: `tests/offplan-launches.ts:1-69`
- Test: `tests/uae-projects-catalog.ts`

**Interfaces:**
- Consumes: `UAE_DEVELOPERS`, `UAE_COMMUNITIES`, `UAE_PROJECTS` from Tasks 2–3
- Produces:
  - `CATALOG_RESET_KEY = 'catalog_reset:uae_projects_v5_2026_11_27'`
  - `CATALOG_SEED_KEY = 'catalog_seed:uae_projects_v5_2026_11_27'`
  - `runUaeCatalogMigrationAndSeed(opts?: { seedProjects?: boolean; skipBackup?: boolean }): Promise<{ resetRan: boolean; hardDeleted: Record<string, number>; softArchived: Record<string, number>; seeded: { developers: number; communities: number; paymentPlans: number; projects: number } }>`

- [ ] **Step 1: Write failing migration & zero-loss preservation tests in `tests/uae-projects-catalog.ts`**

On a fresh temp SQLite DB:
1. Seed legacy rows: 20 dummy legacy `properties`, 5 legacy `units`, 3 legacy `developers`, 3 legacy `communities`; ALSO insert 1 published `website_listings`, 1 active `website_promotions`, 1 `users` (staff/owner), 1 `employees`, 1 `attendance`, 1 `leads`, 1 `parties`, 1 `crm_vault_properties`, 1 `jobs` referencing legacy property #1, 1 `invoices` referencing legacy property #1.
2. Run `runUaeCatalogMigrationAndSeed({ seedProjects: true, skipBackup: true })`.
3. Assert:
   - Published `website_listings`, `website_promotions`, `users`, `employees`, `attendance`, `leads`, `parties`, `crm_vault_properties`, `jobs`, and `invoices` counts are **100% unchanged**.
   - Unreferenced legacy properties/developers/communities were hard-deleted; legacy property #1 (referenced by `jobs`/`invoices`) was soft-archived (`deleted_at IS NOT NULL`) and does NOT appear in `SELECT * FROM properties WHERE deleted_at IS NULL`.
   - Updating the preserved `jobs` row (e.g., changing `stage_12`) succeeds without HTTP 400!
   - Fresh DB now has `>= 77` developers, `>= 155` communities, `>= 400` projects (`>= 250` with `is_off_plan = 1`), including `Shahrukhz by Danube`.
   - Calling `runUaeCatalogMigrationAndSeed({ seedProjects: true, skipBackup: true })` a second time is a no-op (`resetRan === false`, `seeded.projects === 0`, counts unchanged, and a staff-deleted project stays deleted).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx tests/uae-projects-catalog.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/server/domain/uae-catalog-sync.ts` and integrate with `startup-data.ts`, `seed/index.ts`, `offplan-launches.ts`**

- Implement batched single-transaction safe reset + catalog seeder (using direct parameterized SQL inserts compatible with both SQLite and `toPg()`, keeping runtime < 2s).
- In `startup-data.ts`: run `await runUaeCatalogMigrationAndSeed({ seedProjects: config.offplanLaunches })` (replacing the legacy `ensureOffPlanLaunches()` call).
- In `seed/index.ts`: seed `UAE_COMMUNITIES` and `UAE_DEVELOPERS` in fresh DBs instead of the old 24/14 lists.
- Update `src/server/domain/offplan-launches.ts` and `tests/offplan-launches.ts` to align cleanly with the new UAE catalog.

- [ ] **Step 4: Run tests**

Run: `node --import tsx tests/uae-projects-catalog.ts` and `node --import tsx tests/offplan-launches.ts`
Expected: Both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/domain/uae-catalog-sync.ts src/server/startup-data.ts src/server/seed/index.ts src/server/domain/offplan-launches.ts tests/offplan-launches.ts tests/uae-projects-catalog.ts
git commit -m "feat(migration): add safe catalog-only reset and batched UAE master catalog seeder"
```

---

### Task 5: On-Demand PDF Brochure, PDF Payment Plan, Pure-TS PPTX Deck, 8-Platform Social Engine & Safe Website Promote API

**Files:**
- Create: `src/server/domain/pptx-builder.ts`
- Create: `src/shared/social-templates.ts`
- Create: `src/server/domain/catalog-kit.ts`
- Create: `src/server/routes/catalog-kit.ts`
- Modify: `src/server/app.ts:201-208` (register `catalog-kit` route)
- Test: `tests/uae-projects-catalog.ts`

**Interfaces:**
- Consumes: `UAE_DEVELOPERS`, `UAE_COMMUNITIES`, `UAE_PROJECTS`, `assertZeroShabibPublicPayload`, `pdf-lib`
- Produces:
  - `buildSwkPptxDeck(spec: PptxDeckSpec): Buffer` (valid OOXML ZIP containing `[Content_Types].xml`, `_rels/.rels`, `ppt/presentation.xml`, slide XMLs)
  - `buildSocialMediaKit(input: SocialKitSubject): SocialMediaKitResult` (8 platforms: `instagram`, `facebook`, `linkedin`, `tiktok`, `youtube`, `x`, `whatsapp`, `email`; each with `en` & `ar` drafts, hashtags, CTA, optional carousel/reel/script breakdown)
  - `generateCatalogBrochurePdf(ctx: CatalogKitContext): Promise<Buffer>` (WinAnsi-sanitized, RERA/ADM disclaimer, Zero-Shabib checked)
  - `generateCatalogPaymentPlanPdf(ctx: CatalogKitContext): Promise<Buffer>` (Dubai = 4% DLD, Abu Dhabi = 2% ADM, milestone schedule table, WinAnsi-sanitized)
  - Fastify routes:
    - `GET /api/catalog-kit/:entity/:id/summary`
    - `GET /api/catalog-kit/:entity/:id/brochure.pdf`
    - `GET /api/catalog-kit/:entity/:id/payment-plan.pdf`
    - `GET /api/catalog-kit/:entity/:id/deck.pptx`
    - `GET /api/catalog-kit/:entity/:id/social-kit`
    - `POST /api/catalog-kit/offplan/:id/promote-website` (Owner/Admin only, draft-first `published: false`, idempotent upsert by slug, absolute image URL)

- [ ] **Step 1: Add failing API & generator tests to `tests/uae-projects-catalog.ts`**

Assert via `app.inject`:
- For a Dubai Project (`Shahrukhz by Danube`), an Abu Dhabi Project (e.g., `Saadiyat Lagoons by Aldar`), a Developer, and a Community:
  - `GET /api/catalog-kit/:entity/:id/brochure.pdf` → `200`, `content-type: application/pdf`, starts with `%PDF-`, size > 2 KB
  - `GET /api/catalog-kit/:entity/:id/payment-plan.pdf` → `200`, `content-type: application/pdf`, starts with `%PDF-`; unit-test Abu Dhabi fee = 2% ADM and Dubai fee = 4% DLD, and test Unicode/Arabic input does not throw
  - `GET /api/catalog-kit/:entity/:id/deck.pptx` → `200`, valid ZIP (`PK\x03\x04`) containing `ppt/presentation.xml` and `ppt/slides/slide1.xml`
  - `GET /api/catalog-kit/:entity/:id/social-kit` → `200`, all 8 platforms with `en` and `ar`, passes `assertZeroShabibPublicPayload`
- `POST /api/catalog-kit/offplan/:id/promote-website` as Admin → creates draft (`published: false`) `website_listings` & `website_promotions` (`active: false`); calling again upserts the same record without creating duplicates and without touching existing published website listings
- Restricted staff (`talha@swk.properties`) gets `403` on `/api/catalog-kit/properties/:id/summary` and `promote-website`, and `200` on `/api/catalog-kit/developers/:id/summary` and `/api/catalog-kit/communities/:id/summary`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx tests/uae-projects-catalog.ts`
Expected: FAIL (404 routes not registered).

- [ ] **Step 3: Implement `pptx-builder.ts`, `social-templates.ts`, `catalog-kit.ts`, `routes/catalog-kit.ts` and register in `app.ts`**

- Implement pure-TS ZIP/CRC32 + OOXML PresentationML `.pptx` writer in `src/server/domain/pptx-builder.ts` (6 branded slides: Cover, Executive Profile, Specs & Amenities, Location & Community Intelligence, Payment Plan & ROI, SWK Private Advisory Contact).
- Implement WinAnsi text sanitizer (`toPdfSafeText`) inside `src/server/domain/catalog-kit.ts` so `pdf-lib` Helvetica/TimesRoman never crashes on smart quotes, em-dashes, currency glyphs, or Arabic text.
- Enforce `assertZeroShabibPublicPayload` across every generated text block before returning PDF/PPTX/Social JSON.

- [ ] **Step 4: Run tests & typecheck**

Run: `node --import tsx tests/uae-projects-catalog.ts` and `npm.cmd run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/domain/pptx-builder.ts src/shared/social-templates.ts src/server/domain/catalog-kit.ts src/server/routes/catalog-kit.ts src/server/app.ts tests/uae-projects-catalog.ts
git commit -m "feat(kit): add on-demand PDF brochure, payment plan, PPTX deck, 8-platform social templates and safe website promote API"
```

---

### Task 6: Public Watermarked Share Links (`/l/:token`) for Projects, Developers & Communities

**Files:**
- Modify: `src/server/routes/share.ts:23-547`
- Modify: `src/web/components/ShareWithClient.tsx`
- Modify: `src/web/pages/PublicListing.tsx`
- Test: `tests/uae-projects-catalog.ts`

**Interfaces:**
- Consumes: `generateCatalogBrochurePdf`, `generateCatalogPaymentPlanPdf`, `generateCatalogPptxDeck` from Task 5
- Produces:
  - `SHAREABLE = ['properties', 'units', 'website_listings', 'developers', 'communities']`
  - `GET /api/public/share/:token/kit/:idx/:kind` where `kind ∈ {'brochure.pdf', 'payment-plan.pdf', 'deck.pptx'}` (unauthenticated, token-validated, Zero-Shabib guarded)

- [ ] **Step 1: Add failing share-link tests for Developer & Community to `tests/uae-projects-catalog.ts`**

Assert:
- Creating share links for `entity: 'developers'` and `entity: 'communities'` returns `200/201` with `token`.
- `GET /api/public/share/:token` returns valid `items` with `kit_downloads` (`brochure_pdf`, `payment_plan_pdf`, `deck_pptx`) and passes Zero-Shabib guard.
- `GET /api/public/share/:token/kit/0/brochure.pdf` and `deck.pptx` return `200` with valid PDF/ZIP signatures.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx tests/uae-projects-catalog.ts`
Expected: FAIL (`SHAREABLE` rejects `developers` & `communities`).

- [ ] **Step 3: Implement share-link expansion in `share.ts`, `ShareWithClient.tsx`, and `PublicListing.tsx`**

- Map `developers` and `communities` records cleanly into `RawItem` in `src/server/routes/share.ts`, attach `kit_downloads` on every shared Project/Developer/Community item, and expose token-gated `/api/public/share/:token/kit/:idx/:kind`.
- Add `developers` & `communities` to `SHAREABLE_ENTITIES` in `src/web/components/ShareWithClient.tsx` and render Brochure PDF / Payment Plan PDF / PPTX Deck download buttons in `src/web/pages/PublicListing.tsx`.

- [ ] **Step 4: Run test & typecheck**

Run: `node --import tsx tests/uae-projects-catalog.ts` and `npm.cmd run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/share.ts src/web/components/ShareWithClient.tsx src/web/pages/PublicListing.tsx tests/uae-projects-catalog.ts
git commit -m "feat(share): support watermarked client share links and PDF/PPTX kit downloads for projects, developers and communities"
```

---

### Task 7: Frontend Overhaul — `Properties → Projects`, `CatalogMarketingKit`, Media Studio, Off-Plan Promotions, Listing Studio & Market Pulse

**Files:**
- Create: `src/web/components/CatalogMarketingKit.tsx`
- Modify: `src/web/components/ProjectMediaStudio.tsx`
- Modify: `src/web/components/DeveloperProjectLaunchModal.tsx`
- Modify: `src/web/components/brochure/PropertyVideoTour.tsx`
- Modify: `src/web/pages/EntityPages.tsx`
- Modify: `src/web/pages/swk/OffPlanPage.tsx`
- Modify: `src/web/pages/swk/ListingsStudio.tsx`
- Modify: `src/web/pages/swk/MarketPage.tsx`
- Modify: `src/web/pages/swk/MasterLogPage.tsx`
- Modify: `src/web/swk/nav.ts`
- Modify: `src/shared/swk-pipeline.ts`
- Modify: `src/web/lib/actions.tsx`

**Interfaces:**
- Consumes: `/api/catalog-kit/:entity/:id/*`, `/api/media/:entity/:id/*`, `UAE_COMMUNITIES`, `UAE_DEVELOPERS`
- Produces:
  - `<CatalogMarketingKit entity={'properties' | 'developers' | 'communities'} id={number} record={Record<string, any>} />`
  - Updated `<ProjectMediaStudio entity={'properties' | 'units' | 'website_listings' | 'developers' | 'communities'} />` with 7 media kinds (`Photos`, `Videos`, `3D / 360°`, `Floor Plans`, `Brochures`, `PPT Decks`, `Payment Plans`)

- [ ] **Step 1: Build `src/web/components/CatalogMarketingKit.tsx` & extend `ProjectMediaStudio.tsx` and `PropertyVideoTour.tsx`**

- `CatalogMarketingKit.tsx` provides:
  - Branded Download Bar: **Download PDF Brochure**, **Download PDF Payment Plan**, **Download PowerPoint (.pptx)**, plus official uploaded file links when present.
  - Amenities & Highlights chips matrix.
  - Interactive **3D Exterior & 3D Cutaway Floor Plan + Satellite 3D View** (`Property3DViewer` + `MediaTour3DEmbed`).
  - Interactive **Cinematic Video Tour & Launch Film** (`PropertyVideoTour` updated to support Dubai & Abu Dhabi, Developer portfolios, and Community tours + `MediaVideoPlayer`).
  - **8-Platform Social Media Studio** (Instagram, Facebook, LinkedIn, TikTok, YouTube Shorts, X, WhatsApp, Email) with **EN / AR switch**, one-click **Copy Draft**, **WhatsApp Share**, **Download All Drafts (.txt)**, and **Schedule in Website & Social Studio** (`POST /api/website/social-campaigns`).

- [ ] **Step 2: Wire `EntityPages.tsx` & `actions.tsx` for Projects, Developers, and Communities**

- Enable **Media, Video & 3D** tab and **Brochure, PPT, 3D, Video & Social Kit** tab on `properties`, `developers`, and `communities` record pages.
- Add Related tab **Projects** on both `developers` (`field: 'developer_ref'`) and `communities` (`field: 'community_ref'`) in `src/web/lib/actions.tsx`.

- [ ] **Step 3: Upgrade `OffPlanPage.tsx`, `ListingsStudio.tsx`, `MarketPage.tsx`, `DeveloperProjectLaunchModal.tsx`, `MasterLogPage.tsx`, `nav.ts`, `swk-pipeline.ts`**

- Rename `Properties → Projects` across nav, headers, buttons, forms, and Master Log (`Master Projects`, `Project Listing Studio`, `Off-Plan Projects & Promotions`).
- Update `DeveloperProjectLaunchModal.tsx` with separate **Project Name** + **Developer** inputs that auto-format `<Project Name> by <Developer>` (e.g., `Shahrukhz by Danube`) plus **Emirate** (`Dubai` / `Abu Dhabi`) and **PPT / Payment Plan PDF** upload slots.
- Upgrade `OffPlanPage.tsx`: `pageSize: 2000`, Emirate tabs (`All UAE`, `Dubai`, `Abu Dhabi`), Search input, Promotion Spotlight Carousel, paginated cards (`24` per page + Load More), embedded `CatalogMarketingKit` inside the project drawer, and safe Owner/Admin **"Promote Draft to Website Studio"** button.
- Upgrade `ListingsStudio.tsx` ("Project Listing Studio"): `pageSize: 2000`, Emirate & Developer filters, paginated grid (`24` per page), Project terminology.
- Upgrade `MarketPage.tsx`: Dubai + Abu Dhabi Emirate switcher across all 155+ communities with search & Site-Visit Area Companion support for both Emirates.

- [ ] **Step 4: Run TypeScript typecheck & full production Vite + API build**

Run: `npm.cmd run typecheck` and `npm.cmd run build`
Expected: `0` TypeScript errors, clean `dist/web` and `dist/server/index.mjs` build.

- [ ] **Step 5: Commit**

```bash
git add src/web src/shared/swk-pipeline.ts
git commit -m "feat(ui): rename Properties to Projects and add UAE Off-Plan Promotions, Market Pulse and per-entity Marketing & Social Kit"
```

---

### Task 8: Full Regression Verification, `run-all.sh` Integration & Final Push Readiness Check

**Files:**
- Modify: `tests/run-all.sh` (add `uae-projects-catalog` to domain suites)
- Modify: `tests/uae-projects-catalog.ts` (final completeness assertions)

- [ ] **Step 1: Add `uae-projects-catalog` to `tests/run-all.sh`**

- [ ] **Step 2: Run full verification suite**

Run in one chained command:
- `npm.cmd run typecheck`
- `npm.cmd run build`
- `node --import tsx tests/uae-projects-catalog.ts`
- `node --import tsx tests/offplan-launches.ts`
- `node --import tsx tests/project-launch-media.ts`
- `node --import tsx tests/rbac-zero-leak.ts` (or inspect if it needs running server)
- `node --import tsx tests/executive-os-restructure.ts` (verify no regressions on Master Log / Website Studio)

Expected: All suites exit `0` with zero failures.

- [ ] **Step 3: Commit & report summary with live-server update instructions**

```bash
git add tests/run-all.sh tests/uae-projects-catalog.ts
git commit -m "test: wire uae-projects-catalog suite into run-all.sh and verify full build"
```
