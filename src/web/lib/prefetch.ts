/**
 * Zero-Loading Route Chunk Preloader & Fast Persistent Cache Helpers.
 * Preloads lazy React route chunks on hover/focus and during browser idle time so
 * navigating anywhere in SWK OS renders instantaneously with zero loading delay.
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

export function warmCoreRoutesOnIdle() {
  if (typeof window === 'undefined') return
  const run = () => {
    const core = ['/dashboard', '/e/properties', '/offplan', '/listings', '/pipeline', '/dubai-agency-hub', '/shabibs-corner']
    core.forEach((p, idx) => {
      window.setTimeout(() => preloadRoute(p), idx * 140)
    })
  }
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(run, { timeout: 2000 })
  } else {
    globalThis.setTimeout(run, 1200)
  }
}

const CACHE_KEY = 'swk.fast.rq.v1'
const PERSIST_PREFIXES = new Set([
  'dashboard',
  'owner-corner-overview',
  'shabib-team-daily',
  'dubai-agency-hub',
  'notifications',
])

export function hydrateFastQueryCache(qc: QueryClient) {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as { savedAt: number; entries: Array<{ key: unknown[]; data: unknown }> }
    if (!parsed?.entries || Date.now() - Number(parsed.savedAt || 0) > 15 * 60_000) return
    for (const item of parsed.entries) {
      if (Array.isArray(item.key) && item.data !== undefined) {
        qc.setQueryData(item.key, item.data)
      }
    }
  } catch {
    /* ignore corrupt cache */
  }
}

export function installFastQueryCacheSync(qc: QueryClient) {
  if (typeof window === 'undefined') return
  let timer: number | undefined
  const flush = () => {
    try {
      const all = qc.getQueryCache().getAll()
      const entries: Array<{ key: unknown[]; data: unknown }> = []
      for (const q of all) {
        const k0 = String(q.queryKey?.[0] || '')
        if (!PERSIST_PREFIXES.has(k0) || q.state.data === undefined) continue
        entries.push({ key: [...q.queryKey], data: q.state.data })
        if (entries.length >= 12) break
      }
      const str = JSON.stringify({ savedAt: Date.now(), entries })
      if (str.length < 450_000) localStorage.setItem(CACHE_KEY, str)
    } catch {
      /* ignore quota */
    }
  }
  qc.getQueryCache().subscribe(() => {
    window.clearTimeout(timer)
    timer = window.setTimeout(flush, 1500)
  })
  window.addEventListener('swk:unauthorized', () => {
    try { localStorage.removeItem(CACHE_KEY) } catch { /* ignore */ }
  })
}
