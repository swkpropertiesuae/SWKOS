// The check-in page camera must recognise the reception code the server issues (fixed and rotating). Uses a fake phone camera that shows the real QR.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { chromium } from 'playwright-core'
import QRCode from 'qrcode'

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'swk-checkin-'))
const server = spawn(process.execPath, ['dist/server/index.mjs'], { env: { ...process.env, DATA_DIR: data, DATABASE_URL: '', REQUIRE_DATABASE_URL: 'false', DEMO_ENABLED: 'true', PORT: '8093', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] })
let logs = ''; server.stdout.on('data', b => { logs += b }); server.stderr.on('data', b => { logs += b })
const base = 'http://127.0.0.1:8093'
try {
  let online = false
  for (let i = 0; i < 120; i++) { try { if ((await fetch(base + '/api/health')).ok && (await (await fetch(base + '/api/demo/status')).json()).enabled) { online = true; break } } catch {} await new Promise(r => setTimeout(r, 500)) }
  assert.ok(online, logs)
  const executablePath = process.env.CHROME_PATH || execFileSync('bash', ['-c', 'command -v google-chrome || command -v chromium'], { encoding: 'utf8' }).trim()
  // the Owner/Admin side: sign in, lock the office network, read the code
  const adminBrowser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  const admin = await adminBrowser.newContext()
  const api = admin.request, H = { 'x-swk-client': 'web' }
  assert.ok((await api.post(base + '/api/auth/login', { headers: H, data: { email: 'admin@swk.properties', password: 'Admin@swk.properties' } })).ok(), 'admin signs in')
  assert.ok((await api.post(base + '/api/swk-ops/attendance-setup', { headers: H, data: { lock_current_ip: true } })).ok(), 'office network locked')
  for (const mode of ['fixed', 'rotating']) {
    const tok = (await (await api.post(base + '/api/swk-ops/reception-token/mode', { headers: H, data: { mode } })).json()).token
    assert.ok(tok.startsWith(mode === 'fixed' ? 'SWK2.' : 'SWK1.'), `${mode} code issued`)
    // fake camera: a looping video of the real QR
    const png = path.join(data, `${mode}.png`), y4m = path.join(data, `${mode}.y4m`)
    await QRCode.toFile(png, tok, { width: 480, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', png, '-t', '4', '-r', '10', '-vf', 'scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p', y4m])
    const b = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`] })
    try {
      const page = await (await b.newContext({ permissions: ['camera'] })).newPage()
      await page.goto(base + '/reception-qr')
      await page.getByText(/Code read/i).waitFor({ timeout: 20000 })
      assert.ok(await page.locator('#qr-email').isVisible(), `${mode}: sign-in form appears after the camera reads the code`)
      console.log(`  ✓ camera reads the ${mode} code and opens the sign-in form`)
    } finally { await b.close() }
  }
  await adminBrowser.close()
  console.log('PASS: check-in page camera accepts the fixed and the rotating reception code')
} finally { server.kill('SIGTERM'); try { fs.rmSync(data, { recursive: true, force: true }) } catch {} }
