# SWK Omni SuperApp — Unified AI Brain, Utilities, SIP/VoIP, Field Ops & WhatsApp-Grade Messaging Design Specification

**Date:** 2026-11-23  
**Target Repositories:**
- Primary Backend, Web App & Mobile Shell: `swkpropertiesuae/SWKOS` (branch `claude/fervent-albattani-quzt1q` → new feature branch)
- Native Hardening Reference: `swkpropertiesuae/SWK_MOBILE` (Android Keystore, biometric lock, `FLAG_SECURE`, SPKI pinning, Capacitor Android config)
- Public Inventory Bridge: `swkpropertiesuae/SWKPROPERTY.COM` (Next.js 16 / Cloudflare public listings & team profiles)

**Status:** Approved with Owner additions (OS↔App WhatsApp-grade messaging + full role-scoped company operations parity). Moving to implementation planning.

---

## 1. Intent & Why

SWK Properties L.L.C. (Dubai RERA ORN `51517`) is scaling from its initial 12 core staff accounts to **20+ active staff** spanning Supreme Owner, System Admin, Operations Manager, HR, Office Admin, and Field Property Consultants. Today, staff have to jump between SWK OS, scattered external AI websites (hitting free-tier token/rate limits), third-party PDF/Word/translator tools, unlogged personal dialers, and browser-only chat tabs that miss notifications when phones lock.

This project turns **SWKOS** into a single unified desktop + installable mobile app (**SWK Omni SuperApp**) with six tightly integrated capabilities:
1. **Omni-Route AI Brain:** multi-provider, multi-key free-tier LLM router (plus Tier-1 paid/custom and local Ollama slots) with automatic failover, cooldowns, and fair-share budgets so 20+ staff can reason, draft, summarize, and analyze continuously without hitting token walls.
2. **All-Purpose Real Estate Utility Suite:** Word (`.docx`) editor & converter, upgraded PDF/OCR suite, dedicated multi-language Translator with UAE real-estate glossary, unified role-scoped Search Engine (internal SWKOS + SWKPROPERTY.COM + live web), UAE Deal Calculators, and office/manager/admin/field tools.
3. **SIP/VoIP Softphone Extension:** provider-agnostic WebRTC SIP extension built directly into the app (ready for SIP credentials/extensions to be entered later), preserving hard-masked Vault calling for field agents.
4. **Camera QR Attendance & Live Field Location:** in-app live camera QR scanner for office check-in plus anti-spoofed live GPS tracking for field agents with a leadership-only live map.
5. **WhatsApp-Grade `Inside` Live Messaging & Notifications:** upgrading SWKOS's existing `Inside` messenger into true real-time cross-device messaging with background push notifications (Web Push VAPID + native Android/iOS FCM), floating heads-up banners, sound/vibration, unread badges, voice notes, location sharing, and offline send queue.
6. **Hardcoded Zero-Leak Role & Access Isolation:** strict code-enforced role ceilings across every UI screen, REST endpoint, SSE stream, push payload, AI tool call, search index, SIP dialer, and GPS query—closing four real data-leak vectors already present in SWKOS today.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- **Zero token-wall disruption for 20+ concurrent staff** using an adaptive Omni-Route pool across 8+ free LLM providers + pluggable Tier-1/local fallback models.
- **Zero unauthorized data leakage** anywhere in the stack: no database role edit, prompt injection, search query, notification query, SIP action, or GPS lookup can ever reveal data outside a user's hardcoded role tier.
- **Single-app daily workflow** on desktop browser, mobile PWA, and native Capacitor Android/iOS APK/AAB built directly from one React codebase (`SWKOS/dist/web`).
- **WhatsApp-grade live messaging** with sub-second delivery in foreground and reliable push notifications when the app is backgrounded or the phone is locked.
- **Drop-in SIP/VoIP readiness** so the Owner/Admin can later enter SIP WSS/realm credentials and per-staff extension numbers in Settings and immediately start making/receiving calls without code changes.
- **SQLite + PostgreSQL dual-driver compatibility** matching SWKOS's existing `schema.ts` / `pgbridge.ts` architecture.

### Non-Goals
- **Hosting our own telecom SIP PBX / carrier trunk:** SWKOS provides the WebRTC SIP softphone client, trunk/extension config store, and call logging; the user supplies an external SIP/WSS PBX or VoIP provider later.
- **Building a separate public client-facing mobile app:** client portals (`party_id`) stay strictly web-only under `PORTAL_OK` and never access Inside, Omni-AI, SIP, Utilities, or Field GPS.
- **Full Microsoft Word desktop parity (macros, track-changes XML, embedded Excel charts):** the Word Editor covers clean real-estate letters, contracts, proposals, NOCs, tables, RTL Arabic, letterhead/seal stamping, and reliable `.docx` ↔ `.pdf` / `.txt` conversion.
- **Offline-first multi-record CRM editing:** only chat messages, field GPS ping batches, and daily checklists queue locally offline and sync via idempotency keys on reconnect.

### Anti-Goals (Failure Even If Technically Working)
- **Any data leak through AI, Search, Notifications, SIP, or GPS:** e.g., a field agent asking the AI for overdue invoices, employee Emirates IDs, unmasked CRM Vault owner numbers, or another agent's GPS coordinates; or sending raw client PII/Vault data to a free-tier LLM provider whose terms allow training on prompts.
- **Client-side-only access hiding:** hiding a button in React without enforcing the exact hardcoded role check on the Fastify route, SQL query, AI tool registry, and SSE/Push dispatcher.
- **Unauthenticated or gallery-upload QR check-ins:** allowing screenshots/photos of the reception QR or weakening EC P-256 device binding and office Wi-Fi checks.
- **Caching authenticated API payloads in the Service Worker:** leaving sensitive brokerage data readable offline after logout or account revocation.

---

## 3. Architectural Approaches Considered & Decision

We evaluated three architectures and eliminated web-only early because mobile browsers suspend background GPS tracking when an agent locks their phone and cannot reliably wake for incoming SIP calls or native push alerts.

| Approach | Summary | Trade-offs | Verdict |
|---|---|---|---|
| **Approach 1: Unified SWKOS Core + Capacitor/PWA Mobile Shell** | Add Omni-Route AI, zero-leak RBAC hardening, Word/PDF/Translator/Search utilities, SIP softphone, Field GPS, and Web Push/FCM directly into `SWKOS` (`claude/fervent-albattani-quzt1q`), and package `SWKOS/dist/web` inside a single hardened Capacitor Android/iOS + PWA wrapper carrying over `SWK_MOBILE`'s native security layer. | Restores hardened mobile token auth, push service worker, and GPS ping endpoints in `SWKOS` (removed in commit `bcc3c6d`), requiring disciplined token/SSE security tests. Delivers **one single source of truth** for hardcoded RBAC, zero duplicated frontend screens, real background GPS, native camera QR, and native WhatsApp-style push. | **Selected (Approved by Owner)** |
| **Approach 2: Standalone SWK SuperApp Repo + Gateway** | Build a separate backend + mobile/web app calling `SWKOS` over APIs. | Isolates deploys, but splits RBAC enforcement across two servers (high permission-drift and leak risk), duplicates `Inside` state/sync, and still requires modifying `SWKOS` to patch the AI tool leak and expose mobile/GPS/push hooks. | Rejected |

---

## 4. Constraints & Grounding in Current Codebase

