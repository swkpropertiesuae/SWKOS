import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  Megaphone,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react'
import { del, get, post, put } from '../../lib/api'
import { useToast } from '../../lib/toast'
import { fmtDate, todayIso } from '../../lib/format'
import { Badge, ErrorBox, Loading, Modal, useDialogs } from '../../ui/kit'
import { ModuleHeader, Pill } from '../../swk/ui'

interface SocialProfile {
  id: number
  platform: string
  account_name: string
  handle: string
  profile_url?: string
  bio?: string
  posting_cadence?: string
  target_audience?: string
  followers_count: number
  status: string
  assigned_name?: string
  notes?: string
}

interface SocialPost {
  id: number
  profile_id?: number | null
  batch_label: string
  day_number: number
  scheduled_date: string
  scheduled_time: string
  platform: string
  content_pillar: string
  title: string
  caption: string
  hashtags: string
  cta: string
  media_url?: string
  status: string
  assigned_name?: string
  handed_over_by_name?: string
  handed_over_at?: string
  submitted_by_name?: string
  submitted_at?: string
  published_url?: string
  submission_notes?: string
}

interface SocialOverview {
  profiles: SocialProfile[]
  posts: SocialPost[]
  batches: Array<{ batch_label: string; n: number; min_date: string; max_date: string }>
  pillars: string[]
  meenakshi: { id: number; name: string; email: string } | null
  stats: { total: number; draft: number; handedOver: number; scheduled: number; published: number }
}

const PLATFORMS = ['Instagram', 'Facebook', 'LinkedIn', 'TikTok', 'YouTube Shorts', 'X (Twitter)', 'WhatsApp Channel'] as const

function statusTone(status: string): 'oasis' | 'champ' | 'sky' | 'grey' {
  if (status === 'Published') return 'oasis'
  if (status === 'Scheduled') return 'sky'
  if (status === 'Handed Over to Meenakshi') return 'champ'
  return 'grey'
}

