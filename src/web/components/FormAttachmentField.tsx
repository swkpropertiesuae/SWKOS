import { useId, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { formatAttachmentBytes, type TaskAttachmentItem } from '@shared/task-followups'
import { del, downloadAuthFile, get, openAuthFile, upload } from '../lib/api'
import { useToast } from '../lib/toast'
import { cls } from '../lib/format'

const DEFAULT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.zip'

export function AttachmentKindIcon({ name, mime }: { name: string; mime?: string | null }) {
  const lower = `${name} ${mime || ''}`.toLowerCase()
  if (lower.includes('image') || /\.(png|jpe?g|webp|gif|avif)$/.test(lower)) {
    return <ImageIcon size={13} className="text-[#0e9f6e] shrink-0" />
  }
  if (lower.includes('sheet') || lower.includes('excel') || /\.(xlsx?|csv)$/.test(lower)) {
    return <FileSpreadsheet size={13} className="text-[#0e9f6e] shrink-0" />
  }
  return <FileText size={13} className="text-[#8a621c] shrink-0" />
}

export function AttachmentChips({
  attachments,
  onDelete,
  compact = false,
}: {
  attachments?: TaskAttachmentItem[] | null
  onDelete?: (att: TaskAttachmentItem) => void | Promise<void>
  compact?: boolean
}) {
  const toast = useToast()
  if (!attachments || attachments.length === 0) return null

  return (
    <div className={cls('flex flex-wrap gap-1.5', compact ? 'mt-1' : 'mt-2')}>
      {attachments.map(att => (
        <span
          key={att.id}
          className="inline-flex items-center gap-1.5 max-w-full rounded-full border border-line bg-card px-2.5 py-1 text-[11px] font-semibold text-ink shadow-2xs"
        >
          <AttachmentKindIcon name={att.file_name} mime={att.mime} />
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              void openAuthFile(att.download_url || `/api/files/${att.id}/download`, att.file_name).catch(err =>
                toast.error(err?.message || 'Unable to preview attachment'),
              )
            }}
            className="inline-flex items-center gap-1 max-w-[165px] truncate border-0 bg-transparent p-0 text-left text-inherit hover:text-[#0e9f6e] hover:underline cursor-pointer"
            title={`Open ${att.file_name} (${formatAttachmentBytes(att.size)})`}
          >
            <span className="truncate">{att.file_name}</span>
            <ExternalLink size={10} className="shrink-0 opacity-60" />
          </button>
          <span className="text-[10px] font-mono text-muted shrink-0">{formatAttachmentBytes(att.size)}</span>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation()
              void downloadAuthFile(`/api/files/${att.id}/download?inline=0`, att.file_name).catch(err =>
                toast.error(err?.message || 'Unable to download attachment'),
              )
            }}
            className="border-0 bg-transparent p-0.5 text-muted hover:text-[#0e9f6e] cursor-pointer"
            title={`Download ${att.file_name}`}
            aria-label={`Download ${att.file_name}`}
          >
            <Download size={10} />
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                void onDelete(att)
              }}
              className="border-0 bg-transparent p-0.5 text-muted hover:text-[#a3263a] cursor-pointer"
              title={`Remove ${att.file_name}`}
              aria-label={`Remove ${att.file_name}`}
            >
              <X size={11} />
            </button>
          )}
        </span>
      ))}
    </div>
  )
}

export interface FormAttachmentFieldProps {
  /** Selected files awaiting form submission (staged mode). */
  files?: File[]
  onChange?: (next: File[]) => void
  /** When entity & recordId are provided with immediate=true, files upload immediately and existing attachments are shown live. */
  entity?: string
  recordId?: number | null
  immediate?: boolean
  category?: string
  label?: string
  hint?: string
  compact?: boolean
  maxFiles?: number
  accept?: string
  className?: string
  onUploaded?: (uploaded: TaskAttachmentItem[]) => void
  onDeleted?: (id: number) => void
}

