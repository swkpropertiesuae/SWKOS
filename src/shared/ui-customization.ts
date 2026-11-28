/**
 * SWK OS — Customise UI & Pin/Drag Workspace Shared Schema, Presets & RBAC Guard
 *
 * Shared cleanly between Fastify server validation and React live theme engine.
 * Security & Architecture invariants:
 *  - Every color is validated strictly against `#RRGGBB` (zero CSS injection).
 *  - Every pinned route is an internal path starting with `/` (never `//`, `/print/`, `/login`).
 *  - Visual `theme` (colors, typography, layout, highlight style) is stored separately from
 *    personal `pinning` (pins, dock position, floating pad coordinates, app order, starred apps)
 *    so pinning NEVER detaches a user from Owner's Company Default theme updates, and Owner's
 *    Company Default NEVER leaks Owner-only module keys to staff or portal accounts.
 */
import {
  canAccessCrmVault,
  canAccessDocumentTemplates,
  canAccessFieldLiveMap,
  canAccessMasterLog,
  canAccessShabibsCorner,
  canAccessSwkAdminLogic,
  canPrintReceptionQr,
  isAllowedPathForRestrictedStaff,
  isRestrictedStaffUser,
} from './swk-staff-access'

export type UiMode = 'light' | 'dark' | 'custom'
export type BgStyle = 'solid' | 'gradient' | 'mesh'
export type FontWeightPreset = '400' | '500' | '600' | '700'
export type FontStylePreset = 'normal' | 'italic'
export type LetterSpacingPreset = 'tight' | 'normal' | 'wide'
export type DensityPreset = 'compact' | 'comfortable' | 'spacious'
export type ShadowStrength = 'none' | 'soft' | 'elevated'
export type HighlightIntensity = 'off' | 'subtle' | 'vivid'
export type DockPosition = 'top' | 'bottom' | 'left' | 'right' | 'hidden'

export interface UiColorConfig {
  background: string
  backgroundAlt: string
  bgStyle: BgStyle
  cardBg: string
  glossCardBg: string
  headerBg: string
  sidebarBg: string
  textPrimary: string
  textBody: string
  textMuted: string
  buttonBg: string
  buttonText: string
  borderColor: string
  accentColor: string
  highlightColor: string
  highlightBg: string
}

export interface UiTypographyConfig {
  bodyFont: string
  headingFont: string
  monoFont: string
  fontSizePx: number
  headingScale: number
  fontWeight: FontWeightPreset
  fontStyle: FontStylePreset
  letterSpacing: LetterSpacingPreset
  uppercaseHeadings: boolean
}

export interface UiLayoutConfig {
  density: DensityPreset
  cardRadiusPx: number
  shadowStrength: ShadowStrength
  showWatermark: boolean
}

export interface UiHighlightConfig {
  enabled: boolean
  intensity: HighlightIntensity
  buttonShimmer: boolean
  focusRingGlow: boolean
}

export interface UiPinnedItem {
  id: string
  label: string
  to: string
  icon?: string
  highlighted?: boolean
  accentColor?: string
}

export interface UiFloatingPadConfig {
  enabled: boolean
  collapsed: boolean
  xPct: number
  yPct: number
}

export interface UiPinningPrefs {
  dockPosition: DockPosition
  pinnedItems: UiPinnedItem[]
  appOrder: string[]
  highlightedAppKeys: string[]
  floatingPad: UiFloatingPadConfig
}

export interface UiThemeConfig {
  presetId: string
  mode: UiMode
  colors: UiColorConfig
  typography: UiTypographyConfig
  layout: UiLayoutConfig
  highlight: UiHighlightConfig
}

export interface UiCustomization extends UiThemeConfig {
  version: 1
  pinning: UiPinningPrefs
}

export interface StoredUserUiPrefs {
  version: 1
  theme: UiThemeConfig | null
  pinning: UiPinningPrefs
}

export interface UiFontOption {
  key: string
  label: string
  category: 'sans' | 'display' | 'serif' | 'mono'
  stack: string
  sample: string
}

