# SWK OS — Customise UI & Pin/Drag Workspace Design

**Date:** 2026-11-28  
**Status:** Ready for User Approval (Builder Check Completed)  
**Target Repository:** `https://github.com/swkpropertiesuae/SWKOS`

---

## 1. Intent & Why

SWK Properties OS users (Owner Shabib Siraj, Management, Office Admin, HR, Brokers, and Portal users) want full personal control over how their workspace looks, reads, highlights priorities, and lays out their most-used screens—without waiting on developers or sacrificing speed.

Specifically, users must be able to open **Customise UI** from anywhere in the OS and:
1. Customize **every visual color**: page background (solid or soft gradient, light or dark), standard cards, glossy dark/obsidian cards, header, sidebar, primary/secondary font colors, buttons, borders, and highlight/accent colors—either from curated luxury presets or live color pickers.
2. Customize **typography & layout comfort**: separate Heading, Body, and Mono/Numeric font families (using the 8 offline bundled fonts—zero CDN latency), base font size (`12px`–`20px`), heading scale (`85%`–`130%`), font weight (`400`/`500`/`600`/`700`), font style (`normal`/`italic`), letter spacing, optional uppercase headings, UI density (`compact`/`comfortable`/`spacious`), and card corner radius (`8px`–`32px`).
3. Control a dedicated **Highlight Feature**: highlight color, glow/spotlight intensity (`off`/`subtle`/`vivid`), active-card highlight ring, shimmer button effect toggle, and per-item **Highlight Star/Badge** so priority apps and pinned shortcuts visually pop.
4. **Pin and drag important options wherever they need**:
   - **Dockable Pinned Quick-Launch Bar** (dockable at Top under header, Bottom, Left, Right, or Hidden; drag pills to reorder; toggle highlight star or remove inline; `+ Pin current page` button).
   - **Draggable Floating Quick-Pad** (optional floating widget with drag handle movable to any `(x, y)` viewport coordinate, persisted across reloads & clamped to viewport on resize, collapsible to a compact SWK orb).
   - **Drag-and-Drop Launcher Home Grid** (`/home`): drag any app card to reorder your Home grid, pin/unpin apps to the top **Pinned Apps** strip, and star-highlight VIP modules.
