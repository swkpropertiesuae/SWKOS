import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Bot,
  Check,
  Circle,
  CircleCheck,
  Copy,
  Database,
  Eye,
  FileText,
  Globe,
  Image as ImageIcon,
  Languages,
  Loader2,
  Lock,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Pencil,
  PhoneCall,
  PhoneForwarded,
  Pin,
  PinOff,
  Play,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  X as XIcon,
  Zap,
  Brain,
} from 'lucide-react'
import { canAccessCrmVault, canOpenEmployeeRecords } from '@shared/swk-staff-access'
import { api, del, get, post, put } from '../lib/api'
import { cls, fmtIsoStamp } from '../lib/format'
import { useMeta } from '../lib/meta'
import { useToast } from '../lib/toast'
import { Badge, Empty, ErrorBox, Loading, Modal, PageHeader, Tabs, useDialogs } from '../ui/kit'
import { OmniRouteAdminPanel, type OmniLane } from './swk/OmniRouteAdminPanel'

interface Agent {
  id: number
  name: string
  title: string
  avatar: string
  active: boolean
  schedule: string
  run_hour: number
  autonomy: string
  deliver_to: string
  last_run_at: string | null
  last_status: string | null
  role_key: string | null
  instructions: string
  tools: string
}

interface LegacyStatus {
  configured: boolean
  pending: number
  agents: Agent[]
  templates: { key: string; name: string; title: string; avatar: string; blurb: string }[]
  tools: { name: string; risk: string; description: string }[]
}

interface OmniStatus {
  configured: boolean
  demo: boolean
  lanes: OmniLane[]
  allow_nonvault_vision_free: boolean
  can_use_confidential: boolean
  quota: {
    unlimited: boolean
    daily_limit: number | null
    rpm_limit: number | null
    used_today: number
    tokens_today: number
    remaining_today: number | null
  }
  allowed_tools: { name: string; risk: string; description: string }[]
}

interface OmniConversation {
  id: number
  user_id: number
  title: string
  mode: OmniLane
  pinned: boolean
  created_at: string
  updated_at: string
}

interface OmniAttachmentMeta {
  name: string
  mime: string
  size: number
  method: string
}

interface OmniMessageItem {
  id: number | string
  role: 'user' | 'assistant'
  content: string
  model_used?: string | null
  provider_used?: string | null
  route_label?: string | null
  zero_retention?: boolean
  tokens?: number
  pii_redacted?: number
  lane?: OmniLane
  attachments?: OmniAttachmentMeta[]
  created_at?: string
  streaming?: boolean
}

const MODE_OPTIONS: {
  key: OmniLane
  label: string
  short: string
  hint: string
  Icon: typeof Sparkles
}[] = [
  { key: 'general', label: 'Auto / General', short: 'Auto', hint: 'Balanced routing across active pool', Icon: Sparkles },
  { key: 'reasoning', label: 'Deep Reasoning', short: 'Reasoning', hint: 'Step-by-step analysis & DLD/RERA checks', Icon: Brain },
  { key: 'fast', label: 'Fast', short: 'Fast', hint: 'Low-latency quick drafts & Q&A', Icon: Zap },
  { key: 'translate', label: 'Translate', short: 'Translate', hint: 'EN / AR UAE real-estate terminology', Icon: Languages },
  { key: 'search', label: 'Search-Grounded', short: 'Search', hint: 'Structured research & market synthesis', Icon: Globe },
]

const BRAIN_SUGGESTIONS = [
  'Draft a bilingual EN/AR viewing confirmation for Dubai Creek Harbour',
  'Summarise RERA Form A, Form B, and Form F requirements for a secondary sale',
  'Calculate DLD 4% transfer fee and net yield on an AED 2.4M apartment renting at AED 165k/yr',
  'Rewrite this owner follow-up message to be concise and professional',
]

const LEGACY_SUGGESTIONS = [
  'Give me today’s briefing',
  'Who owes us money and for how long?',
  'Which jobs are at risk of delay?',
  'Any revenue we have not invoiced yet?',
  'Summarise our open leads',
  'What needs my approval or attention today?',
]

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|tiff?|bmp)$/i
const MAX_FILES = 5
const MAX_FILE_BYTES = 20 * 1024 * 1024

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isSafeHref(url: string): boolean {
  const trimmed = url.trim()
  if (trimmed.startsWith('/')) return !trimmed.startsWith('//')
  try {
    const u = new URL(trimmed)
    return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:'
  } catch {
    return false
  }
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const tokenRe = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g
  let last = 0
  let match: RegExpExecArray | null
  let k = 0

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > last) {
      out.push(<Fragment key={`t-${k++}`}>{text.slice(last, match.index)}</Fragment>)
    }
    const tok = match[0]
    if (tok.startsWith('**') && tok.endsWith('**')) {
      out.push(<strong key={`b-${k++}`}>{tok.slice(2, -2)}</strong>)
    } else if (tok.startsWith('*') && tok.endsWith('*')) {
      out.push(<em key={`i-${k++}`}>{tok.slice(1, -1)}</em>)
    } else if (tok.startsWith('`') && tok.endsWith('`')) {
      out.push(
        <code
          key={`c-${k++}`}
          className="px-1.5 py-0.5 rounded bg-soft border border-line font-mono text-[12.5px] text-ink"
        >
          {tok.slice(1, -1)}
        </code>,
      )
    } else if (tok.startsWith('[')) {
      const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)
      if (m && isSafeHref(m[2]!)) {
        const href = m[2]!.trim()
        out.push(
          <a
            key={`a-${k++}`}
            href={href}
            target={href.startsWith('/') ? undefined : '_blank'}
            rel={href.startsWith('/') ? undefined : 'noopener noreferrer'}
            className="underline text-[#0e9f6e] font-medium"
          >
            {m[1]}
          </a>,
        )
      } else {
        out.push(<Fragment key={`raw-${k++}`}>{tok}</Fragment>)
      }
    }
    last = match.index + tok.length
  }
  if (last < text.length) out.push(<Fragment key={`end-${k++}`}>{text.slice(last)}</Fragment>)
  return out
}

