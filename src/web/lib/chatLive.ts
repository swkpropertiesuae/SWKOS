import { get, post } from './api'

/**
 * One live connection to the Inside messenger for the whole app (/api/chat/stream).
 * Supports cookie auth + mobile ?ticket= SSE auth, automatic ?since_id= catch-up reconnect,
 * Web Push subscription registration, IndexedDB offline message outbox, and OS app badges.
 */
export type ChatMessage = {
  id: number
  user_id: number
  name: string
  kind: string
  body: string
  created_at: string
  edited: boolean
  forwarded: boolean
  file: { name: string; mime: string; size: number; url: string } | null
  reply: { id: number; name: string; body: string; kind: string } | null
  reactions: { emoji: string; count: number; mine: boolean; names: string[] }[]
  status: 'sent' | 'delivered' | 'read' | null
  pending?: boolean
  failed?: boolean
  client_id?: string
  error?: string
}

export type ChatEvent =
  | { type: 'message'; thread_id: number; thread_title: string; group: boolean; muted: boolean; replay?: boolean; message: ChatMessage }
  | { type: 'update' | 'receipt' | 'thread'; thread_id: number; message_id?: number }
  | { type: 'typing'; thread_id: number; user_id: number; name: string; recording?: boolean }
  | { type: 'presence'; user_id: number; online: boolean; last_seen?: string }

export type LocationPayload = { lat: number; lng: number; label?: string }

export interface QueuedChatMessage {
  clientId: string
  threadId: number
  body: string
  kind: 'text' | 'location'
  location?: LocationPayload
  replyToId?: number | null
  createdAt: string
  status: 'pending' | 'failed'
  error?: string
  userId: number
  userName: string
}

type Fn = (e: ChatEvent) => void
const subs = new Set<Fn>()
let es: EventSource | null = null
let reconnectTimer: number | null = null
let onlineBound = false
let connecting = false
let backoffMs = 1000
let lastSeenMessageId = 0
let activeOutboxUserId: number | null = null

export const chatState = { activeChat: null as number | null }

export function setActiveOutboxUser(userId: number | null) {
  const next = typeof userId === 'number' && userId > 0 ? userId : null
  if (activeOutboxUserId !== next) {
    lastSeenMessageId = 0
    activeOutboxUserId = next
  }
}

export function noteSeenMessageId(id: number | null | undefined) {
  if (typeof id === 'number' && Number.isFinite(id) && id > lastSeenMessageId) {
    lastSeenMessageId = id
  }
}

export function getLastSeenMessageId(): number {
  return lastSeenMessageId
}

export function getMobileSessionToken(): string | null {
  if (typeof window === 'undefined') return null
  const winTok = (window as any).__SWK_MOBILE_SESSION__
  if (typeof winTok === 'string' && winTok.trim()) return winTok.trim()
  try {
    const stored = localStorage.getItem('swk.mobile.session')
    return stored && stored.trim() ? stored.trim() : null
  } catch {
    return null
  }
}

export async function buildStreamUrl(
  basePath: string,
  params?: Record<string, string | number | undefined | null>,
): Promise<string> {
  const qs = new URLSearchParams()
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
    }
  }
  const mobileTok = getMobileSessionToken()
  const isCapacitor = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.()
  if (mobileTok || isCapacitor) {
    try {
      const headers: Record<string, string> = mobileTok
        ? { 'x-swk-client': 'mobile', 'x-swk-session': mobileTok }
        : { 'x-swk-client': 'web' }
      const res = await fetch('/api/auth/stream-ticket', {
        method: 'POST',
        credentials: 'same-origin',
        headers,
      })
      if (res.ok) {
        const json = (await res.json()) as { ticket?: string }
        if (json?.ticket) qs.set('ticket', json.ticket)
      }
    } catch {
      /* fallback to cookie auth if available */
    }
  }
  const s = qs.toString()
  return s ? `${basePath}?${s}` : basePath
}

