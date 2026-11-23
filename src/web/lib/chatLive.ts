/**
 * One live connection to the Inside messenger for the whole app (/api/chat/stream).
 * The notifier in the shell and the chat page both subscribe; `activeChat` tells the notifier
 * which conversation is on screen so it stays quiet for it, as WhatsApp does.
 */
export type ChatMessage = {
  id: number; user_id: number; name: string; kind: string; body: string; created_at: string; edited: boolean; forwarded: boolean
  file: { name: string; mime: string; size: number; url: string } | null
  reply: { id: number; name: string; body: string; kind: string } | null
  reactions: { emoji: string; count: number; mine: boolean; names: string[] }[]
  status: 'sent' | 'delivered' | 'read' | null
}
export type ChatEvent =
  | { type: 'message'; thread_id: number; thread_title: string; group: boolean; muted: boolean; message: ChatMessage }
  | { type: 'update' | 'receipt' | 'thread'; thread_id: number; message_id?: number }
  | { type: 'typing'; thread_id: number; user_id: number; name: string; recording?: boolean }
  | { type: 'presence'; user_id: number; online: boolean; last_seen?: string }

type Fn = (e: ChatEvent) => void
const subs = new Set<Fn>()
let es: EventSource | null = null
export const chatState = { activeChat: null as number | null }

export function subscribeChat(fn: Fn) {
  subs.add(fn)
  if (!es && typeof EventSource !== 'undefined') {
    es = new EventSource('/api/chat/stream')
    es.addEventListener('chat', ev => { try { const e = JSON.parse((ev as MessageEvent).data) as ChatEvent; subs.forEach(s => s(e)) } catch { /* ignore */ } })
  }
  return () => { subs.delete(fn); if (!subs.size && es) { es.close(); es = null } }
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

export const previewOf = (m: Pick<ChatMessage, 'kind' | 'body' | 'file'>) =>
  m.kind === 'deleted' ? 'This message was deleted'
    : m.kind === 'image' ? `📷 ${m.body || 'Photo'}`
    : m.kind === 'voice' ? '🎤 Voice message'
    : m.kind === 'video' ? `🎬 ${m.body || 'Video'}`
    : m.kind === 'file' ? `📄 ${m.file?.name ?? 'Document'}`
    : m.kind === 'report' ? '📋 Attendance report'
    : m.kind === 'automation' ? `⚙️ ${m.body.split('\n')[0]!.replace(/\*/g, '')}`
    : m.body.replace(/\*/g, '')

/** Desktop alert through the service worker when available (works on the installed app), else the plain Notification API. */
export async function desktopAlert(title: string, body: string, tag: string, onClick: () => void) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const opts: NotificationOptions = { body, tag, icon: '/favicon-192.png', badge: '/favicon-96.png', renotify: true, silent: true } as NotificationOptions
  try {
    const n = new Notification(title, opts)
    n.onclick = () => { window.focus(); onClick(); n.close() }
  } catch {
    const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined)
    await reg?.showNotification(title, opts)
  }
}
