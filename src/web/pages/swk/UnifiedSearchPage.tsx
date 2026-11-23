import { Fragment, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2,
  Check,
  Copy,
  Database,
  ExternalLink,
  Globe,
  LineChart,
  Loader2,
  Lock,
  MessagesSquare,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { canAccessCrmVault } from '@shared/swk-staff-access'
import { post } from '../../lib/api'
import { useMeta } from '../../lib/meta'
import { useToast } from '../../lib/toast'
import { ShareToInsideModal } from '../../components/ShareToInsideModal'
import { ModuleHeader, Pill } from '../../swk/ui'

type SearchScope = 'internal' | 'website' | 'market' | 'web'

interface UnifiedSearchHit {
  id: string
  scope: SearchScope
  entity: string
  title: string
  subtitle?: string
  snippet?: string
  url?: string
  link?: string
  meta?: Record<string, unknown>
}

interface SearchCitation {
  index: number
  scope: SearchScope
  title: string
  url?: string
  snippet?: string
}

interface UnifiedSearchResponse {
  q: string
  scopes: SearchScope[]
  role_tier: string
  total: number
  counts: Record<SearchScope, number>
  results: UnifiedSearchHit[]
  by_scope: Record<SearchScope, UnifiedSearchHit[]>
  warnings?: string[]
  synthesis?: {
    answer: string
    citations: SearchCitation[]
    provider: string
    model: string
    zero_retention: boolean
    pii_redacted: number
  }
}

const SCOPE_META: { key: SearchScope; label: string; icon: typeof Database; pillTone: 'navy' | 'oasis' | 'champ' | 'sky' }[] = [
  { key: 'internal', label: 'SWK Internal', icon: Database, pillTone: 'navy' },
  { key: 'website', label: 'SWKPROPERTY.COM', icon: Building2, pillTone: 'oasis' },
  { key: 'market', label: 'Dubai Market', icon: LineChart, pillTone: 'champ' },
  { key: 'web', label: 'Live Web', icon: Globe, pillTone: 'sky' },
]

const SAMPLE_QUERIES = [
  'Dubai Creek Harbour',
  '2 BR Downtown',
  'Ejari',
  'Golden Visa',
  'Business Bay',
]

function isSafeHref(href: string | undefined): href is string {
  if (!href) return false
  const t = href.trim()
  if (t.startsWith('/') && !t.startsWith('//')) return true
  try {
    const u = new URL(t)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

function renderAnswerWithCitations(answer: string, citations: SearchCitation[]): ReactNode {
  const byIndex = new Map(citations.map(c => [c.index, c]))
  const parts = answer.split(/(\[\d+\])/g)
  return parts.map((part, i) => {
    const m = /^\[(\d+)\]$/.exec(part)
    if (!m) return <Fragment key={i}>{part}</Fragment>
    const idx = Number(m[1])
    const cite = byIndex.get(idx)
    if (!cite || !isSafeHref(cite.url)) {
      return (
        <span key={i} className="inline-block rounded bg-[#e8fff6] px-1 text-[11.5px] font-semibold text-[#0e9f6e]">
          {part}
        </span>
      )
    }
    const href = cite.url
    if (href.startsWith('/')) {
      return (
        <Link key={i} to={href} title={cite.title} className="inline-block rounded bg-[#e8fff6] px-1 text-[11.5px] font-semibold text-[#0e9f6e] no-underline hover:underline">
          {part}
        </Link>
      )
    }
    return (
      <a
        key={i}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={cite.title}
        className="inline-block rounded bg-[#e8fff6] px-1 text-[11.5px] font-semibold text-[#0e9f6e] no-underline hover:underline"
      >
        {part}
      </a>
    )
  })
}

export default function UnifiedSearchPage({ embedded = false }: { embedded?: boolean }) {
  const { me } = useMeta()
  const toast = useToast()
  const isLeadership = canAccessCrmVault(me)

  const [query, setQuery] = useState('')
  const [scopes, setScopes] = useState<SearchScope[]>(['internal', 'website', 'market'])
  const [synthesize, setSynthesize] = useState(true)
  const [confidential, setConfidential] = useState(false)
  const [activeFilter, setActiveFilter] = useState<'all' | SearchScope>('all')

  const [busy, setBusy] = useState(false)
  const [data, setData] = useState<UnifiedSearchResponse | null>(null)
  const [copiedId, setCopiedId] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [shareMsg, setShareMsg] = useState('')

  const allSelected = scopes.length === SCOPE_META.length

  const toggleAllScopes = () => {
    setScopes(allSelected ? ['internal', 'website', 'market'] : SCOPE_META.map(s => s.key))
  }

  const toggleScope = (key: SearchScope) => {
    setScopes(prev => {
      if (prev.includes(key)) {
        return prev.length > 1 ? prev.filter(x => x !== key) : prev
      }
      return [...prev, key]
    })
  }

  const runSearch = async (overrideQ?: string) => {
    const q = (overrideQ ?? query).trim()
    if (!q) {
      toast.error('Enter a search query')
      return
    }
    if (overrideQ !== undefined) setQuery(overrideQ)
    setBusy(true)
    setActiveFilter('all')
    try {
      const res = await post<UnifiedSearchResponse>('/api/search/unified', {
        q,
        scopes,
        synthesize,
        confidential: isLeadership ? confidential : false,
        limit: 25,
      })
      setData(res)
    } catch (e: any) {
      toast.error(e?.message || 'Search failed')
    } finally {
      setBusy(false)
    }
  }

  const copyListingLink = async (hit: UnifiedSearchHit) => {
    const rawUrl = String((hit.meta?.public_url as string) || hit.url || hit.link || '')
    if (!rawUrl) return
    const full = rawUrl.startsWith('/') ? `${window.location.origin}${rawUrl}` : rawUrl
    try {
      await navigator.clipboard.writeText(full)
      setCopiedId(hit.id)
      toast.ok('Listing link copied')
      setTimeout(() => setCopiedId(''), 1800)
    } catch {
      toast.error('Could not copy link')
    }
  }

  const shareListingToInside = (hit: UnifiedSearchHit) => {
    const rawUrl = String((hit.meta?.public_url as string) || hit.url || hit.link || '')
    const full = rawUrl.startsWith('/') ? `${window.location.origin}${rawUrl}` : rawUrl
    setShareMsg(
      [
        `🏢 *${hit.title}*`,
        hit.subtitle ? hit.subtitle : '',
        full ? `🔗 ${full}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    setShareOpen(true)
  }

  const visibleHits = data
    ? activeFilter === 'all'
      ? data.results
      : data.by_scope[activeFilter] ?? []
    : []

  return (
    <div className="mx-auto max-w-[1440px] grid gap-4">
      {!embedded && (
        <ModuleHeader
          eyebrow="HYBRID SEARCH · RBAC SCOPED · AI CITATIONS"
          title="SWK Unified Search"
          subtitle="Search across your role-scoped SWK Internal records, live SWKPROPERTY.COM listings, 24 Dubai communities & developers, and Live Web with optional AI brief synthesis."
          icon={<Search size={24} />}
        />
      )}

      {/* Search Bar & Scope Controls */}
      <form
        onSubmit={e => { e.preventDefault(); void runSearch() }}
        className="rounded-2xl border border-line bg-card p-4 grid gap-3"
      >
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[260px]">
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              className="input"
              style={{ paddingLeft: 40, minHeight: 44, fontSize: 15 }}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search listings, Dubai communities, Inside chats, Word docs, DLD market or live web…"
              aria-label="Unified search query"
            />
          </div>
          <button type="submit" className="btn green" style={{ minHeight: 44 }} disabled={busy || !query.trim()}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {busy ? 'Searching…' : 'Search'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="studio-chip"
            aria-pressed={allSelected}
            onClick={toggleAllScopes}
          >
            All Scopes
          </button>
          {SCOPE_META.map(s => {
            const active = scopes.includes(s.key)
            return (
              <button
                key={s.key}
                type="button"
                className="studio-chip inline-flex items-center gap-1.5"
                aria-pressed={active}
                onClick={() => toggleScope(s.key)}
              >
                <s.icon size={13} />
                {s.label}
              </button>
            )
          })}

          <span className="h-5 w-px bg-line mx-1 hidden sm:inline-block" />

          <label className="swk-toggle text-xs">
            <input type="checkbox" checked={synthesize} onChange={e => setSynthesize(e.target.checked)} />
            <span className="inline-flex items-center gap-1 font-medium">
              <Sparkles size={13} className="text-[#0e9f6e]" /> Synthesize AI Brief
            </span>
          </label>

          {isLeadership && (
            <label
              className="swk-toggle text-xs"
              title="Leadership only: include internal hits in zero-retention AI synthesis"
            >
              <input type="checkbox" checked={confidential} onChange={e => setConfidential(e.target.checked)} />
              <span className="inline-flex items-center gap-1 font-medium">
                <Lock size={13} className="text-[#0e9f6e]" /> Confidential Mode
              </span>
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">Try:</span>
          {SAMPLE_QUERIES.map(sq => (
            <button
              key={sq}
              type="button"
              onClick={() => void runSearch(sq)}
              className="rounded-lg border border-line bg-soft px-2.5 py-1 text-xs text-ink hover:bg-hover cursor-pointer"
            >
              {sq}
            </button>
          ))}
        </div>
      </form>

      {/* Warnings */}
      {data?.warnings?.length ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          {data.warnings.join(' · ')}
        </div>
      ) : null}

      {/* AI Synthesized Brief */}
      {data?.synthesis && (
        <section className="rounded-2xl border border-[#0e9f6e]/35 bg-card p-5 grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={17} className="text-[#0e9f6e]" />
              <b className="text-[15px] text-ink">AI Synthesized Brief</b>
              {data.synthesis.zero_retention && (
                <Pill tone="oasis"><ShieldCheck size={11} className="inline mr-1" />Zero-Retention</Pill>
              )}
              {data.synthesis.pii_redacted > 0 && (
                <Pill tone="navy">{data.synthesis.pii_redacted} PII shielded</Pill>
              )}
            </div>
            <span className="text-xs text-muted">
              {data.synthesis.model} · {data.synthesis.provider}
            </span>
          </div>

          <div className="text-[14px] leading-relaxed text-ink whitespace-pre-wrap">
            {renderAnswerWithCitations(data.synthesis.answer, data.synthesis.citations)}
          </div>

          {data.synthesis.citations.length > 0 && (
            <div className="grid gap-1.5 pt-2 border-t border-line sm:grid-cols-2 lg:grid-cols-3">
              {data.synthesis.citations.map(c => {
                const safe = isSafeHref(c.url)
                return (
                  <div key={c.index} className="rounded-xl border border-line bg-soft p-2.5 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-ink">
                      <span className="rounded bg-[#121212] px-1.5 py-0.5 text-[10.5px] text-[#51fec0]">[{c.index}]</span>
                      <span className="truncate">{c.title}</span>
                    </div>
                    {c.snippet && <div className="mt-1 text-muted line-clamp-2">{c.snippet}</div>}
                    {safe && (
                      c.url!.startsWith('/') ? (
                        <Link to={c.url!} className="mt-1 inline-flex items-center gap-1 text-[#0e9f6e] font-medium">
                          Open record <ExternalLink size={11} />
                        </Link>
                      ) : (
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[#0e9f6e] font-medium">
                          Source <ExternalLink size={11} />
                        </a>
                      )
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Results Filter & Cards */}
      {data && (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className="studio-chip"
                aria-pressed={activeFilter === 'all'}
                onClick={() => setActiveFilter('all')}
              >
                All ({data.total})
              </button>
              {SCOPE_META.filter(s => data.scopes.includes(s.key)).map(s => (
                <button
                  key={s.key}
                  type="button"
                  className="studio-chip"
                  aria-pressed={activeFilter === s.key}
                  onClick={() => setActiveFilter(s.key)}
                >
                  {s.label} ({data.counts[s.key] ?? 0})
                </button>
              ))}
            </div>
            <span className="text-xs text-muted">Access tier: {data.role_tier}</span>
          </div>

          {!visibleHits.length ? (
            <div className="rounded-2xl border border-line bg-card p-8 text-center text-sm text-muted">
              No matching records found for “{data.q}” in this scope.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {visibleHits.map(hit => {
                const meta = SCOPE_META.find(s => s.key === hit.scope)
                const href = hit.link || hit.url
                const safe = isSafeHref(href)
                const isWebsiteListing = hit.scope === 'website'
                return (
                  <article key={hit.id} className="rounded-2xl border border-line bg-card p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Pill tone={meta?.pillTone ?? 'navy'}>{meta?.label ?? hit.scope}</Pill>
                        <span className="text-[11px] font-mono text-muted">{hit.entity}</span>
                      </div>
                      {safe && (
                        href!.startsWith('/') ? (
                          <Link to={href!} className="text-xs font-semibold text-[#0e9f6e] inline-flex items-center gap-1">
                            Open <ExternalLink size={12} />
                          </Link>
                        ) : (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[#0e9f6e] inline-flex items-center gap-1">
                            Visit <ExternalLink size={12} />
                          </a>
                        )
                      )}
                    </div>

                    <h3 className="m-0 text-[15px] font-semibold text-ink">{hit.title}</h3>
                    {hit.subtitle && <div className="text-[12.5px] font-medium text-[#0e9f6e]">{hit.subtitle}</div>}
                    {hit.snippet && <p className="m-0 text-[12.5px] text-muted line-clamp-3">{hit.snippet}</p>}

                    {isWebsiteListing && (
                      <div className="mt-auto pt-2 border-t border-line flex flex-wrap items-center gap-2">
                        <button type="button" className="btn outline sm" onClick={() => void copyListingLink(hit)}>
                          {copiedId === hit.id ? <Check size={13} /> : <Copy size={13} />}
                          {copiedId === hit.id ? 'Copied' : 'Copy Link'}
                        </button>
                        <button type="button" className="btn green sm" onClick={() => shareListingToInside(hit)}>
                          <MessagesSquare size={13} /> Share to Inside
                        </button>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      )}

      <ShareToInsideModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Share Listing to Inside"
        initialMessage={shareMsg}
      />
    </div>
  )
}