function clearReconnectTimer() {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

async function openChatStream() {
  if (!subs.size || es || connecting || typeof EventSource === 'undefined') return
  connecting = true
  try {
    const url = await buildStreamUrl('/api/chat/stream', lastSeenMessageId > 0 ? { since_id: lastSeenMessageId } : undefined)
    if (!subs.size) return
    const next = new EventSource(url)
    es = next
    next.onopen = () => {
      backoffMs = 1000
    }
    next.addEventListener('chat', ev => {
      try {
        const e = JSON.parse((ev as MessageEvent).data) as ChatEvent
        if (e.type === 'message' && e.message?.id) {
          noteSeenMessageId(e.message.id)
        }
        backoffMs = 1000
        subs.forEach(s => s(e))
      } catch {
        /* ignore malformed SSE payload */
      }
    })
    next.onerror = () => {
      if (es === next) {
        next.close()
        es = null
      }
      if (!subs.size || reconnectTimer !== null) return
      const wait = backoffMs
      backoffMs = Math.min(15_000, backoffMs * 2)
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        void openChatStream()
      }, wait)
    }
  } finally {
    connecting = false
  }
}

export function subscribeChat(fn: Fn) {
  subs.add(fn)
  if (!onlineBound && typeof window !== 'undefined') {
    onlineBound = true
    window.addEventListener('online', () => {
      if (subs.size && !es) {
        clearReconnectTimer()
        backoffMs = 1000
        void openChatStream()
      }
      if (activeOutboxUserId) {
        void flushChatOutbox(activeOutboxUserId)
      }
    })
  }
  if (!es) void openChatStream()
  return () => {
    subs.delete(fn)
    if (!subs.size) {
      clearReconnectTimer()
      lastSeenMessageId = 0
      backoffMs = 1000
      if (es) {
        es.close()
        es = null
      }
    }
  }
}

export function syncActiveThread(threadId: number | null) {
  void post('/api/chat/active-thread', { thread_id: threadId }).catch(() => {})
}

export function parseLocationPayload(body: string): LocationPayload | null {
  if (!body) return null
  try {
    const obj = JSON.parse(body) as Record<string, unknown>
    const lat = Number(obj?.lat)
    const lng = Number(obj?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
    const label = typeof obj?.label === 'string' && obj.label.trim() ? obj.label.trim().slice(0, 160) : undefined
    return { lat, lng, label }
  } catch {
    return null
  }
}

/** Short two-note chime made with Web Audio, so no sound file is needed. */
let ctx: AudioContext | null = null
export function chime() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const t = ctx.currentTime
    for (const [f, at] of [[880, 0], [1318.5, 0.11]] as const) {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'; o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(0.18, t + at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.22)
      o.connect(g).connect(ctx.destination); o.start(t + at); o.stop(t + at + 0.25)
    }
  } catch { /* audio unavailable */ }
}

export function vibrateAlert() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([120, 60, 120])
    }
  } catch {
    /* ignore */
  }
}

export function syncAppBadge(unread: number) {
  if (typeof document !== 'undefined') {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, '')
    document.title = unread > 0 ? `(${unread > 99 ? '99+' : unread}) ${base}` : base
  }
  try {
    const nav = navigator as any
    if (unread > 0 && typeof nav?.setAppBadge === 'function') {
      void nav.setAppBadge(unread).catch(() => {})
    } else if (unread <= 0 && typeof nav?.clearAppBadge === 'function') {
      void nav.clearAppBadge().catch(() => {})
    }
  } catch {
    /* badge API unavailable */
  }
}

export const previewOf = (m: Pick<ChatMessage, 'kind' | 'body' | 'file'>) => {
  if (m.kind === 'deleted') return 'This message was deleted'
  if (m.kind === 'location') {
    const loc = parseLocationPayload(m.body)
    return `📍 ${loc?.label || 'Live location'}`
  }
  if (m.kind === 'image') return `📷 ${m.body || 'Photo'}`
  if (m.kind === 'voice') return '🎤 Voice message'
  if (m.kind === 'video') return `🎬 ${m.body || 'Video'}`
  if (m.kind === 'file') return `📄 ${m.file?.name ?? 'Document'}`
  if (m.kind === 'report') return '📋 Attendance report'
  if (m.kind === 'automation') return `⚙️ ${m.body.split('\n')[0]!.replace(/\*/g, '')}`
  return m.body.replace(/\*/g, '')
}

/** Desktop alert through the service worker when available (works on the installed app), else the plain Notification API. */
export async function desktopAlert(title: string, body: string, tag: string, onClick: () => void) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const opts: NotificationOptions = { body, tag, icon: '/favicon/favicon-192.png', badge: '/favicon/favicon-96.png', renotify: true, silent: true } as NotificationOptions
  try {
    const n = new Notification(title, opts)
    n.onclick = () => { window.focus(); onClick(); n.close() }
  } catch {
    const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined)
    await reg?.showNotification(title, opts)
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

