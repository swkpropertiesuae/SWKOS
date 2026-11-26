import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Box,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Film,
  Globe,
  Image as ImageIcon,
  Layers,
  Plus,
  Rocket,
  Share2,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { Modal } from '../ui/kit'
import { CustomSelect } from './CustomSelect'
import { RefSelect } from './RefSelect'
import { ShareWithClient } from './ShareWithClient'
import { post, upload } from '../lib/api'
import { useMeta } from '../lib/meta'
import { useToast } from '../lib/toast'

interface UnitDraft {
  unit_no: string
  unit_type: string
  bedrooms: string
  bathrooms: string
  area_sqft: string
  sale_price: string
  view: string
  floor_plan_url: string
}

const PAYMENT_PRESETS = [
  '1% Monthly (Danube Style · 70/30 Post-Handover)',
  '60/40 Construction-Linked',
  '70/30 Construction-Linked',
  '80/20 Construction-Linked',
  '50/50 On Handover',
  'Post-handover 2y',
  'Post-handover 3y',
  '100% on completion',
]

const PROPERTY_TYPES = ['Apartment', 'Office', 'Villa', 'Townhouse', 'Studio', 'Penthouse', 'Duplex', 'Compound', 'Bulk']

export function DeveloperProjectLaunchModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated?: (res: { property: any; websiteListing?: any }) => void
}) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const { can } = useMeta()
  const canWebsite = can('website', 'edit')

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [busy, setBusy] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [launched, setLaunched] = useState<{ property: any; websiteListing?: any; units: any[]; uploadedCount: number } | null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  // Step 1: Project Identity & Payment Plan
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [developerId, setDeveloperId] = useState<number | null>(null)
  const [developerName, setDeveloperName] = useState('')
  const [communityId, setCommunityId] = useState<number | null>(null)
  const [communityName, setCommunityName] = useState('')
  const [buildingName, setBuildingName] = useState('')
  const [propertyType, setPropertyType] = useState('Apartment')
  const [startingPrice, setStartingPrice] = useState('')
  const [completionYear, setCompletionYear] = useState(String(new Date().getFullYear() + 3))
  const [handoverLabel, setHandoverLabel] = useState(`Q4 ${new Date().getFullYear() + 3}`)
  const [paymentPlan, setPaymentPlan] = useState(PAYMENT_PRESETS[0]!)
  const [downPaymentPct, setDownPaymentPct] = useState('10')
  const [commissionPct, setCommissionPct] = useState('5')
  const [furnishing, setFurnishing] = useState('Fully Furnished')
  const [reraPermit, setReraPermit] = useState('')
  const [isExclusive, setIsExclusive] = useState(true)
  const [description, setDescription] = useState('')
  const [features, setFeatures] = useState('')
  const [amenities, setAmenities] = useState('')

  // Step 2: Unit Typologies
  const [units, setUnits] = useState<UnitDraft[]>([
    { unit_no: 'Type-A Studio', unit_type: 'Residential', bedrooms: '0', bathrooms: '1', area_sqft: '460', sale_price: '', view: 'City / Boulevard', floor_plan_url: '' },
    { unit_no: 'Type-B 1BR', unit_type: 'Residential', bedrooms: '1', bathrooms: '2', area_sqft: '820', sale_price: '', view: 'Skyline / Pool', floor_plan_url: '' },
  ])

  // Step 3: Pictures, Videos, 3D Tours & Brochures
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [videoFiles, setVideoFiles] = useState<File[]>([])
  const [model3dFiles, setModel3dFiles] = useState<File[]>([])
  const [floorPlanFiles, setFloorPlanFiles] = useState<File[]>([])
  const [brochureFiles, setBrochureFiles] = useState<File[]>([])
  const [videoUrl, setVideoUrl] = useState('')
  const [virtualTourUrl, setVirtualTourUrl] = useState('')
  const [model3dUrl, setModel3dUrl] = useState('')
  const [floorPlanUrl, setFloorPlanUrl] = useState('')
  const [brochureUrl, setBrochureUrl] = useState('')
  const [extraPhotoUrls, setExtraPhotoUrls] = useState('')

  // Step 4: Website Publishing Options
  const [publishWebsite, setPublishWebsite] = useState(canWebsite)
  const [hotOffer, setHotOffer] = useState(true)
  const [createSpotlight, setCreateSpotlight] = useState(true)

  const addUnit = () =>
    setUnits(u => [
      ...u,
      { unit_no: `Type-${String.fromCharCode(65 + u.length)}`, unit_type: propertyType === 'Office' ? 'Commercial' : 'Residential', bedrooms: '2', bathrooms: '3', area_sqft: '1250', sale_price: '', view: 'Panoramic View', floor_plan_url: '' },
    ])

  const updateUnit = (idx: number, patch: Partial<UnitDraft>) =>
    setUnits(list => list.map((item, i) => (i === idx ? { ...item, ...patch } : item)))

  const removeUnit = (idx: number) => setUnits(list => list.filter((_, i) => i !== idx))

  const submitLaunch = async () => {
    if (!title.trim()) {
      toast.error('Enter the project name (e.g. Shahrukhz by Danube)')
      setStep(1)
      return
    }
    setBusy(true)
    setStatusText('Creating developer project, payment plan & unit mix…')
    try {
      const extraPhotoLinks = extraPhotoUrls
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(s => /^https?:\/\//i.test(s))
        .map((url, idx) => ({ kind: 'photo' as const, url, title: `${title.trim()} Render ${idx + 1}`, category: '3D Render' }))

      const cleanUnits = units
        .filter(u => u.unit_no.trim())
        .map(u => ({
          unit_no: u.unit_no.trim(),
          unit_type: u.unit_type || 'Residential',
          bedrooms: u.bedrooms !== '' ? Number(u.bedrooms) : undefined,
          bathrooms: u.bathrooms !== '' ? Number(u.bathrooms) : undefined,
          area_sqft: u.area_sqft !== '' ? Number(u.area_sqft) : undefined,
          sale_price: u.sale_price !== '' ? Number(u.sale_price) : undefined,
          view: u.view.trim() || undefined,
          floor_plan_url: u.floor_plan_url.trim() || undefined,
        }))

      const res = await post<{ property: any; units: any[]; websiteListing?: any }>('/api/projects/launch', {
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        developer_id: developerId,
        developer_name: developerName.trim() || undefined,
        community_id: communityId,
        community_name: communityName.trim() || undefined,
        building_name: buildingName.trim() || title.trim(),
        property_type: propertyType,
        starting_price: startingPrice ? Number(startingPrice) : undefined,
        completion_year: completionYear ? Number(completionYear) : undefined,
        handover_label: handoverLabel.trim() || undefined,
        payment_plan: paymentPlan.trim() || undefined,
        down_payment_pct: downPaymentPct ? Number(downPaymentPct) : undefined,
        roi_percent: commissionPct ? Number(commissionPct) : 5,
        furnishing,
        rera_permit_no: reraPermit.trim() || undefined,
        is_exclusive: isExclusive,
        description: description.trim() || undefined,
        features: features.trim() || undefined,
        amenities: amenities.trim() || undefined,
        video_url: videoUrl.trim() || undefined,
        virtual_tour_url: virtualTourUrl.trim() || undefined,
        model_3d_url: model3dUrl.trim() || undefined,
        floor_plan_url: floorPlanUrl.trim() || undefined,
        brochure_url: brochureUrl.trim() || undefined,
        media_links: extraPhotoLinks,
        units: cleanUnits,
        publish_to_website: canWebsite && publishWebsite,
        hot_offer: canWebsite && publishWebsite && hotOffer,
        create_spotlight: canWebsite && publishWebsite && createSpotlight,
      })

      // Upload all staged files cleanly into the created Property (and Website Listing if published)
      const batches: { files: File[]; kind: string; category: string }[] = [
        { files: photoFiles, kind: 'photo', category: 'Exterior' },
        { files: videoFiles, kind: 'video', category: 'Project Launch Film' },
        { files: model3dFiles, kind: 'tour3d', category: 'Interactive 3D Model' },
        { files: floorPlanFiles, kind: 'floorplan', category: 'Typical Floor Plate' },
        { files: brochureFiles, kind: 'brochure', category: 'Official Brochure' },
      ].filter(b => b.files.length > 0)

      let uploadedCount = 0
      for (const batch of batches) {
        setStatusText(`Uploading ${batch.files.length} ${batch.kind} file(s)…`)
        await upload(batch.files, { kind: batch.kind, category: batch.category }, `/api/media/properties/${res.property.id}/upload`)
        uploadedCount += batch.files.length
        if (res.websiteListing?.id) {
          await upload(batch.files, { kind: batch.kind, category: batch.category }, `/api/media/website_listings/${res.websiteListing.id}/upload`)
        }
      }

      void qc.invalidateQueries({ queryKey: ['swk-op'] })
      void qc.invalidateQueries({ queryKey: ['swk-ls'] })
      void qc.invalidateQueries({ queryKey: ['website'] })
      void qc.invalidateQueries({ queryKey: ['list', 'properties'] })
      toast.ok(`Developer project "${res.property.title}" launched!`)
      setLaunched({ property: res.property, websiteListing: res.websiteListing, units: res.units ?? [], uploadedCount })
      onCreated?.(res)
    } catch (e: any) {
      toast.error(e.message || 'Could not launch developer project')
    } finally {
      setBusy(false)
      setStatusText('')
    }
  }

  const totalFiles = photoFiles.length + videoFiles.length + model3dFiles.length + floorPlanFiles.length + brochureFiles.length

  return (
    <>
      <Modal
        open
        persistent
        onClose={onClose}
        title={launched ? 'Project Launched Successfully' : 'Launch New Developer Project'}
        width={920}
        footer={
          launched ? (
            <>
              <button type="button" className="btn outline" onClick={onClose}>Close</button>
              <div className="flex-1" />
              <button type="button" className="btn outline" onClick={() => setShareOpen(true)}>
                <Share2 size={14} /> Share Watermarked Client Brochure
              </button>
              <button
                type="button"
                className="btn green"
                onClick={() => { onClose(); nav(`/e/properties/${launched.property.id}`) }}
              >
                <Sparkles size={14} /> Open Project &amp; Media Studio
              </button>
            </>
          ) : (
            <>
              {step > 1 ? (
                <button type="button" className="btn outline" disabled={busy} onClick={() => setStep(s => (s - 1) as any)}>
                  <ChevronLeft size={14} /> Back
                </button>
              ) : (
                <button type="button" className="btn outline" disabled={busy} onClick={onClose}>Cancel</button>
              )}
              <div className="flex-1 text-center text-xs text-muted">{statusText || `Step ${step} of 4`}</div>
              {step < 4 ? (
                <button
                  type="button"
                  className="btn green"
                  onClick={() => {
                    if (step === 1 && !title.trim()) {
                      toast.error('Please enter the Project Name first')
                      return
                    }
                    setStep(s => (s + 1) as any)
                  }}
                >
                  Next <ChevronRight size={14} />
                </button>
              ) : (
                <button type="button" className="btn green" disabled={busy} onClick={() => void submitLaunch()}>
                  <Rocket size={14} /> {busy ? 'Launching Project…' : 'Launch Project Now'}
                </button>
              )}
            </>
          )
        }
      >
        {launched ? (
          <div className="flex flex-col items-center text-center gap-4 py-6">
            <span className="grid size-16 place-items-center rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700">
              <CheckCircle2 size={32} />
            </span>
            <div>
              <h3 className="m-0 font-display text-2xl font-bold text-ink">{launched.property.title}</h3>
              <p className="mt-1 text-sm text-muted">
                Live in <b>Off-Plan Launches</b> and <b>Listing Studio</b> · {launched.units.length} unit typolog{launched.units.length === 1 ? 'y' : 'ies'} · {launched.uploadedCount} uploaded media file(s)
                {launched.websiteListing ? ' · Synced to Website Studio (ready for 1-click Publish & Deploy)' : ''}.
              </p>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 w-full max-w-2xl text-left">
              <div className="rounded-xl border border-line bg-soft/70 p-3.5">
                <div className="text-[11px] font-bold uppercase text-muted">Property Ref</div>
                <div className="mt-1 font-mono text-sm font-bold text-ink">{launched.property.property_no || `#${launched.property.id}`}</div>
              </div>
              <div className="rounded-xl border border-line bg-soft/70 p-3.5">
                <div className="text-[11px] font-bold uppercase text-muted">Client Brochure</div>
                <div className="mt-1 text-xs font-semibold text-emerald-700">Watermarked Photos + 3D + Video Ready</div>
              </div>
              <div className="rounded-xl border border-line bg-soft/70 p-3.5">
                <div className="text-[11px] font-bold uppercase text-muted">Website Studio</div>
                <div className="mt-1 text-xs font-semibold text-ink">{launched.websiteListing ? `Listed (${launched.websiteListing.reference})` : 'Internal OS Only'}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Step Indicator */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { n: 1, label: '1. Project & Developer', icon: <Building2 size={13} /> },
                { n: 2, label: '2. Unit Mix & Prices', icon: <Layers size={13} /> },
                { n: 3, label: '3. Photos, Video & 3D', icon: <Film size={13} /> },
                { n: 4, label: '4. Publish & Share', icon: <Globe size={13} /> },
              ].map(s => (
                <button
                  key={s.n}
                  type="button"
                  onClick={() => (s.n <= step || title.trim()) && setStep(s.n as any)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold border cursor-pointer transition-colors ${
                    step === s.n
                      ? 'bg-[#121212] text-white border-[#121212]'
                      : step > s.n
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-soft/60 text-muted border-line'
                  }`}
                >
                  {s.icon} <span className="truncate">{s.label}</span>
                </button>
              ))}
            </div>

            {/* STEP 1: Project Identity */}
            {step === 1 && (
              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="label">Project Name <span className="req">*</span></label>
                  <input className="input" placeholder="e.g. Shahrukhz by Danube" value={title} onChange={e => setTitle(e.target.value)} />
                </div>
                <div>
                  <label className="label">Property / Asset Type</label>
                  <CustomSelect className="select" value={propertyType} onChange={e => setPropertyType(e.target.value)}>
                    {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </CustomSelect>
                </div>
                <div>
                  <label className="label">Developer (pick or type new)</label>
                  <RefSelect
                    entity="developers"
                    value={developerId}
                    label={developerName}
                    placeholder="e.g. Danube Properties"
                    onChange={(id, lbl) => { setDeveloperId(id); if (lbl !== undefined) setDeveloperName(lbl) }}
                  />
                </div>
                <div>
                  <label className="label">Community / District</label>
                  <RefSelect
                    entity="communities"
                    value={communityId}
                    label={communityName}
                    placeholder="e.g. Sheikh Zayed Road / Al Sufouh"
                    onChange={(id, lbl) => { setCommunityId(id); if (lbl !== undefined) setCommunityName(lbl) }}
                  />
                </div>
                <div>
                  <label className="label">Tower / Building Name</label>
                  <input className="input" placeholder="e.g. Shahrukhz Tower" value={buildingName} onChange={e => setBuildingName(e.target.value)} />
                </div>
                <div>
                  <label className="label">Starting Price (AED)</label>
                  <input className="input" type="number" min={0} placeholder="e.g. 1250000" value={startingPrice} onChange={e => setStartingPrice(e.target.value)} />
                </div>
                <div>
                  <label className="label">Payment Plan</label>
                  <CustomSelect className="select" value={paymentPlan} onChange={e => setPaymentPlan(e.target.value)}>
                    {PAYMENT_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
                  </CustomSelect>
                </div>
                <div>
                  <label className="label">Completion Year / Handover</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input className="input" type="number" min={2025} max={2035} value={completionYear} onChange={e => { setCompletionYear(e.target.value); setHandoverLabel(`Q4 ${e.target.value}`) }} />
                    <input className="input" placeholder="Q4 2029" value={handoverLabel} onChange={e => setHandoverLabel(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="label">Furnishing</label>
                  <CustomSelect className="select" value={furnishing} onChange={e => setFurnishing(e.target.value)}>
                    {['Fully Furnished', 'Semi-Furnished', 'Unfurnished'].map(f => <option key={f} value={f}>{f}</option>)}
                  </CustomSelect>
                </div>
                <div>
                  <label className="label">Down Payment % &amp; Comm. %</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input className="input" type="number" min={0} max={100} placeholder="Down %" value={downPaymentPct} onChange={e => setDownPaymentPct(e.target.value)} />
                    <input className="input" type="number" min={0} max={20} step="0.5" placeholder="Comm %" value={commissionPct} onChange={e => setCommissionPct(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="label">Trakheesi / RERA Permit No.</label>
                  <input className="input" placeholder="Optional permit no." value={reraPermit} onChange={e => setReraPermit(e.target.value)} />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="label">Tagline / Subtitle</label>
                  <input className="input" placeholder="e.g. Iconic celebrity-branded tower on Sheikh Zayed Road with 40+ resort amenities & 1% monthly plan" value={subtitle} onChange={e => setSubtitle(e.target.value)} />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="label">Project Overview &amp; Highlights</label>
                  <textarea className="textarea" rows={3} placeholder="Describe the launch concept, architecture, location connectivity, and investor proposition…" value={description} onChange={e => setDescription(e.target.value)} />
                </div>
                <div className="sm:col-span-1 lg:col-span-2">
                  <label className="label">Key Features &amp; Amenities (one per line or comma-separated)</label>
                  <textarea className="textarea" rows={2} placeholder="Sky Pool, Helipad, Valet Concierge, Business Lounge, 40+ Resort Amenities, Metro Connectivity" value={amenities} onChange={e => setAmenities(e.target.value)} />
                </div>
                <div className="flex flex-col justify-end gap-2">
                  <label className="label">Key Selling Points</label>
                  <input className="input" placeholder="0% Commission, 1% Monthly, Golden Visa" value={features} onChange={e => setFeatures(e.target.value)} />
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer pt-1">
                    <input type="checkbox" className="w-4 h-4 accent-emerald" checked={isExclusive} onChange={e => setIsExclusive(e.target.checked)} />
                    Pin in Off-Plan Spotlight Carousel
                  </label>
                </div>
              </div>
            )}

            {/* STEP 2: Unit Typologies */}
            {step === 2 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-display text-sm font-bold text-ink">Unit Typologies &amp; Starting Inventory</div>
                    <div className="text-xs text-muted">Add the residence or office layouts launched by the developer (you can always add more units later).</div>
                  </div>
                  <button type="button" className="btn outline sm" onClick={addUnit}>
                    <Plus size={14} /> Add Unit Type
                  </button>
                </div>
                <div className="flex flex-col gap-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {units.map((u, idx) => (
                    <div key={idx} className="rounded-xl border border-line bg-soft/50 p-3 grid gap-2 sm:grid-cols-12 items-end">
                      <div className="sm:col-span-3">
                        <label className="label !text-[11px]">Unit / Layout Label</label>
                        <input className="input !h-9 !text-xs" value={u.unit_no} onChange={e => updateUnit(idx, { unit_no: e.target.value })} placeholder="e.g. Executive Office" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="label !text-[11px]">Type</label>
                        <CustomSelect compact className="select !h-9 !text-xs" value={u.unit_type} onChange={e => updateUnit(idx, { unit_type: e.target.value })}>
                          {['Residential', 'Office', 'Commercial', 'Retail', 'Showroom'].map(t => <option key={t} value={t}>{t}</option>)}
                        </CustomSelect>
                      </div>
                      <div className="sm:col-span-1">
                        <label className="label !text-[11px]">Beds</label>
                        <input className="input !h-9 !text-xs" type="number" min={0} value={u.bedrooms} onChange={e => updateUnit(idx, { bedrooms: e.target.value })} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="label !text-[11px]">Area (sq ft)</label>
                        <input className="input !h-9 !text-xs" type="number" min={0} value={u.area_sqft} onChange={e => updateUnit(idx, { area_sqft: e.target.value })} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="label !text-[11px]">Price (AED)</label>
                        <input className="input !h-9 !text-xs" type="number" min={0} value={u.sale_price} onChange={e => updateUnit(idx, { sale_price: e.target.value })} placeholder="From AED" />
                      </div>
                      <div className="sm:col-span-1">
                        <label className="label !text-[11px]">View</label>
                        <input className="input !h-9 !text-xs" value={u.view} onChange={e => updateUnit(idx, { view: e.target.value })} />
                      </div>
                      <div className="sm:col-span-1 flex justify-end">
                        <button type="button" onClick={() => removeUnit(idx)} className="btn ghost icon sm text-signal" aria-label="Remove typology">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {units.length === 0 && (
                    <div className="rounded-xl border border-dashed border-line-strong p-6 text-center text-xs text-muted">
                      No unit typologies added — click <b>Add Unit Type</b> above or continue directly to Media.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 3: Pictures, Videos, 3D Tours & Brochures */}
            {step === 3 && (
              <div className="grid gap-4 md:grid-cols-2">
                {/* Photos Upload */}
                <div className="rounded-2xl border border-line bg-white p-4 flex flex-col gap-2.5">
                  <div className="font-display text-sm font-bold text-ink flex items-center gap-2">
                    <ImageIcon size={15} /> Pictures &amp; Architectural Renders ({photoFiles.length})
                  </div>
                  <label className="block rounded-xl border-2 border-dashed border-line-strong p-4 text-center cursor-pointer hover:bg-hover/50">
                    <input type="file" multiple accept="image/*" hidden onChange={e => { const picked = Array.from(e.target.files ?? []); if (picked.length) setPhotoFiles(p => [...p, ...picked]); e.target.value = '' }} />
                    <Upload size={18} className="mx-auto text-muted" />
                    <div className="mt-1 text-xs font-bold text-ink">Select or drop multiple HD photos</div>
                    <div className="text-[11px] text-muted">First photo becomes the cover · Auto-watermarked for clients</div>
                  </label>
                  {photoFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {photoFiles.map((f, i) => (
                        <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-soft border border-line px-2.5 py-0.5 text-[11px]">
                          {i === 0 ? '★ ' : ''}{f.name.slice(0, 22)}
                          <button type="button" className="border-0 bg-transparent cursor-pointer text-signal p-0" onClick={() => setPhotoFiles(p => p.filter((_, idx) => idx !== i))}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <textarea
                    className="textarea !text-xs"
                    rows={2}
                    placeholder="Or paste HTTPS render image URLs (one per line)…"
                    value={extraPhotoUrls}
                    onChange={e => setExtraPhotoUrls(e.target.value)}
                  />
                </div>

                {/* Videos Upload & Embed */}
                <div className="rounded-2xl border border-line bg-white p-4 flex flex-col gap-2.5">
                  <div className="font-display text-sm font-bold text-ink flex items-center gap-2">
                    <Film size={15} /> Launch Film &amp; Walkthrough Videos ({videoFiles.length})
                  </div>
                  <input
                    className="input !text-xs"
                    type="url"
                    placeholder="YouTube, Vimeo, or MP4 URL (e.g. https://youtu.be/...)"
                    value={videoUrl}
                    onChange={e => setVideoUrl(e.target.value)}
                  />
                  <label className="block rounded-xl border-2 border-dashed border-line-strong p-3.5 text-center cursor-pointer hover:bg-hover/50">
                    <input type="file" multiple accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" hidden onChange={e => { const picked = Array.from(e.target.files ?? []); if (picked.length) setVideoFiles(p => [...p, ...picked]); e.target.value = '' }} />
                    <div className="text-xs font-bold text-ink">Or upload MP4 / WebM video file (up to 50 MB)</div>
                  </label>
                  {videoFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {videoFiles.map((f, i) => (
                        <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-soft border border-line px-2.5 py-0.5 text-[11px]">
                          {f.name.slice(0, 24)}
                          <button type="button" className="border-0 bg-transparent cursor-pointer text-signal p-0" onClick={() => setVideoFiles(p => p.filter((_, idx) => idx !== i))}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3D & 360° Virtual Tours */}
                <div className="rounded-2xl border border-line bg-white p-4 flex flex-col gap-2.5">
                  <div className="font-display text-sm font-bold text-ink flex items-center gap-2">
                    <Box size={15} /> 3D Model &amp; 360° Virtual Tour ({model3dFiles.length})
                  </div>
                  <input
                    className="input !text-xs"
                    type="url"
                    placeholder="Matterport, Kuula, Sketchfab, or Developer 360° Tour URL"
                    value={virtualTourUrl}
                    onChange={e => setVirtualTourUrl(e.target.value)}
                  />
                  <input
                    className="input !text-xs"
                    type="url"
                    placeholder="Optional external .glb / .gltf 3D model URL"
                    value={model3dUrl}
                    onChange={e => setModel3dUrl(e.target.value)}
                  />
                  <label className="block rounded-xl border-2 border-dashed border-line-strong p-3 text-center cursor-pointer hover:bg-hover/50">
                    <input type="file" multiple accept=".glb,.gltf,.usdz" hidden onChange={e => { const picked = Array.from(e.target.files ?? []); if (picked.length) setModel3dFiles(p => [...p, ...picked]); e.target.value = '' }} />
                    <div className="text-xs font-bold text-ink">Or upload .glb / .gltf 3D architectural file</div>
                  </label>
                  {model3dFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {model3dFiles.map((f, i) => (
                        <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-soft border border-line px-2.5 py-0.5 text-[11px]">
                          {f.name.slice(0, 24)}
                          <button type="button" className="border-0 bg-transparent cursor-pointer text-signal p-0" onClick={() => setModel3dFiles(p => p.filter((_, idx) => idx !== i))}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Floor Plans & Official Brochure */}
                <div className="rounded-2xl border border-line bg-white p-4 flex flex-col gap-2.5">
                  <div className="font-display text-sm font-bold text-ink flex items-center gap-2">
                    <FileText size={15} /> Floor Plans &amp; Developer Brochure ({floorPlanFiles.length + brochureFiles.length})
                  </div>
                  <input
                    className="input !text-xs"
                    type="url"
                    placeholder="Floor Plan PDF / Image URL (optional)"
                    value={floorPlanUrl}
                    onChange={e => setFloorPlanUrl(e.target.value)}
                  />
                  <input
                    className="input !text-xs"
                    type="url"
                    placeholder="Official Developer Brochure PDF URL (optional)"
                    value={brochureUrl}
                    onChange={e => setBrochureUrl(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block rounded-xl border border-dashed border-line-strong p-2.5 text-center cursor-pointer hover:bg-hover/50 text-[11px] font-bold">
                      <input type="file" multiple accept="image/*,.pdf" hidden onChange={e => { const picked = Array.from(e.target.files ?? []); if (picked.length) setFloorPlanFiles(p => [...p, ...picked]); e.target.value = '' }} />
                      + Floor Plans ({floorPlanFiles.length})
                    </label>
                    <label className="block rounded-xl border border-dashed border-line-strong p-2.5 text-center cursor-pointer hover:bg-hover/50 text-[11px] font-bold">
                      <input type="file" multiple accept=".pdf,.pptx,.xlsx" hidden onChange={e => { const picked = Array.from(e.target.files ?? []); if (picked.length) setBrochureFiles(p => [...p, ...picked]); e.target.value = '' }} />
                      + Brochures ({brochureFiles.length})
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: Review & Publish */}
            {step === 4 && (
              <div className="grid gap-4 md:grid-cols-12">
                <div className="md:col-span-7 rounded-2xl border border-line bg-soft/60 p-5 flex flex-col gap-2.5 text-sm">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Launch Summary</div>
                  <div className="font-display text-xl font-bold text-ink">{title}</div>
                  <div className="text-xs text-muted">
                    {[developerName || 'Developer', communityName || 'Dubai', propertyType, handoverLabel].filter(Boolean).join(' · ')}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                    <div className="rounded-xl bg-white border border-line p-2.5">
                      <span className="text-muted block">Starting Price</span>
                      <b>{startingPrice ? `AED ${Number(startingPrice).toLocaleString('en-US')}` : 'On Request'}</b>
                    </div>
                    <div className="rounded-xl bg-white border border-line p-2.5">
                      <span className="text-muted block">Payment Plan</span>
                      <b>{paymentPlan}</b>
                    </div>
                    <div className="rounded-xl bg-white border border-line p-2.5">
                      <span className="text-muted block">Unit Typologies</span>
                      <b>{units.filter(u => u.unit_no.trim()).length} layouts</b>
                    </div>
                    <div className="rounded-xl bg-white border border-line p-2.5">
                      <span className="text-muted block">Rich Media Staged</span>
                      <b>{totalFiles} file(s){videoUrl ? ' + Video URL' : ''}{virtualTourUrl ? ' + 3D Tour' : ''}</b>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-5 rounded-2xl border border-line bg-white p-5 flex flex-col gap-3">
                  <div className="font-display text-sm font-bold text-ink flex items-center gap-2">
                    <Globe size={15} /> Public Website Sync (`swkpropertiesuae.com`)
                  </div>
                  {canWebsite ? (
                    <>
                      <label className="flex items-start gap-2.5 text-xs cursor-pointer">
                        <input type="checkbox" className="mt-0.5 w-4 h-4 accent-emerald" checked={publishWebsite} onChange={e => setPublishWebsite(e.target.checked)} />
                        <span><b>Add to Website Studio</b> as an Off-Plan Launch listing (includes all photos, video &amp; 3D tour links).</span>
                      </label>
                      {publishWebsite && (
                        <>
                          <label className="flex items-start gap-2.5 text-xs cursor-pointer pl-6">
                            <input type="checkbox" className="mt-0.5 w-4 h-4 accent-emerald" checked={hotOffer} onChange={e => setHotOffer(e.target.checked)} />
                            <span>Mark as <b>Hot Offer</b> (pinned first on website).</span>
                          </label>
                          <label className="flex items-start gap-2.5 text-xs cursor-pointer pl-6">
                            <input type="checkbox" className="mt-0.5 w-4 h-4 accent-emerald" checked={createSpotlight} onChange={e => setCreateSpotlight(e.target.checked)} />
                            <span>Create <b>Trending Spotlight</b> popup banner.</span>
                          </label>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="text-xs text-muted">
                      Your role publishes to internal SWK OS (Off-Plan Launches, Listing Studio &amp; Watermarked Client Brochures). Owner/Admin can promote it to `swkpropertiesuae.com` in Website Studio.
                    </div>
                  )}
                  <div className="mt-auto rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-[11.5px] text-emerald-900">
                    After launch, you can immediately generate a <b>watermarked client brochure link</b> featuring the SWK 3D viewer, embedded 360° tour, video player, and UAE mortgage calculator.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
      {shareOpen && launched && (
        <ShareWithClient entity="properties" ids={[launched.property.id]} label={launched.property.title} onClose={() => setShareOpen(false)} />
      )}
    </>
  )
}