export const UI_FONT_CATALOG: readonly UiFontOption[] = [
  {
    key: 'switzer',
    label: 'Switzer (SWK Official)',
    category: 'sans',
    stack: "'Switzer', 'Noto Sans Arabic', system-ui, -apple-system, sans-serif",
    sample: 'Crisp Swiss Luxury Sans',
  },
  {
    key: 'bricolage',
    label: 'Bricolage Grotesque',
    category: 'display',
    stack: "'Bricolage Grotesque Variable', 'Switzer', 'Noto Sans Arabic', system-ui, sans-serif",
    sample: 'Bold Executive Display',
  },
  {
    key: 'plus-jakarta',
    label: 'Plus Jakarta Sans',
    category: 'sans',
    stack: "'Plus Jakarta Sans', 'Switzer', 'Noto Sans Arabic', system-ui, sans-serif",
    sample: 'Clean Modern Geometric',
  },
  {
    key: 'manrope',
    label: 'Manrope',
    category: 'sans',
    stack: "'Manrope Variable', 'Switzer', 'Noto Sans Arabic', system-ui, sans-serif",
    sample: 'Balanced Contemporary UI',
  },
  {
    key: 'geist',
    label: 'Geist Sans',
    category: 'sans',
    stack: "'Geist Variable', 'Switzer', 'Noto Sans Arabic', system-ui, sans-serif",
    sample: 'Ultra-Sharp Tech Precision',
  },
  {
    key: 'instrument-sans',
    label: 'Instrument Sans',
    category: 'display',
    stack: "'Instrument Sans', 'Switzer', 'Noto Sans Arabic', system-ui, sans-serif",
    sample: 'Editorial Architectural Sans',
  },
  {
    key: 'instrument-serif',
    label: 'Instrument Serif',
    category: 'serif',
    stack: "'Instrument Serif', Georgia, 'Times New Roman', serif",
    sample: 'Prestige Luxury Serif',
  },
  {
    key: 'geist-mono',
    label: 'Geist Mono',
    category: 'mono',
    stack: "'Geist Mono Variable', 'JetBrains Mono Variable', ui-monospace, monospace",
    sample: 'AED 4,850,000.00',
  },
  {
    key: 'jetbrains-mono',
    label: 'JetBrains Mono',
    category: 'mono',
    stack: "'JetBrains Mono Variable', 'Geist Mono Variable', ui-monospace, monospace",
    sample: 'ORN 51517 · 8.4% ROI',
  },
  {
    key: 'system',
    label: 'System Native (SF / Segoe)',
    category: 'sans',
    stack: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Arabic', sans-serif",
    sample: 'Native OS Platform Font',
  },
] as const

export const UI_FONT_KEY_SET = new Set<string>(UI_FONT_CATALOG.map(f => f.key))

export function fontStackFor(key: string, fallbackKey = 'switzer'): string {
  return (
    UI_FONT_CATALOG.find(f => f.key === key)?.stack ??
    UI_FONT_CATALOG.find(f => f.key === fallbackKey)?.stack ??
    UI_FONT_CATALOG[0]!.stack
  )
}

export const DEFAULT_UI_THEME: UiThemeConfig = {
  presetId: 'swk-signature',
  mode: 'light',
  colors: {
    background: '#ffffff',
    backgroundAlt: '#fcfbf8',
    bgStyle: 'mesh',
    cardBg: '#ffffff',
    glossCardBg: '#0a0b0e',
    headerBg: '#ffffff',
    sidebarBg: '#ffffff',
    textPrimary: '#0a0b0e',
    textBody: '#2d3139',
    textMuted: '#5c6270',
    buttonBg: '#0a0b0e',
    buttonText: '#ebc97c',
    borderColor: '#eae7e0',
    accentColor: '#d4a955',
    highlightColor: '#d4a955',
    highlightBg: '#fbf6ea',
  },
  typography: {
    bodyFont: 'switzer',
    headingFont: 'bricolage',
    monoFont: 'geist-mono',
    fontSizePx: 15,
    headingScale: 1.0,
    fontWeight: '400',
    fontStyle: 'normal',
    letterSpacing: 'normal',
    uppercaseHeadings: false,
  },
  layout: {
    density: 'comfortable',
    cardRadiusPx: 22,
    shadowStrength: 'elevated',
    showWatermark: true,
  },
  highlight: {
    enabled: true,
    intensity: 'subtle',
    buttonShimmer: true,
    focusRingGlow: true,
  },
}