let webPushPromise: Promise<boolean> | null = null
export async function registerWebPush(): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    typeof Notification === 'undefined' ||
    Notification.permission !== 'granted' ||
    (window as any).Capacitor?.isNativePlatform?.()
  ) {
    return false
  }
  if (webPushPromise) return webPushPromise
  webPushPromise = (async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const { publicKey, enabled } = await get<{ publicKey: string; enabled: boolean }>('/api/push/vapid-key')
      if (!enabled || !publicKey) return false
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
        })
      }
      const json = sub.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false
      await post('/api/push/subscribe', {
        channel: 'web_push',
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      })
      return true
    } catch {
      return false
    } finally {
      webPushPromise = null
    }
  })()
  return webPushPromise
}

// ------------------------------------------------------------------ IndexedDB offline outbox for Inside messages
const OUTBOX_DB = 'swk-chat-outbox'
const OUTBOX_STORE = 'pending'
const OUTBOX_LS_KEY = 'swk.chat.outbox.v1'

function openOutboxDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(OUTBOX_DB, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(OUTBOX_STORE)) {
        req.result.createObjectStore(OUTBOX_STORE, { keyPath: 'clientId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function readLsOutbox(): QueuedChatMessage[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_LS_KEY) || '[]')
  } catch {
    return []
  }
}

function writeLsOutbox(items: QueuedChatMessage[]) {
  try {
    localStorage.setItem(OUTBOX_LS_KEY, JSON.stringify(items))
  } catch {
    /* ignore */
  }
}

function notifyOutboxChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('swk:chat-outbox'))
  }
}

export async function listQueuedChatMessages(userId: number, threadId?: number): Promise<QueuedChatMessage[]> {
  if (!userId || userId <= 0) return []
  let all: QueuedChatMessage[] = []
  try {
    const db = await openOutboxDb()
    all = await new Promise<QueuedChatMessage[]>((resolve, reject) => {
      const tx = db.transaction(OUTBOX_STORE, 'readonly')
      const req = tx.objectStore(OUTBOX_STORE).getAll()
      req.onsuccess = () => resolve((req.result || []) as QueuedChatMessage[])
      req.onerror = () => reject(req.error)
    })
  } catch {
    all = readLsOutbox()
  }
  const filtered = all.filter(x => x.userId === userId && (!threadId || x.threadId === threadId))
  return filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function enqueueChatOutbox(item: QueuedChatMessage): Promise<void> {
  try {
    const db = await openOutboxDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(OUTBOX_STORE, 'readwrite')
      const req = tx.objectStore(OUTBOX_STORE).put(item)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch {
    const cur = readLsOutbox().filter(x => x.clientId !== item.clientId)
    writeLsOutbox([...cur, item])
  }
  notifyOutboxChanged()
}

export async function removeChatOutboxItem(clientId: string): Promise<void> {
  try {
    const db = await openOutboxDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(OUTBOX_STORE, 'readwrite')
      const req = tx.objectStore(OUTBOX_STORE).delete(clientId)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch {
    writeLsOutbox(readLsOutbox().filter(x => x.clientId !== clientId))
  }
  notifyOutboxChanged()
}

let flushingOutbox = false
export async function flushChatOutbox(userId: number, onSent?: (threadId: number) => void): Promise<void> {
  if (!userId || userId <= 0 || flushingOutbox || (typeof navigator !== 'undefined' && !navigator.onLine)) return
  flushingOutbox = true
  try {
    const items = await listQueuedChatMessages(userId)
    for (const item of items) {
      if (item.userId !== userId || item.status === 'failed') continue
      if (typeof navigator !== 'undefined' && !navigator.onLine) break
      try {
        if (item.kind === 'location' && item.location) {
          await post(`/api/chat/threads/${item.threadId}/messages`, {
            kind: 'location',
            location: item.location,
            reply_to_id: item.replyToId ?? undefined,
          })
        } else {
          await post(`/api/chat/threads/${item.threadId}/messages`, {
            body: item.body,
            reply_to_id: item.replyToId ?? undefined,
          })
        }
        await removeChatOutboxItem(item.clientId)
        onSent?.(item.threadId)
      } catch (err: any) {
        const status = Number(err?.status ?? 0)
        if (status >= 400 && status < 500) {
          await enqueueChatOutbox({ ...item, status: 'failed', error: String(err?.message || 'Send failed') })
        } else {
          break
        }
      }
    }
  } finally {
    flushingOutbox = false
  }
}
