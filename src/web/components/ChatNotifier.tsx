import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { MessagesSquare, Send, X } from 'lucide-react'
import { get, post } from '../lib/api'
import { useMeta } from '../lib/meta'
import { useToast } from '../lib/toast'
import {
  chatState,
  chime,
  desktopAlert,
  previewOf,
  registerWebPush,
  setActiveOutboxUser,
  subscribeChat,
  syncAppBadge,
  vibrateAlert,
  type ChatEvent,
} from '../lib/chatLive'
import { StaffPhoto } from './ui/staff-photo'

type Banner = {
  key: number
  thread_id: number
  title: string
  sender: string
  text: string
  group: boolean
  user_id: number
}

/**
 * WhatsApp-style alerts for Inside, mounted once in the shell: a chime + vibrate, a floating heads-up
 * banner with sender avatar, preview, tap-to-open AND inline Quick Reply, a desktop notification when
 * the tab is in the background, and live unread badges in the tab title, OS app icon, and top bar.
 */
export function ChatNotifier() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const loc = useLocation()
  const toast = useToast()
  const [banners, setBanners] = useState<Banner[]>([])
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [focusedThreadId, setFocusedThreadId] = useState<number | null>(null)
  const [sendingThreadId, setSendingThreadId] = useState<number | null>(null)
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts
  const focusedRef = useRef(focusedThreadId)
  focusedRef.current = focusedThreadId

  const { me } = useMeta()
  const meId = useRef(me?.id)
  meId.current = me?.id
  const isStaff = !!me?.id && !me?.party_id

  const unread =
    useQuery({
      queryKey: ['chat-unread'],
      enabled: isStaff,
      queryFn: () => get<{ unread: number }>('/api/chat/unread'),
      refetchInterval: 60000,
    }).data?.unread ?? 0
  const people = useQuery({
    queryKey: ['chat-people'],
    enabled: isStaff,
    queryFn: () => get<{ id: number; email: string }[]>('/api/chat/people'),
    staleTime: 300000,
  }).data

  useEffect(() => () => syncAppBadge(0), [])

  useEffect(() => {
    syncAppBadge(isStaff ? unread : 0)
  }, [unread, loc.pathname, isStaff])

  useEffect(() => {
    setActiveOutboxUser(isStaff ? me?.id ?? null : null)
    return () => setActiveOutboxUser(null)
  }, [isStaff, me?.id])

  useEffect(() => {
    if (isStaff && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      void registerWebPush()
    }
  }, [isStaff])

  useEffect(() => {
    if (!isStaff) return
    return subscribeChat((e: ChatEvent) => {
        if (e.type === 'presence') {
          void qc.invalidateQueries({ queryKey: ['chat-people'] })
          return
        }
        if (e.type === 'typing') return
        void qc.invalidateQueries({ queryKey: ['chat-unread'] })
        if (e.type !== 'message') return
        if (e.message.user_id === meId.current || e.message.kind === 'system') return
        if (e.replay) return
        const watching = chatState.activeChat === e.thread_id && !document.hidden
        if (e.muted || watching) return

        chime()
        vibrateAlert()
        const text = previewOf(e.message)
        const b: Banner = {
          key: e.message.id,
          thread_id: e.thread_id,
          title: e.thread_title,
          sender: e.message.name,
          text,
          group: e.group,
          user_id: e.message.user_id,
        }
        setBanners(a => [b, ...a.filter(x => x.thread_id !== b.thread_id)].slice(0, 3))
        const scheduleDismiss = () => {
          window.setTimeout(() => {
            if (focusedRef.current === b.thread_id || (draftsRef.current[b.thread_id] ?? '').trim()) {
              scheduleDismiss()
              return
            }
            setBanners(a => a.filter(x => x.key !== b.key))
          }, 9000)
        }
        scheduleDismiss()
        if (document.hidden) {
          void desktopAlert(
            e.group ? e.thread_title : e.message.name,
            e.group ? `${e.message.name}: ${text}` : text,
            `swk-chat-${e.thread_id}`,
            () => nav(`/chat?t=${e.thread_id}`),
          )
        }
      })
  }, [qc, nav, isStaff])

  if (!isStaff) return null

  const sendQuickReply = async (b: Banner) => {
    const body = (drafts[b.thread_id] ?? '').trim()
    if (!body || sendingThreadId === b.thread_id) return
    setSendingThreadId(b.thread_id)
    try {
      await post(`/api/chat/threads/${b.thread_id}/messages`, { body })
      void post(`/api/chat/threads/${b.thread_id}/read`).catch(() => {})
      setDrafts(d => {
        const next = { ...d }
        delete next[b.thread_id]
        return next
      })
      setBanners(a => a.filter(x => x.thread_id !== b.thread_id))
      void qc.invalidateQueries({ queryKey: ['chat-unread'] })
      void qc.invalidateQueries({ queryKey: ['chat-threads'] })
      void qc.invalidateQueries({ queryKey: ['chat-msgs', b.thread_id] })
      toast.ok('Reply sent')
    } catch (err: any) {
      toast.error(err?.message || 'Could not send reply')
    } finally {
      setSendingThreadId(null)
    }
  }

  return (
    <>
      <Link to="/chat" className="swk-tbtn relative !hidden md:!grid" aria-label={`Inside messenger, ${unread} unread`} title="Inside messenger">
        <MessagesSquare size={17} />
        {unread > 0 && (
          <span className="count" style={{ background: '#8a621c' }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Link>
      <div className="pointer-events-none fixed right-5 top-20 z-[125] flex w-[min(436px,calc(100vw-28px))] flex-col gap-3 no-print" aria-live="polite">
        <AnimatePresence initial={false}>
          {banners.map(b => (
            <motion.div
              key={b.thread_id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 48 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="pointer-events-auto overflow-hidden rounded-[20px] border border-[#c89b3c]/45 bg-card shadow-[0_28px_64px_-16px_rgba(7,19,27,0.38)]"
              role="status"
            >
              {/* Branded SWK Inside Corporate Highlight Header */}
              <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-[#07131b] via-[#0c2620] to-[#07131b] px-4 py-2.5 text-white border-b border-[#c89b3c]/35">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src="/brand/web/swk-icon-192.webp"
                    alt="SWK Inside"
                    className="size-6 rounded-lg border border-[#c89b3c]/50 object-contain shrink-0"
                  />
                  <span className="truncate text-[11px] font-bold uppercase tracking-[0.16em] text-[#f3d27a]">
                    SWK INSIDE · TEAM MESSENGER
                  </span>
                  <span className="size-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="rounded-full bg-[#c89b3c]/20 px-2 py-0.5 text-[10px] font-bold text-[#f3d27a]">NOW</span>
                  <button
                    type="button"
                    aria-label="Dismiss"
                    className="flex size-6 items-center justify-center rounded-lg border-0 bg-white/12 text-slate-200 hover:bg-white/25 cursor-pointer"
                    onClick={() => setBanners(a => a.filter(x => x.thread_id !== b.thread_id))}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              <div className="p-4">
                <button
                  type="button"
                  className="flex w-full min-w-0 items-start gap-3.5 border-0 bg-transparent p-0 text-left cursor-pointer"
                  onClick={() => {
                    setBanners(a => a.filter(x => x.thread_id !== b.thread_id))
                    nav(`/chat?t=${b.thread_id}`)
                  }}
                >
                  <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#c89b3c]/50 bg-[#0a1b24] text-[14px] font-bold text-[#e6be63]">
                    <StaffPhoto
                      email={people?.find(p => p.id === b.user_id)?.email}
                      className="size-full object-cover object-top"
                      fallback={b.sender
                        .split(' ')
                        .map(s => s[0])
                        .slice(0, 2)
                        .join('')}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <b className="truncate text-[15.5px] font-bold text-ink">{b.group ? b.title : b.sender}</b>
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-[14px] text-body leading-snug">
                      {b.group && <b className="font-semibold text-ink">{b.sender}: </b>}
                      {b.text}
                    </span>
                    <span className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#046c4e] dark:text-emerald-400">
                      Open in SWK Inside →
                    </span>
                  </span>
                </button>
                <form
                  className="mt-3.5 flex items-center gap-2"
                  onSubmit={e => {
                    e.preventDefault()
                    void sendQuickReply(b)
                  }}
                >
                  <input
                    type="text"
                    value={drafts[b.thread_id] ?? ''}
                    onChange={e => setDrafts(d => ({ ...d, [b.thread_id]: e.target.value }))}
                    onFocus={() => setFocusedThreadId(b.thread_id)}
                    onBlur={() => setFocusedThreadId(k => (k === b.thread_id ? null : k))}
                    placeholder="Quick reply inside SWK Inside…"
                    aria-label={`Quick reply to ${b.group ? b.title : b.sender}`}
                    className="h-10 min-w-0 flex-1 rounded-xl border border-line-strong bg-soft px-3.5 text-[13.5px] text-ink outline-none focus:border-[#046c4e] focus:bg-card"
                  />
                  <button
                    type="submit"
                    disabled={!(drafts[b.thread_id] ?? '').trim() || sendingThreadId === b.thread_id}
                    aria-label="Send quick reply"
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl border-0 bg-[#046c4e] text-white transition-transform hover:bg-[#03543f] active:scale-95 disabled:opacity-40 cursor-pointer"
                  >
                    <Send size={15} />
                  </button>
                </form>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  )
}
