import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'

interface ToastItem {
  id: number
  text: string
  title?: string
  kind: 'ok' | 'error' | 'info'
}

const Ctx = createContext<{
  ok: (t: string, title?: string) => void
  error: (t: string, title?: string) => void
  info: (t: string, title?: string) => void
}>({
  ok: () => {},
  error: () => {},
  info: () => {},
})

export const useToast = () => useContext(Ctx)

const KIND_META: Record<ToastItem['kind'], { label: string; accent: string; badgeBg: string; iconColor: string }> = {
  ok: {
    label: 'SWK OS · CONFIRMED',
    accent: '#046c4e',
    badgeBg: 'rgba(4, 108, 78, 0.14)',
    iconColor: '#046c4e',
  },
  error: {
    label: 'SWK OS · ACTION REQUIRED',
    accent: '#be123c',
    badgeBg: 'rgba(190, 18, 60, 0.14)',
    iconColor: '#be123c',
  },
  info: {
    label: 'SWK OS · EXECUTIVE NOTICE',
    accent: '#a6761f',
    badgeBg: 'rgba(166, 118, 31, 0.16)',
    iconColor: '#a6761f',
  },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const dismiss = useCallback((id: number) => setItems(x => x.filter(i => i.id !== id)), [])
  const push = useCallback((text: string, kind: ToastItem['kind'], title?: string) => {
    const id = Date.now() + Math.random()
    setItems(x => [...x.slice(-3), { id, text, title, kind }])
    window.setTimeout(() => setItems(x => x.filter(i => i.id !== id)), kind === 'error' ? 7500 : 4800)
  }, [])

  return (
    <Ctx.Provider
      value={{
        ok: (t, title) => push(t, 'ok', title),
        error: (t, title) => push(t, 'error', title),
        info: (t, title) => push(t, 'info', title),
      }}
    >
      {children}
      <div
        className="pointer-events-none fixed bottom-[76px] right-5 z-[140] flex w-[min(440px,calc(100vw-28px))] flex-col gap-3 no-print"
        role="status"
        aria-live="polite"
      >
        {items.map(i => {
          const m = KIND_META[i.kind]
          return (
            <div
              key={i.id}
              className="pointer-events-auto overflow-hidden rounded-[18px] border border-line bg-card shadow-[0_24px_56px_-14px_rgba(7,19,27,0.34)]"
              style={{ borderLeft: `5px solid ${m.accent}` }}
            >
              {/* Branded SWK Executive Highlight Strip */}
              <div className="flex items-center justify-between gap-2 border-b border-line bg-[#0a1b24] px-4 py-2 text-white">
                <div className="flex items-center gap-2 min-w-0">
                  <img
                    src="/brand/web/swk-icon-192.webp"
                    alt="SWK"
                    className="size-5 rounded-md object-contain shrink-0"
                  />
                  <span className="truncate text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#e6be63]">
                    {m.label}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss notification"
                  onClick={() => dismiss(i.id)}
                  className="flex size-6 items-center justify-center rounded-lg border-0 bg-white/10 text-slate-200 hover:bg-white/20 cursor-pointer"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="flex items-start gap-3.5 px-4 py-3.5">
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: m.badgeBg, color: m.iconColor }}
                >
                  {i.kind === 'error' ? <XCircle size={20} /> : i.kind === 'info' ? <Info size={20} /> : <CheckCircle2 size={20} />}
                </span>
                <div className="min-w-0 flex-1">
                  {i.title && <div className="text-[15px] font-bold text-ink leading-snug mb-0.5">{i.title}</div>}
                  <div className="text-[14px] font-medium text-ink leading-relaxed">{i.text}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}
