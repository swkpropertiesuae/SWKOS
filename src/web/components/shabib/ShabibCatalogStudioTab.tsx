import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  Download,
  Eye,
  Home,
  Landmark,
  Map,
  Palette,
  Plus,
  Save,
  Sparkles,
} from 'lucide-react'
import {
  BROCHURE_PRESETS,
  DEFAULT_BROCHURE_THEME,
  type BrochureCoverLayout,
  type BrochureThemeConfig,
} from '@shared/brochure-theme'
import { get, openAuthFile, post, put } from '../../lib/api'
import { useToast } from '../../lib/toast'
import { CustomSelect } from '../CustomSelect'

type CatalogEntity = 'communities' | 'developers' | 'properties' | 'units'

export function ShabibCatalogStudioTab() {
  const qc = useQueryClient()
  const toast = useToast()
  const [entity, setEntity] = useState<CatalogEntity>('properties')
  const [busy, setBusy] = useState(false)

  // Brochure Theme Customizer state
  const [theme, setTheme] = useState<BrochureThemeConfig>({ ...DEFAULT_BROCHURE_THEME })
  const [selectedRecordId, setSelectedRecordId] = useState<string>('')

  // Unified Creator fields
  const [f, setF] = useState({
    name: '',
    code: '',
    short_name: '',
    title: '',
    project_name: '',
    unit_no: '',
    property_id: '',
    emirate: 'Dubai',
    segment: 'Prime',
    tier: 'Tier-1 Developer',
    property_type: 'Apartment',
    is_off_plan: true,
    price: '',
    rent_annual: '',
    avg_price_sqft: '',
    gross_yield_pct: '7.2',
    bedrooms: '2',
    bathrooms: '2',
    area_sqft: '',
    floor_no: '',
    view: '',
    handover_quarter: 'Q4 2028',
    payment_plan: '60/40',
    payment_plan_summary: '10% Booking · 50% Construction · 40% Handover',
    unit_mix: 'Studio, 1-3 BR Apartments & Penthouses',
    master_developer: '',
    rera_id: '',
    website: '',
    amenities: 'Infinity Pool\nGym & Wellness Spa\nConcierge 24/7\nLandscaped Podium',
    description: '',
    promo_headline: '',
    promo_badge: 'Direct Developer Allocation · 0% Commission',
    cover_image_url: '',
    video_url: '',
    virtual_tour_url: '',
    floor_plan_url: '',
    brochure_url: '',
    ppt_url: '',
  })

  const defaultThemeQ = useQuery({
    queryKey: ['catalog-default-theme'],
    queryFn: () => get<{ theme: BrochureThemeConfig }>('/api/catalog-kit/theme/default'),
  })

  const recordsQ = useQuery({
    queryKey: ['catalog-studio-list', entity],
    queryFn: () => get<{ rows: any[] }>(`/api/e/${entity}`, { pageSize: 150 }),
  })

  const projectsQ = useQuery({
    queryKey: ['catalog-studio-projects-lookup'],
    queryFn: () => get<{ rows: any[] }>('/api/e/properties', { pageSize: 200 }),
  })

  const applyPreset = (presetKey: (typeof BROCHURE_PRESETS)[number]['key']) => {
    const p = BROCHURE_PRESETS.find(x => x.key === presetKey)
    if (!p) return
    setTheme(prev => ({
      ...prev,
      preset: p.key,
      primaryHex: p.primaryHex,
      accentHex: p.accentHex,
      surfaceHex: p.surfaceHex,
      inkHex: p.inkHex,
      coverLayout: p.coverLayout,
    }))
  }

  const createEntityRecord = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const payload: Record<string, any> = {
        entity,
        emirate: f.emirate,
        description: f.description,
        amenities: f.amenities,
        amenities_standard: f.amenities,
        cover_image_url: f.cover_image_url || undefined,
        video_url: f.video_url || undefined,
        virtual_tour_url: f.virtual_tour_url || undefined,
        floor_plan_url: f.floor_plan_url || undefined,
        brochure_url: f.brochure_url || undefined,
        ppt_url: f.ppt_url || undefined,
        theme,
      }
      if (entity === 'communities') {
        Object.assign(payload, {
          name: f.name,
          code: f.code || undefined,
          segment: f.segment,
          master_developer: f.master_developer,
          avg_price_sqft: Number(f.avg_price_sqft) || 1800,
          avg_rent_annual: Number(f.rent_annual) || 120_000,
          gross_yield_pct: Number(f.gross_yield_pct) || 6.8,
        })
      } else if (entity === 'developers') {
        Object.assign(payload, {
          name: f.name,
          code: f.code || undefined,
          short_name: f.short_name || undefined,
          tier: f.tier,
          rera_id: f.rera_id,
          website: f.website,
        })
      } else if (entity === 'properties') {
        Object.assign(payload, {
          title: f.title,
          project_name: f.project_name || f.title.replace(/\s+by\s+.+$/i, '').trim(),
          property_type: f.property_type,
          is_off_plan: f.is_off_plan,
          price: Number(f.price) || 0,
          rent_annual: Number(f.rent_annual) || 0,
          bedrooms: f.bedrooms,
          bathrooms: f.bathrooms,
          area_sqft: Number(f.area_sqft) || undefined,
          handover_quarter: f.handover_quarter,
          payment_plan: f.payment_plan,
          payment_plan_summary: f.payment_plan_summary,
          unit_mix: f.unit_mix,
          promo_headline: f.promo_headline,
          promo_badge: f.promo_badge,
        })
      } else {
        Object.assign(payload, {
          unit_no: f.unit_no,
          property_id: Number(f.property_id),
          sale_price: Number(f.price) || 0,
          rent_annual: Number(f.rent_annual) || 0,
          bedrooms: f.bedrooms,
          bathrooms: f.bathrooms,
          area_sqft: Number(f.area_sqft) || undefined,
          floor_no: f.floor_no,
          view: f.view,
          unit_notes: f.description,
        })
      }
      const res = await post<any>('/api/catalog-kit/create', payload)
      toast.ok(`Created ${entity.slice(0, -1)} #${res.record.id} with custom brochure theme & marketing kit!`)
      setSelectedRecordId(String(res.record.id))
      void qc.invalidateQueries({ queryKey: ['catalog-studio-list', entity] })
    } catch (err: any) {
      toast.error(err.message || 'Could not create record')
    } finally {
      setBusy(false)
    }
  }

  const saveRecordTheme = async () => {
    if (!selectedRecordId) {
      toast.error('Select a record first to save its custom brochure theme')
      return
    }
    setBusy(true)
    try {
      await put(`/api/catalog-kit/${entity}/${selectedRecordId}/theme`, theme)
      toast.ok('Saved custom brochure theme for this record!')
    } catch (err: any) {
      toast.error(err.message || 'Could not save theme')
    } finally {
      setBusy(false)
    }
  }

  const saveDefaultTheme = async () => {
    setBusy(true)
    try {
      await put('/api/catalog-kit/theme/default', theme)
      toast.ok('Saved as SWK Company Default Brochure Theme!')
      void qc.invalidateQueries({ queryKey: ['catalog-default-theme'] })
    } catch (err: any) {
      toast.error(err.message || 'Could not save company default theme')
    } finally {
      setBusy(false)
    }
  }

  const previewQuery = new URLSearchParams({
    preset: theme.preset,
    primary: theme.primaryHex,
    accent: theme.accentHex,
    surface: theme.surfaceHex,
    ink: theme.inkHex,
    layout: theme.coverLayout,
    tagline: theme.headerTagline,
    footerNote: theme.footerNote,
  }).toString()

  const records = recordsQ.data?.rows ?? []
  const previewId = selectedRecordId || (records[0] ? String(records[0].id) : '')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-card p-5 shadow-xs">
        <div>
          <h2 className="m-0 text-[18px] font-bold text-ink flex items-center gap-2">
            <Palette size={18} className="text-[#0e9f6e]" /> Catalog Creator &amp; Brochure Color / Template Customizer
          </h2>
          <p className="m-0 mt-0.5 text-xs text-muted">
            Add any new Community, Developer, Project, or Unit with full specs, amenities &amp; materials — and customize its Brochure colors, layout &amp; template (saved per record + company default).
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'communities', label: 'Community', icon: Map },
            { id: 'developers', label: 'Developer', icon: Landmark },
            { id: 'properties', label: 'Project', icon: Building2 },
            { id: 'units', label: 'Unit', icon: Home },
          ].map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => { setEntity(item.id as CatalogEntity); setSelectedRecordId('') }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold cursor-pointer ${
                entity === item.id ? 'border-[#121212] bg-[#121212] text-[#51fec0]' : 'border-line bg-white text-ink'
              }`}
            >
              <item.icon size={13} /> {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Rich Creator Form */}
        <form onSubmit={createEntityRecord} className="lg:col-span-7 rounded-3xl border border-line bg-card p-5 space-y-4 shadow-xs">
          <h3 className="m-0 text-[15px] font-bold text-ink flex items-center gap-2">
            <Plus size={16} className="text-[#0e9f6e]" /> Add New {entity === 'communities' ? 'Community' : entity === 'developers' ? 'Developer' : entity === 'properties' ? 'Project' : 'Unit'} (Full Materials &amp; Custom Brochure)
          </h3>

          <div className="grid gap-3 sm:grid-cols-2">
            {(entity === 'communities' || entity === 'developers') && (
              <>
                <input className="input" required placeholder={entity === 'communities' ? 'Community Name (e.g. Dubai Creek Harbour) *' : 'Developer Name (e.g. Danube Properties) *'} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
                <input className="input" placeholder="Code (optional, auto-generated)" value={f.code} onChange={e => setF({ ...f, code: e.target.value })} />
              </>
            )}
            {entity === 'developers' && (
              <>
                <input className="input" placeholder="Short Brand Name (e.g. Danube)" value={f.short_name} onChange={e => setF({ ...f, short_name: e.target.value })} />
                <CustomSelect className="select" value={f.tier} onChange={e => setF({ ...f, tier: e.target.value })}>
                  {['Master Developer', 'Tier-1 Developer', 'Luxury Boutique'].map(t => <option key={t} value={t}>{t}</option>)}
                </CustomSelect>
                <input className="input" placeholder="RERA / DMT Developer ID" value={f.rera_id} onChange={e => setF({ ...f, rera_id: e.target.value })} />
                <input className="input" placeholder="Official Website" value={f.website} onChange={e => setF({ ...f, website: e.target.value })} />
              </>
            )}
            {entity === 'communities' && (
              <>
                <input className="input" placeholder="Master Developer (e.g. Emaar)" value={f.master_developer} onChange={e => setF({ ...f, master_developer: e.target.value })} />
                <CustomSelect className="select" value={f.segment} onChange={e => setF({ ...f, segment: e.target.value })}>
                  {['Prime', 'Upper-mid', 'Mid', 'Value'].map(s => <option key={s} value={s}>{s}</option>)}
                </CustomSelect>
                <input type="number" className="input" placeholder="Avg Price / sq ft (AED)" value={f.avg_price_sqft} onChange={e => setF({ ...f, avg_price_sqft: e.target.value })} />
                <input type="number" className="input" placeholder="Gross Yield % (e.g. 7.2)" step="0.1" value={f.gross_yield_pct} onChange={e => setF({ ...f, gross_yield_pct: e.target.value })} />
              </>
            )}
            {entity === 'properties' && (
              <>
                <input className="input" required placeholder="Full Title (<Project> by <Developer>, e.g. Shahrukhz by Danube) *" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
                <input className="input" placeholder="Pure Project Name (e.g. Shahrukhz)" value={f.project_name} onChange={e => setF({ ...f, project_name: e.target.value })} />
                <CustomSelect className="select" value={f.property_type} onChange={e => setF({ ...f, property_type: e.target.value })}>
                  {['Apartment', 'Villa', 'Townhouse', 'Penthouse', 'Studio', 'Duplex', 'Office'].map(t => <option key={t} value={t}>{t}</option>)}
                </CustomSelect>
                <input type="number" className="input" placeholder="Starting Price (AED)" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} />
                <input className="input" placeholder="Handover Quarter (e.g. Q4 2028)" value={f.handover_quarter} onChange={e => setF({ ...f, handover_quarter: e.target.value })} />
                <CustomSelect className="select" value={f.payment_plan} onChange={e => setF({ ...f, payment_plan: e.target.value })}>
                  {['60/40', '70/30', '80/20', '50/50', 'Post-handover 2y', 'Post-handover 3y', '100% on completion'].map(p => <option key={p} value={p}>{p}</option>)}
                </CustomSelect>
                <input className="input sm:col-span-2" placeholder="Payment Plan Summary (e.g. 1% Monthly · 70/30 Post-Handover)" value={f.payment_plan_summary} onChange={e => setF({ ...f, payment_plan_summary: e.target.value })} />
                <input className="input sm:col-span-2" placeholder="Unit Mix (e.g. Studio, 1-3 BR Apartments & Sky Villas)" value={f.unit_mix} onChange={e => setF({ ...f, unit_mix: e.target.value })} />
                <label className="flex items-center gap-2 text-xs font-semibold text-ink">
                  <input type="checkbox" checked={f.is_off_plan} onChange={e => setF({ ...f, is_off_plan: e.target.checked })} /> Active Off-Plan Launch
                </label>
              </>
            )}
            {entity === 'units' && (
              <>
                <input className="input" required placeholder="Unit No. (e.g. 1402-A) *" value={f.unit_no} onChange={e => setF({ ...f, unit_no: e.target.value })} />
                <CustomSelect className="select" value={f.property_id} onChange={e => setF({ ...f, property_id: e.target.value })}>
                  <option value="">Select Parent Project *</option>
                  {(projectsQ.data?.rows ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </CustomSelect>
                <input type="number" className="input" placeholder="Sale Price (AED)" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} />
                <input type="number" className="input" placeholder="Annual Rent (AED)" value={f.rent_annual} onChange={e => setF({ ...f, rent_annual: e.target.value })} />
                <input type="number" className="input" placeholder="Bedrooms" value={f.bedrooms} onChange={e => setF({ ...f, bedrooms: e.target.value })} />
                <input type="number" className="input" placeholder="Area (sq ft)" value={f.area_sqft} onChange={e => setF({ ...f, area_sqft: e.target.value })} />
                <input className="input" placeholder="Floor No." value={f.floor_no} onChange={e => setF({ ...f, floor_no: e.target.value })} />
                <input className="input" placeholder="View (e.g. Sea & Burj Khalifa)" value={f.view} onChange={e => setF({ ...f, view: e.target.value })} />
              </>
            )}
            {entity !== 'units' && (
              <CustomSelect className="select" value={f.emirate} onChange={e => setF({ ...f, emirate: e.target.value })}>
                <option value="Dubai">Dubai (4% DLD)</option>
                <option value="Abu Dhabi">Abu Dhabi (2% ADM)</option>
              </CustomSelect>
            )}
          </div>

          <textarea className="input min-h-[64px]" placeholder="Description / Highlights / Investment Thesis…" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
          <textarea className="input min-h-[60px]" placeholder="Amenities (one per line)…" value={f.amenities} onChange={e => setF({ ...f, amenities: e.target.value })} />

          <div className="grid gap-2.5 sm:grid-cols-2 border-t border-line pt-3">
            <input className="input" placeholder="Cover Photo URL (/media/... or https://...)" value={f.cover_image_url} onChange={e => setF({ ...f, cover_image_url: e.target.value })} />
            <input className="input" placeholder="Video Tour URL (YouTube/Vimeo/MP4)" value={f.video_url} onChange={e => setF({ ...f, video_url: e.target.value })} />
            <input className="input" placeholder="3D / 360° Virtual Tour URL (Matterport/Kuula)" value={f.virtual_tour_url} onChange={e => setF({ ...f, virtual_tour_url: e.target.value })} />
            <input className="input" placeholder="Official Floor Plan / Brochure PDF URL" value={f.brochure_url} onChange={e => setF({ ...f, brochure_url: e.target.value })} />
          </div>

          <button disabled={busy} type="submit" className="btn w-full justify-center bg-[#121212] text-[#51fec0]">
            <Sparkles size={15} /> Create {entity.slice(0, -1)} + Apply Custom Brochure Theme
          </button>
        </form>

        {/* Right: Live Brochure Color, Layout & Template Customizer */}
        <div className="lg:col-span-5 rounded-3xl border border-line bg-card p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="m-0 text-[15px] font-bold text-ink flex items-center gap-2">
              <Palette size={16} className="text-[#8a621c]" /> Brochure Look &amp; Template Customizer
            </h3>
            {defaultThemeQ.data?.theme && (
              <button
                type="button"
                onClick={() => setTheme(defaultThemeQ.data!.theme)}
                className="text-[11px] font-semibold text-[#0e9f6e] underline bg-transparent border-0 cursor-pointer"
              >
                Load Company Default
              </button>
            )}
          </div>

          {/* Live Mini Brochure Cover Preview */}
          <div
            className="rounded-2xl p-4 border shadow-sm transition-all"
            style={{
              background: theme.coverLayout === 'minimal_frame' ? theme.surfaceHex : theme.primaryHex,
              borderColor: theme.accentHex,
              color: theme.coverLayout === 'minimal_frame' ? theme.inkHex : '#FFFFFF',
            }}
          >
            <div className="h-1.5 w-20 rounded-full mb-2.5" style={{ background: theme.accentHex }} />
            <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: theme.accentHex }}>
              {theme.headerTagline || 'SWK PROPERTIES PRIVATE CLIENT EDITION'}
            </div>
            <div className="mt-1 text-lg font-bold leading-snug">
              {f.title || f.name || f.unit_no || 'Shahrukhz by Danube'}
            </div>
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-[11px] font-semibold" style={{ background: theme.surfaceHex, color: theme.primaryHex }}>
              <span>Layout: {theme.coverLayout.replace('_', ' ')}</span>
              <span>·</span>
              <span>{theme.primaryHex} / {theme.accentHex}</span>
            </div>
          </div>

          {/* Presets */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">Luxury Presets</div>
            <div className="grid grid-cols-1 gap-1.5">
              {BROCHURE_PRESETS.map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPreset(p.key)}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-xs cursor-pointer transition-all ${
                    theme.preset === p.key ? 'border-[#121212] bg-soft font-bold' : 'border-line bg-white hover:bg-soft/40'
                  }`}
                >
                  <span>{p.label}</span>
                  <span className="flex items-center gap-1">
                    <span className="size-4 rounded-full border border-black/15" style={{ background: p.primaryHex }} />
                    <span className="size-4 rounded-full border border-black/15" style={{ background: p.accentHex }} />
                    <span className="size-4 rounded-full border border-black/15" style={{ background: p.surfaceHex }} />
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Color Pickers + Layout */}
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <label className="flex items-center justify-between rounded-xl border border-line px-2.5 py-1.5">
              <span>Primary</span>
              <input type="color" value={theme.primaryHex} onChange={e => setTheme({ ...theme, preset: 'custom', primaryHex: e.target.value.toUpperCase() })} />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-line px-2.5 py-1.5">
              <span>Accent</span>
              <input type="color" value={theme.accentHex} onChange={e => setTheme({ ...theme, preset: 'custom', accentHex: e.target.value.toUpperCase() })} />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-line px-2.5 py-1.5">
              <span>Page Surface</span>
              <input type="color" value={theme.surfaceHex} onChange={e => setTheme({ ...theme, preset: 'custom', surfaceHex: e.target.value.toUpperCase() })} />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-line px-2.5 py-1.5">
              <span>Body Ink</span>
              <input type="color" value={theme.inkHex} onChange={e => setTheme({ ...theme, preset: 'custom', inkHex: e.target.value.toUpperCase() })} />
            </label>
          </div>

          <CustomSelect className="select" value={theme.coverLayout} onChange={e => setTheme({ ...theme, coverLayout: e.target.value as BrochureCoverLayout })}>
            <option value="executive_band">Cover Style: Executive Dark Band</option>
            <option value="editorial_split">Cover Style: Editorial Split Canvas</option>
            <option value="minimal_frame">Cover Style: Swiss Minimalist Frame</option>
          </CustomSelect>

          <input className="input text-xs" placeholder="Brochure Header Tagline" value={theme.headerTagline} onChange={e => setTheme({ ...theme, headerTagline: e.target.value })} />
          <input className="input text-xs" placeholder="Optional Custom Footer Note (no personal names)" value={theme.footerNote} onChange={e => setTheme({ ...theme, footerNote: e.target.value })} />

          {/* Target Record for Applying/Previewing Existing Record Theme */}
          <div className="border-t border-line pt-3 space-y-2">
            <label className="text-[11px] font-bold uppercase text-muted">Apply / Preview on Existing {entity.slice(0, -1)}</label>
            <CustomSelect className="select" value={selectedRecordId} onChange={e => setSelectedRecordId(e.target.value)}>
              <option value="">Select {entity.slice(0, -1)} ({records.length})…</option>
              {records.map((r: any) => (
                <option key={r.id} value={r.id}>{r.title || r.name || `Unit ${r.unit_no}`} (#{r.id})</option>
              ))}
            </CustomSelect>
            <div className="grid grid-cols-2 gap-2">
              <button disabled={busy || !selectedRecordId} type="button" onClick={() => void saveRecordTheme()} className="btn green justify-center text-xs">
                <Save size={13} /> Save for Record
              </button>
              <button disabled={busy} type="button" onClick={() => void saveDefaultTheme()} className="btn outline justify-center text-xs">
                <Save size={13} /> Company Default
              </button>
            </div>
            {previewId && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button type="button" onClick={() => void openAuthFile(`/api/catalog-kit/${entity}/${previewId}/brochure.pdf?${previewQuery}`)} className="btn outline justify-center text-xs">
                  <Eye size={13} /> Preview Themed PDF
                </button>
                <button type="button" onClick={() => void openAuthFile(`/api/catalog-kit/${entity}/${previewId}/deck.pptx?${previewQuery}`)} className="btn outline justify-center text-xs">
                  <Download size={13} /> Themed PPTX Deck
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
