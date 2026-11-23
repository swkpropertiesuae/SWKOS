import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

// Set isolated temp DATA_DIR & APP_SECRET BEFORE importing any server modules
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swk-superapp-e2e-'))
process.env.DATA_DIR = tmpDir
process.env.DATABASE_URL = ''
process.env.APP_SECRET = 'test-superapp-e2e-app-secret-0123456789abcdef'
process.env.DEMO_ENABLED = 'false'
process.env.STARTER_DATA = 'false'

async function waitFor(pred: () => boolean, timeoutMs = 1000, label = 'condition'): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (pred()) return
    await new Promise(r => setTimeout(r, 10))
  }
  if (!pred()) throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`)
}

interface LiveSseHandle {
  status: number
  contentType: string
  headers: Headers
  getText: () => string
  waitForMatch: (pred: (text: string) => boolean, timeoutMs?: number) => Promise<string>
  close: () => Promise<void>
}

async function openLiveSse(url: string, headers: Record<string, string> = {}, timeoutMs = 4000): Promise<LiveSseHandle> {
  const ac = new AbortController()
  const res = await fetch(url, { headers, signal: ac.signal })
  const contentType = res.headers.get('content-type') || ''
  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '')
    ac.abort()
    return {
      status: res.status,
      contentType,
      headers: res.headers,
      getText: () => errText,
      waitForMatch: async () => errText,
      close: async () => {},
    }
  }
  const reader = res.body.getReader()
  let text = ''
  const waiters: Array<() => void> = []
  const notifyWaiters = () => {
    for (const w of waiters) w()
  }

  const pump = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          text += Buffer.from(value).toString('utf8')
          notifyWaiters()
        }
      }
    } catch {
      /* aborted or closed cleanly */
    } finally {
      notifyWaiters()
    }
  })()

  const waitForMatch = (pred: (cur: string) => boolean, waitTimeoutMs = timeoutMs): Promise<string> => {
    if (pred(text)) return Promise.resolve(text)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = waiters.indexOf(check)
        if (idx >= 0) waiters.splice(idx, 1)
        reject(new Error(`SSE waitForMatch timed out after ${waitTimeoutMs}ms. Received:\n${text}`))
      }, waitTimeoutMs)
      const check = () => {
        if (pred(text)) {
          clearTimeout(timer)
          const idx = waiters.indexOf(check)
          if (idx >= 0) waiters.splice(idx, 1)
          resolve(text)
        }
      }
      waiters.push(check)
    })
  }

  return {
    status: res.status,
    contentType,
    headers: res.headers,
    getText: () => text,
    waitForMatch,
    close: async () => {
      ac.abort()
      try { await reader.cancel() } catch {}
      await pump.catch(() => {})
    },
  }
}

function parseSseEvents(raw: string): Array<{ event: string; data: any }> {
  const out: Array<{ event: string; data: any }> = []
  for (const block of raw.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/).filter(l => l && !l.startsWith(':'))
    let event = 'message'
    const dataLines: string[] = []
    for (const l of lines) {
      if (l.startsWith('event:')) event = l.slice(6).trim()
      else if (l.startsWith('data:')) dataLines.push(l.slice(5).trim())
    }
    if (!dataLines.length) continue
    try {
      out.push({ event, data: JSON.parse(dataLines.join('\n')) })
    } catch {
      out.push({ event, data: dataLines.join('\n') })
    }
  }
  return out
}

function makeEcP256Jwk() {
  const { publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' }) as { kty: 'EC'; crv: 'P-256'; x: string; y: string }
  const expectedDeviceId = crypto.createHash('sha256').update(`${jwk.x}.${jwk.y}`).digest('hex').slice(0, 40)
  return { jwk, expectedDeviceId }
}

function buildMultipart(
  fields: Record<string, string>,
  file?: { fieldname: string; filename: string; contentType: string; data: Buffer },
): { contentType: string; body: Buffer } {
  const boundary = '----SwkSuperAppBoundary' + Math.random().toString(36).slice(2)
  const chunks: Buffer[] = []
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, 'utf8'),
    )
  }
  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
        'utf8',
      ),
    )
    chunks.push(file.data)
    chunks.push(Buffer.from('\r\n', 'utf8'))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'))
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat(chunks),
  }
}

async function run() {
  const { mainDb, q } = await import('../src/server/db')
  const { syncSchema } = await import('../src/server/schema')
  const { seedReference } = await import('../src/server/seed')
  const { config } = await import('../src/server/config')
  const authMod = await import('../src/server/auth')
  const staffAccess = await import('../src/shared/swk-staff-access')
  const { ensureAgents, chatWithAgent } = await import('../src/server/ai/agents')
  const { isToolAllowedForUser } = await import('../src/server/ai/policy')
  const { createRecord, getDef, SYSTEM_CTX } = await import('../src/server/engine')
  const { encryptSecret, setSettings } = await import('../src/server/settings')
  const { notify } = await import('../src/server/notify')
  const pushMod = await import('../src/server/integrations/push')
  const { buildApp } = await import('../src/server/app')

  // Local mock HTTP LLM provider gateway (429 -> 503 -> 200 failover + tool-call & PII inspection)
  const llmHits: Record<'r429' | 'r503' | 'rFreeOk' | 'rZrOk', Array<{ url: string; headers: http.IncomingHttpHeaders; body: any }>> = {
    r429: [],
    r503: [],
    rFreeOk: [],
    rZrOk: [],
  }

  const llmServer = http.createServer((req, res) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => {
      const url = req.url || ''
      const body = raw ? JSON.parse(raw) : {}
      const entry = { url, headers: req.headers, body }

      if (url.startsWith('/r429/')) {
        llmHits.r429.push(entry)
        res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '120' })
        res.end(JSON.stringify({ error: { message: 'Mock upstream 429 rate limit' } }))
        return
      }
      if (url.startsWith('/r503/')) {
        llmHits.r503.push(entry)
        res.writeHead(503, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'Mock upstream 503 service unavailable' } }))
        return
      }
      if (url.startsWith('/free-ok/') || url.startsWith('/zr-ok/')) {
        const bucket = url.startsWith('/zr-ok/') ? 'rZrOk' : 'rFreeOk'
        llmHits[bucket].push(entry)

        const messages = Array.isArray(body.messages) ? body.messages : []
        const hasToolMsg = messages.some((m: any) => m.role === 'tool')
        const lastUser = [...messages].reverse().find((m: any) => m.role === 'user')
        const userText = typeof lastUser?.content === 'string' ? lastUser.content : JSON.stringify(lastUser?.content ?? '')

        if (!hasToolMsg && /RESTRICTED_TOOL_PROBE/.test(userText)) {
          // Simulate an adversarial/hallucinated LLM attempting forbidden read tools alongside an allowed masked tool
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({
            choices: [{
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  { id: 'tc_forbid_inv', type: 'function', function: { name: 'overdue_invoices', arguments: '{}' } },
                  { id: 'tc_forbid_hr', type: 'function', function: { name: 'expiring_documents', arguments: '{"days":365}' } },
                  { id: 'tc_forbid_party', type: 'function', function: { name: 'search_parties', arguments: '{"query":"Kensington"}' } },
                  { id: 'tc_allow_deals', type: 'function', function: { name: 'my_assigned_deals_masked', arguments: '{}' } },
                ],
              },
            }],
            usage: { total_tokens: 24 },
          }))
          return
        }

        const toolMsgs = messages.filter((m: any) => m.role === 'tool').map((m: any) => `${m.name}=${m.content}`)
        const reply = toolMsgs.length
          ? `ToolResults(${bucket}): ${toolMsgs.join(' | ')}`
          : `MockReply(${bucket}): ${userText.slice(0, 300)}`

        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          choices: [{ message: { role: 'assistant', content: reply } }],
          usage: { total_tokens: 31 },
        }))
        return
      }

      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'Unknown mock route' } }))
    })
  })

  await new Promise<void>(resolve => llmServer.listen(0, '127.0.0.1', resolve))
  const mockLlmPort = (llmServer.address() as { port: number }).port
  const mockLlmBase = `http://127.0.0.1:${mockLlmPort}`

  let app: Awaited<ReturnType<typeof buildApp>> | null = null
  let openSseHandles: LiveSseHandle[] = []
  let ipCounter = 10
  const nextIp = () => `127.0.12.${ipCounter++}`

  try {
    syncSchema()
    await seedReference()
    ensureAgents()

    const {
      loadUser,
      hashPassword,
      signRoleGrant,
      verifyRoleGrant,
      consumeStreamTicket,
    } = authMod
    const {
      RESTRICTED_STAFF_PERMISSIONS,
      HR_ROLE_PERMISSIONS,
      OFFICE_ADMIN_PERMISSIONS,
      MANAGER_PERMISSIONS,
      canAccessCrmVault,
      canAccessFieldLiveMap,
      canOpenEmployeeRecords,
      canPrintReceptionQr,
      canViewEmployeeRecords,
      isAdminSwkUser,
      isOwnerSwkUser,
    } = staffAccess

    const dxbBranchId = q.val<number>(`SELECT id FROM branches WHERE code = 'DXB'`)!
    const ownerRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'Owner'`)!
    const adminRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'Admin'`)!
    const hrRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'HR'`)!
    const staffRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'Staff (Attendance & General)'`)!
    const portalRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'Customer Portal'`)!
    assert.ok(dxbBranchId && ownerRoleId && adminRoleId && hrRoleId && staffRoleId && portalRoleId)

    const now = new Date().toISOString()

    // =========================================================================
    // Provision & resolve ALL 8 Personas
    // =========================================================================
    // 1. Owner (shabib@swk.properties)
    const ownerRow = q.get<{ id: number }>(`SELECT id FROM users WHERE lower(email) = 'shabib@swk.properties' AND deleted_at IS NULL`)!
    // 2. Admin (admin@swk.properties)
    const adminRow = q.get<{ id: number }>(`SELECT id FROM users WHERE lower(email) = 'admin@swk.properties' AND deleted_at IS NULL`)!
    // 3. Manager (haseeb@swk.properties)
    const managerRow = q.get<{ id: number }>(`SELECT id FROM users WHERE lower(email) = 'haseeb@swk.properties' AND deleted_at IS NULL`)!
    // 6. Field Agent (hardcoded SWK agent email: talha@swk.properties)
    const fieldAgentRow = q.get<{ id: number }>(`SELECT id FROM users WHERE lower(email) = 'talha@swk.properties' AND deleted_at IS NULL`)!
    assert.ok(ownerRow && adminRow && managerRow && fieldAgentRow, 'Seeded SWK canonical accounts must exist')

    // Start Fastify app & listen on loopback for real HTTP + SSE connections
    const server = await buildApp()
    app = server
    const baseUrl = await server.listen({ port: 0, host: '127.0.0.1' })

    const loginWeb = async (email: string, password: string) => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: nextIp(),
        headers: { 'content-type': 'application/json', 'x-swk-client': 'web' },
        payload: { email, password },
      })
      assert.equal(res.statusCode, 200, `Web login failed for ${email}: ${res.statusCode} ${res.body}`)
      const sid = res.cookies.find((c: any) => c.name === 'swk_sid')
      assert.ok(sid?.value, `Expected swk_sid cookie for ${email}`)
      return `swk_sid=${sid.value}`
    }

    const loginMobile = async (email: string, password: string, deviceName: string) => {
      const { jwk, expectedDeviceId } = makeEcP256Jwk()
      const res = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: nextIp(),
        headers: { 'content-type': 'application/json', 'x-swk-client': 'mobile', 'user-agent': 'SWK-Mobile-E2E/2.5' },
        payload: { email, password, device_pub: jwk, device_name: deviceName, platform: 'android', app_version: '2.5.0' },
      })
      assert.equal(res.statusCode, 200, `Mobile login failed for ${email}: ${res.statusCode} ${res.body}`)
      const body = res.json() as any
      assert.equal(body.device_id, expectedDeviceId)
      return { token: body.session_token as string, deviceId: expectedDeviceId, deviceStatus: body.device_status as string }
    }

    const ownerCookie = await loginWeb('shabib@swk.properties', config.accounts.ownerPassword)
    const adminCookie = await loginWeb('admin@swk.properties', config.accounts.adminSwkPassword)
    const managerCookie = await loginWeb('haseeb@swk.properties', config.accounts.managerPassword)
    const fieldAgentCookie = await loginWeb('talha@swk.properties', config.accounts.bdmPassword)

    // 4. HR (properly HMAC-signed role_grant_sig via signRoleGrant / Admin provisioning)
    const hrPw = 'HrPersona-2026!'
    const hrCreateRes = await server.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: adminCookie },
      payload: {
        name: 'HR Persona 13',
        email: 'hr-e2e@swk.properties',
        password: hrPw,
        role_name: 'HR',
        branch_id: dxbBranchId,
      },
    })
    assert.equal(hrCreateRes.statusCode, 201, `Create signed HR user failed: ${hrCreateRes.body}`)
    const hrId = Number((hrCreateRes.json() as any).user.id)
    const hrSigInDb = q.val<string | null>(`SELECT role_grant_sig FROM users WHERE id = ?`, hrId)
    assert.ok(hrSigInDb && verifyRoleGrant(hrId, 'hr-e2e@swk.properties', 'HR', hrSigInDb), 'HR user must carry valid HMAC role_grant_sig')
    const hrCookie = await loginWeb('hr-e2e@swk.properties', hrPw)

    // 5. Office Admin (properly HMAC-signed role_grant_sig via signRoleGrant)
    const officePw = 'OfficePersona-2026!'
    const officeAdminRoleId = q.val<number>(`SELECT id FROM roles WHERE name = 'Office Admin'`)!
    assert.ok(officeAdminRoleId, 'Office Admin role must be seeded')
    const officeId = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'Office Admin Persona 14',
      'office-e2e@swk.properties',
      hashPassword(officePw),
      officeAdminRoleId,
      dxbBranchId,
      1,
      0,
      now,
      now,
    )
    const officeSig = signRoleGrant(officeId, 'office-e2e@swk.properties', 'Office Admin')
    q.run(`UPDATE users SET role_grant_sig = ?, role_granted_by = ? WHERE id = ?`, officeSig, ownerRow.id, officeId)
    assert.equal(verifyRoleGrant(officeId, 'office-e2e@swk.properties', 'Office Admin', officeSig), true)
    const officeCookie = await loginWeb('office-e2e@swk.properties', officePw)

    // 7. Newly Added Staff #15 (staff15@swk.properties) created cleanly, then tampered in SQLite
    const staff15Pw = 'Staff15Pass-2026!'
    const staff15CreateRes = await server.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: adminCookie },
      payload: {
        name: 'Newly Added Staff 15',
        email: 'staff15@swk.properties',
        password: staff15Pw,
        role_name: 'Staff (Attendance & General)',
        branch_id: dxbBranchId,
      },
    })
    assert.equal(staff15CreateRes.statusCode, 201, `Create Staff #15 failed: ${staff15CreateRes.body}`)
    const staff15Id = Number((staff15CreateRes.json() as any).user.id)

    // 8. Portal Client (party_id set)
    const portalPw = 'PortalClient-2026!'
    const portalPartyId = q.insert(
      `INSERT INTO parties(code, name, is_customer, status, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
      'P-E2E-PORTAL', 'E2E Portal Client LLC', 1, 'Active', now, now,
    )
    const portalId = q.insert(
      `INSERT INTO users(name, email, password_hash, role_id, branch_id, party_id, active, must_change_password, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      'Portal Client User', 'portal-e2e@client.test', hashPassword(portalPw), portalRoleId, dxbBranchId, portalPartyId, 1, 0, now, now,
    )
    const portalCookie = await loginWeb('portal-e2e@client.test', portalPw)

    // Verify all 8 personas' baseline loadUser() capabilities
    const uOwner = loadUser(ownerRow.id)!
    const uAdmin = loadUser(adminRow.id)!
    const uManager = loadUser(managerRow.id)!
    const uHr = loadUser(hrId)!
    const uOffice = loadUser(officeId)!
    const uFieldAgent = loadUser(fieldAgentRow.id)!
    const uPortal = loadUser(portalId)!

    assert.equal(uOwner.role_name, 'Owner')
    assert.equal(isOwnerSwkUser(uOwner), true)
    assert.equal(canPrintReceptionQr(uOwner), true)
    assert.equal(uAdmin.role_name, 'Admin')
    assert.equal(isAdminSwkUser(uAdmin), true)
    assert.equal(canPrintReceptionQr(uAdmin), true)
    assert.equal(uManager.role_name, 'Manager')
    assert.deepEqual(uManager.permissions, MANAGER_PERMISSIONS)
    assert.equal(canAccessCrmVault(uManager), true)
    assert.equal(canAccessFieldLiveMap(uManager), true)
    assert.equal(canPrintReceptionQr(uManager), true)
    assert.equal(canOpenEmployeeRecords(uManager), false)
    assert.equal(uHr.role_name, 'HR')
    assert.deepEqual(uHr.permissions, HR_ROLE_PERMISSIONS)
    assert.equal(canViewEmployeeRecords(uHr), true)
    assert.equal(canAccessCrmVault(uHr), false)
    assert.equal(canPrintReceptionQr(uHr), false)
    assert.equal(uOffice.role_name, 'Office Admin')
    assert.deepEqual(uOffice.permissions, OFFICE_ADMIN_PERMISSIONS)
    assert.equal(canViewEmployeeRecords(uOffice), false)
    assert.equal(canAccessCrmVault(uOffice), false)
    assert.equal(canPrintReceptionQr(uOffice), false)
    assert.equal(uFieldAgent.role_name, 'Staff (Attendance & General)')
    assert.deepEqual(uFieldAgent.permissions, RESTRICTED_STAFF_PERMISSIONS)
    assert.equal(canPrintReceptionQr(uFieldAgent), false)
    assert.ok(uPortal.party_id === portalPartyId)
    assert.equal(canPrintReceptionQr(uPortal), false)

    // =========================================================================
    // GATE 1: Privilege Escalation Immunity (loadUser clamping + 403 matrix)
    // =========================================================================
    // Tamper Staff #15 to HR without signature -> clamped + security_tamper
    q.run(`UPDATE users SET role_id = ?, role_grant_sig = NULL WHERE id = ?`, hrRoleId, staff15Id)
    const clampedMissingSig = loadUser(staff15Id)!
    assert.equal(clampedMissingSig.role_name, 'Staff (Attendance & General)', 'Unsigned HR DB mutation must clamp to Staff')
    assert.deepEqual(clampedMissingSig.permissions, RESTRICTED_STAFF_PERMISSIONS)

    // Tamper Staff #15 to HR with forged signature -> clamped + security_tamper
    q.run(`UPDATE users SET role_id = ?, role_grant_sig = ? WHERE id = ?`, hrRoleId, 'forged-hmac-deadbeef', staff15Id)
    const clampedForgedSig = loadUser(staff15Id)!
    assert.equal(clampedForgedSig.role_name, 'Staff (Attendance & General)', 'Forged HR signature must clamp to Staff')
    assert.deepEqual(clampedForgedSig.permissions, RESTRICTED_STAFF_PERMISSIONS)

    // Attempting to sign an elevated role grant must throw synchronously
    assert.throws(() => signRoleGrant(staff15Id, 'staff15@swk.properties', 'Owner' as any))

    // Tamper Staff #15 to Owner -> clamped + security_tamper
    q.run(`UPDATE users SET role_id = ?, role_grant_sig = ? WHERE id = ?`, ownerRoleId, signRoleGrant(staff15Id, 'staff15@swk.properties', 'HR'), staff15Id)
    const clampedOwner = loadUser(staff15Id)!
    assert.equal(clampedOwner.role_name, 'Staff (Attendance & General)', 'Tampered Owner DB mutation on staff #15 must clamp to Staff')
    assert.deepEqual(clampedOwner.permissions, RESTRICTED_STAFF_PERMISSIONS)

    // Leave Staff #15 tampered in SQLite to Admin role_id WHILE testing HTTP endpoints!
    q.run(`UPDATE users SET role_id = ?, role_grant_sig = NULL WHERE id = ?`, adminRoleId, staff15Id)
    const clampedAdmin = loadUser(staff15Id)!
    assert.equal(clampedAdmin.role_name, 'Staff (Attendance & General)', 'Tampered Admin DB mutation on staff #15 must clamp to Staff')
    assert.deepEqual(clampedAdmin.permissions, RESTRICTED_STAFF_PERMISSIONS)
    const staff15TamperLogs = q.all<any>(
      `SELECT id FROM audit_log WHERE entity = 'users' AND record_id = ? AND action = 'security_tamper'`,
      staff15Id,
    )
    assert.ok(staff15TamperLogs.length >= 1, 'Tampering Staff #15 role must emit security_tamper audit log')

    // Portal Client tampered to Owner role_id -> clamped to Customer Portal {}
    q.run(`UPDATE users SET role_id = ? WHERE id = ?`, ownerRoleId, portalId)
    const clampedPortal = loadUser(portalId)!
    assert.equal(clampedPortal.role_name, 'Customer Portal')
    assert.deepEqual(clampedPortal.permissions, {})

    const staff15Cookie = await loginWeb('staff15@swk.properties', staff15Pw)

    // Exhaustive 403 checks for all non-privileged personas across privileged endpoints
    const privilegedEndpoints: Array<{ method: 'GET' | 'POST' | 'PUT'; url: string; payload?: any }> = [
      { method: 'GET', url: '/api/admin/settings' },
      { method: 'PUT', url: '/api/admin/settings', payload: { company_name: 'Tampered Co' } },
      { method: 'GET', url: '/api/admin/audit' },
      { method: 'POST', url: '/api/admin/users', payload: { name: 'X', email: 'x@swk.properties', password: 'Password-2026!', role_name: 'HR' } },
      { method: 'GET', url: '/api/crm-vault/summary' },
      { method: 'GET', url: '/api/crm-vault/properties' },
      { method: 'POST', url: '/api/crm-vault/assign', payload: { property_ids: [1], agent_user_id: fieldAgentRow.id } },
      { method: 'GET', url: '/api/field-gps/live' },
      { method: 'GET', url: '/api/field-gps/stream' },
      { method: 'GET', url: '/api/ai/brief' },
      { method: 'POST', url: '/api/ai/agents/hire', payload: { template: 'jarvis' } },
      { method: 'POST', url: '/api/ai/agents/1/run', payload: {} },
      { method: 'GET', url: '/api/omni-ai/routes' },
      { method: 'GET', url: '/api/sip/admin/config' },
      { method: 'PUT', url: '/api/sip/admin/config', payload: { sip_enabled: true } },
      { method: 'GET', url: '/api/sip/admin/extensions' },
      { method: 'GET', url: '/api/swk-ops/reception-token' },
      { method: 'POST', url: '/api/swk-ops/reception-token/regenerate', payload: {} },
      { method: 'GET', url: '/api/swk-ops/owner-admin-control' },
    ]

    for (const [personaLabel, cookie] of [
      ['HR (signed)', hrCookie],
      ['Office Admin (signed)', officeCookie],
      ['Field Agent (Talha)', fieldAgentCookie],
      ['Staff #15 (DB tampered to Admin)', staff15Cookie],
      ['Portal Client (DB tampered to Owner)', portalCookie],
    ] as const) {
      for (const ep of privilegedEndpoints) {
        const res = await server.inject({
          method: ep.method,
          url: ep.url,
          headers: {
            cookie,
            'x-swk-client': 'web',
            ...(ep.payload ? { 'content-type': 'application/json' } : {}),
          },
          payload: ep.payload,
        })
        assert.equal(res.statusCode, 403, `${personaLabel} must get 403 on ${ep.method} ${ep.url}, got ${res.statusCode}: ${res.body}`)
      }
    }

    // Leadership positive checks + Owner/Admin/Manager role boundaries
    for (const [leaderLabel, cookie] of [
      ['Owner', ownerCookie],
      ['Admin', adminCookie],
      ['Manager', managerCookie],
    ] as const) {
      assert.equal((await server.inject({ method: 'GET', url: '/api/crm-vault/summary', headers: { cookie } })).statusCode, 200, `${leaderLabel} allowed on /api/crm-vault/summary`)
      assert.equal((await server.inject({ method: 'GET', url: '/api/field-gps/live', headers: { cookie } })).statusCode, 200, `${leaderLabel} allowed on /api/field-gps/live`)
      assert.equal((await server.inject({ method: 'GET', url: '/api/ai/brief', headers: { cookie } })).statusCode, 200, `${leaderLabel} allowed on /api/ai/brief`)
      assert.equal((await server.inject({ method: 'GET', url: '/api/swk-ops/reception-token', headers: { cookie } })).statusCode, 200, `${leaderLabel} allowed on /api/swk-ops/reception-token`)
    }

    // Manager is forbidden from Admin-only Omni-Route & SIP trunk admin & hiring AI agents; Admin cannot sign out Owner
    assert.equal((await server.inject({ method: 'GET', url: '/api/omni-ai/routes', headers: { cookie: managerCookie } })).statusCode, 403)
    assert.equal((await server.inject({ method: 'GET', url: '/api/sip/admin/config', headers: { cookie: managerCookie } })).statusCode, 403)
    assert.equal((await server.inject({ method: 'POST', url: '/api/ai/agents/hire', headers: { cookie: managerCookie, 'x-swk-client': 'web', 'content-type': 'application/json' }, payload: { template: 'jarvis' } })).statusCode, 403)
    assert.equal((await server.inject({ method: 'POST', url: `/api/admin/users/${ownerRow.id}/sign-out`, headers: { cookie: adminCookie, 'x-swk-client': 'web' } })).statusCode, 400)
    assert.equal((await server.inject({ method: 'POST', url: '/api/swk-ops/owner-admin-control/action', headers: { cookie: adminCookie, 'x-swk-client': 'web', 'content-type': 'application/json' }, payload: { action: 'unlock' } })).statusCode, 403)

    // =========================================================================
    // Seed Shared Confidential & Brokerage Test Fixtures (for AI, Search & SIP)
    // =========================================================================
    const secretEmp = createRecord(getDef('employees'), {
      emp_no: 'EMP-KENS-901',
      name: 'Kensington Confidential Visa Director',
      email: 'kens-hr-secret@swk.properties',
      status: 'Active',
      join_date: '2026-01-01',
      visa_expiry: new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10),
    }, SYSTEM_CTX)
    assert.ok(secretEmp.id > 0)

    const secretEmpAttachId = q.insert(
      `INSERT INTO attachments(file_name, category, link_entity, link_id, link_label, note, stored_name, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      'Kensington Visa Annexure Scan.pdf',
      'KYC',
      'employees',
      secretEmp.id,
      'Kensington Confidential Visa Director',
      'Emirates ID, passport & compensation addendum',
      'kens-visa-secret.pdf',
      now,
      now,
    )

    // Office Admin cannot read/list/lookup/create/export HR PII entities or payroll/WPS routes
    for (const check of [
      { method: 'GET' as const, url: '/api/e/employees' },
      { method: 'GET' as const, url: '/api/e/employees/lookup?q=' },
      { method: 'POST' as const, url: '/api/e/employees', payload: { name: 'Blocked Office Create', status: 'Active', branch_id: dxbBranchId } },
      { method: 'GET' as const, url: '/api/e/payslips' },
      { method: 'GET' as const, url: '/api/e/wps_batches' },
      { method: 'GET' as const, url: '/api/e/immigration_cases' },
      { method: 'GET' as const, url: '/api/e/hr_lifecycle_cases' },
      { method: 'GET' as const, url: '/api/hr/wps/2026-11' },
      { method: 'POST' as const, url: '/api/hr/payroll/generate', payload: { period: '2026-11' } },
      { method: 'GET' as const, url: `/api/files/${secretEmpAttachId}/download` },
    ]) {
      const hrDenyRes = await server.inject({
        method: check.method,
        url: check.url,
        headers: {
          cookie: officeCookie,
          'x-swk-client': 'web',
          ...(check.payload ? { 'content-type': 'application/json' } : {}),
        },
        payload: check.payload,
      })
      assert.equal(hrDenyRes.statusCode, 403, `Office Admin must get 403 on ${check.method} ${check.url}, got ${hrDenyRes.statusCode}: ${hrDenyRes.body}`)
    }

    const kensPartyId = q.insert(
      `INSERT INTO parties(code, name, is_customer, status, phone, email, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      'P-KENS-VIP', 'Kensington Secret VIP Buyer LLC', 1, 'Active', '+971509112233', 'vip-kens@example.ae', now, now,
    )
    const overdueDate = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10)
    q.insert(
      `INSERT INTO invoices(invoice_no, doc_type, party_id, invoice_date, due_date, currency, status, balance, total, reference, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      'INV-KENS-901', 'Tax Invoice', kensPartyId, overdueDate, overdueDate, 'AED', 'Posted', 12_500_000, 12_500_000, 'Kensington Overdue Commission Secret', now, now,
    )

    createRecord(getDef('leads'), {
      company: 'Kensington Walk-In Lead Co',
      contact_name: 'Nadia Kensington',
      email: 'nadia-kens@example.ae',
      phone: '+971504447788',
      status: 'New',
      source: 'Website',
    }, SYSTEM_CTX)

    const rawOwnerPhoneAssigned = '+971507778899'
    const rawOwnerDigitsAssigned = '971507778899'
    const rawOwnerLocalAssigned = '507778899'
    const rawOwnerPhoneUnassigned = '+971506665544'

    const assignedVaultId = q.insert(
      `INSERT INTO crm_vault_properties(
        external_deal_id, source_dataset, source_sheet, deal_division,
        dubai_area_community, building_or_project, exact_unit_door_no,
        owner_name, direct_mobile_enc, direct_mobile_masked,
        assigned_user_id, assigned_by_user_id, assigned_at, visible_fields_json,
        vault_status, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      'VAULT-KENS-MINE', 'cluster_1920', 'Sheet1', 'SECONDARY_SALES',
      'Dubai Marina', 'Kensington Assigned Marina Tower', '1802',
      'Confidential Owner Alpha', encryptSecret(rawOwnerPhoneAssigned), 'MASKED •••• 8899',
      fieldAgentRow.id, ownerRow.id, now,
      JSON.stringify({ show_owner_name: false, allow_masked_call: true, allow_masked_whatsapp: true }),
      'Assigned', now, now,
    )

    const unassignedVaultId = q.insert(
      `INSERT INTO crm_vault_properties(
        external_deal_id, source_dataset, source_sheet, deal_division,
        dubai_area_community, building_or_project, exact_unit_door_no,
        owner_name, direct_mobile_enc, direct_mobile_masked,
        vault_status, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      'VAULT-KENS-UNASSIGNED', 'cluster_1920', 'Sheet1', 'SECONDARY_SALES',
      'Downtown Dubai', 'Kensington Hidden Unassigned Tower', '4401',
      'Unassigned Hidden Owner', encryptSecret(rawOwnerPhoneUnassigned), 'MASKED •••• 5544',
      'In Vault', now, now,
    )
    assert.ok(assignedVaultId > 0 && unassignedVaultId > 0)

    // Published public website listing
    createRecord(getDef('website_listings'), {
      reference: 'SWK-KENS-PUBLIC-1',
      slug: 'kensington-waterfront-villa',
      title: 'Kensington Waterfront Sky Villa',
      purpose: 'buy',
      status: 'available',
      property_type: 'Villa',
      published: true,
      community: 'Dubai Marina',
      building: 'Kensington Residences',
      price_aed: 8500000,
      bedrooms: 5,
      area_sqft: 5400,
    }, SYSTEM_CTX)

    // Private Word Docs & Private Owner<->Manager DM
    const ownerDocRes = await server.inject({
      method: 'POST',
      url: '/api/utilities/word',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: ownerCookie },
      payload: { title: 'Kensington Owner Executive Strategy Memo', html_content: '<p>Confidential executive board payout notes</p>' },
    })
    assert.equal(ownerDocRes.statusCode, 201)

    const agentDocRes = await server.inject({
      method: 'POST',
      url: '/api/utilities/word',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: fieldAgentCookie },
      payload: { title: 'Kensington Field Agent Viewing Checklist', html_content: '<p>Field agent viewing prep notes</p>' },
    })
    assert.equal(agentDocRes.statusCode, 201)

    const execDmRes = await server.inject({
      method: 'POST',
      url: '/api/chat/threads',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: ownerCookie },
      payload: { user_ids: [managerRow.id] },
    })
    assert.equal(execDmRes.statusCode, 200)
    const execDmId = Number((execDmRes.json() as any).id)
    const execDmMsgRes = await server.inject({
      method: 'POST',
      url: `/api/chat/threads/${execDmId}/messages`,
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: ownerCookie },
      payload: { body: 'Kensington private executive commission split discussion' },
    })
    assert.equal(execDmMsgRes.statusCode, 200)

    // =========================================================================
    // GATE 3: Omni-Route Multi-Key Failover (429 -> 503 -> 200 + Cooldown)
    // =========================================================================
    const mkOmniRoute = async (payload: any) => {
      const r = await server.inject({
        method: 'POST',
        url: '/api/omni-ai/routes',
        headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: adminCookie },
        payload,
      })
      assert.equal(r.statusCode, 201, `Create Omni route failed: ${r.body}`)
      const json = r.json() as any
      assert.ok(!JSON.stringify(json).includes(payload.api_key), 'Route response must never return raw API key')
      assert.equal(json.api_key_masked, '********')
      return json
    }

    const rFail429 = await mkOmniRoute({
      label: 'Primary Groq 429',
      provider_key: 'groq',
      base_url: `${mockLlmBase}/r429/v1`,
      api_key: 'super-secret-key-429',
      model_id: 'openai/gpt-oss-20b',
      lanes: ['general', 'fast', 'reasoning'],
      tier: 'free',
      priority: 10,
      zero_retention: false,
    })
    const rFail503 = await mkOmniRoute({
      label: 'Secondary OpenRouter 503',
      provider_key: 'openrouter',
      base_url: `${mockLlmBase}/r503/v1`,
      api_key: 'super-secret-key-503',
      model_id: 'openrouter/free',
      lanes: ['general', 'fast', 'reasoning'],
      tier: 'free',
      priority: 20,
      zero_retention: false,
    })
    const rFreeOk = await mkOmniRoute({
      label: 'Tertiary Gemini Free 200',
      provider_key: 'gemini',
      base_url: `${mockLlmBase}/free-ok/v1`,
      api_key: 'super-secret-key-200',
      model_id: 'gemini-2.5-flash',
      lanes: ['general', 'fast', 'reasoning'],
      tier: 'free',
      priority: 30,
      zero_retention: false,
    })

    const tFailover0 = Date.now()
    const failoverRes = await server.inject({
      method: 'POST',
      url: '/api/omni-ai/chat',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: fieldAgentCookie },
      payload: { message: 'Summarize Marina rent trends', mode: 'fast' },
    })
    const failoverMs = Date.now() - tFailover0
    assert.equal(failoverRes.statusCode, 200, `Omni-Route failover failed: ${failoverRes.body}`)
    const failoverJson = failoverRes.json() as any
    assert.equal(failoverJson.route_id, rFreeOk.id, 'Must transparently fail over 429 -> 503 -> 200 route')
    assert.equal(failoverJson.attempts, 3, 'Expected 3 attempts across 429 -> 503 -> 200')
    assert.ok(failoverMs < 1500, `Expected fast failover on loopback (<1500ms), took ${failoverMs}ms`)
    assert.equal(llmHits.r429.length, 1)
    assert.equal(llmHits.r503.length, 1)
    assert.equal(llmHits.rFreeOk.length, 1)

    const r429Cd = q.val<string | null>(`SELECT cooldown_until FROM ai_provider_routes WHERE id = ?`, rFail429.id)
    const r503Cd = q.val<string | null>(`SELECT cooldown_until FROM ai_provider_routes WHERE id = ?`, rFail503.id)
    assert.ok(r429Cd && Date.parse(r429Cd) - Date.now() >= 110_000, '429 route must honor Retry-After: 120 cooldown')
    assert.ok(r503Cd && Date.parse(r503Cd) - Date.now() >= 45_000, '503 route must be placed in stepped cooldown')

    // Subsequent request respects cooldowns and goes straight to rFreeOk
    const postCooldownRes = await server.inject({
      method: 'POST',
      url: '/api/omni-ai/chat',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: fieldAgentCookie },
      payload: { message: 'Second prompt while primary & secondary cooling down', mode: 'fast' },
    })
    assert.equal(postCooldownRes.statusCode, 200)
    assert.equal((postCooldownRes.json() as any).route_id, rFreeOk.id)
    assert.equal(llmHits.r429.length, 1, 'Cooled-down 429 route must not be called again')
    assert.equal(llmHits.r503.length, 1, 'Cooled-down 503 route must not be called again')
    assert.equal(llmHits.rFreeOk.length, 2)

    // Admin health & routes list never leak raw API keys
    const adminRoutesRes = await server.inject({ method: 'GET', url: '/api/omni-ai/routes', headers: { cookie: adminCookie } })
    assert.equal(adminRoutesRes.statusCode, 200)
    assert.ok(!adminRoutesRes.body.includes('super-secret-key-'), 'Admin routes listing must mask API keys')

    // =========================================================================
    // GATE 2: AI Brain Zero-Leak (Tool Allowlists + PII Scrub + Confidential Fail-Closed)
    // =========================================================================
    // 2a. Confidential Mode fails closed when ONLY zero_retention=false routes exist
    const hitsBeforeConfFail = llmHits.rFreeOk.length
    const ownerConfFailRes = await server.inject({
      method: 'POST',
      url: '/api/omni-ai/chat',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: ownerCookie },
      payload: { message: 'Audit confidential partner payouts', confidential: true },
    })
    assert.equal(ownerConfFailRes.statusCode, 503, `Confidential Mode must fail closed with 503 when no zero_retention route exists, got ${ownerConfFailRes.statusCode}: ${ownerConfFailRes.body}`)
    assert.equal(llmHits.rFreeOk.length, hitsBeforeConfFail, 'Confidential Mode must NEVER send prompt to zero_retention=false route')

    // Non-leadership requesting confidential mode gets 403
    for (const [label, cookie] of [
      ['Field Agent', fieldAgentCookie],
      ['Staff #15', staff15Cookie],
      ['HR', hrCookie],
      ['Office Admin', officeCookie],
    ] as const) {
      const denyConf = await server.inject({
        method: 'POST',
        url: '/api/omni-ai/chat',
        headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie },
        payload: { message: 'Try confidential mode', confidential: true },
      })
      assert.equal(denyConf.statusCode, 403, `${label} must get 403 for confidential=true`)
    }

    // Legacy /api/ai/chat as Owner (executive agent Jarvis) also fails closed with 503 without zero_retention route
    const jarvisRow = q.get<{ id: number }>(`SELECT id FROM ai_agents WHERE role_key = 'jarvis' AND deleted_at IS NULL`)!
    assert.ok(jarvisRow, 'Jarvis agent must be seeded')
    const legacyFailRes = await server.inject({
      method: 'POST',
      url: '/api/ai/chat',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: ownerCookie },
      payload: { agent_id: jarvisRow.id, message: 'Executive morning check' },
    })
    assert.equal(legacyFailRes.statusCode, 503, `Owner /api/ai/chat without zero_retention route must fail closed with 503, got ${legacyFailRes.statusCode}: ${legacyFailRes.body}`)
    assert.match(legacyFailRes.body, /zero[- ]retention|confidential/i)
    assert.equal(llmHits.rFreeOk.length, hitsBeforeConfFail, 'Owner /api/ai/chat must NEVER touch zero_retention=false route')

    // 2b. PII Shield strips +971 phones, 784- EIDs, AE IBANs & emails before zero_retention=false route
    const piiPrompt = 'Contact client at +971 50 321 9876, Emirates ID 784-1992-9876543-1, IBAN AE070331234567890123456, email vip.buyer@example.ae'
    const piiRes = await server.inject({
      method: 'POST',
      url: '/api/omni-ai/chat',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: fieldAgentCookie },
      payload: { message: piiPrompt },
    })
    assert.equal(piiRes.statusCode, 200, `PII shield Omni chat failed: ${piiRes.body}`)
    const outboundPiiCall = llmHits.rFreeOk[llmHits.rFreeOk.length - 1]!
    const outboundPayloadStr = JSON.stringify(outboundPiiCall.body.messages)
    assert.ok(!outboundPayloadStr.includes('+971 50 321 9876'), 'Phone must be scrubbed before leaving server')
    assert.ok(!outboundPayloadStr.includes('784-1992-9876543-1'), 'Emirates ID must be scrubbed before leaving server')
    assert.ok(!outboundPayloadStr.includes('AE070331234567890123456'), 'IBAN must be scrubbed before leaving server')
    assert.ok(!outboundPayloadStr.includes('vip.buyer@example.ae'), 'Email must be scrubbed before leaving server')
    const piiJson = piiRes.json() as any
    assert.ok(piiJson.pii_redacted >= 4, `Expected pii_redacted >= 4, got ${piiJson.pii_redacted}`)
    assert.ok(piiJson.content.includes('+971 50 321 9876') && piiJson.content.includes('784-1992-9876543-1'), 'PII must be restored locally for authorized user')

    // 2c. Field Agent & Staff #15 tool restrictions on BOTH /api/omni-ai/chat (use_tools=true) and /api/ai/chat
    for (const [label, cookie] of [
      ['Field Agent (Talha)', fieldAgentCookie],
      ['Staff #15 (tampered Admin)', staff15Cookie],
    ] as const) {
      const hitsBefore: number = llmHits.rFreeOk.length
      const omniToolRes = await server.inject({
        method: 'POST',
        url: '/api/omni-ai/chat',
        headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie },
        payload: {
          message: 'RESTRICTED_TOOL_PROBE Give me overdue invoices, employee visas, and Vault owner phone numbers',
          use_tools: true,
        },
      })
      assert.equal(omniToolRes.statusCode, 200, `${label} /api/omni-ai/chat failed: ${omniToolRes.body}`)
      const planningHit: { url: string; headers: http.IncomingHttpHeaders; body: any } = llmHits.rFreeOk[hitsBefore]!
      const offeredTools = new Set<string>((planningHit.body.tools ?? []).map((t: any) => String(t.function?.name)))
      assert.equal(offeredTools.has('overdue_invoices'), false, `${label} must NEVER be offered overdue_invoices`)
      assert.equal(offeredTools.has('expiring_documents'), false, `${label} must NEVER be offered expiring_documents`)
      assert.equal(offeredTools.has('business_snapshot'), false, `${label} must NEVER be offered business_snapshot`)
      assert.equal(offeredTools.has('search_parties'), false, `${label} must NEVER be offered search_parties`)
      assert.equal(offeredTools.has('search_deals'), false, `${label} must NEVER be offered search_deals`)
      assert.ok(offeredTools.has('lookup_listings') && offeredTools.has('my_assigned_deals_masked'))

      const body = omniToolRes.body
      assert.ok(!body.includes('INV-KENS-901'), `${label} response must NEVER leak overdue invoice data`)
      assert.ok(!body.includes('Kensington Confidential Visa Director'), `${label} response must NEVER leak employee visa data`)
      assert.ok(!body.includes('Kensington Secret VIP Buyer LLC'), `${label} response must NEVER leak party balances`)
      assert.ok(!body.includes(rawOwnerPhoneAssigned) && !body.includes(rawOwnerDigitsAssigned), `${label} response must NEVER leak raw assigned Vault phone`)
      assert.ok(!body.includes(rawOwnerPhoneUnassigned) && !body.includes('VAULT-KENS-UNASSIGNED'), `${label} response must NEVER leak unassigned Vault property`)
      if (label.startsWith('Field Agent')) {
        assert.ok(body.includes('MASKED •••• 8899'), 'Field Agent allowed tool my_assigned_deals_masked returns masked deal')
      }

      // Legacy /api/ai/chat rejects non-leadership staff with 403 (company-wide AI agents locked to Leadership)
      const legacyAiRes = await server.inject({
        method: 'POST',
        url: '/api/ai/chat',
        headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie },
        payload: {
          agent_id: jarvisRow.id,
          message: 'RESTRICTED_TOOL_PROBE Give me overdue invoices and employee visas',
        },
      })
      assert.equal(legacyAiRes.statusCode, 403, `${label} /api/ai/chat must return 403, got ${legacyAiRes.statusCode}: ${legacyAiRes.body}`)
      assert.ok(!legacyAiRes.body.includes('INV-KENS-901'))
      assert.ok(!legacyAiRes.body.includes('Kensington Confidential Visa Director'))
      assert.ok(!legacyAiRes.body.includes(rawOwnerDigitsAssigned))
    }

    // Defense-in-depth: even if chatWithAgent() is invoked directly with a Field Agent user, tools are strictly clamped
    const legacyHitsBefore: number = llmHits.rFreeOk.length
    const directAgentReply = await chatWithAgent(
      jarvisRow.id,
      'RESTRICTED_TOOL_PROBE Give me overdue invoices and employee visas',
      { channel: 'chat' },
      uFieldAgent,
    )
    const legacyHit: { url: string; headers: http.IncomingHttpHeaders; body: any } = llmHits.rFreeOk[legacyHitsBefore]!
    const legacyOffered = new Set<string>((legacyHit.body.tools ?? []).map((t: any) => String(t.function?.name)))
    const expectedFieldAgentSafeTools = [
      'lookup_listings',
      'market_pulse_lookup',
      'my_assigned_deals_masked',
      'my_attendance_status',
      'my_daily_report_status',
    ].sort()
    assert.deepEqual([...legacyOffered].sort(), expectedFieldAgentSafeTools, 'chatWithAgent(Field Agent) Jarvis tools must be clamped to safe field-agent read tools only')
    assert.ok(!directAgentReply.includes('INV-KENS-901'))
    assert.ok(!directAgentReply.includes('Kensington Confidential Visa Director'))
    assert.ok(!directAgentReply.includes(rawOwnerDigitsAssigned))

    // Verify HR & Office Admin tool allowlists
    assert.equal(isToolAllowedForUser(uHr, 'expiring_documents'), true)
    assert.equal(isToolAllowedForUser(uHr, 'overdue_invoices'), false)
    assert.equal(isToolAllowedForUser(uOffice, 'open_tickets'), true)
    assert.equal(isToolAllowedForUser(uOffice, 'overdue_invoices'), false)
    assert.equal(isToolAllowedForUser(uOffice, 'expiring_documents'), false)
    assert.equal(isToolAllowedForUser(uPortal, 'lookup_listings'), false)

    // Enable zero_retention=true route -> Owner Confidential Mode & /api/ai/chat succeed cleanly on ZR route ONLY
    const rZrOk = await mkOmniRoute({
      label: 'Cloudflare Zero Retention 200',
      provider_key: 'cloudflare',
      base_url: `${mockLlmBase}/zr-ok/v1`,
      api_key: 'zr-secret-token',
      model_id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      lanes: ['general', 'fast', 'reasoning'],
      tier: 'free',
      priority: 40,
      zero_retention: true,
    })
    const freeHitsBeforeConfOk = llmHits.rFreeOk.length
    const zrHitsBeforeConfOk = llmHits.rZrOk.length
    const ownerConfOkRes = await server.inject({
      method: 'POST',
      url: '/api/omni-ai/chat',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: ownerCookie },
      payload: { message: 'Confidential board summary', confidential: true },
    })
    assert.equal(ownerConfOkRes.statusCode, 200, `Confidential Mode with ZR route failed: ${ownerConfOkRes.body}`)
    assert.equal((ownerConfOkRes.json() as any).route_id, rZrOk.id)
    assert.equal((ownerConfOkRes.json() as any).zero_retention, true)
    assert.equal(llmHits.rFreeOk.length, freeHitsBeforeConfOk, 'Confidential Mode must NEVER hit non-ZR route')
    assert.equal(llmHits.rZrOk.length, zrHitsBeforeConfOk + 1)

    const ownerLegacyZrRes = await server.inject({
      method: 'POST',
      url: '/api/ai/chat',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: ownerCookie },
      payload: { agent_id: jarvisRow.id, message: 'Executive morning check' },
    })
    assert.equal(ownerLegacyZrRes.statusCode, 200, `Owner /api/ai/chat with ZR route failed: ${ownerLegacyZrRes.body}`)
    assert.equal(llmHits.rFreeOk.length, freeHitsBeforeConfOk, 'Owner /api/ai/chat must NEVER touch non-ZR route')
    assert.equal(llmHits.rZrOk.length, zrHitsBeforeConfOk + 2, 'Owner /api/ai/chat must route exclusively to ZR route')

    // =========================================================================
    // GATE 4: Unified Search Zero-Leak (POST /api/search/unified)
    // =========================================================================
    for (const [label, cookie] of [
      ['Field Agent (Talha)', fieldAgentCookie],
      ['Staff #15 (DB tampered Admin)', staff15Cookie],
    ] as const) {
      const sRes = await server.inject({
        method: 'POST',
        url: '/api/search/unified',
        headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie },
        payload: { q: 'Kensington', scopes: ['internal', 'website', 'market'] },
      })
      assert.equal(sRes.statusCode, 200, `${label} unified search failed: ${sRes.body}`)
      const hits = (sRes.json() as any).results as any[]

      assert.ok(hits.some(h => h.entity === 'website_listings' && h.title.includes('Kensington Waterfront Sky Villa')), `${label} should see public website listing`)
      assert.equal(hits.filter(h => h.entity === 'employees').length, 0, `${label} must get ZERO employees`)
      assert.equal(hits.filter(h => h.entity === 'invoices').length, 0, `${label} must get ZERO invoices`)
      assert.equal(hits.filter(h => h.entity === 'crm_vault_properties').length, 0, `${label} must get ZERO raw crm_vault_properties`)
      assert.equal(hits.filter(h => h.entity === 'leads').length, 0, `${label} must get ZERO leads`)
      assert.ok(!sRes.body.includes('Kensington Owner Executive Strategy Memo'), `${label} must NEVER see Owner private Word doc`)
      assert.ok(!sRes.body.includes('Kensington private executive commission split discussion'), `${label} must NEVER see private Owner<->Manager DM`)
      assert.ok(!sRes.body.includes('Kensington Hidden Unassigned Tower'), `${label} must NEVER see unassigned Vault property`)
      assert.ok(!sRes.body.includes(rawOwnerDigitsAssigned) && !sRes.body.includes(rawOwnerLocalAssigned), `${label} must NEVER see raw Vault phone digits`)
      assert.ok(!sRes.body.includes('971506665544'), `${label} must NEVER see unassigned Vault phone digits`)
      if (label.startsWith('Field Agent')) {
        assert.ok(hits.some(h => h.entity === 'word_documents' && h.title.includes('Kensington Field Agent Viewing Checklist')))
        assert.ok(hits.some(h => h.entity === 'crm_vault_assigned' && h.meta?.phone_masked === 'MASKED •••• 8899'))
      }
    }

    // HR sees employees only (zero invoices, zero vault, zero Owner private Word docs)
    const hrSearch = await server.inject({
      method: 'POST',
      url: '/api/search/unified',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: hrCookie },
      payload: { q: 'Kensington', scopes: ['internal'] },
    })
    assert.equal(hrSearch.statusCode, 200)
    const hrHits = (hrSearch.json() as any).results as any[]
    assert.ok(hrHits.some(h => h.entity === 'employees'))
    assert.equal(hrHits.filter(h => h.entity === 'invoices').length, 0)
    assert.equal(hrHits.filter(h => h.entity === 'crm_vault_properties').length, 0)
    assert.ok(!hrSearch.body.includes('Kensington Owner Executive Strategy Memo'))

    // Office Admin sees leads (zero employees, zero invoices, zero vault)
    const officeSearch = await server.inject({
      method: 'POST',
      url: '/api/search/unified',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: officeCookie },
      payload: { q: 'Kensington', scopes: ['internal'] },
    })
    assert.equal(officeSearch.statusCode, 200)
    const officeHits = (officeSearch.json() as any).results as any[]
    assert.ok(officeHits.some(h => h.entity === 'leads'))
    assert.equal(officeHits.filter(h => h.entity === 'employees').length, 0)
    assert.equal(officeHits.filter(h => h.entity === 'invoices').length, 0)
    assert.equal(officeHits.filter(h => h.entity === 'crm_vault_properties').length, 0)
    assert.equal(officeHits.filter(h => h.entity === 'attachments').length, 0, 'Office Admin must get ZERO HR attachment hits')
    assert.ok(!officeSearch.body.includes('Kensington Visa Annexure Scan.pdf'), 'Office Admin unified search must not leak employee visa attachment')

    const officeAttList = await server.inject({ method: 'GET', url: '/api/e/attachments?pageSize=50', headers: { cookie: officeCookie } })
    assert.equal(officeAttList.statusCode, 200)
    assert.ok(!officeAttList.body.includes('Kensington Visa Annexure Scan.pdf'), 'Office Admin /api/e/attachments must exclude HR-linked documents')

    // Owner/Admin/Manager see employees, invoices, vault, leads — yet Admin still NEVER sees Owner's private Word doc or DM
    const adminSearch = await server.inject({
      method: 'POST',
      url: '/api/search/unified',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: adminCookie },
      payload: { q: 'Kensington', scopes: ['internal'], limit: 50 },
    })
    assert.equal(adminSearch.statusCode, 200)
    const adminHits = (adminSearch.json() as any).results as any[]
    assert.ok(adminHits.some(h => h.entity === 'employees'))
    assert.ok(adminHits.some(h => h.entity === 'invoices'))
    assert.ok(adminHits.some(h => h.entity === 'crm_vault_properties'))
    assert.ok(!adminSearch.body.includes('Kensington Owner Executive Strategy Memo'), 'Admin must not see Owner private Word doc')
    assert.ok(!adminSearch.body.includes('Kensington private executive commission split discussion'), 'Admin must not see DM they are not a member of')

    // Portal Client blocked from Unified Search
    const portalSearch = await server.inject({
      method: 'POST',
      url: '/api/search/unified',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: portalCookie },
      payload: { q: 'Kensington' },
    })
    assert.equal(portalSearch.statusCode, 403)

    // =========================================================================
    // GATE 5: SIP Vault Isolation & Single-Use PBX Token Exchange
    // =========================================================================
    const sipWebhookSecret = 'pbx-e2e-webhook-secret-998877'
    const sipCfgRes = await server.inject({
      method: 'PUT',
      url: '/api/sip/admin/config',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: adminCookie },
      payload: {
        sip_enabled: true,
        sip_ws_url: 'wss://pbx.swk.test:8089/ws',
        sip_domain: 'pbx.swk.test',
        sip_caller_id_mode: 'masked_bridge',
        sip_vault_bridge_prefix: '88',
        sip_webhook_secret: sipWebhookSecret,
      },
    })
    assert.equal(sipCfgRes.statusCode, 200, `SIP config PUT failed: ${sipCfgRes.body}`)

    for (const ext of [
      { user_id: fieldAgentRow.id, extension_no: '104', sip_username: 'ext104', sip_password: 'Agent104-Sip-Secret!', display_name: 'Talha SWK' },
      { user_id: managerRow.id, extension_no: '102', sip_username: 'ext102', sip_password: 'Mgr102-Sip-Secret!', display_name: 'Haseeb SWK' },
      { user_id: staff15Id, extension_no: '115', sip_username: 'ext115', sip_password: 'Staff15-Sip-Secret!', display_name: 'Staff 15 SWK' },
    ]) {
      const extPut = await server.inject({
        method: 'PUT',
        url: '/api/sip/admin/extensions',
        headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: adminCookie },
        payload: { ...ext, allow_direct_dial: false, active: true },
      })
      assert.equal(extPut.statusCode, 200, `Extension setup failed for ${ext.extension_no}: ${extPut.body}`)
    }

    const mySipAgent = await server.inject({ method: 'GET', url: '/api/sip/my-config', headers: { cookie: fieldAgentCookie } })
    assert.equal(mySipAgent.statusCode, 200)
    assert.equal((mySipAgent.json() as any).extension.extension_no, '104')
    assert.ok(!mySipAgent.body.includes('Mgr102-Sip-Secret!'), 'Field Agent my-config must never leak Manager SIP password')
    assert.ok(!mySipAgent.body.includes('Staff15-Sip-Secret!'), 'Field Agent my-config must never leak Staff #15 SIP password')
    assert.ok(!mySipAgent.body.includes(sipWebhookSecret), 'Field Agent my-config must never leak PBX webhook secret')

    // Field Agent dials assigned Vault property -> opaque single-use SIP token URI ONLY, zero raw owner digits
    const vaultDialRes = await server.inject({
      method: 'POST',
      url: `/api/sip/vault-call/${assignedVaultId}`,
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: fieldAgentCookie },
      payload: {},
    })
    assert.equal(vaultDialRes.statusCode, 200, `SIP vault-call failed: ${vaultDialRes.body}`)
    const vaultDialJson = vaultDialRes.json() as any
    assert.equal(vaultDialJson.mode, 'sip_token')
    assert.match(vaultDialJson.dial_uri, /^sip:88vt_[0-9a-f]{24}@pbx\.swk\.test$/)
    assert.ok(!vaultDialRes.body.includes(rawOwnerPhoneAssigned))
    assert.ok(!vaultDialRes.body.includes(rawOwnerDigitsAssigned))
    assert.ok(!vaultDialRes.body.includes(rawOwnerLocalAssigned))

    // Field Agent cannot dial unassigned Vault property
    const badPropDial = await server.inject({
      method: 'POST',
      url: `/api/sip/vault-call/${unassignedVaultId}`,
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: fieldAgentCookie },
      payload: {},
    })
    assert.equal(badPropDial.statusCode, 403, 'Field Agent must get 403 dialing unassigned Vault property')

    // Log call and confirm call history hides both raw phone and vt_* token
    const logCallRes = await server.inject({
      method: 'POST',
      url: '/api/sip/calls/log',
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: fieldAgentCookie },
      payload: {
        call_id: 'e2e-sip-vault-call-1',
        direction: 'out',
        to_number: vaultDialJson.dial_uri,
        caller_name: 'Masked Owner Alpha',
        duration_sec: 35,
        status: 'Completed',
        outcome: 'Callback requested',
        summary: `Called ${vaultDialJson.dial_target}`,
        is_vault_masked: true,
        property_id: assignedVaultId,
      },
    })
    assert.equal(logCallRes.statusCode, 200)

    const callListAgent = await server.inject({ method: 'GET', url: '/api/sip/calls', headers: { cookie: fieldAgentCookie } })
    assert.equal(callListAgent.statusCode, 200)
    const vaultTok = String(vaultDialJson.dial_target).slice(2)
    assert.ok(!callListAgent.body.includes(rawOwnerDigitsAssigned) && !callListAgent.body.includes(rawOwnerLocalAssigned))
    assert.ok(!callListAgent.body.includes(vaultTok), 'Call history must mask vt_* token')

    // Also verify /api/crm-vault/my-assignments never reveals raw digits
    const myDealsRes = await server.inject({ method: 'GET', url: '/api/crm-vault/my-assignments', headers: { cookie: fieldAgentCookie } })
    assert.equal(myDealsRes.statusCode, 200)
    assert.ok(!myDealsRes.body.includes(rawOwnerDigitsAssigned) && !myDealsRes.body.includes(rawOwnerLocalAssigned))

    // PBX resolves vault token: wrong secret -> 403, 1st valid -> 200 E164, 2nd replay -> 404
    const badSecretPbx = await server.inject({
      method: 'POST',
      url: '/api/public/sip/wrong-secret/resolve-vault-token',
      headers: { 'content-type': 'application/json' },
      payload: { token: vaultTok },
    })
    assert.equal(badSecretPbx.statusCode, 403)

    const okPbxResolve = await server.inject({
      method: 'POST',
      url: `/api/public/sip/${sipWebhookSecret}/resolve-vault-token`,
      headers: { 'content-type': 'application/json' },
      payload: { token: vaultTok },
    })
    assert.equal(okPbxResolve.statusCode, 200)
    assert.deepEqual(okPbxResolve.json(), { ok: true, destination_e164: rawOwnerPhoneAssigned, property_id: assignedVaultId })

    const replayPbxResolve = await server.inject({
      method: 'POST',
      url: `/api/public/sip/${sipWebhookSecret}/resolve-vault-token`,
      headers: { 'content-type': 'application/json' },
      payload: { token: vaultTok },
    })
    assert.equal(replayPbxResolve.statusCode, 404, 'Vault SIP token must be strictly single-use')

    // =========================================================================
    // GATE 6 & GATE 7 SETUP: Push Transport Spy + Mobile EC P-256 Sessions
    // =========================================================================
    const webPushDispatches: Array<{ userId: number; sub: any; payload: any }> = []
    const fcmDispatches: Array<{ userId: number; sub: any; fcmMessage: any; payload: any }> = []
    pushMod.setPushTransportForTests({
      sendWebPush: async (sub, payloadJson) => {
        webPushDispatches.push({ userId: sub.user_id, sub, payload: JSON.parse(payloadJson) })
      },
      sendFcm: async (sub, fcmMessage, payload) => {
        fcmDispatches.push({ userId: sub.user_id, sub, fcmMessage, payload })
      },
    })

    const mobAgent = await loginMobile('talha@swk.properties', config.accounts.bdmPassword, 'Talha Android 15')
    const mobManager = await loginMobile('haseeb@swk.properties', config.accounts.managerPassword, 'Haseeb iPhone 16')
    const mobOwner = await loginMobile('shabib@swk.properties', config.accounts.ownerPassword, 'Shabib Flagship')
    assert.equal(mobAgent.deviceStatus, 'Pending')
    assert.equal(mobManager.deviceStatus, 'Approved')
    assert.equal(mobOwner.deviceStatus, 'Approved')

    const hMobAgent = { 'content-type': 'application/json', 'x-swk-client': 'mobile', 'x-swk-session': mobAgent.token }
    const hMobManager = { 'content-type': 'application/json', 'x-swk-client': 'mobile', 'x-swk-session': mobManager.token }
    const hMobOwner = { 'content-type': 'application/json', 'x-swk-client': 'mobile', 'x-swk-session': mobOwner.token }

    // Subscribe Web Push + FCM for Agent, Manager, and Owner
    for (const [hdrs, wpPath, fcmTok, devId] of [
      [hMobAgent, 'https://push.example.test/wp/talha-1', 'fcm-talha-001', mobAgent.deviceId],
      [hMobManager, 'https://push.example.test/wp/haseeb-1', 'fcm-haseeb-001', mobManager.deviceId],
      [hMobOwner, 'https://push.example.test/wp/shabib-1', 'fcm-shabib-001', mobOwner.deviceId],
    ] as const) {
      assert.equal((await server.inject({
        method: 'POST',
        url: '/api/push/subscribe',
        headers: hdrs,
        payload: { channel: 'web_push', endpoint: wpPath, keys: { p256dh: 'BOr6x7h2V2xH7kH8Y9M0N1O2P3Q4R5S6T7U8V9W0X1Y2Z3', auth: 'authSecret123456' } },
      })).statusCode, 200)
      assert.equal((await server.inject({
        method: 'POST',
        url: '/api/push/subscribe',
        headers: hdrs,
        payload: { channel: 'fcm', token: fcmTok, device_id: devId },
      })).statusCode, 200)
    }

    // =========================================================================
    // GATE 6: Field GPS Privacy, Anti-Spoof, Impossible Speed, SOS & Audit Logs
    // =========================================================================
    const startGpsRes = await server.inject({
      method: 'POST',
      url: '/api/field-gps/sessions/start',
      headers: hMobAgent,
      payload: { purpose: 'Viewing', community: 'Dubai Marina' },
    })
    assert.equal(startGpsRes.statusCode, 200, `Start GPS session failed: ${startGpsRes.body}`)
    const gpsSessionId = Number((startGpsRes.json() as any).session.id)

    // Non-leadership cannot query Agent's trail even by session ID
    for (const [label, cookie] of [
      ['Field Agent (Talha)', fieldAgentCookie],
      ['HR', hrCookie],
      ['Office Admin', officeCookie],
      ['Staff #15 (DB tampered Admin)', staff15Cookie],
      ['Portal Client', portalCookie],
    ] as const) {
      const denyTrail = await server.inject({
        method: 'GET',
        url: `/api/field-gps/sessions/${gpsSessionId}/trail`,
        headers: { cookie },
      })
      assert.equal(denyTrail.statusCode, 403, `${label} must get 403 on /api/field-gps/sessions/:id/trail`)
    }

    // Valid ping in Dubai Marina
    const pingOk = await server.inject({
      method: 'POST',
      url: '/api/field-gps/pings',
      headers: hMobAgent,
      payload: {
        points: [{
          lat: 25.0805,
          lng: 55.1403,
          accuracy_m: 10,
          speed_mps: 1.2,
          recorded_at: new Date().toISOString(),
          idempotency_key: 'e2e-gps-valid-1',
        }],
      },
    })
    assert.equal(pingOk.statusCode, 200)
    assert.equal((pingOk.json() as any).accepted, 1)

    // Impossible speed jump (>200 km/h) -> flagged
    const jumpPing = await server.inject({
      method: 'POST',
      url: '/api/field-gps/pings',
      headers: hMobAgent,
      payload: {
        points: [{
          lat: 24.4539,
          lng: 54.3773,
          accuracy_m: 12,
          offline_replay: true,
          recorded_at: new Date(Date.now() - 8 * 60_000).toISOString(),
          idempotency_key: 'e2e-gps-jump-1',
        }],
      },
    })
    assert.equal(jumpPing.statusCode, 200)
    assert.ok(((jumpPing.json() as any).flags || []).some((f: string) => /impossible travel/i.test(f)), 'Impossible travel speed must be flagged')

    // Mock GPS (is_mock: true) -> 422 + gps_spoof_attempt audit + sticky flag
    const mockGpsRes = await server.inject({
      method: 'POST',
      url: '/api/field-gps/pings',
      headers: hMobAgent,
      payload: {
        points: [{
          lat: 25.1972,
          lng: 55.2744,
          accuracy_m: 4,
          is_mock: true,
          recorded_at: new Date().toISOString(),
          idempotency_key: 'e2e-gps-mock-1',
        }],
      },
    })
    assert.equal(mockGpsRes.statusCode, 422, `Expected 422 for mock GPS, got ${mockGpsRes.statusCode}`)
    assert.ok(q.all(`SELECT id FROM audit_log WHERE action = 'gps_spoof_attempt' AND user_id = ?`, fieldAgentRow.id).length >= 1)

    // Trigger SOS -> dispatches swk_calls_sos push to Leadership
    webPushDispatches.length = 0
    fcmDispatches.length = 0
    const sosRes = await server.inject({
      method: 'POST',
      url: '/api/field-gps/sos',
      headers: hMobAgent,
      payload: { lat: 25.0811, lng: 55.1409, reason: 'E2E SOS emergency test' },
    })
    assert.equal(sosRes.statusCode, 200)
    await waitFor(
      () =>
        fcmDispatches.some(p => p.userId === ownerRow.id && p.payload.channel === 'swk_calls_sos') &&
        fcmDispatches.some(p => p.userId === managerRow.id && p.payload.channel === 'swk_calls_sos'),
      1000,
      'SOS leadership pushes',
    )
    assert.equal(fcmDispatches.filter(p => p.userId === ownerRow.id && p.payload.channel === 'swk_calls_sos').length, 1, 'Owner must receive exactly 1 SOS push (no duplicate)')
    assert.equal(fcmDispatches.filter(p => p.userId === managerRow.id && p.payload.channel === 'swk_calls_sos').length, 1, 'Manager must receive exactly 1 SOS push (no duplicate)')

    // Leadership GET /live writes location_access_logs & shows flagged pin
    const accessLogsBefore = q.val<number>(`SELECT COUNT(*) FROM location_access_logs`) ?? 0
    const liveMapRes = await server.inject({ method: 'GET', url: '/api/field-gps/live', headers: { cookie: managerCookie } })
    assert.equal(liveMapRes.statusCode, 200)
    const talhaPin = ((liveMapRes.json() as any).rows || []).find((r: any) => r.user_id === fieldAgentRow.id)
    assert.ok(talhaPin && Number(talhaPin.is_flagged) === 1, 'Live GPS map must show flagged agent pin')
    const accessLogsAfter = q.val<number>(`SELECT COUNT(*) FROM location_access_logs`) ?? 0
    assert.ok(accessLogsAfter > accessLogsBefore, 'Leadership GET /api/field-gps/live must record location_access_logs row')

    // Stop field session -> closed trail requires ?reason= (400 without, 200 with reason + audit log)
    assert.equal((await server.inject({ method: 'POST', url: '/api/field-gps/sessions/stop', headers: hMobAgent, payload: {} })).statusCode, 200)
    assert.equal((await server.inject({ method: 'GET', url: `/api/field-gps/sessions/${gpsSessionId}/trail`, headers: { cookie: ownerCookie } })).statusCode, 400)
    assert.equal((await server.inject({ method: 'GET', url: `/api/field-gps/sessions/${gpsSessionId}/trail?reason=${encodeURIComponent('E2E audit verification')}`, headers: { cookie: ownerCookie } })).statusCode, 200)

    // =========================================================================
    // GATE 7: WhatsApp-Grade Inside Live Sync, Receipts, Attachments, Replay & Push
    // =========================================================================
    webPushDispatches.length = 0
    fcmDispatches.length = 0

    // 7a. SSE Ticket auth enforcement (single-use + forbidden on non-SSE endpoints)
    const getTicket = async (hdrs: Record<string, string>) => {
      const r = await server.inject({ method: 'POST', url: '/api/auth/stream-ticket', headers: hdrs })
      assert.equal(r.statusCode, 200, `POST /api/auth/stream-ticket failed: ${r.body}`)
      return (r.json() as any).ticket as string
    }

    const probeTicket = await getTicket(hMobAgent)
    assert.equal((await server.inject({ method: 'GET', url: `/api/auth/me?ticket=${encodeURIComponent(probeTicket)}` })).statusCode, 401, 'SSE ticket must never work on non-SSE routes')
    assert.ok(consumeStreamTicket(probeTicket), '1st consumeStreamTicket succeeds')
    assert.equal(consumeStreamTicket(probeTicket), null, '2nd replay of consumeStreamTicket returns null')

    // 7b. Open TWO concurrent live SSE streams (Manager + Owner) using fresh one-time tickets
    const mgrSseTicket = await getTicket(hMobManager)
    const ownerSseTicket = await getTicket(hMobOwner)

    const mgrStream = await openLiveSse(`${baseUrl}/api/chat/stream?ticket=${encodeURIComponent(mgrSseTicket)}`)
    const ownerStream = await openLiveSse(`${baseUrl}/api/chat/stream?ticket=${encodeURIComponent(ownerSseTicket)}`)
    openSseHandles.push(mgrStream, ownerStream)

    assert.equal(mgrStream.status, 200)
    assert.equal(ownerStream.status, 200)
    await mgrStream.waitForMatch(t => t.includes('retry: 3000'))
    await ownerStream.waitForMatch(t => t.includes('retry: 3000'))

    // Replaying the consumed HTTP ticket must return 401
    const replayStream = await openLiveSse(`${baseUrl}/api/chat/stream?ticket=${encodeURIComponent(mgrSseTicket)}`)
    assert.equal(replayStream.status, 401, 'Replayed SSE ticket over HTTP must return 401')

    // 7c. Create group thread (Agent + Manager + Owner) & send DM + Group + File attachment
    const grpCreateRes = await server.inject({
      method: 'POST',
      url: '/api/chat/threads',
      headers: hMobAgent,
      payload: { title: 'E2E Closing War Room', user_ids: [managerRow.id, ownerRow.id], group: true },
    })
    assert.equal(grpCreateRes.statusCode, 200)
    const grpId = Number((grpCreateRes.json() as any).id)

    // Field Agent uploads a file attachment into the group -> Manager & Owner receive instant SSE push!
    const fileMp = buildMultipart({ caption: 'Form F Draft Attached' }, {
      fieldname: 'file',
      filename: 'form-f-draft.txt',
      contentType: 'text/plain',
      data: Buffer.from('RERA Form F Draft - Dubai Marina Unit 1802', 'utf8'),
    })
    const uploadMsgRes = await server.inject({
      method: 'POST',
      url: `/api/chat/threads/${grpId}/upload`,
      headers: { 'content-type': fileMp.contentType, 'x-swk-client': 'mobile', 'x-swk-session': mobAgent.token },
      payload: fileMp.body,
    })
    assert.equal(uploadMsgRes.statusCode, 200, `Chat file upload failed: ${uploadMsgRes.body}`)
    const fileMsgId = Number((uploadMsgRes.json() as any).id)

    await mgrStream.waitForMatch(t => t.includes('Form F Draft Attached'))
    await ownerStream.waitForMatch(t => t.includes('Form F Draft Attached'))

    // Non-member (Staff #15) cannot download the chat file attachment; Manager CAN
    const nonMemberFileRes = await server.inject({
      method: 'GET',
      url: `/api/chat/files/${fileMsgId}`,
      headers: { cookie: staff15Cookie },
    })
    assert.equal(nonMemberFileRes.statusCode, 403, `Non-member Staff #15 must receive 403 when fetching group attachment, got ${nonMemberFileRes.statusCode}`)
    const mgrFileRes = await server.inject({
      method: 'GET',
      url: `/api/chat/files/${fileMsgId}`,
      headers: hMobManager,
    })
    assert.equal(mgrFileRes.statusCode, 200)
    assert.match(mgrFileRes.body, /RERA Form F Draft/)

    // 7d. Double-tick read receipts: Manager and Owner mark thread read -> Field Agent sees status='read'
    assert.equal((await server.inject({ method: 'POST', url: `/api/chat/threads/${grpId}/read`, headers: hMobManager, payload: {} })).statusCode, 200)
    assert.equal((await server.inject({ method: 'POST', url: `/api/chat/threads/${grpId}/read`, headers: hMobOwner, payload: {} })).statusCode, 200)
    const grpMsgsAgent = await server.inject({ method: 'GET', url: `/api/chat/threads/${grpId}/messages`, headers: hMobAgent })
    assert.equal(grpMsgsAgent.statusCode, 200)
    const fileMsgView = (grpMsgsAgent.json() as any).messages.find((m: any) => m.id === fileMsgId)
    assert.equal(fileMsgView?.status, 'read', 'Once all members mark read, sender sees double-blue-tick status="read"')

    // 7e. Active-thread suppression vs disconnected push + lock-screen privacy preview
    webPushDispatches.length = 0
    fcmDispatches.length = 0

    // Create DM Agent <-> Manager
    const dmRes = await server.inject({
      method: 'POST',
      url: '/api/chat/threads',
      headers: hMobAgent,
      payload: { user_ids: [managerRow.id] },
    })
    assert.equal(dmRes.statusCode, 200)
    const dmId = Number((dmRes.json() as any).id)

    // Manager opens dmId in foreground -> external push is suppressed
    assert.equal((await server.inject({ method: 'POST', url: '/api/chat/active-thread', headers: hMobManager, payload: { thread_id: dmId } })).statusCode, 200)
    const dmMsg1 = await server.inject({
      method: 'POST',
      url: `/api/chat/threads/${dmId}/messages`,
      headers: hMobAgent,
      payload: { body: 'Buyer arrived in lobby' },
    })
    assert.equal(dmMsg1.statusCode, 200)
    const dmMsg1Id = Number((dmMsg1.json() as any).id)
    await new Promise(r => setTimeout(r, 40))
    assert.equal(webPushDispatches.filter(p => p.userId === managerRow.id).length, 0, 'Active foreground thread must suppress Web Push')
    assert.equal(fcmDispatches.filter(p => p.userId === managerRow.id).length, 0, 'Active foreground thread must suppress FCM push')

    // Manager disconnects stream & leaves active thread -> offline pushes fire
    await mgrStream.close()
    assert.equal((await server.inject({ method: 'POST', url: '/api/chat/active-thread', headers: hMobManager, payload: { thread_id: null } })).statusCode, 200)

    const dmMsg2 = await server.inject({
      method: 'POST',
      url: `/api/chat/threads/${dmId}/messages`,
      headers: hMobAgent,
      payload: { body: 'Missed offline message #2' },
    })
    assert.equal(dmMsg2.statusCode, 200)
    const dmMsg2Id = Number((dmMsg2.json() as any).id)
    await waitFor(
      () =>
        webPushDispatches.filter(p => p.userId === managerRow.id).length >= 1 &&
        fcmDispatches.filter(p => p.userId === managerRow.id).length >= 1,
      1000,
      'offline DM push dispatches',
    )

    assert.equal(webPushDispatches.filter(p => p.userId === managerRow.id).length, 1, 'Disconnected recipient must receive Web Push')
    assert.equal(fcmDispatches.filter(p => p.userId === managerRow.id).length, 1, 'Disconnected recipient must receive FCM push')
    assert.equal(webPushDispatches.find(p => p.userId === managerRow.id)!.payload.url, `/chat?t=${dmId}`)

    // Lock-screen privacy preview masks BOTH title and body
    setSettings({ push_hide_preview_global: true })
    webPushDispatches.length = 0
    fcmDispatches.length = 0
    const dmMsg3 = await server.inject({
      method: 'POST',
      url: `/api/chat/threads/${dmId}/messages`,
      headers: hMobAgent,
      payload: { body: 'Sensitive AED 22M cash buyer passport details' },
    })
    assert.equal(dmMsg3.statusCode, 200)
    const dmMsg3Id = Number((dmMsg3.json() as any).id)
    await waitFor(
      () =>
        Boolean(webPushDispatches.find(p => p.userId === managerRow.id)) &&
        Boolean(fcmDispatches.find(p => p.userId === managerRow.id)),
      1000,
      'masked DM push dispatches',
    )
    const privWp = webPushDispatches.find(p => p.userId === managerRow.id)!
    const privFcm = fcmDispatches.find(p => p.userId === managerRow.id)!
    assert.equal(privWp.payload.title, 'SWK Inside')
    assert.equal(privFcm.payload.title, 'SWK Inside')
    assert.equal(privWp.payload.body, 'New message in SWK Inside')
    assert.equal(privFcm.payload.body, 'New message in SWK Inside')
    assert.ok(!JSON.stringify(privWp.payload).includes('Talha') && !JSON.stringify(privFcm.fcmMessage).includes('Talha'), 'Sender name title must be masked on lock screen')
    assert.ok(!JSON.stringify(privWp.payload).includes('22M') && !JSON.stringify(privFcm.fcmMessage).includes('22M'))
    setSettings({ push_hide_preview_global: false })

    // 7f. Reconnect catch-up ?since_id=<dmMsg1Id> replays ONLY missed messages [dmMsg2Id, dmMsg3Id] in ascending order
    const mgrCatchupTicket = await getTicket(hMobManager)
    const mgrCatchupStream = await openLiveSse(`${baseUrl}/api/chat/stream?ticket=${encodeURIComponent(mgrCatchupTicket)}&since_id=${dmMsg1Id}`)
    openSseHandles.push(mgrCatchupStream)
    await mgrCatchupStream.waitForMatch(t => t.includes(`"id":${dmMsg3Id}`))
    const replayedMsgs = parseSseEvents(mgrCatchupStream.getText())
      .filter(e => e.event === 'chat' && e.data?.type === 'message')
      .map(e => e.data.message.id)
    assert.deepEqual(replayedMsgs, [dmMsg2Id, dmMsg3Id], 'Reconnect ?since_id= must replay strictly missed messages in order without duplicates')

    // 7g. All-company-ops notify() pushes to swk_ops_alerts AND live /api/notifications/stream
    const notifTicket = await getTicket(hMobOwner)
    const ownerNotifStream = await openLiveSse(`${baseUrl}/api/notifications/stream?ticket=${encodeURIComponent(notifTicket)}`)
    openSseHandles.push(ownerNotifStream)
    await ownerNotifStream.waitForMatch(t => t.includes('retry:'))

    webPushDispatches.length = 0
    fcmDispatches.length = 0
    notify(ownerRow.id, 'Deal Withdrawal Approval', 'DL-2600041 awaits Owner sign-off', '/withdrawals', 'approval')
    await ownerNotifStream.waitForMatch(t => t.includes('Deal Withdrawal Approval'))
    await waitFor(
      () =>
        Boolean(webPushDispatches.find(p => p.userId === ownerRow.id)) &&
        Boolean(fcmDispatches.find(p => p.userId === ownerRow.id)),
      1000,
      'owner ops push notifications',
    )
    assert.equal(webPushDispatches.find(p => p.userId === ownerRow.id)?.payload.channel, 'swk_ops_alerts')
    assert.equal(fcmDispatches.find(p => p.userId === ownerRow.id)?.payload.url, '/withdrawals')

    // 7h. Portal Client is strictly blocked from all Chat / Push / Stream-ticket routes
    for (const check of [
      { method: 'GET' as const, url: '/api/chat/threads' },
      { method: 'POST' as const, url: '/api/auth/stream-ticket', payload: {} },
      { method: 'GET' as const, url: '/api/push/vapid-key' },
      { method: 'POST' as const, url: '/api/push/subscribe', payload: { channel: 'fcm', token: 'portal-bad' } },
    ]) {
      const pRes = await server.inject({
        method: check.method,
        url: check.url,
        headers: { cookie: portalCookie, 'x-swk-client': 'web', ...(check.payload ? { 'content-type': 'application/json' } : {}) },
        payload: check.payload,
      })
      assert.equal(pRes.statusCode, 403, `Portal client must get 403 on ${check.method} ${check.url}`)
    }

    // 7i. Revoking Agent's mobile device immediately invalidates x-swk-session & deactivates push WITHOUT ending web cookie
    const mobAgentDevRow = q.get<{ id: number }>(`SELECT id FROM staff_devices WHERE device_id = ?`, mobAgent.deviceId)!
    const revokeRes = await server.inject({
      method: 'POST',
      url: `/api/auth/devices/${mobAgentDevRow.id}/revoke`,
      headers: { 'content-type': 'application/json', 'x-swk-client': 'web', cookie: ownerCookie },
      payload: { reason: 'E2E zero-leak device revocation drill' },
    })
    assert.equal(revokeRes.statusCode, 200)
    assert.equal((await server.inject({ method: 'GET', url: '/api/auth/me', headers: { 'x-swk-client': 'mobile', 'x-swk-session': mobAgent.token } })).statusCode, 401)
    assert.equal(q.val<number>(`SELECT active FROM push_subscriptions WHERE device_id = ?`, mobAgent.deviceId), 0)
    assert.equal((await server.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: fieldAgentCookie } })).statusCode, 200, 'Web cookie session stays valid when mobile device revoked')

    console.log('ALL 7 ZERO-LEAK SUPERAPP ACCEPTANCE GATES ACROSS ALL 8 PERSONAS PASSED!')
  } finally {
    for (const h of openSseHandles) {
      try { await h.close() } catch {}
    }
    try { pushMod.setPushTransportForTests(null) } catch {}
    await new Promise<void>(resolve => llmServer.close(() => resolve()))
    if (app) {
      try { await app.close() } catch {}
    }
    try { mainDb.close() } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
