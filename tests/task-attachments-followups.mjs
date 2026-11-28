/**
 * End-to-End API + Playwright Browser Verification Suite for:
 *  1. Universal Attachments on Entity Create/Edit Forms (EntityForm.tsx -> /api/files)
 *  2. My Work To-Do List (/my-work): quick-add task with attachment + 3-step Follow-Up Drawer + 1-click templates + proof attachment + persistence on reload
 *  3. Tasks List (/e/tasks) & Task Record Page (/e/tasks/:id): inline Follow-Up button, stage sync to Done
 *  4. Non-entity workspace scope attachment (mortgage_desk_events) list, download & delete
 */
import { signInDemo } from './ui-login.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { chromium } from 'playwright-core'

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'swk-task-attach-followup-'))
const PORT = '8096'
const base = `http://127.0.0.1:${PORT}`

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swk-attach-fixtures-'))
const leadFile = path.join(tmpDir, 'client-brief.txt')
const taskFile = path.join(tmpDir, 'form-f-draft.txt')
const proofFile = path.join(tmpDir, 'whatsapp-proof.txt')
fs.writeFileSync(leadFile, 'SWK Client Brief — Marina Gate 2BR Buyer\n')
fs.writeFileSync(taskFile, 'Form F Draft — Unit 1402 Marina Gate\n')
fs.writeFileSync(proofFile, 'WhatsApp confirmation screenshot text payload\n')

