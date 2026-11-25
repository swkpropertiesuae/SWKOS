import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { QrCode, RefreshCw, ShieldCheck, Timer, Wifi } from 'lucide-react'
import { get, post } from '../lib/api'
import { PageHeader, ErrorBox } from '../ui/kit'
import { qrLink } from '@shared/qr-payload'

type Tok = {
  token: string
  expires_in: number
  step_s?: number
  max_ttl_s?: number
  mode: 'fixed' | 'rotating'
  require_live_camera?: boolean
}

/**
 * Reception check-in monitor display.
 * Rotating mode (locked default): short-TTL AES-256-GCM encrypted code rotating every 20 seconds
 * (max ~40s validity), paired with live browser camera scanning and locked Office Wi-Fi.
 */
export function ReceptionDisplayPage() {
  const [img, setImg] = useState('')
  const [tokInfo, setTokInfo] = useState<Tok | null>(null)
  const [mode, setMode] = useState<Tok['mode']>('rotating')
  const [left, setLeft] = useState(0)
  const [err, setErr] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)

  const show = useCallback(async (t: Tok) => {
    const data = await QRCode.toDataURL(qrLink(window.location.origin, t.token), {
      width: 520,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f2a33', light: '#ffffff' },
    })
    setImg(data)
    setTokInfo(t)
    setMode(t.mode)
    setLeft(t.expires_in)
    setErr(null)
  }, [])

  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const t = await get<Tok>('/api/swk-ops/reception-token')
        if (stop) return
        await show(t)
        const nextDelaySec = t.mode === 'rotating' ? Math.max(2, t.expires_in - 1) : Math.max(15, t.expires_in - 5)
        timer = setTimeout(() => void load(), nextDelaySec * 1000)
      } catch (e: any) {
        if (!stop) {
          setErr(e)
          timer = setTimeout(() => void load(), 10_000)
        }
      }
    }
    void load()
    const tick = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000)
    return () => {
      stop = true
      clearTimeout(timer)
      clearInterval(tick)
    }
  }, [show])

  const act = async (path: string, body?: unknown, ask?: string) => {
    if (ask && !window.confirm(ask)) return
    setBusy(true)
    try {
      await show(await post<Tok>(path, body))
    } catch (e: any) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }

  const stepS = tokInfo?.step_s || 20
  const maxTtlS = tokInfo?.max_ttl_s || stepS * 2
  const pct = mode === 'rotating' ? Math.max(0, Math.min(100, Math.round((left / stepS) * 100))) : 100

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<QrCode size={22} />}
        title="Reception check-in display"
        subtitle={
          mode === 'rotating'
            ? `Anti-spoof short-TTL rotating QR (${stepS}s cycle). Staff scan live with their browser camera on the locked office Wi-Fi.`
            : 'Fixed wall QR mode is active. Switch back to rotating short-TTL mode for anti-screenshot protection.'
        }
      />
      {err && <ErrorBox error={err} />}
      <div className="swk-card p-6 flex flex-col items-center gap-4">
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold border ${
              mode === 'rotating'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
            }`}
          >
            <ShieldCheck size={14} />
            {mode === 'rotating'
              ? `Rotating AES-256-GCM · ${stepS}s Refresh · Max ${maxTtlS}s TTL`
              : 'Static Wall QR Mode (Unrotated)'}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
            <Wifi size={14} />
            Office Wi-Fi Locked · Live Camera Required
          </span>
        </div>

        <div className="relative p-3 rounded-2xl bg-white border border-slate-200 shadow-sm">
          {img ? (
            <img
              src={img}
              alt="Check-in QR code"
              style={{ width: 'min(62vh, 460px)', maxWidth: '100%', borderRadius: 12, background: '#fff', display: 'block' }}
            />
          ) : (
            <div className="w-[320px] h-[320px] grid place-items-center text-muted text-sm">Loading encrypted QR…</div>
          )}
        </div>

        {mode === 'rotating' && (
          <div className="w-full max-w-[460px] space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs font-semibold text-ink">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Timer size={14} className="text-[#047857] shrink-0" />
                Next code in <span className="font-mono font-bold">{left}s</span>
              </span>
              <span className="text-muted whitespace-nowrap">Max {maxTtlS}s TTL · Office Wi-Fi + Live Camera</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-linear"
                style={{
                  width: `${pct}%`,
                  background: left <= 5 ? '#d97706' : '#047857',
                }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-2 print:hidden pt-1">
          <button
            className="btn outline"
            disabled={busy}
            onClick={() => void get<Tok>('/api/swk-ops/reception-token').then(show).catch(setErr)}
          >
            <RefreshCw size={14} /> Refresh now
          </button>
          <button className="btn" onClick={() => window.print()}>
            Print this code
          </button>
          {mode === 'fixed' && (
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                void act(
                  '/api/swk-ops/reception-token/regenerate',
                  undefined,
                  'Make a NEW fixed code? Every printed copy of the old code stops working and you must print the new one.',
                )
              }
            >
              Regenerate fixed code
            </button>
          )}
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              void act(
                '/api/swk-ops/reception-token/mode',
                { mode: mode === 'fixed' ? 'rotating' : 'fixed' },
                mode === 'fixed'
                  ? `Switch to short-TTL rotating mode (${stepS}s cycle)? Printed static codes will stop working immediately.`
                  : 'Switch to static fixed wall code? Anti-screenshot short-TTL rotation will be paused.',
              )
            }
          >
            {mode === 'fixed' ? 'Enable rotating short-TTL mode' : 'Switch to fixed wall code'}
          </button>
        </div>
      </div>
    </div>
  )
}
