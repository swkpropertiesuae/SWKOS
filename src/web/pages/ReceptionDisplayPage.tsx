import { useEffect,useState } from 'react'
import QRCode from 'qrcode'
import { QrCode } from 'lucide-react'
import { get } from '../lib/api'
import { PageHeader,ErrorBox } from '../ui/kit'

/** Full-screen code for the reception monitor. A new code appears every 30 seconds, so a screenshot is useless after about 90 seconds. */
export function ReceptionDisplayPage() {
  const [img, setImg] = useState(''), [left, setLeft] = useState(0), [err, setErr] = useState<Error | null>(null)
  useEffect(() => {
    let stop = false, timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const t = await get<{ token: string; expires_in: number }>('/api/swk-ops/reception-token')
        const data = await QRCode.toDataURL(t.token, { width: 520, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#0d221a', light: '#ffffff' } })
        if (stop) return
        setImg(data); setErr(null); setLeft(t.expires_in)
        timer = setTimeout(() => void load(), Math.max(3, t.expires_in - 3) * 1000)
      } catch (e: any) { if (!stop) { setErr(e); timer = setTimeout(() => void load(), 10_000) } }
    }
    void load()
    const tick = setInterval(() => setLeft(l => Math.max(0, l - 1)), 1000)
    return () => { stop = true; clearTimeout(timer); clearInterval(tick) }
  }, [])
  return <div className="space-y-4">
    <PageHeader icon={<QrCode size={22} />} title="Reception check-in screen" subtitle="Leave this open on the reception monitor. Staff open SWK OS check-in on their phone and scan it with the camera in that page. The code is encrypted and is not a link." />
    {err && <ErrorBox error={err} />}
    <div className="swk-card p-6 grid place-items-center gap-3">
      {img ? <img src={img} alt="Check-in QR code" style={{ width: 'min(70vh, 520px)', maxWidth: '100%', borderRadius: 16, background: '#fff' }} /> : <p className="text-muted">Loading code…</p>}
      <p className="text-sm text-muted">New code in {left}s · each code works for about 90 seconds</p>
    </div>
  </div>
}
