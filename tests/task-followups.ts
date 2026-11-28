/**
 * SWK OS — Universal Form Attachments & Detailed Task Follow-Up E2E Verification Suite
 * Runs against BOTH SQLite and PostgreSQL 16 in CI!
 *
 * Covers:
 *  1. Schema migration `020_task_followups` on SQLite & PostgreSQL 16
 *  2. Task creation & attachment upload (`POST /api/files`), list (`GET /api/files`), and download (`GET /api/files/:id/download`)
 *  3. Restricted staff assignee can attach files and log detailed follow-ups on their own assigned task
 *  4. Follow-up stage syncs `tasks.status`, `due_date`, `completed_at`, and hydrates `/api/e/tasks`, `/api/shabib-workspace/team-daily`, and `/api/field-reports/my-context`
 *  5. RBAC enforcement: non-assignee restricted staff gets 403 on another user's task & on Owner-only workspace scopes
 *  6. Blocked executable extensions rejected (400)
 *  7. Follow-up entry deletion & attachment deletion update hydrated counts cleanly
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ownsDataDir = !process.env.DATA_DIR
const dataDir = process.env.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'swk-task-followups-'))
process.env.DATA_DIR = dataDir
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = ''
  process.env.REQUIRE_DATABASE_URL = 'false'
}
process.env.DEMO_ENABLED = 'false'
process.env.STARTER_DATA = 'false'
process.env.OFFPLAN_LAUNCHES = 'false'
process.env.NODE_ENV = 'test'

const { ensureDirs, config } = await import('../src/server/config')
const { syncSchema } = await import('../src/server/schema')
const { seedReference, syncSwkStaffRoster } = await import('../src/server/seed')
const { q, db } = await import('../src/server/db')
const { buildApp } = await import('../src/server/app')

ensureDirs()
syncSchema()
await seedReference()
syncSwkStaffRoster()
q.run(`UPDATE users SET must_change_password = 0 WHERE deleted_at IS NULL`)

const app = await buildApp()

async function loginAs(email: string, password: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'content-type': 'application/json', 'x-swk-client': 'web' },
    payload: { email, password },
  })
  assert.equal(res.statusCode, 200, `Login failed for ${email}: ${res.body}`)
  const cookie = String(res.headers['set-cookie'] || '').split(';')[0]
  return { cookie, 'x-swk-client': 'web' }
}

function buildMultipart(fields: Record<string, string>, file: { name: string; content: string; mime?: string }) {
  const boundary = '----SWKAttachBoundary7MA4YWxkTrZu0gW'
  const parts: string[] = []
  for (const [k, v] of Object.entries(fields)) {
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`)
  }
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.mime || 'text/plain'}\r\n\r\n${file.content}\r\n`,
  )
  parts.push(`--${boundary}--\r\n`)
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    payload: Buffer.from(parts.join(''), 'utf8'),
  }
}

try {
  const ownerH = await loginAs(config.accounts.ownerEmail, config.accounts.ownerPassword)
  const fareedH = await loginAs('fareed@swk.rent', config.accounts.bdmPassword)
  const fareedUser = q.get<{ id: number }>(`SELECT id FROM users WHERE lower(email) = 'fareed@swk.rent' AND deleted_at IS NULL`)
  assert.ok(fareedUser?.id, 'Fareed staff fixture must exist')

  const otherRestricted = q.get<{ id: number; email: string }>(
    `SELECT u.id, u.email FROM users u LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.deleted_at IS NULL AND u.party_id IS NULL AND lower(u.email) <> 'fareed@swk.rent'
       AND lower(COALESCE(r.name, '')) LIKE '%agent%' LIMIT 1`,
  )

  // 1. Owner assigns a daily task to Fareed
  const createRes = await app.inject({
    method: 'POST',
    url: '/api/shabib-workspace/tasks',
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: {
      title: 'Collect Business Bay Form F & Security Cheque',
      assigned_to_id: fareedUser.id,
      due_date: '2026-12-01',
      priority: 'Urgent',
      description: 'Confirm signed Form F + buyer EID copy.',
    },
  })
  assert.equal(createRes.statusCode, 201, createRes.body)
  const createdTask = createRes.json()
  const taskId = Number(createdTask.id)
  assert.ok(taskId > 0)

  // 2. Fareed uploads an attachment to his own assigned task
  const mp1 = buildMultipart(
    { link_entity: 'tasks', link_id: String(taskId), category: 'Form F' },
    { name: 'form-f-signed.txt', content: 'Signed Form F payload for Business Bay unit' },
  )
  const up1 = await app.inject({
    method: 'POST',
    url: '/api/files',
    headers: { ...fareedH, 'content-type': mp1.contentType },
    payload: mp1.payload,
  })
  assert.equal(up1.statusCode, 200, up1.body)
  const up1Arr = up1.json()
  assert.equal(up1Arr.length, 1)
  const attId = Number(up1Arr[0].id)
  assert.ok(attId > 0)

  // 3. Blocked extension rejected (400)
  const badMp = buildMultipart(
    { link_entity: 'tasks', link_id: String(taskId) },
    { name: 'payload.exe', content: 'not-allowed' },
  )
  const badUp = await app.inject({
    method: 'POST',
    url: '/api/files',
    headers: { ...fareedH, 'content-type': badMp.contentType },
    payload: badMp.payload,
  })
  assert.equal(badUp.statusCode, 400)

  // 4. Restricted staff blocked from Owner-only workspace scopes (403)
  const privMp = buildMultipart(
    { link_entity: 'privacy_fast_track_jobs', link_id: '1' },
    { name: 'leak-attempt.txt', content: 'should be blocked' },
  )
  const privUp = await app.inject({
    method: 'POST',
    url: '/api/files',
    headers: { ...fareedH, 'content-type': privMp.contentType },
    payload: privMp.payload,
  })
  assert.equal(privUp.statusCode, 403)

  // 5. Fareed lists and downloads his task attachment
  const listFiles = await app.inject({
    method: 'GET',
    url: `/api/files?link_entity=tasks&link_id=${taskId}`,
    headers: fareedH,
  })
  assert.equal(listFiles.statusCode, 200)
  assert.equal(listFiles.json().rows.length, 1)

  const dl = await app.inject({
    method: 'GET',
    url: `/api/files/${attId}/download`,
    headers: fareedH,
  })
  assert.equal(dl.statusCode, 200)
  assert.ok(dl.body.includes('Signed Form F payload'))

  // 6. Fareed logs a detailed follow-up with attachment & synced due date
  const fu1 = await app.inject({
    method: 'POST',
    url: `/api/tasks/${taskId}/followups`,
    headers: { ...fareedH, 'content-type': 'application/json' },
    payload: {
      channel: 'WhatsApp',
      outcome: 'Documents / KYC Requested',
      stage: 'Waiting Client',
      note: 'Buyer confirmed passport & signed Form F will arrive by 4 PM.',
      next_action: 'Verify signed PDF and collect cheque',
      next_followup_date: '2026-12-03',
      next_followup_time: '16:00',
      contact_name: 'Rami Al Mansoor',
      contact_phone: '+971501112233',
      attachment_ids: [attId],
      sync_due_date: true,
    },
  })
  assert.equal(fu1.statusCode, 201, fu1.body)
  const fu1Body = fu1.json()
  assert.equal(fu1Body.summary.stage, 'Waiting Client')
  assert.equal(fu1Body.summary.followup_count, 1)
  assert.equal(fu1Body.summary.attachment_count, 1)
  assert.equal(fu1Body.task.status, 'In progress')
  assert.equal(fu1Body.task.due_date, '2026-12-03')
  assert.equal(fu1Body.entry.attachments.length, 1)

  // 7. Verify hydration on /api/field-reports/my-context
  const ctxRes = await app.inject({ method: 'GET', url: '/api/field-reports/my-context', headers: fareedH })
  assert.equal(ctxRes.statusCode, 200)
  const myTask = (ctxRes.json().my_tasks || []).find((t: any) => Number(t.id) === taskId)
  assert.ok(myTask, 'Task should appear in staff my-context')
  assert.equal(myTask._followup_count, 1)
  assert.equal(myTask._attachment_count, 1)
  assert.equal(myTask._followup_stage, 'Waiting Client')
  assert.equal(myTask._next_followup_date, '2026-12-03')

  // 8. Non-assignee restricted staff gets 403 on Fareed's task follow-up
  if (otherRestricted) {
    const otherH = await loginAs(otherRestricted.email, config.accounts.bdmPassword)
    const denied = await app.inject({ method: 'GET', url: `/api/tasks/${taskId}/followups`, headers: otherH })
    assert.equal(denied.statusCode, 403, 'Non-assignee restricted agent must be blocked from another agent task follow-up')
  }

  // 9. Owner completes task via follow-up -> Done + verify team-daily hydration
  const fu2 = await app.inject({
    method: 'POST',
    url: `/api/tasks/${taskId}/followups`,
    headers: { ...ownerH, 'content-type': 'application/json' },
    payload: {
      channel: 'Internal Note',
      outcome: 'Completed & Verified',
      stage: 'Done',
      note: 'All documents verified and filed.',
    },
  })
  assert.equal(fu2.statusCode, 201, fu2.body)
  assert.equal(fu2.json().task.status, 'Done')
  assert.ok(fu2.json().task.completed_at)

  const teamDaily = await app.inject({ method: 'GET', url: '/api/shabib-workspace/team-daily', headers: ownerH })
  assert.equal(teamDaily.statusCode, 200)
  const fareedBoard = (teamDaily.json().staff || []).find((s: any) => Number(s.user_id) === fareedUser.id)
  assert.ok(fareedBoard, 'Fareed should be present on team-daily staff board')
  const doneTask = (fareedBoard.tasks_done_today || []).find((t: any) => Number(t.id) === taskId)
  assert.ok(doneTask, 'Completed task should appear in tasks_done_today')
  assert.equal(doneTask._followup_count, 2)
  assert.equal(doneTask._followup_stage, 'Done')

  // 10. Delete second follow-up entry & attachment -> counts update cleanly
  const delFu = await app.inject({
    method: 'DELETE',
    url: `/api/tasks/${taskId}/followups/${fu2.json().entry.id}`,
    headers: ownerH,
  })
  assert.equal(delFu.statusCode, 200)

  const delAtt = await app.inject({
    method: 'DELETE',
    url: `/api/files/${attId}`,
    headers: ownerH,
  })
  assert.equal(delAtt.statusCode, 200)

  const afterDel = await app.inject({ method: 'GET', url: `/api/tasks/${taskId}/followups`, headers: ownerH })
  assert.equal(afterDel.statusCode, 200)
  assert.equal(afterDel.json().followups.length, 1)
  assert.equal(afterDel.json().attachments.length, 0)

  console.log('PASS: SWK OS Universal Attachments & Task Follow-Ups Domain Suite (SQLite + PostgreSQL 16 ready)')
} finally {
  await app.close()
  db.close()
  if (ownsDataDir) fs.rmSync(dataDir, { recursive: true, force: true })
}
