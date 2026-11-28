/**
 * Playwright Browser Acceptance Suite for Customise UI & Pin/Drag Workspace.
 * Verifies:
 *  1. Top bar Customise UI trigger opens live slide-over drawer
 *  2. Switching to Obsidian Night Gold updates html[data-ui-customized="1"], dark mode & CSS vars live
 *  3. Font size (18px), font family (Instrument Serif), Italic & Uppercase headings apply live
 *  4. Highlight feature (Vivid Spotlight + starred VIP app) applies live glow class
 *  5. Pinning current page + enabling Draggable Floating Quick-Pad + Top Pinned Bar render live & persist across reload
 *  6. /print/invoices/1 strips data-ui-customized so official corporate letterhead & PDFs stay untouched
 *  7. Mobile viewport (390x844) stays free of horizontal overflow with clamped Floating Quick-Pad
 *  8. Reset Everything cleanly restores default untouched SWK Signature theme
 */
import { signInDemo } from './ui-login.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { chromium } from 'playwright-core'

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'swk-customise-ui-browser-'))
const base = 'http://127.0.0.1:8094'
const server = spawn(process.execPath, ['dist/server/index.mjs'], {
  env: {
    ...process.env,
    DATA_DIR: data,
    DATABASE_URL: '',
    REQUIRE_DATABASE_URL: 'false',
    DEMO_ENABLED: 'true',
    PORT: '8094',
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

  // Untouched default must NOT set data-ui-customized
  const initialCustomized = await page.evaluate(() => document.documentElement.getAttribute('data-ui-customized'))
  assert.equal(initialCustomized, null, 'Default untouched workspace must not enable custom override stylesheet')

  // 1. Open Customise UI live slide-over drawer
  await page.getByRole('button', { name: 'Customise UI (Alt+U)' }).click()
  const dialog = page.getByRole('dialog', { name: 'Customise UI Studio' })
  await dialog.waitFor()

  // 2. Apply Obsidian Night Gold preset -> updates DOM live + verify studio panel stays crisp light contrast!
  await dialog.getByRole('button', { name: /Obsidian Night Gold/ }).click()
  await page.waitForFunction(() => document.documentElement.getAttribute('data-ui-customized') === '1' && document.documentElement.dataset.theme === 'dark')
  const studioContrast = await dialog.evaluate(el => {
    const cs = getComputedStyle(el)
    return { bg: cs.backgroundColor, color: cs.color }
  })
  assert.equal(studioContrast.bg, 'rgb(255, 255, 255)', 'Customise UI drawer must stay crisp white in Dark mode')

  // Verify hex typing works cleanly in ColorPickerRow
  const bgHex = dialog.getByLabel('Page Background hex')
  await bgHex.fill('#101520')
  await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--bg') === '#101520')

  // 3. Fonts & Size tab: set XL font (19px), Italic, Uppercase Headings
  await dialog.getByRole('tab', { name: 'Fonts & Size' }).click()
  await dialog.getByRole('button', { name: 'XL', exact: true }).click()
  await dialog.getByRole('button', { name: 'italic', exact: true }).click()
  await dialog.getByLabel('Heading & Title Font').selectOption('instrument-serif')
  await dialog.getByLabel('Uppercase Section Headings').check()
  const fontCheck = await page.evaluate(() => ({
    size: document.documentElement.style.getPropertyValue('--swk-ui-font-size'),
    style: document.documentElement.style.getPropertyValue('--swk-ui-font-style'),
    upper: document.documentElement.getAttribute('data-ui-uppercase-headings'),
    headingFont: document.documentElement.style.getPropertyValue('--font-display'),
  }))
  assert.equal(fontCheck.size, '19px')
  assert.equal(fontCheck.style, 'italic')
  assert.equal(fontCheck.upper, '1')
  assert.ok(fontCheck.headingFont.includes('Instrument Serif'))

  // 4. Highlight tab: Vivid Spotlight + Star an app
  await dialog.getByRole('tab', { name: 'Highlight' }).click()
  await dialog.getByRole('button', { name: 'Vivid Spotlight', exact: true }).click()
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-ui-highlight')), 'vivid')
  await dialog.getByRole('button', { name: /Pipeline Playbook/ }).click()

  // 5. Pins & Drag tab: Pin Current Page + Enable Floating Quick-Pad + Top Bar
  await dialog.getByRole('tab', { name: 'Pins & Drag' }).click()
  await dialog.getByRole('button', { name: /\+ Pin Current Page/ }).click()
  await dialog.getByLabel('Enable Draggable Floating Quick-Pad').check()
  await dialog.getByRole('button', { name: /Top Bar/ }).click()

  // Explicitly flush Save & Sync
  await dialog.getByRole('button', { name: 'Save & Sync' }).click()
  await page.waitForTimeout(350)
  await dialog.getByRole('button', { name: 'Close Customise UI' }).click()

  // Verify Pinned Dock, Floating Quick-Pad, and Highlighted VIP app all render live
  await page.getByRole('navigation', { name: 'Pinned quick shortcuts' }).waitFor()
  await page.getByRole('region', { name: 'Draggable Floating Quick-Pad' }).waitFor()
  assert.ok((await page.locator('.swk-ui-highlighted').count()) >= 1, 'Starred app should carry highlight class')

  // 6. Full Reload persistence check
  await page.reload()
  await page.getByRole('navigation', { name: 'Pinned quick shortcuts' }).waitFor()
  await page.getByRole('region', { name: 'Draggable Floating Quick-Pad' }).waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-ui-customized')), '1')
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--swk-ui-font-size')), '19px')

  // 7. Print route immunity check (/print/invoices/1 MUST strip custom dark/italic overrides!)
  const inv = (await (await context.request.get(base + '/api/e/invoices?pageSize=1')).json()).rows[0]
  await page.goto(`${base}/print/invoices/${inv.id}`)
  await page.locator('.print-sheet[data-print-ready=true]').waitFor()
  const printCustomized = await page.evaluate(() => ({
    customized: document.documentElement.getAttribute('data-ui-customized'),
    theme: document.documentElement.dataset.theme,
  }))
  assert.equal(printCustomized.customized, null, '/print/* must strip data-ui-customized')
  assert.equal(printCustomized.theme, 'light', '/print/* must restore crisp light letterhead')

  // 8. Full /customise-ui Studio page + Mobile viewport (390x844) clamping & zero horizontal overflow
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${base}/customise-ui`)
  await page.getByRole('heading', { name: 'Customise UI Studio' }).waitFor()
  await page.waitForTimeout(300)
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'Mobile /customise-ui + floating pad must fit viewport with zero horizontal overflow',
  )

  // 9. Reset Everything restores clean SWK Signature default
  await page.getByRole('tab', { name: 'Save & Sync' }).click()
  await page.getByRole('button', { name: /Reset Everything/ }).click()
  await page.waitForFunction(() => document.documentElement.getAttribute('data-ui-customized') === null)

  // 10. Regression guard: clicking the Settings app tile on /home must open /admin/settings directly (never redirect to /customise-ui)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${base}/home`)
  const settingsTile = page.locator('a[href="/admin/settings"]').filter({ hasText: 'Settings' }).first()
  await settingsTile.waitFor()
  await settingsTile.click()
  await page.waitForURL(url => url.pathname === '/admin/settings')
  await page.getByRole('heading', { name: /Company settings/i }).waitFor()
  assert.equal(new URL(page.url()).pathname, '/admin/settings', 'Settings tile must land on /admin/settings')

  assert.deepEqual(errors.filter(e => !/401/.test(e)), [])
  console.log('PASS: Customise UI live drawer, colors, fonts, highlights, pin/drag dock & floating pad, reload persistence, print immunity, mobile layout & Settings route')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
  await new Promise(r => (server.exitCode !== null ? r() : server.once('exit', r)))
  fs.rmSync(data, { recursive: true, force: true })
}