5. **Sync per account + Owner Company Default**:
   - Every signed-in user's preferences persist in the database (SQLite + PostgreSQL 16) and sync across web & mobile devices, with user-scoped `localStorage` caching for instant zero-flash paint.
   - Owner Shabib (`shabib@swk.properties`, checked via `isOwnerSwkUser`) gets an **"Apply as Company Default"** action that saves the active visual theme (colors, fonts, highlights—never overwriting another user's private pins/drag layout) as the company-wide baseline for users who haven't customised or who click **"Reset to Company Default"**.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- **Live zero-reload editing** on any screen via a slide-over **Customise UI** drawer plus a full-screen `/customise-ui` studio page.
- **Total surface coverage**: CSS variables + scoped dynamic override layer so *every* screen (Launcher, Dashboard, Entity tables, Shabib's Workspace, Dubai Agency Hub, Calendar, Chat, Mobile nav) reflects background, card, text, font, size, and highlight settings live.
- **Zero-flash boot & zero cross-user leakage**: per-user `localStorage` key (`swk.ui.prefs.v1:<userId>:<demo>`) hydrated after session confirmation and cleared on sign-out/401, backed by server DB persistence.
- **Touch + Desktop drag-and-drop**: works smoothly with mouse AND touch (Pointer Events for the floating Quick-Pad; HTML5 drag-and-drop + accessible Up/Down reorder buttons on pinned pills and Launcher tiles so mobile/keyboard users have 100% parity).
- **100% offline fonts**: use fonts already installed in `package.json` (`Switzer`, `Bricolage Grotesque`, `Plus Jakarta Sans`, `Manrope`, `Geist`, `Instrument Serif`, `JetBrains Mono`, `Geist Mono`, `Noto Sans Arabic`, plus System UI & Editorial Serif).
- **Strict RBAC & Print Safety**:
  - Restricted staff can customise their own UI and access `/customise-ui`, but can ONLY pin routes they are permitted to open (nav permission filter enforced on both render and save).
  - `/print/*` routes and server-side Chromium PDF exports MUST ignore all custom UI overrides so official RERA/DLD invoices, quotations, statements, and brochures always render crisp black-on-white corporate letterhead.

### Non-Goals
- No third-party drag-and-drop library or external Google Fonts CDN calls (keep bundle fast and CSP `'self'` compliant).
- No per-component pixel-by-pixel CSS code editor (structured controls + presets + custom hex pickers cover 100% of real brokerage needs cleanly).
- No forcing other users' personal pins or floating pad coordinates when Owner updates the Company Default.

### Anti-Goals (What would make this fail even if technically working)
- Unreadable contrast traps (e.g., white text on white cards when switching background/card colors) — provide automatic contrast-safe presets, a live contrast helper badge, and an always-reachable **Reset to Default** button.
- Breaking existing Playwright UI tests (`dashboard-ui.mjs`, `calendar-ui.mjs`, `documents-ui.mjs`, `checkin-ui.mjs`, `custom-dropdowns-ui.mjs`, `project-launch-ui.mjs`) — default untouched theme MUST preserve the exact current Pure White & Glossy Obsidian look, `section[aria-label="Apps"]` contract, and clean zero-overhead `/print/*` rendering.
- Floating Quick-Pad drifting off-screen when resizing desktop -> mobile viewport — always clamp `(x, y)` inside visible viewport bounds (`[12, vw - width - 12]`, `[76, vh - height - 12]`).
- Persisting unsafe/arbitrary CSS strings in DB (CSS injection risk) — strictly validate every color (`^#[0-9a-fA-F]{6}$`), numeric range, enum, and internal route path (`^\/[a-zA-Z0-9/_?=&-]*$`) via Zod on both client and server.

---

## 3. Approaches Considered

| Approach | Summary | Trade-offs | Decision |
| :--- | :--- | :--- | :--- |
| **Approach 1 (Selected)** | Live slide-over **Customise UI** drawer accessible on any screen + full `/customise-ui` studio + dockable Pinned Bar + draggable Floating Quick-Pad + drag-to-reorder Home Launcher + per-user DB sync + Owner Company Default | Slightly broader UI wiring across `Shell.tsx` & `Launcher.tsx`, but delivers true real-time live editing over real screens and drag-anywhere freedom with zero extra npm dependencies | **Selected by user** |
| **Approach 2** | Static `/customise-ui` settings page with a mock preview card + fixed top pinned strip only | Simpler surface area, but users cannot see real Dashboard/Workspace changes live and cannot drag shortcuts wherever they need on screen | Rejected |

---

## 4. Architecture & Data Model

### 4.1 Shared Schema & Presets (`src/shared/ui-customization.ts`)
Pure TypeScript schema, defaults, 6 curated presets, font catalog, and sanitization/validation helpers shared by server and web:

```ts
export type UiMode = 'light' | 'dark' | 'custom'
export type BgStyle = 'solid' | 'gradient' | 'mesh'
export type FontWeightPreset = '400' | '500' | '600' | '700'
export type FontStylePreset = 'normal' | 'italic'
export type DensityPreset = 'compact' | 'comfortable' | 'spacious'
export type HighlightIntensity = 'off' | 'subtle' | 'vivid'
export type DockPosition = 'top' | 'bottom' | 'left' | 'right' | 'hidden'

export interface UiPinnedItem {
  id: string            // stable key, e.g. route path or 'app:shabib_corner'
  label: string         // display label (max 48 chars)
  to: string            // internal app route starting with '/' (no '//')
  icon?: string         // lucide icon key or nav fallback
  highlighted?: boolean // highlight star/glow emphasis on this pin
  accentColor?: string  // optional per-pin hex override (#RRGGBB)
}

export interface UiCustomization {
  version: 1
  presetId: string
  mode: UiMode
  colors: {
    background: string       // page canvas primary hex (default #ffffff)
    backgroundAlt: string    // gradient secondary hex (default #fcfbf8)
    bgStyle: BgStyle         // 'solid' | 'gradient' | 'mesh'
    cardBg: string           // standard white/surface card hex (default #ffffff)
    glossCardBg: string      // glossy dark/accent card hex (default #0a0b0e)
    headerBg: string         // top header hex (default #ffffff)
    sidebarBg: string        // sidebar hex (default #ffffff)
    textPrimary: string      // headings & primary ink (default #0a0b0e)
    textBody: string         // body copy ink (default #2d3139)
    textMuted: string        // muted helper ink (default #5c6270)
    buttonBg: string         // primary button hex (default #0a0b0e)
    buttonText: string       // primary button text hex (default #ebc97c)
    borderColor: string      // card/input border hex (default #eae7e0)
    accentColor: string      // primary brand accent (default #d4a955)
    highlightColor: string   // highlight feature glow/marker hex (default #d4a955)
    highlightBg: string      // highlight surface tint hex (default #fbf6ea)
  }
  typography: {
    bodyFont: string         // enum key from UI_FONT_CATALOG (default 'switzer')
    headingFont: string      // enum key from UI_FONT_CATALOG (default 'bricolage')
    monoFont: string         // enum key from UI_FONT_CATALOG (default 'geist-mono')
    fontSizePx: number       // 12..20 (default 15)
    headingScale: number     // 0.85..1.30 (default 1.0)
    fontWeight: FontWeightPreset // '400'|'500'|'600'|'700' (default '400')
    fontStyle: FontStylePreset   // 'normal'|'italic' (default 'normal')
    letterSpacing: 'tight' | 'normal' | 'wide' // default 'normal'
    uppercaseHeadings: boolean   // default false
  }
  layout: {
    density: DensityPreset   // 'compact'|'comfortable'|'spacious' (default 'comfortable')
    cardRadiusPx: number     // 8..32 (default 22)
    shadowStrength: 'none' | 'soft' | 'elevated' // default 'elevated'
    showWatermark: boolean   // toggle subtle SWK backdrop emblem (default true)
  }
  highlight: {
    enabled: boolean               // master highlight emphasis toggle (default true)
    intensity: HighlightIntensity  // 'off'|'subtle'|'vivid' (default 'subtle')
    buttonShimmer: boolean         // shimmer hover sweep on buttons (default true)
    focusRingGlow: boolean         // enhanced focus/hover ring on active cards (default true)
  }
  pinning: {
    dockPosition: DockPosition     // 'top'|'bottom'|'left'|'right'|'hidden' (default 'hidden' until user pins or toggles)
    pinnedItems: UiPinnedItem[]    // ordered pinned shortcuts (max 24)
    appOrder: string[]             // ordered Launcher app keys (drag-to-reorder on /home)
    highlightedAppKeys: string[]   // personal starred/highlighted launcher app keys (max 20; NEVER stored in Company Default)
    floatingPad: {
      enabled: boolean             // show draggable floating quick-pad (default false until user enables/pins)
      collapsed: boolean           // collapsed to compact SWK orb (default false)
      xPct: number                 // 0..95 viewport % X (default 84)
      yPct: number                 // 8..90 viewport % Y (default 72)
    }
  }
}

/** Visual theme subset (used both for user theme overrides and Owner's Company Default). */
export type UiThemeConfig = Pick<UiCustomization, 'presetId' | 'mode' | 'colors' | 'typography' | 'layout' | 'highlight'>

/** Stored per-user envelope: sparse `theme` so users who only pin/drag keep inheriting Owner Company Default updates! */
export interface StoredUserUiPrefs {
  version: 1
  theme: UiThemeConfig | null      // null = inherit Company Default (or System Default)
  pinning: UiCustomization['pinning']
}
```

**Built-in Curated Presets (6):**
1. **SWK Signature White & Obsidian** *(Default)* — `#FFFFFF` canvas, `#FFFFFF` cards, `#0A0B0E` glossy cards, `#D4A955` Imperial Gold highlight, `Bricolage Grotesque` + `Switzer`.
2. **Obsidian Night Gold** — `#090B0F` dark canvas, `#13161E` cards, `#050608` glossy cards, `#EBC97C` bright gold highlight, light crisp text `#F8FAFC`.
3. **Dubai Royal Emerald** — `#F4FAF7` soft emerald-white canvas, `#FFFFFF` cards, `#0C2A1D` deep emerald glossy cards, `#1E6B43` emerald + `#D4A955` gold highlight.
4. **Warm Arabian Sand** — `#FAF6EE` warm ivory canvas, `#FFFDF9` cards, `#1F1A14` espresso glossy cards, `#C49642` gold highlight, `Instrument Serif` headings.
5. **Executive Slate & Sapphire** — `#F4F7FB` cool slate canvas, `#FFFFFF` cards, `#0F172A` midnight cards, `#2563EB` highlight, `Plus Jakarta Sans` + `Manrope`.
6. **High-Contrast Accessibility** — `#FFFFFF` canvas, `#000000` ink, `#111111` borders, `#D97706` vivid highlight ring, `17px` base font, `600` weight, `vivid` highlight intensity.

**Bundled Offline Font Catalog (`UI_FONT_CATALOG`, imported cleanly in `src/web/index.css`):**
- `switzer` (`'Switzer', 'Noto Sans Arabic', system-ui, sans-serif`)
- `bricolage` (`'Bricolage Grotesque Variable', 'Switzer', sans-serif`)
- `plus-jakarta` (`'Plus Jakarta Sans', 'Switzer', sans-serif`)
- `manrope` (`'Manrope Variable', 'Switzer', sans-serif`)
- `geist` (`'Geist Variable', 'Switzer', sans-serif`)
- `instrument-sans` (`'Instrument Sans', 'Switzer', sans-serif`)
- `instrument-serif` (`'Instrument Serif', Georgia, serif`)
- `jetbrains-mono` (`'JetBrains Mono Variable', 'Geist Mono Variable', monospace`)
- `geist-mono` (`'Geist Mono Variable', ui-monospace, monospace`)
- `system` (`system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`)

### 4.2 Database & Backend API (`src/server/schema.ts` & `src/server/routes/ui-preferences.ts`)
- **Schema (`src/server/schema.ts`):**
  ```sql
  CREATE TABLE IF NOT EXISTS user_ui_preferences (
    user_id INTEGER PRIMARY KEY,
    prefs_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  ```
  - `prefs_json` stores `StoredUserUiPrefs` (`{ version: 1, theme: UiThemeConfig | null, pinning: UiPinningPrefs }`). Keeping `theme` nullable ensures that a user who only pins/drags shortcuts or reorders Home apps continues inheriting future Owner Company Default theme updates until they explicitly customize their own theme.
  - Company default visual theme is stored in the existing `settings` table under key `ui:company_default_json` (`UiThemeConfig` only — **never** `pinning` or `highlightedAppKeys`, preventing any leak of Owner-only module keys like `shabib_corner`/`master_log`/`admin` to staff or portal accounts).
- **Route Pinning RBAC & Portal Support (Shared Resolver + Server Guard):**
  - Users can pin both curated top-level navigation routes AND deep/query internal routes (e.g., `/e/properties/42`, `/shabibs-corner?tab=closings`, `/profile`, `/customise-ui`, `/portal`, `/calendar`).
  - Shared `isRoutePinnableForUser(path, user, canModule)` validates path syntax (`^\/[a-zA-Z0-9/_?=&%-]*$`, never `//`, never `/print/`, never `/login`) against role/module guards matching `App.tsx` (Owner-only `/shabibs-corner`, Master Log, CRM Vault, Field Live, Admin routes, restricted-staff allowlist via `isAllowedPathForRestrictedStaff`, and `/e/:entity/*` module permissions).
  - Customer Portal users (`party_id != null`) receive full visual customization (inheriting Company Default as baseline) plus pinning scoped strictly to the safe portal allowlist (`/portal`, `/calendar`, `/profile`, `/customise-ui`, `/e/leases`, `/e/invoices`, `/e/receipts`, `/e/maintenance`).
  - On `PUT /api/auth/ui-preferences`, any unauthorized or stale pin in `pinning.pinnedItems` or unauthorized app key in `pinning.highlightedAppKeys` / `pinning.appOrder` is **silently stripped** (and reported via `strippedCount` in the response) so a user whose permissions change is never blocked from saving unrelated theme edits, while unauthorized routes can never be persisted.
- **Endpoints (mounted in `src/server/app.ts` under `/api/auth/ui-preferences*`, automatically covered by `PORTAL_OK`):**
  - `GET /api/auth/ui-preferences`: returns `{ hasPersonalTheme, hasCompanyDefault, isOwner, companyDefault, personalTheme, pinning, effectivePrefs }`.
    - Resolution order for `effectivePrefs`: `DEFAULT_UI_CUSTOMIZATION` ← apply `companyDefault` (visual theme) ← apply `personalTheme` (if non-null) + apply user's `pinning` (re-filtered against live permissions).
  - `PUT /api/auth/ui-preferences`: accepts partial section updates (`{ theme?: UiThemeConfig | null, pinning?: Partial<UiPinningPrefs> }`) validated by strict Zod schema (regex `#RRGGBB`, bounded ranges, max 24 pins, max 20 highlighted apps). Updates ONLY the supplied section(s) so pinning/dragging NEVER freezes `theme`! Returns `{ ok: true, strippedCount, hasPersonalTheme, effectivePrefs }`.
  - `DELETE /api/auth/ui-preferences?scope=theme|all`:
    - `scope=theme` *(default — "Reset Theme to Company Default")*: sets `theme = null` while preserving the user's `pinning` (pins, dock, floating pad, Home app order, personal highlighted stars).
    - `scope=all` (*"Reset Everything (Theme + Pins + Layout)"*): deletes the entire `user_ui_preferences` row.
  - `PUT /api/auth/ui-preferences/company-default`: strictly gated to `isOwnerSwkUser(req.user) || (inDemo() && req.user?.email === 'demo@swkpropertiesuae.com')` (HTTP 403 for all other accounts including Admin, Manager, HR, Office Admin, Restricted Staff, and Portal users). Validates and saves ONLY `UiThemeConfig` into `settings` (`ui:company_default_json`).
  - `DELETE /api/auth/ui-preferences/company-default`: Owner-only reset of Company Default back to SWK Signature White & Obsidian.

### 4.3 Live Frontend Engine (`src/web/lib/uiCustomization.tsx` + `src/web/styles/custom-ui.css`)
- **Context Provider (`UiCustomizationProvider`)** mounted inside `MetaProvider` in `src/web/main.tsx`:
  - Loads from user-scoped `localStorage` immediately once `me` is known (zero flash) and syncs with `GET /api/auth/ui-preferences`.
  - Applies every setting live to `document.documentElement` CSS custom properties (`--swk-ui-*` + core tokens `--bg`, `--card`, `--ink`, `--body`, `--muted`, `--line`, `--logo-gold`, `--focus`, `--radius`, `--font-sans`, `--font-display`, `--font-mono`) and `data-ui-customized="1"` (applied ONLY when `hasPersonalTheme || hasCompanyDefault` so untouched default workspaces have zero override CSS overhead!), plus `data-ui-mode`, `data-ui-density`, `data-ui-highlight`, `data-ui-uppercase-headings`, `data-ui-shimmer`.
  - **Crucial Print Guard:** Whenever `location.pathname.startsWith('/print')`, strips `data-ui-customized` and custom CSS variables immediately (restoring crisp default light theme) so invoices/quotations/PDFs are 100% unaffected.
  - **Cross-User Isolation:** Clears active DOM custom vars and in-memory state immediately on sign-out / `swk:unauthorized` / user switch.
  - **Smooth Auto-Save + 1-Click Undo + Explicit Save Confirmation:**
    - Visual theme changes preview at 60fps in-memory and auto-save to `PUT /api/auth/ui-preferences` (`{ theme }`) after a 500ms debounce, while retaining a local **Undo Last Change** snapshot stack so accidental low-contrast picks are reversible in 1 click; an explicit **"Save & Sync Now"** button immediately flushes and shows a confirmation toast.
    - Pinning/dragging changes auto-save via `PUT /api/auth/ui-preferences` (`{ pinning }`) after a 300ms debounce without ever sending or freezing `theme`.
- **Scoped Override Stylesheet (`src/web/styles/custom-ui.css`):**
  - Only activates under `html[data-ui-customized="1"]` (so default untouched users experience ZERO change to existing visual layout or CI assertions!).
  - Cleanly maps background (`body`, `.swk-atmosphere`), standard white cards (`.card`, `.swk-card`, `.panel`, `[class*="bg-white"]` inside `.swk-main`), glossy dark cards (`.swk-gloss-black`), header (`.swk-top`), sidebar (`.swk-app-sidebar`), text (`h1..h4`, `body`, `.text-ink`, `.text-muted`), buttons (`.btn`), borders, base font size (`html { font-size }`), font weight/style/letter-spacing, density padding scale, card radius, and highlight glow rings (`.swk-ui-highlighted`) directly to the live CSS custom variables!
  - Includes automatic `isColorDark(hex)` contrast protection for custom card/button fills when using presets or clicking "Auto-Contrast Text".

### 4.4 UI Surfaces
1. **Top Bar & Account Menu Trigger (`src/web/components/Shell.tsx`):**
   - Compact **Customise UI** button (`Palette` icon + tooltip/label) in `.swk-top` (plus entry in Account Menu and Utilities) that toggles the live slide-over **Customise UI** drawer on any screen.
   - Keyboard shortcut: `Alt + U` (when not typing in an input) toggles the drawer cleanly.
2. **Live Slide-Over Drawer (`src/web/components/CustomiseUiDrawer.tsx`) + Full Studio Page (`src/web/pages/swk/CustomiseUiPage.tsx` at `/customise-ui`):**
   - 5 clear, plain-English tabs:
     1. **Themes & Colors**: 6 curated 1-click theme cards + individual live color pickers (with hex input) for Background, Background Gradient 2nd color, Background Style (Solid / Gradient / Soft Mesh), Standard Cards, Glossy Dark Cards, Top Bar, Sidebar, Heading Text, Body Text, Muted Text, Primary Button Fill & Text, Borders, Brand Accent, plus an **"Auto-Fix Text Contrast"** button.
     2. **Fonts & Size**: Separate dropdown pickers (with live specimen preview) for **Heading Font**, **Body Font**, and **Numbers / Code Font**; **Font Size** slider (`12px–20px` + quick S/M/L/XL buttons); **Heading Scale** slider (`85%–130%`); **Font Weight** (Regular / Medium / SemiBold / Bold); **Font Style** (Normal / Italic); **Letter Spacing** (Tight / Normal / Wide); **Uppercase Headings** toggle; **UI Density** (Compact / Standard / Spacious); **Card Roundness** slider (`8px–32px`); **Card Shadow** (Flat / Soft / Floating); **Logo Watermark** toggle.
     3. **Highlight**: Master Highlight toggle, **Highlight Color** & **Highlight Tint** pickers, **Highlight Intensity** (`Off` / `Subtle` / `Vivid`), **Shimmer Hover Buttons** toggle, **Active Card Spotlight Glow** toggle, and quick multi-select checkboxes to **Highlight Priority Apps** (e.g., Shabib's Workspace, Pipeline, Leads, Dubai Agency Hub) with a glowing star ribbon.
     4. **Pins & Drag**: Choose **Pinned Bar Position** (`Top` / `Bottom` / `Left` / `Right` / `Hidden`), toggle **Draggable Floating Quick-Pad** (`Show` / `Reset Position to Corner`), click **"+ Pin Current Page"** or pick from any permitted SWK app/screen, **drag to reorder** (plus ↑ / ↓ buttons), toggle **Highlight Star** per pin, pick an optional custom badge color per pin, or unpin. Also includes a **"Reset Home App Order"** button.
     5. **Save & Sync**: **Save My Customisation**, **Reset to Company Default** (or SWK Default), Export/Import JSON preset (handy for sharing setups!), and for **Owner Shabib only**: **"Apply as Company Default for All Staff"** + **"Clear Company Default"**.
3. **Dockable Pinned Quick-Launch Bar (`src/web/components/PinnedQuickDock.tsx`):**
   - Renders inside `Shell.tsx` at the user's chosen edge (`top` strip right below header, `bottom` floating pill strip, `left` vertical rail, or `right` vertical rail) whenever `dockPosition !== 'hidden'` and user has pinned items (or quick-pin button).
   - Every pinned item supports **drag-and-drop reordering right inside the bar**, hover route chunk preloading (`preloadRoute`), star highlight glow, and a `+ Pin this page` button that pins the active route in 1 click!
   - Strictly filters rendered pins against `isNavItemVisible` / permitted routes so restricted staff never see unauthorized items.
4. **Draggable Floating Quick-Pad (`src/web/components/FloatingQuickPad.tsx`):**
   - Free-floating glossy obsidian/custom-themed mini launcher pad rendered inside `Shell.tsx` when `floatingPad.enabled` is true.
   - Users grab the `GripVertical` handle with mouse or touch (Pointer Events `setPointerCapture`) and **drag it anywhere on screen**; position is saved as clamped viewport percentages (`xPct`, `yPct`) so it stays visible across desktop, laptop, and mobile screens.
   - Supports collapse/expand to a sleek SWK emblem orb, 1-click `+ Pin current page`, highlighted priority shortcuts, and drag-to-reorder items inside the pad.
5. **Drag-and-Drop Reorderable Launcher Grid (`src/web/pages/Launcher.tsx`):**
   - Preserves `section[aria-label="Apps"]` and all existing CI selectors 100%.
   - Adds a compact **"Pinned Shortcuts"** strip when the user has pinned apps, plus on every Home app card:
     - **Drag handle** (HTML5 drag-and-drop on desktop + quick Pin/Star hover buttons) so users can drag any app card onto another card to reorder their Home screen permanently.
     - **Pin button** (pins/unpins the app to the Pinned Bar & Floating Quick-Pad in 1 click).
     - **Highlight Star button** (toggles glowing highlight emphasis on that app card).
   - Also adds a quick **Customise UI** pill right in the Launcher header / Daily Operations card for instant discovery.

---

## 5. What Is Left to the Builder

- Exact Tailwind utility classes and CSS specificity tuning inside `src/web/styles/custom-ui.css` so dark/light/custom themes remain crisp across tables, modals, inputs, badges, and charts.
- Keyboard accessibility (`aria-label`, `Escape` to close drawer, ↑/↓ keyboard reorder controls alongside drag handles) and mobile responsive layout of the slide-over drawer (full-width bottom/side sheet on `< 640px`).
- Writing comprehensive automated verification (`tests/customise-ui.ts` backend API + RBAC + persistence + sanitization suite, plus Playwright verification of live color/font/highlight changes, drag-and-drop pinning, reload persistence, and `/print/*` immunity).
