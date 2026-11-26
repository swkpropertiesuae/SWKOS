import { signInDemo } from './ui-login.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { chromium } from 'playwright-core'

const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c49444154789c63f8cfc000000301010018dd8db00000000049454e44ae426082',
  'hex',
)

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'swk-launch-ui-'))
const sampleImgPath = path.join(data, 'shahrukhz-facade.png')
fs.writeFileSync(sampleImgPath, TINY_PNG)

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
const base = 'http://127.0.0.1:8094'
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

  // 1. Navigate to Off-Plan Launches (/offplan) and launch "Shahrukhz by Danube" via the 4-step wizard
  await page.goto(base + '/offplan')
  await page.getByRole('button', { name: /Launch Developer Project/i }).first().click()
  await page.getByPlaceholder(/Shahrukhz by Danube/i).fill('Shahrukhz by Danube')
  await page.getByPlaceholder('e.g. 1250000').fill('1850000')
  await page.getByRole('button', { name: /^Next$/i }).click()

  // Step 2: Unit typologies (keep defaults, proceed to Step 3)
  await page.getByText(/Unit Typologies & Starting Inventory/i).waitFor()
  await page.getByRole('button', { name: /^Next$/i }).click()

  // Step 3: Upload photo + paste YouTube video + paste Matterport 3D tour
  const photoInput = page.locator('input[type="file"][accept="image/*"]').first()
  await photoInput.setInputFiles(sampleImgPath)
  await page.getByPlaceholder(/YouTube, Vimeo, or MP4 URL/i).fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  await page.getByPlaceholder(/Matterport, Kuula, Sketchfab/i).fill('https://my.matterport.com/show/?m=SxQL3iGyoDo')
  await page.getByRole('button', { name: /^Next$/i }).click()

  // Step 4: Launch Project Now
  await page.getByRole('button', { name: /Launch Project Now/i }).click()
  await page.getByText(/Project Launched Successfully/i).waitFor({ timeout: 20000 })

  // 2. Open Project & Media Studio tab on the created Property record
  await page.getByRole('button', { name: /Open Project & Media Studio/i }).click()
  await page.waitForURL('**/e/properties/**')
  await page.getByRole('tab', { name: /Media, Video & 3D/i }).click()
  await page.getByText(/Upload Pictures, Videos, 3D/i).waitFor()
  await page.getByText(/Cover/i).first().waitFor()

  // 3. Verify Off-Plan Launches (/offplan) renders the new Shahrukhz by Danube card
  await page.goto(base + '/offplan')
  await page.getByText('Shahrukhz by Danube').first().waitFor()

  assert.equal(errors.length, 0, `Unexpected page errors: ${errors.join('; ')}`)
  console.log('project-launch-ui: PASS (4-step wizard, photo upload, YouTube/Matterport embed, Media Studio tab, Off-Plan Launches card)')
} finally {
  if (browser) await browser.close().catch(() => {})
  server.kill('SIGTERM')
  await new Promise(r => setTimeout(r, 300))
  try { fs.rmSync(data, { recursive: true, force: true }) } catch {}
}