1. **Runtime & Stack (`SWKOS`):** Node `>=22`, Fastify 5, TypeScript, React 19, Vite 7, Tailwind CSS 4, TanStack Query 5, Zod 4, SQLite (`better-sqlite3`) + PostgreSQL (`pg` via `src/server/pgbridge.ts` synchronous bridge).
2. **Schema Compatibility:** All migrations live in `src/server/schema.ts` (last applied ID: `016_client_share_links`) using SQLite DDL auto-translated to Postgres by `ddl()`. New tables go into migration `017_swk_omni_superapp` without using SQLite-only syntax that `ddl()` cannot translate.
3. **Existing Features Preserved:** All 158 Document Studio templates, Reception QR (`attendance-security.ts`), EN/AR Tesseract OCR (`ocr.ts`), 8 UAE Calculators (`ToolkitPage.tsx`), CRM Vault AES-256-GCM encryption & masked Twilio bridge (`crm-vault.ts`), Inside messenger (`chat.ts`), and Website Studio deploy to `SWKPROPERTY.COM` (`website.ts`) remain intact and are upgraded—never broken.
4. **Secret Management:** All external API keys (LLM provider keys, Search API keys, SIP trunk passwords, per-staff SIP secrets, VAPID private key, FCM service account JSON) MUST be stored encrypted via `setSettings()` / `encryptSecret()` (AES-256-GCM using `APP_SECRET`) and masked (`********`) in all API responses.
5. **Dual-Database Demo Isolation:** The isolated demo workspace (`inDemo()`) keeps outbound LLM, Web Search, SIP, and Push network calls strictly disabled (returning clean scripted/mock states).
6. **CSP & Helmet Headers (`src/server/app.ts`):** Must be updated carefully to permit `wss:` in `connectSrc` for WebRTC SIP signaling and `blob:`/`mediastream:` for camera QR, voice notes, and WebRTC audio while keeping `scriptSrc: ["'self'"]` strict.

---

## 5. Hardcoded Zero-Leak Security & 20+ Staff RBAC Architecture

### 5.1 Hardcoded Tier Hierarchy (`src/shared/swk-staff-access.ts`)

Access is governed by **code-enforced role ceilings**, never trusted from the database alone:

