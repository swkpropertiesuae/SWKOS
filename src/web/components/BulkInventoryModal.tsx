import { useRef, useState } from 'react'
import { ArrowDownWideNarrow, CheckCircle2, Download, FileSpreadsheet, Layers, Loader2, ShieldAlert, Upload } from 'lucide-react'
import { downloadAuthFile, post } from '../lib/api'
import { useToast } from '../lib/toast'
import { Modal } from '../ui/kit'

type SortBy = 'community_building_price' | 'department_community' | 'price_desc' | 'price_asc' | 'original'
type DedupeMode = 'skip' | 'update' | 'create'

interface BulkResult {
  dryRun: boolean
  sortBy: SortBy
  dedupeMode: DedupeMode
  detectedColumns: Record<string, string>
  summary: {
    total: number
    valid: number
    created: number
    updated: number
    skipped: number
    duplicates: number
    errors: number
  }
  preview: {
    sourceRow: number
    action: 'create' | 'update' | 'skip'
    duplicateReason: string | null
    warnings: string[]
    title: string
    department_division: string
    property_type: string
    status: string
    community: string
    building_name: string
    bedrooms: number | null
    area_sqft: number | null
    price: number | null
    rent_annual: number | null
    rera_permit_no: string | null
  }[]
  errors: { row: number; error: string }[]
}