export default function SocialMediaPage() {
  const toast = useToast()
  const dlg = useDialogs()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'calendar' | 'meenakshi' | 'batch' | 'profiles'>('calendar')
  const [batchFilter, setBatchFilter] = useState('All')
  const [platFilter, setPlatFilter] = useState('All')

  const q = useQuery({
    queryKey: ['social', 'overview', batchFilter, platFilter],
    queryFn: () => get<SocialOverview>('/api/social/overview', { batch: batchFilter, platform: platFilter }),
  })

  // 30-day batch generator state
  const [startDate, setStartDate] = useState(todayIso())
  const [batchLabel, setBatchLabel] = useState(`${todayIso().slice(0, 7)} · SWK 30-Day Campaign`)
  const [selectedPlats, setSelectedPlats] = useState<string[]>(['Instagram', 'Facebook', 'LinkedIn', 'TikTok'])
  const [postTime, setPostTime] = useState('11:00')
  const [focusAreas, setFocusAreas] = useState('Dubai Creek Harbour, Business Bay, Downtown Dubai, Dubai Marina, JVC')
  const [genBusy, setGenBusy] = useState(false)

  // Handover state
  const [handoverNote, setHandoverNote] = useState('')
  const [handoverBusy, setHandoverBusy] = useState(false)

  // Edit / New Post modal
  const [editingPost, setEditingPost] = useState<Partial<SocialPost> | null>(null)
  const [postBusy, setPostBusy] = useState(false)

  // Meenakshi submission modal
  const [submitTarget, setSubmitTarget] = useState<SocialPost | null>(null)
  const [submitStatus, setSubmitStatus] = useState<'Scheduled' | 'Published'>('Published')
  const [submitUrl, setSubmitUrl] = useState('')
  const [submitNotes, setSubmitNotes] = useState('')
  const [submitBusy, setSubmitBusy] = useState(false)

  // Profile form state
  const [pPlat, setPPlat] = useState<typeof PLATFORMS[number]>('Instagram')
  const [pName, setPName] = useState('')
  const [pHandle, setPHandle] = useState('')
  const [pUrl, setPUrl] = useState('')
  const [pCadence, setPCadence] = useState('Daily (30/month)')
  const [pBio, setPBio] = useState('')
  const [pBusy, setPBusy] = useState(false)

  const refresh = () => void qc.invalidateQueries({ queryKey: ['social'] })

  const meenakshiQueue = useMemo(
    () => (q.data?.posts ?? []).filter(p => p.status === 'Handed Over to Meenakshi' || p.status === 'Scheduled' || p.status === 'Published'),
    [q.data],
  )

  if (q.error) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
  if (!q.data) return <Loading label="Loading SWK Social Media Command Suite…" />

  const d = q.data

  const generate30Days = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPlats.length) { toast.error('Select at least one platform'); return }
    setGenBusy(true)
    try {
      const r = await post<any>('/api/social/generate-30-days', {
        start_date: startDate,
        batch_label: batchLabel.trim(),
        platforms: selectedPlats,
        posting_time: postTime,
        focus_communities: focusAreas,
        days: 30,
      })
      toast.ok(`Created ${r.created_count}-day social schedule (${r.batch_label})`)
      setBatchFilter(r.batch_label)
      setTab('calendar')
      refresh()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setGenBusy(false)
    }
  }

  const handoverToMeenakshi = async () => {
    setHandoverBusy(true)
    try {
      const r = await post<any>('/api/social/handover', {
        batch_label: batchFilter !== 'All' ? batchFilter : undefined,
        handover_note: handoverNote.trim(),
      })
      toast.ok(`Handed over ${r.handed_over_count} post(s) to ${r.assigned_to?.name || 'Meenakshi'} & sent live notification`)
      setHandoverNote('')
      refresh()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setHandoverBusy(false)
    }
  }

  const savePost = async () => {
    if (!editingPost?.title?.trim() || !editingPost.scheduled_date) return
    setPostBusy(true)
    try {
      if (editingPost.id) {
        await put(`/api/social/posts/${editingPost.id}`, editingPost)
        toast.ok('Post updated')
      } else {
        await post('/api/social/posts', editingPost)
        toast.ok('Post scheduled')
      }
      setEditingPost(null)
      refresh()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setPostBusy(false)
    }
  }

  const completeSubmission = async () => {
    if (!submitTarget) return
    setSubmitBusy(true)
    try {
      await post(`/api/social/posts/${submitTarget.id}/submit`, {
        status: submitStatus,
        published_url: submitUrl.trim(),
        submission_notes: submitNotes.trim(),
      })
      toast.ok(`Marked "${submitTarget.title}" as ${submitStatus} & notified Owner`)
      setSubmitTarget(null)
      setSubmitUrl('')
      setSubmitNotes('')
      refresh()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSubmitBusy(false)
    }
  }

  const addProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pName.trim() || !pHandle.trim()) return
    setPBusy(true)
    try {
      await post('/api/social/profiles', {
        platform: pPlat,
        account_name: pName.trim(),
        handle: pHandle.trim(),
        profile_url: pUrl.trim(),
        posting_cadence: pCadence.trim(),
        bio: pBio.trim(),
        status: 'Active',
      })
      toast.ok(`Added ${pPlat} profile (${pHandle})`)
      setPName(''); setPHandle(''); setPUrl(''); setPBio('')
      refresh()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setPBusy(false)
    }
  }

  const copyCaption = async (p: SocialPost) => {
    const full = `${p.title}\n\n${p.caption}\n\n${p.hashtags}`.trim()
    try {
      await navigator.clipboard.writeText(full)
      toast.ok('Caption + hashtags copied for posting')
    } catch {
      toast.error('Clipboard blocked by browser')
    }
  }

  return (
    <div className="fade-in max-w-[1380px] mx-auto pb-8">
      <ModuleHeader
        eyebrow="SWK Brand Marketing & 30-Day Content Operations"
        title="Social Media Management & 30-Day Scheduler"
        subtitle="Manage all SWK brand profiles, build a complete 30-day Dubai real-estate schedule in one sitting, and hand over cleanly to Meenakshi for publishing & tracking."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn green sm"
              onClick={() => setTab('batch')}
            >
              <Sparkles size={14} /> Create 30-Day Schedule
            </button>
            <button
              type="button"
              className="btn outline sm"
              onClick={() => setEditingPost({
                batch_label: batchFilter !== 'All' ? batchFilter : batchLabel,
                day_number: 1,
                scheduled_date: todayIso(),
                scheduled_time: '11:00',
                platform: 'Instagram',
                content_pillar: d.pillars[0] || 'Luxury Listing Showcase',
                title: '',
                caption: '',
                hashtags: '#DubaiRealEstate #SWKProperties',
                cta: 'DM or call +971 56 433 0448',
                status: 'Draft',
              })}
            >
              <Plus size={14} /> Single Post
            </button>
          </div>
        }
      />

      {/* Pipeline KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <div className="card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Managed Profiles</div>
          <div className="text-2xl font-extrabold mt-1">{d.profiles.length}</div>
          <div className="text-xs text-muted mt-0.5">Active brand channels</div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Owner Drafts</div>
          <div className="text-2xl font-extrabold mt-1">{d.stats.draft}</div>
          <div className="text-xs text-muted mt-0.5">Ready to review/handover</div>
        </div>
        <div className="card p-4" style={{ borderColor: 'rgba(200,155,60,0.45)' }}>
          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#9c7118' }}>With Meenakshi</div>
          <div className="text-2xl font-extrabold mt-1">{d.stats.handedOver}</div>
          <div className="text-xs text-muted mt-0.5">Awaiting submission</div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Scheduled</div>
          <div className="text-2xl font-extrabold mt-1">{d.stats.scheduled}</div>
          <div className="text-xs text-muted mt-0.5">Queued on platforms</div>
        </div>
        <div className="card p-4 col-span-2 lg:col-span-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald">Published Live</div>
          <div className="text-2xl font-extrabold mt-1 text-emerald">{d.stats.published}</div>
          <div className="text-xs text-muted mt-0.5">Verified with proof URL</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs mb-4" role="tablist">
        <button type="button" className={tab === 'calendar' ? 'active' : ''} onClick={() => setTab('calendar')}>
          <CalendarDays size={15} className="inline mr-1.5 -mt-0.5" /> 30-Day Schedule ({d.posts.length})
        </button>
        <button type="button" className={tab === 'meenakshi' ? 'active' : ''} onClick={() => setTab('meenakshi')}>
          <UserCheck size={15} className="inline mr-1.5 -mt-0.5" /> Meenakshi Submission Desk ({meenakshiQueue.length})
        </button>
        <button type="button" className={tab === 'batch' ? 'active' : ''} onClick={() => setTab('batch')}>
          <Sparkles size={15} className="inline mr-1.5 -mt-0.5" /> One-Day 30-Post Creator
        </button>
        <button type="button" className={tab === 'profiles' ? 'active' : ''} onClick={() => setTab('profiles')}>
          <Users size={15} className="inline mr-1.5 -mt-0.5" /> Brand Profiles ({d.profiles.length})
        </button>
      </div>

      {/* TAB 1: 30-Day Calendar & Batch Handover */}
      {tab === 'calendar' && (
        <div className="grid gap-4">
          {/* Handover Action Banner */}
          <div
            className="rounded-2xl p-4 sm:p-5 border flex flex-col lg:flex-row lg:items-center justify-between gap-3"
            style={{ background: 'linear-gradient(135deg, #0a1b24 0%, #102a36 100%)', color: '#fff', borderColor: 'rgba(200,155,60,0.4)' }}
          >
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-widest" style={{ color: '#e2b857' }}>
                Owner → Office Admin Submission Workflow
              </div>
              <div className="font-bold text-base mt-0.5">
                Handover Drafts to {d.meenakshi?.name || 'Meenakshi'} ({d.meenakshi?.email || 'meenakshi@swk.properties'})
              </div>
              <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.75)' }}>
                Create &amp; approve all 30 days in one sitting, then click Handover — Meenakshi gets an instant notification and submits every post on schedule.
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              <input
                className="input sm:w-64"
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', borderColor: 'rgba(255,255,255,0.22)' }}
                placeholder="Handover note for Meenakshi (optional)"
                value={handoverNote}
                onChange={e => setHandoverNote(e.target.value)}
              />
              <button
                type="button"
                className="btn green shrink-0"
                disabled={handoverBusy || d.stats.draft === 0}
                onClick={() => void handoverToMeenakshi()}
              >
                <Send size={14} /> {handoverBusy ? 'Handing over…' : `Handover ${d.stats.draft} Draft(s) to Meenakshi`}
              </button>
            </div>
          </div>

          {/* Filter Strip */}
          <div className="card p-3.5 flex flex-wrap gap-2 items-center">
            <select className="select sm:w-auto" value={batchFilter} onChange={e => setBatchFilter(e.target.value)} aria-label="Filter by Campaign Batch">
              <option value="All">All Campaign Batches ({d.batches.length})</option>
              {d.batches.map(b => (
                <option key={b.batch_label} value={b.batch_label}>{b.batch_label} ({b.n} posts)</option>
              ))}
            </select>
            <select className="select sm:w-auto" value={platFilter} onChange={e => setPlatFilter(e.target.value)} aria-label="Filter by Platform">
              <option value="All">All Platforms</option>
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {d.posts.length === 0 ? (
            <div className="card p-10 text-center">
              <Megaphone size={36} className="mx-auto text-emerald mb-3 opacity-80" />
              <h3 className="text-base font-bold m-0">No 30-Day Schedule Created Yet</h3>
              <p className="text-sm text-muted mt-1 mb-4 max-w-md mx-auto">
                Click <b>Create 30-Day Schedule</b> to generate an entire 30-day Dubai property calendar in seconds, edit captions in one sitting, and hand over to Meenakshi.
              </p>
              <button type="button" className="btn green" onClick={() => setTab('batch')}>
                <Sparkles size={15} /> Generate 30-Day Schedule Now
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {d.posts.map(p => (
                <div key={p.id} className="card p-4 flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-[#0a1b24] text-[#e2b857]">
                        DAY {String(p.day_number).padStart(2, '0')}
                      </span>
                      <Badge value={p.platform} tone="teal" />
                      <Pill tone={statusTone(p.status)}>{p.status}</Pill>
                    </div>
                    <span className="text-xs font-mono text-muted whitespace-nowrap">{fmtDate(p.scheduled_date)} · {p.scheduled_time}</span>
                  </div>
                  <h3 className="text-[15px] font-bold m-0 leading-snug">{p.title}</h3>
                  <div className="text-[11px] font-semibold text-emerald">{p.content_pillar}</div>
                  <p className="text-xs text-muted m-0 whitespace-pre-line line-clamp-4 flex-1">{p.caption}</p>
                  {p.hashtags && <div className="text-[11px] text-muted truncate">{p.hashtags}</div>}
                  <div className="flex items-center gap-1.5 pt-2 border-t border-line flex-wrap">
                    <button type="button" className="btn outline sm" onClick={() => setEditingPost(p)}><Pencil size={13} /> Edit</button>
                    <button type="button" className="btn outline sm" onClick={() => void copyCaption(p)}><ClipboardCopy size={13} /> Copy</button>
                    <button
                      type="button"
                      className="btn green sm ml-auto"
                      onClick={() => {
                        setSubmitTarget(p)
                        setSubmitStatus(p.status === 'Scheduled' ? 'Published' : 'Scheduled')
                        setSubmitUrl(p.published_url || '')
                        setSubmitNotes(p.submission_notes || '')
                      }}
                    >
                      <CheckCircle2 size={13} /> Update Status
                    </button>
                    <button
                      type="button"
                      className="btn ghost icon sm text-red-600"
                      onClick={async () => {
                        if (!(await dlg.confirm({ title: 'Delete scheduled post?', message: p.title, danger: true, ok: 'Delete' }))) return
                        await del(`/api/social/posts/${p.id}`)
                        toast.ok('Post deleted')
                        refresh()
                      }}
                      aria-label={`Delete ${p.title}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Meenakshi Submission Desk */}
      {tab === 'meenakshi' && (
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <div>
              <h2 className="text-base font-bold m-0">Meenakshi Publishing &amp; Submission Queue</h2>
              <p className="text-xs text-muted m-0 mt-0.5">
                All posts handed over by Owner for scheduling &amp; publishing. Copy caption + hashtags, upload to the social platform, and record the live link to notify Owner automatically.
              </p>
            </div>
            <Pill tone="champ">Operator: {d.meenakshi?.name || 'Meenakshi'}</Pill>
          </div>
          {meenakshiQueue.length === 0 ? (
            <div className="text-sm text-muted py-10 text-center border border-dashed border-line rounded-xl">
              No posts handed over to Meenakshi yet. Generate a 30-day batch and click <b>Handover to Meenakshi</b>.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Day / Date</th>
                    <th>Platform</th>
                    <th>Post Title &amp; Pillar</th>
                    <th>Status</th>
                    <th>Live URL / Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {meenakshiQueue.map(p => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap">
                        <div className="font-bold text-xs">Day {String(p.day_number).padStart(2, '0')}</div>
                        <div className="text-xs text-muted">{fmtDate(p.scheduled_date)} · {p.scheduled_time}</div>
                      </td>
                      <td><Badge value={p.platform} tone="teal" /></td>
                      <td>
                        <div className="font-semibold text-sm">{p.title}</div>
                        <div className="text-xs text-muted truncate max-w-[260px]">{p.caption}</div>
                      </td>
                      <td><Pill tone={statusTone(p.status)}>{p.status}</Pill></td>
                      <td className="text-xs">
                        {p.published_url ? (
                          <a href={p.published_url} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
                            View Post <ExternalLink size={11} />
                          </a>
                        ) : <span className="text-muted">Not submitted yet</span>}
                        {p.submission_notes && <div className="text-[11px] text-muted mt-0.5">{p.submission_notes}</div>}
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <button type="button" className="btn outline sm" onClick={() => void copyCaption(p)}><ClipboardCopy size={13} /> Copy</button>
                          <button
                            type="button"
                            className="btn green sm"
                            onClick={() => {
                              setSubmitTarget(p)
                              setSubmitStatus('Published')
                              setSubmitUrl(p.published_url || '')
                              setSubmitNotes(p.submission_notes || '')
                            }}
                          >
                            <CheckCircle2 size={13} /> Submit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: One-Day 30-Post Batch Creator */}
      {tab === 'batch' && (
        <form onSubmit={generate30Days} className="card p-5 max-w-2xl grid gap-4">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-emerald" />
            <h2 className="text-base font-bold m-0">Create a Full 30-Day Schedule in One Sitting</h2>
          </div>
          <p className="text-xs text-muted m-0">
            Generates 30 consecutive daily Dubai real-estate posts across your chosen SWK channels (Luxury Showcases, DLD Market Pulse, Off-Plan Launches, ROI Breakdowns, Community Guides &amp; Golden Visa). Edit any card and click <b>Handover to Meenakshi</b>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Campaign / Month Label *</label>
              <input className="input" required value={batchLabel} onChange={e => setBatchLabel(e.target.value)} />
            </div>
            <div>
              <label className="label">Start Date (Day 1) *</label>
              <input className="input" type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Default Dubai Posting Time (GST)</label>
              <input className="input" type="time" value={postTime} onChange={e => setPostTime(e.target.value)} />
            </div>
            <div>
              <label className="label">Priority Dubai Communities</label>
              <input className="input" value={focusAreas} onChange={e => setFocusAreas(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Active Platforms to Rotate Across 30 Days</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {PLATFORMS.map(p => {
                const on = selectedPlats.includes(p)
                return (
                  <button
                    key={p}
                    type="button"
                    className={`btn sm ${on ? 'green' : 'outline'}`}
                    onClick={() => setSelectedPlats(on ? selectedPlats.filter(x => x !== p) : [...selectedPlats, p])}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <button type="submit" className="btn green" disabled={genBusy}>
              <Sparkles size={15} /> {genBusy ? 'Generating 30 Days…' : 'Generate Complete 30-Day Calendar Now'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 4: Brand Profiles Manager */}
      {tab === 'profiles' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <form onSubmit={addProfile} className="card p-4 sm:p-5 lg:col-span-4 grid gap-3 self-start">
            <h2 className="text-base font-bold m-0">Add SWK Social Profile</h2>
            <div>
              <label className="label">Platform</label>
              <select className="select" value={pPlat} onChange={e => setPPlat(e.target.value as any)}>
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Account Display Name *</label>
              <input className="input" required value={pName} onChange={e => setPName(e.target.value)} placeholder="e.g. SWK Properties Dubai" />
            </div>
            <div>
              <label className="label">Handle / Page Slug *</label>
              <input className="input" required value={pHandle} onChange={e => setPHandle(e.target.value)} placeholder="@swkpropertiesuae" />
            </div>
            <div>
              <label className="label">Profile URL</label>
              <input className="input" value={pUrl} onChange={e => setPUrl(e.target.value)} placeholder="https://instagram.com/swkpropertiesuae" />
            </div>
            <div>
              <label className="label">Posting Cadence</label>
              <input className="input" value={pCadence} onChange={e => setPCadence(e.target.value)} />
            </div>
            <div>
              <label className="label">Brand Bio</label>
              <textarea className="textarea" rows={3} value={pBio} onChange={e => setPBio(e.target.value)} />
            </div>
            <button type="submit" className="btn green" disabled={pBusy}>
              <Plus size={15} /> {pBusy ? 'Adding…' : 'Save Social Profile'}
            </button>
          </form>

          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-3.5 content-start">
            {d.profiles.map(pr => (
              <div key={pr.id} className="card p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Badge value={pr.platform} tone="teal" />
                    <h3 className="text-base font-bold m-0 mt-1.5">{pr.account_name}</h3>
                    <div className="text-xs font-mono text-emerald">{pr.handle}</div>
                  </div>
                  <Pill tone={pr.status === 'Active' ? 'oasis' : 'champ'}>{pr.status}</Pill>
                </div>
                {pr.bio && <p className="text-xs text-muted m-0 leading-relaxed">{pr.bio}</p>}
                <div className="text-xs text-muted pt-2 border-t border-line flex flex-wrap gap-x-3 gap-y-1">
                  <span><b>Cadence:</b> {pr.posting_cadence || 'Daily'}</span>
                  <span><b>Handler:</b> {pr.assigned_name || 'Meenakshi'}</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  {pr.profile_url ? (
                    <a href={pr.profile_url} target="_blank" rel="noreferrer" className="link text-xs inline-flex items-center gap-1">
                      Open Channel <ExternalLink size={11} />
                    </a>
                  ) : <span />}
                  <button
                    type="button"
                    className="btn ghost icon sm text-red-600"
                    onClick={async () => {
                      if (!(await dlg.confirm({ title: 'Remove profile?', message: `${pr.platform} (${pr.handle})`, danger: true, ok: 'Remove' }))) return
                      await del(`/api/social/profiles/${pr.id}`)
                      toast.ok('Profile removed')
                      refresh()
                    }}
                    aria-label={`Remove ${pr.handle}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit / Create Post Modal */}
      <Modal
        open={!!editingPost}
        onClose={() => setEditingPost(null)}
        title={editingPost?.id ? `Edit Day ${editingPost.day_number} Post` : 'Schedule Social Media Post'}
        width={680}
        footer={
          <>
            <button type="button" className="btn outline" onClick={() => setEditingPost(null)}>Cancel</button>
            <div className="flex-1" />
            <button type="button" className="btn green" disabled={postBusy} onClick={() => void savePost()}>
              {postBusy ? 'Saving…' : 'Save Post'}
            </button>
          </>
        }
      >
        {editingPost && (
          <div className="grid gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Scheduled Date *</label>
                <input className="input" type="date" value={editingPost.scheduled_date ?? ''} onChange={e => setEditingPost({ ...editingPost, scheduled_date: e.target.value })} />
              </div>
              <div>
                <label className="label">Time (GST)</label>
                <input className="input" type="time" value={editingPost.scheduled_time ?? '11:00'} onChange={e => setEditingPost({ ...editingPost, scheduled_time: e.target.value })} />
              </div>
              <div>
                <label className="label">Platform</label>
                <select className="select" value={editingPost.platform ?? 'Instagram'} onChange={e => setEditingPost({ ...editingPost, platform: e.target.value })}>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Post Title *</label>
                <input className="input" value={editingPost.title ?? ''} onChange={e => setEditingPost({ ...editingPost, title: e.target.value })} />
              </div>
              <div>
                <label className="label">Content Pillar</label>
                <select className="select" value={editingPost.content_pillar ?? d.pillars[0]} onChange={e => setEditingPost({ ...editingPost, content_pillar: e.target.value })}>
                  {d.pillars.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Caption</label>
              <textarea className="textarea" rows={5} value={editingPost.caption ?? ''} onChange={e => setEditingPost({ ...editingPost, caption: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Hashtags</label>
                <input className="input" value={editingPost.hashtags ?? ''} onChange={e => setEditingPost({ ...editingPost, hashtags: e.target.value })} />
              </div>
              <div>
                <label className="label">Media Asset URL (optional)</label>
                <input className="input" value={editingPost.media_url ?? ''} onChange={e => setEditingPost({ ...editingPost, media_url: e.target.value })} placeholder="https://… or Drive/Canva link" />
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Meenakshi Submission Modal */}
      <Modal
        open={!!submitTarget}
        onClose={() => setSubmitTarget(null)}
        title={submitTarget ? `Submit / Publish — Day ${submitTarget.day_number} (${submitTarget.platform})` : ''}
        width={540}
        footer={
          <>
            <button type="button" className="btn outline" onClick={() => setSubmitTarget(null)}>Cancel</button>
            <div className="flex-1" />
            <button type="button" className="btn green" disabled={submitBusy} onClick={() => void completeSubmission()}>
              <CheckCircle2 size={15} /> {submitBusy ? 'Updating…' : `Mark as ${submitStatus}`}
            </button>
          </>
        }
      >
        {submitTarget && (
          <div className="grid gap-3">
            <div className="rounded-xl border border-line bg-soft p-3 text-xs">
              <div className="font-bold text-sm text-ink">{submitTarget.title}</div>
              <div className="text-muted mt-1">{fmtDate(submitTarget.scheduled_date)} at {submitTarget.scheduled_time} GST</div>
            </div>
            <div>
              <label className="label">Submission Status</label>
              <select className="select" value={submitStatus} onChange={e => setSubmitStatus(e.target.value as any)}>
                <option value="Scheduled">Scheduled on Platform</option>
                <option value="Published">Published Live</option>
              </select>
            </div>
            <div>
              <label className="label">Live Post / Scheduler URL (optional)</label>
              <input className="input" value={submitUrl} onChange={e => setSubmitUrl(e.target.value)} placeholder="https://instagram.com/p/..." />
            </div>
            <div>
              <label className="label">Submission Notes for Owner</label>
              <textarea className="textarea" rows={3} value={submitNotes} onChange={e => setSubmitNotes(e.target.value)} placeholder="e.g. Scheduled in Meta Business Suite with Reel cover" />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