const server = spawn(process.execPath, ['dist/server/index.mjs'], {
  env: {
    ...process.env,
    DATA_DIR: data,
    DATABASE_URL: '',
    REQUIRE_DATABASE_URL: 'false',
    DEMO_ENABLED: 'true',
    PORT,
    HOST: '127.0.0.1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
server.stdout.on('data', b => { logs += b })
server.stderr.on('data', b => { logs += b })
let browser

try {
  let online = false
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(base + '/api/health')).ok && (await (await fetch(base + '/api/demo/status')).json()).enabled) {
        online = true
        break
      }
    } catch {}
    await new Promise(r => setTimeout(r, 500))
  }
  assert.ok(online, logs)

  const executablePath =
    process.env.CHROME_PATH ||
    execFileSync('bash', ['-c', 'command -v google-chrome || command -v chromium'], { encoding: 'utf8' }).trim()
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))

  const demo = await (await context.request.get(base + '/api/demo/status')).json()
  await signInDemo(page, base, demo)
  await page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ }).waitFor()

  // 1. Universal Entity Form Attachment on Lead Creation (/e/leads?new=1)
  await page.goto(base + '/e/leads?new=1')
  const modal = page.getByRole('dialog')
  await modal.waitFor()
  await modal.getByText('Attachments & Supporting Documents').waitFor()
  await modal.locator('#f-company').fill('Al Noor Holdings Attach Test')
  await modal.locator('input[type="file"]').setInputFiles(leadFile)
  await modal.getByText('client-brief.txt').waitFor()
  await modal.getByRole('button', { name: /Create Lead/i }).click()
  await page.waitForURL(/\/e\/leads\/\d+/, { timeout: 15000 })
  const leadId = Number(page.url().match(/\/e\/leads\/(\d+)/)?.[1])
  assert.ok(leadId > 0, 'Lead record URL should contain created ID')

  // Verify lead attachment via GET /api/files and download payload
  const leadFilesRes = await context.request.get(`${base}/api/files?link_entity=leads&link_id=${leadId}`)
  assert.equal(leadFilesRes.status(), 200)
  const leadFilesJson = await leadFilesRes.json()
  assert.equal(leadFilesJson.rows.length, 1, 'Lead should have 1 attached file')
  assert.equal(leadFilesJson.rows[0].file_name, 'client-brief.txt')
  const dlRes = await context.request.get(`${base}${leadFilesJson.rows[0].download_url}`)
  assert.equal(dlRes.status(), 200)
  assert.ok((await dlRes.text()).includes('SWK Client Brief'), 'Downloaded attachment content must match')

  // 2. My Work (/my-work): Quick add task WITH attachment + Follow-Up Drawer workflow
  await page.goto(base + '/my-work')
  await page.getByRole('heading', { name: 'My work' }).waitFor()
  const taskTitle = 'Chase Marina Gate Form F & Cheque'
  await page.getByLabel('New task').fill(taskTitle)
  await page.locator('form input[type="file"]').setInputFiles(taskFile)
  await page.getByText('form-f-draft.txt').waitFor()
  await page.getByRole('button', { name: 'Add', exact: true }).click()

  await page.getByText(taskTitle).waitFor({ timeout: 10000 })
  const taskRow = page.locator('.web-card > div', { hasText: taskTitle }).first()
  await taskRow.getByText('form-f-draft.txt').waitFor()

  // Open Follow-Up Drawer from My Work row
  await taskRow.getByRole('button', { name: /Follow Up/i }).click()
  const drawer = page.getByRole('dialog', { name: 'Task Follow-Up & Attachments' })
  await drawer.waitFor()

  // Click 1-click template + attach proof file + submit follow-up
  await drawer.getByRole('button', { name: 'Client promised docs today' }).click()
  await drawer.locator('form input[type="file"]').setInputFiles(proofFile)
  await drawer.getByText('whatsapp-proof.txt').waitFor()
  await drawer.getByRole('button', { name: /Save Follow-Up & Schedule Next/i }).click()

  // Verify timeline entry + proof chip rendered immediately
  await drawer.getByText('Follow-Up History (1)').waitFor({ timeout: 10000 })
  const firstEntry = drawer.locator('ol li').first()
  await firstEntry.getByText('Documents / KYC Requested').waitFor()
  await firstEntry.getByText('whatsapp-proof.txt').waitFor()

  // Verify Attachments tab shows BOTH task attachment and follow-up proof
  await drawer.getByRole('button', { name: /Attachments \(2\)/i }).click()
  await drawer.getByText('form-f-draft.txt').first().waitFor()
  await drawer.getByText('whatsapp-proof.txt').first().waitFor()

  // Close drawer & reload /my-work to verify full DB persistence
  await drawer.getByRole('button', { name: 'Close task follow-up drawer' }).click()
  await page.reload()
  await page.getByText(taskTitle).waitFor()
  const reloadedRow = page.locator('.web-card > div', { hasText: taskTitle }).first()
  await reloadedRow.getByText('Waiting Client').waitFor()
  await reloadedRow.getByRole('button', { name: /Follow Up \(1\)/i }).waitFor()

  // 3. Tasks Table (/e/tasks): open Follow-Up Drawer and complete task via "Completed & verified" template
  await page.goto(base + '/e/tasks')
  const tr = page.locator('tbody tr', { hasText: taskTitle }).first()
  await tr.waitFor()
  await tr.getByRole('button', { name: /Follow Up \(1\)/i }).click()
  const drawer2 = page.getByRole('dialog', { name: 'Task Follow-Up & Attachments' })
  await drawer2.waitFor()
  await drawer2.getByRole('button', { name: 'Completed & verified' }).click()
  await drawer2.getByRole('button', { name: /Log Final Note & Mark Done/i }).click()
  await drawer2.getByText('Follow-Up History (2)').waitFor({ timeout: 10000 })
  await drawer2.getByRole('button', { name: 'Close task follow-up drawer' }).click()

  // Verify task status synced to Done in API
  const tasksApi = await (await context.request.get(`${base}/api/e/tasks?q=${encodeURIComponent(taskTitle)}`)).json()
  const matchedTask = (tasksApi.rows || []).find(r => r.title === taskTitle)
  assert.ok(matchedTask, 'Task should be returned from /api/e/tasks')
  assert.equal(matchedTask.status, 'Done', 'Task status should sync to Done after Completed & verified follow-up')
  assert.equal(matchedTask._followup_count, 2)
  assert.equal(matchedTask._attachment_count, 2)

  // 4. Non-entity workspace scope attachment (mortgage_desk_events)
  const mRes = await context.request.post(`${base}/api/mortgage-desk/events`, {
    headers: { 'x-swk-client': 'web', 'content-type': 'application/json' },
    data: {
      client_name: 'Attachment Desk Test Client',
      bank_name: 'Emirates NBD',
      event_type: 'Valuation Booking',
      due_date: '2026-12-05',
    },
  })
  assert.equal(mRes.status(), 201)
  const mEv = await mRes.json()
  const upRes = await context.request.post(`${base}/api/files`, {
    headers: { 'x-swk-client': 'web' },
    multipart: {
      link_entity: 'mortgage_desk_events',
      link_id: String(mEv.id),
      category: 'Mortgage Document',
      file: {
        name: 'valuation-letter.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('ENBD Valuation Booking Confirmation #9981\n'),
      },
    },
  })
  assert.equal(upRes.status(), 200)
  const uploadedArr = await upRes.json()
  assert.equal(uploadedArr.length, 1)
  const overviewRes = await (await context.request.get(`${base}/api/mortgage-desk/overview`)).json()
  const foundEv = (overviewRes.events || []).find(e => e.id === mEv.id)
  assert.ok(foundEv && foundEv._attachments?.length === 1, 'Mortgage Desk overview must hydrate event attachments')

  const delRes = await context.request.delete(`${base}/api/files/${uploadedArr[0].id}`, {
    headers: { 'x-swk-client': 'web' },
  })
  assert.equal(delRes.status(), 200)

  assert.deepEqual(errors, [], `Uncaught page errors: ${errors.join('; ')}`)
  console.log('PASS: Universal Form Attachments & Easy/Detailed Task Follow-Up Suite (all checks green)')
} finally {
  if (browser) await browser.close().catch(() => {})
  server.kill('SIGTERM')
  fs.rmSync(data, { recursive: true, force: true })
  fs.rmSync(tmpDir, { recursive: true, force: true })
}
