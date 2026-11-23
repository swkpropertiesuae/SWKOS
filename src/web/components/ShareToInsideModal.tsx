import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, MessagesSquare, Search, Send, Users } from 'lucide-react'
import { get, post } from '../lib/api'
import { useToast } from '../lib/toast'
import { Modal } from '../ui/kit'

export interface InsideThreadSummary {
  id: number
  kind: 'dm' | 'group'
  title: string
  members: number
  archived?: boolean
}

export function ShareToInsideModal({
  open,
  onClose,
  title = 'Share to Inside',
  initialMessage,
}: {
  open: boolean
  onClose: () => void
  title?: string
  initialMessage: string
}) {
  const toast = useToast()
  const [threads, setThreads] = useState<InsideThreadSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [message, setMessage] = useState(initialMessage)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open) return
    setMessage(initialMessage)
    setQuery('')
    setError('')
    setLoading(true)
    get<InsideThreadSummary[]>('/api/chat/threads')
      .then(list => {
        const active = (Array.isArray(list) ? list : []).filter(t => !t.archived)
        setThreads(active)
        if (active.length && !active.some(t => t.id === selectedId)) {
          setSelectedId(active[0]!.id)
        }
      })
      .catch((e: any) => setError(e?.message || 'Could not load Inside threads'))
      .finally(() => setLoading(false))
  }, [open, initialMessage]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return threads
    return threads.filter(t => t.title.toLowerCase().includes(q))
  }, [threads, query])

  const send = async () => {
    const body = message.trim()
    if (!selectedId || !body || sending) return
    setSending(true)
    try {
      await post(`/api/chat/threads/${selectedId}/messages`, { body })
      const target = threads.find(t => t.id === selectedId)
      toast.ok(`Shared to ${target?.title || 'Inside'}`)
      onClose()
    } catch (e: any) {
      toast.error(e?.message || 'Could not send message')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={560}
      footer={
        <>
          <button type="button" className="btn outline" onClick={onClose}>
            Cancel
          </button>
          <div className="flex-1" />
          <button
            type="button"
            className="btn green"
            disabled={!selectedId || !message.trim() || sending}
            onClick={() => void send()}
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Send to Inside
          </button>
        </>
      }
    >
      <div className="grid gap-4">
        <div>
          <label className="label" htmlFor="inside-share-msg">
            Message
          </label>
          <textarea
            id="inside-share-msg"
            className="textarea"
            rows={4}
            value={message}
            onChange={e => setMessage(e.target.value)}
            maxLength={3800}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="label m-0">Choose Inside conversation</span>
            <span className="text-xs text-muted">{filtered.length} chats</span>
          </div>
          <div className="relative mb-2">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              className="input"
              style={{ paddingLeft: 34 }}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search team group or colleague…"
              aria-label="Search Inside conversations"
            />
          </div>

          <div className="max-h-[220px] overflow-auto rounded-xl border border-line divide-y divide-line">
            {loading ? (
              <div className="p-4 text-sm text-muted flex items-center gap-2">
                <Loader2 size={15} className="animate-spin" /> Loading conversations…
              </div>
            ) : error ? (
              <div className="p-4 text-sm text-signal">{error}</div>
            ) : !filtered.length ? (
              <div className="p-4 text-sm text-muted">No matching Inside conversations found.</div>
            ) : (
              filtered.map(t => {
                const picked = t.id === selectedId
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left border-0 cursor-pointer transition-colors ${
                      picked ? 'bg-[#e8fff6] text-[#121212]' : 'bg-card hover:bg-hover text-ink'
                    }`}
                  >
                    <span className="flex size-8 items-center justify-center rounded-full bg-[#121212] text-[#51fec0] shrink-0">
                      {t.kind === 'group' ? <Users size={15} /> : <MessagesSquare size={15} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold">{t.title}</span>
                      <span className="block text-[11.5px] text-muted">
                        {t.kind === 'group' ? `Group · ${t.members} members` : 'Direct message'}
                      </span>
                    </span>
                    {picked && <Check size={16} className="text-[#0e9f6e] shrink-0" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
