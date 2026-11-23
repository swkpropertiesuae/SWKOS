import sanitizeHtml from 'sanitize-html'
import { inDemo } from '../db'
import { getSetting } from '../settings'
import { bad, HttpError } from '../util'

export type WebSearchProvider = 'duckduckgo' | 'tavily' | 'brave' | 'searxng'

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
  source: string
}

export interface WebSearchResponse {
  provider: string
  results: WebSearchResult[]
}

export type WebSearchFetcher = (input: string, init?: RequestInit) => Promise<Response>

let customFetcherForTests: WebSearchFetcher | null = null

/** Injectable fetch hook for deterministic unit tests without external internet calls. */
export function setWebSearchFetcherForTests(fn: WebSearchFetcher | null): void {
  customFetcherForTests = fn
}

function getFetcher(): WebSearchFetcher {
  return customFetcherForTests ?? (fetch as unknown as WebSearchFetcher)
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_m, code) => {
      const n = Number(code)
      if (!Number.isFinite(n) || n === 60 || n === 62) return ''
      return String.fromCodePoint(n)
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => {
      const n = parseInt(hex, 16)
      if (!Number.isFinite(n) || n === 60 || n === 62) return ''
      return String.fromCodePoint(n)
    })
}

function sanitizePlainText(raw: unknown, maxLen = 400): string {
  const stripped = sanitizeHtml(String(raw ?? ''), {
    allowedTags: [],
    allowedAttributes: {},
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed', 'svg'],
  })
  return decodeBasicEntities(stripped).replace(/\s+/g, ' ').trim().slice(0, maxLen)
}

function normalizeHttpUrl(raw: unknown): string | null {
  let s = String(raw ?? '').trim()
  if (!s) return null
  if (s.startsWith('//')) s = 'https:' + s
  if (s.startsWith('/l/?')) s = 'https://duckduckgo.com' + s
  let parsed: URL
  try {
    parsed = new URL(s)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (parsed.hostname.endsWith('duckduckgo.com') && parsed.pathname.startsWith('/l/')) {
    const target = parsed.searchParams.get('uddg')
    if (target) {
      try {
        const inner = new URL(target)
        if (inner.protocol === 'http:' || inner.protocol === 'https:') return inner.toString()
      } catch {
        return null
      }
    }
    return null
  }
  return parsed.toString()
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return ''
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(new Error(`Web search timed out after ${timeoutMs}ms`)), timeoutMs)
  try {
    return await getFetcher()(url, { ...init, signal: ctl.signal })
  } finally {
    clearTimeout(timer)
  }
}

function parseDuckDuckGoHtml(html: string, limit: number): WebSearchResult[] {
  const out: WebSearchResult[] = []
  const seen = new Set<string>()
  const anchorRe = /<a\b[^>]*class="[^"]*\b(?:result__a|result-link)\b[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  const anchors: { index: number; href: string; titleHtml: string }[] = []
  let m: RegExpExecArray | null
  while ((m = anchorRe.exec(html)) !== null) {
    anchors.push({ index: m.index, href: m[1] ?? '', titleHtml: m[2] ?? '' })
  }

  for (let i = 0; i < anchors.length && out.length < limit; i++) {
    const cur = anchors[i]!
    const nextIdx = anchors[i + 1]?.index ?? html.length
    const block = html.slice(cur.index, Math.min(nextIdx, cur.index + 4000))
    const url = normalizeHttpUrl(decodeBasicEntities(cur.href))
    if (!url || seen.has(url)) continue
    const title = sanitizePlainText(cur.titleHtml, 200)
    if (!title) continue
    const snipMatch =
      /<[^>]*class="[^"]*\b(?:result__snippet|result-snippet)\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div|span|p)>/i.exec(
        block,
      )
    const snippet = sanitizePlainText(snipMatch?.[1] ?? '', 360)
    seen.add(url)
    out.push({
      title,
      url,
      snippet,
      source: hostnameOf(url) || 'duckduckgo',
    })
  }
  return out
}

async function searchDuckDuckGo(query: string, limit: number, timeoutMs: number): Promise<WebSearchResult[]> {
  const endpoint = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const res = await fetchWithTimeout(
    endpoint,
    {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SWK-OS/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    },
    timeoutMs,
  )
  if (!res.ok) throw new HttpError(502, `DuckDuckGo search returned HTTP ${res.status}`)
  const html = await res.text()
  return parseDuckDuckGoHtml(html, limit)
}

async function searchTavily(query: string, limit: number, timeoutMs: number): Promise<WebSearchResult[]> {
  const apiKey = String(getSetting('web_search_api_key') || '').trim()
  if (!apiKey) throw bad('Tavily API key (web_search_api_key) is not configured in Settings.')
  const res = await fetchWithTimeout(
    'https://api.tavily.com/search',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ api_key: apiKey, query, max_results: limit, search_depth: 'basic' }),
    },
    timeoutMs,
  )
  if (!res.ok) throw new HttpError(502, `Tavily search returned HTTP ${res.status}`)
  const data = (await res.json().catch(() => ({}))) as any
  const items = Array.isArray(data?.results) ? data.results : []
  return items
    .map((r: any): WebSearchResult | null => {
      const url = normalizeHttpUrl(r?.url)
      const title = sanitizePlainText(r?.title, 200)
      if (!url || !title) return null
      return {
        title,
        url,
        snippet: sanitizePlainText(r?.content ?? r?.snippet ?? '', 360),
        source: hostnameOf(url) || 'tavily',
      }
    })
    .filter((x: WebSearchResult | null): x is WebSearchResult => Boolean(x))
    .slice(0, limit)
}

