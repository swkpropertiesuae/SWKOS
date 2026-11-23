# SWK Omni SuperApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `SWKOS` into the unified desktop + PWA + Capacitor Android/iOS **SWK Omni SuperApp** for 20+ staff with an adaptive multi-provider Omni-Route AI Brain, complete real estate utility suite (Word/PDF/OCR/Translator/Search/Calculators), SIP/VoIP softphone extension, Camera QR Attendance + anti-spoofed Live Field GPS Map, WhatsApp-grade `Inside` + all-company-ops live push notifications, and hardcoded zero-leak RBAC.

**Architecture:** All new backend engines, routes, and database tables live directly inside `SWKOS` (`src/server/`, migration `017_swk_omni_superapp`), enforcing one hardcoded RBAC authority (`src/shared/swk-staff-access.ts` + `src/server/auth.ts`) across REST, SSE, Push, AI tools, Search, SIP, and GPS. One React/Vite frontend (`src/web/`) serves desktop web, installable PWA (push-only Service Worker that never caches `/api/*`), and a Capacitor 7 mobile shell (`mobile/`) supporting Android sideload APK, Google Play AAB, and iOS/macOS CI builds while exposing 100% of role-permitted company operations.

**Tech Stack:** Node >=22, TypeScript, Fastify 5, Zod 4, SQLite (`better-sqlite3`) + PostgreSQL (`pgbridge.ts`), React 19, Vite 7, Tailwind CSS 4, TanStack Query 5, `docx`, `mammoth`, `pdf-lib`, `pdfjs-dist`, `tesseract.js`, `jsqr`, `sip.js`, `web-push`, `leaflet`, Capacitor 7 (`@capacitor/core`, `@capacitor/android`, `@capacitor/ios`, `@capacitor/camera`, `@capacitor/push-notifications`, `@capacitor-community/background-geolocation`).

**Spec:** [docs/superpowers/specs/2026-11-23-swk-omni-superapp-design.md](../specs/2026-11-23-swk-omni-superapp-design.md)

---

## Global Constraints

- **Node & Dual-DB:** Node `>=22.0.0`; all DDL in `src/server/schema.ts` MUST be written in SQLite syntax translatable by `ddl()` to PostgreSQL without dialect errors.
- **Hardcoded Elevation Ceiling:** ONLY the 3 canonical emails (`shabib@swk.properties`, `admin@swk.properties`, `haseeb@swk.properties`) may ever hold `Owner`, `Admin`, or `Manager` permissions, view/print Reception QR, open CRM Vault, or view other agents' live GPS. Non-hardcoded staff #13–25+ are hard-capped to `Field Agent / Staff` (default), `Office Admin`, or `HR` via `APP_SECRET` HMAC-signed `users.role_grant_sig`.
- **Zero-Leak AI & Privacy:** Non-zero-retention free LLM providers MUST receive OCR-first + PII-scrubbed text (`+971`/E.164 phones, `784-` Emirates IDs, passports, IBANs, emails, Vault refs masked); Confidential Mode & executive agents MUST fail closed if no `zero_retention = true` route is healthy.
- **Zero-Cache Security for PWA:** `public/sw.js` MUST NEVER cache any `/api/*` response; only static `/assets/*` bundles and push handlers live in the service worker.
- **Secret Encryption:** Every API key, SIP trunk/extension password, VAPID private key, and FCM service account MUST be AES-256-GCM encrypted (`encryptSecret`) and masked (`********`) in API responses.
- **Demo Isolation:** When `inDemo()` is true, all outbound LLM, Web Search, SIP, and Push calls remain disabled with safe deterministic responses.
- **CSP Hygiene:** Keep `scriptSrc: ["'self'"]` strict in `src/server/app.ts`; allow only required `wss:` (`connectSrc`) and `blob:` (`mediaSrc`) for WebRTC SIP, camera QR, and voice notes.
- **Existing CI Preservation:** `npm run typecheck`, `npm test`, `npm run test:compliance`, `tsx tests/ai-controls.ts`, `tsx tests/ocr.ts`, and `tsx tests/access-control.ts` MUST remain green after every task.

---

## Review Focus

1. **Direct SQLite/Postgres role tampering on staff #13–25+ (attempting to promote a field agent to `Admin` or `HR` via SQL without a valid HMAC `role_grant_sig`)** → `loadUser()` MUST forcibly downgrade effective permissions to `RESTRICTED_STAFF_PERMISSIONS` and log a `security_tamper` audit event *(pinned in Task 2)*.
2. **Simultaneous 429 rate-limit bursts across 20+ concurrent staff + `zero_retention` Confidential Mode with zero healthy private routes** → Omni-Route MUST rotate across keys/providers without user-visible failure for normal prompts, respect `Retry-After`, and strictly refuse fallback to training-enabled free routes in Confidential Mode *(pinned in Task 4)*.
3. **Network drop / elevator disconnect on mobile `Inside` chat & expired/replayed one-time SSE stream tickets** → SSE ticket MUST reject replay on 2nd use and expire after 30s; reconnecting with `?since_id=` MUST deliver all missed messages/receipts in order without duplicates *(pinned in Task 3 & Task 6)*.
4. **Malicious/corrupted uploads & prompt-injection strings in Word/PDF/Translator/Search** → HTML rendered from `.docx` MUST be sanitized against `<script>`/event handlers; restricted staff unified search MUST return zero hits for employees, invoices, CRM Vault, or other users' private conversations/Word docs *(pinned in Task 7)*.
5. **Mock GPS injection, stale/replayed Field Duty pings, and post-21:00 Dubai auto-expiry** → `is_mock: true` pings MUST return `422` + audit log; Leadership viewing historical closed trails without an emergency reason MUST trigger Control 3.10/7.03 audit logging; sessions active past 21:00 Dubai or 12h MUST auto-close *(pinned in Task 10)*.

---

## File Map Overview

