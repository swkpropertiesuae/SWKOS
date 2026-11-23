import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Set isolated temp DATA_DIR BEFORE importing any server modules
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swk-schema017-'))
process.env.DATA_DIR = tmpDir
process.env.DATABASE_URL = ''

async function run() {
  const { mainDb, q, tableExists, columnsOf } = await import('../src/server/db')
  const schemaMod = await import('../src/server/schema')
  const { syncSchema } = schemaMod
  const { SETTING_DEFAULTS, SECRET_SETTINGS, setSettings, loadSettings, publicSettings } = await import('../src/server/settings')
  const { resetBusinessData } = await import('../src/server/domain/business-data')
  const { SYSTEM_CTX } = await import('../src/server/engine')

  try {
    syncSchema()
    // Second call must be completely idempotent
    syncSchema()

    // 1. Verify all 9 new tables exist
    const expectedTables = [
      'ai_provider_routes',
      'ai_conversations',
      'ai_messages',
      'ai_usage_daily',
      'sip_extensions',
      'sip_vault_call_tokens',
      'staff_live_locations',
      'push_subscriptions',
      'word_documents',
    ]
    for (const t of expectedTables) {
      assert.ok(tableExists(t), `Expected table "${t}" to exist after syncSchema()`)
    }

    // Verify sip_vault_call_tokens exact columns
    const vctCols = new Set(columnsOf('sip_vault_call_tokens').map(c => c.name))
    for (const col of ['token_hash', 'property_id', 'user_id', 'target_phone_enc', 'created_at', 'expires_at', 'consumed_at']) {
      assert.ok(vctCols.has(col), `Expected sip_vault_call_tokens.${col} to exist`)
    }

    // 2. Verify column additions on existing tables
    const sessionCols = new Set(columnsOf('sessions').map(c => c.name))
    assert.ok(sessionCols.has('device_id'), 'Expected sessions.device_id to exist')

    const userCols = new Set(columnsOf('users').map(c => c.name))
    assert.ok(userCols.has('role_grant_sig'), 'Expected users.role_grant_sig to exist')
    assert.ok(userCols.has('role_granted_by'), 'Expected users.role_granted_by to exist')

    const deviceCols = new Set(columnsOf('staff_devices').map(c => c.name))
    for (const col of ['platform', 'app_version', 'biometric_enabled', 'revoked_at', 'revoked_reason']) {
      assert.ok(deviceCols.has(col), `Expected staff_devices.${col} to exist`)
    }

    // 3. Verify all 21 settings keys in SETTING_DEFAULTS and 4 in SECRET_SETTINGS
    const expectedSettings = [
      'ai_allow_nonvault_vision_free',
      'ai_staff_daily_req_limit',
      'ai_staff_rpm_limit',
      'web_search_provider',
      'web_search_api_key',
      'web_search_searxng_url',
      'sip_enabled',
      'sip_ws_url',
      'sip_domain',
      'sip_outbound_proxy',
      'sip_ice_servers',
      'sip_caller_id_mode',
      'sip_vault_bridge_prefix',
      'sip_webhook_secret',
      'vapid_public_key',
      'vapid_private_key',
      'fcm_service_account_json',
      'push_hide_preview_global',
      'mobile_require_device_approval',
      'gps_retention_days',
      'field_duty_auto_stop_hour',
    ]
    for (const k of expectedSettings) {
      assert.ok(k in SETTING_DEFAULTS, `Expected "${k}" in SETTING_DEFAULTS`)
    }

    const expectedSecrets = [
      'web_search_api_key',
      'sip_webhook_secret',
      'vapid_private_key',
      'fcm_service_account_json',
    ]
    for (const k of expectedSecrets) {
      assert.ok(SECRET_SETTINGS.has(k), `Expected "${k}" in SECRET_SETTINGS`)
    }

    // Verify encryption at rest and masking in publicSettings()
    const secretValues: Record<string, string> = {
      web_search_api_key: 'tvly-test-key-12345',
      sip_webhook_secret: 'sip-wh-secret-98765',
      vapid_private_key: 'vapid-priv-key-abcdef',
      fcm_service_account_json: '{"project_id":"swk-test","private_key":"secret"}',
    }
    setSettings(secretValues)

    for (const [k, plain] of Object.entries(secretValues)) {
      const rawRow = q.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', k)
      assert.ok(rawRow, `Expected DB row for secret "${k}"`)
      const parsed = JSON.parse(rawRow.value)
      assert.equal(typeof parsed, 'string')
      assert.ok(parsed.startsWith('enc:v1:'), `Expected "${k}" to be AES-256-GCM encrypted in DB`)
      assert.notEqual(parsed, plain)
    }

    const loaded = loadSettings()
    for (const [k, plain] of Object.entries(secretValues)) {
      assert.equal(loaded[k], plain, `Expected loadSettings() to decrypt "${k}"`)
    }

    const pub = publicSettings()
    for (const k of expectedSecrets) {
      assert.equal(pub[k], '********', `Expected publicSettings()["${k}"] to be masked as ********`)
    }
    const pubFull = publicSettings(true)
    for (const [k, plain] of Object.entries(secretValues)) {
      assert.equal(pubFull[k], plain, `Expected publicSettings(true)["${k}"] to return decrypted value`)
    }

    // 4. Verify PostgreSQL DDL translation for migration 017
    const migrations = (schemaMod as any).MIGRATIONS as { id: string; sql: string }[] | undefined
    assert.ok(Array.isArray(migrations), 'Expected MIGRATIONS to be exported from schema.ts')
    const m017 = migrations.find(m => m.id === '017_swk_omni_superapp')
    assert.ok(m017, 'Expected migration 017_swk_omni_superapp in MIGRATIONS')

    const translateDdlForPg = (schemaMod as any).translateDdlForPg as ((sql: string) => string) | undefined
    assert.equal(typeof translateDdlForPg, 'function', 'Expected translateDdlForPg to be exported from schema.ts')
    const pgSql = translateDdlForPg!(m017.sql)
    assert.ok(!/\bAUTOINCREMENT\b/i.test(pgSql), 'PG DDL must not contain AUTOINCREMENT')
    assert.ok(!/\bINTEGER\b/i.test(pgSql), 'PG DDL must translate INTEGER to BIGINT')
    assert.ok(!/\bREAL\b/i.test(pgSql), 'PG DDL must translate REAL to DOUBLE PRECISION')
    assert.ok(/BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY/.test(pgSql), 'PG DDL must translate autoincrement PKs')

    // 5. Verify business-data.ts clears transactional tables while preserving routes & settings
    const now = new Date().toISOString()
    q.run(
      `INSERT INTO ai_provider_routes(label, provider_key, model_id, created_at, updated_at) VALUES (?,?,?,?,?)`,
      'Groq Test', 'groq', 'llama-3.3-70b-versatile', now, now
    )
    const convId = q.insert(
      `INSERT INTO ai_conversations(user_id, title, created_at, updated_at) VALUES (?,?,?,?)`,
      1, 'Test Conv', now, now
    )
    q.run(
      `INSERT INTO ai_messages(conversation_id, user_id, role, content, created_at) VALUES (?,?,?,?,?)`,
      convId, 1, 'user', 'hello', now
    )
    q.run(
      `INSERT INTO ai_usage_daily(user_id, usage_date, req_count, token_count, updated_at) VALUES (?,?,?,?,?)`,
      1, '2026-11-23', 1, 10, now
    )
    q.run(
      `INSERT INTO staff_live_locations(user_id, lat, lng, updated_at) VALUES (?,?,?,?)`,
      1, 25.2, 55.27, now
    )
    q.run(
      `INSERT INTO word_documents(user_id, title, html_content, created_at, updated_at) VALUES (?,?,?,?,?)`,
      1, 'Draft', '<p>Hi</p>', now, now
    )
    q.run(
      `INSERT INTO sip_vault_call_tokens(token_hash, property_id, user_id, target_phone_enc, created_at, expires_at) VALUES (?,?,?,?,?,?)`,
      'hash_abc', 10, 1, 'enc:v1:test', now, now
    )

    await resetBusinessData(SYSTEM_CTX, { backup: false })

    for (const cleared of [
      'ai_conversations',
      'ai_messages',
      'ai_usage_daily',
      'staff_live_locations',
      'word_documents',
      'sip_vault_call_tokens',
    ]) {
      const cnt = q.val<number>(`SELECT COUNT(*) FROM ${cleared}`)
      assert.equal(cnt, 0, `Expected resetBusinessData() to clear ${cleared}`)
    }
    assert.equal(q.val<number>('SELECT COUNT(*) FROM ai_provider_routes'), 1, 'Expected resetBusinessData() to preserve ai_provider_routes')
    assert.equal(loadSettings().web_search_api_key, 'tvly-test-key-12345', 'Expected resetBusinessData() to preserve settings')

    console.log('Schema 017 & encrypted settings test passed.')
  } finally {
    try { mainDb.close() } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
