import { inDemo } from '../db'
import type { SessionUser } from '../engine'
import type { OmniLane } from './omni-catalog'
import { loadLegacyEndpoints, omniChat, omniConfigured, type OmniMessage, type ToolDef as OmniToolDef } from './omni-router'

export interface Preset {
  key: string
  label: string
  base: string
  model: string
  keyRequired: boolean
  free: string
  notes: string
}

export const PRESETS: Preset[] = [
  { key: 'groq', label: 'Groq (free tier)', base: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', keyRequired: true, free: 'Free tier with rate limits', notes: 'Create a key at console.groq.com.' },
  { key: 'openrouter', label: 'OpenRouter (free)', base: 'https://openrouter.ai/api/v1', model: 'openrouter/free', keyRequired: true, free: 'Free router with usage limits', notes: 'Create a key at openrouter.ai/keys.' },
  { key: 'opencode', label: 'OpenCode Zen', base: 'https://opencode.ai/zen/v1', model: '', keyRequired: true, free: 'Free tier', notes: 'OpenCode Zen dashboard.' },
  { key: 'xai', label: 'xAI Grok', base: 'https://api.x.ai/v1', model: 'grok-3-mini', keyRequired: true, free: 'Paid / promotional credits', notes: 'console.x.ai' },
  { key: 'gemini', label: 'Google Gemini (free tier)', base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', keyRequired: true, free: 'Free tier with limits', notes: 'aistudio.google.com/apikey' },
  { key: 'cloudflare', label: 'Cloudflare Workers AI', base: 'https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', keyRequired: true, free: 'Daily free allowance', notes: 'Replace ACCOUNT_ID in the base URL; the key is a Workers AI API token.' },
  { key: 'openai', label: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini', keyRequired: true, free: 'Paid', notes: '' },
  { key: 'custom', label: 'Custom OpenAI-compatible', base: '', model: '', keyRequired: false, free: '', notes: 'Any server exposing /chat/completions.' },
]

export interface Endpoint {
  base: string
  key: string
  model: string
  label: string
}

export function endpoints(modelOverride?: string): Endpoint[] {
  return loadLegacyEndpoints(modelOverride).map(({ base, key, model, label }) => ({ base, key, model, label }))
}

export const aiConfigured = () => omniConfigured()

export type ChatMsg = OmniMessage
export type ToolDef = OmniToolDef
export interface ChatResult {
  content: string
  tool_calls: { id: string; name: string; args: any }[]
  tokens: number
  model: string
}

/** Demo workspace only: a scripted assistant that really calls the read tools and writes a briefing from their output. */
function demoChat(messages: ChatMsg[], tools?: ToolDef[]): ChatResult {
  const lastUser = [...messages].map((m, i) => ({ m, i })).filter(x => x.m.role === 'user').pop()?.i ?? 0
  const results = messages.slice(lastUser).filter(m => m.role === 'tool')
  const ask = String(messages[lastUser]?.content ?? '').toLowerCase()
  if (!results.length && tools?.length) {
    const want = ['business_snapshot', 'overdue_invoices', 'stalled_jobs', 'open_tickets', 'list_leads'].filter(n => tools.some(t => t.name === n))
    if (want.length) return { content: '', tokens: 0, model: 'demo-assistant', tool_calls: want.map((n, i) => ({ id: 'demo' + i, name: n, args: {} })) }
  }
  const get = (n: string) => {
    const m = results.find(r => r.name === n)
    try { return JSON.parse(typeof m?.content === 'string' ? m.content : 'null') } catch { return null }
  }
  const snap = get('business_snapshot'), od = get('overdue_invoices') ?? [], st = get('stalled_jobs') ?? {}, tk = get('open_tickets') ?? [], ld = get('list_leads') ?? []
  const lines = [`Here is where things stand (live data from this demo workspace).`]
  if (snap) lines.push(`• ${snap.open_jobs} open deals, revenue this month AED ${Math.round(snap.revenue_month_aed).toLocaleString('en-US')}, commission to bill AED ${Math.round(snap.unbilled_revenue_aed).toLocaleString('en-US')}.`, `• Receivables AED ${Math.round(snap.ar_outstanding_aed).toLocaleString('en-US')}, of which AED ${Math.round(snap.ar_overdue_aed).toLocaleString('en-US')} is overdue. Cash and bank AED ${Math.round(snap.cash_aed).toLocaleString('en-US')}.`)
  if (od.length) lines.push(`• Chase first: ${od.slice(0, 3).map((o: any) => `${o.customer} (${o.invoice_no}, ${o.days_overdue} days, ${o.balance.toLocaleString('en-US')})`).join('; ')}.`)
  const late = (st.no_update_5d ?? []).length
  if (late) lines.push(`• ${late} stalled deals need attention: ${[(st.no_update_5d ?? []).map((j: any) => j.job_no)].flat().slice(0, 3).join(', ')}.`)
  if (tk.length) lines.push(`• ${tk.length} open tickets, oldest: “${tk[tk.length - 1].subject}”.`)
  if (ld.length) lines.push(`• ${ld.length} recent leads; newest is ${ld[0].company}.`)
  lines.push(`Suggested next actions: call the largest overdue customer today, book the pending viewings, and follow up the newest lead.`, `(Demo mode: this assistant is scripted. In your production workspace Jarvis uses the AI model you connect under Integrations.)`)
  void ask
  return { content: lines.join('\n'), tool_calls: [], tokens: 0, model: 'demo-assistant' }
}

export async function chat(
  messages: ChatMsg[],
  tools?: ToolDef[],
  modelOverride?: string,
  opts: {
    maxTokens?: number
    temperature?: number
    lane?: OmniLane
    confidential?: boolean
    zeroRetentionOnly?: boolean
    user?: SessionUser | null
    bypassQuota?: boolean
  } = {},
): Promise<ChatResult> {
  if (inDemo()) return demoChat(messages, tools)
  const r = await omniChat({
    messages,
    tools,
    modelOverride,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
    lane: opts.lane ?? 'general',
    confidential: opts.confidential,
    zeroRetentionOnly: opts.zeroRetentionOnly,
    user: opts.user,
    bypassQuota: opts.bypassQuota ?? !opts.user,
    includeLegacyFallback: true,
  })
  return {
    content: r.content,
    tool_calls: r.tool_calls,
    tokens: r.tokens,
    model: r.model,
  }
}

export async function testLlm(): Promise<{ ok: boolean; error?: string; model?: string; reply?: string }> {
  if (inDemo()) return { ok: false, error: 'The demo assistant is scripted. Sign into your real workspace to test an external AI connection.' }
  try {
    const r = await chat([{ role: 'user', content: 'Reply with the single word: ready' }])
    return { ok: true, model: r.model, reply: r.content.slice(0, 40) }
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) }
  }
}
