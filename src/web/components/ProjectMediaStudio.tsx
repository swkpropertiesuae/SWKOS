import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  Box,
  ExternalLink,
  FileText,
  Film,
  Image as ImageIcon,
  Layers,
  Link2,
  Plus,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  MEDIA_CATEGORIES,
  normalizeMediaList,
  type ProjectMediaItem,
  type ProjectMediaKind,
} from '@shared/media'
import { get, openAuthFile, post, put, upload } from '../lib/api'
import { useToast } from '../lib/toast'
import { CustomSelect } from './CustomSelect'
import { AuthImg, MediaTour3DEmbed, MediaVideoPlayer } from './AuthMedia'

type MediaEntity = 'properties' | 'units' | 'website_listings' | 'developers' | 'communities'

const KIND_META: Record<ProjectMediaKind, { label: string; short: string; accept: string; hint: string }> = {
  photo: {
    label: 'Pictures & Renders',
    short: 'Photos',
    accept: 'image/jpeg,image/png,image/webp,image/avif,image/gif',
    hint: 'Drop HD project renders, interiors, amenities & masterplan images (.jpg, .png, .webp)',
  },
  video: {
    label: 'Videos',
    short: 'Videos',
    accept: 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov',
    hint: 'Upload MP4/WebM launch films (up to 50 MB) or paste YouTube / Vimeo links below',
  },
  tour3d: {
    label: '3D & 360° Tours',
    short: '3D / 360°',
    accept: '.glb,.gltf,.usdz',
    hint: 'Paste Matterport, Kuula, Sketchfab, or developer 3D tour links — or upload .glb / .gltf 3D models',
  },
  floorplan: {
    label: 'Floor Plans',
    short: 'Floor Plans',
    accept: 'image/jpeg,image/png,image/webp,application/pdf,.pdf',
    hint: 'Upload typical floor plates or unit layout sheets (JPG, PNG, WebP, or PDF)',
  },
  brochure: {
    label: 'Brochures & Fact Sheets',
    short: 'Brochures',
    accept: 'application/pdf,.pdf',
    hint: 'Upload official developer brochures, community guides, and price lists (PDF)',
  },
  ppt: {
    label: 'PPT Presentations',
    short: 'PPT Decks',
    accept: '.pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation',
    hint: 'Upload developer pitch decks or launch slide presentations (.pptx)',
  },
  payment_plan: {
    label: 'Payment Plan PDFs',
    short: 'Payment Plans',
    accept: 'application/pdf,.pdf',
    hint: 'Upload official milestone payment plan schedules and DLD/ADM fee sheets (PDF)',
  },
}

const ALL_KINDS: ProjectMediaKind[] = ['photo', 'video', 'tour3d', 'floorplan', 'brochure', 'ppt', 'payment_plan']

