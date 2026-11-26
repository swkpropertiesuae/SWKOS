import { signInDemo } from './ui-login.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { chromium } from 'playwright-core'

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'swk-custom-dd-'))
const server = spawn(process.execPath, ['dist/server/index.mjs'], {
  env: {
    ...process.env,
    DATA_DIR: data,
    DATABASE_URL: '',
    REQUIRE_DATABASE_URL: 'false',
    DEMO_ENABLED: 'true',
    PORT: '8091',
    HOST: '127.0.0.1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
server.stdout.on('data', b => { logs += b })
server.stderr.on('data', b => { logs += b })
const base = 'http://127.0.0.1:8091'
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

  // Open Deal Files -> New Deal File form
  await page.goto(base + '/e/jobs')
  await page.getByRole('button', { name: /New Deal File/i }).click()
  await page.locator('#f-deal_name').waitFor()

  // 1. Verify CustomSelect on Deal Type supports selecting "✎ Custom / Type your own…" and typing a custom value
  const dealTypeSelect = page.locator('#f-deal_type')
  const customOptCount = await dealTypeSelect.locator('option[value="__SWK_CUSTOM__"]').count()
  assert.equal(customOptCount, 1, 'Every form select must include the Custom / Type your own option')
  await dealTypeSelect.selectOption('__SWK_CUSTOM__')
  const dealTypeInput = page.locator('input#f-deal_type')
  await dealTypeInput.waitFor()
  await dealTypeInput.fill('Custom Off-Market Floor Block')
  await dealTypeInput.press('Enter')
  // Returning to select mode keeps custom value visible and selected
  await page.locator('select#f-deal_type').waitFor()
  assert.equal(await page.locator('select#f-deal_type').inputValue(), 'Custom Off-Market Floor Block')

  // 2. Verify empty / clear works on optional select (Buyer Finance Status)
  const financeSel = page.locator('select#f-buyer_finance_type')
  await financeSel.selectOption('')
  assert.equal(await financeSel.inputValue(), '')

  // 3. Verify RefSelect allows typing a custom value even on empty search (Client lookup)
  await page.locator('#f-deal_name').fill('Custom Dropdown Verification Deal')
  const clientWrap = page.locator('.swk-form-field').filter({ hasText: 'Client (Buyer/Tenant)' })
  const clientInput = clientWrap.locator('input[role="combobox"]')
  await clientInput.click()
  await clientInput.fill('ZeroMatch Custom Buyer Holdings')
  const addBtn = page.getByRole('button', { name: /Add & use custom “ZeroMatch Custom Buyer Holdings”/i })
  await addBtn.waitFor()
  await addBtn.click()
  // Confirm input now displays the newly created client label
  await page.waitForFunction(
    () => {
      const inputs = [...document.querySelectorAll('.swk-form-field input[role="combobox"]')]
      return inputs.some(i => i.value.includes('ZeroMatch Custom Buyer Holdings'))
    },
    null,
    { timeout: 10000 },
  )

  // 3b. Pick required Branch (first seeded branch from RefSelect)
  const branchWrap = page.locator('.swk-form-field').filter({ hasText: /^Branch/ })
  const branchInput = branchWrap.locator('input[role="combobox"]')
  await branchInput.click()
  await page.locator('[role="listbox"] [role="option"]').nth(1).click()

  // 4. Submit form and confirm backend persisted both the custom select value and quick-created lookup client
  await page.getByRole('button', { name: /Create Deal File/i }).click()
  await page.waitForURL(/\/e\/jobs\/\d+/, { timeout: 15000 })
  const jobId = page.url().match(/\/jobs\/(\d+)/)?.[1]
  assert.ok(jobId, `Expected /e/jobs/:id URL, got ${page.url()}`)
  const saved = await (await context.request.get(`${base}/api/e/jobs/${jobId}`)).json()
  assert.equal(saved.deal_type, 'Custom Off-Market Floor Block', 'Custom select value must persist to DB')
  assert.equal(saved.buyer_finance_type, null, 'Emptied select value must persist as null')
  assert.equal(saved._labels?.client_id, 'ZeroMatch Custom Buyer Holdings', 'Empty-search quick-created RefSelect client must persist')

  // 5. Confirm both saved custom values render on the record view and inside Edit modal
  await page.getByText('Custom Off-Market Floor Block').first().waitFor()
  await page.getByText('ZeroMatch Custom Buyer Holdings').first().waitFor()
  await page.getByRole('button', { name: /^Edit$/i }).first().click()
  await page.locator('select#f-deal_type').waitFor()
  assert.equal(await page.locator('select#f-deal_type').inputValue(), 'Custom Off-Market Floor Block')
  assert.equal(await page.locator('select#f-buyer_finance_type').inputValue(), '')
  await page.waitForFunction(
    () => [...document.querySelectorAll('.swk-form-field input[role="combobox"]')].some(i => i.value.includes('ZeroMatch Custom Buyer Holdings')),
    null,
    { timeout: 10000 },
  )

  assert.deepEqual(errors.filter(e => !/401/.test(e)), [])
  console.log('PASS: custom editable dropdowns, empty selection, and empty-search RefSelect quick-create verified in browser')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
  try { fs.rmSync(data, { recursive: true, force: true }) } catch {}
}