function SafeMarkdown({ text }: { text: string }) {
  const toast = useToast()
  if (!text) return null

  // Split by fenced code blocks first
  const segments = text.split(/(```[^\r\n]*\r?\n[\s\S]*?```)/g)

  return (
    <div className="grid gap-2 text-[14.5px] leading-relaxed break-words">
      {segments.map((seg, segIdx) => {
        if (seg.startsWith('```') && seg.endsWith('```')) {
          const firstNl = seg.indexOf('\n')
          const lang = firstNl > 3 ? seg.slice(3, firstNl).replace(/\r$/, '').trim() : ''
          const code = firstNl >= 0 ? seg.slice(firstNl + 1, -3) : seg.slice(3, -3)
          return (
            <div
              key={segIdx}
              className="rounded-xl overflow-hidden border border-[#2b2b2b] bg-[#121212] text-[#f5f5f5]"
            >
              <div className="flex items-center justify-between px-3 py-1.5 text-[11px] uppercase tracking-wider text-[#a7a7a7] border-b border-[#2b2b2b]">
                <span>{lang || 'code'}</span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(code)
                    toast.ok('Copied code block')
                  }}
                  className="inline-flex items-center gap-1 bg-transparent border-0 text-[#51fec0] cursor-pointer text-[11px] font-semibold p-0"
                >
                  <Copy size={11} /> Copy
                </button>
              </div>
              <pre className="m-0 p-3 overflow-x-auto text-[12.5px] font-mono leading-relaxed">{code}</pre>
            </div>
          )
        }

        const lines = seg.split('\n')
        const blocks: ReactNode[] = []
        let i = 0
        let bk = 0

        while (i < lines.length) {
          const line = lines[i]!
          if (!line.trim()) {
            i++
            continue
          }
          if (/^---+$/.test(line.trim())) {
            blocks.push(<hr key={bk++} className="border-0 border-t border-line my-1" />)
            i++
            continue
          }
          const hMatch = /^(#{1,4})\s+(.+)$/.exec(line)
          if (hMatch) {
            const lvl = hMatch[1]!.length
            const clsName =
              lvl === 1
                ? 'text-[17px] font-display font-extrabold text-ink m-0 mt-1'
                : lvl === 2
                  ? 'text-[15.5px] font-display font-bold text-ink m-0 mt-1'
                  : 'text-[14.5px] font-display font-bold text-ink m-0 mt-0.5'
            blocks.push(
              <div key={bk++} className={clsName}>
                {renderInlineMarkdown(hMatch[2]!)}
              </div>,
            )
            i++
            continue
          }
          if (line.startsWith('> ')) {
            const qLines: string[] = []
            while (i < lines.length && lines[i]!.startsWith('> ')) {
              qLines.push(lines[i]!.slice(2))
              i++
            }
            blocks.push(
              <blockquote
                key={bk++}
                className="m-0 pl-3 border-l-3 border-[#0e9f6e] text-body bg-soft/60 py-1.5 pr-2 rounded-r-lg"
              >
                {renderInlineMarkdown(qLines.join(' '))}
              </blockquote>,
            )
            continue
          }
          if (/^[-*]\s+/.test(line)) {
            const items: string[] = []
            while (i < lines.length && /^[-*]\s+/.test(lines[i]!)) {
              items.push(lines[i]!.replace(/^[-*]\s+/, ''))
              i++
            }
            blocks.push(
              <ul key={bk++} className="m-0 pl-5 grid gap-1 list-disc">
                {items.map((it, idx) => (
                  <li key={idx}>{renderInlineMarkdown(it)}</li>
                ))}
              </ul>,
            )
            continue
          }
          if (/^\d+\.\s+/.test(line)) {
            const items: string[] = []
            while (i < lines.length && /^\d+\.\s+/.test(lines[i]!)) {
              items.push(lines[i]!.replace(/^\d+\.\s+/, ''))
              i++
            }
            blocks.push(
              <ol key={bk++} className="m-0 pl-5 grid gap-1 list-decimal">
                {items.map((it, idx) => (
                  <li key={idx}>{renderInlineMarkdown(it)}</li>
                ))}
              </ol>,
            )
            continue
          }
          const para: string[] = []
          while (
            i < lines.length &&
            lines[i]!.trim() &&
            !/^(#{1,4}\s+|[-*]\s+|\d+\.\s+|>\s+|---+$)/.test(lines[i]!)
          ) {
            para.push(lines[i]!)
            i++
          }
          blocks.push(
            <p key={bk++} className="m-0 whitespace-pre-wrap">
              {renderInlineMarkdown(para.join('\n'))}
            </p>,
          )
        }

        return <Fragment key={segIdx}>{blocks}</Fragment>
      })}
    </div>
  )
}

export function AiPage() {
  const { me } = useMeta()
  const [sp, setSp] = useSearchParams()
  const isLeadership = canAccessCrmVault(me)
  const isOmniAdmin = canOpenEmployeeRecords(me)

  const rawTab = sp.get('tab') ?? 'brain'
  const normalizedRaw =
    rawTab === 'chat' || rawTab === 'team' ? 'agents' : rawTab

  const allowedTabs = useMemo(() => {
    const list: { key: string; label: string; count?: number }[] = [
      { key: 'brain', label: 'AI Brain' },
    ]
    if (isLeadership) {
      list.push(
        { key: 'agents', label: 'AI Agents' },
        { key: 'brief', label: 'Brief' },
        { key: 'approvals', label: 'Approvals' },
        { key: 'voice', label: 'Voice' },
        { key: 'activity', label: 'Activity' },
      )
    }
    if (isOmniAdmin) {
      list.push({ key: 'omni-route', label: 'Omni-Route Pool & Health' })
    }
    return list
  }, [isLeadership, isOmniAdmin])

  const tab = allowedTabs.some(t => t.key === normalizedRaw) ? normalizedRaw : 'brain'

  // Legacy AI status is strictly Leadership-only (never fired for standard/restricted staff -> zero 403s)
  const legacyQ = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => get<LegacyStatus>('/api/ai/status'),
    enabled: isLeadership,
    refetchInterval: 20000,
  })

  const tabsWithCounts = useMemo(
    () =>
      allowedTabs.map(t => {
        if (t.key === 'agents' && legacyQ.data) return { ...t, count: legacyQ.data.agents.length }
        if (t.key === 'approvals' && legacyQ.data?.pending) return { ...t, count: legacyQ.data.pending }
        return t
      }),
    [allowedTabs, legacyQ.data],
  )

  return (
    <div className="fade-in">
      <PageHeader
        icon={<Bot size={20} />}
        title="SWK AI Brain & Digital Workforce"
        subtitle={
          isLeadership
            ? 'Private streaming AI Brain with PII Shield, executive briefings, autonomous AI employees, and Omni-Route failover.'
            : 'Your private SWK AI Brain workbench with smart mode routing, document/image understanding, and automatic PII Shield.'
        }
        actions={
          isOmniAdmin ? (
            <Link className="btn outline" to="/admin/integrations">
              <Settings2 size={15} /> Omni-Route &amp; Integrations
            </Link>
          ) : undefined
        }
      />

      <div className="card overflow-hidden">
        <Tabs
          tabs={tabsWithCounts}
          value={tab}
          onChange={k => setSp(k === 'brain' ? {} : { tab: k })}
        />
        <div className="p-3 sm:p-4 md:p-5">
          {tab === 'brain' && <AiBrainWorkbench isLeadership={isLeadership} isOmniAdmin={isOmniAdmin} />}

          {tab === 'agents' && isLeadership && (
            legacyQ.error ? (
              <ErrorBox error={legacyQ.error} onRetry={() => void legacyQ.refetch()} />
            ) : !legacyQ.data ? (
              <Loading />
            ) : (
              <div className="grid gap-6">
                {!legacyQ.data.configured && (
                  <div className="p-4 rounded-xl border border-line bg-soft text-[14px]">
                    <b>Legacy AI connection not set.</b>{' '}
                    {isOmniAdmin ? (
                      <>
                        Configure it in{' '}
                        <Link to="/admin/integrations" className="underline">
                          Integrations → AI employees
                        </Link>
                        .
                      </>
                    ) : (
                      'Ask an Owner or Admin to configure AI settings.'
                    )}
                  </div>
                )}
                <LegacyChat status={legacyQ.data} />
                <div className="border-t border-line pt-5">
                  <Team status={legacyQ.data} reload={() => void legacyQ.refetch()} />
                </div>
              </div>
            )
          )}

          {tab === 'brief' && isLeadership && <ExecutiveBrief />}

          {tab === 'approvals' && isLeadership && (
            <Approvals reload={() => void legacyQ.refetch()} />
          )}

          {tab === 'voice' && isLeadership && (
            <Voice reload={() => void legacyQ.refetch()} />
          )}

          {tab === 'activity' && isLeadership && <Activity />}

          {tab === 'omni-route' && isOmniAdmin && <OmniRouteAdminPanel />}
        </div>
      </div>
    </div>
  )
}