export function BulkInventoryModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [payload, setPayload] = useState<{ csv?: string; rows?: Record<string, any>[] } | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('community_building_price')
  const [dedupeMode, setDedupeMode] = useState<DedupeMode>('skip')
  const [defaultDepartment, setDefaultDepartment] = useState('')
  const [defaultStatus, setDefaultStatus] = useState('Available')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BulkResult | null>(null)

  const runImport = async (
    nextPayload: { csv?: string; rows?: Record<string, any>[] },
    dryRun: boolean,
    opts?: { sortBy?: SortBy; dedupeMode?: DedupeMode; defaultDepartment?: string; defaultStatus?: string },
  ) => {
    setBusy(true)
    try {
      const res = await post<BulkResult>('/api/properties/bulk-import', {
        ...nextPayload,
        dryRun,
        sortBy: opts?.sortBy ?? sortBy,
        dedupeMode: opts?.dedupeMode ?? dedupeMode,
        defaultDepartment: (opts?.defaultDepartment ?? defaultDepartment) || undefined,
        defaultStatus: (opts?.defaultStatus ?? defaultStatus) || undefined,
      })
      setResult(res)
      if (!dryRun) {
        toast.ok(
          `Bulk inventory uploaded: ${res.summary.created} created${res.summary.updated ? `, ${res.summary.updated} updated` : ''}${res.summary.skipped ? `, ${res.summary.skipped} skipped` : ''}`,
        )
        onDone()
        onClose()
      }
    } catch (e: any) {
      toast.error(e?.message || 'Bulk inventory analysis failed')
    } finally {
      setBusy(false)
    }
  }

  const handleFile = async (file?: File) => {
    if (!file) return
    setFileName(file.name)
    setResult(null)
    try {
      let nextPayload: { csv?: string; rows?: Record<string, any>[] }
      if (/\.xlsx?$/i.test(file.name)) {
        const { readSheet } = await import('read-excel-file/browser')
        const rawRows = await readSheet(file)
        if (!rawRows || rawRows.length < 2) throw new Error('Excel sheet has no data rows.')
        const headers = rawRows[0]!.map(c => String(c ?? '').trim())
        const objs: Record<string, any>[] = []
        for (let i = 1; i < rawRows.length; i++) {
          const r = rawRows[i]!
          if (!r.some(v => v !== null && v !== undefined && String(v).trim() !== '')) continue
          const obj: Record<string, any> = {}
          headers.forEach((h, idx) => {
            if (h) obj[h] = r[idx] ?? ''
          })
          objs.push(obj)
        }
        nextPayload = { rows: objs }
      } else {
        const text = await file.text()
        nextPayload = { csv: text }
      }
      setPayload(nextPayload)
      await runImport(nextPayload, true)
    } catch (e: any) {
      toast.error(e?.message || 'Could not parse spreadsheet')
    }
  }

  const refreshPreview = (patch: { sortBy?: SortBy; dedupeMode?: DedupeMode; defaultDepartment?: string; defaultStatus?: string }) => {
    if (patch.sortBy) setSortBy(patch.sortBy)
    if (patch.dedupeMode) setDedupeMode(patch.dedupeMode)
    if (patch.defaultDepartment !== undefined) setDefaultDepartment(patch.defaultDepartment)
    if (patch.defaultStatus !== undefined) setDefaultStatus(patch.defaultStatus)
    if (payload) void runImport(payload, true, patch)
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={980}
      title="Bulk Inventory Upload — Sorted & Aligned to SWK Schema"
      footer={
        <>
          <button
            type="button"
            className="btn outline"
            onClick={() => void downloadAuthFile('/api/properties/bulk-template.csv', 'swk-bulk-inventory-template.csv').catch(e => toast.error(e.message))}
          >
            <Download size={15} /> Download SWK Template (.csv)
          </button>
          <div className="flex-1" />
          <button type="button" className="btn outline" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn green"
            disabled={busy || !payload || !result || (result.summary.created === 0 && result.summary.updated === 0)}
            onClick={() => payload && void runImport(payload, false)}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {result ? `Upload ${result.summary.created + result.summary.updated} Sorted Properties` : 'Upload Inventory'}
          </button>
        </>
      }
    >
      <div className="grid gap-4">
        {/* Top dropzone + controls */}
        <div className="grid gap-3 md:grid-cols-12 items-stretch">
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); void handleFile(e.dataTransfer.files?.[0]) }}
            className="md:col-span-5 rounded-2xl border-2 border-dashed border-line-strong bg-soft/70 p-5 flex flex-col items-center justify-center text-center cursor-pointer hover:border-[#b78328] hover:bg-hover transition-colors"
          >
            <FileSpreadsheet size={28} className="text-[#0e9f6e] mb-2" />
            <div className="text-sm font-bold text-ink">{fileName || 'Drop Excel (.xlsx) or CSV Inventory File'}</div>
            <div className="text-xs text-muted mt-1">Auto-maps SWK, DLD, Bayut, PF &amp; Developer columns</div>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={e => { void handleFile(e.target.files?.[0]); e.target.value = '' }}
            />
          </div>

          <div className="md:col-span-7 rounded-2xl border border-line bg-soft/50 p-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label flex items-center gap-1.5"><ArrowDownWideNarrow size={13} /> Sort Order Before Upload</label>
              <select className="select" value={sortBy} onChange={e => refreshPreview({ sortBy: e.target.value as SortBy })}>
                <option value="community_building_price">Community → Building → Highest Price</option>
                <option value="department_community">Core Department → Community → Building</option>
                <option value="price_desc">Highest Price First (AED)</option>
                <option value="price_asc">Lowest Price First (AED)</option>
                <option value="original">Keep Original File Order</option>
              </select>
            </div>
            <div>
              <label className="label flex items-center gap-1.5"><Layers size={13} /> Duplicate Handling</label>
              <select className="select" value={dedupeMode} onChange={e => refreshPreview({ dedupeMode: e.target.value as DedupeMode })}>
                <option value="skip">Skip Existing Duplicates (Recommended)</option>
                <option value="update">Update Existing Matched Properties</option>
                <option value="create">Create All Rows as New Listings</option>
              </select>
            </div>
            <div>
              <label className="label">Default Core Department</label>
              <select className="select" value={defaultDepartment} onChange={e => refreshPreview({ defaultDepartment: e.target.value })}>
                <option value="">Auto-detect per row (Recommended)</option>
                <option value="Secondary Projects">Secondary Projects</option>
                <option value="Sales of Off-Plan Projects">Sales of Off-Plan Projects</option>
                <option value="Leasing">Leasing</option>
              </select>
            </div>
            <div>
              <label className="label">Default Status</label>
              <select className="select" value={defaultStatus} onChange={e => refreshPreview({ defaultStatus: e.target.value })}>
                <option value="Available">Available</option>
                <option value="Off-Plan">Off-Plan</option>
                <option value="Under Offer">Under Offer</option>
                <option value="Reserved">Reserved</option>
              </select>
            </div>
          </div>
        </div>

        {/* Live Sorted Preview */}
        {busy && !result && (
          <div className="rounded-2xl border border-line bg-soft/60 p-8 text-center text-sm text-muted flex items-center justify-center gap-2">
            <Loader2 size={18} className="animate-spin text-[#0e9f6e]" /> Parsing, normalizing &amp; sorting inventory rows…
          </div>
        )}

        {result && (
          <div className="grid gap-3">
            {/* Summary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div className="rounded-xl border border-line bg-soft p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Total Rows</div>
                <div className="font-mono text-xl font-bold text-ink mt-0.5">{result.summary.total}</div>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">New to Create</div>
                <div className="font-mono text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">{result.summary.created}</div>
              </div>
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">Will Update</div>
                <div className="font-mono text-xl font-bold text-blue-700 dark:text-blue-300 mt-0.5">{result.summary.updated}</div>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">Duplicates / Skipped</div>
                <div className="font-mono text-xl font-bold text-amber-800 dark:text-amber-300 mt-0.5">{result.summary.skipped}</div>
              </div>
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">Row Errors</div>
                <div className="font-mono text-xl font-bold text-rose-700 dark:text-rose-300 mt-0.5">{result.summary.errors}</div>
              </div>
            </div>

            {/* Detected column pills */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-bold text-muted">Auto-mapped columns:</span>
              {Object.entries(result.detectedColumns).map(([src, tgt]) => (
                <span key={src} className="rounded-full border border-line bg-soft px-2.5 py-0.5 text-[11px] font-medium text-ink">
                  {src} → <strong className="text-[#0e9f6e]">{tgt}</strong>
                </span>
              ))}
            </div>

            {/* Sorted Preview Table */}
            <div className="table-wrap max-h-[340px] border border-line rounded-2xl overflow-auto">
              <table className="grid">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Action</th>
                    <th>Community</th>
                    <th>Building</th>
                    <th>Title</th>
                    <th>Type &amp; Dept</th>
                    <th className="num">Beds / Sqft</th>
                    <th className="num">Price / Rent (AED)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.preview.map((row, idx) => (
                    <tr key={`${row.sourceRow}-${idx}`}>
                      <td className="font-mono text-xs text-muted">{idx + 1}</td>
                      <td>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          row.action === 'create' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' :
                          row.action === 'update' ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300' :
                          'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                        }`}>
                          {row.action === 'create' && <CheckCircle2 size={11} />}
                          {row.action.toUpperCase()}
                        </span>
                        {row.duplicateReason && <div className="text-[10.5px] text-amber-700 dark:text-amber-300 mt-0.5">{row.duplicateReason}</div>}
                      </td>
                      <td className="font-semibold">{row.community}</td>
                      <td>{row.building_name}</td>
                      <td className="font-medium">{row.title}</td>
                      <td className="text-xs">
                        <div>{row.property_type} · {row.status}</div>
                        <div className="text-muted">{row.department_division}</div>
                      </td>
                      <td className="num font-mono text-xs">
                        {row.bedrooms != null ? `${row.bedrooms} BR` : '—'} · {row.area_sqft ? `${Math.round(row.area_sqft).toLocaleString('en-US')} sf` : '—'}
                      </td>
                      <td className="num font-mono font-semibold">
                        {row.price ? `AED ${row.price.toLocaleString('en-US')}` : row.rent_annual ? `AED ${row.rent_annual.toLocaleString('en-US')}/yr` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.errors.length > 0 && (
              <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-3 text-xs text-rose-800 dark:text-rose-200">
                <div className="font-bold flex items-center gap-1.5 mb-1"><ShieldAlert size={14} /> {result.errors.length} row(s) had validation issues:</div>
                {result.errors.slice(0, 6).map((e, i) => <div key={i}>Row {e.row}: {e.error}</div>)}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