async function searchBrave(query: string, limit: number, timeoutMs: number): Promise<WebSearchResult[]> {
  const apiKey = String(getSetting('web_search_api_key') || '').trim()
  if (!apiKey) throw bad('Brave Search API key (web_search_api_key) is not configured in Settings.')
  const endpoint = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`
  const res = await fetchWithTimeout(
    endpoint,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
    },
    timeoutMs,
  )
  if (!res.ok) throw new HttpError(502, `Brave Search returned HTTP ${res.status}`)
  const data = (await res.json().catch(() => ({}))) as any
  const items = Array.isArray(data?.web?.results) ? data.web.results : []
  return items
    .map((r: any): WebSearchResult | null => {
      const url = normalizeHttpUrl(r?.url)
      const title = sanitizePlainText(r?.title, 200)
      if (!url || !title) return null
      return {
        title,
        url,
        snippet: sanitizePlainText(r?.description ?? r?.snippet ?? '', 360),
        source: hostnameOf(url) || 'brave',
      }
    })
    .filter((x: WebSearchResult | null): x is WebSearchResult => Boolean(x))
    .slice(0, limit)
}

async function searchSearxng(query: string, limit: number, timeoutMs: number): Promise<WebSearchResult[]> {
  const rawBase = String(getSetting('web_search_searxng_url') || '').trim().replace(/\/+$/, '')
  const validBase = normalizeHttpUrl(rawBase)
  if (!validBase) {
    throw bad('SearXNG base URL (web_search_searxng_url) is not configured or invalid in Settings.')
  }
  const endpoint = `${validBase.replace(/\/+$/, '')}/search?q=${encodeURIComponent(query)}&format=json`
  const res = await fetchWithTimeout(
    endpoint,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
    },
    timeoutMs,
  )
  if (!res.ok) throw new HttpError(502, `SearXNG search returned HTTP ${res.status}`)
  const data = (await res.json().catch(() => ({}))) as any
  const items = Array.isArray(data?.results) ? data.results : []
  return items
    .map((r: any): WebSearchResult | null => {
      const url = normalizeHttpUrl(r?.url)
      const title = sanitizePlainText(r?.title, 200)
      if (!url || !title) return null
      return {
        title,
        url,
        snippet: sanitizePlainText(r?.content ?? r?.snippet ?? '', 360),
        source: sanitizePlainText(r?.engine, 60) || hostnameOf(url) || 'searxng',
      }
    })
    .filter((x: WebSearchResult | null): x is WebSearchResult => Boolean(x))
    .slice(0, limit)
}

export async function searchWeb(
  query: string,
  opts: { limit?: number; timeoutMs?: number; provider?: WebSearchProvider } = {},
): Promise<WebSearchResponse> {
  const cleanQ = String(query ?? '').trim().slice(0, 400)
  if (!cleanQ) throw bad('Search query is required')
  const limit = Math.min(20, Math.max(1, Number(opts.limit) || 8))
  const timeoutMs = Math.min(20_000, Math.max(1000, Number(opts.timeoutMs) || 8000))

  if (inDemo()) {
    return {
      provider: 'demo',
      results: [
        {
          title: `Dubai Land Department & RERA Guide: ${cleanQ}`,
          url: 'https://dubailand.gov.ae/en/eservices/',
          snippet: 'Official DLD / RERA transaction rules, Ejari tenancy registration, Oqood off-plan registration, and Form A/B/F brokerage standards.',
          source: 'dubailand.gov.ae (Demo)',
        },
        {
          title: `SWK Properties UAE — ${cleanQ} Market Insights`,
          url: 'https://www.swkpropertiesuae.com',
          snippet: 'Curated Dubai freehold communities, rental yields, service charges, and RERA compliance guidance.',
          source: 'swkpropertiesuae.com (Demo)',
        },
      ].slice(0, limit),
    }
  }

  const rawProvider = String(opts.provider ?? (getSetting('web_search_provider') || 'duckduckgo')).trim().toLowerCase()
  const provider: WebSearchProvider =
    rawProvider === 'tavily' || rawProvider === 'brave' || rawProvider === 'searxng' ? rawProvider : 'duckduckgo'

  let results: WebSearchResult[]
  if (provider === 'tavily') results = await searchTavily(cleanQ, limit, timeoutMs)
  else if (provider === 'brave') results = await searchBrave(cleanQ, limit, timeoutMs)
  else if (provider === 'searxng') results = await searchSearxng(cleanQ, limit, timeoutMs)
  else results = await searchDuckDuckGo(cleanQ, limit, timeoutMs)

  return { provider, results }
}
