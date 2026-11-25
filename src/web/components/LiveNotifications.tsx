import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, Bell, CheckCircle2, PhoneCall, ShieldAlert, Siren, X } from 'lucide-react'
import { get } from '../lib/api'
import { buildStreamUrl, chime, desktopAlert, vibrateAlert } from '../lib/chatLive'

type N = { id: number; kind: string; title: string; body?: string; link?: string; created_at: string }

const ICON: Record<string, typeof Bell> = {
  sos: Siren,
  call: PhoneCall,
  approval: ShieldAlert,
  withdrawal: ShieldAlert,
  audit: ShieldAlert,
  warn: AlertTriangle,
  success: CheckCircle2,
  info: Bell,
}

const KIND_LABEL: Record<string, string> = {
  sos: 'SOS Alert',
  call: 'Incoming Call',
  approval: 'Approval Needed',
  withdrawal: 'Withdrawal',
  lead: 'Lead Alert',
  viewing: 'Viewing',
  audit: 'Audit Alert',
  warn: 'Warning',
}

/**
 * Pop-up notifications that appear the moment something happens, with no refresh.
 * Uses cookie auth on web and one-time /api/auth/stream-ticket on mobile x-swk-session,
 * automatically reconnecting on drop alongside a 15-second poll fallback.
 */
export function LiveNotifications() {
  const [items, setItems] = useState<N[]>([])
  const seen = useRef<number>(-1)
  const nav = useNavigate()
  const qc = useQueryClient()

  const handle = useCallback(
    (n: N, silent = false) => {
      if (n.id <= seen.current) return
      seen.current = n.id
      void qc.invalidateQueries({ queryKey: ['notifications'] })
      void qc.invalidateQueries({ queryKey: ['pulse'] })
      if (silent) return
      vibrateAlert()
      if (n.kind === 'sos' || n.kind === 'call' || n.kind === 'approval' || n.kind === 'audit') {
        chime()
      }
      setItems(a => [n, ...a].slice(0, 4))
      window.setTimeout(() => setItems(a => a.filter(x => x.id !== n.id)), 9000)
      if (document.hidden) {
        void desktopAlert(n.title, n.body || '', `swk-ops-${n.id}`, () => {
          if (n.link) nav(n.link)
        })
      }
    },
    [qc, nav],
  )

  useEffect(() => {
    let es: EventSource | null = null
    let stopped = false
    let timer: number | null = null
    let backoff = 1500

    // Remember current highest ID so only new notifications pop up
    void get<{ rows: N[] }>('/api/notifications')
      .then(r => {
        const top = Math.max(0, ...r.rows.map(x => x.id))
        if (seen.current < top) seen.current = top
      })
      .catch(() => {})

    const connect = async () => {
      if (stopped || es || typeof EventSource === 'undefined') return
      const url = await buildStreamUrl('/api/notifications/stream')
      if (stopped) return
      const next = new EventSource(url)
      es = next
      next.onopen = () => {
        backoff = 1500
      }
      next.addEventListener('notification', e => {
        try {
          backoff = 1500
          handle(JSON.parse((e as MessageEvent).data))
        } catch {
          /* ignore */
        }
      })
      next.onerror = () => {
        if (es === next) {
          next.close()
          es = null
        }
        if (stopped || timer !== null) return
        const wait = backoff
        backoff = Math.min(20_000, backoff * 2)
        timer = window.setTimeout(() => {
          timer = null
          void connect()
        }, wait)
      }
    }

    const onOnline = () => {
      if (!es && !stopped) {
        if (timer !== null) {
          window.clearTimeout(timer)
          timer = null
        }
        backoff = 1500
        void connect()
      }
    }

    void connect()
    window.addEventListener('online', onOnline)

    const poll = window.setInterval(() => {
      if (stopped || document.hidden) return
      void get<{ rows: N[] }>('/api/notifications')
        .then(r => [...r.rows].sort((a, b) => a.id - b.id).forEach(n => handle(n)))
        .catch(() => {})
    }, 15000)

    return () => {
      stopped = true
      if (timer !== null) window.clearTimeout(timer)
      window.removeEventListener('online', onOnline)
      es?.close()
      clearInterval(poll)
    }
  }, [handle])

  const open = (n: N) => {
    setItems(a => a.filter(x => x.id !== n.id))
    if (n.link) nav(n.link)
  }

  return (
    <div className="swk-live-stack no-print" aria-live="polite" aria-label="New notifications">
      <AnimatePresence initial={false}>
        {items.map(n => {
          const I = ICON[n.kind] ?? Bell
          const isUrgent = n.kind === 'sos' || n.kind === 'call'
          const tag = KIND_LABEL[n.kind]
          return (
            <motion.div
              key={n.id}
              layout
              initial={{ opacity: 0, x: 48, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 48, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className={`swk-live-card ${isUrgent ? 'ring-2 ring-[#dc2626]' : ''}`}
              role="status"
            >
              <button type="button" className="swk-live-body" onClick={() => open(n)}>
                <span className={`swk-live-ic ${isUrgent ? '!bg-[#dc2626] !text-white' : ''}`}>
                  <I size={18} />
                </span>
                <span className="swk-live-tx">
                  {tag && <span className={`text-[10px] font-bold uppercase tracking-[0.12em] ${isUrgent ? 'text-[#dc2626]' : 'text-[#0e9f6e]'}`}>{tag}</span>}
                  <b>{n.title}</b>
                  {n.body ? <small>{n.body}</small> : null}
                  <em>{n.link ? 'Tap to open →' : 'Just now'}</em>
                </span>
              </button>
              <button type="button" className="swk-live-x" aria-label="Dismiss" onClick={() => setItems(a => a.filter(x => x.id !== n.id))}>
                <X size={14} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
