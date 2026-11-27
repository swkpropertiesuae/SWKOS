/**
 * Brochure & Presentation Theme Customization (per-record + company default)
 * Shared by Communities, Developers, Projects, and Units for PDF brochures,
 * Payment Plan PDFs, OOXML PPTX decks, and client share links.
 */
import { assertZeroShabibPublicPayload } from './zero-shabib-guard'

export type BrochurePresetKey =
  | 'emerald_gold'
  | 'navy_platinum'
  | 'swiss_mono'
  | 'desert_champagne'
  | 'burgundy_ivory'
  | 'custom'

export type BrochureCoverLayout = 'executive_band' | 'editorial_split' | 'minimal_frame'

export interface BrochureThemeConfig {
  preset: BrochurePresetKey
  primaryHex: string
  accentHex: string
  surfaceHex: string
  inkHex: string
  coverLayout: BrochureCoverLayout
  headerTagline: string
  footerNote: string
  showPaymentPlan: boolean
  showAmenities: boolean
  showQrCode: boolean
}

export interface BrochurePresetDefinition {
  key: Exclude<BrochurePresetKey, 'custom'>
  label: string
  description: string
  primaryHex: string
  accentHex: string
  surfaceHex: string
  inkHex: string
  coverLayout: BrochureCoverLayout
}

export const BROCHURE_PRESETS: readonly BrochurePresetDefinition[] = [
  {
    key: 'emerald_gold',
    label: 'SWK Emerald & Gold (Classic)',
    description: 'Deep Dubai architectural emerald with brushed champagne gold accents.',
    primaryHex: '#0E3A2F',
    accentHex: '#C8A253',
    surfaceHex: '#F8F6F1',
    inkHex: '#1C2926',
    coverLayout: 'executive_band',
  },
  {
    key: 'navy_platinum',
    label: 'Royal Navy & Platinum',
    description: 'Private banking midnight navy paired with brushed platinum silver.',
    primaryHex: '#0B1F3A',
    accentHex: '#B8C4D4',
    surfaceHex: '#F5F7FA',
    inkHex: '#141E2B',
    coverLayout: 'executive_band',
  },
  {
    key: 'swiss_mono',
    label: 'Swiss Minimalist Noir',
    description: 'High-contrast architectural obsidian, crisp mint accent, gallery white.',
    primaryHex: '#121212',
    accentHex: '#10B981',
    surfaceHex: '#FAFAFA',
    inkHex: '#18181B',
    coverLayout: 'minimal_frame',
  },
  {
    key: 'desert_champagne',
    label: 'Desert Sand & Champagne',
    description: 'Warm Emirati bronze and champagne palette ideal for beachfront & villas.',
    primaryHex: '#3B2C20',
    accentHex: '#D4A857',
    surfaceHex: '#FBF8F3',
    inkHex: '#2A211B',
    coverLayout: 'editorial_split',
  },
  {
    key: 'burgundy_ivory',
    label: 'Royal Burgundy & Ivory',
    description: 'Ultra-luxury branded residence burgundy with warm gold trim.',
    primaryHex: '#4A1525',
    accentHex: '#CFA358',
    surfaceHex: '#FAF6F2',
    inkHex: '#25171B',
    coverLayout: 'editorial_split',
  },
] as const

export const DEFAULT_BROCHURE_THEME: BrochureThemeConfig = {
  preset: 'emerald_gold',
  primaryHex: '#0E3A2F',
  accentHex: '#C8A253',
  surfaceHex: '#F8F6F1',
  inkHex: '#1C2926',
  coverLayout: 'executive_band',
  headerTagline: 'SWK PROPERTIES PRIVATE CLIENT EDITION',
  footerNote: '',
  showPaymentPlan: true,
  showAmenities: true,
  showQrCode: true,
}

export function sanitizeHexColor(raw: unknown, fallback: string): string {
  const s = String(raw ?? '').trim()
  const m = /^#?([0-9a-fA-F]{6})$/.exec(s)
  return m ? `#${m[1]!.toUpperCase()}` : fallback
}

export function hexToRgbUnit(hex: string): [number, number, number] {
  const clean = sanitizeHexColor(hex, '#0E3A2F').slice(1)
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ]
}

export function hexNoHash(hex: string, fallback = '0E3A2F'): string {
  return sanitizeHexColor(hex, `#${fallback}`).slice(1)
}

export function normalizeBrochureTheme(
  input: unknown,
  base: BrochureThemeConfig = DEFAULT_BROCHURE_THEME,
): BrochureThemeConfig {
  let obj: Record<string, any> = {}
  if (typeof input === 'string' && input.trim()) {
    try { obj = JSON.parse(input) } catch { obj = {} }
  } else if (input && typeof input === 'object') {
    obj = input as Record<string, any>
  }

  const presetRaw = String(obj.preset || '').trim() as BrochurePresetKey
  const matchedPreset = BROCHURE_PRESETS.find(p => p.key === presetRaw)
  const effectivePreset: BrochurePresetKey =
    matchedPreset ? matchedPreset.key : presetRaw === 'custom' ? 'custom' : base.preset

  const seed = matchedPreset ?? base
  const layoutRaw = String(obj.coverLayout || '').trim() as BrochureCoverLayout
  const coverLayout: BrochureCoverLayout =
    ['executive_band', 'editorial_split', 'minimal_frame'].includes(layoutRaw)
      ? layoutRaw
      : seed.coverLayout

  const theme: BrochureThemeConfig = {
    preset: effectivePreset,
    primaryHex: sanitizeHexColor(obj.primaryHex ?? (matchedPreset ? matchedPreset.primaryHex : base.primaryHex), seed.primaryHex),
    accentHex: sanitizeHexColor(obj.accentHex ?? (matchedPreset ? matchedPreset.accentHex : base.accentHex), seed.accentHex),
    surfaceHex: sanitizeHexColor(obj.surfaceHex ?? (matchedPreset ? matchedPreset.surfaceHex : base.surfaceHex), seed.surfaceHex),
    inkHex: sanitizeHexColor(obj.inkHex ?? (matchedPreset ? matchedPreset.inkHex : base.inkHex), seed.inkHex),
    coverLayout,
    headerTagline: String(obj.headerTagline ?? base.headerTagline ?? '').trim().slice(0, 120) || DEFAULT_BROCHURE_THEME.headerTagline,
    footerNote: String(obj.footerNote ?? base.footerNote ?? '').trim().slice(0, 180),
    showPaymentPlan: obj.showPaymentPlan !== undefined ? Boolean(obj.showPaymentPlan) : base.showPaymentPlan,
    showAmenities: obj.showAmenities !== undefined ? Boolean(obj.showAmenities) : base.showAmenities,
    showQrCode: obj.showQrCode !== undefined ? Boolean(obj.showQrCode) : base.showQrCode,
  }

  assertZeroShabibPublicPayload(theme, 'Brochure Theme Config')
  return theme
}