- **Core Schema & Security:** `src/server/schema.ts`, `src/server/settings.ts`, `src/shared/swk-staff-access.ts`, `src/server/auth.ts`, `src/server/app.ts`, `src/server/notify.ts`, `src/server/routes/auth.ts`, `src/server/routes/admin.ts`, `src/server/routes/insights.ts`, `src/server/routes/integrations.ts`
- **Omni-Route AI Brain:** `src/server/ai/policy.ts`, `src/server/ai/tools.ts`, `src/server/ai/agents.ts`, `src/server/ai/omni-catalog.ts`, `src/server/ai/pii-shield.ts`, `src/server/ai/omni-router.ts`, `src/server/ai/llm.ts`, `src/server/routes/omni-ai.ts`, `src/web/pages/AiPage.tsx`, `src/web/pages/swk/OmniRouteAdminPanel.tsx`
- **WhatsApp-Grade Inside & All-Ops Push:** `src/server/integrations/push.ts`, `src/server/routes/push.ts`, `src/server/routes/chat.ts`, `public/sw.js`, `public/manifest.webmanifest`, `src/web/lib/chatLive.ts`, `src/web/components/ChatNotifier.tsx`, `src/web/components/LiveNotifications.tsx`, `src/web/pages/ChatPage.tsx`
- **Utility Suite:** `src/server/integrations/web-search.ts`, `src/server/routes/utilities.ts`, `src/server/routes/search-unified.ts`, `src/web/pages/swk/UtilitiesHubPage.tsx`, `src/web/pages/swk/WordStudioPage.tsx`, `src/web/pages/swk/DocumentToolsPage.tsx`, `src/web/pages/swk/TranslatorPage.tsx`, `src/web/pages/swk/UnifiedSearchPage.tsx`, `src/web/pages/swk/ToolkitPage.tsx`
- **SIP/VoIP Extension:** `src/server/routes/sip.ts`, `src/web/lib/sipClient.ts`, `src/web/components/SipSoftphoneDock.tsx`, `src/web/pages/swk/PhonePage.tsx`, `src/web/pages/swk/MyAssignedDealsPage.tsx`
- **Camera QR & Live Field GPS:** `src/server/routes/field-gps.ts`, `src/server/scheduler.ts`, `src/web/pages/swk/FieldDutyPage.tsx`, `src/web/pages/swk/FieldLiveMapPage.tsx`, `src/web/pages/swk/ReceptionQrPage.tsx`
- **Unified App Shell & Capacitor Mobile:** `src/web/components/Shell.tsx`, `src/web/App.tsx`, `src/web/swk/nav.ts`, `src/web/lib/mobileBridge.ts`, `mobile/` (Capacitor 7 Android APK/AAB + iOS Swift scaffolding), `.github/workflows/mobile-builds.yml`
- **Tests:** `tests/rbac-zero-leak.ts`, `tests/omni-router.ts`, `tests/push-chat-live.ts`, `tests/utilities-search.ts`, `tests/sip-vault.ts`, `tests/field-gps.ts`, `tests/zero-leak-superapp.ts`

---

### Task 1: Schema Migration `017_swk_omni_superapp` & Encrypted Settings Registry

**Files:**
- Modify: `src/server/schema.ts` (append migration `017_swk_omni_superapp` after `016_client_share_links`)
- Modify: `src/server/settings.ts` (add defaults + `SECRET_SETTINGS` entries for Omni-Route, Web Search, SIP/VoIP, Web Push VAPID, FCM, GPS PDPL retention, and mobile device approval toggle)
- Modify: `src/server/domain/business-data.ts` (include new transactional tables in business reset list while preserving settings/routes)
- Test: `tests/schema-017.ts`

**Interfaces:**
- Produces DB tables: `ai_provider_routes`, `ai_conversations`, `ai_messages`, `ai_usage_daily`, `sip_extensions`, `sip_vault_call_tokens`, `staff_live_locations`, `push_subscriptions`, `word_documents`; columns `sessions.device_id`, `users.role_grant_sig`, `users.role_granted_by`, `staff_devices.platform`, `staff_devices.app_version`, `staff_devices.biometric_enabled`, `staff_devices.revoked_at`, `staff_devices.revoked_reason`.
- Produces settings keys in `SETTING_DEFAULTS`: `ai_allow_nonvault_vision_free`, `ai_staff_daily_req_limit`, `ai_staff_rpm_limit`, `web_search_provider`, `web_search_api_key`, `web_search_searxng_url`, `sip_enabled`, `sip_ws_url`, `sip_domain`, `sip_outbound_proxy`, `sip_ice_servers`, `sip_caller_id_mode`, `sip_vault_bridge_prefix`, `sip_webhook_secret`, `vapid_public_key`, `vapid_private_key`, `fcm_service_account_json`, `push_hide_preview_global`, `mobile_require_device_approval`, `gps_retention_days`, `field_duty_auto_stop_hour`.
- Produces `SECRET_SETTINGS` additions: `web_search_api_key`, `sip_webhook_secret`, `vapid_private_key`, `fcm_service_account_json`.

