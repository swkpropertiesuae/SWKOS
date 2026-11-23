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
  const [focusedKey, setFocusedKey] = useState<number | null>(null)
  const [sendingKey, setSendingKey] = useState<number | null>(null)
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts
  const focusedRef = useRef(focusedKey)
  focusedRef.current = focusedKey

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

  useEffect(() => {
    if (!isStaff) return
    syncAppBadge(unread)
  }, [unread, loc.pathname, isStaff])

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
            if (focusedRef.current === b.key || (draftsRef.current[b.key] ?? '').trim()) {
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
    const body = (drafts[b.key] ?? '').trim()
    if (!body || sendingKey === b.key) return
    setSendingKey(b.key)
    try {
      await post(`/api/chat/threads/${b.thread_id}/messages`, { body })
      void post(`/api/chat/threads/${b.thread_id}/read`).catch(() => {})
      setDrafts(d => {
        const next = { ...d }
        delete next[b.key]
        return next
      })
      setBanners(a => a.filter(x => x.key !== b.key))
      void qc.invalidateQueries({ queryKey: ['chat-unread'] })
      void qc.invalidateQueries({ queryKey: ['chat-threads'] })
      void qc.invalidateQueries({ queryKey: ['chat-msgs', b.thread_id] })
      toast.ok('Reply sent')
    } catch (err: any) {
      toast.error(err?.message || 'Could not send reply')
    } finally {
      setSendingKey(null)
    }
  }

  return (
    <>
      <Link to="/chat" className="swk-tbtn relative" aria-label={`Inside messenger, ${unread} unread`} title="Inside messenger">
        <MessagesSquare size={17} />
        {unread > 0 && (
          <span className="count" style={{ background: '#0e9f6e' }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Link>
      <div className="pointer-events-none fixed right-4 top-20 z-[90] flex w-[min(390px,calc(100vw-32px))] flex-col gap-2 no-print" aria-live="polite">
        <AnimatePresence initial={false}>
          {banners.map(b => (
            <motion.div
              key={b.key}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="pointer-events-auto rounded-2xl border border-black/10 bg-white/95 p-3 shadow-[0_24px_60px_rgba(18,18,18,0.18)] backdrop-blur-xl"
              role="status"
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-start gap-3 border-0 bg-transparent p-0 text-left"
                  onClick={() => {
                    setBanners(a => a.filter(x => x.key !== b.key))
                    nav(`/chat?t=${b.thread_id}`)
                  }}
                >
                  <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#121212] text-[13px] font-semibold text-[#51fec0]">
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
                      <b className="truncate text-[14px] font-semibold text-[#121212]">{b.group ? b.title : b.sender}</b>
                      <span className="ml-auto shrink-0 text-[10.5px] font-medium text-[#0e9f6e]">now</span>
                    </span>
                    <span className="line-clamp-2 text-[13px] text-[#4a4a4a]">
                      {b.group && <b className="font-medium text-[#121212]">{b.sender}: </b>}
                      {b.text}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-[#8b8b8b]">
                      Inside · tap to open
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Dismiss"
                  className="flex size-7 items-center justify-center rounded-full border-0 bg-transparent text-[#8b8b8b] hover:bg-[#f5f5f5]"
                  onClick={() => setBanners(a => a.filter(x => x.key !== b.key))}
                >
                  <X size={14} />
                </button>
              </div>
              <form
                className="mt-2.5 flex items-center gap-1.5"
                onSubmit={e => {
                  e.preventDefault()
                  void sendQuickReply(b)
                }}
              >
                <input
                  type="text"
                  value={drafts[b.key] ?? ''}
                  onChange={e => setDrafts(d => ({ ...d, [b.key]: e.target.value }))}
                  onFocus={() => setFocusedKey(b.key)}
                  onBlur={() => setFocusedKey(k => (k === b.key ? null : k))}
                  placeholder="Quick reply…"
                  aria-label={`Quick reply to ${b.group ? b.title : b.sender}`}
                  className="h-8 min-w-0 flex-1 rounded-full border border-black/10 bg-[#f5f5f5] px-3 text-[12.5px] text-[#121212] outline-none focus:border-[#0e9f6e] focus:bg-white"
                />
                <button
                  type="submit"
                  disabled={!(drafts[b.key] ?? '').trim() || sendingKey === b.key}
                  aria-label="Send quick reply"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border-0 bg-[#0e9f6e] text-white transition-transform active:scale-95 disabled:opacity-40"
                >
                  <Send size={13} />
                </button>
              </form>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  )
}
