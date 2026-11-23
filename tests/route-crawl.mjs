// Opens every launcher/sidebar route in a real browser as one signed-in user and reports page errors,
// failed API calls (4xx/5xx other than expected 403 for restricted users) and blank pages.
// Usage: BASE_URL=http://127.0.0.1:8090 CRAWL_EMAIL=... CRAWL_PASSWORD=... node tests/route-crawl.mjs
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080'
const nav = readFileSync(new URL('../src/web/swk/nav.ts', import.meta.url), 'utf8')
const routes = [...new Set(['/home', '/profile', ...[...nav.matchAll(/to: '([^']+)'/g)].map(m => m[1])])].filter(r => r.startsWith('/'))
const res = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-swk-client': 'web' }, body: JSON.stringify({ email: process.env.CRAWL_EMAIL, password: process.env.CRAWL_PASSWORD }) })
if (res.status !== 200) { console.log('login failed', res.status, await res.text()); process.exit(2) }
const [name, value] = res.headers.get('set-cookie').split(';')[0].split('=')
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addCookies([{ name, value, url: BASE }])
const page = await ctx.newPage()
let bad = 0
for (const r of routes) {
  const errs = []
  const onErr = e => errs.push('pageerror: ' + e.message.slice(0, 160))
  const onCon = m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)) }
  const onRes = x => { const u = x.url(); if (u.includes('/api/') && x.status() >= 400 && !(x.status() === 403 && process.env.CRAWL_ALLOW_403) && !/\/api\/(live|events)/.test(u)) errs.push(`${x.status()} ${x.request().method()} ${u.replace(BASE, '')}`) }
  page.on('pageerror', onErr); page.on('console', onCon); page.on('response', onRes)
  await page.goto(BASE + r, { waitUntil: 'networkidle', timeout: 30000 }).catch(e => errs.push('goto: ' + e.message.slice(0, 120)))
  await page.waitForTimeout(250)
  const text = (await page.locator('main, #root').first().innerText().catch(() => '')).trim()
  if (text.length < 20) errs.push('blank page')
  if (/Something went wrong|Unexpected Application Error/i.test(text)) errs.push('error boundary')
  const landed = new URL(page.url()).pathname
  page.off('pageerror', onErr); page.off('console', onCon); page.off('response', onRes)
  if (errs.length) { bad++; console.log(`✗ ${r}${landed !== r.split('?')[0] ? ' -> ' + landed : ''}\n   ` + errs.join('\n   ')) }
  else console.log(`✓ ${r}${landed !== r.split('?')[0] ? ' -> ' + landed : ''}`)
}
await browser.close()
console.log(`\n${routes.length - bad}/${routes.length} clean`)
process.exit(bad ? 1 : 0)