function AiBrainWorkbench({
  isLeadership,
  isOmniAdmin,
}: {
  isLeadership: boolean
  isOmniAdmin: boolean
}) {
  const toast = useToast()
  const dlg = useDialogs()
  const qc = useQueryClient()

  const statusQ = useQuery({
    queryKey: ['omni-ai-status'],
    queryFn: () => get<OmniStatus>('/api/omni-ai/status'),
    refetchInterval: 30000,
  })

  const convsQ = useQuery({
    queryKey: ['omni-ai-conversations'],
    queryFn: () => get<{ conversations: OmniConversation[] }>('/api/omni-ai/conversations'),
  })

  const [activeConvId, setActiveConvId] = useState<number | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [convSearch, setConvSearch] = useState('')
  const [editingTitleId, setEditingTitleId] = useState<number | null>(null)
  const [editingTitleText, setEditingTitleText] = useState('')

  const [mode, setMode] = useState<OmniLane>('general')
  const [confidential, setConfidential] = useState(false)
  const [useTools, setUseTools] = useState(false)
  const [useVision, setUseVision] = useState(true)

  const [messages, setMessages] = useState<OmniMessageItem[]>([])
  const [composerText, setComposerText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [streaming, setStreaming] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const streamingRef = useRef(false)
  const skipNextFetchSyncRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollEndRef = useRef<HTMLDivElement>(null)

  const msgsQ = useQuery({
    queryKey: ['omni-ai-messages', activeConvId],
    queryFn: () =>
      get<{ conversation: OmniConversation; messages: OmniMessageItem[] }>(
        `/api/omni-ai/conversations/${activeConvId}/messages`,
      ),
    enabled: activeConvId !== null && !streaming,
  })

  useEffect(() => {
    if (streamingRef.current) return
    if (skipNextFetchSyncRef.current) {
      skipNextFetchSyncRef.current = false
      return
    }
    if (activeConvId === null) {
      setMessages([])
      return
    }
    if (msgsQ.data?.messages) {
      setMessages(msgsQ.data.messages)
    }
  }, [activeConvId, msgsQ.data])

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, streaming])

  const status = statusQ.data
  const conversations = convsQ.data?.conversations ?? []
  const filteredConvs = useMemo(() => {
    const q = convSearch.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter(c => c.title.toLowerCase().includes(q))
  }, [conversations, convSearch])

  const hasImageFiles = files.some(
    f => f.type.startsWith('image/') || IMAGE_EXT_RE.test(f.name),
  )
  const hasReadTools = Boolean(status?.allowed_tools?.some(t => t.risk === 'read'))

  const handleFilesSelected = (picked: FileList | null) => {
    if (!picked?.length) return
    const next = [...files]
    for (const f of Array.from(picked)) {
      if (next.length >= MAX_FILES) {
        toast.error(`Maximum ${MAX_FILES} attachments per message`)
        break
      }
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`"${f.name}" exceeds the 20 MB limit`)
        continue
      }
      next.push(f)
    }
    setFiles(next)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const startNewChat = () => {
    if (streaming) return
    setActiveConvId(null)
    setMessages([])
    setFiles([])
  }

  const selectConversation = (conv: OmniConversation) => {
    if (streaming) return
    skipNextFetchSyncRef.current = false
    setActiveConvId(conv.id)
    if (conv.mode && MODE_OPTIONS.some(m => m.key === conv.mode)) {
      setMode(conv.mode)
    }
  }

  const togglePin = async (conv: OmniConversation) => {
    try {
      await api('PATCH', `/api/omni-ai/conversations/${conv.id}`, { pinned: !conv.pinned })
      await qc.invalidateQueries({ queryKey: ['omni-ai-conversations'] })
    } catch (e: any) {
      toast.error(e.message || 'Could not update pin')
    }
  }

  const saveRename = async (convId: number) => {
    const clean = editingTitleText.trim()
    setEditingTitleId(null)
    if (!clean) return
    try {
      await api('PATCH', `/api/omni-ai/conversations/${convId}`, { title: clean })
      await qc.invalidateQueries({ queryKey: ['omni-ai-conversations'] })
    } catch (e: any) {
      toast.error(e.message || 'Could not rename conversation')
    }
  }

  const deleteConversation = async (conv: OmniConversation) => {
    const ok = await dlg.confirm({
      title: `Delete "${conv.title}"?`,
      message: 'This permanently removes your private conversation history.',
      danger: true,
      ok: 'Delete',
    })
    if (!ok) return
    try {
      await del(`/api/omni-ai/conversations/${conv.id}`)
      if (activeConvId === conv.id) {
        setActiveConvId(null)
        setMessages([])
      }
      await qc.invalidateQueries({ queryKey: ['omni-ai-conversations'] })
      toast.ok('Conversation deleted')
    } catch (e: any) {
      toast.error(e.message || 'Could not delete conversation')
    }
  }

  const stopStream = () => {
    abortRef.current?.abort()
  }

  const sendMessage = async (overrideText?: string) => {
    const promptText = (overrideText ?? composerText).trim()
    if ((!promptText && !files.length) || streaming) return
    if (!status?.configured) {
      toast.error('AI Brain is not configured yet. Ask an Owner or Admin to add an Omni-Route provider.')
      return
    }

    const attached = [...files]
    const effectiveConfidential = isLeadership && Boolean(status.can_use_confidential) && confidential
    const attachMeta: OmniAttachmentMeta[] = attached.map(f => ({
      name: f.name,
      mime: f.type || 'application/octet-stream',
      size: f.size,
      method: useVision && (f.type.startsWith('image/') || IMAGE_EXT_RE.test(f.name)) ? 'vision' : 'extract',
    }))

    const userBubble: OmniMessageItem = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: promptText || `[Attachments: ${attached.map(f => f.name).join(', ')}]`,
      attachments: attachMeta,
    }
    const assistantId = `a-${Date.now()}`
    const assistantBubble: OmniMessageItem = {
      id: assistantId,
      role: 'assistant',
      content: '',
      streaming: true,
    }

    setMessages(prev => [...prev, userBubble, assistantBubble])
    if (!overrideText) setComposerText('')
    setFiles([])
    setStreaming(true)
    streamingRef.current = true

    const ctl = new AbortController()
    abortRef.current = ctl

    try {
      let body: BodyInit
      const headers: Record<string, string> = { 'x-swk-client': 'web' }
      if (attached.length > 0) {
        const fd = new FormData()
        fd.append('message', promptText)
        fd.append('mode', mode)
        fd.append('confidential', String(effectiveConfidential))
        fd.append('use_vision', String(useVision))
        fd.append('use_tools', String(useTools))
        if (activeConvId) fd.append('conversation_id', String(activeConvId))
        for (const f of attached) fd.append('file', f)
        body = fd
      } else {
        headers['content-type'] = 'application/json'
        body = JSON.stringify({
          message: promptText,
          conversation_id: activeConvId ?? undefined,
          mode,
          confidential: effectiveConfidential,
          use_tools: useTools,
        })
      }

      const res = await fetch('/api/omni-ai/chat/stream', {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body,
        signal: ctl.signal,
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody?.error || res.statusText || `HTTP ${res.status}`)
      }
      if (!res.body) throw new Error('Streaming response body unavailable')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let resolvedConvId = activeConvId

      const applyEvent = (evtName: string, dataRaw: string) => {
        if (!dataRaw) return
        let payload: any
        try {
          payload = JSON.parse(dataRaw)
        } catch {
          return
        }
        if (evtName === 'meta') {
          if (payload.conversation_id && payload.conversation_id !== resolvedConvId) {
            resolvedConvId = payload.conversation_id
            skipNextFetchSyncRef.current = true
            setActiveConvId(payload.conversation_id)
          }
        } else if (evtName === 'token') {
          const delta = String(payload.delta ?? '')
          if (!delta) return
          setMessages(prev =>
            prev.map(m => (m.id === assistantId ? { ...m, content: m.content + delta } : m)),
          )
        } else if (evtName === 'done') {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId
                ? {
                    ...m,
                    id: payload.message_id ?? m.id,
                    content: payload.content ?? m.content,
                    model_used: payload.model,
                    provider_used: payload.provider,
                    route_label: payload.route_label,
                    zero_retention: Boolean(payload.zero_retention),
                    pii_redacted: Number(payload.pii_redacted ?? 0),
                    tokens: Number(payload.tokens ?? 0),
                    lane: payload.lane,
                    streaming: false,
                  }
                : m,
            ),
          )
        } else if (evtName === 'error') {
          const msg = String(payload.error || 'AI Brain request failed')
          toast.error(msg)
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId
                ? {
                    ...m,
                    content: m.content ? `${m.content}\n\n⚠ ${msg}` : `⚠ ${msg}`,
                    streaming: false,
                  }
                : m,
            ),
          )
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split(/\r?\n\r?\n/)
        buffer = parts.pop() ?? ''
        for (const block of parts) {
          let evtName = 'message'
          const dataLines: string[] = []
          for (const line of block.split(/\r?\n/)) {
            if (line.startsWith('event:')) evtName = line.slice(6).trim()
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
          }
          if (dataLines.length) applyEvent(evtName, dataLines.join('\n'))
        }
      }
      if (buffer.trim()) {
        let evtName = 'message'
        const dataLines: string[] = []
        for (const line of buffer.split(/\r?\n/)) {
          if (line.startsWith('event:')) evtName = line.slice(6).trim()
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
        }
        if (dataLines.length) applyEvent(evtName, dataLines.join('\n'))
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setMessages(prev =>
          prev.map(m => (m.id === assistantId ? { ...m, streaming: false } : m)),
        )
      } else {
        const msg = String(err?.message ?? err ?? 'Request failed')
        toast.error(msg)
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: `⚠ ${msg}`, streaming: false }
              : m,
          ),
        )
      }
    } finally {
      abortRef.current = null
      streamingRef.current = false
      setStreaming(false)
      setMessages(prev => prev.map(m => (m.streaming ? { ...m, streaming: false } : m)))
      void qc.invalidateQueries({ queryKey: ['omni-ai-conversations'] })
      void qc.invalidateQueries({ queryKey: ['omni-ai-status'] })
    }
  }

  if (statusQ.error) return <ErrorBox error={statusQ.error} onRetry={() => void statusQ.refetch()} />
  if (!status) return <Loading label="Loading SWK AI Brain…" />

  return (
    <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)] items-stretch min-h-[600px]">
      {/* Left Private Conversation Sidebar */}
      {sidebarOpen && (
        <aside className="w-full lg:w-[272px] rounded-2xl border border-line bg-soft flex flex-col overflow-hidden max-h-[680px]">
          <div className="p-3 border-b border-line flex items-center gap-2">
            <button
              type="button"
              onClick={startNewChat}
              disabled={streaming}
              className="swk-btn swk-btn-primary flex-1 !h-9 text-[13px]"
            >
              <MessageSquarePlus size={15} /> New chat
            </button>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="btn ghost icon sm"
              title="Collapse sidebar"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>

          <div className="p-2.5 border-b border-line">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-muted pointer-events-none" />
              <input
                className="input !min-h-[34px] pl-8 text-[13px]"
                placeholder="Search private chats…"
                value={convSearch}
                onChange={e => setConvSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 grid gap-1 content-start">
            {convsQ.isLoading ? (
              <div className="p-3 text-xs text-muted">Loading chats…</div>
            ) : filteredConvs.length === 0 ? (
              <div className="p-4 text-center text-[12.5px] text-muted">
                {convSearch ? 'No matching chats.' : 'Your private AI Brain chats appear here.'}
              </div>
            ) : (
              filteredConvs.map(c => {
                const active = activeConvId === c.id
                const editing = editingTitleId === c.id
                return (
                  <div
                    key={c.id}
                    className={cls(
                      'group rounded-xl px-2.5 py-2 border transition-colors flex items-center gap-2',
                      active
                        ? 'bg-[#121212] text-white border-[#0e9f6e]/60'
                        : 'bg-card border-transparent hover:border-line hover:bg-hover text-ink',
                    )}
                  >
                    {editing ? (
                      <form
                        className="flex-1 flex items-center gap-1"
                        onSubmit={e => {
                          e.preventDefault()
                          void saveRename(c.id)
                        }}
                      >
                        <input
                          autoFocus
                          className="input !min-h-[28px] !py-0.5 text-[12.5px] text-ink"
                          value={editingTitleText}
                          onChange={e => setEditingTitleText(e.target.value)}
                          onBlur={() => void saveRename(c.id)}
                          onKeyDown={e => {
                            if (e.key === 'Escape') setEditingTitleId(null)
                          }}
                        />
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => selectConversation(c)}
                        className="flex-1 min-w-0 text-start bg-transparent border-0 p-0 cursor-pointer text-inherit"
                      >
                        <div className="flex items-center gap-1.5">
                          {c.pinned && (
                            <Pin
                              size={11}
                              className={active ? 'text-[#51fec0] shrink-0' : 'text-[#0e9f6e] shrink-0'}
                            />
                          )}
                          <span className="text-[13px] font-semibold truncate">{c.title}</span>
                        </div>
                        <div
                          className={cls(
                            'text-[11px] truncate mt-0.5',
                            active ? 'text-white/70' : 'text-muted',
                          )}
                        >
                          {c.mode} · {fmtIsoStamp(c.updated_at)}
                        </div>
                      </button>
                    )}

                    {!editing && (
                      <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100 shrink-0">
                        <button
                          type="button"
                          onClick={() => void togglePin(c)}
                          title={c.pinned ? 'Unpin' : 'Pin'}
                          className={cls(
                            'w-6 h-6 rounded grid place-items-center bg-transparent border-0 cursor-pointer',
                            active ? 'text-white/80 hover:text-[#51fec0]' : 'text-muted hover:text-ink',
                          )}
                        >
                          {c.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTitleId(c.id)
                            setEditingTitleText(c.title)
                          }}
                          title="Rename"
                          className={cls(
                            'w-6 h-6 rounded grid place-items-center bg-transparent border-0 cursor-pointer',
                            active ? 'text-white/80 hover:text-white' : 'text-muted hover:text-ink',
                          )}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteConversation(c)}
                          title="Delete"
                          className={cls(
                            'w-6 h-6 rounded grid place-items-center bg-transparent border-0 cursor-pointer',
                            active ? 'text-white/80 hover:text-red-300' : 'text-muted hover:text-red-600',
                          )}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Fair-Share Quota Footer */}
          <div className="p-3 border-t border-line bg-card text-[12px]">
            {status.quota.unlimited ? (
              <div className="flex items-center justify-between text-ink font-semibold">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-[#0e9f6e]" /> Leadership Access
                </span>
                <span className="text-[#0e9f6e]">Unlimited</span>
              </div>
            ) : (
              <div className="grid gap-1">
                <div className="flex items-center justify-between text-ink font-semibold">
                  <span>Daily Fair-Share</span>
                  <span>
                    {status.quota.used_today}
                    {status.quota.daily_limit ? ` / ${status.quota.daily_limit}` : ''}
                  </span>
                </div>
                {status.quota.remaining_today !== null && (
                  <div className="text-[11px] text-muted">
                    {status.quota.remaining_today} requests left today
                    {status.quota.rpm_limit ? ` · ${status.quota.rpm_limit} RPM` : ''}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Main Chat Workbench */}
      <div className="flex flex-col rounded-2xl border border-line bg-card overflow-hidden min-h-[600px] max-h-[76vh]">
        {/* Top Mode & Privacy Controls */}
        <div className="px-3.5 py-2.5 border-b border-line bg-soft flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="btn outline sm"
                title="Show chat history"
              >
                <PanelLeftOpen size={14} /> Chats
              </button>
            )}
            <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="AI Mode">
              {MODE_OPTIONS.map(opt => {
                const Icon = opt.Icon
                const active = mode === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setMode(opt.key)}
                    title={opt.hint}
                    className={cls(
                      'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12.5px] font-semibold border cursor-pointer transition-colors',
                      active
                        ? 'bg-[#121212] text-[#51fec0] border-[#0e9f6e]'
                        : 'bg-card text-body border-line hover:bg-hover',
                    )}
                  >
                    <Icon size={13} />
                    <span>{opt.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {hasReadTools && (
              <label
                className={cls(
                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border cursor-pointer select-none',
                  useTools
                    ? 'bg-[#e8fff6] text-[#121212] border-[#0e9f6e]'
                    : 'bg-card text-muted border-line',
                )}
                title="Allow read-only lookup of live SWK records permitted for your role"
              >
                <input
                  type="checkbox"
                  checked={useTools}
                  onChange={e => setUseTools(e.target.checked)}
                />
                <Database size={12} /> Live Data Tools
              </label>
            )}

            {/* Confidential Mode toggle: strictly Leadership-only */}
            {isLeadership && status.can_use_confidential && (
              <label
                className={cls(
                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-bold border cursor-pointer select-none',
                  confidential
                    ? 'bg-[#121212] text-[#51fec0] border-[#0e9f6e]'
                    : 'bg-card text-ink border-line',
                )}
                title="Restrict routing strictly to Zero-Retention endpoints (never hits free third-party logging tiers)"
              >
                <input
                  type="checkbox"
                  checked={confidential}
                  onChange={e => setConfidential(e.target.checked)}
                />
                <Lock size={12} /> Confidential (Zero-Retention)
              </label>
            )}
          </div>
        </div>

        {/* Status / Config Alert */}
        {!status.configured && (
          <div className="mx-4 mt-3 p-3.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 text-[13.5px] flex items-center justify-between gap-3 flex-wrap">
            <span>
              <b>Omni-Route is not configured yet.</b>{' '}
              {isOmniAdmin
                ? 'Add at least one API key or local Ollama endpoint to enable SWK AI Brain.'
                : 'Ask an Owner or Admin to configure an Omni-Route provider.'}
            </span>
            {isOmniAdmin && (
              <Link to="/admin/integrations" className="btn green sm">
                Configure Omni-Route
              </Link>
            )}
          </div>
        )}

        {status.demo && (
          <div className="mx-4 mt-3 px-3 py-2 rounded-xl border border-[#0e9f6e]/30 bg-[#e8fff6] text-[#121212] text-[12.5px]">
            <b>Demo Workspace:</b> Responses are simulated. Connect live provider keys under{' '}
            <b>Admin → Omni-Route Pool</b> in production.
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5 grid gap-4 content-start bg-bg/40">
          {activeConvId !== null && msgsQ.isLoading && messages.length === 0 ? (
            <Loading label="Loading conversation…" />
          ) : messages.length === 0 ? (
            <div className="max-w-2xl mx-auto py-8 grid gap-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#121212] text-[#51fec0] border border-[#0e9f6e]/40 grid place-items-center mx-auto">
                <Sparkles size={22} />
              </div>
              <div>
                <h3 className="m-0 text-[19px] font-display font-extrabold text-ink">
                  SWK Omni AI Brain
                </h3>
                <p className="text-[13.5px] text-muted mt-1 mb-0">
                  Private per-user workspace with automatic PII Shield redaction for Emirates IDs, passports, IBANs, and client phones before external routing.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 text-start">
                {BRAIN_SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    type="button"
                    disabled={!status.configured || streaming}
                    onClick={() => void sendMessage(s)}
                    className="rounded-xl border border-line bg-card hover:bg-hover p-3 text-[13px] text-ink text-start cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map(m => (
              <div
                key={m.id}
                className={cls(
                  'max-w-[90%] md:max-w-[82%] rounded-2xl px-4 py-3 grid gap-2',
                  m.role === 'user'
                    ? 'justify-self-end bg-[#121212] text-white'
                    : 'justify-self-start bg-card border border-line text-ink shadow-xs',
                )}
              >
                {m.role === 'user' ? (
                  <>
                    <div className="text-[14.5px] whitespace-pre-wrap leading-relaxed">{m.content}</div>
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {m.attachments.map((att, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 text-[11px] text-[#51fec0]"
                          >
                            {att.method === 'vision' ? <ImageIcon size={11} /> : <FileText size={11} />}
                            {att.name} · {att.method}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {m.streaming && !m.content ? (
                      <div className="flex items-center gap-2 text-[13.5px] text-muted">
                        <Loader2 size={15} className="animate-spin text-[#0e9f6e]" />
                        Thinking via Omni-Route ({mode})…
                      </div>
                    ) : (
                      <SafeMarkdown text={m.content} />
                    )}

                    {/* Transparent Answering Provider / Model + PII Shield Badges */}
                    {!m.streaming && (m.provider_used || m.model_used || (m.pii_redacted ?? 0) > 0) && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-line text-[11px]">
                        {m.provider_used && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-soft border border-line font-semibold text-ink">
                            <Bot size={11} className="text-[#0e9f6e]" />
                            {m.provider_used}
                            {m.model_used ? ` · ${m.model_used}` : ''}
                          </span>
                        )}
                        {m.route_label && (
                          <span className="px-2 py-0.5 rounded-full bg-soft text-muted">
                            {m.route_label}
                          </span>
                        )}
                        {m.zero_retention && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#121212] text-[#51fec0] font-bold">
                            <Lock size={10} /> Zero-Retention
                          </span>
                        )}
                        {(m.pii_redacted ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#e8fff6] border border-[#0e9f6e]/40 text-[#121212] font-bold">
                            <ShieldCheck size={11} className="text-[#0e9f6e]" />
                            PII Shield redacted {m.pii_redacted} sensitive item{m.pii_redacted === 1 ? '' : 's'}
                          </span>
                        )}
                        {!!m.tokens && (
                          <span className="text-muted ml-auto">{m.tokens.toLocaleString()} tokens</span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))
          )}
          <div ref={scrollEndRef} />
        </div>

        {/* Composer */}
        <form
          className="p-3 border-t border-line bg-card grid gap-2"
          onSubmit={e => {
            e.preventDefault()
            void sendMessage()
          }}
        >
          {files.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {files.map((f, idx) => {
                const isImg = f.type.startsWith('image/') || IMAGE_EXT_RE.test(f.name)
                return (
                  <span
                    key={`${f.name}-${idx}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-soft border border-line text-[12px] text-ink"
                  >
                    {isImg ? <ImageIcon size={13} className="text-[#0e9f6e]" /> : <FileText size={13} />}
                    <span className="max-w-[180px] truncate font-medium">{f.name}</span>
                    <span className="text-muted">({formatFileSize(f.size)})</span>
                    <button
                      type="button"
                      onClick={() => setFiles(prev => prev.filter((_, i) => i !== idx))}
                      className="bg-transparent border-0 p-0 cursor-pointer text-muted hover:text-red-600"
                      aria-label={`Remove ${f.name}`}
                    >
                      <XIcon size={13} />
                    </button>
                  </span>
                )
              })}

              {hasImageFiles && (
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#e8fff6] border border-[#0e9f6e]/30 text-[12px] font-semibold text-[#121212] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useVision}
                    onChange={e => setUseVision(e.target.checked)}
                  />
                  <Eye size={13} className="text-[#0e9f6e]" /> Vision analysis
                </label>
              )}
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.png,.jpg,.jpeg,.webp,.gif,.tif,.tiff,.bmp"
              onChange={e => handleFilesSelected(e.target.files)}
            />
            <button
              type="button"
              disabled={!status.configured || streaming}
              onClick={() => fileInputRef.current?.click()}
              className="btn outline icon shrink-0"
              title="Attach PDF, Word, Excel, CSV, Text, or Image (up to 5 files, 20 MB each)"
            >
              <Paperclip size={16} />
            </button>

            <textarea
              rows={1}
              className="textarea flex-1 !min-h-[42px] max-h-[160px] resize-y"
              placeholder={
                status.configured
                  ? `Message SWK AI Brain (${MODE_OPTIONS.find(m => m.key === mode)?.label ?? 'Auto'})…`
                  : 'Connect an Omni-Route provider to begin'
              }
              value={composerText}
              disabled={!status.configured || streaming}
              onChange={e => setComposerText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void sendMessage()
                }
              }}
            />

            {streaming ? (
              <button
                type="button"
                onClick={stopStream}
                className="btn red shrink-0"
                title="Stop generating"
              >
                <Square size={14} /> Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!status.configured || (!composerText.trim() && files.length === 0)}
                className="swk-btn swk-btn-primary shrink-0"
              >
                <Send size={15} /> Send
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

function ExecutiveBrief() {
  const q = useQuery({
    queryKey: ['ai-brief'],
    queryFn: () => get<{ output: string; started_at: string; name: string } | null>('/api/ai/brief'),
  })
  if (q.error) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
  if (q.isLoading) return <Loading label="Loading executive brief…" />
  if (!q.data?.output) {
    return (
      <Empty
        icon={<FileText size={34} />}
        title="No executive briefing generated yet"
        hint="Run Jarvis or an active briefing employee from the AI Agents tab to generate today's executive summary."
      />
    )
  }
  return (
    <div className="swk-card border border-line p-5 bg-card grid gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge value="Leadership Only" tone="green" />
          <b className="font-display text-[16px] text-ink">{q.data.name || 'Executive Brief'}</b>
        </div>
        {q.data.started_at && (
          <span className="text-xs text-muted">{fmtIsoStamp(q.data.started_at)}</span>
        )}
      </div>
      <SafeMarkdown text={q.data.output} />
    </div>
  )
}

function LegacyChat({ status }: { status: LegacyStatus }) {
  const toast = useToast()
  const agents = status.agents.filter(a => a.active || a.role_key === 'jarvis')
  const [agentId, setAgentId] = useState<number>(
    agents.find(a => a.role_key === 'jarvis')?.id ?? agents[0]?.id ?? 0,
  )
  const [msgs, setMsgs] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, busy])

  const send = async (m: string) => {
    if (!m.trim() || busy || !agentId) return
    const history = msgs
    setMsgs([...history, { role: 'user', content: m }])
    setText('')
    setBusy(true)
    try {
      const r = await post<{ reply: string }>('/api/ai/chat', {
        agent_id: agentId,
        message: m,
        history,
      })
      setMsgs(x => [...x, { role: 'assistant', content: r.reply }])
    } catch (e: any) {
      toast.error(e.message)
      setMsgs(x => [...x, { role: 'assistant', content: '⚠ ' + e.message }])
    } finally {
      setBusy(false)
    }
  }
  const agent = agents.find(a => a.id === agentId)
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted">Talking to</span>
        <select
          className="select !w-auto"
          value={agentId}
          onChange={e => {
            setAgentId(Number(e.target.value))
            setMsgs([])
          }}
        >
          {agents.map(a => (
            <option key={a.id} value={a.id}>
              {a.avatar} {a.name} – {a.title}
            </option>
          ))}
        </select>
        {msgs.length > 0 && (
          <button type="button" className="btn ghost sm" onClick={() => setMsgs([])}>
            Clear
          </button>
        )}
      </div>
      <div className="rounded-xl border border-line bg-soft p-3 md:p-4 min-h-[260px] max-h-[48vh] overflow-auto grid gap-3 content-start">
        {msgs.length === 0 && (
          <div className="grid gap-2 py-3">
            <div className="text-[15px]">
              <span className="text-[24px] mr-2">{agent?.avatar}</span>
              <b>{agent?.name}</b> here. Ask me anything about the business – I read your live data.
            </div>
            <div className="flex flex-wrap gap-2">
              {LEGACY_SUGGESTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  className="btn outline sm"
                  onClick={() => void send(s)}
                  disabled={!status.configured}
                >
                  <Sparkles size={13} /> {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={cls(
              'max-w-[88%] rounded-2xl px-4 py-2.5 text-[14.5px] whitespace-pre-wrap leading-relaxed',
              m.role === 'user' ? 'justify-self-end bg-fold text-white' : 'bg-card border border-line',
            )}
          >
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-muted text-sm">
            <Loader2 className="animate-spin" size={16} /> {agent?.name} is checking the data…
          </div>
        )}
        <div ref={end} />
      </div>
      <form
        className="flex gap-2"
        onSubmit={e => {
          e.preventDefault()
          void send(text)
        }}
      >
        <input
          className="input flex-1"
          placeholder={
            status.configured
              ? 'Ask Jarvis… e.g. “chase the three biggest overdue customers”'
              : 'Connect an AI provider first'
          }
          value={text}
          onChange={e => setText(e.target.value)}
          disabled={!status.configured || busy}
        />
        <button className="btn green" disabled={!status.configured || busy || !text.trim()}>
          <Send size={15} /> Send
        </button>
      </form>
    </div>
  )
}

function Team({ status, reload }: { status: LegacyStatus; reload: () => void }) {
  const { me } = useMeta()
  const isOmniAdmin = canOpenEmployeeRecords(me)
  const toast = useToast()
  const qc = useQueryClient()
  const [edit, setEdit] = useState<Agent | null>(null)
  const [hire, setHire] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const [out, setOut] = useState<{ name: string; text: string } | null>(null)

  const toggle = async (a: Agent) => {
    try {
      await put(`/api/e/ai_agents/${a.id}`, { active: !a.active })
      toast.ok(`${a.name} ${a.active ? 'paused' : 'is now on duty'}`)
      reload()
    } catch (e: any) {
      toast.error(e.message)
    }
  }
  const run = async (a: Agent) => {
    setBusy(a.id)
    try {
      const r = await post<any>(`/api/ai/agents/${a.id}/run`, {})
      setOut({ name: a.name, text: r.output })
      reload()
      void qc.invalidateQueries({ queryKey: ['ai-activity'] })
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }
  const level = (s: string) =>
    s.startsWith('Ask') ? 'Asks first' : s.startsWith('Auto') ? 'Acts internally, asks before sending' : 'Autopilot'
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-sm text-muted flex-1">
          Switch an employee on and choose how much freedom they have. They report in the Activity tab, by notification, and optionally on WhatsApp.
        </div>
        {isOmniAdmin && (
          <button type="button" className="btn green" onClick={() => setHire(true)}>
            <Plus size={15} /> Hire an AI employee
          </button>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {status.agents.map(a => (
          <div
            key={a.id}
            className={cls(
              'rounded-2xl border p-4 grid gap-2 content-start',
              a.active ? 'border-[#e5e5e5] bg-card' : 'border-line bg-soft',
            )}
          >
            <div className="flex items-start gap-3">
              <div className="text-[30px] leading-none">{a.avatar}</div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-extrabold text-ink truncate">{a.name}</div>
                <div className="text-[13px] text-muted">{a.title}</div>
              </div>
              <label
                className="relative inline-flex items-center cursor-pointer"
                title={a.active ? 'On duty' : 'Paused'}
              >
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={a.active}
                  onChange={() => void toggle(a)}
                />
                <div className="w-10 h-6 bg-[#c9d3cc] peer-checked:bg-fold rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
              </label>
            </div>
            <div className="text-[12.5px] text-muted flex gap-1.5 flex-wrap">
              <Badge
                value={
                  a.schedule === 'Manual only'
                    ? 'Manual'
                    : a.schedule === 'Daily'
                      ? `Daily ${String(a.run_hour).padStart(2, '0')}:00`
                      : a.schedule
                }
                tone="blue"
              />
              <Badge
                value={level(a.autonomy)}
                tone={a.autonomy.startsWith('Auto') && !a.autonomy.includes('approve') ? 'amber' : 'grey'}
              />
              {a.last_status && (
                <Badge value={a.last_status} tone={a.last_status === 'ok' ? 'green' : 'red'} />
              )}
            </div>
            <div className="text-[12.5px] text-muted">
              {a.last_run_at
                ? `Last run ${fmtIsoStamp(a.last_run_at.length === 16 ? a.last_run_at + ':00' : a.last_run_at)}`
                : 'Never run'}
            </div>
            <div className="flex gap-2 mt-1">
              {isOmniAdmin && (
                <button
                  type="button"
                  className="btn outline sm"
                  disabled={!status.configured || busy === a.id}
                  onClick={() => void run(a)}
                >
                  {busy === a.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run now
                </button>
              )}
              <button type="button" className="btn ghost sm" onClick={() => setEdit(a)}>
                <Settings2 size={14} /> Configure
              </button>
            </div>
          </div>
        ))}
      </div>
      {edit && (
        <AgentEditor
          agent={edit}
          tools={status.tools}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null)
            reload()
          }}
        />
      )}
      <Modal open={hire} onClose={() => setHire(false)} title="Hire an AI employee" width={640}>
        <div className="grid gap-2">
          {status.templates.map(t => (
            <button
              key={t.key}
              type="button"
              className="text-start rounded-xl border border-line p-3 flex gap-3 items-start bg-card hover:bg-soft cursor-pointer"
              onClick={async () => {
                try {
                  await post('/api/ai/agents/hire', { template: t.key })
                  toast.ok(`${t.name} hired – switch them on when ready`)
                  setHire(false)
                  reload()
                } catch (e: any) {
                  toast.error(e.message)
                }
              }}
            >
              <span className="text-[26px]">{t.avatar}</span>
              <span>
                <b>{t.name}</b> – {t.title}
                <span className="block text-[13px] text-muted">{t.blurb}</span>
              </span>
            </button>
          ))}
          <div className="text-xs text-muted">
            Or create a fully custom employee from{' '}
            <Link to="/e/ai_agents" className="underline">
              AI employees
            </Link>{' '}
            (name, instructions, tools).
          </div>
        </div>
      </Modal>
      <Modal
        open={!!out}
        onClose={() => setOut(null)}
        title={`${out?.name} – report`}
        width={680}
        footer={
          <>
            <div className="flex-1" />
            <button type="button" className="btn green" onClick={() => setOut(null)}>
              Close
            </button>
          </>
        }
      >
        <div className="whitespace-pre-wrap text-[14.5px] leading-relaxed">{out?.text}</div>
      </Modal>
    </div>
  )
}

function AgentEditor({
  agent,
  tools,
  onClose,
  onSaved,
}: {
  agent: Agent
  tools: LegacyStatus['tools']
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [a, setA] = useState(agent)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof Agent, v: any) => setA(x => ({ ...x, [k]: v }))
  const selected = a.tools === '*' ? null : new Set(a.tools.split(',').map(s => s.trim()))
  const save = async () => {
    setBusy(true)
    try {
      await put(`/api/e/ai_agents/${a.id}`, {
        name: a.name,
        title: a.title,
        avatar: a.avatar,
        instructions: a.instructions,
        autonomy: a.autonomy,
        schedule: a.schedule,
        run_hour: a.run_hour,
        deliver_to: a.deliver_to,
        tools: a.tools || '*',
      })
      toast.ok('Saved')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Configure ${agent.name}`}
      width={760}
      footer={
        <>
          <button type="button" className="btn outline" onClick={onClose}>
            Cancel
          </button>
          <div className="flex-1" />
          <button type="button" className="btn green" disabled={busy} onClick={() => void save()}>
            Save
          </button>
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label">Name</label>
          <input className="input" value={a.name} onChange={e => set('name', e.target.value)} />
        </div>
        <div>
          <label className="label">Job title</label>
          <input className="input" value={a.title ?? ''} onChange={e => set('title', e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="label">What this employee does (standing instructions)</label>
          <textarea
            className="textarea"
            rows={7}
            value={a.instructions}
            onChange={e => set('instructions', e.target.value)}
          />
        </div>
        <div>
          <label className="label">Autonomy</label>
          <select className="select" value={a.autonomy} onChange={e => set('autonomy', e.target.value)}>
            <option>Ask first (every action needs approval)</option>
            <option>Auto for internal actions (approve external messages)</option>
            <option>Autopilot (act, then report)</option>
          </select>
        </div>
        <div>
          <label className="label">Runs</label>
          <select className="select" value={a.schedule} onChange={e => set('schedule', e.target.value)}>
            <option>Manual only</option>
            <option>Hourly</option>
            <option>Daily</option>
            <option>Weekly (Monday)</option>
          </select>
        </div>
        <div>
          <label className="label">Hour of day (Dubai)</label>
          <input
            className="input"
            type="number"
            min={0}
            max={23}
            value={a.run_hour}
            onChange={e => set('run_hour', Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">Send the report to</label>
          <select className="select" value={a.deliver_to} onChange={e => set('deliver_to', e.target.value)}>
            <option>In-app only</option>
            <option>In-app + WhatsApp (owner)</option>
            <option>In-app + e-mail (admin)</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="label">Tools this employee may use</label>
          <label className="flex gap-2 items-center text-sm mb-2">
            <input
              type="checkbox"
              checked={a.tools === '*'}
              onChange={e =>
                set(
                  'tools',
                  e.target.checked ? '*' : tools.filter(t => t.risk === 'read').map(t => t.name).join(','),
                )
              }
            />{' '}
            All tools
          </label>
          {selected && (
            <div className="grid gap-1 sm:grid-cols-2 max-h-48 overflow-auto border border-line rounded-xl p-2">
              {tools.map(t => (
                <label
                  key={t.name}
                  className="flex gap-2 text-[13px] items-start"
                  title={t.description}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(t.name)}
                    onChange={e => {
                      const s = new Set(selected)
                      e.target.checked ? s.add(t.name) : s.delete(t.name)
                      set('tools', [...s].join(','))
                    }}
                  />{' '}
                  <span>
                    {t.name}{' '}
                    <span
                      className={cls(
                        'text-[11px] font-bold',
                        t.risk === 'external'
                          ? 'text-[#b4232f]'
                          : t.risk === 'internal'
                            ? 'text-[#9a6b00]'
                            : 'text-muted',
                      )}
                    >
                      {t.risk === 'read' ? '' : t.risk === 'external' ? 'sends outside' : 'changes data'}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Approvals({ reload }: { reload: () => void }) {
  const toast = useToast()
  const q = useQuery({
    queryKey: ['ai-approvals'],
    queryFn: () =>
      get<any>('/api/e/ai_actions', {
        filters: JSON.stringify([{ field: 'status', op: 'eq', value: 'Pending' }]),
        pageSize: 50,
      }),
    refetchInterval: 15000,
  })
  const decide = async (id: number, d: 'approve' | 'reject') => {
    try {
      const r = await post<any>(`/api/ai/actions/${id}/${d}`)
      r.status === 'Failed'
        ? toast.error(`Failed: ${typeof r.result === 'string' ? r.result : r.result?.error ?? ''}`)
        : toast.ok(d === 'approve' ? 'Done' : 'Rejected')
      void q.refetch()
      reload()
    } catch (e: any) {
      toast.error(e.message)
    }
  }
  if (q.error) return <ErrorBox error={q.error} />
  if (!q.data) return <Loading />
  if (!q.data.rows.length) {
    return (
      <Empty
        icon={<ShieldCheck size={34} />}
        title="Nothing waiting for you"
        hint="When an employee wants to send an e-mail or WhatsApp, or change data they are not allowed to change alone, it appears here."
      />
    )
  }
  return (
    <div className="grid gap-3">
      {q.data.rows.map((r: any) => (
        <div
          key={r.id}
          className="rounded-xl border border-line p-3 md:p-4 flex gap-3 items-start flex-wrap"
        >
          <div className="flex-1 min-w-[240px]">
            <div className="text-xs text-muted">
              {r._labels?.agent_id} · {fmtIsoStamp(r.created?.length === 16 ? r.created + ':00' : r.created)} · {r.tool}
            </div>
            <div className="text-[14.5px] font-semibold mt-0.5 whitespace-pre-wrap">{r.summary}</div>
            {r.args && (
              <details className="mt-1 text-[12.5px] text-muted">
                <summary className="cursor-pointer">Show details</summary>
                <pre className="whitespace-pre-wrap break-words bg-soft rounded-lg p-2 mt-1">
                  {typeof r.args === 'string' ? r.args : JSON.stringify(r.args, null, 2)}
                </pre>
              </details>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn green" onClick={() => void decide(r.id, 'approve')}>
              <Check size={15} /> Approve
            </button>
            <button type="button" className="btn red" onClick={() => void decide(r.id, 'reject')}>
              <XIcon size={15} /> Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function Activity() {
  const q = useQuery({
    queryKey: ['ai-activity'],
    queryFn: () => get<any>('/api/e/ai_runs', { pageSize: 25, sort: 'id', dir: 'desc' }),
    refetchInterval: 20000,
  })
  const [open, setOpen] = useState<number | null>(null)
  if (q.error) return <ErrorBox error={q.error} />
  if (!q.data) return <Loading />
  if (!q.data.rows.length) {
    return (
      <Empty
        title="No activity yet"
        hint="Run an employee from the AI Agents tab, or switch one on to run on its schedule."
      />
    )
  }
  return (
    <div className="grid gap-2">
      {q.data.rows.map((r: any) => (
        <div key={r.id} className="rounded-xl border border-line p-3">
          <button
            type="button"
            className="w-full text-start bg-transparent border-0 p-0 cursor-pointer flex gap-2 items-center flex-wrap"
            onClick={() => setOpen(open === r.id ? null : r.id)}
          >
            <Badge value={r.status} />
            <b className="text-[14px]">{r._labels?.agent_id}</b>
            <span className="text-xs text-muted">
              {r.trigger} · {r.started_at?.replace('T', ' ')} · {r.steps ?? 0} steps
              {r.tokens ? ` · ${r.tokens} tokens` : ''}
              {r.model ? ` · ${r.model}` : ''}
            </span>
          </button>
          {(open === r.id || r.status === 'failed') && (
            <div className="mt-2 text-[13.5px] whitespace-pre-wrap leading-relaxed">
              {r.output || r.error}
              {r.status === 'failed' && r.error && r.output ? '\n' + r.error : ''}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

interface VoiceStatus {
  enabled: boolean
  secret_set: boolean
  ai_configured: boolean
  agent: { id: number; name: string; active: boolean } | null
  transfer_configured: boolean
  calls_today: number
  ready: boolean
  greeting: { en: string; ar: string }
}

function Voice({ reload }: { reload: () => void }) {
  const toast = useToast()
  const st = useQuery({
    queryKey: ['voice-status'],
    queryFn: () => get<VoiceStatus>('/api/voice/status'),
    refetchInterval: 20000,
  })
  const calls = useQuery({
    queryKey: ['voice-calls'],
    queryFn: () => get<any>('/api/e/voice_calls', { pageSize: 15, sort: 'id', dir: 'desc' }),
    refetchInterval: 20000,
  })
  const [callId, setCallId] = useState(() => `test-${Date.now()}`)
  const [from, setFrom] = useState('')
  const [turns, setTurns] = useState<{ who: 'caller' | 'ai'; text: string; transfer?: string }[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns, busy])
  if (st.error) return <ErrorBox error={st.error} onRetry={() => void st.refetch()} />
  if (!st.data) return <Loading />
  const s = st.data
  const say = async () => {
    const m = text.trim()
    if (!m || busy) return
    setTurns(x => [...x, { who: 'caller', text: m }])
    setText('')
    setBusy(true)
    try {
      const r = await post<{ reply: string; action: string; transfer_to?: string }>('/api/voice/test', {
        call_id: callId,
        from,
        text: m,
      })
      setTurns(x => [
        ...x,
        {
          who: 'ai',
          text: r.reply,
          transfer: r.action === 'transfer' ? r.transfer_to || 'staff line' : undefined,
        },
      ])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }
  const hangUp = async () => {
    if (!turns.length) return
    try {
      await post('/api/voice/test', { call_id: callId, end: true })
      toast.ok('Test call logged')
      setTurns([])
      setCallId(`test-${Date.now()}`)
      void calls.refetch()
      void st.refetch()
    } catch (e: any) {
      toast.error(e.message)
    }
  }
  const switchOn = async () => {
    if (!s.agent) return
    try {
      await put(`/api/e/ai_agents/${s.agent.id}`, { active: true })
      toast.ok('AI Receptionist is on duty')
      void st.refetch()
      reload()
    } catch (e: any) {
      toast.error(e.message)
    }
  }
  const Step = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
    <li className="flex gap-2 items-start text-[14px]">
      {ok ? (
        <CircleCheck size={18} className="text-fold mt-0.5 shrink-0" />
      ) : (
        <Circle size={18} className="text-muted mt-0.5 shrink-0" />
      )}
      <span>{children}</span>
    </li>
  )
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-line p-4 grid gap-3 content-start">
          <div className="flex items-center gap-2">
            <PhoneCall size={18} />
            <b className="font-display">AI Receptionist on your phone line</b>
            {s.ready ? <Badge value="Ready" tone="green" /> : <Badge value="Setup needed" tone="amber" />}
          </div>
          <ul className="grid gap-2 m-0 p-0 list-none">
            <Step ok={s.ai_configured}>
              AI assistant is connected –{' '}
              <Link className="underline" to="/admin/integrations">
                Integrations → AI employees
              </Link>
            </Step>
            <Step ok={!!s.agent?.active}>
              The AI Receptionist is on duty{' '}
              {s.agent && !s.agent.active && (
                <button type="button" className="btn outline sm ml-1" onClick={() => void switchOn()}>
                  Switch on
                </button>
              )}
            </Step>
            <Step ok={s.enabled && s.secret_set}>
              The voice gateway is enabled and its URL generated –{' '}
              <Link className="underline" to="/admin/integrations">
                Integrations → Voice
              </Link>
            </Step>
            <Step ok={s.transfer_configured}>
              A staff number for transfers is set (optional – otherwise callers are offered a call-back)
            </Step>
          </ul>
          <div className="text-[12.5px] text-muted">
            Calls reach this OS through a voice platform connected to your du SIP line – see{' '}
            <code>docs/VOICE.md</code>. {s.calls_today} call{s.calls_today === 1 ? '' : 's'} handled today.
          </div>
          <div className="text-[12.5px] bg-soft border border-line rounded-xl p-3">
            <b>Opening line callers hear:</b>
            <div className="mt-1">{s.greeting.en}</div>
            <div className="mt-1" dir="rtl">
              {s.greeting.ar}
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-line p-4 grid gap-3 content-start">
          <div className="flex items-center gap-2 flex-wrap">
            <b className="font-display">Try the receptionist</b>
            <span className="text-[12.5px] text-muted">
              Plays a caller in text. Leads and tickets it creates are real; the call is logged below.
            </span>
          </div>
          <input
            className="input"
            placeholder="Caller number (optional), e.g. +971501234567"
            value={from}
            onChange={e => setFrom(e.target.value)}
            disabled={turns.length > 0}
          />
          <div className="rounded-xl border border-line bg-soft p-3 min-h-[200px] max-h-[40vh] overflow-auto grid gap-2 content-start">
            {turns.length === 0 && (
              <div className="text-[13.5px] text-muted">
                Say something a caller would, for example: “Hi, I’m looking for a two-bedroom apartment to rent in Dubai Marina.”
              </div>
            )}
            {turns.map((t, i) => (
              <div
                key={i}
                className={cls(
                  'max-w-[90%] rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed',
                  t.who === 'caller' ? 'justify-self-end bg-fold text-white' : 'bg-card border border-line',
                )}
              >
                {t.text}
                {t.transfer && (
                  <div className="mt-1 text-[12px] font-semibold flex items-center gap-1 text-[#9a6b00]">
                    <PhoneForwarded size={13} /> Transfers to {t.transfer}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-muted text-sm">
                <Loader2 className="animate-spin" size={16} /> thinking…
              </div>
            )}
            <div ref={end} />
          </div>
          <form
            className="flex gap-2"
            onSubmit={e => {
              e.preventDefault()
              void say()
            }}
          >
            <input
              className="input flex-1"
              placeholder={
                s.agent?.active && s.ai_configured
                  ? 'What the caller says…'
                  : 'Switch the receptionist on and connect AI first'
              }
              value={text}
              onChange={e => setText(e.target.value)}
              disabled={busy || !s.agent?.active || !s.ai_configured}
            />
            <button
              className="btn green"
              disabled={busy || !text.trim() || !s.agent?.active || !s.ai_configured}
            >
              <Send size={15} /> Say
            </button>
            <button
              type="button"
              className="btn outline"
              disabled={!turns.length || busy}
              onClick={() => void hangUp()}
            >
              Hang up
            </button>
          </form>
        </div>
      </div>
      <div>
        <div className="flex items-center mb-2">
          <b className="font-display flex-1">Recent calls</b>
          <Link className="btn outline sm" to="/e/voice_calls">
            All calls
          </Link>
        </div>
        {calls.error ? (
          <ErrorBox error={calls.error} />
        ) : !calls.data ? (
          <Loading />
        ) : !calls.data.rows.length ? (
          <Empty
            title="No calls yet"
            hint="Calls handled by the receptionist, including test calls, appear here with a summary and transcript."
          />
        ) : (
          <div className="grid gap-2">
            {calls.data.rows.map((r: any) => (
              <Link
                key={r.id}
                to={`/e/voice_calls/${r.id}`}
                className="rounded-xl border border-line p-3 flex gap-3 items-start flex-wrap no-underline text-ink hover:bg-soft"
              >
                <div className="min-w-[170px]">
                  <div className="text-[13px] font-semibold">
                    {r.caller_name || r.from_number || 'Unknown caller'}
                  </div>
                  <div className="text-xs text-muted">
                    {r.started_at?.replace('T', ' ')} · {r.duration_sec ? `${r.duration_sec}s` : r.status}
                  </div>
                </div>
                <Badge
                  value={r.outcome}
                  tone={r.outcome === 'Transferred to staff' || r.outcome === 'Abandoned' ? 'amber' : 'green'}
                />
                <div className="flex-1 min-w-[220px] text-[13.5px] text-muted">{r.summary || '—'}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
