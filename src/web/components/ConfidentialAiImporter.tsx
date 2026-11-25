import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Lock,
  ShieldAlert,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react'
import { canUseEmergencyOverride } from '@shared/swk-staff-access'
import { buildClientHeaders, get, getFetchCredentials, post, resolveApiUrl } from '../lib/api'
import { useMeta } from '../lib/meta'
import { useToast } from '../lib/toast'

interface TargetInfo {
  key: 'properties' | 'leads' | 'parties' | 'crm_vault' | 'jobs'
  label: string
  description: string
  fields: { key: string; label: string; required: boolean; type: string }[]
}

interface AnalyzeResult {
  target_entity: TargetInfo['key']
  target_label: string
  source_name: string
  detected_headers: string[]
  column_mapping: Record<string, string>
  applied_defaults: Record<string, any>
  unmapped_headers: string[]
  ai_used: boolean
  model_used: string
  ai_summary: string
  total_rows: number
  valid_rows: number
  warnings: string[]
  preview_rows: Record<string, any>[]
  normalized_rows: Record<string, any>[]
  normalized_csv: string
}

export function ConfidentialAiImporter({ compact = false }: { compact?: boolean }) {
  const { me } = useMeta()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const canOverride = canUseEmergencyOverride(me)

  const [target, setTarget] = useState<TargetInfo['key']>('properties')
  const [instructions, setInstructions] = useState('')
  const [rawText, setRawText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [result, setResult] = useState<AnalyzeResult | null>(null)
  const [commitStats, setCommitStats] = useState<{ created: number; updated: number; failed: number; errors: { row: number; error: string }[] } | null>(null)
  const [emergencyOverride, setEmergencyOverride] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')

  const targetsQ = useQuery({
    queryKey: ['ai-importer-targets'],
    queryFn: () => get<{ targets: TargetInfo[]; ai_configured: boolean; can_emergency_override: boolean }>('/api/ai-importer/targets'),
  })

  const targets = targetsQ.data?.targets ?? []
  const activeTarget = targets.find(t => t.key === target) ?? targets[0]

  const runAnalyze = async () => {
    if (!file && !rawText.trim()) {
      toast.error('Upload an Excel/CSV/PDF/DOCX file or paste raw list data first.')
      return
    }
    setAnalyzing(true)
    setCommitStats(null)
    try {
      let data: AnalyzeResult
      if (file) {
        const fd = new FormData()
        fd.append('target_entity', target)
        fd.append('instructions', instructions.trim())
        fd.append('file', file)
        const res = await fetch(resolveApiUrl('/api/ai-importer/analyze'), {
          method: 'POST',
          credentials: getFetchCredentials(),
          headers: buildClientHeaders(),
          body: fd,
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || `Analysis failed (${res.status})`)
        data = json as AnalyzeResult
      } else {
        data = await post<AnalyzeResult>('/api/ai-importer/analyze', {
          target_entity: target,
          instructions: instructions.trim(),
          raw_text: rawText,
        })
      }
      setResult(data)
      toast.ok(`Converted ${data.total_rows.toLocaleString()} row${data.total_rows === 1 ? '' : 's'} into SWK OS ${data.target_label} format.`)
    } catch (e: any) {
      toast.error(e?.message || 'Could not convert document')
    } finally {
      setAnalyzing(false)
    }
  }

  const runCommit = async () => {
    if (!result?.normalized_rows?.length) return
    if (emergencyOverride && overrideReason.trim().length < 3) {
      toast.error('Enter an emergency override reason (minimum 3 characters).')
      return
    }
    setCommitting(true)
    try {
      const res = await post<{ created: number; updated: number; failed: number; errors: { row: number; error: string }[] }>('/api/ai-importer/commit', {
        target_entity: result.target_entity,
        rows: result.normalized_rows,
        emergency_override: canOverride && emergencyOverride,
        emergency_override_reason: canOverride && emergencyOverride ? overrideReason.trim() : undefined,
      })
      setCommitStats(res)
      if (res.failed === 0) {
        toast.ok(`Imported ${res.created + res.updated} record${res.created + res.updated === 1 ? '' : 's'} directly into SWK OS!`)
      } else {
        toast.info(`Imported ${res.created + res.updated} records (${res.failed} rows need attention).`)
      }
    } catch (e: any) {
      toast.error(e?.message || 'Import failed')
    } finally {
      setCommitting(false)
    }
  }

  const downloadNormalizedCsv = () => {
    if (!result?.normalized_csv) return
    const blob = new Blob([result.normalized_csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `swk-os-${result.target_entity}-converted.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const previewCols = result?.preview_rows?.length
    ? [...new Set(result.preview_rows.slice(0, 10).flatMap(r => Object.keys(r)))].slice(0, 8)
    : []

  return (
    <div className="grid gap-5">
      {!compact && (
        <div className="rounded-[20px] border border-[#c89b3c]/35 bg-gradient-to-r from-[#0a1b24] via-[#102937] to-[#0a1b24] p-5 text-white shadow-[0_18px_40px_-20px_rgba(9,22,31,0.5)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#c89b3c]/18 border border-[#c89b3c]/40 text-[#e8c36b]">
                <Wand2 size={22} />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#e8c36b]">
                  <Lock size={12} /> Confidential Leadership AI Brain · Owner · Admin · Haseeb · Meenakshi · Rahaba
                </div>
                <h2 className="m-0 mt-1 text-[22px] font-bold !text-white">
                  Universal Format Converter &amp; Bulk OS Importer
                </h2>
                <p className="m-0 mt-1 text-[14px] text-slate-300 max-w-3xl">
                  Drop any unformatted Excel, CSV, PDF, DOCX, or raw WhatsApp/developer list — even thousands of rows in completely different columns.
                  Tell AI Brain what to convert just like ChatGPT or Gemini, preview the exact SWK OS schema, and import in one click.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-3.5 py-1.5 text-[12px] font-semibold text-emerald-200">
              <Sparkles size={13} /> Zero-Retention Protected
            </span>
          </div>
        </div>
      )}

      {/* Step 1: Target Destination + Source File / Paste + AI Prompt */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-5 rounded-[20px] border border-line bg-card p-5 shadow-[var(--surface-raised)] grid gap-4 content-start">
          <div>
            <label className="label" htmlFor="ai-imp-target">1. Choose SWK OS Destination Format</label>
            <div className="grid gap-2">
              {targets.map(t => {
                const active = t.key === target
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => { setTarget(t.key); setResult(null); setCommitStats(null) }}
                    className={`w-full text-left rounded-xl border p-3 transition-all cursor-pointer ${
                      active
                        ? 'border-[#046c4e] bg-[#ebf7f2] dark:bg-[#046c4e]/20 shadow-xs'
                        : 'border-line bg-soft/60 hover:border-line-strong hover:bg-card'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[14.5px] text-ink">{t.label}</span>
                      {active && <CheckCircle2 size={16} className="text-[#046c4e] dark:text-emerald-400 shrink-0" />}
                    </div>
                    <div className="text-[12.5px] text-muted mt-0.5">{t.description}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {activeTarget && (
            <div className="rounded-xl border border-line bg-soft p-3.5">
              <div className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-[var(--eyebrow)] mb-2">
                Expected SWK OS Schema ({activeTarget.fields.length} columns)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeTarget.fields.map(f => (
                  <span
                    key={f.key}
                    className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[12px] font-mono border ${
                      f.required
                        ? 'border-[#a6761f]/40 bg-[#fbf5e6] text-[#7f5710] dark:bg-[#a6761f]/20 dark:text-[#f3d27a] font-semibold'
                        : 'border-line bg-card text-body'
                    }`}
                  >
                    {f.key}{f.required ? '*' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-7 rounded-[20px] border border-line bg-card p-5 shadow-[var(--surface-raised)] grid gap-4 content-start">
          <div>
            <div className="label">2. Upload Any Document or Paste Unformatted Data</div>
            <div
              onClick={() => fileRef.current?.click()}
              className="group flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-soft/50 px-5 py-7 text-center cursor-pointer transition-colors hover:border-[#046c4e] hover:bg-[#ebf7f2]/40 dark:hover:bg-[#046c4e]/10"
            >
              <div className="flex size-12 items-center justify-center rounded-2xl bg-[#0a1b24] text-[#e2b857] shadow-sm">
                <Upload size={20} />
              </div>
              {file ? (
                <div>
                  <div className="font-semibold text-[15px] text-ink flex items-center justify-center gap-2">
                    <FileSpreadsheet size={16} className="text-[#046c4e]" /> {file.name}
                  </div>
                  <div className="text-[13px] text-muted mt-0.5">
                    {(file.size / 1024).toFixed(1)} KB · Click to replace file
                  </div>
                </div>
              ) : (
                <div>
                  <div className="font-semibold text-[15px] text-ink">
                    Drop Excel (.xlsx), CSV, TSV, JSON, PDF, or Word (.docx)
                  </div>
                  <div className="text-[13px] text-muted mt-0.5">
                    Supports up to 5,000 rows per batch — any column names, AED/M/K prices, 05x UAE phones
                  </div>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                hidden
                accept=".xlsx,.xls,.csv,.tsv,.txt,.json,.pdf,.docx"
                onChange={e => {
                  const f = e.target.files?.[0] ?? null
                  setFile(f)
                  if (f) setRawText('')
                }}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="ai-imp-raw">Or Paste Raw Rows / Broker Sheet / WhatsApp List Directly</label>
            <textarea
              id="ai-imp-raw"
              className="textarea font-mono text-[13.5px]"
              rows={4}
              placeholder={'Building, Unit, Type, Asking, Community, Owner Phone\nMarina Gate 1, 2402, 2BR, 2.85M, Dubai Marina, 050 441 9921\nAzizi Riviera 43, 310, Studio, 860K, MBR City, 055 812 3340'}
              value={rawText}
              onChange={e => {
                setRawText(e.target.value)
                if (e.target.value.trim()) setFile(null)
              }}
            />
          </div>

          <div>
            <label className="label" htmlFor="ai-imp-prompt">3. AI Brain Conversion Instructions (ChatGPT / Gemini Style — Optional)</label>
            <input
              id="ai-imp-prompt"
              className="input"
              placeholder='e.g. "Set division to Secondary Sales, map Asking to price, clean UAE mobile numbers, default status to Available"'
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button type="button" className="btn green" disabled={analyzing} onClick={() => void runAnalyze()}>
              {analyzing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {analyzing ? 'AI Brain Converting…' : 'Convert to SWK OS Format'}
            </button>
            {(file || rawText || result) && (
              <button
                type="button"
                className="btn outline"
                onClick={() => { setFile(null); setRawText(''); setResult(null); setCommitStats(null) }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Step 2: AI Conversion Preview + Direct SWK OS Commit */}
      {result && (
        <div className="rounded-[20px] border border-[#046c4e]/35 bg-card p-5 shadow-[var(--surface-raised)] grid gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
            <div>
              <div className="inline-flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.14em] text-[#046c4e] dark:text-emerald-400">
                <CheckCircle2 size={14} /> Conversion Ready · {result.model_used}
              </div>
              <h3 className="m-0 mt-1 text-[19px] font-bold text-ink">
                {result.total_rows.toLocaleString()} Normalized {result.target_label} Row{result.total_rows === 1 ? '' : 's'}
              </h3>
              <p className="m-0 mt-1 text-[14px] text-muted">{result.ai_summary}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn outline sm" onClick={downloadNormalizedCsv}>
                <Download size={15} /> Download SWK OS CSV
              </button>
              <button type="button" className="btn green sm" disabled={committing || result.normalized_rows.length === 0} onClick={() => void runCommit()}>
                {committing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                {committing ? 'Importing into OS…' : `Import ${result.normalized_rows.length.toLocaleString()} Rows into SWK OS`}
              </button>
            </div>
          </div>

          {/* Column Mapping Pills */}
          <div className="grid gap-2">
            <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted">Column Mapping Applied</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(result.column_mapping).map(([src, dst]) => (
                <span key={src} className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-soft px-3 py-1 text-[13px] font-medium text-ink">
                  <span className="text-muted">{src}</span>
                  <ArrowRight size={13} className="text-[#046c4e]" />
                  <span className="font-mono font-semibold text-[#046c4e] dark:text-emerald-400">{dst}</span>
                </span>
              ))}
              {result.unmapped_headers.length > 0 && (
                <span className="inline-flex items-center rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[12.5px] text-amber-800 dark:text-amber-300">
                  Skipped unmapped: {result.unmapped_headers.join(', ')}
                </span>
              )}
            </div>
          </div>

          {canOverride && (
            <div className="rounded-xl border border-[#a6761f]/40 bg-[#fbf5e6]/60 dark:bg-[#a6761f]/12 p-3.5 grid gap-2">
              <label className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={emergencyOverride}
                  onChange={e => setEmergencyOverride(e.target.checked)}
                  className="w-4 h-4 accent-[#a6761f]"
                />
                <ShieldAlert size={15} className="text-[#a6761f]" />
                Owner / Admin Emergency Override (allow importing rows even if * mandatory fields are blank)
              </label>
              {emergencyOverride && (
                <input
                  className="input"
                  placeholder="Emergency override reason (logged permanently to Audit Trail)…"
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                />
              )}
            </div>
          )}

          {commitStats && (
            <div className="rounded-xl border border-[#046c4e]/40 bg-[#ebf7f2] dark:bg-[#046c4e]/18 p-4 text-[14px] text-ink">
              <div className="font-bold">
                Import Complete — Created: {commitStats.created} · Updated: {commitStats.updated} · Failed: {commitStats.failed}
              </div>
              {commitStats.errors.length > 0 && (
                <ul className="mt-2 mb-0 pl-5 text-[13px] text-signal">
                  {commitStats.errors.slice(0, 8).map(e => (
                    <li key={e.row}>Row {e.row}: {e.error}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Normalized Preview Table */}
          {previewCols.length > 0 && (
            <div className="table-wrap rounded-xl border border-line">
              <table className="grid">
                <thead>
                  <tr>
                    <th>#</th>
                    {previewCols.map(c => <th key={c}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {result.preview_rows.slice(0, 15).map((row, idx) => (
                    <tr key={idx}>
                      <td className="font-mono text-muted">{idx + 1}</td>
                      {previewCols.map(c => (
                        <td key={c} className="max-w-[220px] truncate">
                          {row[c] === null || row[c] === undefined ? '—' : String(row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
