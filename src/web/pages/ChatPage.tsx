import { Fragment,useEffect,useMemo,useRef,useState,type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery,useQueryClient } from '@tanstack/react-query'
import { AlertCircle,ArrowLeft,Archive,BellOff,BellRing,Check,CheckCheck,ChevronDown,ClipboardList,Clock,Copy,CornerUpLeft,Crown,Download,ExternalLink,FileText,FolderOpen,Forward,Info,Loader2,LogOut,MapPin,Megaphone,MessageSquarePlus,Mic,MoreVertical,Paperclip,Pencil,Pin,RefreshCw,Search,Send,Smile,Trash2,UserPlus,Users,X } from 'lucide-react'
import { get,post,del,api,upload } from '../lib/api'
import { useToast } from '../lib/toast'
import { useMeta } from '../lib/meta'
import { Modal,useDialogs,useClickOutside } from '../ui/kit'
import { chatState,enqueueChatOutbox,flushChatOutbox,listQueuedChatMessages,noteSeenMessageId,parseLocationPayload,previewOf,registerWebPush,removeChatOutboxItem,subscribeChat,syncActiveThread,type ChatMessage,type QueuedChatMessage } from '../lib/chatLive'
import { StaffPhoto } from '../components/ui/staff-photo'

type Thread = { id: number; kind: 'dm' | 'group'; title: string; peer: { id: number; email: string; online: boolean; last_seen: string | null } | null; members: number; role: string; pinned: boolean; muted: boolean; archived: boolean; announce: boolean; system: boolean; last: ChatMessage | null; unread: number }
type Person = { id: number; name: string; email: string; designation?: string; online: boolean; last_seen: string | null }
type Info = { id: number; kind: string; title: string | null; description: string | null; announce: boolean; system: boolean; created_at: string; created_by: string; members: (Person & { role: string })[]; media: { id: number; name: string; mime: string; url: string; created_at: string }[]; can_report: boolean }

const REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '✅']
const EMOJI = ['😀', '😂', '😊', '😍', '👍', '👏', '🙏', '🔥', '🎉', '✅', '❤️', '💯', '🤝', '🏠', '🏢', '🔑', '📍', '📄', '📞', '⏰', '💰', '📈', '✨', '👀']
const NAME_COLORS = ['#0e9f6e', '#1b6aa7', '#b45309', '#7c3aed', '#be185d', '#0f766e', '#a16207', '#4338ca']

const dubai = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', ...o }).format(new Date(iso))
const dayKey = (iso: string) => dubai(iso, { year: 'numeric', month: '2-digit', day: '2-digit' })
const timeOf = (iso: string) => dubai(iso, { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase()
function dayLabel(iso: string) {
  const k = dayKey(iso), now = new Date()
  if (k === dayKey(now.toISOString())) return 'Today'
  if (k === dayKey(new Date(now.getTime() - 864e5).toISOString())) return 'Yesterday'
  return dubai(iso, { weekday: 'long', day: 'numeric', month: 'long' })
}
const listTime = (iso: string) => { const l = dayLabel(iso); return l === 'Today' ? timeOf(iso) : l === 'Yesterday' ? l : dubai(iso, { day: '2-digit', month: '2-digit', year: '2-digit' }) }
const lastSeenText = (p: { online: boolean; last_seen: string | null } | null | undefined) => !p ? '' : p.online ? 'online' : p.last_seen ? `last seen ${dayLabel(p.last_seen).toLowerCase() === 'today' ? 'today' : dayLabel(p.last_seen)} at ${timeOf(p.last_seen)}` : 'last seen recently'
const fmtSize = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`)
const colorFor = (id: number) => NAME_COLORS[id % NAME_COLORS.length]

function Avatar({ name, email, group, size = 48, online }: { name: string; email?: string | null; group?: boolean; size?: number; online?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span className="flex size-full items-center justify-center overflow-hidden rounded-full bg-[#121212] font-semibold text-[#51fec0]" style={{ fontSize: size * 0.32 }}>
        {group ? <Users size={size * 0.44} /> : <StaffPhoto email={email} className="size-full object-cover object-top" fallback={name.replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]!.toUpperCase()).join('')} />}
      </span>
      {online && <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-white bg-[#22c55e]" aria-label="online" />}
    </span>
  )
}

function Ticks({ status, pending, failed }: { status: ChatMessage['status']; pending?: boolean; failed?: boolean }) {
  if (failed) return <AlertCircle size={14} className="text-[#dc2626]" aria-label="Failed to send" />
  if (pending) return <Clock size={14} className="text-[#8b8b8b]" aria-label="Queued" />
  if (!status) return null
  if (status === 'sent') return <Check size={15} className="text-[#8b8b8b]" aria-label="Sent" />
  return <CheckCheck size={15} className={status === 'read' ? 'text-[#34b7f1]' : 'text-[#8b8b8b]'} aria-label={status === 'read' ? 'Read' : 'Delivered'} />
}

function LocationPinCard({ body }: { body: string }) {
  const toast = useToast()
  const loc = parseLocationPayload(body)
  if (!loc) return <span className="text-[13px] text-[#737373]">📍 Shared location</span>
  const coords = `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`
  const mapsUrl = `https://www.google.com/maps?q=${encodeURIComponent(`${loc.lat},${loc.lng}`)}`
  return (
    <div className="mb-1 w-[min(280px,100%)] overflow-hidden rounded-xl border border-black/10 bg-[#f6fbf9]">
      <div
        className="relative flex h-24 items-center justify-center border-b border-black/10"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 50%, rgba(14,159,110,0.22), transparent 65%), repeating-linear-gradient(0deg, rgba(14,159,110,0.08) 0 1px, transparent 1px 18px), repeating-linear-gradient(90deg, rgba(14,159,110,0.08) 0 1px, transparent 1px 18px)',
        }}
      >
        <div className="flex flex-col items-center gap-1">
          <span className="flex size-9 items-center justify-center rounded-full bg-[#0e9f6e] text-white shadow-md">
            <MapPin size={18} />
          </span>
          <span className="rounded-full bg-white/95 px-2 py-0.5 font-mono text-[10.5px] font-medium text-[#121212] shadow-sm">{coords}</span>
        </div>
      </div>
      <div className="p-2.5">
        <div className="truncate text-[13px] font-semibold text-[#121212]">{loc.label || 'Dubai Live Location'}</div>
        <div className="mt-1.5 flex items-center gap-2">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg bg-[#121212] px-2.5 py-1 text-[11.5px] font-medium text-[#51fec0] no-underline hover:opacity-90"
          >
            <ExternalLink size={12} /> Open in Maps
          </a>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2 py-1 text-[11.5px] text-[#4a4a4a] hover:bg-[#f5f5f5]"
            onClick={() => { void navigator.clipboard?.writeText(coords); toast.ok('Coordinates copied') }}
          >
            <Copy size={11} /> Copy
          </button>
        </div>
      </div>
    </div>
  )
}

