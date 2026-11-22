import { useEffect,useRef,useState } from 'react'
import { Link,useLocation,useNavigate } from 'react-router-dom'
import { useQuery,useQueryClient } from '@tanstack/react-query'
import { AnimatePresence,motion } from 'motion/react'
import { MessagesSquare,X } from 'lucide-react'
import { get } from '../lib/api'
import { useMeta } from '../lib/meta'
import { chatState,chime,desktopAlert,previewOf,subscribeChat,type ChatEvent } from '../lib/chatLive'
import { teamProfileByEmail } from '@shared/swk-team-profiles'

type Banner = { key: number; thread_id: number; title: string; sender: string; text: string; group: boolean; user_id: number }

/**
 * WhatsApp-style alerts for Inside, mounted once in the shell: a chime, a banner that slides in with sender and preview,
 * a desktop notification when the tab is in the background, and the unread count in the tab title and top bar.
 * Muted chats and the chat that is open on screen stay silent.
 */
export function ChatNotifier() {
  const qc = useQueryClient(), nav = useNavigate(), loc = useLocation()
  const [banners, setBanners] = useState<Banner[]>([])
  const { me } = useMeta(), meId = useRef(me?.id)
  meId.current = me?.id
  const unread = useQuery({ queryKey: ['chat-unread'], queryFn: () => get<{ unread: number }>('/api/chat/unread'), refetchInterval: 60000 }).data?.unread ?? 0
  const people = useQuery({ queryKey: ['chat-people'], queryFn: () => get<{ id: number; email: string }[]>('/api/chat/people'), staleTime: 300000 }).data

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, '')
    document.title = unread ? `(${unread > 99 ? '99+' : unread}) ${base}` : base
  }, [unread, loc.pathname])

  useEffect(() => subscribeChat((e: ChatEvent) => {
    if (e.type === 'presence') { void qc.invalidateQueries({ queryKey: ['chat-people'] }); return }
    if (e.type === 'typing') return
    void qc.invalidateQueries({ queryKey: ['chat-unread'] })
    if (e.type !== 'message') return
    if (e.message.user_id === meId.current || e.message.kind === 'system') return
    const watching = chatState.activeChat === e.thread_id && !document.hidden
    if (e.muted || watching) return
    chime()
    const text = previewOf(e.message)
    const b: Banner = { key: e.message.id, thread_id: e.thread_id, title: e.thread_title, sender: e.message.name, text, group: e.group, user_id: e.message.user_id }
    setBanners(a => [b, ...a.filter(x => x.thread_id !== b.thread_id)].slice(0, 3))
    window.setTimeout(() => setBanners(a => a.filter(x => x.key !== b.key)), 6000)
    if (document.hidden) void desktopAlert(e.group ? e.thread_title : e.message.name, e.group ? `${e.message.name}: ${text}` : text, `chat-${e.thread_id}`, () => nav(`/chat?t=${e.thread_id}`))
  }), [qc, nav])

  const photo = (uid: number) => teamProfileByEmail(people?.find(p => p.id === uid)?.email)?.photo
  return (
    <>
      <Link to="/chat" className="swk-tbtn relative" aria-label={`Inside messenger, ${unread} unread`} title="Inside messenger">
        <MessagesSquare size={17} />{unread > 0 && <span className="count" style={{ background: '#0e9f6e' }}>{unread > 99 ? '99+' : unread}</span>}
      </Link>
      <div className="pointer-events-none fixed right-4 top-20 z-[90] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2 no-print" aria-live="polite">
        <AnimatePresence initial={false}>
          {banners.map(b => (
            <motion.div key={b.key} layout initial={{ opacity: 0, y: -16, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-black/5 bg-white/95 p-3 shadow-[0_24px_60px_rgba(18,18,18,0.18)] backdrop-blur-xl" role="status">
              <button type="button" className="flex min-w-0 flex-1 items-start gap-3 border-0 bg-transparent p-0 text-left" onClick={() => { setBanners(a => a.filter(x => x.key !== b.key)); nav(`/chat?t=${b.thread_id}`) }}>
                <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#121212] text-[13px] font-semibold text-[#51fec0]">
                  {photo(b.user_id) ? <img src={photo(b.user_id)} alt="" className="size-full object-cover object-top" /> : b.sender.split(' ').map(s => s[0]).slice(0, 2).join('')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2"><b className="truncate text-[14px] font-semibold text-[#121212]">{b.group ? b.title : b.sender}</b><span className="ml-auto shrink-0 text-[10.5px] text-[#0e9f6e]">now</span></span>
                  <span className="line-clamp-2 text-[13px] text-[#4a4a4a]">{b.group && <b className="font-medium text-[#121212]">{b.sender}: </b>}{b.text}</span>
                  <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-[#8b8b8b]">Inside · tap to reply</span>
                </span>
              </button>
              <button type="button" aria-label="Dismiss" className="flex size-7 items-center justify-center rounded-full border-0 bg-transparent text-[#8b8b8b] hover:bg-[#f5f5f5]" onClick={() => setBanners(a => a.filter(x => x.key !== b.key))}><X size={14} /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  )
}