export function FormAttachmentField({
  files = [],
  onChange,
  entity,
  recordId,
  immediate = false,
  category = 'General',
  label = 'Attachments (PDF, Images, Word, Excel)',
  hint = 'Drop files or click to browse · Max 25 MB each',
  compact = false,
  maxFiles = 10,
  accept = DEFAULT_ACCEPT,
  className = '',
  onUploaded,
  onDeleted,
}: FormAttachmentFieldProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const toast = useToast()
  const qc = useQueryClient()
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)

  const liveEnabled = Boolean(entity && recordId && recordId > 0)
  const existingQ = useQuery({
    queryKey: ['form-attachments', entity, recordId],
    enabled: liveEnabled,
    queryFn: () => get<{ rows: TaskAttachmentItem[] }>('/api/files', { link_entity: entity, link_id: recordId }),
  })
  const existing = existingQ.data?.rows ?? []

  const handleIncoming = async (incomingList: FileList | File[] | null) => {
    if (!incomingList || incomingList.length === 0) return
    const incoming = Array.from(incomingList)

    if (immediate && entity && recordId && recordId > 0) {
      setUploading(true)
      try {
        const res = (await upload(incoming, { link_entity: entity, link_id: recordId, category })) as TaskAttachmentItem[]
        toast.ok(`Attached ${res.length} file${res.length === 1 ? '' : 's'}`)
        void qc.invalidateQueries({ queryKey: ['form-attachments', entity, recordId] })
        void qc.invalidateQueries({ queryKey: ['attach', entity, recordId] })
        void qc.invalidateQueries({ queryKey: ['panel', entity, recordId] })
        onUploaded?.(res)
      } catch (e: any) {
        toast.error(e?.message || 'File upload failed')
      } finally {
        setUploading(false)
      }
      return
    }

    if (!onChange) return
    const merged = [...files]
    for (const f of incoming) {
      if (merged.length >= maxFiles) break
      if (!merged.some(cur => cur.name === f.name && cur.size === f.size)) {
        merged.push(f)
      }
    }
    onChange(merged)
  }

  const removeStaged = (idx: number) => {
    onChange?.(files.filter((_, i) => i !== idx))
  }

  const removeExisting = async (att: TaskAttachmentItem) => {
    try {
      await del(`/api/files/${att.id}`)
      toast.ok(`Removed ${att.file_name}`)
      void qc.invalidateQueries({ queryKey: ['form-attachments', entity, recordId] })
      void qc.invalidateQueries({ queryKey: ['attach', entity, recordId] })
      void qc.invalidateQueries({ queryKey: ['panel', entity, recordId] })
      onDeleted?.(att.id)
    } catch (e: any) {
      toast.error(e?.message || 'Could not remove attachment')
    }
  }

  if (compact) {
    return (
      <div className={cls('space-y-1.5', className)}>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            multiple
            accept={accept}
            className="hidden"
            onChange={e => {
              void handleIncoming(e.target.files)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 h-8 rounded-full border border-dashed border-line-strong bg-card px-3 text-[11.5px] font-semibold text-ink hover:border-[#0e9f6e] hover:text-[#0e9f6e] transition cursor-pointer"
          >
            {uploading ? <Loader2 size={12} className="animate-spin text-[#0e9f6e]" /> : <Paperclip size={12} className="text-[#0e9f6e]" />}
            <span>{uploading ? 'Uploading…' : label}</span>
            {files.length > 0 && (
              <span className="rounded-full bg-[#121212] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#51fec0]">
                {files.length}
              </span>
            )}
          </button>

          {files.map((f, idx) => (
            <span
              key={`${f.name}-${f.size}-${idx}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#0e9f6e]/35 bg-soft px-2.5 py-1 text-[11px] font-semibold text-ink"
            >
              <AttachmentKindIcon name={f.name} mime={f.type} />
              <span className="max-w-[150px] truncate">{f.name}</span>
              <span className="font-mono text-[10px] text-muted">{formatAttachmentBytes(f.size)}</span>
              <button
                type="button"
                onClick={() => removeStaged(idx)}
                className="border-0 bg-transparent p-0 text-muted hover:text-[#a3263a] cursor-pointer"
                aria-label={`Remove ${f.name}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>

        {existing.length > 0 && <AttachmentChips attachments={existing} onDelete={removeExisting} compact />}
      </div>
    )
  }

  return (
    <div className={cls('space-y-2', className)}>
      <div
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={e => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault()
          setDragging(false)
          void handleIncoming(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className={cls(
          'flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-dashed px-3.5 py-3 transition cursor-pointer',
          dragging
            ? 'border-[#0e9f6e] bg-[#ecfdf5]/70'
            : 'border-line-strong bg-soft/60 hover:border-[#0e9f6e] hover:bg-soft',
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={e => {
            void handleIncoming(e.target.files)
            e.target.value = ''
          }}
        />
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#121212] text-[#51fec0]">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-bold text-ink">{uploading ? 'Uploading attachments…' : label}</div>
            <div className="text-[11px] text-muted">{hint}</div>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-3 py-1 text-[11px] font-bold text-[#0e9f6e] shrink-0">
          <Upload size={11} /> Browse Files
        </span>
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((f, idx) => (
            <span
              key={`${f.name}-${f.size}-${idx}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#0e9f6e]/35 bg-card px-2.5 py-1 text-[11.5px] font-semibold text-ink shadow-2xs"
            >
              <AttachmentKindIcon name={f.name} mime={f.type} />
              <span className="max-w-[180px] truncate">{f.name}</span>
              <span className="font-mono text-[10px] text-muted">{formatAttachmentBytes(f.size)}</span>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  removeStaged(idx)
                }}
                className="border-0 bg-transparent p-0 text-muted hover:text-[#a3263a] cursor-pointer"
                aria-label={`Remove ${f.name}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {existing.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted">
            Attached Files ({existing.length})
          </div>
          <div className="space-y-1.5">
            {existing.map(att => (
              <div
                key={att.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AttachmentKindIcon name={att.file_name} mime={att.mime} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-ink">{att.file_name}</div>
                    <div className="text-[10.5px] text-muted">
                      {formatAttachmentBytes(att.size)} · {att.category || 'General'} · v{att.doc_version ?? 1}
                      {att.uploader_name ? ` · ${att.uploader_name}` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      void openAuthFile(att.download_url || `/api/files/${att.id}/download`, att.file_name).catch(err =>
                        toast.error(err?.message || 'Unable to open file'),
                      )
                    }
                    className="btn outline !h-7 !px-2 !py-0 text-[11px]"
                  >
                    <ExternalLink size={11} /> View
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void downloadAuthFile(`/api/files/${att.id}/download?inline=0`, att.file_name).catch(err =>
                        toast.error(err?.message || 'Unable to download file'),
                      )
                    }
                    className="btn outline !h-7 !px-2 !py-0 text-[11px]"
                    title="Download"
                  >
                    <Download size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeExisting(att)}
                    className="btn outline !h-7 !px-2 !py-0 text-[11px] text-[#a3263a]"
                    title="Remove attachment"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