- [ ] **Step 1: Write failing schema & settings test (`tests/schema-017.ts`)**
  Assert after `syncSchema()` that all 9 new tables exist, `columnsOf('sessions')` includes `device_id`, `columnsOf('users')` includes `role_grant_sig` and `role_granted_by`, `columnsOf('staff_devices')` includes `platform` and `revoked_at`, `publicSettings()` masks `sip_webhook_secret`, `vapid_private_key`, `fcm_service_account_json`, and `web_search_api_key` as `'********'` when set, and `ddl()` converts migration `017` cleanly for PostgreSQL (no untranslated `AUTOINCREMENT`).
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx tsx tests/schema-017.ts`
  Expected: FAIL — missing tables/columns/settings keys.
- [ ] **Step 3: Add migration `017_swk_omni_superapp` in `src/server/schema.ts` and settings keys in `src/server/settings.ts`**
  Use `CREATE TABLE IF NOT EXISTS` and idempotent `ALTER TABLE` guards (handling existing DBs cleanly on both SQLite and Postgres via `columnsOf()` inside `syncSchema()` for column additions on `sessions`, `users`, and `staff_devices`). Add `ai_conversations`, `ai_messages`, `ai_usage_daily`, `staff_live_locations`, `word_documents`, `sip_vault_call_tokens` to `business-data.ts` reset cleanup.
- [ ] **Step 4: Run test & existing typecheck**
  Run: `npx tsx tests/schema-017.ts && npm run typecheck`
  Expected: PASS with 0 errors.
- [ ] **Step 5: Commit**
  `git add src/server/schema.ts src/server/settings.ts src/server/domain/business-data.ts tests/schema-017.ts && git commit -m "feat(schema): add migration 017 and encrypted settings for SWK Omni SuperApp"`

---

### Task 2: Hardcoded 20+ Staff RBAC Ceiling, HMAC Role Grants & Phase 0 Zero-Leak Remediation

**Files:**
- Modify: `src/shared/swk-staff-access.ts` (add `NON_ELEVATED_ASSIGNABLE_ROLES`, `CANONICAL_ELEVATED_EMAILS`, `isElevatedCanonicalEmail()`, allowed new paths `/utilities/*`, `/phone`, `/field-duty`)
- Modify: `src/server/auth.ts` (add `signRoleGrant(userId, email, roleName)`, `verifyRoleGrant(...)`, tamper-proof clamping in `loadUser()`, `security_tamper` audit log)
- Modify: `src/server/routes/admin.ts` (sign `role_grant_sig` when Owner/Admin creates/updates non-elevated staff #13–25+; reject assigning `Owner`/`Admin`/`Manager`/`*` to any non-hardcoded email)
- Modify: `src/server/ai/policy.ts` (add `ROLE_AI_TOOL_ALLOWLIST`, `isToolAllowedForUser(user, toolName)`)
- Modify: `src/server/ai/tools.ts` (pass caller `user?: SessionUser` into `Tool.run`; add safe staff tools `market_pulse_lookup`, `my_assigned_deals_masked`, `my_attendance_status`, `my_daily_report_status`; keep `{ agent: 'check' }` compatibility for `tests/ai-controls.ts`)
- Modify: `src/server/ai/agents.ts` (thread `caller?: SessionUser` into `chatWithAgent()` & `loop()` and filter tools via `isToolAllowedForUser`)
- Modify: `src/server/routes/integrations.ts` (pass `req.user!` to `chatWithAgent`; gate `/api/ai/brief` with `canAccessCrmVault`; gate `/api/ai/agents/hire` and `/api/ai/agents/:id/run` with `canOpenEmployeeRecords`)
- Modify: `src/server/notify.ts` (resolve permissions via `loadUser(u.id)` + hardcoded functions instead of raw DB `roles.permissions`)
- Modify: `src/server/routes/insights.ts` (gate `employees` in `/api/search/global` with `canViewEmployeeRecords` and enforce `RESTRICTED_STAFF_ALLOWED_ENTITIES`)
- Test: `tests/rbac-zero-leak.ts`

**Interfaces:**
- Consumes: `users.role_grant_sig`, `users.role_granted_by` from Task 1; `APP_SECRET` / `secretKey()` from `settings.ts`.
- Produces:
  - `signRoleGrant(userId: number, email: string, roleName: 'HR' | 'Office Admin' | 'Staff (Attendance & General)'): string` in `src/server/auth.ts`
  - `verifyRoleGrant(userId: number, email: string, roleName: string, sig: string | null | undefined): boolean` in `src/server/auth.ts`
  - `canAccessFieldLiveMap(user): boolean` (strictly canonical 3 elevated emails) in `src/shared/swk-staff-access.ts`
  - `isToolAllowedForUser(user: SessionUser | null | undefined, toolName: string): boolean` in `src/server/ai/policy.ts`

- [ ] **Step 1: Write failing security regression test (`tests/rbac-zero-leak.ts`)**
  Include assertions covering **Review Focus #1** and all 4 Phase-0 leaks:
  1. Direct SQL `UPDATE users SET role_id = (SELECT id FROM roles WHERE name='Admin')` on a newly inserted staff #15 (`newagent15@swk.rent`) → `loadUser()` resolves `role_name === 'Staff (Attendance & General)'`, `permissions` equals `RESTRICTED_STAFF_PERMISSIONS`, and an `audit_log` row with `action='security_tamper'` is written.
  2. Direct SQL `UPDATE users SET role_id = (SELECT id FROM roles WHERE name='HR')` without valid `role_grant_sig` → downgraded to `Staff (Attendance & General)`.
  3. Owner/Admin creating staff #16 with valid `signRoleGrant(..., 'HR')` → resolves `HR_ROLE_PERMISSIONS` (`canViewEmployeeRecords` true, `canAccessCrmVault` false, `canAccessFieldLiveMap` false).
  4. `isToolAllowedForUser(fieldAgent, 'overdue_invoices') === false`, `isToolAllowedForUser(fieldAgent, 'business_snapshot') === false`, `isToolAllowedForUser(fieldAgent, 'expiring_documents') === false`, `isToolAllowedForUser(fieldAgent, 'lookup_listings') === true`, `isToolAllowedForUser(fieldAgent, 'my_assigned_deals_masked') === true`.
  5. HTTP test via `buildApp().inject()`: Field Agent gets `403` on `GET /api/ai/brief`, `POST /api/ai/agents/hire`, and `GET /api/search/global?q=...` returns zero `employees` rows.
  6. `notifyLeadership()` never notifies a tampered non-hardcoded user row whose DB `role_id` was altered to `Admin`.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx tsx tests/rbac-zero-leak.ts`
  Expected: FAIL on existing SWKOS leaks.
- [ ] **Step 3: Implement hardcoded ceiling, HMAC role grants, and all 4 leak remediations**
  Implement exact functions across `swk-staff-access.ts`, `auth.ts`, `admin.ts`, `policy.ts`, `tools.ts`, `agents.ts`, `integrations.ts`, `notify.ts`, and `insights.ts`. Export `signRoleGrant`/`verifyRoleGrant` using `crypto.createHmac('sha256', ...)` + `crypto.timingSafeEqual`.
- [ ] **Step 4: Run security & existing control tests**
  Run: `npx tsx tests/rbac-zero-leak.ts && npx tsx tests/ai-controls.ts && npm run typecheck`
  Expected: PASS on all suites.
- [ ] **Step 5: Commit**
  `git add src/shared/swk-staff-access.ts src/server/auth.ts src/server/notify.ts src/server/routes/admin.ts src/server/routes/insights.ts src/server/routes/integrations.ts src/server/ai/policy.ts src/server/ai/tools.ts src/server/ai/agents.ts tests/rbac-zero-leak.ts && git commit -m "fix(security): enforce hardcoded 20+ staff RBAC ceiling, HMAC grants, and close AI/search/notify leaks"`

---

### Task 3: Hardened Mobile Bearer Sessions, Unified EC P-256 `staff_devices` & One-Time SSE Stream Tickets

**Files:**
- Modify: `src/server/auth.ts` (update `createSession(userId, ip, ua, deviceId?)`, `destroyDeviceSessions(deviceId)`, add `issueStreamTicket(userId)` & `consumeStreamTicket(ticket)` with 30s TTL + single-use deletion)
- Modify: `src/server/app.ts` (accept `X-SWK-Session` header with `X-SWK-Client: mobile`, verify `staff_devices` is not `Blocked`/`revoked_at`, accept `?ticket=` on `/api/chat/stream`, `/api/notifications/stream`, `/api/field-gps/stream`; update CSP `connectSrc` to include `wss:` and `mediaSrc` to include `blob:`)
- Modify: `src/server/routes/insights.ts:247` (ensure `/api/notifications/stream` works cleanly with ticket-authenticated mobile sessions as well as cookies)
- Modify: `src/server/routes/auth.ts` (on `POST /api/auth/login`, when `x-swk-client === 'mobile'`, require/register `device_pub`/`device_id`, honor `mobile_require_device_approval`, return `{ session_token, device_id, device_status }`; add `POST /api/auth/stream-ticket`; add `POST /api/auth/devices/:id/revoke` for Owner/Admin)
- Modify: `src/server/routes/swk-ops.ts` (when Owner/Manager blocks a device in `/api/swk-ops/attendance-control/device/:id`, also call `destroyDeviceSessions` + deactivate its `push_subscriptions`)
- Test: `tests/mobile-auth-sse.ts`

**Interfaces:**
- Consumes: `sessions.device_id`, `staff_devices.revoked_at` from Task 1.
- Produces:
  - `issueStreamTicket(userId: number): { ticket: string; expires_in_s: number }` in `src/server/auth.ts`
  - `consumeStreamTicket(ticket: string): SessionUser | null` in `src/server/auth.ts`
  - `destroyDeviceSessions(deviceId: string): number` in `src/server/auth.ts`
  - HTTP `POST /api/auth/stream-ticket` → `{ ticket, expires_in_s: 30 }`

- [ ] **Step 1: Write failing test (`tests/mobile-auth-sse.ts`)**
  Cover **Review Focus #3 (ticket replay/expiry)**:
  1. Mobile login with `x-swk-client: mobile` returns `session_token` usable via `x-swk-session` header on `GET /api/auth/me` and `POST` mutations.
  2. `POST /api/auth/stream-ticket` issues a ticket; 1st `consumeStreamTicket(ticket)` returns the user, 2nd replay returns `null`, and an expired ticket (>30s) returns `null`.
  3. Blocking/revoking a device immediately invalidates its `x-swk-session` token (`401`) without invalidating a separate desktop cookie session for the same user.
  4. When `mobile_require_device_approval = true`, an unapproved mobile device login returns `403` with clear pending-approval message.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx tsx tests/mobile-auth-sse.ts`
  Expected: FAIL.
- [ ] **Step 3: Implement mobile session auth, device revocation cascade, and one-time SSE tickets**
  Update `auth.ts`, `app.ts`, `routes/auth.ts`, and `routes/swk-ops.ts`. Keep cookie auth unchanged for desktop web; never accept session tokens in query strings—ONLY single-use 30s opaque tickets on the three SSE endpoints.
- [ ] **Step 4: Run test & typecheck**
  Run: `npx tsx tests/mobile-auth-sse.ts && npm run typecheck`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git add src/server/auth.ts src/server/app.ts src/server/routes/auth.ts src/server/routes/swk-ops.ts tests/mobile-auth-sse.ts && git commit -m "feat(auth): add hardened mobile session binding, device revocation, and single-use SSE tickets"`

---

### Task 4: Omni-Route AI Brain Engine — Multi-Provider Free Pool, Tier-1/Local, PII Shield & Streaming API

**Files:**
- Create: `src/server/ai/omni-catalog.ts` (preset definitions for all 9 free providers — `gemini`, `groq`, `openrouter`, `cloudflare`, `cerebras`, `sambanova`, `mistral`, `github_models`, `nvidia_nim` — plus Tier-1/local presets `openai`, `anthropic_via_or`, `xai`, `deepseek`, `ollama`, `custom`)
- Create: `src/server/ai/pii-shield.ts` (`scrubSensitivePii(text)` & `restoreScrubbedPii(text, map)` covering UAE `+971`/E.164 phones, `784-` Emirates IDs, passports, UAE IBANs, emails, and Vault refs)
- Create: `src/server/ai/omni-router.ts` (multi-key pool loader, lane selector `reasoning|fast|vision|translate|search|audio`, sliding-window RPM/RPD/EWMA health tracker, 429/`Retry-After`/daily-quota circuit breaker, up to 6-hop failover, per-user fair-share limiter, `omniChat()` & `omniChatStream()`)
- Modify: `src/server/ai/llm.ts` (delegate `chat()` and `aiConfigured()` to `omni-router.ts` while retaining legacy primary/fallback settings as automatic implicit routes; default executive/agent calls to `confidential: true` / `zero_retention` enforcement)
- Create: `src/server/routes/omni-ai.ts` (register in `src/server/app.ts`):
  - Staff endpoints (all authenticated non-portal staff): `GET /api/omni-ai/conversations`, `POST /api/omni-ai/conversations`, `DELETE /api/omni-ai/conversations/:id`, `GET /api/omni-ai/conversations/:id/messages`, `POST /api/omni-ai/chat/stream` (SSE streaming + optional file upload via OCR-first pipeline), `GET /api/omni-ai/status` (safe non-secret capabilities & user's own remaining daily quota)
  - Owner/Admin ONLY endpoints (`canOpenEmployeeRecords`): `GET /api/omni-ai/routes`, `POST /api/omni-ai/routes`, `PATCH /api/omni-ai/routes/:id`, `DELETE /api/omni-ai/routes/:id`, `POST /api/omni-ai/routes/:id/test`, `POST /api/omni-ai/routes/:id/reset-cooldown`, `GET /api/omni-ai/health` (live pool dashboard + per-staff usage)
- Test: `tests/omni-router.ts`

**Interfaces:**
- Consumes: `ai_provider_routes`, `ai_conversations`, `ai_messages`, `ai_usage_daily` from Task 1; `extractText` from `src/server/ocr.ts`; `isToolAllowedForUser` from Task 2.
- Produces:
  - `omniChat(req: OmniRequest): Promise<OmniResult>` in `src/server/ai/omni-router.ts`
  - `omniChatStream(req: OmniRequest, onToken: (delta: string) => void): Promise<OmniResult>` in `src/server/ai/omni-router.ts`
  - `scrubSensitivePii(input: string): { text: string; map: Map<string, string>; redactedCount: number }` in `src/server/ai/pii-shield.ts`
  - `OMNI_PRESETS` in `src/server/ai/omni-catalog.ts`

- [ ] **Step 1: Write failing Omni-Route & PII Shield test (`tests/omni-router.ts`)**
  Spin up a local Node `http.createServer` mock LLM gateway and test **Review Focus #2**:
  1. `scrubSensitivePii()` redacts `+971 50 123 4567`, `784-1990-1234567-1`, `AE070331234567890123456`, and `client@example.com`, and restores them cleanly on `restoreScrubbedPii()`.
  2. Pool with 3 routes where Route 1 returns `429` (`Retry-After: 120`), Route 2 returns `503`, Route 3 returns `200` → `omniChat()` succeeds transparently on Route 3 in 1 user call, marks Route 1 in cooldown for >=120s, and subsequent call skips Route 1 immediately.
  3. Request with `confidential: true` when ONLY `zero_retention = 0` routes exist → fails closed with explicit zero-retention error (never sends prompt to non-zero-retention mock server).
  4. Per-user daily quota enforcement: exceeding `ai_staff_daily_req_limit` returns `429` for Field Staff while Owner remains exempt.
  5. Conversation isolation: User B gets `404`/`403` attempting to read or delete User A's `ai_conversations`.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx tsx tests/omni-router.ts`
  Expected: FAIL — modules not found.
- [ ] **Step 3: Implement `omni-catalog.ts`, `pii-shield.ts`, `omni-router.ts`, `routes/omni-ai.ts`, and wire `llm.ts` + `app.ts`**
  Ensure OCR-first extraction runs for uploaded attachments before hitting non-zero-retention routes, and non-Vault vision is permitted ONLY when `ai_allow_nonvault_vision_free` is enabled and route has `vision` lane + not Confidential Mode.
- [ ] **Step 4: Run tests & typecheck**
  Run: `npx tsx tests/omni-router.ts && npx tsx tests/ai-controls.ts && npm run typecheck`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git add src/server/ai/ src/server/routes/omni-ai.ts src/server/app.ts tests/omni-router.ts && git commit -m "feat(ai): implement Omni-Route multi-provider pool, PII shield, and streaming AI Brain API"`

---

### Task 5: AI Brain Workbench UI & Owner/Admin Omni-Route Health Console

**Files:**
- Create: `src/web/pages/swk/OmniRouteAdminPanel.tsx` (Owner/Admin panel: add/edit/delete/test multiple keys per provider from `OMNI_PRESETS` + Tier-1/Ollama custom slots, toggle `zero_retention` / `ai_allow_nonvault_vision_free`, live green/amber/red health & cooldown timers, per-staff 20+ usage table)
- Modify: `src/web/pages/AiPage.tsx` (upgrade into full ChatGPT-style SWK AI Brain workbench: left private conversation sidebar, mode selector `Auto | Deep Reasoning | Fast | Translate | Search-Grounded`, Confidential Mode toggle for Leadership, file/image/PDF/Word attachment picker, streaming markdown output, transparent model + PII-Shield badge, role-gated Agents/Approvals tabs, and Admin Omni-Route tab)
- Modify: `src/web/pages/IntegrationsPage.tsx` (link/embed Omni-Route Pool manager under AI section)

**Interfaces:**
- Consumes: `/api/omni-ai/*` endpoints from Task 4.
- Produces: Complete `/ai` workspace UI and reusable `OmniRouteAdminPanel`.

- [ ] **Step 1: Implement `OmniRouteAdminPanel.tsx` and upgrade `AiPage.tsx` + `IntegrationsPage.tsx`**
  Ensure restricted staff NEVER see the Agents, Approvals, Confidential Mode, or Omni-Route Admin tabs; display clear badge when PII Shield redacted data before sending to a free provider.
- [ ] **Step 2: Build & verify TypeScript + Vite bundle**
  Run: `npm run typecheck && npm run build:web`
  Expected: PASS with zero TypeScript or Vite bundling errors.
- [ ] **Step 3: Commit**
  `git add src/web/pages/AiPage.tsx src/web/pages/swk/OmniRouteAdminPanel.tsx src/web/pages/IntegrationsPage.tsx && git commit -m "feat(ui): build SWK AI Brain streaming workbench and Owner Omni-Route pool console"`

---

### Task 6: WhatsApp-Grade `Inside` Live Messaging & All-Company-Ops Real-Time Push Engine

**Files:**
- Install dep: `web-push` + `@types/web-push`
- Create: `src/server/integrations/push.ts` (auto-generate & encrypt VAPID keypair on demand; dispatch Web Push via `web-push`; dispatch FCM HTTP v1 using OAuth2 JWT from `fcm_service_account_json` when configured; respect `push_hide_preview_global`, thread `muted`, and active foreground thread suppression; clean up HTTP 404/410 dead subscriptions)
- Create: `src/server/routes/push.ts` (register in `src/server/app.ts`: `GET /api/push/vapid-key`, `POST /api/push/subscribe`, `DELETE /api/push/unsubscribe`, `POST /api/push/test`)
- Modify: `src/server/routes/chat.ts` (support `?since_id=` catch-up on `/api/chat/stream`; add `POST /api/chat/active-thread` for smart push suppression; add `kind='location'` live Dubai pin messages; trigger `dispatchPushToUser()` on every new DM/group/automation message for offline/background members; keep portal `party_id` 100% blocked)
- Modify: `src/server/notify.ts` (trigger `dispatchPushToUser()` on every company-ops `notify()` call across all modules — approvals, recycle bin, withdrawals, leads, viewings, PDC, Ejari/visa expiry, daily reports, attendance alerts, SOS — using Android channel `swk_ops_alerts` / `swk_calls_sos` with deep-link URL)
- Modify: `public/sw.js` & create `public/manifest.webmanifest` & update `index.html` (restore installable PWA manifest + push-capable Service Worker that handles `push` & `notificationclick` deep-linking to `/chat?t=...` or ops routes, and **explicitly never caches `/api/*`**)
- Modify: `src/web/lib/chatLive.ts`, `src/web/components/ChatNotifier.tsx`, `src/web/components/LiveNotifications.tsx`, `src/web/pages/ChatPage.tsx` (use `/api/auth/stream-ticket` on mobile, auto-reconnect with `?since_id=`, floating WhatsApp-style heads-up banner with **inline Quick Reply**, vibration + two-note chime, live OS badge via `navigator.setAppBadge`, Share Live Location pin + Share Utility Document in chat, and IndexedDB offline send queue with retry)
- Test: `tests/push-chat-live.ts`

**Interfaces:**
- Consumes: `push_subscriptions` from Task 1; `issueStreamTicket`/`consumeStreamTicket` from Task 3.
- Produces:
  - `dispatchPushToUser(userId: number, payload: PushPayload): Promise<{ sent: number; failed: number }>` in `src/server/integrations/push.ts`
  - `PushPayload = { title: string; body: string; url: string; tag: string; channel: 'swk_messages' | 'swk_ops_alerts' | 'swk_calls_sos'; threadId?: number; silent?: boolean }`
  - `POST /api/push/subscribe`, `GET /api/push/vapid-key`, `POST /api/chat/active-thread`

- [ ] **Step 1: Write failing live chat & push dispatch test (`tests/push-chat-live.ts`)**
  Cover **Review Focus #3 (missed-message catch-up + push suppression + privacy mode)**:
  1. Register a Web Push subscription and an FCM token for User B; send DM from User A → verify push dispatcher fires with `channel: 'swk_messages'` and deep link `/chat?t=<tid>`.
  2. When User B marks thread `<tid>` active via `POST /api/chat/active-thread`, sending a DM suppresses external push.
  3. When `push_hide_preview_global = true`, push body is `"New message in SWK Inside"` (zero message body leaked).
  4. Connecting to `/api/chat/stream?ticket=<t>&since_id=<m1>` replays missed messages `m2, m3` in ascending ID order without duplicating `m1`.
  5. Calling `notify(userB, 'Approval needed', 'Withdrawal #4', '/withdrawals', 'approval')` dispatches an `swk_ops_alerts` push to User B; portal user calling `/api/chat/*` or `/api/push/*` gets `403`.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx tsx tests/push-chat-live.ts`
  Expected: FAIL.
- [ ] **Step 3: Install `web-push` and implement backend push dispatcher, chat upgrades, `notify.ts` hook, PWA `sw.js`, and WhatsApp-grade UI**
  Ensure `public/sw.js` explicitly skips any request whose URL starts with `/api/`.
- [ ] **Step 4: Run tests & build**
  Run: `npx tsx tests/push-chat-live.ts && npm run typecheck && npm run build:web`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git add package.json package-lock.json public/ index.html src/server/integrations/push.ts src/server/routes/push.ts src/server/routes/chat.ts src/server/notify.ts src/server/app.ts src/web/ tests/push-chat-live.ts && git commit -m "feat(messaging): upgrade Inside and all-ops alerts with WhatsApp-grade live push, quick-reply, and reconnect catch-up"`

---

### Task 7: Real Estate Utility Suite Backend — Word `.docx` Editor/Converter, Upgraded PDF/OCR, Translator & Unified Role-Scoped Search

**Files:**
- Install dep: `docx`
- Create: `src/server/integrations/web-search.ts` (pluggable live web search: `duckduckgo` zero-key default + `tavily` + `brave` + `searxng` configurable in Settings; strict timeout, HTML sanitization, demo-mode guard)
- Create: `src/server/routes/utilities.ts` (register in `src/server/app.ts`):
  - Word CRUD (`GET/POST/PUT/DELETE /api/utilities/word`, strictly scoped `WHERE user_id = req.user.id` unless leadership viewing shared doc)
  - Word import/export/convert (`POST /api/utilities/word/import-docx` via `mammoth` + `sanitize-html`, `POST /api/utilities/word/export-docx` via `docx`, `POST /api/utilities/word/export-pdf` via existing PDF renderer, `POST /api/utilities/convert` supporting `.pdf`/image OCR → `.docx`, `.docx` → `.pdf`/`.txt`)
  - PDF Watermark (`POST /api/utilities/pdf/watermark` via `pdf-lib`)
  - Dedicated UAE Real Estate Translator (`POST /api/utilities/translate` + `POST /api/utilities/translate-document` with hardcoded UAE real-estate glossary lock, tone presets, and Omni-Route `translate` lane + PII shield)
- Create: `src/server/routes/search-unified.ts` (register in `src/server/app.ts`):
  - `POST /api/search/unified` supporting scopes `internal`, `website` (`website_listings` & `website_promotions` synced with `SWKPROPERTY.COM`, returning public `/l/<token>` / `swkpropertiesuae.com/properties/<slug>` share links), `market` (`DUBAI_AREAS_24`, communities, developers), `web` (`web-search.ts`), plus optional `synthesize: boolean` via Omni-Route `search` lane (sending ONLY public web snippets unless Leadership Confidential Mode).
  - Hardcoded zero-leak internal SQL filters per role tier (Field Agent NEVER sees Finance, CRM Vault, Employees, or other users' private chats/Word docs).
- Test: `tests/utilities-search.ts`

**Interfaces:**
- Consumes: `word_documents` from Task 1; `omniChat` & `scrubSensitivePii` from Task 4; `extractText` from `src/server/ocr.ts`; `canAccessCrmVault`, `canViewEmployeeRecords`, `isRestrictedStaffUser` from Task 2.
- Produces: `/api/utilities/*` and `/api/search/unified`.

- [ ] **Step 1: Write failing utilities & zero-leak search test (`tests/utilities-search.ts`)**
  Cover **Review Focus #4**:
  1. `POST /api/utilities/word/import-docx` strips `<script>alert(1)</script>` / `onerror=` payloads cleanly.
  2. `POST /api/utilities/word/export-docx` produces a valid ZIP/OOXML `.docx` buffer (starts with `PK` magic bytes, re-extractable by `mammoth` containing the original heading & Arabic RTL text).
  3. `POST /api/utilities/pdf/watermark` returns a valid `%PDF-` buffer.
  4. `POST /api/search/unified` as a Field Agent returns matching `website_listings`, `DUBAI_AREAS_24`, and own `word_documents`, while returning **ZERO** rows for `employees`, `invoices`, `crm_vault_properties`, or another user's `word_documents`.
  5. `POST /api/utilities/translate` validates language codes, injects UAE statutory glossary terms (`Ejari`, `Oqood`, `Form F`, `RERA`), and scrubs PII before free routes.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx tsx tests/utilities-search.ts`
  Expected: FAIL.
- [ ] **Step 3: Install `docx` and implement `web-search.ts`, `routes/utilities.ts`, `routes/search-unified.ts`, register in `app.ts`**
- [ ] **Step 4: Run tests & typecheck**
  Run: `npx tsx tests/utilities-search.ts && npm run typecheck`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git add package.json package-lock.json src/server/integrations/web-search.ts src/server/routes/utilities.ts src/server/routes/search-unified.ts src/server/app.ts tests/utilities-search.ts && git commit -m "feat(utilities): add Word docx editor/converter, PDF tools, UAE translator, and role-scoped hybrid search API"`

---

### Task 8: Real Estate Utility Suite UI — Word Studio, Upgraded PDF/OCR, Translator, Unified Search & Extended Calculators

**Files:**
- Create: `src/web/pages/swk/UtilitiesHubPage.tsx` (unified tabbed hub at `/utilities` linking Word Studio, PDF & OCR, Translator, Search Engine, UAE Calculators & Converters, Public QR Generator, and Field Day Pack)
- Create: `src/web/pages/swk/WordStudioPage.tsx` (rich editor with RTL Arabic toggle, letterhead/seal toggle, open `.docx` or 158 Letter Studio template, inline AI Assist, one-click export `.docx`/`.pdf`/`.txt` or share to `Inside`)
- Create: `src/web/pages/swk/TranslatorPage.tsx` (two-pane EN/AR/HI/UR/RU/ZH/FR/ES/FA translator + document upload translation + UAE real-estate glossary toggle + tone presets + copy/TTS/export `.docx`/share to `Inside`)
- Create: `src/web/pages/swk/UnifiedSearchPage.tsx` (hybrid search across All / SWK Internal / SWKPROPERTY.COM / Dubai Market / Live Web + AI synthesized brief with citations + one-click share link/shortlist)
- Modify: `src/web/pages/swk/DocumentToolsPage.tsx` (add Camera Multi-Page Scan to PDF, PDF-to-Word `.docx`, PDF Watermark, and handoff buttons to Word Studio / Translator / AI Brain)
- Modify: `src/web/pages/swk/ToolkitPage.tsx` (add Area/Currency converter tab, PDC Cheque Schedule tab, and Branded Public QR Generator rejecting `SWK1.`/`SWK2.` reception prefixes)

**Interfaces:**
- Consumes: `/api/utilities/*`, `/api/search/unified` from Task 7; `/api/ocr/extract`.
- Produces: Routes `/utilities`, `/utilities/word`, `/utilities/translator`, `/utilities/search`, upgraded `/document-tools` & `/toolkit`.

- [ ] **Step 1: Implement all 4 new utility pages and upgrade `DocumentToolsPage.tsx` & `ToolkitPage.tsx`**
- [ ] **Step 2: Verify TypeScript & Vite production build**
  Run: `npm run typecheck && npm run build:web`
  Expected: PASS with zero errors.
- [ ] **Step 3: Commit**
  `git add src/web/pages/swk/UtilitiesHubPage.tsx src/web/pages/swk/WordStudioPage.tsx src/web/pages/swk/TranslatorPage.tsx src/web/pages/swk/UnifiedSearchPage.tsx src/web/pages/swk/DocumentToolsPage.tsx src/web/pages/swk/ToolkitPage.tsx && git commit -m "feat(ui): add Word Studio, UAE Translator, Unified Search, camera PDF scan, and extended calculators"`

---

### Task 9: SIP / VoIP Softphone Extension & Dual Masked-Vault Protocol

**Files:**
- Install dep: `sip.js`
- Create: `src/server/routes/sip.ts` (register in `src/server/app.ts`):
  - Staff endpoints: `GET /api/sip/my-config` (returns caller's own extension + decrypted password only for caller's own session, or `{ configured: false }`), `GET /api/sip/directory` (internal colleague extension names/numbers only), `POST /api/sip/vault-call/:propertyId` (Dual mode: default `initiateMaskedBridgeCall` OR 60s single-use `vt_<hex>` token dialing `<sip_vault_bridge_prefix><token>@<sip_domain>`), `POST /api/sip/calls/log`, `GET /api/sip/calls` (own calls for staff; all calls for Leadership)
  - Admin endpoints (`canOpenEmployeeRecords`): `GET/PUT /api/sip/admin/extensions`, `DELETE /api/sip/admin/extensions/:userId`
  - Public PBX-authenticated webhooks (redacted in `app.ts` request logger): `POST /api/public/sip/:secret/resolve-vault-token` (single-use token → E.164 owner number, strictly server-to-PBX), `POST /api/public/sip/:secret/incoming-wake` (dispatches high-priority `swk_calls_sos` push to callee's devices)
- Modify: `src/server/app.ts` (redact `/api/public/sip/:secret/` in `redactUrl()`)
- Create: `src/web/lib/sipClient.ts` (thin wrapper over `sip.js` `UserAgent` + `Inviter` + `Invitation` managing WebRTC audio, registration status, DTMF, mute, hold, blind/attended transfer, and graceful `Not Configured` state when SIP credentials aren't entered yet)
- Create: `src/web/components/SipSoftphoneDock.tsx` (persistent floating call widget mounted inside `Shell.tsx` so calls stay alive across page navigation)
- Create: `src/web/pages/swk/PhonePage.tsx` (`/phone` full dialpad, colleague extension directory, call history, audio device selector, and Admin SIP Trunk + Extension setup tab for Owner/Admin)
- Modify: `src/web/pages/swk/MyAssignedDealsPage.tsx` (wire Vault Call button to `/api/sip/vault-call/:propertyId` so agents can call via SIP masked token or Twilio bridge without ever seeing raw owner phone)
- Test: `tests/sip-vault.ts`

**Interfaces:**
- Consumes: `sip_extensions`, `sip_vault_call_tokens` from Task 1; `dispatchPushToUser` from Task 6; `initiateMaskedBridgeCall` from `crm-vault.ts`.
- Produces: `/api/sip/*`, `/api/public/sip/:secret/*`, `SipSoftphoneDock`, `/phone`.

- [ ] **Step 1: Write failing SIP & Masked Vault isolation test (`tests/sip-vault.ts`)**
  1. Staff A calling `GET /api/sip/my-config` sees only Staff A's extension; gets `403` on `/api/sip/admin/extensions`.
  2. When `sip_vault_bridge_prefix` is set, Field Agent calling `POST /api/sip/vault-call/:propertyId` receives `{ mode: 'sip_token', dial_uri: '99vt_...@pbx.local' }` — assert response body does **NOT** contain the raw owner phone number anywhere.
  3. PBX calling `POST /api/public/sip/:secret/resolve-vault-token` with valid secret returns the owner's E.164 number once; 2nd replay returns `404`; invalid secret returns `403`.
  4. PBX calling `POST /api/public/sip/:secret/incoming-wake` triggers an `swk_calls_sos` push to the target extension's user.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx tsx tests/sip-vault.ts`
  Expected: FAIL.
- [ ] **Step 3: Install `sip.js`, implement `routes/sip.ts`, `sipClient.ts`, `SipSoftphoneDock.tsx`, `PhonePage.tsx`, and wire `MyAssignedDealsPage.tsx` + `app.ts`**
- [ ] **Step 4: Run tests & build**
  Run: `npx tsx tests/sip-vault.ts && npm run typecheck && npm run build:web`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git add package.json package-lock.json src/server/routes/sip.ts src/server/app.ts src/web/lib/sipClient.ts src/web/components/SipSoftphoneDock.tsx src/web/pages/swk/PhonePage.tsx src/web/pages/swk/MyAssignedDealsPage.tsx tests/sip-vault.ts && git commit -m "feat(sip): add WebRTC SIP/VoIP softphone extension, PBX wake webhook, and zero-leak Vault dialing"`

---

### Task 10: Camera QR Attendance + Anti-Spoof Live Field GPS Tracking, Control 3.10/7.03 Audit & Leadership Live Map

**Files:**
- Install dep: `leaflet` + `@types/leaflet`
- Create: `src/server/routes/field-gps.ts` (register in `src/server/app.ts`):
  - Agent endpoints (any authenticated staff): `POST /api/field-gps/sessions/start`, `POST /api/field-gps/pings` (batch ingestion w/ `idempotency_key`, rejects `is_mock: true` with `422` + audit log, rejects `accuracy_m > 150`, runs `gpsFlags()`, updates `duty_location_batches` + `staff_live_locations`, emits live SSE event), `POST /api/field-gps/sessions/stop`, `POST /api/field-gps/sos` (instant leadership SSE + `swk_calls_sos` push), `GET /api/field-gps/my-session`
  - Leadership ONLY endpoints (`canAccessFieldLiveMap` — exact 3 canonical accounts): `GET /api/field-gps/live` (writes immutable `location_access_logs` entry), `GET /api/field-gps/stream` (live SSE pin updates), `GET /api/field-gps/sessions/:id/trail` (logs to `location_access_logs`; requires written `reason` + compliance alert if closed historical/off-hours session)
  - Scheduler helpers exported: `autoExpireFieldSessions()` (auto-closes active sessions past 21:00 Asia/Dubai or >12h + sends 19:30 reminder push), `purgeOldGpsBatches()` (deletes `duty_location_batches` older than `gps_retention_days`, default 90)
- Modify: `src/server/scheduler.ts` (wire `autoExpireFieldSessions()` on hourly/15-min tick and `purgeOldGpsBatches()` nightly)
- Create: `src/web/pages/swk/FieldDutyPage.tsx` (`/field-duty` — agent's Start/Stop Field Duty toggle, live GPS accuracy/battery/ping badge, SOS panic button, own trail preview, quick link to Camera QR Check-In & Daily Report)
- Create: `src/web/pages/swk/FieldLiveMapPage.tsx` (`/field-live` — Owner/Admin/Manager ONLY Leaflet + OpenStreetMap live map of active field agents, clickable route polyline trail, spoof/SOS warning badges, 1-click Inside Chat & SIP Call buttons)
- Modify: `src/web/pages/swk/ReceptionQrPage.tsx` (add mobile Capacitor camera bridge fallback + quick link back to Field Duty)
- Test: `tests/field-gps.ts`

**Interfaces:**
- Consumes: `staff_live_locations`, `duty_location_batches`, `field_sessions`, `location_access_logs`; `canAccessFieldLiveMap` from Task 2; `gpsFlags` from `attendance-security.ts`; `dispatchPushToUser` from Task 6.
- Produces: `/api/field-gps/*`, `autoExpireFieldSessions()`, `purgeOldGpsBatches()`, `/field-duty`, `/field-live`.

- [ ] **Step 1: Write failing GPS anti-spoof, privacy & PDPL test (`tests/field-gps.ts`)**
  Cover **Review Focus #5**:
  1. Field Agent starts duty → posts valid ping → `GET /api/field-gps/my-session` shows active session & pin.
  2. Field Agent posts `is_mock: true` ping → rejected `422` and logs `gps_spoof_attempt` audit entry.
  3. Field Agent calling `GET /api/field-gps/live` or `GET /api/field-gps/sessions/:otherId/trail` → `403 Forbidden`.
  4. Owner calling `GET /api/field-gps/live` → `200` with active agent pin AND inserts an immutable row in `location_access_logs`.
  5. Owner calling `GET /api/field-gps/sessions/:closedOldId/trail` without `reason` → `400`; with `reason` → `200` + logs off-hours access.
  6. `autoExpireFieldSessions()` closes sessions older than 12 hours; `purgeOldGpsBatches()` deletes batches older than 90 days while retaining `field_sessions` summary row.
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx tsx tests/field-gps.ts`
  Expected: FAIL.
- [ ] **Step 3: Install `leaflet`, implement `routes/field-gps.ts`, `scheduler.ts` jobs, `FieldDutyPage.tsx`, `FieldLiveMapPage.tsx`, and update `ReceptionQrPage.tsx`**
- [ ] **Step 4: Run tests & build**
  Run: `npx tsx tests/field-gps.ts && npm run typecheck && npm run build:web`
  Expected: PASS.
- [ ] **Step 5: Commit**
  `git add package.json package-lock.json src/server/routes/field-gps.ts src/server/scheduler.ts src/server/app.ts src/web/pages/swk/FieldDutyPage.tsx src/web/pages/swk/FieldLiveMapPage.tsx src/web/pages/swk/ReceptionQrPage.tsx tests/field-gps.ts && git commit -m "feat(field-gps): add anti-spoof live field GPS tracking, Control 3.10 audit, PDPL purge, and Leadership map"`

---

### Task 11: Unified Mobile/Desktop App Shell, Full Company Ops Mobile Nav & Capacitor Android (APK/AAB) + iOS Scaffolding

**Files:**
- Create: `src/web/lib/mobileBridge.ts` (unified Capacitor / Web bridge: native Keystore/Keychain session & EC P-256 signing, 45s-background / 10-min-idle local biometric/PIN UI lock overlay without server logout, native camera QR/doc capture, background geolocation foreground service bindings, FCM/APNs token registration, and incoming call wake bridge)
- Create: `src/web/components/BiometricLockOverlay.tsx` (local PIN/biometric unlock screen preserving active session, GPS, and SIP calls)
- Modify: `src/web/components/Shell.tsx` (mount `<SipSoftphoneDock />`, `<BiometricLockOverlay />`, and responsive 5-tab mobile bottom bar: **Home / All Ops**, **Inside** + live unread badge, **AI Brain**, **Utilities**, **Field / QR + Call**)
- Modify: `src/web/App.tsx` & `src/web/swk/nav.ts` (register all new routes `/utilities`, `/utilities/word`, `/utilities/translator`, `/utilities/search`, `/phone`, `/field-duty`, `/field-live` with exact hardcoded `FieldLiveGuard` / `Guard` checks; ensure 100% of SWKOS company ops appear in Launcher/mobile drawer filtered strictly by role)
- Create: `mobile/package.json`, `mobile/capacitor.config.ts`, `mobile/scripts/sync-web.mjs` (copies `../dist/web` into `mobile/www` with configurable `SWK_API_BASE`), `mobile/android/` (Capacitor 7 Android project carrying over `SWK_MOBILE`'s `FLAG_SECURE`, `SwkSecurePlugin.java` w/ Keystore AES-256-GCM + EC P-256 device key, `SwkFieldLocationService.java` Play-compliant `location` foreground service, `SwkIncomingCallService.java` `ConnectionService`/full-screen wake hook, `network_security_config.xml` + `pins.json`, Gradle `assembleRelease` APK + `bundleRelease` AAB scripts), `mobile/ios/` (Capacitor iOS config, `Info.plist` privacy keys, Swift plugin bridge `SwkSecurePlugin.swift` & `SwkCallPushBridge.swift` for Keychain/FaceID/CoreLocation/PushKit/CallKit), and `.github/workflows/mobile-builds.yml` (Android APK/AAB + `macos-latest` iOS Xcode build workflow)

**Interfaces:**
- Consumes: `SWKOS/dist/web` build output; all backend APIs from Tasks 1–10.
- Produces: Complete mobile-ready desktop/PWA shell + buildable Capacitor Android (APK + Play AAB) & iOS-ready project.

- [ ] **Step 1: Wire `mobileBridge.ts`, `BiometricLockOverlay.tsx`, `Shell.tsx`, `App.tsx`, and `nav.ts`**
  Ensure Restricted Staff route allowlist (`isAllowedPathForRestrictedStaff`) includes `/utilities`, `/utilities/word`, `/utilities/translator`, `/utilities/search`, `/phone`, `/field-duty` and explicitly excludes `/field-live`, `/crm-vault`, `/reception-display`, `/admin/*`.
- [ ] **Step 2: Scaffold `mobile/` Capacitor 7 project (Android APK/AAB + iOS Swift bridge + GitHub Actions CI)**
  Port `SWK_MOBILE`'s hardened native security primitives (`FLAG_SECURE`, Keystore, SPKI pinning, biometric lock) and add Play-compliant foreground service types (`location`, `phoneCall`, `microphone`) and Android incoming-call full-screen wake.
- [ ] **Step 3: Build web bundle & sync Capacitor project**
  Run: `npm run typecheck && npm run build && node mobile/scripts/sync-web.mjs`
  Expected: Clean `dist/web` and `dist/server/index.mjs` builds + verified `mobile/www` sync (and verify `gradlew assembleDebug` if Android SDK is installed on workstation, else verify Gradle syntax & config).
- [ ] **Step 4: Commit**
  `git add src/web/ mobile/ .github/workflows/mobile-builds.yml && git commit -m "feat(mobile): add unified App shell, full company ops mobile nav, biometric lock, and Capacitor Android/iOS builds"`

---

### Task 12: End-to-End Zero-Leak Security Acceptance Suite & Full Regression Verification

**Files:**
- Create: `tests/zero-leak-superapp.ts` (end-to-end integration test exercising a live Fastify `buildApp()` instance across ALL 7 acceptance gates from Spec Section 14)
- Modify: `package.json` (add `"test:superapp": "tsx --env-file-if-exists=.env tests/zero-leak-superapp.ts"`)

**Interfaces:**
- Consumes: All subsystems from Tasks 1–11.
- Produces: Single-command full zero-leak verification gate `npm run test:superapp`.

- [ ] **Step 1: Write comprehensive end-to-end acceptance suite (`tests/zero-leak-superapp.ts`)**
  Verifies all 7 acceptance criteria in Spec Section 14 against `buildApp()` with real Owner, Admin, Manager, HR, Office Admin, Field Agent (hardcoded), Newly Added Staff #15 (tampered DB test), and Portal Client accounts:
  1. Privilege escalation immunity (`loadUser` clamping + `403` across all admin/vault/live-gps/brief/qr endpoints).
  2. AI Brain zero-leak (Field Agent tool restrictions + PII scrubbing + Confidential Mode fail-closed).
  3. Omni-Route multi-key failover (`429` → `503` → `200` + cooldown respected).
  4. Unified Search zero-leak (Field Agent gets zero employees/invoices/vault/other-users' docs).
  5. SIP Vault isolation (raw owner number absent from agent HTTP/SIP responses, PBX token single-use).
  6. Field GPS privacy & anti-spoof (`403` for non-leadership, `422` on mock GPS, `location_access_logs` written).
  7. WhatsApp-grade `Inside` live sync (SSE ticket auth, `?since_id=` replay, active-thread push suppression, lock-screen privacy preview, all-company-ops push dispatch).
- [ ] **Step 2: Run the entire SWKOS verification suite**
  Run:
  ```bash
  npm run typecheck
  npm run build
  npx tsx tests/schema-017.ts
  npx tsx tests/rbac-zero-leak.ts
  npx tsx tests/mobile-auth-sse.ts
  npx tsx tests/omni-router.ts
  npx tsx tests/push-chat-live.ts
  npx tsx tests/utilities-search.ts
  npx tsx tests/sip-vault.ts
  npx tsx tests/field-gps.ts
  npx tsx tests/ai-controls.ts
  npx tsx tests/ocr.ts
  npx tsx tests/access-control.ts
  npm run test:compliance
  npm run test:superapp
  ```
  Expected: 100% PASS with zero skipped or failing assertions.
- [ ] **Step 3: Commit**
  `git add tests/zero-leak-superapp.ts package.json && git commit -m "test(security): add end-to-end zero-leak acceptance suite for SWK Omni SuperApp"`
