# Shabib's Workspace Command Suite — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-11-27-shabib-workspace-command-suite-design.md`
**Branch:** `feat/shabib-workspace-command-suite`

## Tasks

1. **Schema & Shared Modules:**
   - Create `src/shared/brochure-theme.ts` (presets, hex sanitizer, PDF/PPTX color conversion, Zero-Shabib check).
   - Create `src/shared/shabib-workspace.ts` (5-track pin-to-pin closing stage blueprints, payment modes including `Botim`, legal quick-shelf catalog codes, field report constants).
   - Add `J('brochure_theme_json', 'Brochure Theme', { hidden: true })` to `properties`, `units`, `communities`, `developers` in `src/shared/entities/properties.ts`.
   - Add `'Botim'` to `PAY_METHODS` in `src/shared/entities/finance.ts`.
   - Add migration `018_shabib_workspace_command_suite` in `src/server/schema.ts` creating `forensic_field_reports`, `closing_forensic_dossiers`, `closing_cheque_ledger`, and `shabib_commission_expenses` (SQLite + PostgreSQL 16 via `translateDdlForPg`).
2. **Forensic Exporters, JPEG Document Export & Legal Templates:**
   - Create `src/server/domain/forensic-exports.ts` exporting Forensic Field Reports, Pin-to-Pin Closing Dossiers, and Commission/Expense Statements as PDF (`pdf-lib`), Word (`.docx`), and multi-page JPEG (`@napi-rs/canvas`).
   - Add `POST /api/utilities/word/export-jpeg` in `src/server/routes/utilities.ts` (multi-page vertical A4 canvas JPEG + strict `assertSealAllowed`).
   - Add 5 dedicated templates (`SL-LOI-RES`, `LS-TENANCY-FULL`, `SL-NOC-PACK`, `SL-A2A-PACK`, `FN-COMM-EXP-TPL`) to `src/server/studio/library.json`.
3. **Brochure Theme Customizer & Units Support in Catalog Kit + Share Links:**
   - Update `src/server/domain/pptx-builder.ts` and `src/server/domain/catalog-kit.ts` to accept `BrochureThemeConfig`, read per-record + company default themes, and support `'units'` with parent `properties` fallback.
   - Update `src/server/routes/catalog-kit.ts` with `POST /api/catalog-kit/create` (Community / Developer / Project / Unit unified creator with entity RBAC + Office Admin gate), `GET/PUT /api/catalog-kit/theme/default`, `PUT /api/catalog-kit/:entity/:id/theme`, and live preview query overrides.
   - Update `src/server/routes/share.ts` to add `'units'` to `KIT_ENTITIES` and honor saved brochure themes.
4. **Shabib Workspace & Field Reports API (`src/server/routes/shabib-workspace.ts`):**
   - Team & Daily Tasks (`/api/shabib-workspace/team-daily`, `/tasks`, `/tasks/:id/toggle`, `/verifiers`).
   - Forensic Field Reports (`/api/field-reports`, `/my-context`, `/my-tasks/:id/toggle`, `/:id/photos`, `/:id/photos/:idx`, `/:id/verify`, `/:id/export`).
   - Pin-to-Pin Closing Dossiers & Cheque Ledger (`/api/shabib-workspace/closings*`).
   - Agent Commissions & Expenses Ledger (`/api/shabib-workspace/commissions-expenses*`).
   - Register in `src/server/app.ts`.
5. **Shabib's Workspace Frontend UI (`src/web/pages/swk/ShabibsCornerPage.tsx` + `src/web/components/shabib/*` + `src/web/swk/nav.ts`):**
   - Clean executive hub preserving Privacy Fast Track / Playbook / Approvals / Bulk AI / Ledger + adding all 6 new modules (`ShabibTeamTasksTab`, `ShabibForensicVisitsTab`, `ShabibCatalogStudioTab`, `ShabibLegalFormsTab`, `ShabibClosingsTab`, `ShabibCommissionsTab`).
6. **Staff Forensic Capture, Verifier Queue & Word Studio Upgrades:**
   - Add Forensic Site Visit / Viewing submission (GPS pin + unit photos + all forensic fields), My Assigned Tasks, and dynamic Verification Queue (visible when assigned by Shabib) to `src/web/pages/swk/FieldDutyPage.tsx`.
   - Add Fillable Form Mode & `.jpeg` Export button to `src/web/pages/swk/WordStudioPage.tsx`.
7. **Tests, Review & Full Verification:**
   - Create `tests/shabib-workspace.ts` and wire into `tests/run-all.sh`.
   - Run `typecheck`, `build`, `shabib-workspace`, `rbac-zero-leak`, `uae-projects-catalog`, `executive-os-restructure`, `company-documents`, `smoke`.
   - Whole-branch code review, fix any findings, push branch & wait for CI (SQLite + PostgreSQL 16 + Mobile Builds).
