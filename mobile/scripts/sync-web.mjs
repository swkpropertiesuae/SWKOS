import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mobileDir = path.resolve(__dirname, '..')
const repoRoot = path.resolve(mobileDir, '..')
const distWebDir = path.join(repoRoot, 'dist', 'web')
const wwwDir = path.join(mobileDir, 'www')

function validateApiBase(raw) {
  const clean = String(raw || 'https://os.swk.properties').trim().replace(/\/+$/, '')
  let parsed
  try {
    parsed = new URL(clean)
  } catch {
    throw new Error(`Invalid SWK_API_BASE URL: "${clean}"`)
  }
  const allowLocalHttp = process.env.SWK_ALLOW_LOCAL_HTTP === '1'
  const isLocalHost = ['localhost', '127.0.0.1', '10.0.2.2'].includes(parsed.hostname.toLowerCase())
  if (parsed.protocol !== 'https:' && !(allowLocalHttp && isLocalHost && parsed.protocol === 'http:')) {
    throw new Error(
      `SWK_API_BASE must use https:// (got "${clean}"). Set SWK_ALLOW_LOCAL_HTTP=1 only for local emulator/dev testing.`,
    )
  }
  return clean
}

export function syncWeb() {
  const distIndex = path.join(distWebDir, 'index.html')
  if (!existsSync(distIndex)) {
    throw new Error(
      `Missing built web bundle at ${distIndex}. Run "npm run build:web" from the repository root first.`,
    )
  }

  const apiBase = validateApiBase(process.env.SWK_API_BASE)
  rmSync(wwwDir, { recursive: true, force: true })
  mkdirSync(wwwDir, { recursive: true })
  // Exclude large desktop/social/print-only assets from mobile APK bundle to cut APK size & startup I/O
  const mobileExclude = [
    /^og\.png$/i,
    /^app-icon-512\.png$/i,
    /^brand\/swk-app-icon\.png$/i,
    /^brand\/swk-emblem-8k-transparent\.png$/i,
    /^brand\/os\/SWK_Emblem_Transparent_1024\.png$/i,
    /^brand\/os\/SWK_OS_Horizontal_Logo_Transparent_2048\.png$/i,
    /^brand\/site\/.*(2048|4096)\.png$/i,
    /^fonts\/(clash-display|general-sans|instrument-sans|plus-jakarta-sans)/i,
  ]
  cpSync(distWebDir, wwwDir, {
    recursive: true,
    filter(src) {
      const rel = path.relative(distWebDir, src).replace(/\\/g, '/')
      if (!rel) return true
      return !mobileExclude.some(rx => rx.test(rel))
    },
  })

  const runtimeConfig = {
    API_BASE: apiBase,
    MOBILE_SHELL: true,
    BUILD_AT: new Date().toISOString(),
  }
  writeFileSync(
    path.join(wwwDir, 'swk-runtime-config.js'),
    `window.__SWK_CONFIG__ = Object.freeze(${JSON.stringify(runtimeConfig)});\n`,
    'utf8',
  )

  const wwwIndexPath = path.join(wwwDir, 'index.html')
  let html = readFileSync(wwwIndexPath, 'utf8')
  const configScriptTag = '<script src="/swk-runtime-config.js"></script>'
  if (!html.includes('/swk-runtime-config.js')) {
    if (html.includes('<script')) {
      html = html.replace('<script', `${configScriptTag}\n    <script`)
    } else if (html.includes('</head>')) {
      html = html.replace('</head>', `    ${configScriptTag}\n  </head>`)
    } else {
      html = `${configScriptTag}\n${html}`
    }
    writeFileSync(wwwIndexPath, html, 'utf8')
  }

  console.log(`Synced ${distWebDir} -> ${wwwDir} (API_BASE=${apiBase})`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  syncWeb()
}