/** WhatsApp formatting: *bold*, _italic_, ~strike~, and clickable links. Built as React nodes, never as HTML. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g)
  return <>{parts.map((p, i) =>
    /^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="break-all text-[#1b6aa7] underline">{p}</a>
      : /^\*.+\*$/.test(p) ? <b key={i} className="font-semibold">{p.slice(1, -1)}</b>
      : /^_.+_$/.test(p) ? <i key={i}>{p.slice(1, -1)}</i>
      : /^~.+~$/.test(p) ? <s key={i}>{p.slice(1, -1)}</s>
      : <Fragment key={i}>{p}</Fragment>)}</>
}

function Menu({ children, onClose, className = '' }: { children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useClickOutside<HTMLDivElement>(onClose)
  return <div ref={ref} role="menu" className={`absolute z-40 min-w-[190px] rounded-2xl border border-black/5 bg-white p-1.5 shadow-[0_24px_60px_rgba(18,18,18,0.16)] ${className}`}>{children}</div>
}
const MenuItem = ({ icon: I, children, onClick, danger }: { icon: typeof Check; children: ReactNode; onClick: () => void; danger?: boolean }) => (
  <button role="menuitem" type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl border-0 bg-transparent px-3 py-2 text-left text-[13.5px] hover:bg-[#f5f5f5] ${danger ? 'text-[#dc2626]' : 'text-[#121212]'}`}><I size={16} className={danger ? '' : 'text-[#737373]'} />{children}</button>
)

export function ChatPage() {
  const toast = useToast(), qc = useQueryClient(), dlg = useDialogs(), { me } = useMeta()
  const [sp, setSp] = useSearchParams()
  const sel = Number(sp.get('t')) || null
  const setSel = (id: number | null) => { const n = new URLSearchParams(sp); if (id) n.set('t', String(id)); else n.delete('t'); setSp(n, { replace: !!sel && !!id }) }
  const [filter, setFilter] = useState<'all' | 'unread' | 'groups' | 'archived'>('all')
  const [term, setTerm] = useState('')
  const [typing, setTyping] = useState<Record<number, { name: string; until: number; recording?: boolean }>>({})
  const [newChat, setNewChat] = useState<null | 'dm' | 'group'>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [rowMenu, setRowMenu] = useState<number | null>(null)
  const [notifPerm, setNotifPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied')

  const threadsQ = useQuery({ queryKey: ['chat-threads'], queryFn: () => get<Thread[]>('/api/chat/threads'), refetchInterval: 30000 })
  const peopleQ = useQuery({ queryKey: ['chat-people'], queryFn: () => get<Person[]>('/api/chat/people') })
  const searchQ = useQuery({ queryKey: ['chat-search', term], enabled: term.trim().length >= 2, queryFn: () => get<{ id: number; thread_id: number; body: string; created_at: string; name: string; title: string; kind: string }[]>('/api/chat/search', { q: term.trim() }) })
  const threads = threadsQ.data ?? []
  const current = threads.find(t => t.id === sel) ?? null

  useEffect(() => {
    chatState.activeChat = sel
    const publish = () => syncActiveThread(sel && !document.hidden ? sel : null)
    publish()
    document.addEventListener('visibilitychange', publish)
    const hb = sel ? window.setInterval(publish, 55_000) : null
    return () => {
      chatState.activeChat = null
      document.removeEventListener('visibilitychange', publish)
      if (hb !== null) window.clearInterval(hb)
      syncActiveThread(null)
    }
  }, [sel])
  useEffect(() => subscribeChat(e => {
    if (e.type === 'typing') { setTyping(t => ({ ...t, [e.thread_id]: { name: e.name, recording: e.recording, until: Date.now() + 4000 } })); return }
    if (e.type === 'presence') { void qc.invalidateQueries({ queryKey: ['chat-threads'] }); return }
    if (e.type === 'message') setTyping(t => { const n = { ...t }; delete n[e.thread_id]; return n })
    void qc.invalidateQueries({ queryKey: ['chat-threads'] })
    if ('thread_id' in e && e.thread_id) { void qc.invalidateQueries({ queryKey: ['chat-msgs', e.thread_id] }); if (e.type === 'thread') void qc.invalidateQueries({ queryKey: ['chat-info', e.thread_id] }) }
  }), [qc])
  useEffect(() => {
    void flushChatOutbox(() => {
      void qc.invalidateQueries({ queryKey: ['chat-threads'] })
      void qc.invalidateQueries({ queryKey: ['chat-msgs'] })
    })
  }, [qc])
  useEffect(() => { const i = window.setInterval(() => setTyping(t => Object.fromEntries(Object.entries(t).filter(([, v]) => v.until > Date.now()))), 1500); return () => clearInterval(i) }, [])

  const shown = useMemo(() => {
    const t = term.trim().toLowerCase()
    return threads.filter(th => (filter === 'archived' ? th.archived : !th.archived) && (filter !== 'unread' || th.unread > 0) && (filter !== 'groups' || th.kind === 'group') && (!t || th.title.toLowerCase().includes(t)))
  }, [threads, filter, term])
  const archivedCount = threads.filter(t => t.archived).length

  const prefs = async (t: Thread, p: Partial<Pick<Thread, 'pinned' | 'muted' | 'archived'>>) => { setRowMenu(null); try { await post(`/api/chat/threads/${t.id}/prefs`, p); void qc.invalidateQueries({ queryKey: ['chat-threads'] }) } catch (e: any) { toast.error(e.message) } }
  const askNotif = async () => {
    if (typeof Notification === 'undefined') return
    const p = await Notification.requestPermission()
    setNotifPerm(p)
    if (p === 'granted') void registerWebPush()
  }

  return (
    <div className="mx-auto -mb-6 grid h-[calc(100dvh-136px)] min-h-[480px] max-md:h-[calc(100dvh-190px)] max-w-[1400px] overflow-hidden rounded-[1.25rem] border border-white/70 bg-white shadow-[0_24px_60px_rgba(12,56,96,0.10)] md:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
      {/* ------------------------------------------------ chat list */}
      <aside className={`flex min-h-0 flex-col border-r border-[#e5e5e5] ${sel ? 'hidden md:flex' : 'flex'}`} aria-label="Chats">
        <header className="flex items-center gap-2 px-5 pb-3 pt-5">
          <div className="min-w-0 flex-1"><div className="web-eyebrow">SWK internal</div><h1 className="m-0 text-[24px] font-medium tracking-[-0.035em]">Inside</h1></div>
          <button type="button" className="swk-tbtn" title="New chat" aria-label="New chat" onClick={() => setNewChat('dm')}><MessageSquarePlus size={17} /></button>
          <button type="button" className="swk-tbtn" title="New group" aria-label="New group" onClick={() => setNewChat('group')}><Users size={17} /></button>
        </header>
        {notifPerm === 'default' && (
          <button type="button" onClick={() => void askNotif()} className="mx-4 mb-3 flex items-center gap-3 rounded-2xl border-0 bg-[#121212] px-4 py-3 text-left text-white">
            <span className="flex size-9 items-center justify-center rounded-full bg-[#51fec0] text-[#0a1624]"><BellRing size={16} /></span>
            <span className="text-[12.5px] leading-snug"><b className="block font-semibold">Get notified of new messages</b><span className="text-white/70">Turn on desktop notifications</span></span>
          </button>
        )}
        <label className="relative mx-4 mb-3">
          <span className="sr-only">Search chats and messages</span>
          <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8b8b8b]" />
          <input value={term} onChange={e => setTerm(e.target.value)} placeholder="Search or start a new chat" className="h-10 w-full rounded-full border-0 bg-[#f5f5f5] pl-10 pr-4 text-[14px] outline-none focus:ring-2 focus:ring-[#51fec0]/60 no-focus-outline" />
        </label>
        <div className="mb-2 flex gap-1.5 overflow-x-auto px-4 no-scrollbar" role="tablist" aria-label="Filter chats">
          {([['all', 'All'], ['unread', 'Unread'], ['groups', 'Groups'], ['archived', `Archived${archivedCount ? ` (${archivedCount})` : ''}`]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filter === k} type="button" onClick={() => setFilter(k)} className={`web-pill shrink-0 border-0 ${filter === k ? 'mint' : ''}`} style={{ height: 30, cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontSize: 12.5 }}>{l}</button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {threadsQ.isLoading && <div className="flex justify-center p-8"><Loader2 className="animate-spin text-[#8b8b8b]" /></div>}
          {shown.map(t => {
            const ty = typing[t.id]
            return (
              <div key={t.id} className={`group relative flex items-center gap-3 px-4 py-3 transition-colors ${sel === t.id ? 'bg-[#f0f2f5]' : 'hover:bg-[#f7f7f7]'}`}>
                <button type="button" className="absolute inset-0 border-0 bg-transparent" aria-label={`Open chat with ${t.title}`} onClick={() => { setSel(t.id); setShowInfo(false) }} />
                <Avatar name={t.title} email={t.peer?.email} group={t.kind === 'group'} online={t.peer?.online} />
                <div className="pointer-events-none min-w-0 flex-1 border-b border-[#f0f0f0] pb-3 group-last:border-0">
                  <div className="flex items-baseline gap-2"><b className="truncate text-[15px] font-medium text-[#121212]">{t.title}</b>{t.last && <span className={`ml-auto shrink-0 text-[11.5px] ${t.unread ? 'font-semibold text-[#0e9f6e]' : 'text-[#8b8b8b]'}`}>{listTime(t.last.created_at)}</span>}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[#737373]">
                    {ty ? <span className="truncate text-[#0e9f6e]">{t.kind === 'group' ? `${ty.name.split(' ')[0]} is ` : ''}{ty.recording ? 'recording audio…' : 'typing…'}</span> : t.last ? <>
                      {t.last.user_id === me?.id && <Ticks status={t.last.status} />}
                      {t.kind === 'group' && t.last.kind !== 'system' && <span className="shrink-0">{t.last.user_id === me?.id ? 'You' : t.last.name.split(' ')[0]}:</span>}
                      <span className="truncate">{previewOf(t.last)}</span>
                    </> : <span className="truncate italic">No messages yet</span>}
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                      {t.muted && <BellOff size={13} aria-label="Muted" />}{t.pinned && <Pin size={13} aria-label="Pinned" />}
                      {t.unread > 0 && <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white ${t.muted ? 'bg-[#a7a7a7]' : 'bg-[#0e9f6e]'}`}>{t.unread}</span>}
                    </span>
                  </div>
                </div>
                <button type="button" aria-label="Chat options" className="relative z-10 flex size-7 items-center justify-center rounded-full border-0 bg-transparent text-[#8b8b8b] opacity-0 hover:bg-white group-hover:opacity-100 focus-visible:opacity-100" onClick={() => setRowMenu(rowMenu === t.id ? null : t.id)}><ChevronDown size={16} /></button>
                {rowMenu === t.id && (
                  <Menu onClose={() => setRowMenu(null)} className="right-4 top-12">
                    <MenuItem icon={Pin} onClick={() => void prefs(t, { pinned: !t.pinned })}>{t.pinned ? 'Unpin chat' : 'Pin chat'}</MenuItem>
                    <MenuItem icon={BellOff} onClick={() => void prefs(t, { muted: !t.muted })}>{t.muted ? 'Unmute notifications' : 'Mute notifications'}</MenuItem>
                    <MenuItem icon={Archive} onClick={() => void prefs(t, { archived: !t.archived })}>{t.archived ? 'Unarchive chat' : 'Archive chat'}</MenuItem>
                    {t.unread > 0 && <MenuItem icon={CheckCheck} onClick={() => { setRowMenu(null); void post(`/api/chat/threads/${t.id}/read`).then(() => qc.invalidateQueries({ queryKey: ['chat-threads'] })) }}>Mark as read</MenuItem>}
                  </Menu>
                )}
              </div>
            )
          })}
          {!threadsQ.isLoading && !shown.length && !term && <div className="p-8 text-center text-[13px] text-[#737373]">{filter === 'archived' ? 'No archived chats' : 'No chats yet. Start one with the + button.'}</div>}
          {term.trim().length >= 2 && (
            <div>
              {(peopleQ.data ?? []).filter(p => p.name.toLowerCase().includes(term.trim().toLowerCase())).slice(0, 6).length > 0 && <div className="web-eyebrow px-5 pb-1 pt-3">Contacts</div>}
              {(peopleQ.data ?? []).filter(p => p.name.toLowerCase().includes(term.trim().toLowerCase())).slice(0, 6).map(p => (
                <button key={p.id} type="button" className="flex w-full items-center gap-3 border-0 bg-transparent px-4 py-2.5 text-left hover:bg-[#f7f7f7]" onClick={async () => { const r = await post<{ id: number }>('/api/chat/threads', { user_ids: [p.id] }); setTerm(''); await qc.invalidateQueries({ queryKey: ['chat-threads'] }); setSel(r.id) }}>
                  <Avatar name={p.name} email={p.email} size={40} online={p.online} /><span className="min-w-0"><b className="block truncate text-[14px] font-medium">{p.name}</b><small className="text-[#8b8b8b]">{p.designation || lastSeenText(p)}</small></span>
                </button>
              ))}
              {!!searchQ.data?.length && <div className="web-eyebrow px-5 pb-1 pt-3">Messages</div>}
              {searchQ.data?.map(m => (
                <button key={m.id} type="button" className="flex w-full flex-col border-0 bg-transparent px-5 py-2.5 text-left hover:bg-[#f7f7f7]" onClick={() => { setSel(m.thread_id); setTerm('') }}>
                  <span className="flex text-[12px] text-[#8b8b8b]"><span className="truncate">{m.title || m.name}</span><span className="ml-auto">{listTime(m.created_at)}</span></span>
                  <span className="truncate text-[13.5px] text-[#121212]">{m.name}: {m.body.replace(/\*/g, '')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ------------------------------------------------ conversation */}
      {current ? (
        <Conversation key={current.id} thread={current} typing={typing[current.id]} onBack={() => setSel(null)} showInfo={showInfo} setShowInfo={setShowInfo} threads={threads} people={peopleQ.data ?? []} />
      ) : (
        <section className="hidden flex-col items-center justify-center gap-4 bg-[#f7f7f7] p-10 text-center md:flex" style={{ backgroundImage: 'repeating-linear-gradient(to right, rgba(11,25,41,0.04) 0px, rgba(11,25,41,0.04) 1px, transparent 1px, transparent 24px)' }}>
          <img src="/brand/apps/messages.svg" alt="" className="size-28" />
          <h2 className="m-0 text-[30px] font-medium tracking-[-0.035em]">Inside by SWK</h2>
          <p className="m-0 max-w-md text-[14px] text-[#737373]">Message colleagues, run project groups and share files with the team. Messages stay inside SWK OS and are only visible to people in the chat.</p>
          <div className="mt-2 flex gap-3"><button type="button" className="web-btn" onClick={() => setNewChat('dm')}><MessageSquarePlus size={14} /> New chat</button><button type="button" className="web-btn light" onClick={() => setNewChat('group')}><Users size={14} /> New group</button></div>
        </section>
      )}

      <NewChatModal mode={newChat} people={peopleQ.data ?? []} onClose={() => setNewChat(null)} onOpen={id => { setNewChat(null); void qc.invalidateQueries({ queryKey: ['chat-threads'] }); setSel(id) }} />
    </div>
  )
}

function NewChatModal({ mode, people, onClose, onOpen }: { mode: null | 'dm' | 'group'; people: Person[]; onClose: () => void; onOpen: (id: number) => void }) {
  const toast = useToast()
  const [term, setTerm] = useState(''), [chosen, setChosen] = useState<number[]>([]), [title, setTitle] = useState(''), [desc, setDesc] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { setTerm(''); setChosen([]); setTitle(''); setDesc('') }, [mode])
  const list = people.filter(p => p.name.toLowerCase().includes(term.trim().toLowerCase()))
  const start = async (ids: number[]) => {
    setBusy(true)
    try { const r = await post<{ id: number }>('/api/chat/threads', mode === 'group' ? { user_ids: ids, title, description: desc, group: true } : { user_ids: ids }); onOpen(r.id) } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal open={!!mode} onClose={onClose} title={mode === 'group' ? 'New group' : 'New chat'} width={480}
      footer={mode === 'group' ? <><div className="flex-1 text-[12.5px] text-[#737373]">{chosen.length} selected</div><button className="web-btn" disabled={busy || !chosen.length || !title.trim()} onClick={() => void start(chosen)}>Create group</button></> : undefined}>
      {mode === 'group' && (
        <div className="mb-4 grid gap-3">
          <label><span className="label">Group name</span><input className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="e.g. Palm Jebel Ali launch, Leasing team" autoFocus /></label>
          <label><span className="label">Description (optional)</span><input className="input" value={desc} onChange={e => setDesc(e.target.value)} maxLength={500} placeholder="What this group is for" /></label>
        </div>
      )}
      <input className="input mb-3" value={term} onChange={e => setTerm(e.target.value)} placeholder="Search name" aria-label="Search people" autoFocus={mode === 'dm'} />
      <div className="max-h-[48vh] overflow-y-auto">
        {list.map(p => {
          const on = chosen.includes(p.id)
          return (
            <button key={p.id} type="button" disabled={busy} className="flex w-full items-center gap-3 rounded-xl border-0 bg-transparent px-2 py-2.5 text-left hover:bg-[#f7f7f7]"
              onClick={() => mode === 'group' ? setChosen(c => on ? c.filter(x => x !== p.id) : [...c, p.id]) : void start([p.id])} aria-pressed={mode === 'group' ? on : undefined}>
              <Avatar name={p.name} email={p.email} size={42} online={p.online} />
              <span className="min-w-0 flex-1"><b className="block truncate text-[14.5px] font-medium">{p.name}</b><small className="text-[#8b8b8b]">{p.designation || lastSeenText(p)}</small></span>
              {mode === 'group' && <span className={`flex size-6 items-center justify-center rounded-full border-2 ${on ? 'border-[#0e9f6e] bg-[#0e9f6e] text-white' : 'border-[#cfcfcf]'}`}>{on && <Check size={14} />}</span>}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

function Conversation({ thread, typing, onBack, showInfo, setShowInfo, threads, people }: { thread: Thread; typing?: { name: string; recording?: boolean }; onBack: () => void; showInfo: boolean; setShowInfo: (v: boolean) => void; threads: Thread[]; people: Person[] }) {
  const toast = useToast(), qc = useQueryClient(), dlg = useDialogs(), { me } = useMeta()
  const [older, setOlder] = useState<ChatMessage[]>([]), [hasOlder, setHasOlder] = useState(false)
  const [optimistic, setOptimistic] = useState<ChatMessage[]>([]), [queued, setQueued] = useState<QueuedChatMessage[]>([])
  const msgsQ = useQuery({ queryKey: ['chat-msgs', thread.id], queryFn: () => get<{ messages: ChatMessage[]; more: boolean }>(`/api/chat/threads/${thread.id}/messages`) })
  const infoQ = useQuery({ queryKey: ['chat-info', thread.id], queryFn: () => get<Info>(`/api/chat/threads/${thread.id}`) })

  useEffect(() => {
    const syncQ = () => { void listQueuedChatMessages(thread.id).then(setQueued).catch(() => {}) }
    syncQ()
    window.addEventListener('swk:chat-outbox', syncQ)
    return () => window.removeEventListener('swk:chat-outbox', syncQ)
  }, [thread.id])

  const msgs = useMemo(() => {
    const latest = msgsQ.data?.messages ?? []
    const ids = new Set(latest.map(m => m.id))
    const pendingQueued: ChatMessage[] = queued.map((qItem, idx) => ({
      id: -1_000_000 - idx,
      user_id: qItem.userId,
      name: qItem.userName,
      kind: qItem.kind,
      body: qItem.body,
      created_at: qItem.createdAt,
      edited: false,
      forwarded: false,
      file: null,
      reply: null,
      reactions: [],
      status: null,
      pending: qItem.status === 'pending',
      failed: qItem.status === 'failed',
      client_id: qItem.clientId,
      error: qItem.error,
    }))
    const qIds = new Set(pendingQueued.map(x => x.client_id))
    return [...older.filter(m => !ids.has(m.id)), ...latest, ...optimistic.filter(m => !qIds.has(m.client_id)), ...pendingQueued]
  }, [older, msgsQ.data, optimistic, queued])
  useEffect(() => { if (msgsQ.data && !older.length) setHasOlder(msgsQ.data.more) }, [msgsQ.data, older.length])
  useEffect(() => {
    const serverTop = (msgsQ.data?.messages ?? []).reduce((mx, m) => (m.id > mx ? m.id : mx), 0)
    if (serverTop > 0) noteSeenMessageId(serverTop)
  }, [msgsQ.data])
  const [text, setText] = useState(''), [reply, setReply] = useState<ChatMessage | null>(null), [editing, setEditing] = useState<ChatMessage | null>(null)
  const [menu, setMenu] = useState<number | null>(null), [emojiOpen, setEmojiOpen] = useState(false), [forward, setForward] = useState<ChatMessage | null>(null), [msgInfo, setMsgInfo] = useState<{ id: number; rows: { name: string; status: string }[] } | null>(null)
  const [locOpen, setLocOpen] = useState(false), [locForm, setLocForm] = useState({ lat: 25.2532, lng: 55.2972, label: 'Viewing Entrance · Dubai', gpsStatus: '' })
  const [docOpen, setDocOpen] = useState(false), [docItems, setDocItems] = useState<{ key: string; title: string; subtitle: string; url: string }[]>([]), [docLoading, setDocLoading] = useState(false)
  const [busy, setBusy] = useState(false), [atBottom, setAtBottom] = useState(true), [newBelow, setNewBelow] = useState(0)
  const [rec, setRec] = useState<{ mr: MediaRecorder; started: number; chunks: Blob[] } | null>(null), [recTick, setRecTick] = useState(0)
  const scroller = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null), fileIn = useRef<HTMLInputElement>(null), lastTyping = useRef(0), seenTop = useRef(0)
  const info = infoQ.data
  const isAdmin = thread.role === 'admin'
  const blocked = thread.announce && !isAdmin
  const peer = thread.peer ? people.find(p => p.id === thread.peer!.id) ?? thread.peer : null

  // read receipts: everything on screen is read while the tab is visible
  const top = (msgsQ.data?.messages ?? [])[Math.max(0, (msgsQ.data?.messages?.length ?? 1) - 1)]?.id ?? 0
  useEffect(() => {
    const mark = () => { if (!document.hidden && top) void post(`/api/chat/threads/${thread.id}/read`).then(() => { void qc.invalidateQueries({ queryKey: ['chat-threads'] }); void qc.invalidateQueries({ queryKey: ['chat-unread'] }) }) }
    mark(); document.addEventListener('visibilitychange', mark); return () => document.removeEventListener('visibilitychange', mark)
  }, [top, thread.id, qc])

  // stick to the bottom like WhatsApp; count new messages when scrolled up
  useEffect(() => {
    const el = scroller.current; if (!el || !msgs.length) return
    const lastMsg = msgs[msgs.length - 1]
    const mine = lastMsg?.user_id === me?.id
    if (seenTop.current === 0 || atBottom || mine) { el.scrollTop = el.scrollHeight; setNewBelow(0) } else if ((lastMsg?.id ?? 0) > seenTop.current) setNewBelow(n => n + 1)
    if (top > 0) seenTop.current = top
  }, [top, msgs.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!rec) return; const i = window.setInterval(() => setRecTick(t => t + 1), 500); return () => clearInterval(i) }, [rec])
  useEffect(() => { input.current?.focus() }, [reply, editing])

  const refresh = () => { void qc.invalidateQueries({ queryKey: ['chat-msgs', thread.id] }); void qc.invalidateQueries({ queryKey: ['chat-threads'] }) }
  const loadOlder = async () => { const first = msgs.find(m => m.id > 0)?.id; if (!first) return; const r = await get<{ messages: ChatMessage[]; more: boolean }>(`/api/chat/threads/${thread.id}/messages`, { before: first }); const el = scroller.current, h = el?.scrollHeight ?? 0; setOlder(o => [...r.messages, ...o]); setHasOlder(r.more); requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - h }) }

  const onType = (v: string) => { setText(v); if (Date.now() - lastTyping.current > 2500 && v) { lastTyping.current = Date.now(); void post(`/api/chat/threads/${thread.id}/typing`, {}).catch(() => {}) } }

  const deliverOptimistic = async (
    kind: 'text' | 'location',
    body: string,
    opts?: { location?: { lat: number; lng: number; label?: string }; replyToId?: number | null },
  ) => {
    const clientId = crypto.randomUUID ? crypto.randomUUID() : `c-${Date.now()}-${Math.random()}`
    const createdAt = new Date().toISOString()
    const userId = me?.id ?? 0
    const userName = me?.name ?? 'You'
    const qItem: QueuedChatMessage = {
      clientId,
      threadId: thread.id,
      body,
      kind,
      location: opts?.location,
      replyToId: opts?.replyToId ?? null,
      createdAt,
      status: 'pending',
      userId,
      userName,
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await enqueueChatOutbox(qItem)
      toast.ok('Offline — message queued and will auto-send when back online')
      return
    }
    const optMsg: ChatMessage = {
      id: -Date.now(),
      user_id: userId,
      name: userName,
      kind,
      body,
      created_at: createdAt,
      edited: false,
      forwarded: false,
      file: null,
      reply: reply ? { id: reply.id, name: reply.name, body: reply.body, kind: reply.kind } : null,
      reactions: [],
      status: null,
      pending: true,
      client_id: clientId,
    }
    setOptimistic(o => [...o, optMsg])
    try {
      const res = kind === 'location' && opts?.location
        ? await post<{ id: number }>(`/api/chat/threads/${thread.id}/messages`, { kind: 'location', location: opts.location, reply_to_id: opts.replyToId ?? undefined })
        : await post<{ id: number }>(`/api/chat/threads/${thread.id}/messages`, { body, reply_to_id: opts?.replyToId ?? undefined })
      if (res?.id) noteSeenMessageId(res.id)
      setOptimistic(o => o.filter(x => x.client_id !== clientId))
      refresh()
    } catch (e: any) {
      const status = Number(e?.status ?? 0)
      if (!status || status >= 500 || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        setOptimistic(o => o.filter(x => x.client_id !== clientId))
        await enqueueChatOutbox(qItem)
        toast.ok('Connection issue — message saved to offline queue')
      } else {
        setOptimistic(o => o.map(x => (x.client_id === clientId ? { ...x, pending: false, failed: true, error: e?.message || 'Failed to send' } : x)))
        toast.error(e?.message || 'Failed to send')
      }
    }
  }

  const send = async () => {
    const body = text.trim(); if (!body || busy) return
    if (editing) {
      setBusy(true)
      try {
        await api('PATCH', `/api/chat/messages/${editing.id}`, { body })
        setText(''); setEditing(null); refresh()
      } catch (e: any) { toast.error(e.message) } finally { setBusy(false); input.current?.focus() }
      return
    }
    const replyId = reply?.id ?? null
    setText(''); setReply(null)
    await deliverOptimistic('text', body, { replyToId: replyId })
    input.current?.focus()
  }

  const retryFailed = async (m: ChatMessage) => {
    if (!m.client_id) return
    const qMatch = queued.find(x => x.clientId === m.client_id)
    if (qMatch) {
      await enqueueChatOutbox({ ...qMatch, status: 'pending', error: undefined })
      await flushChatOutbox(() => refresh())
      return
    }
    setOptimistic(o => o.filter(x => x.client_id !== m.client_id))
    const loc = m.kind === 'location' ? parseLocationPayload(m.body) : null
    await deliverOptimistic(m.kind === 'location' ? 'location' : 'text', m.body, {
      location: loc ?? undefined,
      replyToId: m.reply?.id ?? null,
    })
  }

  const discardFailed = async (m: ChatMessage) => {
    if (!m.client_id) return
    setOptimistic(o => o.filter(x => x.client_id !== m.client_id))
    await removeChatOutboxItem(m.client_id)
  }

  const openLocationModal = () => {
    setLocForm({ lat: 25.2532, lng: 55.2972, label: 'Viewing Entrance · Dubai', gpsStatus: 'Checking GPS…' })
    setLocOpen(true)
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          setLocForm(f => ({
            ...f,
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            gpsStatus: `GPS lock (±${Math.round(pos.coords.accuracy)}m)`,
          }))
        },
        () => {
          setLocForm(f => ({ ...f, gpsStatus: 'GPS unavailable — using Dubai default (editable)' }))
        },
        { enableHighAccuracy: true, timeout: 6000 },
      )
    } else {
      setLocForm(f => ({ ...f, gpsStatus: 'Using Dubai default coordinates' }))
    }
  }

  const sendLocation = async () => {
    const lat = Number(locForm.lat), lng = Number(locForm.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      toast.error('Enter valid latitude (-90..90) and longitude (-180..180)')
      return
    }
    const label = locForm.label.trim() || 'Dubai Live Location'
    setLocOpen(false)
    await deliverOptimistic('location', JSON.stringify({ lat, lng, label }), { location: { lat, lng, label } })
  }

  const openDocumentModal = async () => {
    setDocOpen(true)
    setDocLoading(true)
    try {
      const [studioRes, attRes, utilRes] = await Promise.allSettled([
        get<{ rows: any[] }>('/api/e/studio_documents', { pageSize: 20 }),
        get<{ rows: any[] }>('/api/e/attachments', { pageSize: 20 }),
        get<{ docs?: any[] }>('/api/utilities/docs'),
      ])
      const items: { key: string; title: string; subtitle: string; url: string }[] = []
      if (utilRes.status === 'fulfilled' && Array.isArray(utilRes.value?.docs)) {
        for (const d of utilRes.value.docs) {
          items.push({ key: `util-${d.id}`, title: d.title || `Utility Doc #${d.id}`, subtitle: 'Word Studio / Utilities', url: `/utilities/docs/${d.id}` })
        }
      }
      if (studioRes.status === 'fulfilled' && Array.isArray(studioRes.value?.rows)) {
        for (const d of studioRes.value.rows) {
          items.push({ key: `studio-${d.id}`, title: d.title || d.doc_no || `Document #${d.id}`, subtitle: `Studio · ${d.doc_no || d.category || 'Document'}`, url: `/studio/${d.id}` })
        }
      }
      if (attRes.status === 'fulfilled' && Array.isArray(attRes.value?.rows)) {
        for (const a of attRes.value.rows) {
          items.push({ key: `att-${a.id}`, title: a.file_name || `File #${a.id}`, subtitle: `Library · ${a.category || 'Attachment'}`, url: `/api/files/${a.id}/download` })
        }
      }
      setDocItems(items)
    } finally {
      setDocLoading(false)
    }
  }
  const sendFiles = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      try { await upload([f], { caption: text.trim() || undefined, reply_to_id: reply?.id }, `/api/chat/threads/${thread.id}/upload`); setText(''); setReply(null) } catch (e: any) { toast.error(`${f.name}: ${e.message}`) }
    }
    refresh()
  }
  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream), chunks: Blob[] = []
      mr.ondataavailable = e => chunks.push(e.data)
      mr.start(); setRec({ mr, started: Date.now(), chunks })
      void post(`/api/chat/threads/${thread.id}/typing`, { recording: true }).catch(() => {})
    } catch { toast.error('Microphone is not available. Allow microphone access in the browser.') }
  }
  const stopRec = (keep: boolean) => {
    if (!rec) return
    const { mr, chunks } = rec
    mr.onstop = () => { mr.stream.getTracks().forEach(t => t.stop()); if (keep && chunks.length) void sendFiles([new File(chunks, `voice-${Date.now()}.webm`, { type: mr.mimeType || 'audio/webm' })]) }
    mr.stop(); setRec(null)
  }

  const react = async (m: ChatMessage, emoji: string | null) => { setMenu(null); try { await post(`/api/chat/messages/${m.id}/react`, { emoji }); refresh() } catch (e: any) { toast.error(e.message) } }
  const remove = async (m: ChatMessage) => { setMenu(null); if (!(await dlg.confirm({ title: 'Delete message for everyone?', danger: true, ok: 'Delete for everyone' }))) return; try { await del(`/api/chat/messages/${m.id}`); refresh() } catch (e: any) { toast.error(e.message) } }
  const report = async () => { try { await post(`/api/chat/threads/${thread.id}/attendance-report`); refresh(); toast.ok('Attendance report sent') } catch (e: any) { toast.error(e.message) } }
  const subtitle = typing ? `${thread.kind === 'group' ? typing.name.split(' ')[0] + ' is ' : ''}${typing.recording ? 'recording audio…' : 'typing…'}` : thread.kind === 'dm' ? lastSeenText(peer) : info ? info.members.map(m => m.id === me?.id ? 'You' : m.name.split(' ')[0]).join(', ') : `${thread.members} members`

  let prevDay = '', prevUser = 0
  return (
    <section className={`flex min-h-0 ${showInfo ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-[#e5e5e5] bg-white/95 px-4 py-2.5">
          <span className="md:hidden"><button type="button" className="swk-tbtn" aria-label="Back to chats" onClick={onBack}><ArrowLeft size={17} /></button></span>
          <button type="button" className="flex min-w-0 flex-1 items-center gap-3 border-0 bg-transparent p-0 text-left" onClick={() => setShowInfo(!showInfo)} aria-label="Chat info">
            <Avatar name={thread.title} email={thread.peer?.email} group={thread.kind === 'group'} size={42} online={thread.kind === 'dm' && peer?.online} />
            <span className="min-w-0"><b className="block truncate text-[15.5px] font-medium text-[#121212]">{thread.title}</b><span className={`block truncate text-[12.5px] ${typing || (thread.kind === 'dm' && peer?.online) ? 'text-[#0e9f6e]' : 'text-[#8b8b8b]'}`}>{subtitle}</span></span>
          </button>
          {thread.kind === 'group' && info?.can_report && !showInfo && <button type="button" className="web-btn light hidden sm:inline-flex" style={{ height: 36, padding: '0 14px' }} onClick={() => void report()} title="Post today's attendance in this group"><ClipboardList size={14} /> Attendance report</button>}
          <button type="button" className="swk-tbtn" aria-label="Chat info" onClick={() => setShowInfo(!showInfo)}><Info size={17} /></button>
        </header>

        <div ref={scroller} onScroll={e => { const el = e.currentTarget; const b = el.scrollHeight - el.scrollTop - el.clientHeight < 80; setAtBottom(b); if (b) setNewBelow(0) }}
          className="relative min-h-0 flex-1 overflow-y-auto px-[4%] py-4" style={{ background: '#f2f5f7', backgroundImage: 'repeating-linear-gradient(to right, rgba(11,25,41,0.035) 0px, rgba(11,25,41,0.035) 1px, transparent 1px, transparent 24px)' }}>
          {hasOlder && <div className="mb-3 text-center"><button type="button" className="web-pill border-0" style={{ cursor: 'pointer' }} onClick={() => void loadOlder()}>Load earlier messages</button></div>}
          {msgsQ.isLoading && <div className="flex justify-center p-8"><Loader2 className="animate-spin text-[#8b8b8b]" /></div>}
          <div className="mx-auto mb-4 max-w-md rounded-xl bg-[#fff7d6] px-3 py-2 text-center text-[11.5px] text-[#6b5a14]">🔒 Messages in Inside stay within SWK OS. Only people in this chat can read them.</div>
          {msgs.map(m => {
            const d = dayKey(m.created_at), showDay = d !== prevDay, mine = m.user_id === me?.id, first = showDay || prevUser !== m.user_id || m.kind === 'system'
            prevDay = d; prevUser = m.kind === 'system' ? 0 : m.user_id
            const msgKey = m.client_id ?? m.id
            if (m.kind === 'system') return <Fragment key={msgKey}>{showDay && <DayPill iso={m.created_at} />}<div className="my-2 text-center"><span className="inline-block rounded-lg bg-white/90 px-3 py-1 text-[12px] text-[#4a4a4a] shadow-sm">{m.body}</span></div></Fragment>
            return (
              <Fragment key={msgKey}>
                {showDay && <DayPill iso={m.created_at} />}
                <div className={`group flex ${mine ? 'justify-end' : 'justify-start'} ${first ? 'mt-2' : 'mt-0.5'}`}>
                  {thread.kind === 'group' && !mine && <span className="mr-1.5 w-8 shrink-0">{first && <Avatar name={m.name} email={people.find(p => p.id === m.user_id)?.email} size={30} />}</span>}
                  <div className={`relative max-w-[min(560px,78%)] rounded-2xl px-2.5 pb-1.5 pt-1.5 text-[14.2px] leading-[1.42] shadow-[0_1px_0.5px_rgba(11,20,26,.13)] ${mine ? 'bg-[#dcfce9] text-[#121212]' : 'bg-white text-[#121212]'} ${first ? (mine ? 'rounded-tr-md' : 'rounded-tl-md') : ''} ${m.kind === 'report' || m.kind === 'automation' ? 'ring-1 ring-[#0e9f6e]/40' : ''} ${m.pending ? 'opacity-85' : ''}`}>
                    {thread.kind === 'group' && !mine && first && <div className="mb-0.5 text-[12.5px] font-semibold" style={{ color: colorFor(m.user_id) }}>{m.name}</div>}
                    {(m.kind === 'report' || m.kind === 'automation') && <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-[#121212] px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#51fec0]"><ClipboardList size={12} />{m.kind === 'report' ? 'Attendance report' : 'Automation'}</div>}
                    {m.forwarded && <div className="mb-0.5 flex items-center gap-1 text-[11.5px] italic text-[#8b8b8b]"><Forward size={12} />Forwarded</div>}
                    {m.reply && <button type="button" className="mb-1 block w-full rounded-lg border-0 border-l-4 bg-black/5 px-2.5 py-1.5 text-left" style={{ borderLeftColor: colorFor(msgs.find(x => x.id === m.reply!.id)?.user_id ?? 0) }} onClick={() => document.getElementById(`msg-${m.reply!.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                      <span className="block text-[12px] font-semibold text-[#0e9f6e]">{m.reply.name}</span><span className="line-clamp-2 text-[12.5px] text-[#4a4a4a]">{m.reply.body.replace(/\*/g, '')}</span></button>}
                    <div id={`msg-${m.id}`}>
                      {m.kind === 'deleted' ? <span className="italic text-[#8b8b8b]">🚫 {mine ? 'You deleted this message' : 'This message was deleted'}</span> : m.kind === 'location' ? (
                        <LocationPinCard body={m.body} />
                      ) : <>
                        {m.file && m.kind === 'image' && <a href={m.file.url} target="_blank" rel="noopener noreferrer" className="mb-1 block overflow-hidden rounded-xl"><img src={m.file.url} alt={m.file.name} loading="lazy" className="max-h-[320px] w-full max-w-[320px] object-cover" /></a>}
                        {m.file && m.kind === 'video' && <video src={m.file.url} controls className="mb-1 max-h-[320px] max-w-[320px] rounded-xl" />}
                        {m.file && m.kind === 'voice' && <div className="flex items-center gap-2 py-1"><Mic size={16} className="text-[#0e9f6e]" /><audio src={m.file.url} controls preload="metadata" className="h-9 w-[240px] max-w-full" /></div>}
                        {m.file && m.kind === 'file' && <a href={`${m.file.url}?download=1`} className="mb-1 flex items-center gap-3 rounded-xl bg-black/5 px-3 py-2.5 no-underline"><FileText size={26} className="text-[#dc2626]" /><span className="min-w-0 flex-1"><b className="block truncate text-[13.5px] font-medium text-[#121212]">{m.file.name}</b><small className="text-[#737373]">{fmtSize(m.file.size)} · {m.file.name.split('.').pop()?.toUpperCase()}</small></span><Download size={17} className="text-[#737373]" /></a>}
                        {m.body && <span className="whitespace-pre-wrap break-words"><Rich text={m.body} /></span>}
                      </>}
                      <span className="float-right ml-3 mt-1.5 flex translate-y-0.5 items-center gap-1 text-[11px] text-[#8b8b8b]">{m.edited && <span>Edited</span>}{timeOf(m.created_at)}{mine && m.kind !== 'deleted' && <Ticks status={m.status} pending={m.pending} failed={m.failed} />}</span>
                    </div>
                    {(m.failed || (m.pending && m.client_id)) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-black/10 pt-1 text-[11.5px]">
                        <span className={m.failed ? 'text-[#dc2626]' : 'text-[#737373]'}>{m.failed ? (m.error || 'Not sent') : 'Queued offline'}</span>
                        <button type="button" className="inline-flex items-center gap-1 rounded border-0 bg-white/80 px-2 py-0.5 text-[11px] font-medium text-[#121212] hover:bg-white" onClick={() => void retryFailed(m)}><RefreshCw size={11} /> Retry</button>
                        <button type="button" className="rounded border-0 bg-transparent px-1.5 py-0.5 text-[11px] text-[#dc2626] hover:bg-black/5" onClick={() => void discardFailed(m)}>Remove</button>
                      </div>
                    )}
                    {m.reactions.length > 0 && (
                      <div className={`absolute -bottom-3 flex gap-0.5 rounded-full border border-black/5 bg-white px-1.5 py-0.5 text-[13px] shadow-sm ${mine ? 'right-2' : 'left-2'}`}>
                        {m.reactions.map(r => <button key={r.emoji} type="button" title={r.names.join(', ')} onClick={() => void react(m, r.mine ? null : r.emoji)} className={`border-0 bg-transparent p-0 ${r.mine ? 'opacity-100' : 'opacity-90'}`}>{r.emoji}{r.count > 1 && <span className="ml-0.5 text-[11px] text-[#737373]">{r.count}</span>}</button>)}
                      </div>
                    )}
                    {m.kind !== 'deleted' && !m.pending && !m.failed && (
                      <button type="button" aria-label="Message options" className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full border-0 bg-gradient-to-l from-white via-white to-transparent text-[#8b8b8b] opacity-0 group-hover:opacity-100 focus-visible:opacity-100" style={mine ? { background: 'linear-gradient(to left,#dcfce9,#dcfce9,transparent)' } : undefined} onClick={() => setMenu(menu === m.id ? null : m.id)}><ChevronDown size={15} /></button>
                    )}
                    {menu === m.id && !m.pending && !m.failed && (
                      <Menu onClose={() => setMenu(null)} className={`top-7 ${mine ? 'right-0' : 'left-0'}`}>
                        <div className="mb-1 flex justify-between gap-0.5 rounded-xl bg-[#f7f7f7] p-1">{REACTIONS.map(e => <button key={e} type="button" aria-label={`React ${e}`} className="rounded-lg border-0 bg-transparent p-1 text-[19px] transition-transform hover:scale-125" onClick={() => void react(m, m.reactions.find(r => r.mine)?.emoji === e ? null : e)}>{e}</button>)}</div>
                        <MenuItem icon={CornerUpLeft} onClick={() => { setReply(m); setEditing(null); setMenu(null) }}>Reply</MenuItem>
                        {m.body && <MenuItem icon={Copy} onClick={() => { void navigator.clipboard.writeText(m.body); setMenu(null); toast.ok('Copied') }}>Copy</MenuItem>}
                        <MenuItem icon={Forward} onClick={() => { setForward(m); setMenu(null) }}>Forward</MenuItem>
                        {mine && m.kind === 'text' && Date.now() - Date.parse(m.created_at) < 15 * 60_000 && <MenuItem icon={Pencil} onClick={() => { setEditing(m); setReply(null); setText(m.body); setMenu(null) }}>Edit</MenuItem>}
                        {mine && <MenuItem icon={Info} onClick={async () => { setMenu(null); setMsgInfo({ id: m.id, rows: await get(`/api/chat/messages/${m.id}/info`) }) }}>Message info</MenuItem>}
                        {(mine || isAdmin) && <MenuItem icon={Trash2} danger onClick={() => void remove(m)}>Delete for everyone</MenuItem>}
                      </Menu>
                    )}
                  </div>
                </div>
                {m.reactions.length > 0 && <div className="h-3" />}
              </Fragment>
            )
          })}
          {!atBottom && <button type="button" aria-label="Scroll to latest" onClick={() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); setNewBelow(0) }}
            className="sticky bottom-2 ml-auto flex size-11 items-center justify-center rounded-full border-0 bg-white text-[#4a4a4a] shadow-lg">
            <ChevronDown size={20} />{newBelow > 0 && <span className="absolute -top-1.5 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0e9f6e] px-1 text-[11px] font-semibold text-white">{newBelow}</span>}</button>}
        </div>

        {/* composer */}
        {blocked ? (
          <div className="border-t border-[#e5e5e5] bg-[#f7f7f7] px-4 py-4 text-center text-[13px] text-[#737373]"><Megaphone size={14} className="mr-1.5 inline" />Only admins can send messages in this group</div>
        ) : (
          <div className="border-t border-[#e5e5e5] bg-[#f7f7f7] px-3 py-2.5" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) void sendFiles(e.dataTransfer.files) }}>
            {(reply || editing) && (
              <div className="mb-2 flex items-center gap-3 rounded-xl border border-[#0e9f6e]/30 bg-[#e8fff6] px-3 py-2">
                <div className="min-w-0 flex-1"><b className="block text-[12.5px] text-[#0e9f6e]">{editing ? 'Edit message' : reply!.user_id === me?.id ? 'You' : reply!.name}</b><span className="line-clamp-1 text-[12.5px] text-[#4a4a4a]">{previewOf(editing ?? reply!)}</span></div>
                <button type="button" aria-label="Cancel" className="flex size-7 items-center justify-center rounded-full border-0 bg-transparent text-[#737373] hover:bg-[#f5f5f5]" onClick={() => { setReply(null); if (editing) { setEditing(null); setText('') } }}><X size={15} /></button>
              </div>
            )}
            {rec ? (
              <div className="flex items-center gap-3 rounded-full bg-white px-3 py-2">
                <button type="button" aria-label="Cancel recording" className="flex size-9 items-center justify-center rounded-full border-0 bg-transparent text-[#dc2626] hover:bg-[#fdeaea]" onClick={() => stopRec(false)}><Trash2 size={18} /></button>
                <span className="size-2.5 animate-pulse rounded-full bg-[#dc2626]" /><span className="flex-1 font-mono text-[14px] tabular-nums text-[#121212]" data-tick={recTick}>{new Date(Date.now() - rec.started).toISOString().slice(14, 19)}</span>
                <button type="button" aria-label="Send voice message" className="flex size-10 items-center justify-center rounded-full border-0 bg-[#0e9f6e] text-white" onClick={() => stopRec(true)}><Send size={17} /></button>
              </div>
            ) : (
              <div className="relative flex items-end gap-1.5">
                <button type="button" aria-label="Emoji" className="swk-tbtn" style={{ background: 'transparent', border: 0 }} onClick={() => setEmojiOpen(o => !o)}><Smile size={20} /></button>
                {emojiOpen && <Menu onClose={() => setEmojiOpen(false)} className="bottom-12 left-0 grid w-[300px] grid-cols-8 gap-0.5">{EMOJI.map(e => <button key={e} type="button" className="rounded-lg border-0 bg-transparent p-1 text-[20px] hover:bg-[#f5f5f5]" onClick={() => { setText(t => t + e); input.current?.focus() }}>{e}</button>)}</Menu>}
                <button type="button" aria-label="Attach file or photo" title="Attach file or photo" className="swk-tbtn" style={{ background: 'transparent', border: 0 }} onClick={() => fileIn.current?.click()} disabled={!!editing}><Paperclip size={19} /></button>
                <button type="button" aria-label="Share live location" title="Share live location pin" className="swk-tbtn" style={{ background: 'transparent', border: 0 }} onClick={openLocationModal} disabled={!!editing}><MapPin size={19} /></button>
                <button type="button" aria-label="Share document" title="Share OS / Utility document" className="swk-tbtn hidden sm:grid" style={{ background: 'transparent', border: 0 }} onClick={() => void openDocumentModal()} disabled={!!editing}><FolderOpen size={19} /></button>
                <input ref={fileIn} type="file" multiple hidden accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv" onChange={e => { if (e.target.files?.length) void sendFiles(e.target.files); e.target.value = '' }} />
                <textarea ref={input} rows={1} value={text} onChange={e => onType(e.target.value)} placeholder="Type a message" aria-label="Message"
                  onPaste={e => { const f = Array.from(e.clipboardData.files); if (f.length) { e.preventDefault(); void sendFiles(f) } }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } if (e.key === 'Escape') { setReply(null); setEditing(null) } }}
                  className="max-h-36 min-h-[42px] flex-1 resize-none rounded-[22px] border-0 bg-white px-4 py-[10px] text-[14.5px] leading-[1.4] outline-none focus:ring-2 focus:ring-[#51fec0]/50 no-focus-outline"
                  style={{ height: Math.min(144, 42 + Math.max(0, text.split('\n').length - 1) * 20) }} />
                {text.trim() ? (
                  <button type="button" aria-label={editing ? 'Save edit' : 'Send'} disabled={busy} className="flex size-[42px] shrink-0 items-center justify-center rounded-full border-0 bg-[#0e9f6e] text-white transition-transform active:scale-95" onClick={() => void send()}>{editing ? <Check size={19} /> : <Send size={18} />}</button>
                ) : (
                  <button type="button" aria-label="Record voice message" className="flex size-[42px] shrink-0 items-center justify-center rounded-full border-0 bg-[#121212] text-[#51fec0]" onClick={() => void startRec()}><Mic size={19} /></button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showInfo && info && <InfoPanel info={info} thread={thread} people={people} onClose={() => setShowInfo(false)} onReport={() => void report()} />}

      <Modal open={locOpen} onClose={() => setLocOpen(false)} title="Share Live Location Pin" width={420}
        footer={<><button type="button" className="btn outline" onClick={() => setLocOpen(false)}>Cancel</button><button type="button" className="web-btn" onClick={() => void sendLocation()}><MapPin size={15} /> Send Location Pin</button></>}>
        <div className="grid gap-3">
          {locForm.gpsStatus && <div className="rounded-xl bg-[#f5f5f5] px-3 py-2 text-[12.5px] text-[#4a4a4a]">{locForm.gpsStatus}</div>}
          <label><span className="label">Location label</span><input className="input" value={locForm.label} maxLength={160} onChange={e => setLocForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Marina Gate 2 Entrance" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label><span className="label">Latitude</span><input className="input" type="number" step="0.000001" value={locForm.lat} onChange={e => setLocForm(f => ({ ...f, lat: Number(e.target.value) }))} /></label>
            <label><span className="label">Longitude</span><input className="input" type="number" step="0.000001" value={locForm.lng} onChange={e => setLocForm(f => ({ ...f, lng: Number(e.target.value) }))} /></label>
          </div>
        </div>
      </Modal>
      <Modal open={docOpen} onClose={() => setDocOpen(false)} title="Share OS / Utility Document" width={460}>
        <div className="max-h-[55vh] overflow-y-auto">
          {docLoading && <div className="flex justify-center p-6"><Loader2 className="animate-spin text-[#8b8b8b]" /></div>}
          {!docLoading && !docItems.length && <div className="p-6 text-center text-[13px] text-[#737373]">No saved Studio, Utility, or Library documents found yet.</div>}
          {docItems.map(d => (
            <button key={d.key} type="button" className="flex w-full items-center gap-3 rounded-xl border-0 bg-transparent px-3 py-2.5 text-left hover:bg-[#f7f7f7]"
              onClick={() => {
                setDocOpen(false)
                const fullUrl = d.url.startsWith('http') ? d.url : `${window.location.origin}${d.url}`
                void deliverOptimistic('text', `📄 *${d.title}*\n${fullUrl}`)
              }}>
              <FileText size={20} className="shrink-0 text-[#0e9f6e]" />
              <span className="min-w-0 flex-1"><b className="block truncate text-[14px] font-medium text-[#121212]">{d.title}</b><small className="text-[#8b8b8b]">{d.subtitle}</small></span>
            </button>
          ))}
        </div>
      </Modal>
      <Modal open={!!forward} onClose={() => setForward(null)} title="Forward message to" width={440}>
        <div className="max-h-[50vh] overflow-y-auto">{threads.filter(t => !t.archived).map(t => (
          <button key={t.id} type="button" className="flex w-full items-center gap-3 rounded-xl border-0 bg-transparent px-2 py-2.5 text-left hover:bg-[#f7f7f7]" disabled={t.announce && t.role !== 'admin'}
            onClick={async () => { try { await post(`/api/chat/messages/${forward!.id}/forward`, { thread_ids: [t.id] }); toast.ok(`Forwarded to ${t.title}`); setForward(null); void qc.invalidateQueries({ queryKey: ['chat-threads'] }) } catch (e: any) { toast.error(e.message) } }}>
            <Avatar name={t.title} email={t.peer?.email} group={t.kind === 'group'} size={40} /><b className="truncate text-[14px] font-medium">{t.title}</b>
          </button>))}</div>
      </Modal>
      <Modal open={!!msgInfo} onClose={() => setMsgInfo(null)} title="Message info" width={400}>
        {(['read', 'delivered', 'sent'] as const).map(s => { const rows = msgInfo?.rows.filter(r => r.status === s) ?? []; return rows.length ? (
          <div key={s} className="mb-4"><div className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#737373]"><Ticks status={s} />{s === 'read' ? 'Read by' : s === 'delivered' ? 'Delivered to' : 'Not delivered yet'}</div>{rows.map(r => <div key={r.name} className="py-1 text-[14px]">{r.name}</div>)}</div>) : null })}
      </Modal>
    </section>
  )
}

const DayPill = ({ iso }: { iso: string }) => <div className="sticky top-1 z-10 my-3 text-center"><span className="inline-block rounded-lg bg-white px-3 py-1 text-[11.5px] font-medium uppercase tracking-[0.08em] text-[#4a4a4a] shadow-sm">{dayLabel(iso)}</span></div>

function InfoPanel({ info, thread, people, onClose, onReport }: { info: Info; thread: Thread; people: Person[]; onClose: () => void; onReport: () => void }) {
  const toast = useToast(), qc = useQueryClient(), dlg = useDialogs(), { me } = useMeta()
  const [adding, setAdding] = useState(false), [pick, setPick] = useState<number[]>([]), [memberMenu, setMemberMenu] = useState<number | null>(null)
  const isAdmin = thread.role === 'admin', group = info.kind === 'group'
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['chat-info', thread.id] }); void qc.invalidateQueries({ queryKey: ['chat-threads'] }); void qc.invalidateQueries({ queryKey: ['chat-msgs', thread.id] }) }
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); refresh() } catch (e: any) { toast.error(e.message) } }
  const edit = async (field: 'title' | 'description') => { const v = await dlg.prompt({ title: field === 'title' ? 'Group name' : 'Group description', label: field === 'title' ? 'Name' : 'Description', initial: (field === 'title' ? info.title : info.description) ?? '', multiline: field === 'description', required: field === 'title' }); if (v !== null) await run(() => api('PATCH', `/api/chat/threads/${thread.id}`, { [field]: v })) }
  const peer = info.members.find(m => m.id !== me?.id)
  const notIn = people.filter(p => !info.members.some(m => m.id === p.id))
  return (
    <aside className="absolute inset-0 z-30 flex min-h-0 flex-col overflow-y-auto border-l border-[#e5e5e5] bg-[#f7f7f7] lg:static" aria-label="Chat info">
      <header className="flex items-center gap-3 bg-white px-4 py-3.5"><button type="button" className="swk-tbtn" aria-label="Close info" onClick={onClose}><X size={17} /></button><b className="text-[15px] font-medium">{group ? 'Group info' : 'Contact info'}</b></header>
      <div className="flex flex-col items-center gap-2 bg-white px-6 pb-6 pt-4 text-center">
        <Avatar name={group ? info.title ?? '' : peer?.name ?? ''} email={peer?.email} group={group} size={112} />
        <h2 className="m-0 mt-2 text-[22px] font-medium tracking-[-0.03em]">{group ? info.title : peer?.name}{group && isAdmin && <button type="button" aria-label="Edit group name" className="ml-2 border-0 bg-transparent text-[#8b8b8b] hover:text-[#0e9f6e]" onClick={() => void edit('title')}><Pencil size={15} /></button>}</h2>
        <p className="m-0 text-[13px] text-[#737373]">{group ? `Group · ${info.members.length} members` : peer?.designation || peer?.email}</p>
        {!group && <p className="m-0 text-[12.5px] text-[#0e9f6e]">{lastSeenText(people.find(p => p.id === peer?.id) ?? peer)}</p>}
      </div>
      {group && (
        <div className="mt-2 bg-white px-6 py-4">
          <div className="flex items-center"><span className="web-eyebrow flex-1">Description</span>{isAdmin && <button type="button" className="border-0 bg-transparent text-[#8b8b8b] hover:text-[#0e9f6e]" aria-label="Edit description" onClick={() => void edit('description')}><Pencil size={14} /></button>}</div>
          <p className="m-0 mt-1.5 whitespace-pre-wrap text-[14px] text-[#121212]">{info.description || <span className="text-[#8b8b8b]">No description</span>}</p>
          <p className="m-0 mt-2 text-[12px] text-[#8b8b8b]">Created by {info.created_by}, {dayLabel(info.created_at)}</p>
        </div>
      )}
      <div className="mt-2 bg-white px-2 py-2">
        <button type="button" className="flex w-full items-center gap-4 rounded-xl border-0 bg-transparent px-4 py-3 text-left text-[14px] hover:bg-[#f7f7f7]" onClick={() => void run(() => post(`/api/chat/threads/${thread.id}/prefs`, { muted: !thread.muted }))}><BellOff size={18} className="text-[#737373]" />{thread.muted ? 'Unmute notifications' : 'Mute notifications'}</button>
        <button type="button" className="flex w-full items-center gap-4 rounded-xl border-0 bg-transparent px-4 py-3 text-left text-[14px] hover:bg-[#f7f7f7]" onClick={() => void run(() => post(`/api/chat/threads/${thread.id}/prefs`, { pinned: !thread.pinned }))}><Pin size={18} className="text-[#737373]" />{thread.pinned ? 'Unpin chat' : 'Pin chat'}</button>
        {group && isAdmin && <label className="flex w-full cursor-pointer items-center gap-4 rounded-xl px-4 py-3 text-[14px] hover:bg-[#f7f7f7]"><Megaphone size={18} className="text-[#737373]" /><span className="flex-1">Only admins can send messages</span><input type="checkbox" checked={info.announce} onChange={e => void run(() => api('PATCH', `/api/chat/threads/${thread.id}`, { announce: e.target.checked }))} className="size-4 accent-[#0e9f6e]" /></label>}
        {group && info.can_report && <button type="button" className="flex w-full items-center gap-4 rounded-xl border-0 bg-transparent px-4 py-3 text-left text-[14px] hover:bg-[#f7f7f7]" onClick={onReport}><ClipboardList size={18} className="text-[#0e9f6e]" />Send today's attendance report</button>}
      </div>
      {info.media.length > 0 && (
        <div className="mt-2 bg-white px-6 py-4">
          <div className="web-eyebrow mb-3">Media, docs & voice · {info.media.length}</div>
          <div className="grid grid-cols-3 gap-1.5">{info.media.slice(0, 9).map(f => f.mime.startsWith('image/') ? <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" className="aspect-square overflow-hidden rounded-lg bg-[#f5f5f5]"><img src={f.url} alt={f.name} className="size-full object-cover" loading="lazy" /></a> : <a key={f.id} href={`${f.url}?download=1`} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg bg-[#f5f5f5] p-2 text-center no-underline">{f.mime.startsWith('audio/') ? <Mic size={20} className="text-[#0e9f6e]" /> : <FileText size={20} className="text-[#dc2626]" />}<span className="line-clamp-2 text-[10px] text-[#4a4a4a]">{f.name}</span></a>)}</div>
        </div>
      )}
      {group && (
        <div className="mt-2 bg-white py-3">
          <div className="web-eyebrow px-6 pb-2">{info.members.length} members</div>
          {isAdmin && <button type="button" className="flex w-full items-center gap-4 border-0 bg-transparent px-6 py-2.5 text-left text-[14px] hover:bg-[#f7f7f7]" onClick={() => { setPick([]); setAdding(true) }}><span className="flex size-10 items-center justify-center rounded-full bg-[#0e9f6e] text-white"><UserPlus size={18} /></span>Add members</button>}
          {info.members.map(m => (
            <div key={m.id} className="group relative flex items-center gap-3 px-6 py-2.5 hover:bg-[#f7f7f7]">
              <Avatar name={m.name} email={m.email} size={40} online={m.online} />
              <span className="min-w-0 flex-1"><b className="block truncate text-[14px] font-medium">{m.id === me?.id ? 'You' : m.name}</b><small className="block truncate text-[#8b8b8b]">{m.designation || lastSeenText(m)}</small></span>
              {m.role === 'admin' && <span className="web-pill" style={{ height: 22, fontSize: 9.5 }}><Crown size={11} />Admin</span>}
              {isAdmin && m.id !== me?.id && <button type="button" aria-label={`Options for ${m.name}`} className="flex size-7 items-center justify-center rounded-full border-0 bg-transparent text-[#8b8b8b] opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => setMemberMenu(memberMenu === m.id ? null : m.id)}><MoreVertical size={15} /></button>}
              {memberMenu === m.id && <Menu onClose={() => setMemberMenu(null)} className="right-6 top-12">
                <MenuItem icon={Crown} onClick={() => { setMemberMenu(null); void run(() => post(`/api/chat/threads/${thread.id}/members/${m.id}/role`, { admin: m.role !== 'admin' })) }}>{m.role === 'admin' ? 'Dismiss as admin' : 'Make group admin'}</MenuItem>
                <MenuItem icon={X} danger onClick={async () => { setMemberMenu(null); if (await dlg.confirm({ title: `Remove ${m.name}?`, danger: true, ok: 'Remove' })) void run(() => del(`/api/chat/threads/${thread.id}/members/${m.id}`)) }}>Remove from group</MenuItem>
              </Menu>}
            </div>
          ))}
          <button type="button" className="mt-2 flex w-full items-center gap-4 border-0 bg-transparent px-6 py-3 text-left text-[14px] text-[#dc2626] hover:bg-[#fdeaea]" onClick={async () => { if (await dlg.confirm({ title: `Exit "${info.title}"?`, danger: true, ok: 'Exit group' })) { await run(() => del(`/api/chat/threads/${thread.id}/members/${me!.id}`)); onClose() } }}><LogOut size={18} />Exit group</button>
        </div>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="Add members" width={440} footer={<button className="web-btn" disabled={!pick.length} onClick={() => void run(() => post(`/api/chat/threads/${thread.id}/members`, { user_ids: pick })).then(() => setAdding(false))}>Add {pick.length || ''}</button>}>
        <div className="max-h-[50vh] overflow-y-auto">{notIn.length ? notIn.map(p => { const on = pick.includes(p.id); return (
          <button key={p.id} type="button" aria-pressed={on} className="flex w-full items-center gap-3 rounded-xl border-0 bg-transparent px-2 py-2.5 text-left hover:bg-[#f7f7f7]" onClick={() => setPick(c => on ? c.filter(x => x !== p.id) : [...c, p.id])}>
            <Avatar name={p.name} email={p.email} size={40} /><b className="flex-1 truncate text-[14px] font-medium">{p.name}</b><span className={`flex size-6 items-center justify-center rounded-full border-2 ${on ? 'border-[#0e9f6e] bg-[#0e9f6e] text-white' : 'border-[#cfcfcf]'}`}>{on && <Check size={14} />}</span>
          </button>) }) : <p className="text-[13px] text-[#737373]">Everyone is already in this group.</p>}</div>
      </Modal>
    </aside>
  )
}

export default ChatPage