export const DEFAULT_UI_PINNING: UiPinningPrefs = {
  dockPosition: 'hidden',
  pinnedItems: [],
  appOrder: [],
  highlightedAppKeys: [],
  floatingPad: {
    enabled: false,
    collapsed: false,
    xPct: 82,
    yPct: 72,
  },
}

export const DEFAULT_UI_CUSTOMIZATION: UiCustomization = {
  version: 1,
  ...DEFAULT_UI_THEME,
  pinning: DEFAULT_UI_PINNING,
}

export interface UiPresetDefinition {
  id: string
  name: string
  tagline: string
  swatches: [string, string, string, string]
  theme: UiThemeConfig
}

export const UI_PRESETS: readonly UiPresetDefinition[] = [
  {
    id: 'swk-signature',
    name: 'SWK Signature White & Obsidian',
    tagline: 'Pure white canvas, glossy black cards & Imperial Gold highlights',
    swatches: ['#ffffff', '#0a0b0e', '#d4a955', '#1e6b43'],
    theme: DEFAULT_UI_THEME,
  },
  {
    id: 'obsidian-night-gold',
    name: 'Obsidian Night Gold',
    tagline: 'Deep midnight obsidian workspace with glowing gold accents',
    swatches: ['#090b0f', '#141720', '#ebc97c', '#10b981'],
    theme: {
      presetId: 'obsidian-night-gold',
      mode: 'dark',
      colors: {
        background: '#090b0f',
        backgroundAlt: '#11141d',
        bgStyle: 'gradient',
        cardBg: '#141720',
        glossCardBg: '#050608',
        headerBg: '#0e1017',
        sidebarBg: '#0f121a',
        textPrimary: '#f8fafc',
        textBody: '#d5dde8',
        textMuted: '#94a3b8',
        buttonBg: '#d4a955',
        buttonText: '#0a0b0e',
        borderColor: '#262c3a',
        accentColor: '#ebc97c',
        highlightColor: '#ebc97c',
        highlightBg: '#231e14',
      },
      typography: { ...DEFAULT_UI_THEME.typography },
      layout: { ...DEFAULT_UI_THEME.layout },
      highlight: { enabled: true, intensity: 'vivid', buttonShimmer: true, focusRingGlow: true },
    },
  },
  {
    id: 'dubai-royal-emerald',
    name: 'Dubai Royal Emerald',
    tagline: 'Mint-ivory canvas paired with UAE Emerald & Gold cards',
    swatches: ['#f4faf7', '#0c2a1d', '#1e6b43', '#d4a955'],
    theme: {
      presetId: 'dubai-royal-emerald',
      mode: 'light',
      colors: {
        background: '#f4faf7',
        backgroundAlt: '#e7f5ee',
        bgStyle: 'gradient',
        cardBg: '#ffffff',
        glossCardBg: '#0c2a1d',
        headerBg: '#ffffff',
        sidebarBg: '#f8fcf9',
        textPrimary: '#0a1f16',
        textBody: '#244033',
        textMuted: '#537062',
        buttonBg: '#1e6b43',
        buttonText: '#ffffff',
        borderColor: '#d4e8dd',
        accentColor: '#1e6b43',
        highlightColor: '#d4a955',
        highlightBg: '#ecfdf5',
      },
      typography: { ...DEFAULT_UI_THEME.typography, bodyFont: 'plus-jakarta', headingFont: 'bricolage' },
      layout: { ...DEFAULT_UI_THEME.layout },
      highlight: { enabled: true, intensity: 'subtle', buttonShimmer: true, focusRingGlow: true },
    },
  },
  {
    id: 'warm-arabian-sand',
    name: 'Warm Arabian Sand',
    tagline: 'Luxury desert ivory with espresso cards & editorial serif titles',
    swatches: ['#faf6ee', '#1f1a14', '#c49642', '#96202f'],
    theme: {
      presetId: 'warm-arabian-sand',
      mode: 'light',
      colors: {
        background: '#faf6ee',
        backgroundAlt: '#f2e9d8',
        bgStyle: 'gradient',
        cardBg: '#fffdf9',
        glossCardBg: '#1f1a14',
        headerBg: '#fffcf6',
        sidebarBg: '#f9f3e7',
        textPrimary: '#1f1a14',
        textBody: '#3d342a',
        textMuted: '#736556',
        buttonBg: '#1f1a14',
        buttonText: '#f4d58d',
        borderColor: '#e5dac7',
        accentColor: '#c49642',
        highlightColor: '#c49642',
        highlightBg: '#f8eed9',
      },
      typography: { ...DEFAULT_UI_THEME.typography, bodyFont: 'manrope', headingFont: 'instrument-serif', headingScale: 1.08 },
      layout: { ...DEFAULT_UI_THEME.layout, cardRadiusPx: 18 },
      highlight: { enabled: true, intensity: 'subtle', buttonShimmer: true, focusRingGlow: true },
    },
  },
  {
    id: 'executive-sapphire',
    name: 'Executive Slate & Sapphire',
    tagline: 'Architectural cool slate canvas with crisp cobalt highlights',
    swatches: ['#f4f7fb', '#0f172a', '#2563eb', '#0ea5e9'],
    theme: {
      presetId: 'executive-sapphire',
      mode: 'light',
      colors: {
        background: '#f4f7fb',
        backgroundAlt: '#eaf0f8',
        bgStyle: 'solid',
        cardBg: '#ffffff',
        glossCardBg: '#0f172a',
        headerBg: '#ffffff',
        sidebarBg: '#f8fafd',
        textPrimary: '#0f172a',
        textBody: '#334155',
        textMuted: '#64748b',
        buttonBg: '#0f172a',
        buttonText: '#ffffff',
        borderColor: '#dde5f0',
        accentColor: '#2563eb',
        highlightColor: '#2563eb',
        highlightBg: '#eff6ff',
      },
      typography: { ...DEFAULT_UI_THEME.typography, bodyFont: 'geist', headingFont: 'instrument-sans' },
      layout: { ...DEFAULT_UI_THEME.layout, cardRadiusPx: 16 },
      highlight: { enabled: true, intensity: 'subtle', buttonShimmer: true, focusRingGlow: true },
    },
  },
  {
    id: 'high-contrast-pro',
    name: 'High-Contrast Clarity',
    tagline: 'Extra-large crisp ink, bold borders & vivid amber highlights',
    swatches: ['#ffffff', '#000000', '#d97706', '#111111'],
    theme: {
      presetId: 'high-contrast-pro',
      mode: 'light',
      colors: {
        background: '#ffffff',
        backgroundAlt: '#ffffff',
        bgStyle: 'solid',
        cardBg: '#ffffff',
        glossCardBg: '#000000',
        headerBg: '#ffffff',
        sidebarBg: '#fafafa',
        textPrimary: '#000000',
        textBody: '#111111',
        textMuted: '#374151',
        buttonBg: '#000000',
        buttonText: '#ffffff',
        borderColor: '#111111',
        accentColor: '#d97706',
        highlightColor: '#d97706',
        highlightBg: '#fef3c7',
      },
      typography: {
        ...DEFAULT_UI_THEME.typography,
        bodyFont: 'plus-jakarta',
        headingFont: 'bricolage',
        fontSizePx: 17,
        headingScale: 1.08,
        fontWeight: '600',
      },
      layout: { density: 'spacious', cardRadiusPx: 14, shadowStrength: 'soft', showWatermark: false },
      highlight: { enabled: true, intensity: 'vivid', buttonShimmer: false, focusRingGlow: true },
    },
  },
] as const

