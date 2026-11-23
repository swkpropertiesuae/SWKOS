import { useState } from 'react'
import { FileSearch,Loader2,Trash2,Upload } from 'lucide-react'
import type { FieldDef } from '@shared/types'
import { optValue } from '@shared/types'
import { post,upload } from '../lib/api'
import { useToast } from '../lib/toast'
import { Modal } from '../ui/kit'
import type { MetaEntity } from '../lib/meta'

type Result = { file: string; text: string; method: string; pages: number; records: Record<string, any>[]; by: 'ai' | 'rules'; warning?: string }
const ACCEPT = '.pdf,.docx,.txt,.csv,.md,image/*,.tif,.tiff'

/**
 * Smart import: drop scanned or digital documents in any common format (PDF, Word, photos, scans, text).
 * The server reads them (OCR where needed) and arranges the content into this record type's fields; the person checks
 * and edits every value before anything is saved.
 */
export function SmartImport({ def, onClose, onDone }: { def: MetaEntity; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState(''), [results, setResults] = useState<Result[]>([]), [rows, setRows] = useState<Record<string, any>[]>([]), [showText, setShowText] = useState<number | null>(null)
  const fields = def.fields.filter(f => !f.readonly && !f.computed && !f.virtual && !f.secret && !f.hidden && f.type !== 'json' && f.type !== 'ref')
  const used = fields.filter(f => f.required || rows.some(r => r[f.name] !== undefined && r[f.name] !== ''))
  const read = async (files: FileList | null) => {
    if (!files?.length) return
    for (const f of Array.from(files)) {
      setBusy(`Reading ${f.name}…`)
      try {
        const r: Result = await upload([f], { entity: def.key }, '/api/ocr/extract')
        setResults(x => [...x, r])
        setRows(x => [...x, ...(r.records.length ? r.records : [{}]).map(rec => ({ ...rec, __file: f.name }))])
        if (r.warning) toast.error(`${f.name}: ${r.warning}`)
      } catch (e: any) { toast.error(`${f.name}: ${e.message}`) }
    }
    setBusy('')
  }
  const set = (i: number, k: string, v: any) => setRows(r => r.map((x, n) => (n === i ? { ...x, [k]: v } : x)))
  const save = async () => {
    let ok = 0; const errs: string[] = []
    setBusy('Importing…')
    for (const [i, r] of rows.entries()) {
      const { __file, ...payload } = r
      try { await post(`/api/e/${def.key}`, payload); ok++ } catch (e: any) { errs.push(`Row ${i + 1} (${__file}): ${e.message}`) }
    }
    setBusy('')
    if (ok) { toast.ok(`${ok} ${ok === 1 ? def.label.toLowerCase() : def.plural.toLowerCase()} imported`); onDone() }
    if (errs.length) toast.error(errs.slice(0, 3).join(' · ')); else onClose()
  }
  const input = (f: FieldDef, v: any, onChange: (v: any) => void) =>
    f.type === 'select' ? <select className="select" style={{ minHeight: 32 }} value={v ?? ''} onChange={e => onChange(e.target.value || undefined)}><option value="">—</option>{(f.options ?? []).map(o => <option key={optValue(o)}>{optValue(o)}</option>)}</select>
      : f.type === 'bool' ? <input type="checkbox" checked={!!v} onChange={e => onChange(e.target.checked)} />
      : <input className="input" style={{ minHeight: 32, minWidth: 140 }} type={f.type === 'date' ? 'date' : ['money', 'number', 'int', 'percent'].includes(f.type) ? 'number' : 'text'} value={v ?? ''} onChange={e => onChange(e.target.value === '' ? undefined : ['money', 'number', 'int', 'percent'].includes(f.type) ? Number(e.target.value) : e.target.value)} />

  return (
    <Modal open onClose={onClose} title={`Smart import into ${def.plural} (OCR)`} width={1000}
      footer={<><span className="flex-1 text-[12.5px] text-muted">{busy || (rows.length ? `${rows.length} record${rows.length === 1 ? '' : 's'} ready. Check every value before importing.` : 'PDF, Word, photos, scans, TIFF, text or CSV.')}</span><button className="btn outline" onClick={onClose}>Cancel</button><button className="web-btn" disabled={!rows.length || !!busy} onClick={() => void save()}>Import {rows.length || ''}</button></>}>
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[#cfcfcf] bg-[#f7f7f7] p-8 text-center hover:border-[#121212]"
        onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void read(e.dataTransfer.files) }}>
        {busy ? <Loader2 className="animate-spin text-[#0e9f6e]" /> : <Upload className="text-[#8b8b8b]" />}
        <b className="text-[14px] font-medium">{busy || 'Drop documents here or click to choose'}</b>
        <span className="text-[12px] text-[#737373]">Scans and photos are read with OCR (English and Arabic). Values are arranged into {def.label.toLowerCase()} fields{results.some(r => r.by === 'ai') ? ' by the AI assistant' : ''}.</span>
        <input type="file" multiple hidden accept={ACCEPT} onChange={e => { void read(e.target.files); e.target.value = '' }} disabled={!!busy} />
      </label>
      {results.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {results.map((r, i) => <button key={i} type="button" className="web-pill border-0" style={{ cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }} onClick={() => setShowText(showText === i ? null : i)}><FileSearch size={12} />{r.file} · {r.method === 'ocr' ? 'OCR' : r.method === 'mixed' ? 'text + OCR' : 'text'} · {r.pages}p</button>)}
        </div>
      )}
      {showText !== null && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-[#121212] p-3 text-[12px] text-[#e5e5e5]">{results[showText]?.text}</pre>}
      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-line">
          <table className="grid">
            <thead><tr><th>File</th>{used.map(f => <th key={f.name}>{f.label}{f.required ? ' *' : ''}</th>)}<th /></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={i}><td className="whitespace-nowrap text-[12px] text-muted">{r.__file}</td>{used.map(f => <td key={f.name}>{input(f, r[f.name], v => set(i, f.name, v))}</td>)}
                <td><button className="btn ghost icon sm" aria-label={`Remove row ${i + 1}`} onClick={() => setRows(x => x.filter((_, n) => n !== i))}><Trash2 size={14} /></button></td></tr>))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
