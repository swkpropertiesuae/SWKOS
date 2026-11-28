# Customise UI & Pin/Drag Workspace Implementation Plan

> **For agentic workers:** Executing natively end-to-end as requested by user ("Goahead, and finish. Then Review in depth, find flaws and push to repo"), followed by a fresh whole-branch code review and full CI verification.

**Goal:** Deliver a live **Customise UI** studio (slide-over drawer on any page + dedicated `/customise-ui` page) where users customise every color, font family/size/weight/style, layout density/radius, and highlight emphasis, plus pin and drag-and-drop shortcuts (dockable Pinned Quick-Launch Bar, draggable Floating Quick-Pad, and drag-to-reorder Home Launcher grid), synced per user across web & mobile with Owner **Apply as Company Default**.

**Architecture:** Shared schema/presets/RBAC route guard (`src/shared/ui-customization.ts`), SQLite+PostgreSQL `user_ui_preferences` table + `settings` (`ui:company_default_json`) via `/api/auth/ui-preferences*`, live `UiCustomizationProvider` + scoped `html[data-ui-customized="1"]` CSS override layer (strictly disabled on `/print/*`), and zero-dependency native Pointer Events / HTML5 drag-and-drop pinning surfaces in `Shell.tsx` and `Launcher.tsx`.

**Tech Stack:** TypeScript, React 19, Tailwind CSS v4, Fastify, Zod, better-sqlite3 / pg, bundled `@fontsource` offline fonts, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-28-customise-ui-design.md`

## Global Constraints
- Zero new npm dependencies; use already-bundled `@fontsource` fonts and native Pointer Events / HTML5 Drag-and-Drop.
- Strict Zod sanitization on all colors (`^#[0-9a-fA-F]{6}$`), numeric bounds, enums, and internal routes (`^\/[a-zA-Z0-9/_?=&%-]*$`, rejecting `//`, `/print/`, `/login`).
- `/print/*` routes and server Chromium PDFs MUST strip `data-ui-customized` and custom CSS vars so corporate print letterhead is untouched.
- Default untouched state (`!hasPersonalTheme && !hasCompanyDefault`) MUST NOT set `data-ui-customized="1"` so existing UI and CI browser tests remain 100% intact.
- Cross-user isolation: per-user `localStorage` keys cleared on logout / 401 / user switch; `highlightedAppKeys` stays personal (never in `ui:company_default_json`).
- SQLite + PostgreSQL 16 compatible DDL via `MIGRATIONS` in `src/server/schema.ts`.

## Review Focus
1. **Sparse theme inheritance:** User pins/drags shortcuts without editing theme -> Owner updates Company Default -> user MUST immediately inherit the new Company Default theme while retaining all personal pins/layout.
2. **RBAC pin stripping & zero-leak:** Restricted staff or Customer Portal user tries to save `/shabibs-corner`, `/admin/settings`, or `/crm-vault` as pins (or Owner stars `shabib_corner` and saves Company Default) -> unauthorized pins MUST be stripped server-side and Owner-only module keys MUST NEVER appear in `companyDefault`.
3. **XSS / CSS injection hardening:** Malicious hex (`#000; background:url(evil)`), `javascript:alert(1)`, `//evil.com`, or oversized arrays in `PUT /api/auth/ui-preferences` MUST be rejected (`400`) or sanitized.
4. **Viewport clamping & mobile touch:** Dragging Floating Quick-Pad near edges or resizing from 1440px to 390px MUST keep the pad reachable inside viewport bounds without horizontal overflow.
5. **Print/PDF immunity:** User enables Dark Obsidian Gold + 20px Italic font -> opening `/print/invoices/1` or `/api/pdf/invoices/1` MUST render crisp default corporate letterhead with `data-ui-customized` absent.

---

### Task 1: Shared Schema, Presets, Font Catalog & Route RBAC (`src/shared/ui-customization.ts` & `src/shared/swk-staff-access.ts`)
**Files:**
- Create: `src/shared/ui-customization.ts`
- Modify: `src/shared/swk-staff-access.ts` (add `'/customise-ui'` to `isAllowedPathForRestrictedStaff`)
**Produces:** `UiCustomization`, `UiThemeConfig`, `UiPinningPrefs`, `StoredUserUiPrefs`, `UiPinnedItem`, `UI_PRESETS`, `UI_FONT_CATALOG`, `DEFAULT_UI_THEME`, `DEFAULT_UI_PINNING`, `DEFAULT_UI_CUSTOMIZATION`, `resolveUiCustomization()`, `isColorDark()`, `autoContrastThemeColors()`, `isRoutePinnableForUser()`, `isAppKeyAllowedForUser()`, `sanitizeUiTheme()`, `sanitizeUiPinning()`.