const HEX6_RE = /^#[0-9a-fA-F]{6}$/
const SAFE_PATH_RE = /^\/[a-zA-Z0-9/_?=&%-]{0,180}$/

export function isValidHex6(v: unknown): v is string {
  return typeof v === 'string' && HEX6_RE.test(v.trim())
}

function cleanHex(v: unknown, fallback: string): string {
  return isValidHex6(v) ? v.trim().toLowerCase() : fallback
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function isColorDark(hex: string): boolean {
  if (!isValidHex6(hex)) return false
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  // Relative perceptual luminance (YIQ)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq < 135
}

/** Auto-adjust primary/body/muted/border/button text colors so contrast stays crisp against cardBg & buttonBg. */
export function autoContrastThemeColors(colors: UiColorConfig): UiColorConfig {
  const cardDark = isColorDark(colors.cardBg)
  const btnDark = isColorDark(colors.buttonBg)
  return {
    ...colors,
    textPrimary: cardDark ? '#f8fafc' : '#0a0b0e',
    textBody: cardDark ? '#d5dde8' : '#2d3139',
    textMuted: cardDark ? '#94a3b8' : '#5c6270',
    borderColor: cardDark ? '#2a3142' : '#e5e2d9',
    buttonText: btnDark ? '#ffffff' : '#0a0b0e',
  }
}

export function sanitizeUiTheme(input: unknown, base: UiThemeConfig = DEFAULT_UI_THEME): UiThemeConfig {
  if (!input || typeof input !== 'object') return structuredClone(base)
  const raw = input as Record<string, any>
  const c = (raw.colors && typeof raw.colors === 'object' ? raw.colors : {}) as Record<string, any>
  const t = (raw.typography && typeof raw.typography === 'object' ? raw.typography : {}) as Record<string, any>
  const l = (raw.layout && typeof raw.layout === 'object' ? raw.layout : {}) as Record<string, any>
  const h = (raw.highlight && typeof raw.highlight === 'object' ? raw.highlight : {}) as Record<string, any>

  const mode: UiMode = raw.mode === 'dark' || raw.mode === 'custom' || raw.mode === 'light' ? raw.mode : base.mode
  const bgStyle: BgStyle = c.bgStyle === 'solid' || c.bgStyle === 'gradient' || c.bgStyle === 'mesh' ? c.bgStyle : base.colors.bgStyle
  const fontWeight: FontWeightPreset =
    t.fontWeight === '400' || t.fontWeight === '500' || t.fontWeight === '600' || t.fontWeight === '700'
      ? t.fontWeight
      : base.typography.fontWeight
  const fontStyle: FontStylePreset = t.fontStyle === 'italic' || t.fontStyle === 'normal' ? t.fontStyle : base.typography.fontStyle
  const letterSpacing: LetterSpacingPreset =
    t.letterSpacing === 'tight' || t.letterSpacing === 'wide' || t.letterSpacing === 'normal'
      ? t.letterSpacing
      : base.typography.letterSpacing
  const density: DensityPreset =
    l.density === 'compact' || l.density === 'spacious' || l.density === 'comfortable' ? l.density : base.layout.density
  const shadowStrength: ShadowStrength =
    l.shadowStrength === 'none' || l.shadowStrength === 'soft' || l.shadowStrength === 'elevated'
      ? l.shadowStrength
      : base.layout.shadowStrength
  const intensity: HighlightIntensity =
    h.intensity === 'off' || h.intensity === 'subtle' || h.intensity === 'vivid' ? h.intensity : base.highlight.intensity

  const presetId =
    typeof raw.presetId === 'string' && /^[a-z0-9_-]{1,40}$/i.test(raw.presetId) ? raw.presetId : base.presetId

  return {
    presetId,
    mode,
    colors: {
      background: cleanHex(c.background, base.colors.background),
      backgroundAlt: cleanHex(c.backgroundAlt, base.colors.backgroundAlt),
      bgStyle,
      cardBg: cleanHex(c.cardBg, base.colors.cardBg),
      glossCardBg: cleanHex(c.glossCardBg, base.colors.glossCardBg),
      headerBg: cleanHex(c.headerBg, base.colors.headerBg),
      sidebarBg: cleanHex(c.sidebarBg, base.colors.sidebarBg),
      textPrimary: cleanHex(c.textPrimary, base.colors.textPrimary),
      textBody: cleanHex(c.textBody, base.colors.textBody),
      textMuted: cleanHex(c.textMuted, base.colors.textMuted),
      buttonBg: cleanHex(c.buttonBg, base.colors.buttonBg),
      buttonText: cleanHex(c.buttonText, base.colors.buttonText),
      borderColor: cleanHex(c.borderColor, base.colors.borderColor),
      accentColor: cleanHex(c.accentColor, base.colors.accentColor),
      highlightColor: cleanHex(c.highlightColor, base.colors.highlightColor),
      highlightBg: cleanHex(c.highlightBg, base.colors.highlightBg),
    },
    typography: {
      bodyFont: typeof t.bodyFont === 'string' && UI_FONT_KEY_SET.has(t.bodyFont) ? t.bodyFont : base.typography.bodyFont,
      headingFont: typeof t.headingFont === 'string' && UI_FONT_KEY_SET.has(t.headingFont) ? t.headingFont : base.typography.headingFont,
      monoFont: typeof t.monoFont === 'string' && UI_FONT_KEY_SET.has(t.monoFont) ? t.monoFont : base.typography.monoFont,
      fontSizePx: Math.round(clampNum(t.fontSizePx, 12, 20, base.typography.fontSizePx)),
      headingScale: Number(clampNum(t.headingScale, 0.85, 1.3, base.typography.headingScale).toFixed(2)),
      fontWeight,
      fontStyle,
      letterSpacing,
      uppercaseHeadings: typeof t.uppercaseHeadings === 'boolean' ? t.uppercaseHeadings : base.typography.uppercaseHeadings,
    },
    layout: {
      density,
      cardRadiusPx: Math.round(clampNum(l.cardRadiusPx, 8, 32, base.layout.cardRadiusPx)),
      shadowStrength,
      showWatermark: typeof l.showWatermark === 'boolean' ? l.showWatermark : base.layout.showWatermark,
    },
    highlight: {
      enabled: typeof h.enabled === 'boolean' ? h.enabled : base.highlight.enabled,
      intensity,
      buttonShimmer: typeof h.buttonShimmer === 'boolean' ? h.buttonShimmer : base.highlight.buttonShimmer,
      focusRingGlow: typeof h.focusRingGlow === 'boolean' ? h.focusRingGlow : base.highlight.focusRingGlow,
    },
  }
}

export function sanitizeUiPinning(input: unknown, base: UiPinningPrefs = DEFAULT_UI_PINNING): UiPinningPrefs {
  if (!input || typeof input !== 'object') return structuredClone(base)
  const raw = input as Record<string, any>
  const dockPosition: DockPosition =
    raw.dockPosition === 'top' ||
    raw.dockPosition === 'bottom' ||
    raw.dockPosition === 'left' ||
    raw.dockPosition === 'right' ||
    raw.dockPosition === 'hidden'
      ? raw.dockPosition
      : base.dockPosition

  const seenIds = new Set<string>()
  const pinnedItems: UiPinnedItem[] = []
  if (Array.isArray(raw.pinnedItems)) {
    for (const item of raw.pinnedItems) {
      if (!item || typeof item !== 'object') continue
      const to = typeof item.to === 'string' ? item.to.trim() : ''
      if (!to || !SAFE_PATH_RE.test(to) || to.startsWith('//') || to.startsWith('/print') || to === '/login') continue
      const id = (typeof item.id === 'string' && item.id.trim() ? item.id.trim() : to).slice(0, 80)
      if (seenIds.has(id)) continue
      seenIds.add(id)
      const label = String(item.label || to).replace(/\s+/g, ' ').trim().slice(0, 48) || to
      const icon = typeof item.icon === 'string' && /^[a-zA-Z0-9_-]{1,36}$/.test(item.icon) ? item.icon : undefined
      const accentColor = isValidHex6(item.accentColor) ? item.accentColor.toLowerCase() : undefined
      pinnedItems.push({
        id,
        label,
        to,
        ...(icon ? { icon } : {}),
        highlighted: Boolean(item.highlighted),
        ...(accentColor ? { accentColor } : {}),
      })
      if (pinnedItems.length >= 24) break
    }
  } else {
    pinnedItems.push(...base.pinnedItems)
  }

  const appOrder = Array.isArray(raw.appOrder)
    ? Array.from(
        new Set(
          raw.appOrder
            .filter((k: unknown): k is string => typeof k === 'string' && /^[a-z0-9_-]{1,32}$/.test(k))
            .slice(0, 40),
        ),
      )
    : [...base.appOrder]

  const highlightedAppKeys = Array.isArray(raw.highlightedAppKeys)
    ? Array.from(
        new Set(
          raw.highlightedAppKeys
            .filter((k: unknown): k is string => typeof k === 'string' && /^[a-z0-9_-]{1,32}$/.test(k))
            .slice(0, 20),
        ),
      )
    : [...base.highlightedAppKeys]

  const fp = raw.floatingPad && typeof raw.floatingPad === 'object' ? raw.floatingPad : {}
  const floatingPad: UiFloatingPadConfig = {
    enabled: typeof fp.enabled === 'boolean' ? fp.enabled : base.floatingPad.enabled,
    collapsed: typeof fp.collapsed === 'boolean' ? fp.collapsed : base.floatingPad.collapsed,
    xPct: Number(clampNum(fp.xPct, 1, 95, base.floatingPad.xPct).toFixed(1)),
    yPct: Number(clampNum(fp.yPct, 8, 90, base.floatingPad.yPct).toFixed(1)),
  }

  return { dockPosition, pinnedItems, appOrder, highlightedAppKeys, floatingPad }
}

export function resolveUiCustomization(
  companyDefault: UiThemeConfig | null,
  personalTheme: UiThemeConfig | null,
  pinning: UiPinningPrefs | null,
): UiCustomization {
  const effectiveTheme = personalTheme ?? companyDefault ?? DEFAULT_UI_THEME
  return {
    version: 1,
    ...sanitizeUiTheme(effectiveTheme, DEFAULT_UI_THEME),
    pinning: sanitizeUiPinning(pinning, DEFAULT_UI_PINNING),
  }
}

export interface UiAccessUser {
  id?: number | null
  email?: string | null
  name?: string | null
  role?: string | null
  role_name?: string | null
  party_id?: number | null
  permissions?: '*' | Record<string, string[]> | null
}

const PORTAL_PINNABLE_PREFIXES = [
  '/portal',
  '/calendar',
  '/profile',
  '/customise-ui',
  '/workspace-tools',
  '/e/leases',
  '/e/invoices',
  '/e/receipts',
  '/e/maintenance',
  '/e/quotations',
  '/e/jobs',
  '/e/tickets',
]

const MODULE_ROUTE_RULES: Array<[string, string]> = [
  ['/dubai-agency-hub', 'properties'],
  ['/listings', 'properties'],
  ['/offplan', 'properties'],
  ['/smart-search', 'properties'],
  ['/pipeline', 'sales'],
  ['/agents', 'hr'],
  ['/pdc', 'leases'],
  ['/inspect', 'leases'],
  ['/rera', 'compliance'],
  ['/compliance', 'compliance'],
  ['/owners', 'finance'],
  ['/finance', 'finance'],
  ['/reports', 'reports'],
  ['/documents', 'documents'],
  ['/document-tools', 'documents'],
  ['/client-vault', 'documents'],
  ['/mortgage-desk', 'crm'],
  ['/whatsapp', 'crm'],
  ['/website', 'website'],
  ['/ai-training', 'ai'],
  ['/ai', 'ai'],
  ['/my-work', 'projects'],
  ['/work/', 'projects'],
  ['/hr/', 'hr'],
]

const ADMIN_ROUTE_PREFIXES = [
  '/admin',
  '/enterprise/master-os',
  '/recycle-bin',
  '/withdrawals',
  '/automations',
]

/**
 * Shared client + server RBAC check mirroring App.tsx route guards.
 * Determines whether a signed-in user is permitted to pin and open `rawPath`.
 */
export function isRoutePinnableForUser(
  rawPath: string,
  user: UiAccessUser | null | undefined,
  canModule: (module: string, action?: 'view') => boolean,
  entityModuleLookup?: (entityKey: string) => string | undefined,
): boolean {
  if (!user) return false
  const trimmed = String(rawPath || '').trim()
  if (!trimmed || !SAFE_PATH_RE.test(trimmed) || trimmed.startsWith('//')) return false
  const clean = trimmed.split('?')[0] || ''
  if (!clean || clean === '/login' || clean.startsWith('/print') || clean.startsWith('/t/') || clean.startsWith('/l/')) {
    return false
  }

  // Customer Portal accounts: strictly scoped allowlist
  if (user.party_id) {
    return PORTAL_PINNABLE_PREFIXES.some(p => clean === p || clean.startsWith(p + '/'))
  }

  // Hardcoded elevated/special routes
  if (clean === '/shabibs-corner' || clean.startsWith('/shabibs-corner/')) return canAccessShabibsCorner(user)
  if (clean === '/master-log' || clean.startsWith('/master-log/')) return canAccessMasterLog(user)
  if (clean === '/crm-vault' || clean.startsWith('/crm-vault/')) return canAccessCrmVault(user)
  if (clean === '/field-live' || clean.startsWith('/field-live/')) return canAccessFieldLiveMap(user)
  if (clean === '/reception-display' || clean.startsWith('/reception-display/')) return canPrintReceptionQr(user)
  if (clean === '/studio' || clean.startsWith('/studio/')) return canAccessDocumentTemplates(user) && canModule('documents', 'view')
  if (clean === '/command-center' || clean.startsWith('/command-center/')) return canAccessSwkAdminLogic(user) || canPrintReceptionQr(user)

  // Restricted staff allowlist check
  if (isRestrictedStaffUser(user) && !isAllowedPathForRestrictedStaff(clean)) return false

  // Admin-gated prefixes
  if (ADMIN_ROUTE_PREFIXES.some(p => clean === p || clean.startsWith(p + '/'))) {
    return canAccessSwkAdminLogic(user) && canModule('admin', 'view')
  }

  // Generic entity routes /e/:entity or /e/:entity/:id
  if (clean.startsWith('/e/')) {
    const entityKey = clean.split('/')[2] || ''
    if (!/^[a-z0-9_]+$/.test(entityKey)) return false
    if (entityKey === 'universal_approvals' && !canAccessSwkAdminLogic(user)) return false
    if (entityModuleLookup) {
      const mod = entityModuleLookup(entityKey)
      if (!mod) return false
      return canModule(mod, 'view')
    }
    return true
  }

  // Module-gated feature routes
  for (const [prefix, mod] of MODULE_ROUTE_RULES) {
    if (clean === prefix || clean.startsWith(prefix + '/')) {
      return canModule(mod, 'view')
    }
  }

  // General authenticated staff routes (/home, /dashboard, /chat, /phone, /field-duty, /customise-ui, /profile, /calendar, /market, /team, /utilities, /mobile-apps, etc.)
  return true
}

const RESTRICTED_APP_KEYS = new Set(['messages', 'phone', 'attendance', 'tools', 'market_pulse', 'general'])

export function isAppKeyAllowedForUser(
  key: string,
  user: UiAccessUser | null | undefined,
  canModule: (module: string, action?: 'view') => boolean,
): boolean {
  if (!user || user.party_id) return false
  if (isRestrictedStaffUser(user)) return RESTRICTED_APP_KEYS.has(key)
  if (key === 'shabib_corner') return canAccessShabibsCorner(user)
  if (key === 'master_log') return canAccessMasterLog(user)
  if (key === 'admin') return canAccessSwkAdminLogic(user) && canModule('admin', 'view')
  if (key === 'command') return canAccessSwkAdminLogic(user) || canPrintReceptionQr(user)
  return /^[a-z0-9_-]{1,32}$/.test(key)
}

export function filterPinningForUser(
  pinning: UiPinningPrefs,
  user: UiAccessUser | null | undefined,
  canModule: (module: string, action?: 'view') => boolean,
  entityModuleLookup?: (entityKey: string) => string | undefined,
): { pinning: UiPinningPrefs; strippedCount: number } {
  const beforePins = pinning.pinnedItems.length
  const beforeApps = pinning.highlightedAppKeys.length + pinning.appOrder.length
  const pinnedItems = pinning.pinnedItems.filter(p => isRoutePinnableForUser(p.to, user, canModule, entityModuleLookup))
  const highlightedAppKeys = pinning.highlightedAppKeys.filter(k => isAppKeyAllowedForUser(k, user, canModule))
  const appOrder = pinning.appOrder.filter(k => isAppKeyAllowedForUser(k, user, canModule))
  const strippedCount =
    (beforePins - pinnedItems.length) + (beforeApps - highlightedAppKeys.length - appOrder.length)
  return {
    pinning: { ...pinning, pinnedItems, highlightedAppKeys, appOrder },
    strippedCount,
  }
}