export function ProjectMediaStudio({
  entity,
  id,
  canEdit = true,
  onChanged,
}: {
  entity: MediaEntity
  id: number
  canEdit?: boolean
  onChanged?: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [filter, setFilter] = useState<'all' | ProjectMediaKind>('all')
  const [uploadKind, setUploadKind] = useState<ProjectMediaKind>('photo')
  const [category, setCategory] = useState(MEDIA_CATEGORIES.photo[0]!)
  const [drag, setDrag] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [linkKind, setLinkKind] = useState<ProjectMediaKind>('video')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [addingLink, setAddingLink] = useState(false)
  const [lightbox, setLightbox] = useState<ProjectMediaItem | null>(null)

  const q = useQuery({
    queryKey: ['media-studio', entity, id],
    queryFn: () => get<{
      items: ProjectMediaItem[]
      video_url: string | null
      virtual_tour_url: string | null
      model_3d_url: string | null
      floor_plan_url: string | null
      brochure_url: string | null
    }>(`/api/media/${entity}/${id}`),
  })

  const items = useMemo(() => normalizeMediaList(q.data?.items ?? []), [q.data?.items])
  const counts = useMemo(() => {
    const c: Record<ProjectMediaKind, number> = { photo: 0, video: 0, tour3d: 0, floorplan: 0, brochure: 0, ppt: 0, payment_plan: 0 }
    for (const it of items) c[it.kind]++
    return c
  }, [items])

  const shown = useMemo(
    () => (filter === 'all' ? items : items.filter(i => i.kind === filter)),
    [items, filter],
  )

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['media-studio', entity, id] })
    void qc.invalidateQueries({ queryKey: ['rec', entity, id] })
    void qc.invalidateQueries({ queryKey: ['panel', entity, id] })
    void qc.invalidateQueries({ queryKey: ['swk-op'] })
    void qc.invalidateQueries({ queryKey: ['swk-ls'] })
    void qc.invalidateQueries({ queryKey: ['website'] })
    onChanged?.()
  }

  const handleUpload = async (fileList: FileList | File[]) => {
    const files = [...fileList]
    if (!files.length) return
    setUploading(true)
    try {
      await upload(files, { kind: uploadKind, category }, `/api/media/${entity}/${id}/upload`)
      toast.ok(`Uploaded ${files.length} ${files.length === 1 ? 'file' : 'files'} to Media Studio`)
      invalidate()
    } catch (e: any) {
      toast.error(e.message || 'Media upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!linkUrl.trim()) return
    setAddingLink(true)
    try {
      await post(`/api/media/${entity}/${id}/link`, {
        kind: linkKind,
        url: linkUrl.trim(),
        title: linkTitle.trim() || undefined,
        category: MEDIA_CATEGORIES[linkKind][0],
        set_primary: true,
      })
      toast.ok(`${KIND_META[linkKind].short} link added`)
      setLinkUrl('')
      setLinkTitle('')
      invalidate()
    } catch (err: any) {
      toast.error(err.message || 'Could not add media link')
    } finally {
      setAddingLink(false)
    }
  }

  const saveItems = async (next: ProjectMediaItem[], message?: string) => {
    try {
      await put(`/api/media/${entity}/${id}/reorder`, { items: next })
      if (message) toast.ok(message)
      invalidate()
    } catch (err: any) {
      toast.error(err.message || 'Could not update media order')
    }
  }

  const setCover = (targetId: string) => {
    const next = items.map(it =>
      it.kind === 'photo' ? { ...it, is_cover: it.id === targetId } : it,
    )
    const cover = next.find(i => i.id === targetId)
    const reordered = cover ? [cover, ...next.filter(i => i.id !== targetId)] : next
    void saveItems(reordered, 'Cover photo updated')
  }

  const moveItem = (targetId: string, delta: -1 | 1) => {
    const idx = items.findIndex(i => i.id === targetId)
    const swap = idx + delta
    if (idx < 0 || swap < 0 || swap >= items.length) return
    const next = [...items]
    ;[next[idx], next[swap]] = [next[swap]!, next[idx]!]
    void saveItems(next)
  }

  const removeItem = (targetId: string) => {
    const next = items.filter(i => i.id !== targetId)
    void saveItems(next, 'Media item removed')
  }

  const iconFor = (k: ProjectMediaKind) =>
    k === 'photo' ? <ImageIcon size={14} /> :
    k === 'video' ? <Film size={14} /> :
    k === 'tour3d' ? <Box size={14} /> :
    k === 'floorplan' ? <Layers size={14} /> :
    <FileText size={14} />

  return (
    <div className="flex flex-col gap-5">
      {/* Header Summary Strip */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
        {ALL_KINDS.map(k => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setFilter(f => (f === k ? 'all' : k))
              setUploadKind(k)
              setCategory(MEDIA_CATEGORIES[k][0]!)
            }}
            className={`rounded-2xl border p-3 text-left transition-all cursor-pointer ${
              filter === k
                ? 'border-[#121212] bg-[#121212] text-white'
                : 'border-line bg-soft/70 text-ink hover:border-[#121212]/40'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider opacity-75">
              <span>{KIND_META[k].short}</span>
              {iconFor(k)}
            </div>
            <div className="mt-1.5 font-display text-2xl font-bold tabular-nums">{counts[k]}</div>
          </button>
        ))}
      </div>

      {/* Upload + External Link Studio Controls */}
      {canEdit && (
        <div className="grid gap-4 lg:grid-cols-12">
          {/* Multi-file Drag & Drop Uploader */}
          <div className="lg:col-span-7 rounded-2xl border border-line bg-white/80 p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-display text-sm font-bold text-ink flex items-center gap-2">
                <Upload size={15} /> Upload Pictures, Videos, 3D (.glb) &amp; PDFs
              </div>
              <div className="flex flex-wrap gap-2">
                <CustomSelect
                  compact
                  className="select !h-8 !text-xs min-w-[140px]"
                  value={uploadKind}
                  onChange={e => {
                    const k = (e.target.value || 'photo') as ProjectMediaKind
                    setUploadKind(k)
                    setCategory(MEDIA_CATEGORIES[k][0]!)
                  }}
                >
                  {ALL_KINDS.map(k => (
                    <option key={k} value={k}>{KIND_META[k].label}</option>
                  ))}
                </CustomSelect>
                <CustomSelect
                  compact
                  className="select !h-8 !text-xs min-w-[145px]"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                >
                  {MEDIA_CATEGORIES[uploadKind].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </CustomSelect>
              </div>
            </div>

            <label
              className={`block rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-colors ${
                drag ? 'border-emerald bg-mint/40' : 'border-line-strong hover:bg-hover/60'
              }`}
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); void handleUpload(e.dataTransfer.files) }}
            >
              <input
                type="file"
                multiple
                accept={KIND_META[uploadKind].accept}
                hidden
                onChange={e => {
                  const picked = Array.from(e.target.files ?? [])
                  e.target.value = ''
                  if (picked.length) void handleUpload(picked)
                }}
              />
              <div className="text-sm font-bold text-ink">
                {uploading ? 'Uploading files to SWK Media Vault…' : `Drop ${KIND_META[uploadKind].label} here or click to browse`}
              </div>
              <div className="mt-1 text-xs text-muted">
                {KIND_META[uploadKind].hint} · Up to 25 files / 50 MB each · Photos auto-watermarked on client links
              </div>
            </label>
          </div>

          {/* Paste YouTube / Vimeo / Matterport / 3D / External URL */}
          <form onSubmit={e => void handleAddLink(e)} className="lg:col-span-5 rounded-2xl border border-line bg-white/80 p-4 flex flex-col gap-2.5">
            <div className="font-display text-sm font-bold text-ink flex items-center gap-2">
              <Link2 size={15} /> Embed Video, 3D / 360° Tour or URL
            </div>
            <div className="grid grid-cols-2 gap-2">
              <CustomSelect
                compact
                className="select !h-9 !text-xs"
                value={linkKind}
                onChange={e => setLinkKind((e.target.value || 'video') as ProjectMediaKind)}
              >
                <option value="video">Video (YouTube / Vimeo / MP4)</option>
                <option value="tour3d">3D / 360° Tour (Matterport / Kuula / Sketchfab)</option>
                <option value="photo">Photo / Render URL</option>
                <option value="floorplan">Floor Plan Link</option>
                <option value="brochure">Brochure PDF Link</option>
                <option value="ppt">PPT Presentation Deck Link</option>
                <option value="payment_plan">Payment Plan PDF Link</option>
              </CustomSelect>
              <input
                className="input !h-9 !text-xs"
                placeholder="Label (e.g. Official Launch Film)"
                value={linkTitle}
                onChange={e => setLinkTitle(e.target.value)}
              />
            </div>
            <input
              className="input !h-9 !text-xs"
              type="url"
              required
              placeholder={
                linkKind === 'video'
                  ? 'https://youtube.com/watch?v=... or https://vimeo.com/...'
                  : linkKind === 'tour3d'
                  ? 'https://my.matterport.com/show/?m=... or Kuula / Sketchfab URL'
                  : 'https://...'
              }
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
            />
            <button type="submit" disabled={addingLink || !linkUrl.trim()} className="btn green sm justify-center mt-auto">
              <Plus size={14} /> {addingLink ? 'Adding…' : `Add ${KIND_META[linkKind].short} Link`}
            </button>
          </form>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold border cursor-pointer ${
            filter === 'all' ? 'bg-[#121212] text-white border-[#121212]' : 'bg-white text-ink border-line hover:border-[#121212]/40'
          }`}
        >
          All Media ({items.length})
        </button>
        {ALL_KINDS.map(k => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold border cursor-pointer ${
              filter === k ? 'bg-[#121212] text-white border-[#121212]' : 'bg-white text-ink border-line hover:border-[#121212]/40'
            }`}
          >
            {iconFor(k)} {KIND_META[k].short} ({counts[k]})
          </button>
        ))}
      </div>

      {/* Empty State */}
      {q.isLoading ? (
        <div className="text-sm text-muted py-6">Loading Media Studio…</div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong p-10 text-center">
          <div className="font-display text-base font-bold text-ink">No media added yet</div>
          <p className="mt-1 text-xs text-muted max-w-md mx-auto">
            Upload high-resolution pictures, developer launch videos (MP4 or YouTube/Vimeo), interactive 3D/360° tours (Matterport, Kuula, Sketchfab, .glb), floor plans, and official brochures. Everything syncs automatically to Off-Plan Launches, Listing Studio, Website Studio, and watermarked client links.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map(it => (
            <div key={it.id} className="rounded-2xl border border-line bg-white overflow-hidden flex flex-col">
              {/* Preview Area */}
              {it.kind === 'photo' ? (
                <div className="relative aspect-[16/10] bg-[#eaf2f8] overflow-hidden group">
                  <AuthImg
                    src={it.url}
                    alt={it.title || 'Project media'}
                    className="h-full w-full object-cover cursor-zoom-in transition-transform duration-500 group-hover:scale-105"
                    onClick={() => setLightbox(it)}
                  />
                  <div className="absolute left-2.5 top-2.5 flex gap-1.5">
                    {it.is_cover && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#121212]/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#51fec0]">
                        <Star size={10} fill="currentColor" /> Cover
                      </span>
                    )}
                    {it.category && (
                      <span className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-[#121212]">
                        {it.category}
                      </span>
                    )}
                  </div>
                </div>
              ) : it.kind === 'video' ? (
                <div className="p-2 bg-[#0b1824]">
                  <MediaVideoPlayer url={it.url} mime={it.mime} title={it.title || 'Project Video'} />
                </div>
              ) : it.kind === 'tour3d' ? (
                <div className="p-2 bg-[#0b1824]">
                  <MediaTour3DEmbed url={it.url} mime={it.mime} title={it.title || '3D / 360° Tour'} className="!min-h-[210px] !aspect-[16/10]" />
                </div>
              ) : it.kind === 'floorplan' && (it.mime?.startsWith('image/') || /\.(jpg|jpeg|png|webp)(\?|$)/i.test(it.url)) ? (
                <div className="relative aspect-[16/10] bg-[#f8f5ef] overflow-hidden">
                  <AuthImg
                    src={it.url}
                    alt={it.title || 'Floor plan'}
                    className="h-full w-full object-contain p-2 cursor-zoom-in"
                    onClick={() => setLightbox(it)}
                  />
                  <span className="absolute left-2.5 top-2.5 rounded-full bg-[#121212]/85 px-2.5 py-1 text-[10px] font-bold uppercase text-white">
                    Floor Plan
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 bg-[#f8f5ef] p-6 text-center min-h-[160px]">
                  <span className="grid size-11 place-items-center rounded-xl bg-[#121212] text-white">
                    {iconFor(it.kind)}
                  </span>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted">{it.category || KIND_META[it.kind].label}</div>
                  {it.url.startsWith('/api/files/') ? (
                    <button
                      type="button"
                      onClick={() => void openAuthFile(it.url, it.title || 'document.pdf').catch(e => toast.error(e.message))}
                      className="btn outline sm"
                    >
                      <ExternalLink size={13} /> Open File
                    </button>
                  ) : (
                    <a href={it.url} target="_blank" rel="noopener noreferrer" className="btn outline sm no-underline">
                      <ExternalLink size={13} /> Open Document
                    </a>
                  )}
                </div>
              )}

              {/* Meta & Actions Footer */}
              <div className="p-3 flex flex-col gap-2 flex-1">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-ink truncate">{it.title || KIND_META[it.kind].label}</div>
                  <div className="text-[11px] text-muted truncate">
                    {it.category || KIND_META[it.kind].short}
                    {it.size ? ` · ${(it.size / 1024 / 1024 >= 1 ? `${(it.size / 1024 / 1024).toFixed(1)} MB` : `${Math.round(it.size / 1024)} KB`)}` : ''}
                  </div>
                </div>
                {canEdit && (
                  <div className="mt-auto pt-2 border-t border-line flex items-center gap-1.5">
                    {it.kind === 'photo' && !it.is_cover && (
                      <button
                        type="button"
                        onClick={() => setCover(it.id)}
                        className="btn outline sm !h-7 !px-2 !text-[11px]"
                        title="Set as Cover Photo"
                      >
                        <Star size={12} /> Set Cover
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => moveItem(it.id, -1)}
                      className="btn ghost icon sm !h-7 !w-7"
                      aria-label="Move earlier"
                      title="Move left"
                    >
                      <ArrowLeft size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(it.id, 1)}
                      className="btn ghost icon sm !h-7 !w-7"
                      aria-label="Move later"
                      title="Move right"
                    >
                      <ArrowRight size={13} />
                    </button>
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={() => removeItem(it.id)}
                      className="btn ghost icon sm !h-7 !w-7 text-signal"
                      aria-label="Remove media"
                      title="Remove from gallery"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[220] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            aria-label="Close preview"
            onClick={() => setLightbox(null)}
            className="absolute right-5 top-5 grid size-10 place-items-center rounded-full bg-white/15 text-white border border-white/20 cursor-pointer"
          >
            <X size={18} />
          </button>
          <AuthImg
            src={lightbox.url}
            alt={lightbox.title || 'Preview'}
            className="max-h-[82vh] max-w-[92vw] rounded-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
          {lightbox.title && <div className="mt-3 text-sm font-semibold text-white">{lightbox.title}</div>}
        </div>
      )}
    </div>
  )
}