| Tier | Assignment Rule (Hardcoded in Code) | Hardcoded Capabilities | Explicitly Hard-Blocked |
|---|---|---|---|
| **Tier 1: Owner** | Exact email match ONLY (`shabib@swk.properties` + hardcoded aliases) | Full `*` across all modules, Recycle Bin final approval, Admin control, Reception QR view/print/regen, CRM Vault unmasked, Omni-Route AI admin & keys, SIP trunk config, Live Field GPS Map (all agents), Staff onboarding & revocation | None |
| **Tier 2: Admin** | Exact email match ONLY (`admin@swk.properties` + hardcoded aliases) | Full `*` operational & technical admin under Owner oversight, Reception QR, CRM Vault, Omni-Route AI admin, SIP config, Live Field GPS Map (all agents) | Cannot modify/lock/revoke Owner account; Recycle Bin & Admin Decisions escalate to Owner |
| **Tier 3: Manager** | Exact email match ONLY (`haseeb@swk.properties` + hardcoded aliases) | Full operational modules (`MANAGER_PERMISSIONS`), Reception QR, CRM Vault, Live Field GPS Map (all agents), all Utility Tools, AI Brain (manager toolset), SIP full calling | Admin settings write (`admin: ['view']` only), LLM/SIP secret key viewing, Owner controls |
| **Tier 4: HR** | Hardcoded email (`rahaba@swk.properties`) OR Owner-created staff assigned `HR` tier | `HR_ROLE_PERMISSIONS`, Attendance & Leave approvals, Employee records (`canViewEmployeeRecords`), Utilities (Word/PDF/OCR/Translator/Search), AI Brain (HR + General toolset), Inside Chat, SIP extension | CRM Vault, Sales/Deals/Finance/Invoices, Reception QR print, Live Field GPS Map of agents, Admin/Integrations |
| **Tier 5: Office Admin** | Hardcoded email (`meenakshi@swk.properties`) OR Owner-created staff assigned `Office Admin` tier | `OFFICE_ADMIN_PERMISSIONS` (front office, documents, walk-in enquiries, calendar, tickets), Utilities (Word/PDF/OCR/Translator/Search), AI Brain (Office Admin + General toolset), Inside Chat, SIP extension | CRM Vault, Finance/Payroll/Deals, Employee visa/salary PII, Reception QR print, Live Field GPS Map, Admin/Integrations |
| **Tier 6: Field Agent / Staff** *(Default for Staff #13–25+)* | Hardcoded 7 consultants (`talha`, `fareed`, `shahid`, `umar`, `saifullah`, `samarth`, `sanketh`) AND **mandatory default ceiling for all newly added staff #13–25+** | Own Attendance & QR Check-in, Own Field Duty GPS toggle & own session log, Own Daily Report & Leave Requests, `My Assigned Deals` (hard-masked only), Market Pulse, UAE Calculators, Full Personal Utility Suite (Word/PDF/OCR/Translator/Public+Self Search), AI Brain (Safe General + Public Listing + Own Masked Deals toolset), Inside Chat, SIP Extension (direct non-vault + masked Vault alias only) | **EVERYTHING ELSE:** CRM Vault raw numbers, other agents' deals/leads/GPS, Finance/Invoices/Bills/Bank, Employee records/visas/payroll, Reception QR display/print, Admin/Integrations/Audit/Secrets |

### 5.2 Scaling to 20+ Staff Without Weakening Hardcoding
- **Canonical Elevated Identity (`[Resolved from Codebase]`):** Login aliases (`shabib@swk.property`, `haseeb@swk.property`, `admin@swkpropertiesuae.com`, `manager@swkpropertiesuae.com`) authenticate into their canonical `@swk.properties` user row via `attemptLogin()` / `syncSwkStaffRoster()`. Privileged gates (`QR_VIEWER_EMAILS`, `canAccessCrmVault`, `/api/field-gps/live`) strictly match those exact 3 canonical `@swk.properties` emails (`shabib@swk.properties`, `admin@swk.properties`, `haseeb@swk.properties`).
- **Immutable Elevation Ceiling & HMAC-Signed Non-Elevated Grants in `loadUser()` (`src/server/auth.ts`) `[Architect's Call]`:**
  - Only the 3 canonical elevated accounts can EVER receive `Owner`, `Admin`, or `Manager` permissions—even if someone edits SQLite/Postgres `users` or `roles` directly!
  - Both **Owner (`shabib@swk.properties`)** and **Admin (`admin@swk.properties`)** may onboard staff #13–25+ in `Admin → Users` and assign ONLY one of three non-elevated hardcoded tiers: `Field Agent / Staff` (default), `Office Admin`, or `HR`.
  - To prevent direct DB `role_id` tampering into `HR` (payroll/visas) or `Office Admin` (walk-in leads/tickets), assigning `HR` or `Office Admin` to a non-hardcoded email writes an **`APP_SECRET`-HMAC-signed `role_grant_sig`** (`HMAC-SHA256(APP_SECRET, "swk-role-v1:" + userId + ":" + canonicalEmail + ":" + tierName)`) stored on `users.role_grant_sig` alongside `role_granted_by`. On every request, `loadUser()` verifies `role_grant_sig`; if missing, tampered, or pointing to any elevated role (`Owner`/`Admin`/`Manager`/`*`), `loadUser()` forcibly downgrades effective permissions to `RESTRICTED_STAFF_PERMISSIONS` and records a `security_tamper` audit event!
  - Existing seeded functional roles (`Accounts`, `Property Mgmt`, etc.) remain in the `roles` table strictly for backward compatibility with existing non-SWK unit test fixtures (`tests/access-control.ts`, `tests/compliance.ts`), while `Admin → Users` restricts new SWK staff creation to the 3 non-elevated tiers and `loadUser()` blocks any non-hardcoded email from ever gaining elevated privileges (`Owner`, `Admin`, `Manager`, `permissions='*'`, Vault, QR Print, Live GPS, or Admin Settings).
  - Adding a new elevated user requires an explicit code change & deployment by the Owner.

### 5.3 Mandatory Remediation of 4 Existing SWKOS Leak Vectors (Phase 0 Security Gate)
Before enabling any new feature for 20+ staff, the following four leaks discovered during codebase audit MUST be closed:
1. **AI Agent & Tool Privilege Leak (`routes/integrations.ts`, `ai/agents.ts`, `ai/tools.ts`):**
   - Pass caller `SessionUser` into `chatWithAgent()`, `loop()`, and every `tool.run()`.
   - Introduce a hardcoded `ROLE_AI_TOOL_ALLOWLIST` in `src/server/ai/policy.ts`:
     - `Owner` / `Admin`: all reviewed tools.
     - `Manager`: operational + CRM + sales + leasing + finance + HR read/internal tools (no system secret access).
     - `HR`: `expiring_documents` (HR scope), `list_tasks`, `lookup_listings`, `my_attendance_status`.
     - `Office Admin`: `lookup_listings`, `list_tasks`, `open_tickets`, `create_lead`, `request_viewing`, `my_attendance_status`.
     - `Field Agent / Staff`: ONLY `lookup_listings`, `market_pulse_lookup`, `my_assigned_deals_masked`, `my_attendance_status`, `my_daily_report_status`. **Hard-denied:** `business_snapshot`, `search_deals`, `get_deal`, `search_parties`, `overdue_invoices`, `party_statement`, `bills_due`, `pipeline_summary`, `rent_roll`, `expiring_leases`, `mandate_health`, `list_leads`, `stale_opportunities`, `open_tickets`, `expiring_documents`, `send_email`, `send_whatsapp`.
   - Gate `GET /api/ai/brief` strictly to `Owner`, `Admin`, `Manager` (`canAccessCrmVault(req.user)`).
   - Gate `POST /api/ai/agents/hire` and `POST /api/ai/agents/:id/run` strictly to `Owner` and `Admin` (`canOpenEmployeeRecords(req.user)`).
2. **Global Search Employee Leak (`routes/insights.ts` line 191):**
   - Enforce `if (s.entity === 'employees' && !canViewEmployeeRecords(user)) continue` and enforce `RESTRICTED_STAFF_ALLOWED_ENTITIES` for restricted staff.
3. **Notification Role Bypass (`src/server/notify.ts`):**
   - Replace raw DB `r.permissions` / `r.name` SQL checks in `notifyRole()` and `notifyLeadership()` with `loadUser(u.id)` + `can()` / `isOwnerSwkUser()` / `isAdminSwkUser()` / `canAccessCrmVault()` so hardcoded ceilings govern notifications too.
4. **Hardened Mobile Session, Unified Hardware Device Binding & SSE Ticket Auth (`src/server/app.ts`, `src/server/routes/auth.ts`) `[Architect's Call]`:**
   - Re-enable mobile bearer session header `X-SWK-Session` paired with `X-SWK-Client: mobile`, adding a `device_id` column to `sessions` and unifying `mobile_devices` into `staff_devices` (preserving all existing Reception QR EC P-256 approvals).
   - Mobile clients generate a hardware-backed EC P-256 keypair inside Android Keystore (or Secure Enclave / WebCrypto) so ONE cryptographic `device_id` covers both mobile sessions and Reception QR check-in.
   - **Enrollment & Revocation Policy `[Architect's Call]`:** First mobile sign-in with valid credentials + TOTP registers the device in `staff_devices` as `Pending` for Reception QR check-in (requiring Owner/Manager approval before office QR attendance works) while allowing authenticated access to Inside/AI/Utilities/Field Duty—plus an Owner/Admin setting `mobile_require_device_approval` (default `false`, toggleable to `true` to block even initial mobile login until approved). Blocking/revoking a device immediately deletes all `sessions WHERE device_id = ?` and disables its `push_subscriptions` (targeted to that device; Owner also retains "Force Sign Out All Devices").
   - Add `POST /api/auth/stream-ticket` returning a single-use, 30-second, user-bound opaque ticket for EventSource (`GET /api/chat/stream?ticket=...` and `GET /api/notifications/stream?ticket=...`) so native mobile clients open real-time SSE streams without ever placing long-lived session tokens in URLs or access logs.

---

## 6. Subsystem 1: Omni-Route AI Brain (Free Multi-Provider Pool + Tier-1/Local)

### 6.1 Provider Catalog & Recommended Free + Tier-1 Models (`src/server/ai/omni-catalog.ts`)

| Provider Key | Default Base URL (OpenAI-Compatible) | Free Models (Reasoning / Fast / Vision / Audio) | Typical Free Quotas (Per Key) | Zero-Retention Default |
|---|---|---|---|---|
| `gemini` | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` (reasoning/vision/1M ctx), `gemini-2.5-flash-lite` (fast), configurable latest Flash IDs | ~10–15 RPM, 250–1,000 RPD | `false` *(PII redaction ON)* |
| `groq` | `https://api.groq.com/openai/v1` | `openai/gpt-oss-120b` (reasoning), `openai/gpt-oss-20b` (fast), `llama-3.3-70b-versatile`, `qwen/qwen3-32b`, `whisper-large-v3-turbo` (audio) | ~30 RPM, 1,000 RPD, 8K–12K TPM | `false` *(PII redaction ON)* |
| `openrouter` | `https://openrouter.ai/api/v1` | `openrouter/free` (auto-free), free reasoning models (NVIDIA Nemotron free, Qwen free, Gemma free — editable IDs) | ~20 RPM, 50 RPD (1,000 RPD w/ $10 credit) | `false` *(PII redaction ON)* |
| `cloudflare` | `https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, `@cf/qwen/qwq-32b`, `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` | 10,000 free Neurons/day | `true` |
| `cerebras` | `https://api.cerebras.ai/v1` | `gpt-oss-120b`, `llama-3.3-70b`, `qwen-3-32b` | Free developer tier limits | `false` *(PII redaction ON)* |
| `sambanova` | `https://api.sambanova.ai/v1` | `DeepSeek-V3.1`, `DeepSeek-R1-Distill-Llama-70B`, `Meta-Llama-3.3-70B-Instruct` | Free trial / developer limits | `false` *(PII redaction ON)* |
| `mistral` | `https://api.mistral.ai/v1` | `mistral-small-latest`, `open-mistral-nemo` | Experiment tier limits | `false` *(PII redaction ON)* |
| `github_models` | `https://models.inference.ai.azure.com` | `gpt-4o-mini`, `DeepSeek-R1`, `Llama-3.3-70B-Instruct` | GitHub PAT free limits | `false` *(PII redaction ON)* |
| `nvidia_nim` | `https://integrate.api.nvidia.com/v1` | `nvidia/llama-3.3-nemotron-super-49b-v1`, `deepseek-ai/deepseek-r1` | NVIDIA free dev credits | `false` *(PII redaction ON)* |
| **Tier-1 / Other 1 Models** (`openai`, `anthropic_via_or`, `xai`, `deepseek`, `ollama`, `custom`) | Provider native or OpenAI-compatible URL (e.g. `http://127.0.0.1:11434/v1` for local Ollama) | `gpt-4o`, `o3-mini`, `claude-sonnet`, `grok-3-mini`, `deepseek-reasoner`, local `qwen2.5:3b` / `qwen3` | Paid / unlimited local | `true` *(configurable)* |

*(Note: Free provider model IDs rotate periodically; every route's `model_id` is editable in Admin → Integrations → Omni-Route without code changes, and a "Test & Refresh Models" button probes `/models` where supported.)*

### 6.2 Omni-Route Algorithm (`src/server/ai/omni-router.ts`)
1. **Multi-Key Pool:** Admin can register **multiple API keys per provider** (e.g., 3 Groq keys, 3 Gemini keys, 2 OpenRouter keys, 1 Cloudflare account, 1 Cerebras, 1 SambaNova, 1 Mistral, + 1 Tier-1 paid or Ollama reserve). Every key is stored as its own row in `ai_provider_routes` with AES-256-GCM encryption.
2. **Task-Lane Routing:** Every AI request declares a lane:
   - `reasoning`: complex analysis, RERA/DLD math, contract drafting, strategy (prefers `gpt-oss-120b`, `DeepSeek-R1/V3.1`, `qwq-32b`, `gemini-2.5-flash` thinking, `openrouter/free`, then Tier-1 fallback).
   - `fast`: general staff Q&A, quick WhatsApp/email drafts, short summaries (prefers `gemini-2.5-flash-lite`, `gpt-oss-20b`, `llama-3.3-70b`, `mistral-small-latest`).
   - `vision`: OCR cleanup, analyzing floor plans / inspection photos / PDFs (prefers `gemini-2.5-flash`, vision-capable OpenRouter/Tier-1).
   - `translate`: dedicated Translator lane (prefers multilingual-strong `gemini-2.5-flash`, `qwen`, `llama-3.3-70b`, `mistral-small-latest`).
   - `search`: synthesizing unified search answers with citations.
3. **Health Scoring, Circuit Breaker & Zero-Wait Failover:**
   - In-memory + persisted route health tracker records sliding-window RPM, daily RPD/tokens, EWMA latency, and `cooldown_until`.
   - Candidate selection filters enabled routes matching `lane` + `sensitivity` policy, excludes routes in active cooldown, sorts by `(tier_order: free first unless Tier-1 requested by Leadership, priority ASC, fewest_recent_requests ASC, lowest_latency ASC)`.
   - On HTTP `429` (rate limit), `402` (credits exhausted), `502/503/504`, or network timeout:
     - Respects `Retry-After` header if present; otherwise applies stepped cooldown (`60s` → `180s` → `600s`; if body indicates daily quota exhausted, cools down until next `00:05 UTC`).
     - Immediately retries the next healthy route in the candidate chain (up to 6 hops within request deadline) **before** emitting any error to the user.
   - **Per-User Fair Share:** Configurable per-user soft quotas (default: 150 requests/day & 10 requests/min for staff; unlimited for Owner/Admin/Manager) so one person looping prompts cannot starve 20+ teammates.
4. **Hardcoded PII, Vision & Executive-Agent Privacy Shield (All-Cases Coverage):**
   - **OCR-First Hardened Default (Images & Uploaded Documents):** Uploaded images/scans (IDs, cheques, contracts) and PDFs/Word files run through **local server-side Tesseract EN+AR OCR / `mammoth` text extraction first**, then through `scrubSensitivePii()` which masks UAE & international phone numbers (`+971...`, E.164), Emirates IDs (`784-xxxx-xxxxxxx-x`), passport numbers, UAE IBANs (`AE...`), email addresses, and CRM Vault references (`[PHONE_1]`, `[EID_1]`, `[EMAIL_1]`) before dispatching to any route with `zero_retention = false` (restoring tokens locally in the response only for authorized roles).
   - **Optional Non-Vault Vision Mode (Owner/Admin Toggle):** Owner/Admin can enable `ai_allow_nonvault_vision_free` on explicitly approved vision routes (e.g., floor plans, property photos, inspection visuals) with an explicit UI warning badge (`External Vision Route — Never upload IDs/Vault docs`) and audit log entry; raw Vision calls NEVER execute on CRM Vault records or when Confidential Mode is active.
   - **Zero-Retention Fail-Closed for Confidential Mode & Executive Agents:** Existing scheduled/executive agents (`Jarvis`, WhatsApp bot, Voice AI receptionist) migrate onto Omni-Route and—along with Leadership "Confidential Mode"—require `zero_retention = true` routes (Cloudflare Workers AI / paid Tier-1 / local Ollama). If no `zero_retention = true` route is healthy and no paid Tier-1/Ollama route is configured, confidential/executive runs fail closed with a clear Owner alert instead of silently leaking brokerage ledgers to training-enabled free endpoints.

### 6.3 AI Brain Workbench UI (`/ai` — Enhanced)
- **ChatGPT/Claude-grade workspace** for all 20+ staff:
  - Left sidebar: private per-user conversation history (`ai_conversations` — strictly `WHERE user_id = req.user.id`), search past chats, pinned real-estate prompt templates (role-filtered).
  - Composer: mode pills (**Auto**, **Deep Reasoning**, **Fast**, **Translate**, **Search-Grounded**), attach PDF / Word / Image / Excel (auto-extracted via existing `ocr.ts` / `mammoth` / `read-excel-file`), voice-to-text input, and transparent route pill showing which provider/model answered + whether PII Shield was active.
  - Streaming token output via SSE (`POST /api/omni-ai/chat/stream`).
  - Existing **AI Agents** & **Approvals** tabs remain visible strictly to authorized roles (Owner/Admin/Manager only for executive agents & approvals).
  - **Admin Omni-Route Health Tab** (Owner/Admin only): add/edit/test/reorder provider keys, live green/amber/red status per key, cooldown countdown, daily token/request bar charts, and per-staff consumption table.

---

## 7. Subsystem 2: All-Purpose Real Estate Utility Suite (`/utilities`)

Unified multi-tab Workbench accessible from the Launcher and Mobile Bottom Bar (with strict role-gating per tool where needed):

### 7.1 Word Editor & Converter (`/utilities/word`)
- **Open & Edit:** Upload `.docx` (parsed via existing `mammoth` into sanitized HTML), create blank document, or load any of the 158 SWK Document Studio templates.
- **Rich Editor:** Headings, bold/italic/underline, tables, bullet/numbered lists, RTL Arabic/LTR English direction toggle, live word/character count, optional SWK official letterhead + footer + company seal (seal stamping permitted only for roles with `documents: create` or leadership override).
- **AI Assist Inline:** Highlight text → "Improve", "Formalize for RERA/DLD", "Translate to Arabic/English", or "Summarize" via Omni-Route.
- **Export & Convert (`POST /api/utilities/word/export`, `POST /api/utilities/convert`):**
  - Export edited document to **`.docx`** (using `docx` npm package — clean OOXML paragraphs, headings, tables, RTL support, header/footer).
  - Export to **`.pdf`** (using existing SWKOS Chromium/Playwright or `pdf-lib` renderer with official letterhead).
  - Export to **`.txt`** / **`.html`**.
  - **One-click conversions:** `.docx` → `.pdf`, `.pdf` / scanned photo → OCR → editable `.docx`, `.txt`/Markdown → `.docx`.

### 7.2 Upgraded PDF & OCR Studio (`/utilities/pdf-ocr`)
- Extends existing `DocumentToolsPage.tsx`:
  - **EN + AR OCR** (existing `tesseract.js` + `pdfjs-dist`), now with direct **"Open in Word Editor"**, **"Send to Translator"**, and **"Ask AI Brain"** handoff buttons.
  - **PDF Merge, Split/Extract Pages, Photos-to-PDF** (existing client-side `pdf-lib`).
  - **New:** **Camera Multi-Page Scan to PDF** (mobile/webcam live capture of Emirates ID front+back, passports, cheques, Form A/F), **PDF-to-Word (`.docx`)**, **PDF Watermark** (`SWK PROPERTIES CONFIDENTIAL` + timestamp + user name), and **Smart Record Import (OCR)** (only for entities the user's role is allowed to create!).

### 7.3 Dedicated Translator (`/utilities/translator`)
- Two-pane side-by-side workspace + **Document Translation** (upload `.pdf`, `.docx`, `.txt`, or image → OCR → chunked translation → downloadable `.docx`/`.txt`).
- **Languages:** Auto-detect ↔ English, Arabic (UAE RTL), Hindi, Urdu, Russian, Chinese (Simplified), French, Spanish, Persian (Farsi).
- **UAE Real Estate Glossary Lock:** Hardcoded bilingual glossary injected into Omni-Route `translate` system prompt so statutory terms (*Ejari, Oqood, Form A/B/F/I, RERA, DLD Trustee, Trakheesi, Makani, NOC, Escrow, Post-Dated Cheque, Golden Visa*) are translated accurately and never mangled.
- **Tone Presets:** `Legal / RERA Formal`, `Client WhatsApp (Warm & Concise)`, `Executive Email`, `Property Listing`.
- **Actions:** Swap languages, copy, listen (Web Speech TTS), export `.docx`/`.pdf`, or forward directly into an `Inside` chat thread.

### 7.4 Unified Role-Scoped Search Engine (`/utilities/search`)
- Single Google/Perplexity-style search experience (`POST /api/search/unified`) with toggleable scope tabs:
  1. **All (Hybrid)**
  2. **SWK Internal (Zero-Leak Role-Scoped):** queries ONLY entities permitted by the caller's hardcoded tier:
     - *Owner / Admin / Manager:* Properties, Units, Deals, Leads, Parties, Leases, Invoices, Mandates, Documents, Tasks, Employees, Inside Messages (own threads only), and Vault summary (leadership only).
     - *HR:* Employees, Attendance, Leave, HR Documents, Tasks, Inside Messages (own threads).
     - *Office Admin:* Walk-in Leads, Support Tickets, Documents, Calendar, Tasks, Inside Messages (own threads).
     - *Field Agent / Staff:* **STRICTLY** own Assigned Deals (masked), own Attendance/Daily Reports/Leave, Public Market Communities/Developers/DLD Stats, and own Inside Messages. **Zero hits** from Finance, Vault raw owners, other agents' records, or HR PII.
  3. **SWKPROPERTY.COM Inventory:** searches live published listings (`website_listings` / synced `SWKPROPERTY.COM` catalog) with filters (Buy/Rent/Off-Plan, bedrooms, community, max AED) and one-click **Copy Client Share Link** or **Generate Printable Buyer Shortlist**.
  4. **Web Search + AI Answer:** pluggable server-side web search engine (`src/server/integrations/web-search.ts`) supporting:
     - **Zero-key default:** DuckDuckGo HTML/Lite parser + Wikipedia/RERA Dubai public links (rate-limited, sanitized).
     - **Optional free/API keys (Admin → Integrations → Search):** **Tavily** (1,000 free searches/month), **Brave Search API** (2,000 free/month), or self-hosted **SearXNG** URL.
     - Optional **"Synthesize with AI Brain"** toggle sends ONLY the public web snippets + query (never internal DB rows unless Confidential Mode + permitted) to Omni-Route `search` lane to produce a cited brief.

### 7.5 Calculators & Office / Manager / Admin / Field Micro-Tools (`/utilities/calculators`)
- Preserves all 8 UAE Deal Toolkit calculators (`ToolkitPage.tsx`) and adds:
  - **Dubai Area & Currency Converter:** `sqft ↔ sqm`, live/manual `AED ↔ USD / EUR / GBP / INR / SAR / RUB / CNY`.
  - **PDC Cheque Schedule Calculator:** split annual rent into 1/2/4/6/12 cheques with exact Dubai dates & 5% security deposit / Ejari fee breakdown.
  - **Branded Public QR Generator:** generate downloadable SWK QR codes for `SWKPROPERTY.COM` property URLs, WhatsApp links, or agent vCards (explicitly rejects reception QR token prefixes).
  - **Field Day Pack:** quick access to Daily Close-Out Report, Viewing Checklist, Key Custody Log, and Property Inspection link.

---

## 8. Subsystem 3: SIP / VoIP Softphone Extension

### 8.1 Server Configuration & Extension Mapping (`src/server/routes/sip.ts`)
- **Admin Trunk Config (`Admin → Integrations → SIP / VoIP`, Owner & Admin ONLY):**
  - `sip_enabled` (boolean)
  - `sip_ws_url` (e.g., `wss://pbx.example.com:8089/ws`)
  - `sip_domain` (realm / registrar host)
  - `sip_outbound_proxy` (optional)
  - `sip_ice_servers` (JSON array of STUN/TURN URLs + encrypted credentials)
  - `sip_caller_id_mode` (`company_main` | `extension` | `masked_bridge`)
  - `sip_vault_bridge_prefix` (optional PBX prefix for masked Vault routing when SIP handles Vault calls)
- **Per-Staff Extension Registry (`sip_extensions` table):**
  - Maps `user_id` → `extension_no` (e.g., `101`), `sip_username`, `sip_password_enc` (AES-256-GCM), `display_name`, `allow_direct_dial` (boolean, default `true` for Leadership/Office Admin, configurable for Staff), `active`.
  - `GET /api/sip/my-config` returns ONLY the authenticated caller's own WSS config + extension registration credentials (or `configured: false` with a clear setup banner if Admin hasn't entered SIP credentials yet). **Never** exposes other staff extensions' passwords or trunk admin secrets.
  - `GET /api/sip/directory` returns internal extension numbers & names of active SWK colleagues for one-click internal extension dialing/transfer.

### 8.2 WebRTC Softphone Client (`src/web/components/SipSoftphone.tsx` + `/phone`)
- Built on **`sip.js`** (standard SIP over WebSocket + WebRTC audio, works in desktop browsers, mobile PWA, and Capacitor WebView with microphone permission).
- **Persistent Floating Call Widget:** minimizes to a sleek status pill in the SWK OS header/bottom bar so staff can navigate CRM, Utilities, AI Brain, or Chat without dropping an active call!
- **Full Softphone Features:**
  - Live registration indicator (`Ready · Ext 104`, `Connecting…`, `SIP Not Configured`).
  - Dialpad + internal SWK colleague directory + recent call log.
  - Incoming call modal + ringtone + vibration + Answer / Decline / Send to Voicemail.
  - Active call controls: Mute, Hold/Resume, Speaker/Mic device picker, DTMF keypad, Blind Transfer & Attended Transfer to another SWK extension, and quick call notes box.
- **Zero-Leak Hard-Masked Vault Protocol (Dual Plug-in Contract) `[Architect's Call]`:**
  - Any call triggered from `My Assigned Deals` (CRM Vault) calls `POST /api/sip/vault-call/:propertyId` instead of dialing a raw number in the browser.
  - Supports **both** external PBX patterns cleanly:
    1. **Server-Side Bridge Mode (Default):** invokes the existing server-to-carrier/PBX HTTP bridge (`initiateMaskedBridgeCall` in `crm-vault.ts`), ringing the agent's SIP extension or phone first and bridging to the owner server-side.
    2. **PBX Token-Resolve Mode (When `sip_vault_bridge_prefix` is configured):** server issues a single-use 60-second opaque call token (`vt_<random>`) and returns ONLY `<sip_vault_bridge_prefix><token>@<sip_domain>` to `sip.js`; the external PBX calls SWKOS's authenticated webhook `POST /api/public/sip/:secret/resolve-vault-token` to exchange `<token>` for the owner E.164 number.
  - In both modes, the owner's raw phone number NEVER leaves the server to the agent's device, NEVER appears in WebRTC SDP or SIP `To:` headers, and NEVER appears unmasked in the agent's call log.
- **Incoming SIP Call Wake (All-Cases Coverage — Foreground + Push Webhook + Native Ringing):**
  - **Foreground (Desktop/PWA/Mobile):** `sip.js` rings immediately over active WSS registration with audio chime + incoming-call banner.
  - **Background / Locked Phone Wake:** exposes `POST /api/public/sip/:secret/incoming-wake` so any compatible SIP PBX/trunk can notify SWKOS of an incoming `INVITE` for an extension; SWKOS immediately dispatches a high-priority push (`swk_calls_sos` channel via FCM + Web Push + APNs PushKit payload).
  - **Native Call Screen:** Android Capacitor shell wires a native full-screen incoming-call intent + `ConnectionService` / foreground call notification so locked Android phones ring and launch straight into the answering softphone UI; iOS Capacitor shell ships with `PushKit` / `CallKit` configuration hooks ready for macOS/Xcode compilation.
- **Call Logging & Post-Call AI Summary:**
  - `POST /api/sip/calls/log` records outbound/inbound SIP calls into `voice_calls` (tagged with `user_id`, direction, duration, disposition, notes, masked target if Vault). Staff see ONLY their own call history; Owner/Admin/Manager see the full team call log.

---

## 9. Subsystem 4: Camera QR Attendance & Live Field Location

### 9.1 In-App Camera QR Attendance
- Unified scanner available from the Launcher, Mobile Quick-Action button, and `/reception-qr`.
- Uses live camera stream (`getUserMedia` + `jsQR` on web/PWA and native camera permission handling in Capacitor)—**zero gallery/file upload allowed**.
- Executes the existing anti-spoof protocol in [attendance-security.ts](file:///C:/Users/shamh/.gemini/antigravity/scratch/SWKOS/src/server/domain/attendance-security.ts):
  1. Scan `SWK1.` (rotating AES-256-GCM 30s) or `SWK2.` (fixed HMAC) QR code.
  2. Fetch single-use challenge (`GET /api/public/reception-qr/challenge`).
  3. Sign `challenge.payload` using hardware-bound non-exportable EC P-256 device key (`deviceKey.ts` / Android Keystore).
  4. Verify office Wi-Fi lock (and optional geofence coordinates if configured), bind/check device approval in `staff_devices`, record check-in/check-out in `attendance` & `attendance_events`, and auto-notify leadership if late.
- **Hardcoded QR Secrecy:** Reception QR display/print/regenerate endpoints remain locked strictly to `shabib@swk.properties`, `admin@swk.properties`, and `haseeb@swk.properties`.

### 9.2 Live Field Location Tracking (`src/server/routes/field-gps.ts` + `/field-live`)
- **Field Agent Flow (Web + Capacitor Mobile):**
  - Agent taps **"Start Field Duty"** (`POST /api/field-gps/sessions/start`) with optional purpose (`Viewing`, `Snagging`, `Developer Visit`, `Key Handover`, `DLD Trustee`), target community/property, and initial verified GPS fix.
  - While active, the app batches GPS points (`lat`, `lng`, `accuracy_m`, `speed_mps`, `heading`, `battery_pct`, `is_mock`, `recorded_at`, `idempotency_key`) every **15–30 seconds** to `POST /api/field-gps/pings` (stored in `duty_location_batches` and summarized on `field_sessions` + `staff_live_locations`).
  - On **Capacitor Android**, a native foreground service plugin (`@capacitor-community/background-geolocation` or custom foreground service with persistent notification `"SWK Field Duty Active — Sharing Live Location"`) keeps GPS fixes alive when the phone screen is locked. On **Web/iOS PWA**, uses `navigator.geolocation.watchPosition` + Wake Lock when active and clearly indicates background limitations.
  - Agent taps **"End Field Duty"** (`POST /api/field-gps/sessions/stop`) or triggers an **SOS Alert** (`POST /api/field-gps/sos`) which instantly pings Owner, Admin, and Manager via live SSE + high-priority Push Notification with exact coordinates.
- **Anti-Spoof Validation (Server-Side):**
  - Rejects `is_mock === true` immediately (`422 Mock GPS detected`), logs a `gps_spoof_attempt` audit event, and flags the session for Manager review.
  - Rejects fixes with `accuracy_m > 150` or timestamp skew `> 5 minutes` (unless tagged as offline-replayed batch within the active session window).
  - Runs `gpsFlags()` (impossible travel `> 200 km/h`, repeated identical coordinates) and surfaces warning badges on the Leadership map.
- **Auto-Expiry, Existing Control 3.10 / 7.03 Audit & UAE PDPL Retention `[Architect's Call]`:**
  - **Auto-Expiry:** Ad-hoc Field Duty sessions auto-close at **21:00 Asia/Dubai (shift end + 2h)** or **max 12 hours** (whichever comes first), automatically stopping the mobile foreground GPS service and sending a 19:30 reminder push.
  - **Compliance Audit Trail (Control 3.10 / 7.03 Preserved):** Every Leadership access to `/api/field-gps/live` or `/api/field-gps/sessions/:id/trail` logs an immutable row in `location_access_logs` (`viewer_user_id`, `target_employee_id`, `field_session_id`, `accessed_at`, `reason`). Owner/Admin/Manager can inspect **currently active** field sessions and **today's duty trails** freely; inspecting closed historical/off-hours sessions requires a written reason and triggers the existing compliance exception audit.
  - **PDPL Telemetry Purge:** Raw 15–30s breadcrumb points in `duty_location_batches` are automatically purged nightly by the scheduler after **90 days** (`gps_retention_days`, configurable by Owner/Admin), retaining only summarized session check-in/check-out records on `field_sessions`.
- **Leadership Live Map (`/field-live` — STRICTLY Owner, Admin, Manager ONLY):**
  - Guarded in code by `canAccessCrmVault(req.user)` (exact 3 leadership accounts: Owner, Admin, Manager). Any other role receives `403 Forbidden`.
  - Real-time **Leaflet + OpenStreetMap** map (zero Google Maps billing required) fed by `GET /api/field-gps/live` + SSE stream (`GET /api/field-gps/stream`), displaying:
    - Live pins for every active field agent (avatar, name, community/purpose, last ping age, speed, battery %, accuracy, spoof/idle warnings).
    - Click an agent → view today's route polyline breadcrumb (`GET /api/field-gps/sessions/:id/trail`), check-in time, linked viewing/deal, and one-click **"Message on Inside"** or **"Call via SIP"**.
  - Agents can ONLY call `GET /api/field-gps/my-session` to see their own status and trail—never any colleague's location.

---

## 10. Subsystem 5: WhatsApp-Grade `Inside` Live Messaging & App Notifications

Upgrades existing `Inside` ([chat.ts](file:///C:/Users/shamh/.gemini/antigravity/scratch/SWKOS/src/server/routes/chat.ts), [ChatPage.tsx](file:///C:/Users/shamh/.gemini/antigravity/scratch/SWKOS/src/web/pages/ChatPage.tsx), [chatLive.ts](file:///C:/Users/shamh/.gemini/antigravity/scratch/SWKOS/src/web/lib/chatLive.ts)):

1. **Rock-Solid Real-Time Transport:**
   - `/api/chat/stream` accepts both browser cookie auth AND short-lived SSE ticket (`POST /api/auth/stream-ticket`) for Capacitor mobile.
   - Supports `?since_id=<lastMessageId>` reconnection catch-up so if a field agent enters an elevator or switches Wi-Fi → 5G, missed messages, receipts, and reactions sync automatically on reconnect.
   - Optimistic UI sending with local pending state (`clock` icon → single tick `sent` → double grey tick `delivered` → double blue tick `read`) + IndexedDB offline queue for unsent messages.
2. **True Background Push Notifications (Exactly Like WhatsApp):**
   - **Web Push (Desktop & Mobile PWA):** `web-push` VAPID keys auto-generated and encrypted in `settings` (`vapid_public_key`, `vapid_private_key`). Restored `public/sw.js` handles `push` and `notificationclick` events (focusing/opening `/chat?t=<threadId>` directly).
   - **Native Android / iOS Push:** `push_subscriptions` table stores both Web Push endpoints AND Capacitor FCM/APNs device tokens (`POST /api/push/subscribe`, `DELETE /api/push/unsubscribe`). Server dispatches FCM HTTP v1 notifications when `FCM_SERVICE_ACCOUNT_JSON` is configured in Admin/env, with Android high-priority channel `swk_messages` (sound, heads-up, grouping by `thread_id`) and `swk_calls_sos` (urgent ringtone for incoming SIP calls & Field SOS).
   - **Smart Delivery Suppression:** If the recipient currently has that exact thread active in foreground (`POST /api/chat/active-thread`), suppress external push & chime; if they are on another screen inside the app, show a **WhatsApp-style floating heads-up banner** at the top with sender avatar, preview, and inline **Quick Reply** input!
   - **Lock-Screen Privacy Option:** Per-user setting `push_hide_preview` (or company-wide Owner toggle) replaces push body with `"New message in SWK Inside"` so sensitive deal details never appear on a locked phone screen.
3. **Additional WhatsApp-Parity Features Inside `Inside`:**
   - **Share Live Location Pin** in chat (drops an interactive Dubai map card inside a DM/group — e.g., agent sharing exact viewing entrance with Manager).
   - **Share Document from Utilities / Word Studio / OCR / SWKPROPERTY.COM Listing** directly into any `Inside` chat in one tap.
   - **Live Unread Badges** synced everywhere: app header, Launcher tile, mobile bottom bar, browser tab title `(N) SWK OS`, and OS app icon (`navigator.setAppBadge`).
   - **Strict Role Guardrails:** Portal accounts (`party_id`) 100% blocked; `attendance-report` broadcast restricted to Owner/Admin/Manager; Admin-only announcement groups enforce `announce=1` server-side; file downloads (`/api/chat/files/:mid`) verify thread membership on every request.

4. **Bidirectional OS ↔ App Real-Time Event & Push Notification Bridge (Messaging + All Company Ops):**
   - Every message posted inside **SWKOS (`Inside`)** on desktop web OR inside the **Mobile App** shares the exact same `chat_threads` / `chat_messages` / `liveBus` pipeline (`chat:<userId>`) and dispatches BOTH instant SSE frames AND background Web Push / FCM push notifications so desktop SWKOS and mobile phones stay in millisecond lockstep.
   - **All Company Operations Push Notifications (`src/server/notify.ts` → `src/server/integrations/push.ts`):** Every `notify()` / `notifyRole()` / `notifyLeadership()` call across ALL SWKOS company modules (Universal Approvals, Recycle Bin deletion requests, Deal Withdrawals, New Leads & Assignments, Viewing Reminders, PDC Cheque Maturities, Ejari/Visa/RERA Expiries, Daily Report submissions/escalations, Late Attendance alerts, Field Duty SOS, AI Agent approvals, and @mentions in record comments) automatically dispatches:
     1. Instant in-app live stream event (`GET /api/notifications/stream` supporting cookie + mobile SSE ticket) with a toast/banner and live notification bell badge, AND
     2. Background push notification (Web Push VAPID + native Android FCM channel `swk_ops_alerts` / iOS APNs) with deep-link routing straight into the exact SWK App screen (e.g., `/e/leads/42`, `/withdrawals`, `/field-live`, `/chat?t=7`), strictly respecting each user's hardcoded role permissions!

---

## 11. Subsystem 6: Unified App Shell (Web + PWA + Capacitor Mobile), Full Company Ops Parity & `SWKPROPERTY.COM` Bridge

1. **Full Role-Scoped Company Operations Parity Inside the App (`SWKOS/src/web`):**
   - Because the Mobile/PWA App renders the unified `SWKOS` React workspace directly inside the mobile shell (responsive bottom bar + full **All SWK Apps** drawer/launcher), **every single company operation in SWKOS** is natively accessible inside the App—filtered strictly by the user's hardcoded tier:
     - **Command & Work:** Overview Dashboard, Deal Pipeline, Universal Approvals, Delete Bin (Owner), Daily Operations / Enterprise Master OS, Calendar, My Work, Tasks, Projects, No-Code Automations, Market Pulse.
     - **Inventory, Sales & Leasing:** New Submissions, Form A Mandates, Properties, Units, Listing Studio, Off-Plan, Viewings, Offers, Form F Sale Contracts, Escrow, Developer NOC, DLD Transfers, Deal Folders, Withdrawals, Leases & Ejari, Rent Schedules, PDC Cheques, Inspections, Handovers, Maintenance, Service Charges.
     - **CRM, Landlords & Accounting:** CRM Property Vault (Leadership only), My Assigned Deals (hard-masked), Leads, Phone Calls, WhatsApp, Client Email, Follow-Ups, Opportunities, Contacts, Campaigns, Mortgage Cases, Targets, Landlord Hub, Owner Statements, Invoices, Receipts, Commissions, Agent Payouts, Supplier Bills, Payments, Bank Matching, Profit & VAT.
     - **Compliance, HR, Field & Website:** KYC Checks, RERA Centre, Broker Cards (BRN), AML/goAML, Risk Cases, Trade Licences, File Vault, Staff List, Joining/Exit, Visas & IDs, Attendance, Leave, WPS Payroll, Leaderboard, Reception QR, Gate Logs, Field Visits & Live GPS Map, Daily Reports, Website Studio (`SWKPROPERTY.COM` sync & one-click deploy), Company Settings, Roles, Integrations, Backups & Audit Trail.
   - **Mobile Bottom Navigation + Quick Launcher:** 5 instant thumb-reach tabs (**Home / All Ops**, **Inside Chat** with live unread badge, **AI Brain**, **Utilities**, **Field / QR + SIP**) so staff jump in 1 tap to messaging, AI, tools, QR/GPS, or calling while keeping every permitted company operations module 1 tap away in Home.
2. **One Frontend, Three Surfaces (`SWKOS/src/web`):**
   - Responsive app layout with mobile bottom navigation bar (**Home / Inside / AI Brain / Utilities / Field-QR + SIP**) when on phone widths (`< 768px`) and full desktop workspace on larger screens.
   - Restored **installable PWA** (`public/manifest.webmanifest` + push-only `public/sw.js` that caches static `/assets/*` bundles only and **explicitly bypasses `/api/*`** so zero authenticated data ever persists in CacheStorage).
   - **Capacitor Multi-Platform Mobile Shell (`SWKOS/mobile/` — All-Cases Coverage):** wraps `SWKOS/dist/web` in Capacitor 7 across **all three targets**:
     1. **Native Android (Direct Sideload APK + Google Play AAB):** full Gradle build targets (`assembleRelease` APK + `bundleRelease` AAB) with Google Play-compliant foreground-service types (`location`, `phoneCall`, `microphone`), carrying forward `SWK_MOBILE`'s native hardening:
        - `FLAG_SECURE` (blocks screenshots/screen recording on Android)
        - Android Keystore AES-256-GCM session storage + EC P-256 hardware device key (`SwkSecure`)
        - **Local Biometric / Device-PIN UI Lock `[Architect's Call]`:** locks the UI behind biometric/PIN after **45s in background or 10 min idle** WITHOUT calling server logout, so active SIP calls, hours-long background Field GPS uploads, and WhatsApp push tap-to-open stay alive until `SESSION_HOURS`, explicit Sign Out, or remote device revocation!
        - Native Camera (QR + document scan), Background Geolocation foreground service (`SWK Field Duty Active`), FCM Push Notifications (`swk_messages` + `swk_calls_sos`), Android incoming-call full-screen wake (`ConnectionService`), WebRTC audio, and optional TLS SPKI pinning (`pins.json`) for `os.swk.properties`.
     2. **Installable Web PWA (Desktop + iPhone/Android fallback):** works instantaneously in Safari/Chrome with Web Push VAPID notifications, camera QR, utilities, AI Brain, Inside chat, and foreground SIP.
     3. **Native iOS Capacitor Project (`ios/` + Swift Plugin Bridge + GitHub Actions macOS CI):** includes Capacitor iOS configuration, Swift plugin scaffolding (`SwkSecure` Keychain + FaceID/TouchID, CoreLocation background duty, PushKit/CallKit + APNs/FCM token bridge, `Info.plist` privacy strings), and a GitHub Actions `macos-latest` build workflow—noting transparently that final `.ipa` signing/TestFlight builds execute on macOS/Xcode CI with an Apple Developer account since this local workstation runs Windows.
2. **`SWKPROPERTY.COM` Connection:**
   - Reads live synced listings (`website_listings` / `website_promotions` in SWKOS) + optional pull-sync from `SWKPROPERTY.COM` public JSON/API so all 20+ staff can search public inventory inside Unified Search, attach property brochures in AI Brain/Translator/Word Editor, and generate tracked client share links (`/l/<token>`) while keeping one-click `POST /api/website/deploy` restricted to Leadership.

---

## 12. Data Model Additions (Migration `017_swk_omni_superapp`)

All DDL written in SQLite syntax compatible with `ddl()` Postgres conversion in `src/server/schema.ts`:

1. **`ai_provider_routes`**: `id, label, provider_key, base_url, api_key_enc, model_id, lanes_json, tier ('free'|'tier1'|'local'), priority, zero_retention, rpm_limit, rpd_limit, enabled, cooldown_until, last_error, last_ok_at, req_today, tokens_today, stats_date, created_at, updated_at`
2. **`ai_conversations`** & **`ai_messages`**: strictly private per `user_id` (`id, user_id, title, mode, pinned, created_at, updated_at`; messages: `id, conversation_id, user_id, role, content, model_used, provider_used, tokens, pii_redacted, attachments_json, created_at`)
3. **`ai_usage_daily`**: `(user_id, usage_date)` unique — tracks per-user daily request & token totals for 20+ staff fair-share throttling
4. **`sip_extensions`**: `id, user_id UNIQUE, extension_no UNIQUE, sip_username, sip_password_enc, display_name, allow_direct_dial, active, updated_at`
5. **`staff_live_locations`**: `user_id PRIMARY KEY, employee_id, field_session_id, lat, lng, accuracy_m, speed_mps, heading, battery_pct, purpose, community, is_flagged, flag_reason, updated_at` (paired with existing `duty_location_batches` & `field_sessions`)
6. **`push_subscriptions`**: `id, user_id, device_id, channel ('web_push'|'fcm'|'apns'), endpoint_or_token UNIQUE, p256dh, auth_secret, user_agent, active, created_at, last_used_at`
7. **`staff_devices`, `sessions.device_id` & `users.role_grant_sig`:** add `device_id TEXT` to `sessions`, add `role_grant_sig TEXT` and `role_granted_by INTEGER` to `users`, and extend `staff_devices` (unifying `mobile_devices` dropped in `015`) with `platform, app_version, biometric_enabled, revoked_at, revoked_reason` while preserving all existing EC P-256 QR device approvals.
8. **`word_documents`**: `id, user_id, title, html_content, rtl, include_letterhead, include_seal, source_template_id, linked_entity, linked_id, created_at, updated_at, deleted_at` (strictly scoped to `user_id` unless shared/leadership).

---

## 13. Decisions Made vs. Left to the Builder

### Decided Here (Locked)
- **Architecture:** Approach 1 — Unified `SWKOS` backend & web app + single Capacitor/PWA shell built from `SWKOS/dist/web`.
- **RBAC Ceiling for 20+ Staff:** Elevated tiers (`Owner`, `Admin`, `Manager`) strictly hardcoded by email in code; staff #13–25+ hard-capped in code to non-elevated tiers (`Field Agent / Staff`, `Office Admin`, `HR`).
- **Existing Leak Remediation:** All 4 verified SWKOS leaks (AI tools/brief/hire, Global Search employees, `notify.ts` DB role check, mobile SSE auth) closed as Phase 0 before new feature rollout.
- **Omni-Route Provider Pool:** 8+ free OpenAI-compatible providers (`gemini`, `groq`, `openrouter`, `cloudflare`, `cerebras`, `sambanova`, `mistral`, `github_models`, `nvidia_nim`) + multi-key rotation + Tier-1/custom/Ollama slots + hardcoded PII redaction on non-zero-retention routes.
- **SIP/VoIP:** WebRTC `sip.js` softphone with plug-in Admin trunk & per-staff extension config + hard-masked Vault call isolation.
- **Live Map Engine:** Leaflet + OpenStreetMap (no paid map API dependency) locked strictly to Owner/Admin/Manager.
- **Messaging Push:** Dual-channel SSE (foreground + reconnect catch-up) + Web Push VAPID + FCM native push for backgrounded/locked phones.

### Left to the Builder (Implementation-Time Calls)
- Exact npm package versions for `docx`, `sip.js`, `web-push`, `leaflet`, and Capacitor 7 plugins (`@capacitor/camera`, `@capacitor/push-notifications`, `@capacitor-community/background-geolocation`).
- Exact UI component layout polish matching SWKOS's existing visual tokens (`DESIGN.md`, `swk.css`, `#121212` ink + `#51fec0` mint / SWK luxury accents).
- Internal SQL query indexing, chunking sizes for long document translation, and test fixture scaffolding.
- Sequencing of phased implementation plans (Phase 0 Security & RBAC → Phase 1 Omni-Route AI Brain → Phase 2 WhatsApp-Grade Inside & Push → Phase 3 Utility Suite [Word/PDF/OCR/Translator/Search/Calc] → Phase 4 SIP/VoIP Softphone → Phase 5 Camera QR & Live Field GPS + Capacitor Mobile Shell).

---

## 14. Verification & Zero-Leak Acceptance Gate

Every phase must pass automated tests (`npm run typecheck`, `npm test`, `npm run test:compliance`, plus a new **`tests/zero-leak-superapp.ts`** security suite) proving:
1. **Privilege Escalation Immunity:** Direct DB mutation assigning `role_id = Admin` to a Field Agent email or newly created staff #15 STILL resolves to `RESTRICTED_STAFF_PERMISSIONS` in `loadUser()` and returns `403` on `/api/admin/*`, `/api/crm-vault/*`, `/api/field-gps/live`, `/api/ai/brief`, `/api/ai/agents/hire`, and `/api/swk-ops/reception-token`.
2. **AI Brain Zero-Leak:** Calling `POST /api/omni-ai/chat` or `POST /api/ai/chat` as a Field Agent asking for invoices, employee visas, or Vault owner phones NEVER executes restricted tools and NEVER leaks unauthorized DB records; PII redaction strips `+971` phones and `784-` Emirates IDs before calling non-zero-retention free providers.
3. **Omni-Route Failover:** Simulated `429` / `503` on primary & secondary mock LLM routes transparently fails over to the 3rd route in `<200ms`, places failed routes in cooldown, and honors `Retry-After`.
4. **Search Zero-Leak:** `POST /api/search/unified` as a Field Agent returns zero employees, zero invoices, zero Vault rows, and zero other users' chats/documents.
5. **SIP Vault Isolation:** Initiating a Vault deal call as a Field Agent never returns raw owner phone numbers in HTTP responses, SIP headers, or call history.
6. **Field GPS Privacy & Anti-Spoof:** Field Agents get `403` on `/api/field-gps/live`; `is_mock: true` pings are rejected with `422`; impossible-speed pings are flagged.
7. **Inside WhatsApp Live Sync:** Two concurrent authenticated sessions exchange DMs/groups/attachments via SSE ticket auth with instant delivery, double-tick read receipts, missed-message replay (`?since_id=`), and Web Push dispatch when disconnected.
