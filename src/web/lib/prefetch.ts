/**
 * Zero-Loading Route Chunk Preloader & Strictly User-Scoped Session Cache Helpers.
 *
 * Security invariants:
 *  - NEVER persists Owner-only private ledgers (Shabib's Workspace / Privacy Fast Track).
 *  - Persists only non-sensitive UI view snapshots in sessionStorage scoped to `{ userId, demo }`.
 *  - Hydrates ONLY after `/api/auth/me` confirms the active `{ id, demo }`.
 *  - Clears both sessionStorage AND TanStack QueryClient immediately on sign-out,
 *    account switch, or HTTP 401 (`swk:unauthorized`) so zero data ever leaks across users.
 */
import type { QueryClient } from '@tanstack/react-query'

const preloaded = new Set<string>()

const ROUTE_LOADERS: Array<[RegExp, () => Promise<unknown>]> = [
  [/^\/dashboard/, () => import('../pages/Dashboard')],
  [/^\/shabibs-corner/, () => import('../pages/swk/ShabibsCornerPage')],
  [/^\/dubai-agency-hub/, () => import('../pages/swk/DubaiAgencyHubPage')],
  [/^\/mobile-apps/, () => import('../pages/swk/MobileAppsPage')],
  [/^\/command-center/, () => import('../pages/swk/CommandCenterPage')],
  [/^\/offplan/, () => import('../pages/swk/OffPlanPage')],
  [/^\/listings/, () => import('../pages/swk/ListingsStudio')],
  [/^\/pipeline/, () => import('../pages/swk/PipelinePage')],
  [/^\/field-duty/, () => import('../pages/swk/FieldDutyPage')],
  [/^\/e\//, () => import('../pages/EntityPages')],
  [/^\/chat/, () => import('../pages/ChatPage')],
  [/^\/whatsapp/, () => import('../pages/WhatsAppPage')],
  [/^\/phone/, () => import('../pages/swk/PhonePage')],
  [/^\/market/, () => import('../pages/swk/MarketPage')],
  [/^\/admin\/backup/, () => import('../pages/AdminPages')],
  [/^\/utilities\/word/, () => import('../pages/swk/WordStudioPage')],
  [/^\/crm-vault/, () => import('../pages/swk/CrmVaultPage')],
  [/^\/mortgage-desk/, () => import('../pages/swk/MortgageDeskPage')],
]

export function preloadRoute(to: string) {
  const path = String(to || '').split('?')[0]
  if (!path) return
  for (const [re, loader] of ROUTE_LOADERS) {
    if (re.test(path)) {
      const key = re.source
      if (preloaded.has(key)) return
      preloaded.add(key)
      void loader().catch(() => preloaded.delete(key))
      return
    }
  }
}

function isNonInteractiveRoute(): boolean {
  if (typeof window === 'undefined') return true
  const p = window.location.pathname || ''
  return p.startsWith('/print/') || p.startsWith('/l/') || p.startsWith('/t/') || p === '/accept-invite'
}

export function warmCoreRoutesOnIdle() {
  if (isNonInteractiveRoute()) return
  const run = () => {
    if (isNonInteractiveRoute()) return
    const core = ['/dashboard', '/e/properties', '/offplan', '/listings', '/pipeline', '/dubai-agency-hub']
    core.forEach((p, idx) => {
      globalThis.setTimeout(() => preloadRoute(p), idx * 140)
    })
  }
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(run, { timeout: 2000 })
  } else {
    globalThis.setTimeout(run, 1200)
  }
}

const CACHE_KEY = 'swk.fast.rq.v2'
const LEGACY_CACHE_KEY = 'swk.fast.rq.v1'
const PERSIST_PREFIXES = new Set([
  'dashboard',
  'dubai-agency-hub',
  'notifications',
])

let activeIdentity: { userId: number; demo: boolean } | null = null
let flushTimer: ReturnType<typeof globalThis.setTimeout> | undefined

export function clearFastQueryCache(qc?: QueryClient) {
  activeIdentity = null
  if (flushTimer !== undefined) {
    globalThis.clearTimeout(flushTimer)
    flushTimer = undefined
  }
  try {
    sessionStorage.removeItem(CACHE_KEY)
    localStorage.removeItem(LEGACY_CACHE_KEY)
    localStorage.removeItem(CACHE_KEY)
  } catch { /* ignore */ }
  qc?.clear()
}

export function setFastCacheIdentity(qc: QueryClient, user: { id: number; demo?: boolean } | null) {
  if (!user || !Number.isFinite(Number(user.id))) {
    clearFastQueryCache(qc)
    return
  }
  const next = { userId: Number(user.id), demo: Boolean(user.demo) }
  if (activeIdentity && (activeIdentity.userId !== next.userId || activeIdentity.demo !== next.demo)) {
    clearFastQueryCache(qc)
  }
  activeIdentity = next
  try {
    // Purge legacy unscoped localStorage cache if any exists
    localStorage.removeItem(LEGACY_CACHE_KEY)
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as {
      userId: number
      demo: boolean
      savedAt: number
      entries: Array<{ key: unknown[]; data: unknown }>
    }
    if (
      parsed.userId !== next.userId ||
      Boolean(parsed.demo) !== next.demo ||
      Date.now() - Number(parsed.savedAt || 0) > 10 * 60_000
    ) {
      sessionStorage.removeItem(CACHE_KEY)
      return
    }
    for (const item of parsed.entries ?? []) {
      if (Array.isArray(item.key) && item.data !== undefined && PERSIST_PREFIXES.has(String(item.key[0] || ''))) {
        qc.setQueryData(item.key, item.data)
      }
    }
  } catch {
    try { sessionStorage.removeItem(CACHE_KEY) } catch { /* ignore */ }
  }
}

export function installFastQueryCacheSync(qc: QueryClient) {
  if (isNonInteractiveRoute()) return
  const flush = () => {
    flushTimer = undefined
    if (!activeIdentity) return
    try {
      const all = qc.getQueryCache().getAll()
      const entries: Array<{ key: unknown[]; data: unknown }> = []
      for (const q of all) {
        const k0 = String(q.queryKey?.[0] || '')
        if (!PERSIST_PREFIXES.has(k0) || q.state.data === undefined) continue
        entries.push({ key: [...q.queryKey], data: q.state.data })
        if (entries.length >= 8) break
      }
      const str = JSON.stringify({
        userId: activeIdentity.userId,
        demo: activeIdentity.demo,
        savedAt: Date.now(),
        entries,
      })
      if (str.length < 350_000) sessionStorage.setItem(CACHE_KEY, str)
    } catch {
      /* ignore quota */
    }
  }
  qc.getQueryCache().subscribe(() => {
    if (!activeIdentity) return
    if (flushTimer !== undefined) globalThis.clearTimeout(flushTimer)
    flushTimer = globalThis.setTimeout(flush, 1500)
  })
  window.addEventListener('swk:unauthorized', () => {
    clearFastQueryCache(qc)
  })
}
