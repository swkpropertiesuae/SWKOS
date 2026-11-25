import { useState } from 'react'
import { FolderOpen, Upload } from 'lucide-react'
import { upload } from '../lib/api'
import { EntityList } from '../components/EntityList'
import { DocumentPreviewModal, type PreviewFileRecord } from '../components/DocumentPreviewModal'
import { useToast } from '../lib/toast'
import { useQueryClient } from '@tanstack/react-query'
import { useMeta } from '../lib/meta'
import { PageHeader, Modal } from '../ui/kit'
import { optValue } from '@shared/types'

export function DocumentsPage() {
  const { def, can, meta } = useMeta(); const toast = useToast(); const qc = useQueryClient()
  const [open, setOpen] = useState(false); const [files, setFiles] = useState<File[]>([]); const [cat, setCat] = useState('General'); const [exp, setExp] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<PreviewFileRecord | null>(null)
  const baseCats = (def('attachments').fields.find(f => f.name === 'category')?.options ?? []).map(optValue)
  const customCats: string[] = Array.isArray(meta?.settings?.os_custom_options?.document_categories)
    ? meta!.settings.os_custom_options.document_categories
    : []
  const cats = [...new Set([...baseCats, ...customCats])]
  return (
    <div className="fade-in">
      <PageHeader icon={<FolderOpen size={20} />} title="Documents Library" subtitle="Every PDF and file attached to employees, properties, deals, and records. Click any row for a fit-to-screen preview or download." actions={can('documents', 'create') && <button className="btn green" onClick={() => setOpen(true)}><Upload /> Upload PDF / File</button>} />
      <EntityList entity="attachments" embedded hideNew onOpen={r => setPreview(r)} pageSizeDefault={50} />
      <DocumentPreviewModal file={preview} onClose={() => setPreview(null)} />
      <Modal open={open} onClose={() => setOpen(false)} title="Upload PDF / Document to Library" width={520} footer={<><div className="flex-1" /><button className="btn outline" onClick={() => setOpen(false)}>Cancel</button><button className="btn green" disabled={!files.length || busy} onClick={async () => { setBusy(true); try { await upload(files, { category: cat, expiry_date: exp, note }); toast.ok('Uploaded & verified'); setOpen(false); setFiles([]); setNote(''); setExp(''); void qc.invalidateQueries({ queryKey: ['list', 'attachments'] }) } catch (e: any) { toast.error(e.message) } finally { setBusy(false) } }}>{busy ? 'Uploading…' : 'Upload'}</button></>}>
        <div className="grid gap-3">
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" multiple className="input" onChange={e => setFiles([...(e.target.files ?? [])])} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="label">Category</label><select className="select" value={cat} onChange={e => setCat(e.target.value)}>{cats.map(c => <option key={c}>{c}</option>)}</select></div>
            <div><label className="label">Expiry (optional)</label><input className="input" type="date" value={exp} onChange={e => setExp(e.target.value)} /></div>
          </div>
          <div><label className="label">Note / Ref</label><input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Emirates ID / Visa / Title Deed ref" /></div>
          <p className="text-xs text-muted m-0">To attach PDFs directly to an employee (Emirates ID, Visa, Passport) or property, open that record and use its <b>Documents &amp; PDFs</b> tab.</p>
        </div>
      </Modal>
    </div>
  )
}