### Task 2: Database Migration & Backend API (`src/server/schema.ts`, `src/server/routes/ui-preferences.ts`, `src/server/app.ts`)
**Files:**
- Modify: `src/server/schema.ts` (migration `042_user_ui_preferences` creating `user_ui_preferences`)
- Create: `src/server/routes/ui-preferences.ts` (`GET/PUT/DELETE /api/auth/ui-preferences`, `PUT/DELETE /api/auth/ui-preferences/company-default`)
- Modify: `src/server/app.ts` (register `ui-preferences` route)
- Test: `tests/customise-ui.ts` (API + RBAC + sparse inheritance + Owner Company Default + Portal + injection rejection)

### Task 3: Offline Fonts, Scoped CSS Engine & React Context (`src/web/index.css`, `src/web/styles/custom-ui.css`, `src/web/lib/uiCustomization.tsx`, `src/web/main.tsx`, `src/web/lib/prefetch.ts`)
**Files:**
- Modify: `src/web/index.css` (import bundled `@fontsource-variable/manrope`, `@fontsource-variable/geist`, `@fontsource-variable/jetbrains-mono`, `@fontsource/instrument-serif`, `@fontsource/instrument-sans`, `@fontsource/plus-jakarta-sans` + `./styles/custom-ui.css`)
- Create: `src/web/styles/custom-ui.css` (comprehensive `html[data-ui-customized="1"]` token & surface rules, density, highlight glow, shimmer toggle, floating pad & pinned dock styles)
- Create: `src/web/lib/uiCustomization.tsx` (`UiCustomizationProvider`, `useUiCustomization`, live DOM CSS variable applier, `/print/*` immunity guard, undo history, debounced auto-save, user-scoped `localStorage` cache)
- Modify: `src/web/main.tsx` (wrap `<App />` with `<UiCustomizationProvider>`, remove hardcoded `dataset.theme = 'light'` override fight while keeping default light)
- Modify: `src/web/lib/prefetch.ts` (add `/customise-ui` route loader)

### Task 4: Customise UI Controls, Slide-Over Drawer & Full `/customise-ui` Studio
**Files:**
- Create: `src/web/components/CustomiseUiControls.tsx` (shared 5-tab UI editor used by both Drawer and full Studio page: Themes & Colors, Fonts & Size, Highlight, Pins & Drag, Save & Sync)
- Create: `src/web/components/CustomiseUiDrawer.tsx` (live slide-over drawer overlay with `Escape` close, quick undo, live contrast check, link to full studio)
- Create: `src/web/pages/swk/CustomiseUiPage.tsx` (full `/customise-ui` studio page with live interactive preview playground + full controls)
- Modify: `src/web/App.tsx` (mount lazy `/customise-ui` route accessible to all signed-in staff & portal users)
- Modify: `src/web/swk/nav.ts` (add `Customise UI` entry to Utilities & Settings + Restricted Staff Utilities)

### Task 5: Everywhere Pinning & Dragging (`PinnedQuickDock.tsx`, `FloatingQuickPad.tsx`, `Shell.tsx`, `Launcher.tsx`)
**Files:**
- Create: `src/web/components/PinnedQuickDock.tsx` (dockable Top/Bottom/Left/Right pinned shortcut bar with drag-to-reorder, star highlight, `+ Pin this page`)
- Create: `src/web/components/FloatingQuickPad.tsx` (draggable Pointer Events floating quick-pad with viewport clamping, collapse to SWK orb, pin current page, drag-to-reorder)
- Modify: `src/web/components/Shell.tsx` (add **Customise UI** trigger in top bar + account menu + `Alt+U` shortcut, mount `PinnedQuickDock`, `FloatingQuickPad`, and `CustomiseUiDrawer`; skip all on `/print/*`)
- Modify: `src/web/pages/Launcher.tsx` (custom app ordering from `pinning.appOrder`, HTML5 drag-and-drop reorder on Home app cards, 1-click Pin & Highlight Star controls, Pinned Shortcuts strip, Customise UI quick pill; preserve `section[aria-label="Apps"]` CI contract)

### Task 6: Verification Suites, Mobile Sync, Deep Code Review & Ship
**Files:**
- Create: `tests/customise-ui.ts` (full server + RBAC + PG/SQLite suite)
- Modify: `tests/run-all.sh` and `.github/workflows/ci.yml` (add `tests/customise-ui.ts` to CI!)
- Run `npm.cmd run typecheck`, `npm.cmd run build`, `node mobile/scripts/sync-web.mjs`, `tests/customise-ui.ts`, `tests/premium-suite.ts`, `tests/uae-rules.ts`, `tests/dashboard-ui.mjs`, `tests/calendar-ui.mjs`, plus live Playwright E2E verifying live color/font/highlight changes, drag-and-drop pinning, reload persistence, and `/print/*` immunity.
- Dispatch fresh whole-branch code reviewer subagent, fix all findings, re-verify, push branch -> confirm CI green -> merge to `main` -> verify `CI`, `SWK OS Mobile Builds`, and `Build Oracle Image` 100% green.
