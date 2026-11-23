import { useEffect,useMemo,useRef,useState } from 'react'
import { useLocation,useNavigate } from 'react-router-dom'
import { useQuery,useQueryClient } from '@tanstack/react-query'
import { ArrowLeft,Maximize2,MessageCircleMore,Minus,PenSquare,Search,Send,X } from 'lucide-react'
import { get,post } from '../lib/api'
import { useMeta } from '../lib/meta'
import { chatState,previewOf,subscribeChat,type ChatMessage } from '../lib/chatLive'
import { StaffPhoto } from './ui/staff-photo'

type Thread = { id: number; kind: string; title: string; peer: { id: number; email: string; online: boolean } | null; unread: number; last: ChatMessage | null }
type Person = { id: number; name: string; email: string; designation: string | null; online: boolean }
type View = { kind: 'list' } | { kind: 'new' } | { kind: 'chat'; id: number; title: string; email?: string }

const KEY = 'swk.chatdock'
const load = (): { open: boolean; min: boolean } => { try { return { open: false, min: false, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { open: false, min: false } } }
const initials = (n: string) => n.replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join('')
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' })

function Avatar({ name, email, online, size = 32 }: { name: string; email?: string; online?: boolean; size?: number }) {
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <span className="flex size-full items-center justify-center overflow-hidden rounded-full bg-[#0f2a33] text-[11px] font-semibold text-[#d4a752]">
        <StaffPhoto email={email} className="size-full object-cover object-top" fallback={initials(name)} />
      </span>
      {online && <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-white bg-[#2f9e6b]" aria-label="online" />}
    </span>
  )
}

/**
 * Gmail-style messenger docked at the bottom right of every screen (desktop): recent chats, a quick "To:" picker
 * for a new direct message, and the conversation itself. Uses the same Inside threads, live stream and read receipts
 * as the full messenger at /chat.
 */
export function ChatDock({ docked = false }: { docked?: boolean } = {}) {
  const { me } = useMeta(), qc = useQueryClient(), nav = useNavigate(), { pathname } = useLocation()
  const [state, setState] = useState(load)
  const [view, setView] = useState<View>({ kind: 'list' })
  const [to, setTo] = useState(''), [text, setText] = useState(''), [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const save = (s: { open: boolean; min: boolean }) => { setState(s); try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode */ } }
  const active = state.open && !state.min && view.kind === 'chat' ? view.id : null

  const threads = useQuery({ queryKey: ['chat-threads'], queryFn: () => get<Thread[]>('/api/chat/threads'), enabled: state.open, staleTime: 15000 })
  const people = useQuery({ queryKey: ['chat-people'], queryFn: () => get<Person[]>('/api/chat/people'), enabled: state.open && view.kind === 'new', staleTime: 300000 })
  const msgs = useQuery({ queryKey: ['chat-msgs', active], queryFn: () => get<{ messages: ChatMessage[] }>(`/api/chat/threads/${active}/messages`), enabled: !!active })
  const unread = useQuery({ queryKey: ['chat-unread'], queryFn: () => get<{ unread: number }>('/api/chat/unread'), refetchInterval: 60000 }).data?.unread ?? 0

  // While a conversation is on screen here, the notifier stays quiet for it and new messages are marked read.
  useEffect(() => {
    if (!active) return
    chatState.activeChat = active
    void post(`/api/chat/threads/${active}/read`).then(() => qc.invalidateQueries({ queryKey: ['chat-unread'] })).catch(() => {})
    return () => { if (chatState.activeChat === active) chatState.activeChat = null }
  }, [active, msgs.data?.messages.length, qc])
  useEffect(() => subscribeChat(e => {
    if (e.type === 'typing' || e.type === 'presence') return
    void qc.invalidateQueries({ queryKey: ['chat-threads'] })
    if (e.thread_id === active) void qc.invalidateQueries({ queryKey: ['chat-msgs', active] })
  }), [qc, active])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [msgs.data?.messages.length, active])

  const matches = useMemo(() => { const n = to.trim().toLowerCase(); return (people.data ?? []).filter(p => !n || p.name.toLowerCase().includes(n) || p.email.toLowerCase().includes(n)).slice(0, 8) }, [people.data, to])

  if (!me || pathname.startsWith('/chat')) return null

  const openWith = async (p: Person) => {
    const { id } = await post<{ id: number }>('/api/chat/threads', { user_ids: [p.id] })
    setTo(''); setView({ kind: 'chat', id, title: p.name, email: p.email }); void qc.invalidateQueries({ queryKey: ['chat-threads'] })
  }
  const send = async () => {
    if (!active || !text.trim() || sending) return
    setSending(true)
    try { await post(`/api/chat/threads/${active}/messages`, { body: text.trim() }); setText(''); await qc.invalidateQueries({ queryKey: ['chat-msgs', active] }) } finally { setSending(false) }
  }
  const title = view.kind === 'chat' ? view.title : view.kind === 'new' ? 'New message' : 'Messages'

  if (!state.open) return (
    <button type="button" onClick={() => save({ open: true, min: false })} aria-label={`Open messages, ${unread} unread`}
      className={docked
        ? 'no-print flex h-11 items-center gap-2 rounded-full border border-white/15 bg-[#0b1f2a] pl-4 pr-5 text-[13px] font-semibold text-white shadow-[0_12px_30px_rgba(11,31,42,0.28)] transition-all hover:-translate-y-0.5 hover:bg-[#143344] cursor-pointer'
        : 'no-print fixed bottom-5 right-5 z-[65] hidden items-center gap-2 rounded-full border border-white/15 bg-[#0b1f2a] py-2.5 pl-4 pr-5 text-[13px] font-semibold text-white shadow-[0_14px_34px_rgba(11,31,42,0.28)] hover:bg-[#143344] md:flex cursor-pointer'}>
      <MessageCircleMore size={17} className="text-[#d4a752]" /> Inside
      {unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#dc2626] px-1.5 text-[10.5px] font-bold">{unread > 99 ? '99+' : unread}</span>}
    </button>
  )

  return (
    <section aria-label="Messages" className={docked
      ? 'no-print flex w-[360px] flex-col overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_22px_54px_rgba(11,31,42,0.24)]'
      : 'no-print fixed bottom-4 right-5 z-[65] hidden w-[360px] flex-col overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_22px_54px_rgba(11,31,42,0.24)] md:flex'} style={{ height: state.min ? 46 : 492 }}>
      <header className="flex h-[46px] shrink-0 cursor-pointer items-center gap-1 bg-[#0b1f2a] pl-3.5 pr-1.5 text-white" onClick={() => save({ ...state, min: !state.min })}>
        {view.kind !== 'list' && !state.min && <button type="button" aria-label="Back" className="dock-btn" onClick={e => { e.stopPropagation(); setView({ kind: 'list' }) }}><ArrowLeft size={15} /></button>}
        <b className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{title}</b>
        {unread > 0 && state.min && <span className="mr-1 rounded-full bg-[#a3263a] px-1.5 text-[10.5px] font-semibold">{unread}</span>}
        <button type="button" aria-label={state.min ? 'Restore' : 'Minimise'} className="dock-btn" onClick={e => { e.stopPropagation(); save({ ...state, min: !state.min }) }}><Minus size={15} /></button>
        <button type="button" aria-label="Open full messenger" className="dock-btn" onClick={e => { e.stopPropagation(); nav(view.kind === 'chat' ? `/chat?t=${view.id}` : '/chat') }}><Maximize2 size={14} /></button>
        <button type="button" aria-label="Close" className="dock-btn" onClick={e => { e.stopPropagation(); save({ open: false, min: false }); setView({ kind: 'list' }) }}><X size={15} /></button>
      </header>

      {!state.min && view.kind === 'list' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <button type="button" onClick={() => setView({ kind: 'new' })} className="m-3 flex items-center gap-2 self-start rounded-2xl border-0 bg-[#f4f0e8] px-4 py-2.5 text-[13px] font-semibold text-[#0f2a33] hover:bg-[#ece6da]"><PenSquare size={15} /> New message</button>
          <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
            {(threads.data ?? []).map(t => (
              <li key={t.id}><button type="button" onClick={() => setView({ kind: 'chat', id: t.id, title: t.title, email: t.peer?.email })} className="flex w-full items-center gap-3 border-0 bg-transparent px-3 py-2.5 text-left hover:bg-[#f8f5ef]">
                <Avatar name={t.title} email={t.peer?.email} online={t.peer?.online} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2"><b className={`truncate text-[13.5px] ${t.unread ? 'font-semibold' : 'font-medium'} text-[#0f2a33]`}>{t.title}</b>{t.last && <span className="ml-auto shrink-0 text-[10.5px] text-[#5b676e]">{time(t.last.created_at)}</span>}</span>
                  <span className="flex items-center gap-2"><span className={`truncate text-[12.5px] ${t.unread ? 'text-[#0f2a33]' : 'text-[#5b676e]'}`}>{t.last ? previewOf(t.last) : 'No messages yet'}</span>{t.unread > 0 && <span className="ml-auto flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[#8a621c] px-1 text-[10px] font-semibold text-white">{t.unread}</span>}</span>
                </span>
              </button></li>
            ))}
            {threads.data?.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-[#5b676e]">No chats yet. Start one with New message.</li>}
          </ul>
        </div>
      )}

      {!state.min && view.kind === 'new' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <label className="flex items-center gap-2 border-b border-[#e6e0d4] px-3 py-2.5 text-[13px] text-[#5b676e]">To
            <input autoFocus value={to} onChange={e => setTo(e.target.value)} placeholder="Name or email" aria-label="Recipient" className="min-w-0 flex-1 border-0 bg-transparent text-[13.5px] text-[#0f2a33] outline-none no-focus-outline" />
            <Search size={14} aria-hidden />
          </label>
          <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
            {matches.map(p => (
              <li key={p.id}><button type="button" onClick={() => void openWith(p)} className="flex w-full items-center gap-3 border-0 bg-transparent px-3 py-2.5 text-left hover:bg-[#f8f5ef]">
                <Avatar name={p.name} email={p.email} online={p.online} />
                <span className="min-w-0"><b className="block truncate text-[13.5px] font-medium text-[#0f2a33]">{p.name}</b><span className="block truncate text-[12px] text-[#5b676e]">{p.designation || p.email}</span></span>
              </button></li>
            ))}
            {people.data && !matches.length && <li className="px-4 py-6 text-center text-[13px] text-[#5b676e]">Nobody matches “{to.trim()}”.</li>}
          </ul>
        </div>
      )}

      {!state.min && view.kind === 'chat' && (
        <div className="flex min-h-0 flex-1 flex-col bg-[#faf8f2]">
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {(msgs.data?.messages ?? []).map(m => m.kind === 'system'
              ? <div key={m.id} className="my-2 text-center text-[11px] text-[#5b676e]">{m.body}</div>
              : (
                <div key={m.id} className={`mb-1.5 flex ${m.user_id === me.id ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-[13px] leading-snug ${m.user_id === me.id ? 'rounded-br-md bg-[#0f2a33] text-white' : 'rounded-bl-md border border-[#e6e0d4] bg-white text-[#0f2a33]'}`}>
                    {m.user_id !== me.id && view.email === undefined && <b className="block text-[11px] font-semibold text-[#8a621c]">{m.name}</b>}
                    <span className="whitespace-pre-wrap break-words">{m.kind === 'text' ? m.body : previewOf(m)}</span>
                    <span className={`ml-2 align-bottom text-[10px] ${m.user_id === me.id ? 'text-white/60' : 'text-[#5b676e]'}`}>{time(m.created_at)}</span>
                  </div>
                </div>
              ))}
            <div ref={endRef} />
          </div>
          <form className="flex items-end gap-2 border-t border-[#e6e0d4] bg-white p-2" onSubmit={e => { e.preventDefault(); void send() }}>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={1} placeholder="Type a message" aria-label="Message"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
              className="max-h-28 min-h-[38px] flex-1 resize-none rounded-2xl border border-[#e6e0d4] bg-[#faf8f2] px-3 py-2 text-[13.5px] text-[#0f2a33] outline-none no-focus-outline focus:border-[#0f2a33] focus:ring-2 focus:ring-[#d4a752]/40" />
            <button type="submit" aria-label="Send" disabled={!text.trim() || sending} className="flex size-[38px] shrink-0 items-center justify-center rounded-full border-0 bg-[#0f2a33] text-[#d4a752] disabled:opacity-40"><Send size={16} /></button>
          </form>
        </div>
      )}
    </section>
  )
}
