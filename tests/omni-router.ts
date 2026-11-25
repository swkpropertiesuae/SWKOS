import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

// Set isolated temp DATA_DIR BEFORE importing any server modules
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swk-omni-router-'))
process.env.DATA_DIR = tmpDir
process.env.DATABASE_URL = ''
process.env.APP_SECRET = 'test-omni-app-secret-0123456789abcdef'

async function run() {
  const { mainDb, q } = await import('../src/server/db')
  const { syncSchema } = await import('../src/server/schema')
  const { seedReference } = await import('../src/server/seed')
  const { setSettings } = await import('../src/server/settings')
  const authMod = await import('../src/server/auth')
  const { buildApp } = await import('../src/server/app')

  const { OMNI_PRESETS } = await import('../src/server/ai/omni-catalog')
  const { scrubSensitivePii, restoreScrubbedPii } = await import('../src/server/ai/pii-shield')
  const { loadPoolRoutes, omniChat, omniChatStream } = await import('../src/server/ai/omni-router')

  // ---------------------------------------------------------------------------
  // Local Mock Multi-Route LLM Gateway
  // ---------------------------------------------------------------------------
  const hits: Record<string, { headers: http.IncomingHttpHeaders; body: any }[]> = {
    route1: [],
    route2: [],
    route3: [],
    nonzr: [],
    vision: [],
    empty: [],
    sseErr: [],
    sseEmpty: [],
    toolEcho: [],
  }

  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => {
      const url = req.url || ''
      const body = raw ? JSON.parse(raw) : {}
      const rec = { headers: req.headers, body }

      if (url.startsWith('/route1/')) {
        hits.route1.push(rec)
        res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '120' })
        res.end(JSON.stringify({ error: { message: 'Rate limit exceeded on Route 1' } }))
        return
      }
      if (url.startsWith('/route2/')) {
        hits.route2.push(rec)
        res.writeHead(503, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'Route 2 temporarily unavailable' } }))
        return
      }
      if (url.startsWith('/empty/')) {
        hits.empty.push(rec)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ choices: [] }))
        return
      }
      if (url.startsWith('/sse-err/')) {
        hits.sseErr.push(rec)
        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' })
        res.write(`data: ${JSON.stringify({ error: { message: 'OpenRouter 429 upstream overload', code: 429 } })}\n\n`)
        res.end()
        return
      }
      if (url.startsWith('/sse-empty/')) {
        hits.sseEmpty.push(rec)
        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' })
        res.write('data: [DONE]\n\n')
        res.end()
        return
      }
      if (url.startsWith('/tool-echo/')) {
        hits.toolEcho.push(rec)
        const hasToolMsg = (body.messages ?? []).some((m: any) => m.role === 'tool')
        const lastUser = [...(body.messages ?? [])].reverse().find((m: any) => m.role === 'user')
        const userStr = typeof lastUser?.content === 'string' ? lastUser.content : ''
        if (!hasToolMsg && /\[EMAIL_1\]/.test(userStr) && Array.isArray(body.tools) && body.tools.length) {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({
            choices: [{
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'tc_pii_1', type: 'function', function: { name: 'lookup_listings', arguments: JSON.stringify({ area: '[EMAIL_1]', purpose: 'sale' }) } }],
              },
            }],
            usage: { total_tokens: 17 },
          }))
          return
        }
        if (!hasToolMsg && /CALL_TOOL_NOW/.test(userStr) && Array.isArray(body.tools) && body.tools.length) {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({
            choices: [{
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'tc_list_1', type: 'function', function: { name: 'lookup_listings', arguments: JSON.stringify({ purpose: 'sale', area: 'Marina' }) } }],
              },
            }],
            usage: { total_tokens: 19 },
          }))
          return
        }
        const reply = `ToolEchoDone(${hits.toolEcho.length}): ${userStr.slice(0, 100)}`
        if (body.stream) {
          res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' })
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: reply } }], usage: { total_tokens: 23 } })}\n\n`)
          res.write('data: [DONE]\n\n')
          res.end()
        } else {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: reply } }], usage: { total_tokens: 21 } }))
        }
        return
      }
      if (url.startsWith('/route3/') || url.startsWith('/nonzr/') || url.startsWith('/vision/')) {
        const key = url.startsWith('/route3/') ? 'route3' : url.startsWith('/nonzr/') ? 'nonzr' : 'vision'
        hits[key].push(rec)
        const userText = (body.messages ?? [])
          .filter((m: any) => m.role === 'user')
          .map((m: any) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
          .join('\n')
        const replyText = `Echo(${key}): ${userText.slice(0, 400)}`
        if (body.stream) {
          res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' })
          // Emit small 4-char chunks so placeholders like [PHONE_1] split across chunk boundaries
          for (let i = 0; i < replyText.length; i += 4) {
            const chunk = replyText.slice(i, i + 4)
            const isLast = i + 4 >= replyText.length
            const payload = isLast
              ? { choices: [{ delta: { content: chunk } }], usage: { total_tokens: 42 } }
              : { choices: [{ delta: { content: chunk } }] }
            res.write(`data: ${JSON.stringify(payload)}\n\n`)
          }
          res.write('data: [DONE]\n\n')
          res.end()
        } else {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({
            choices: [{ message: { role: 'assistant', content: replyText } }],
            usage: { total_tokens: 33 },
          }))
        }
        return
      }
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'Not found' } }))
    })
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address() as { port: number }
  const mockBase = `http://127.0.0.1:${addr.port}`

  let app: Awaited<ReturnType<typeof buildApp>> | null = null

  try {
    syncSchema()
    await seedReference()

    // Verify all 9 free + Tier-1/local presets exist in OMNI_PRESETS
    const presetKeys = new Set(OMNI_PRESETS.map((p: any) => p.key))
    for (const k of [
      'gemini', 'groq', 'openrouter', 'cloudflare', 'cerebras', 'sambanova',
      'mistral', 'github_models', 'nvidia_nim', 'openai', 'anthropic_via_or',
      'xai', 'deepseek', 'ollama', 'custom',
    ]) {
      assert.ok(presetKeys.has(k), `OMNI_PRESETS must include "${k}"`)
    }

    // =========================================================================
    // Scenario 1: PII Shield redact & restore
    // =========================================================================
    const samplePii =
      'Call owner at +971 50 123 4567, EID 784-1990-1234567-1, IBAN AE070331234567890123456, email client@example.com for VAULT-1012.'
    const scrubbed = scrubSensitivePii(samplePii)
    assert.ok(scrubbed.redactedCount >= 4, `Expected >=4 PII tokens redacted, got ${scrubbed.redactedCount}`)
    assert.ok(!scrubbed.text.includes('+971 50 123 4567'), 'Phone must be redacted')
    assert.ok(!scrubbed.text.includes('784-1990-1234567-1'), 'Emirates ID must be redacted')
    assert.ok(!scrubbed.text.includes('AE070331234567890123456'), 'IBAN must be redacted')
    assert.ok(!scrubbed.text.includes('client@example.com'), 'Email must be redacted')
    assert.ok(!scrubbed.text.includes('VAULT-1012'), 'Vault ref must be redacted')
    const restored = restoreScrubbedPii(scrubbed.text, scrubbed.map)
    assert.equal(restored, samplePii, 'restoreScrubbedPii() must restore original text losslessly')

    // =========================================================================
    // Setup users & routes for API + Router tests
    // =========================================================================
    const ownerRow = q.get<{ id: number }>(`SELECT id FROM users WHERE lower(email) = 'shabib@swk.properties'`)!
    const managerRow = q.get<{ id: number }>(`SELECT id FROM users WHERE lower(email) = 'haseeb@swk.properties'`)!
    const staffRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'Staff (Attendance & General)'`)!
    const dxbBranchId = q.val<number>(`SELECT id FROM branches WHERE code = 'DXB'`)!
    const now = new Date().toISOString()

    const agentAId = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'Field Agent A', 'agent-a@swk.rent', authMod.hashPassword('AgentA-2026!'), staffRoleId, dxbBranchId, 1, 0, now, now,
    )
    const agentBId = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'Field Agent B', 'agent-b@swk.rent', authMod.hashPassword('AgentB-2026!'), staffRoleId, dxbBranchId, 1, 0, now, now,
    )
    const portalPartyId = q.insert(
      `INSERT INTO parties(code, name, is_customer, status, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
      'P-PORTAL-1', 'Portal Client LLC', 1, 'Active', now, now,
    )
    const portalUserId = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, party_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      'Portal User', 'portal@client.example', authMod.hashPassword('Portal-2026!'), staffRoleId, dxbBranchId, portalPartyId, 1, 0, now, now,
    )

    const ownerUser = authMod.loadUser(ownerRow.id)!
    const agentAUser = authMod.loadUser(agentAId)!

    const ownerCookie = 'swk_sid=' + authMod.createSession(ownerRow.id).token
    const managerCookie = 'swk_sid=' + authMod.createSession(managerRow.id).token
    const agentACookie = 'swk_sid=' + authMod.createSession(agentAId).token
    const agentBCookie = 'swk_sid=' + authMod.createSession(agentBId).token
    const portalCookie = 'swk_sid=' + authMod.createSession(portalUserId).token

    app = await buildApp()

    // Admin/Owner creates 3 routes via API (verifying secret encryption & masking too)
    const mkRoute = async (payload: any) => {
      const r = await app!.inject({
        method: 'POST',
        url: '/api/omni-ai/routes',
        headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: ownerCookie },
        payload,
      })
      assert.equal(r.statusCode, 201, `Expected 201 creating route, got ${r.statusCode}: ${r.body}`)
      const json = r.json() as any
      assert.equal(json.has_key, true)
      assert.ok(!json.api_key_enc && !JSON.stringify(json).includes(payload.api_key), 'API must never return raw or encrypted API key')
      return json
    }

    // Non-Owner/Admin (Manager and Field Staff) cannot list or create routes
    const mgrRoutesRes = await app.inject({
      method: 'GET',
      url: '/api/omni-ai/routes',
      headers: { cookie: managerCookie },
    })
    assert.equal(mgrRoutesRes.statusCode, 403, 'Manager must be forbidden from Admin /api/omni-ai/routes')

    const staffRoutesRes = await app.inject({
      method: 'GET',
      url: '/api/omni-ai/routes',
      headers: { cookie: agentACookie },
    })
    assert.equal(staffRoutesRes.statusCode, 403, 'Field Staff must be forbidden from Admin /api/omni-ai/routes')

    // Portal user is blocked from all /api/omni-ai/* endpoints
    const portalStatusRes = await app.inject({
      method: 'GET',
      url: '/api/omni-ai/status',
      headers: { cookie: portalCookie },
    })
    assert.equal(portalStatusRes.statusCode, 403, 'Portal user must receive 403 on /api/omni-ai/status')

    // =========================================================================
    // Fix Round 1 [Important #1]: Fresh unconfigured DB reports configured=false, empty lanes, returns 503 with zero outbound calls
    // =========================================================================
    assert.deepEqual(
      loadPoolRoutes({ includeDisabled: false, includeLegacy: true }),
      [],
      'Fresh unconfigured DB must NOT emit unauthenticated default groq route',
    )
    const unconfStatus = await app.inject({
      method: 'GET',
      url: '/api/omni-ai/status',
      headers: { cookie: agentACookie },
    })
    assert.equal(unconfStatus.statusCode, 200)
    assert.equal((unconfStatus.json() as any).configured, false)
    assert.deepEqual((unconfStatus.json() as any).lanes, [])

    const unconfChat = await app.inject({
      method: 'POST',
      url: '/api/omni-ai/chat',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agentACookie },
      payload: { message: 'Should not hit api.groq.com' },
    })
    assert.equal(unconfChat.statusCode, 503, `Expected 503 when AI is unconfigured, got ${unconfChat.statusCode}`)

    const unconfStream = await app.inject({
      method: 'POST',
      url: '/api/omni-ai/chat/stream',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agentACookie },
      payload: { message: 'Should not hit api.groq.com' },
    })
    assert.equal(unconfStream.statusCode, 503, `Expected 503 stream preflight when AI is unconfigured, got ${unconfStream.statusCode}`)

    const r1 = await mkRoute({
      label: 'Route 1 (429)',
      provider_key: 'groq',
      base_url: `${mockBase}/route1/v1`,
      api_key: 'secret-key-1',
      model_id: 'openai/gpt-oss-20b',
      lanes: ['general', 'fast'],
      tier: 'free',
      priority: 10,
      zero_retention: false,
    })
    const r2 = await mkRoute({
      label: 'Route 2 (503)',
      provider_key: 'openrouter',
      base_url: `${mockBase}/route2/v1`,
      api_key: 'secret-key-2',
      model_id: 'openrouter/free',
      lanes: ['general', 'fast'],
      tier: 'free',
      priority: 20,
      zero_retention: false,
    })
    const r3 = await mkRoute({
      label: 'Route 3 (200)',
      provider_key: 'gemini',
      base_url: `${mockBase}/route3/v1`,
      api_key: 'secret-key-3',
      model_id: 'gemini-2.5-flash',
      lanes: ['general', 'fast'],
      tier: 'free',
      priority: 30,
      zero_retention: false,
    })

    // Verify encrypted at rest in DB
    const r1DbEnc = q.val<string>(`SELECT api_key_enc FROM ai_provider_routes WHERE id = ?`, r1.id)!
    assert.ok(r1DbEnc.startsWith('enc:v1:'), 'api_key_enc must be AES-256-GCM encrypted at rest')

    // =========================================================================
    // Scenario 2: 3-route failover (429 Retry-After: 120 -> 503 -> 200) & cooldown skip
    // =========================================================================
    const res1 = await omniChat({
      messages: [{ role: 'user', content: 'Follow up with +971 50 123 4567 and client@example.com' }],
      lane: 'fast',
      user: agentAUser,
    })
    assert.equal(res1.routeId, r3.id, 'omniChat() must transparently fail over to Route 3')
    assert.equal(hits.route1.length, 1, 'Route 1 should be hit once')
    assert.equal(hits.route2.length, 1, 'Route 2 should be hit once')
    assert.equal(hits.route3.length, 1, 'Route 3 should be hit once')

    // Verify PII was scrubbed outbound on zero_retention=false Route 3 AND restored in result
    const outboundR3 = JSON.stringify(hits.route3[0].body.messages)
    assert.ok(!outboundR3.includes('+971 50 123 4567'), 'Outbound non-zero-retention call must scrub phone')
    assert.ok(!outboundR3.includes('client@example.com'), 'Outbound non-zero-retention call must scrub email')
    assert.ok(res1.piiRedacted >= 2, 'Result must report piiRedacted >= 2')
    assert.ok(res1.content.includes('+971 50 123 4567'), 'Result must restore phone locally')
    assert.ok(res1.content.includes('client@example.com'), 'Result must restore email locally')

    // Verify Route 1 cooldown_until is >= 115s in the future (Retry-After: 120)
    const r1Cooldown = q.val<string | null>(`SELECT cooldown_until FROM ai_provider_routes WHERE id = ?`, r1.id)
    assert.ok(r1Cooldown, 'Route 1 must have cooldown_until persisted')
    const deltaMs = Date.parse(r1Cooldown!) - Date.now()
    assert.ok(deltaMs >= 110_000, `Route 1 cooldown must respect Retry-After: 120 (>=110s remaining), got ${deltaMs}ms`)

    // Subsequent call must skip Route 1 and Route 2 immediately
    const res2 = await omniChat({
      messages: [{ role: 'user', content: 'Quick follow-up question' }],
      lane: 'fast',
      user: agentAUser,
    })
    assert.equal(res2.routeId, r3.id)
    assert.equal(hits.route1.length, 1, 'Subsequent call must skip cooled-down Route 1 immediately')
    assert.equal(hits.route2.length, 1, 'Subsequent call must skip cooled-down Route 2 immediately')
    assert.equal(hits.route3.length, 2, 'Subsequent call must route directly to Route 3')

    // Reset Route 1 cooldown endpoint works for Owner/Admin
    const resetRes = await app.inject({
      method: 'POST',
      url: `/api/omni-ai/routes/${r1.id}/reset-cooldown`,
      headers: { 'x-swk-client': 'web', cookie: ownerCookie },
    })
    assert.equal(resetRes.statusCode, 200)
    assert.equal(q.val(`SELECT cooldown_until FROM ai_provider_routes WHERE id = ?`, r1.id), null)

    // Re-cool Route 1 & 2 or disable them? Let's keep Route 1/2 disabled so Scenario 3 & 4 hit cleanly
    q.run(`UPDATE ai_provider_routes SET enabled = 0 WHERE id IN (?, ?)`, r1.id, r2.id)

    // =========================================================================
    // Scenario 3: Confidential Mode fails closed when only zero_retention = 0 routes exist
    // =========================================================================
    const beforeNonZrCalls = hits.route3.length
    await assert.rejects(
      () => omniChat({
        messages: [{ role: 'user', content: 'Confidential owner payout ledger' }],
        confidential: true,
        user: ownerUser,
      }),
      /zero[- ]retention|confidential/i,
      'Confidential Mode must fail closed with explicit zero-retention error when only zero_retention=0 routes exist',
    )
    assert.equal(hits.route3.length, beforeNonZrCalls, 'Confidential Mode must NEVER send prompt to zero_retention=0 route')

    // Also verify HTTP POST /api/omni-ai/chat/stream fails closed for Owner in Confidential Mode
    const confHttpRes = await app.inject({
      method: 'POST',
      url: '/api/omni-ai/chat/stream',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: ownerCookie },
      payload: { message: 'Secret vault data', confidential: true },
    })
    assert.ok(confHttpRes.statusCode >= 400, `Expected 4xx/5xx for Confidential Mode without zero_retention route, got ${confHttpRes.statusCode}`)
    assert.equal(hits.route3.length, beforeNonZrCalls, 'HTTP Confidential Mode must never hit zero_retention=0 route')

    // Non-leadership (Field Agent A) requesting confidential mode is forbidden (403)
    const agentConfRes = await app.inject({
      method: 'POST',
      url: '/api/omni-ai/chat/stream',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agentACookie },
      payload: { message: 'Try confidential', confidential: true },
    })
    assert.equal(agentConfRes.statusCode, 403, 'Field Staff must be forbidden from enabling Confidential Mode')

    // =========================================================================
    // Scenario 4: Per-user daily quota enforcement (Field Staff 429, Owner exempt)
    // =========================================================================
    setSettings({ ai_staff_daily_req_limit: 2, ai_staff_rpm_limit: 50 })
    // Agent A already made 2 calls in Scenario 2 -> 3rd call must fail with 429!
    const quotaStreamRes = await app.inject({
      method: 'POST',
      url: '/api/omni-ai/chat/stream',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agentACookie },
      payload: { message: 'One too many requests' },
    })
    assert.equal(quotaStreamRes.statusCode, 429, `Expected 429 when Field Staff exceeds daily limit, got ${quotaStreamRes.statusCode}: ${quotaStreamRes.body}`)

    // Owner remains exempt even if Owner makes > 2 requests
    for (let i = 0; i < 4; i++) {
      const ownerRes = await omniChat({
        messages: [{ role: 'user', content: `Owner ping ${i}` }],
        user: ownerUser,
      })
      assert.equal(ownerRes.routeId, r3.id)
    }

    // Restore default daily quota before running remaining streaming & attachment tests
    setSettings({ ai_staff_daily_req_limit: 150 })

    // =========================================================================
    // Scenario 5: Conversation isolation (User B gets 403/404 on User A's conversations)
    // =========================================================================
    // Give Agent B fresh quota & test streaming SSE + CORS headers too
    const createConvRes = await app.inject({
      method: 'POST',
      url: '/api/omni-ai/conversations',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agentACookie },
      payload: { title: 'Agent A Private Chat', mode: 'general' },
    })
    assert.equal(createConvRes.statusCode, 201)
    const convA = createConvRes.json() as any

    const bListRes = await app.inject({
      method: 'GET',
      url: '/api/omni-ai/conversations',
      headers: { cookie: agentBCookie },
    })
    assert.equal(bListRes.statusCode, 200)
    assert.equal((bListRes.json() as any).conversations.some((c: any) => c.id === convA.id), false, 'User B must not see User A conversation')

    const bMsgsRes = await app.inject({
      method: 'GET',
      url: `/api/omni-ai/conversations/${convA.id}/messages`,
      headers: { cookie: agentBCookie },
    })
    assert.ok(bMsgsRes.statusCode === 404 || bMsgsRes.statusCode === 403, `User B reading User A messages must return 403/404, got ${bMsgsRes.statusCode}`)

    const bDelRes = await app.inject({
      method: 'DELETE',
      url: `/api/omni-ai/conversations/${convA.id}`,
      headers: { 'x-swk-client': 'web', cookie: agentBCookie },
    })
    assert.ok(bDelRes.statusCode === 404 || bDelRes.statusCode === 403, `User B deleting User A conversation must return 403/404, got ${bDelRes.statusCode}`)

    // =========================================================================
    // Extra: SSE stream CORS header preservation + PII restoration + multipart OCR-first + tool policy + vision gate
    // =========================================================================
    const sseRes = await app.inject({
      method: 'POST',
      url: '/api/omni-ai/chat/stream',
      headers: {
        'content-type': 'application/json',
        'x-swk-client': 'web',
        origin: 'http://localhost:5173',
        cookie: agentBCookie,
      },
      payload: { message: 'Reach +971 50 987 6543 please' },
    })
    assert.equal(sseRes.statusCode, 200, `SSE stream failed: ${sseRes.body}`)
    assert.equal(sseRes.headers['access-control-allow-origin'], 'http://localhost:5173', 'SSE hijack must preserve CORS Access-Control-Allow-Origin header')
    assert.match(sseRes.body, /event: meta/)
    assert.match(sseRes.body, /event: token/)
    assert.match(sseRes.body, /event: done/)
    assert.ok(sseRes.body.includes('+971 50 987 6543'), 'Streamed SSE output must restore scrubbed PII locally')

    // Mobile client (x-swk-client: mobile + x-swk-session) cross-origin SSE stream
    const mobLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile' },
      payload: { email: 'agent-b@swk.rent', password: 'AgentB-2026!', device_id: 'dev-agent-b-1', platform: 'android' },
    })
    assert.equal(mobLogin.statusCode, 200, `Mobile login failed: ${mobLogin.body}`)
    const mobTok = (mobLogin.json() as any).session_token as string
    const mobSseRes = await app.inject({
      method: 'POST',
      url: '/api/omni-ai/chat/stream',
      headers: {
        'content-type': 'application/json',
        'x-swk-client': 'mobile',
        'x-swk-session': mobTok,
        origin: 'http://localhost:5173',
      },
      payload: { message: 'Mobile SSE ping' },
    })
    assert.equal(mobSseRes.statusCode, 200, `Mobile SSE stream failed: ${mobSseRes.body}`)
    assert.equal(mobSseRes.headers['access-control-allow-origin'], 'http://localhost:5173')
    assert.match(mobSseRes.body, /event: done/)

    // Multipart upload on /api/omni-ai/chat/stream runs OCR-first extraction & scrubs PII before free route
    const boundary = '----swkOmniBoundary12345'
    const multipartPayload = [
      `--${boundary}\r\nContent-Disposition: form-data; name="message"\r\n\r\nSummarize this client note\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="lead.txt"\r\nContent-Type: text/plain\r\n\r\nTenant EID 784-1988-7654321-2 Mobile +971 55 444 3322\r\n`,
      `--${boundary}--\r\n`,
    ].join('')
    const hitsBeforeMultipart = hits.route3.length
    const multiRes = await app.inject({
      method: 'POST',
      url: '/api/omni-ai/chat/stream',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-swk-client': 'web',
        cookie: agentBCookie,
      },
      payload: multipartPayload,
    })
    assert.equal(multiRes.statusCode, 200, `Multipart stream failed: ${multiRes.body}`)
    assert.equal(hits.route3.length, hitsBeforeMultipart + 1)
    const multiOutbound = JSON.stringify(hits.route3[hits.route3.length - 1].body.messages)
    assert.ok(!multiOutbound.includes('784-1988-7654321-2'), 'Extracted attachment EID must be scrubbed outbound')
    assert.ok(!multiOutbound.includes('+971 55 444 3322'), 'Extracted attachment phone must be scrubbed outbound')
    assert.ok(multiRes.body.includes('784-1988-7654321-2'), 'Extracted attachment EID must be restored in local SSE response')

    // Staff status & tool-allowlist isolation
    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/omni-ai/status',
      headers: { cookie: agentBCookie },
    })
    assert.equal(statusRes.statusCode, 200)
    const statusJson = statusRes.json() as any
    assert.equal(statusJson.can_use_confidential, false)
    const toolNames = new Set((statusJson.allowed_tools as any[]).map((t: any) => t.name))
    assert.ok(toolNames.has('lookup_listings'))
    assert.ok(toolNames.has('my_assigned_deals_masked'))
    assert.equal(toolNames.has('overdue_invoices'), false, 'Field Staff must NEVER receive overdue_invoices tool')
    assert.equal(toolNames.has('business_snapshot'), false, 'Field Staff must NEVER receive business_snapshot tool')

    // Non-Vault Vision toggle gate: create a vision route with zero_retention=false
    await mkRoute({
      label: 'Vision Free',
      provider_key: 'gemini',
      base_url: `${mockBase}/vision/v1`,
      api_key: 'vision-key',
      model_id: 'gemini-2.5-flash',
      lanes: ['vision'],
      tier: 'free',
      priority: 10,
      zero_retention: false,
    })

    // With ai_allow_nonvault_vision_free = false (default), raw vision to free route must fail closed!
    setSettings({ ai_allow_nonvault_vision_free: false })
    await assert.rejects(
      () => omniChat({
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Inspect floor plan' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBOR' } }] }],
        lane: 'vision',
        hasVisionContent: true,
        user: ownerUser,
      }),
      /vision|ai_allow_nonvault_vision_free/i,
      'Raw vision to zero_retention=0 route must be blocked when ai_allow_nonvault_vision_free=false',
    )
    assert.equal(hits.vision.length, 0)

    // Enable toggle -> succeeds on vision lane (still blocked in Confidential Mode)
    setSettings({ ai_allow_nonvault_vision_free: true })
    const visOk = await omniChat({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Inspect floor plan' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBOR' } }] }],
      lane: 'vision',
      hasVisionContent: true,
      user: ownerUser,
    })
    assert.equal(hits.vision.length, 1)
    assert.equal(visOk.lane, 'vision')

    await assert.rejects(
      () => omniChat({
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Inspect confidential deed' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBOR' } }] }],
        lane: 'vision',
        hasVisionContent: true,
        confidential: true,
        user: ownerUser,
      }),
      /zero[- ]retention|confidential/i,
      'Vision in Confidential Mode must NEVER use non-zero-retention route even when toggle is on',
    )

    // Also test omniChatStream directly
    const tokens: string[] = []
    const streamDirect = await omniChatStream(
      { messages: [{ role: 'user', content: 'Stream check for client2@example.com' }], user: ownerUser },
      delta => tokens.push(delta),
    )
    assert.ok(tokens.length >= 1)
    assert.equal(tokens.join(''), streamDirect.content)
    assert.ok(streamDirect.content.includes('client2@example.com'))

    // Admin health endpoint check
    const healthRes = await app.inject({
      method: 'GET',
      url: '/api/omni-ai/health',
      headers: { cookie: ownerCookie },
    })
    assert.equal(healthRes.statusCode, 200)
    const healthJson = healthRes.json() as any
    assert.ok(Array.isArray(healthJson.routes) && healthJson.routes.length >= 4)
    assert.ok(Array.isArray(healthJson.staff_usage))
    assert.ok(!JSON.stringify(healthJson).includes('secret-key-'), 'Health dashboard must never leak API keys')

    // =========================================================================
    // Fix Round 1 [Important #2 & #3]: Single-count empty 502, network error containing 'HTTP ', and SSE 200 error/empty failover
    // =========================================================================
    const rEmpty = await mkRoute({
      label: 'Route Empty 200',
      provider_key: 'groq',
      base_url: `${mockBase}/empty/v1`,
      api_key: 'k-empty',
      model_id: 'openai/gpt-oss-20b',
      lanes: ['general'],
      tier: 'free',
      priority: 1,
      zero_retention: false,
    })
    const emptyFailover = await omniChat({
      messages: [{ role: 'user', content: 'Fail over after empty response' }],
      // pinned: without a lane, v3.9 auto-routes short prompts to 'fast', which this general-only route does not serve
      lane: 'general',
      user: ownerUser,
    })
    assert.equal(emptyFailover.routeId, r3.id, 'Empty 200 choices[] must fail over to Route 3')
    const emptyCd = q.val<string | null>(`SELECT cooldown_until FROM ai_provider_routes WHERE id = ?`, rEmpty.id)
    assert.ok(emptyCd, 'Empty 502 must place route in cooldown')
    const emptyCdMs = Date.parse(emptyCd!) - Date.now()
    assert.ok(emptyCdMs > 45_000 && emptyCdMs <= 65_000, `Empty 502 must record failure ONCE (~60s, not 180s double-count), got ${emptyCdMs}ms`)
    q.run(`UPDATE ai_provider_routes SET enabled = 0 WHERE id = ?`, rEmpty.id)

    // Network error containing 'HTTP ' must still record failure & trigger cooldown
    const rNetErr = await mkRoute({
      label: 'Route Net HTTP Err',
      provider_key: 'groq',
      base_url: 'http://net-err.invalid/v1',
      api_key: 'k-net',
      model_id: 'openai/gpt-oss-20b',
      lanes: ['general'],
      tier: 'free',
      priority: 2,
      zero_retention: false,
    })
    const origFetch = globalThis.fetch
    globalThis.fetch = (async (input: any, init?: any) => {
      if (String(input).includes('net-err.invalid')) {
        throw new Error('HTTP socket hang up before status')
      }
      return origFetch(input, init)
    }) as typeof fetch
    try {
      const netFailover = await omniChat({
        messages: [{ role: 'user', content: 'Fail over after network error containing HTTP' }],
        lane: 'general',
        user: ownerUser,
      })
      assert.equal(netFailover.routeId, r3.id)
      const netCd = q.val<string | null>(`SELECT cooldown_until FROM ai_provider_routes WHERE id = ?`, rNetErr.id)
      assert.ok(netCd && Date.parse(netCd) > Date.now() + 45_000, 'Network error containing "HTTP " must still trigger cooldown')
    } finally {
      globalThis.fetch = origFetch
      q.run(`UPDATE ai_provider_routes SET enabled = 0 WHERE id = ?`, rNetErr.id)
    }

    // SSE 200 error payload & empty SSE stream failover
    const rSseErr = await mkRoute({
      label: 'Route SSE 200 Error',
      provider_key: 'openrouter',
      base_url: `${mockBase}/sse-err/v1`,
      api_key: 'k-sse-err',
      model_id: 'openrouter/free',
      lanes: ['general'],
      tier: 'free',
      priority: 3,
      zero_retention: false,
    })
    const rSseEmpty = await mkRoute({
      label: 'Route SSE 200 Empty',
      provider_key: 'openrouter',
      base_url: `${mockBase}/sse-empty/v1`,
      api_key: 'k-sse-empty',
      model_id: 'openrouter/free',
      lanes: ['general'],
      tier: 'free',
      priority: 4,
      zero_retention: false,
    })
    const sseErrTokens: string[] = []
    const sseErrFailover = await omniChatStream(
      { messages: [{ role: 'user', content: 'Stream failover test' }], lane: 'general', user: ownerUser },
      d => sseErrTokens.push(d),
    )
    assert.equal(sseErrFailover.routeId, r3.id, 'SSE 200 error + empty stream must fail over to Route 3')
    assert.equal(hits.sseErr.length, 1)
    assert.equal(hits.sseEmpty.length, 1)
    assert.ok(q.val<string | null>(`SELECT cooldown_until FROM ai_provider_routes WHERE id = ?`, rSseErr.id), 'SSE 200 error must put route in cooldown')
    assert.ok(q.val<string | null>(`SELECT cooldown_until FROM ai_provider_routes WHERE id = ?`, rSseEmpty.id), 'Empty SSE stream must put route in cooldown')
    q.run(`UPDATE ai_provider_routes SET enabled = 0 WHERE id IN (?, ?)`, rSseErr.id, rSseEmpty.id)

    // =========================================================================
    // Fix Round 1 [Important #5]: Tool-call arg PII round-trip + single-call use_tools optimization
    // =========================================================================
    q.run(`UPDATE ai_provider_routes SET enabled = 0 WHERE id = ?`, r3.id)
    const rToolEcho = await mkRoute({
      label: 'Route Tool Echo',
      provider_key: 'groq',
      base_url: `${mockBase}/tool-echo/v1`,
      api_key: 'k-tool',
      model_id: 'openai/gpt-oss-20b',
      lanes: ['general'],
      tier: 'free',
      priority: 5,
      zero_retention: false,
    })

    // 5a: omniChat restores PII in tool_calls[].args AND scrubMessages scrubs assistant.tool_calls[].function.arguments on next turn
    const tcTurn1 = await omniChat({
      messages: [{ role: 'user', content: 'Look up client@example.com' }],
      tools: [{ name: 'lookup_listings', description: 'Lookup', parameters: { type: 'object', properties: { area: { type: 'string' } } } }],
      user: ownerUser,
    })
    assert.equal(tcTurn1.tool_calls.length, 1)
    assert.equal(tcTurn1.tool_calls[0]!.args.area, 'client@example.com', 'omniChat() must restore scrubbed PII inside tool_calls[].args')

    const tcTurn2 = await omniChat({
      messages: [
        { role: 'user', content: 'Look up client@example.com' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'tc_pii_1', type: 'function', function: { name: 'lookup_listings', arguments: JSON.stringify(tcTurn1.tool_calls[0]!.args) } }],
        },
        { role: 'tool', tool_call_id: 'tc_pii_1', name: 'lookup_listings', content: JSON.stringify({ owner_email: 'client@example.com' }) },
      ],
      tools: [{ name: 'lookup_listings', description: 'Lookup', parameters: { type: 'object', properties: { area: { type: 'string' } } } }],
      user: ownerUser,
    })
    const turn2Outbound = JSON.stringify(hits.toolEcho[hits.toolEcho.length - 1]!.body.messages)
    assert.ok(!turn2Outbound.includes('client@example.com'), 'Turn 2 must scrub assistant tool_calls[].function.arguments and tool content outbound')
    assert.ok(tcTurn2.content.includes('ToolEchoDone'))

    // 5b: POST /api/omni-ai/chat with use_tools=true and no tool calls makes ONLY 1 LLM call (no duplicate call)
    const callsBeforeNoTool = hits.toolEcho.length
    const usageBefore = q.val<number>(`SELECT req_count FROM ai_usage_daily WHERE user_id = ?`, agentBId) ?? 0
    const noToolRes = await app.inject({
      method: 'POST',
      url: '/api/omni-ai/chat',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agentBCookie },
      payload: { message: 'Just answer directly without calling tools', use_tools: true },
    })
    assert.equal(noToolRes.statusCode, 200, `use_tools chat failed: ${noToolRes.body}`)
    assert.equal(hits.toolEcho.length, callsBeforeNoTool + 1, 'use_tools=true with no tool calls must invoke LLM once, not twice')
    assert.equal((noToolRes.json() as any).tokens, 21)
    assert.equal(q.val<number>(`SELECT req_count FROM ai_usage_daily WHERE user_id = ?`, agentBId), usageBefore + 1)

    // 5c: POST /api/omni-ai/chat/stream with use_tools=true executing tool -> accumulates planning + final tokens (19 + 21 = 40)
    const callsBeforeWithTool = hits.toolEcho.length
    const tokensBefore = q.val<number>(`SELECT token_count FROM ai_usage_daily WHERE user_id = ?`, agentBId) ?? 0
    const withToolStreamRes = await app.inject({
      method: 'POST',
      url: '/api/omni-ai/chat/stream',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: agentBCookie },
      payload: { message: 'CALL_TOOL_NOW please', use_tools: true },
    })
    assert.equal(withToolStreamRes.statusCode, 200, `use_tools stream failed: ${withToolStreamRes.body}`)
    assert.equal(hits.toolEcho.length, callsBeforeWithTool + 2, 'use_tools=true with 1 tool round must invoke LLM twice total (planning + answer)')
    assert.match(withToolStreamRes.body, /"tokens":40/, 'SSE done event must include planning (19) + answer (21) = 40 tokens')
    assert.equal(q.val<number>(`SELECT req_count FROM ai_usage_daily WHERE user_id = ?`, agentBId), usageBefore + 2)
    assert.equal(q.val<number>(`SELECT token_count FROM ai_usage_daily WHERE user_id = ?`, agentBId), tokensBefore + 40)
    void rToolEcho

    console.log('All Omni-Route AI Brain & PII Shield tests passed.')
  } finally {
    if (app) {
      try { await app.close() } catch {}
    }
    try { server.close() } catch {}
    try { mainDb.close() } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
