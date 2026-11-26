import { useState } from 'react'
import { Copy,ExternalLink,Mail,Share2 } from 'lucide-react'
import { post } from '../lib/api'
import { useToast } from '../lib/toast'
import { Modal } from '../ui/kit'
import { CustomSelect } from './CustomSelect'

export const SHAREABLE_ENTITIES = new Set(['properties', 'units', 'website_listings'])

/** Create a client listing link for one or more inventory records and send it by WhatsApp, e-mail or copy. */
export function ShareWithClient({ entity, ids, label, onClose }: { entity: string; ids: number[]; label: string; onClose: () => void }) {
  const toast = useToast()
  const [client, setClient] = useState(''), [title, setTitle] = useState(label), [days, setDays] = useState(30)
  const [url, setUrl] = useState(''), [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    try { const r = await post<{ path: string }>('/api/share-links', { entity, ids, title: title || undefined, client_name: client || undefined, expires_days: days }); setUrl(window.location.origin + r.path) } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }
  const text = `${client ? `Dear ${client}, ` : ''}please find ${ids.length > 1 ? `${ids.length} properties` : 'the property'} selected for you by SWK Properties: ${url}`
  return (
    <Modal open onClose={onClose} title="Share with client" width={520}
      footer={url ? <><div className="flex-1" /><button className="btn outline" onClick={onClose}>Done</button></> : <><div className="flex-1" /><button className="btn outline" onClick={onClose}>Cancel</button><button className="web-btn" disabled={busy} onClick={() => void create()}><Share2 size={14} /> Create link</button></>}>
      {!url ? (
        <div className="grid gap-3">
          <p className="m-0 text-[13.5px] text-body leading-relaxed">
            Generates a world-class SWK luxury client brochure where <strong>every photo is strictly watermarked with the SWK Logo &amp; App Icon</strong>, complete with an interactive <strong>3D architectural model</strong>, <strong>voice-narrated cinema video tour</strong>, and UAE mortgage / DLD calculator. Owner PII, internal notes, and commission never leave the OS.
          </p>
          <label><span className="label">Client name (optional)</span><input className="input" value={client} onChange={e => setClient(e.target.value)} placeholder="e.g. Mr Ahmed" /></label>
          <label><span className="label">Brochure title</span><input className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} /></label>
          <label><span className="label">Link valid for</span><CustomSelect className="select" value={days} onChange={e => setDays(Number(e.target.value) || 0)}>{[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>{d} days</option>)}</CustomSelect></label>
          <p className="m-0 text-[12px] text-muted">{ids.length} {ids.length === 1 ? 'listing' : 'listings'} selected. Watermark protection &amp; expiry are enforced server-side.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="flex items-center gap-2 rounded-2xl border border-[#e6e0d4] bg-[#f8f5ef] p-2 pl-4"><span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{url}</span><button className="btn outline sm" onClick={() => { void navigator.clipboard.writeText(url); toast.ok('Link copied') }}><Copy size={14} /> Copy</button></div>
          <div className="flex flex-wrap gap-2">
            <a className="web-btn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            <a className="web-btn light" href={`mailto:?subject=${encodeURIComponent(title || 'Properties selected for you')}&body=${encodeURIComponent(text)}`}><Mail size={14} /> E-mail</a>
            <a className="web-btn light" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Preview</a>
          </div>
        </div>
      )}
    </Modal>
  )
}
