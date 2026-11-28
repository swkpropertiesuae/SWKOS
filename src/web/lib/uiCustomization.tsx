/**
 * SWK OS — Live Customise UI Provider & DOM Engine
 *
 * Applies colors, typography, layout, highlight emphasis, pinned dock, and draggable
 * floating quick-pad live across the workspace with:
 *  - Zero-flash user-scoped localStorage hydration (`swk.ui.prefs.v1:<userId>:<demo>`)
 *  - Full DB sync via `/api/auth/ui-preferences` (sparse `theme` vs `pinning`)
 *  - Strict `/print/*` immunity so official invoices/PDFs stay pure corporate letterhead
 *  - Clean undo stack + cross-user logout/401 wipe
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import { useMeta } from './meta'
import { del, get, put } from './api'
import { useToast } from './toast'
import {
  DEFAULT_UI_CUSTOMIZATION,
  DEFAULT_UI_PINNING,
  DEFAULT_UI_THEME,
  UI_PRESETS,
  autoContrastThemeColors,
  fontStackFor,
  isColorDark,
  isRoutePinnableForUser,
  resolveUiCustomization,
  sanitizeUiPinning,
  sanitizeUiTheme,
  type DockPosition,
  type UiColorConfig,
  type UiCustomization,
  type UiHighlightConfig,
  type UiLayoutConfig,
  type UiPinnedItem,
  type UiPinningPrefs,
  type UiThemeConfig,
  type UiTypographyConfig,
} from '@shared/ui-customization'

interface ServerUiPrefsResponse {
  ok: boolean
  isOwner: boolean
  hasPersonalTheme: boolean
  hasCompanyDefault: boolean
  companyDefault: UiThemeConfig | null
  personalTheme: UiThemeConfig | null
  pinning: UiPinningPrefs
  effectivePrefs: UiCustomization
  strippedCount?: number
}

interface UiCustomizationCtx {
  prefs: UiCustomization
  hasPersonalTheme: boolean
  hasCompanyDefault: boolean
  companyDefault: UiThemeConfig | null
  isOwner: boolean
  saving: boolean
  canUndo: boolean
  drawerOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
  toggleDrawer: () => void
  applyPreset: (presetId: string) => void
  updateColors: (patch: Partial<UiColorConfig>) => void
  autoFixContrast: () => void
  updateTypography: (patch: Partial<UiTypographyConfig>) => void
  updateLayout: (patch: Partial<UiLayoutConfig>) => void
  updateHighlight: (patch: Partial<UiHighlightConfig>) => void
  setMode: (mode: UiThemeConfig['mode']) => void
  undoTheme: () => void
  saveNow: () => Promise<void>
  resetThemeToCompanyDefault: () => Promise<void>
  resetAllPreferences: () => Promise<void>
  applyAsCompanyDefault: () => Promise<void>
  clearCompanyDefault: () => Promise<void>
  importThemeJson: (rawJson: string) => boolean
  // Pinning & Dragging controls (never freeze user's theme!)
  setDockPosition: (pos: DockPosition) => void
  togglePinItem: (item: UiPinnedItem) => void
  removePin: (id: string) => void
  togglePinHighlight: (id: string) => void
  setPinAccentColor: (id: string, hex: string | undefined) => void
  reorderPins: (fromIdx: number, toIdx: number) => void
  isPinned: (to: string) => boolean
  setAppOrder: (order: string[]) => void
  resetAppOrder: () => void
  toggleAppHighlight: (appKey: string) => void
  updateFloatingPad: (patch: Partial<UiPinningPrefs['floatingPad']>) => void
}

const UiCustomizationContext = createContext<UiCustomizationCtx | null>(null)

export function useUiCustomization(): UiCustomizationCtx {
  const ctx = useContext(UiCustomizationContext)
  if (!ctx) throw new Error('useUiCustomization must be used inside UiCustomizationProvider')
  return ctx
}

const STORAGE_PREFIX = 'swk.ui.prefs.v1:'
const storageKeyFor = (userId: number, demo?: boolean) => `${STORAGE_PREFIX}${userId}:${demo ? '1' : '0'}`

const MANAGED_CSS_VARS = [
  '--bg',
  '--workspace-ground',
  '--card',
  '--card-glass',
  '--line',
  '--line-strong',
  '--soft',
  '--hover',
  '--ink',
  '--ink-primary',
  '--body',
  '--ink-secondary',
  '--muted',
  '--ink-muted',
  '--ink-subtle',
  '--logo-gold',
  '--focus',
  '--ring',
  '--radius',
  '--font-sans',
  '--font-display',
  '--font-mono',
  '--background',
  '--foreground',
  '--card-foreground',
  '--border',
  '--muted-foreground',
  '--swk-ui-bg-image',
  '--swk-ui-gloss-bg',
  '--swk-ui-header-bg',
  '--swk-ui-sidebar-bg',
  '--swk-ui-btn-bg',
  '--swk-ui-btn-text',
  '--swk-ui-accent',
  '--swk-ui-highlight',
  '--swk-ui-highlight-bg',
  '--swk-ui-font-size',
  '--swk-ui-heading-scale',
  '--swk-ui-font-weight',
  '--swk-ui-font-style',
  '--swk-ui-letter-spacing',
  '--swk-ui-card-shadow',
] as const

function clearDomCustomTheme() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.removeAttribute('data-ui-customized')
  root.removeAttribute('data-ui-mode')
  root.removeAttribute('data-ui-density')
  root.removeAttribute('data-ui-highlight')
  root.removeAttribute('data-ui-uppercase-headings')
  root.removeAttribute('data-ui-shimmer')
  root.removeAttribute('data-ui-focus-glow')
  root.removeAttribute('data-ui-watermark')
  root.dataset.theme = 'light'
  for (const v of MANAGED_CSS_VARS) root.style.removeProperty(v)
}

function applyDomCustomTheme(prefs: UiCustomization, active: boolean) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (!active) {
    clearDomCustomTheme()
    return
  }

  const { colors, typography, layout, highlight } = prefs
  const darkSurface = prefs.mode === 'dark' || isColorDark(colors.background)
  root.dataset.theme = darkSurface ? 'dark' : 'light'
  root.setAttribute('data-ui-customized', '1')
  root.setAttribute('data-ui-mode', prefs.mode)
  root.setAttribute('data-ui-density', layout.density)
  root.setAttribute('data-ui-highlight', highlight.enabled ? highlight.intensity : 'off')
  root.setAttribute('data-ui-uppercase-headings', typography.uppercaseHeadings ? '1' : '0')
  root.setAttribute('data-ui-shimmer', highlight.buttonShimmer ? '1' : '0')
  root.setAttribute('data-ui-focus-glow', highlight.enabled && highlight.focusRingGlow ? '1' : '0')
  root.setAttribute('data-ui-watermark', layout.showWatermark ? '1' : '0')

  const bgImage =
    colors.bgStyle === 'solid'
      ? 'none'
      : colors.bgStyle === 'gradient'
        ? `linear-gradient(145deg, ${colors.background} 0%, ${colors.backgroundAlt} 100%)`
        : `radial-gradient(960px 520px at 8% -4%, ${colors.accentColor}22, transparent 62%), radial-gradient(840px 480px at 94% 4%, ${colors.highlightColor}1c, transparent 60%), linear-gradient(180deg, ${colors.background} 0%, ${colors.backgroundAlt} 100%)`

  const shadowCss =
    layout.shadowStrength === 'none'
      ? 'none'
      : layout.shadowStrength === 'soft'
        ? '0 8px 22px -12px rgba(10, 11, 14, 0.14), 0 1px 3px rgba(10, 11, 14, 0.05)'
        : '0 22px 54px -18px rgba(10, 11, 14, 0.22), 0 4px 14px -4px rgba(10, 11, 14, 0.08)'

  const letterSpacingCss =
    typography.letterSpacing === 'tight'
      ? '-0.025em'
      : typography.letterSpacing === 'wide'
        ? '0.03em'
        : '-0.01em'

  const set = (k: string, v: string) => root.style.setProperty(k, v)
  set('--bg', colors.background)
  set('--workspace-ground', colors.background)
  set('--background', colors.background)
  set('--card', colors.cardBg)
  set('--card-glass', colors.cardBg)
  set('--line', colors.borderColor)
  set('--line-strong', colors.borderColor)
  set('--border', colors.borderColor)
  set('--soft', colors.backgroundAlt)
  set('--hover', colors.highlightBg)
  set('--ink', colors.textPrimary)
  set('--ink-primary', colors.textPrimary)
  set('--foreground', colors.textPrimary)
  set('--card-foreground', colors.textPrimary)
  set('--body', colors.textBody)
  set('--ink-secondary', colors.textBody)
  set('--muted', colors.textMuted)
  set('--ink-muted', colors.textMuted)
  set('--ink-subtle', colors.textMuted)
  set('--muted-foreground', colors.textMuted)
  set('--logo-gold', colors.accentColor)
  set('--focus', colors.highlightColor)
  set('--ring', colors.highlightColor)
  set('--radius', `${layout.cardRadiusPx}px`)
  set('--font-sans', fontStackFor(typography.bodyFont, 'switzer'))
  set('--font-display', fontStackFor(typography.headingFont, 'bricolage'))
  set('--font-mono', fontStackFor(typography.monoFont, 'geist-mono'))

  set('--swk-ui-bg-image', bgImage)
  set('--swk-ui-gloss-bg', colors.glossCardBg)
  set('--swk-ui-header-bg', colors.headerBg)
  set('--swk-ui-sidebar-bg', colors.sidebarBg)
  set('--swk-ui-btn-bg', colors.buttonBg)
  set('--swk-ui-btn-text', colors.buttonText)
  set('--swk-ui-accent', colors.accentColor)
  set('--swk-ui-highlight', colors.highlightColor)
  set('--swk-ui-highlight-bg', colors.highlightBg)
  set('--swk-ui-font-size', `${typography.fontSizePx}px`)
  set('--swk-ui-heading-scale', String(typography.headingScale))
  set('--swk-ui-font-weight', typography.fontWeight)
  set('--swk-ui-font-style', typography.fontStyle)
  set('--swk-ui-letter-spacing', letterSpacingCss)
  set('--swk-ui-card-shadow', shadowCss)
}

function themeFromPrefs(p: UiCustomization): UiThemeConfig {
  return {
    presetId: p.presetId,
    mode: p.mode,
    colors: p.colors,
    typography: p.typography,
    layout: p.layout,
    highlight: p.highlight,
  }
}

export function UiCustomizationProvider({ children }: { children: ReactNode }) {
  const { me, meta, can } = useMeta()
  const loc = useLocation()
  const toast = useToast()

  const [companyDefault, setCompanyDefault] = useState<UiThemeConfig | null>(null)
  const [personalTheme, setPersonalTheme] = useState<UiThemeConfig | null>(null)
  const [pinning, setPinning] = useState<UiPinningPrefs>(() => structuredClone(DEFAULT_UI_PINNING))
  const [isOwner, setIsOwner] = useState(false)
  const [saving, setSaving] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [undoStack, setUndoStack] = useState<Array<UiThemeConfig | null>>([])

  const themeTimer = useRef<number | null>(null)
  const pinTimer = useRef<number | null>(null)
  const pendingThemeRef = useRef<UiThemeConfig | null | undefined>(undefined)
  const pendingPinningRef = useRef<UiPinningPrefs | undefined>(undefined)

  const isPrintRoute =
    loc.pathname.startsWith('/print') ||
    loc.pathname.startsWith('/t/') ||
    loc.pathname.startsWith('/l/') ||
    loc.pathname === '/accept-invite'

  const effectivePrefs = useMemo(
    () => resolveUiCustomization(companyDefault, personalTheme, pinning),
    [companyDefault, personalTheme, pinning],
  )
  const hasPersonalTheme = personalTheme !== null
  const hasCompanyDefault = companyDefault !== null
  const shouldApplyCustomDom = Boolean(me && !isPrintRoute && (hasPersonalTheme || hasCompanyDefault))

  // Apply or strip DOM custom variables whenever prefs or route changes
  useEffect(() => {
    applyDomCustomTheme(effectivePrefs, shouldApplyCustomDom)
  }, [effectivePrefs, shouldApplyCustomDom])

  // Persist user-scoped snapshot to localStorage for zero-flash next boot
  const persistLocalSnapshot = useCallback(
    (
      userId: number,
      demo: boolean | undefined,
      snap: { companyDefault: UiThemeConfig | null; personalTheme: UiThemeConfig | null; pinning: UiPinningPrefs; isOwner: boolean },
    ) => {
      try {
        localStorage.setItem(storageKeyFor(userId, demo), JSON.stringify(snap))
      } catch {
        /* ignore quota */
      }
    },
    [],
  )

  const clearTimers = useCallback(() => {
    if (themeTimer.current !== null) {
      window.clearTimeout(themeTimer.current)
      themeTimer.current = null
    }
    if (pinTimer.current !== null) {
      window.clearTimeout(pinTimer.current)
      pinTimer.current = null
    }
    pendingThemeRef.current = undefined
    pendingPinningRef.current = undefined
  }, [])

  // Hydrate per-user localStorage immediately + fetch authoritative server state
  useEffect(() => {
    clearTimers()
    setUndoStack([])
    if (!me?.id) {
      setCompanyDefault(null)
      setPersonalTheme(null)
      setPinning(structuredClone(DEFAULT_UI_PINNING))
      setIsOwner(false)
      setDrawerOpen(false)
      clearDomCustomTheme()
      return
    }
    let cancelled = false
    const key = storageKeyFor(me.id, me.demo)
    try {
      const cached = localStorage.getItem(key)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed && typeof parsed === 'object') {
          setCompanyDefault(parsed.companyDefault ? sanitizeUiTheme(parsed.companyDefault) : null)
          setPersonalTheme(parsed.personalTheme ? sanitizeUiTheme(parsed.personalTheme) : null)
          setPinning(sanitizeUiPinning(parsed.pinning))
          setIsOwner(Boolean(parsed.isOwner))
        }
      }
    } catch {
      /* ignore corrupt cache */
    }

    if (isPrintRoute) return () => { cancelled = true }

    void get<ServerUiPrefsResponse>('/api/auth/ui-preferences')
      .then(res => {
        if (cancelled) return
        setCompanyDefault(res.companyDefault ?? null)
        setPersonalTheme(res.personalTheme ?? null)
        setPinning(sanitizeUiPinning(res.pinning, DEFAULT_UI_PINNING))
        setIsOwner(Boolean(res.isOwner))
        persistLocalSnapshot(me.id, me.demo, {
          companyDefault: res.companyDefault ?? null,
          personalTheme: res.personalTheme ?? null,
          pinning: sanitizeUiPinning(res.pinning, DEFAULT_UI_PINNING),
          isOwner: Boolean(res.isOwner),
        })
      })
      .catch(() => {
        /* stay with cached or default cleanly */
      })

    return () => {
      cancelled = true
    }
  }, [me?.id, me?.demo, isPrintRoute, clearTimers, persistLocalSnapshot])

  // Wipe DOM & state on forced 401 sign-out
  useEffect(() => {
    const onUnauthorized = () => {
      clearTimers()
      setCompanyDefault(null)
      setPersonalTheme(null)
      setPinning(structuredClone(DEFAULT_UI_PINNING))
      setIsOwner(false)
      setDrawerOpen(false)
      clearDomCustomTheme()
    }
    window.addEventListener('swk:unauthorized', onUnauthorized)
    return () => window.removeEventListener('swk:unauthorized', onUnauthorized)
  }, [clearTimers])

  // Keyboard shortcut: Alt + U opens/closes Customise UI drawer
  useEffect(() => {
    if (!me?.id || isPrintRoute) return
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'u') {
        const tag = (e.target as HTMLElement | null)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        setDrawerOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [me?.id, isPrintRoute])

  const flushPut = useCallback(
    async (payload: { theme?: UiThemeConfig | null; pinning?: UiPinningPrefs }, notify = false) => {
      if (!me?.id) return
      setSaving(true)
      try {
        const res = await put<ServerUiPrefsResponse>('/api/auth/ui-preferences', payload)
        setCompanyDefault(res.companyDefault ?? null)
        setPersonalTheme(res.personalTheme ?? null)
        setPinning(sanitizeUiPinning(res.pinning, DEFAULT_UI_PINNING))
        setIsOwner(Boolean(res.isOwner))
        persistLocalSnapshot(me.id, me.demo, {
          companyDefault: res.companyDefault ?? null,
          personalTheme: res.personalTheme ?? null,
          pinning: sanitizeUiPinning(res.pinning, DEFAULT_UI_PINNING),
          isOwner: Boolean(res.isOwner),
        })
        if (notify) toast.ok('Customise UI saved & synced to your account')
      } catch (err: any) {
        if (notify) toast.error(err?.message || 'Could not save UI customisation')
      } finally {
        setSaving(false)
      }
    },
    [me?.id, me?.demo, persistLocalSnapshot, toast],
  )

  const scheduleThemeSave = useCallback(
    (nextTheme: UiThemeConfig) => {
      if (!me?.id) return
      pendingThemeRef.current = nextTheme
      persistLocalSnapshot(me.id, me.demo, { companyDefault, personalTheme: nextTheme, pinning, isOwner })
      if (themeTimer.current !== null) window.clearTimeout(themeTimer.current)
      themeTimer.current = window.setTimeout(() => {
        themeTimer.current = null
        const t = pendingThemeRef.current
        pendingThemeRef.current = undefined
        if (t !== undefined) void flushPut({ theme: t }, false)
      }, 480)
    },
    [me?.id, me?.demo, companyDefault, pinning, isOwner, persistLocalSnapshot, flushPut],
  )

  const schedulePinningSave = useCallback(
    (nextPinning: UiPinningPrefs) => {
      if (!me?.id) return
      pendingPinningRef.current = nextPinning
      persistLocalSnapshot(me.id, me.demo, { companyDefault, personalTheme, pinning: nextPinning, isOwner })
      if (pinTimer.current !== null) window.clearTimeout(pinTimer.current)
      pinTimer.current = window.setTimeout(() => {
        pinTimer.current = null
        const p = pendingPinningRef.current
        pendingPinningRef.current = undefined
        if (p !== undefined) void flushPut({ pinning: p }, false)
      }, 280)
    },
    [me?.id, me?.demo, companyDefault, personalTheme, isOwner, persistLocalSnapshot, flushPut],
  )

  const mutateTheme = useCallback(
    (updater: (cur: UiThemeConfig) => UiThemeConfig) => {
      const prevPersonal = personalTheme
      const base = themeFromPrefs(effectivePrefs)
      const next = sanitizeUiTheme(updater(base), base)
      setUndoStack(s => [...s.slice(-14), prevPersonal])
      setPersonalTheme(next)
      scheduleThemeSave(next)
    },
    [personalTheme, effectivePrefs, scheduleThemeSave],
  )

  const mutatePinning = useCallback(
    (updater: (cur: UiPinningPrefs) => UiPinningPrefs) => {
      setPinning(cur => {
        const next = sanitizeUiPinning(updater(cur), cur)
        schedulePinningSave(next)
        return next
      })
    },
    [schedulePinningSave],
  )

  const applyPreset = useCallback(
    (presetId: string) => {
      const found = UI_PRESETS.find(p => p.id === presetId)
      if (!found) return
      mutateTheme(() => structuredClone(found.theme))
    },
    [mutateTheme],
  )

  const updateColors = useCallback(
    (patch: Partial<UiColorConfig>) => {
      mutateTheme(cur => {
        const colors = { ...cur.colors, ...patch }
        const mode: UiThemeConfig['mode'] =
          patch.background !== undefined ? (isColorDark(colors.background) ? 'dark' : 'custom') : cur.mode === 'light' || cur.mode === 'dark' ? 'custom' : cur.mode
        return { ...cur, presetId: 'custom', mode, colors }
      })
    },
    [mutateTheme],
  )

  const autoFixContrast = useCallback(() => {
    mutateTheme(cur => ({
      ...cur,
      presetId: 'custom',
      mode: isColorDark(cur.colors.background) ? 'dark' : 'light',
      colors: autoContrastThemeColors(cur.colors),
    }))
    toast.ok('Text & border contrast auto-balanced')
  }, [mutateTheme, toast])

  const updateTypography = useCallback(
    (patch: Partial<UiTypographyConfig>) => {
      mutateTheme(cur => ({ ...cur, typography: { ...cur.typography, ...patch } }))
    },
    [mutateTheme],
  )

  const updateLayout = useCallback(
    (patch: Partial<UiLayoutConfig>) => {
      mutateTheme(cur => ({ ...cur, layout: { ...cur.layout, ...patch } }))
    },
    [mutateTheme],
  )

  const updateHighlight = useCallback(
    (patch: Partial<UiHighlightConfig>) => {
      mutateTheme(cur => ({ ...cur, highlight: { ...cur.highlight, ...patch } }))
    },
    [mutateTheme],
  )

  const setMode = useCallback(
    (mode: UiThemeConfig['mode']) => {
      if (mode === 'dark') {
        const darkPreset = UI_PRESETS.find(p => p.id === 'obsidian-night-gold')!
        mutateTheme(cur => ({
          ...cur,
          presetId: 'obsidian-night-gold',
          mode: 'dark',
          colors: structuredClone(darkPreset.theme.colors),
        }))
      } else if (mode === 'light') {
        mutateTheme(cur => ({
          ...cur,
          presetId: 'swk-signature',
          mode: 'light',
          colors: structuredClone(DEFAULT_UI_THEME.colors),
        }))
      } else {
        mutateTheme(cur => ({ ...cur, mode: 'custom' }))
      }
    },
    [mutateTheme],
  )

  const undoTheme = useCallback(() => {
    setUndoStack(stack => {
      if (!stack.length) return stack
      const prev = stack[stack.length - 1] ?? null
      setPersonalTheme(prev)
      if (prev === null) {
        void flushPut({ theme: null }, false)
      } else {
        scheduleThemeSave(prev)
      }
      return stack.slice(0, -1)
    })
  }, [flushPut, scheduleThemeSave])

  const saveNow = useCallback(async () => {
    clearTimers()
    await flushPut({ theme: personalTheme, pinning }, true)
  }, [clearTimers, flushPut, personalTheme, pinning])

  const resetThemeToCompanyDefault = useCallback(async () => {
    if (!me?.id) return
    clearTimers()
    setSaving(true)
    try {
      const res = await del<ServerUiPrefsResponse>('/api/auth/ui-preferences?scope=theme')
      setCompanyDefault(res.companyDefault ?? null)
      setPersonalTheme(null)
      setPinning(sanitizeUiPinning(res.pinning, DEFAULT_UI_PINNING))
      setUndoStack([])
      persistLocalSnapshot(me.id, me.demo, {
        companyDefault: res.companyDefault ?? null,
        personalTheme: null,
        pinning: sanitizeUiPinning(res.pinning, DEFAULT_UI_PINNING),
        isOwner: Boolean(res.isOwner),
      })
      toast.ok(res.hasCompanyDefault ? 'Theme reset to SWK Company Default (pins preserved)' : 'Theme reset to SWK Signature Default (pins preserved)')
    } catch (err: any) {
      toast.error(err?.message || 'Could not reset theme')
    } finally {
      setSaving(false)
    }
  }, [me?.id, me?.demo, clearTimers, persistLocalSnapshot, toast])

  const resetAllPreferences = useCallback(async () => {
    if (!me?.id) return
    clearTimers()
    setSaving(true)
    try {
      const res = await del<ServerUiPrefsResponse>('/api/auth/ui-preferences?scope=all')
      setCompanyDefault(res.companyDefault ?? null)
      setPersonalTheme(null)
      setPinning(structuredClone(DEFAULT_UI_PINNING))
      setUndoStack([])
      persistLocalSnapshot(me.id, me.demo, {
        companyDefault: res.companyDefault ?? null,
        personalTheme: null,
        pinning: structuredClone(DEFAULT_UI_PINNING),
        isOwner: Boolean(res.isOwner),
      })
      toast.ok('All UI settings, pins & drag positions reset')
    } catch (err: any) {
      toast.error(err?.message || 'Could not reset UI preferences')
    } finally {
      setSaving(false)
    }
  }, [me?.id, me?.demo, clearTimers, persistLocalSnapshot, toast])

  const applyAsCompanyDefault = useCallback(async () => {
    if (!me?.id || !isOwner) return
    clearTimers()
    setSaving(true)
    try {
      const currentTheme = themeFromPrefs(effectivePrefs)
      const res = await put<ServerUiPrefsResponse>('/api/auth/ui-preferences/company-default', { theme: currentTheme })
      setCompanyDefault(res.companyDefault ?? currentTheme)
      persistLocalSnapshot(me.id, me.demo, {
        companyDefault: res.companyDefault ?? currentTheme,
        personalTheme,
        pinning,
        isOwner: true,
      })
      toast.ok('Applied as SWK Company Default for all staff')
    } catch (err: any) {
      toast.error(err?.message || 'Could not set Company Default')
    } finally {
      setSaving(false)
    }
  }, [me?.id, me?.demo, isOwner, clearTimers, effectivePrefs, personalTheme, pinning, persistLocalSnapshot, toast])

  const clearCompanyDefault = useCallback(async () => {
    if (!me?.id || !isOwner) return
    setSaving(true)
    try {
      const res = await del<ServerUiPrefsResponse>('/api/auth/ui-preferences/company-default')
      setCompanyDefault(null)
      persistLocalSnapshot(me.id, me.demo, {
        companyDefault: null,
        personalTheme: res.personalTheme ?? personalTheme,
        pinning,
        isOwner: true,
      })
      toast.ok('Company Default cleared back to SWK Signature White & Obsidian')
    } catch (err: any) {
      toast.error(err?.message || 'Could not clear Company Default')
    } finally {
      setSaving(false)
    }
  }, [me?.id, me?.demo, isOwner, personalTheme, pinning, persistLocalSnapshot, toast])

  const importThemeJson = useCallback(
    (rawJson: string): boolean => {
      try {
        const parsed = JSON.parse(rawJson)
        const candidate = parsed?.theme ?? parsed
        if (!candidate || typeof candidate !== 'object' || !candidate.colors) return false
        mutateTheme(() => sanitizeUiTheme(candidate, DEFAULT_UI_THEME))
        toast.ok('Imported theme preset')
        return true
      } catch {
        toast.error('Invalid theme JSON file')
        return false
      }
    },
    [mutateTheme, toast],
  )

  // --- Pinning & Dragging helpers (never touch personalTheme!) ---
  const setDockPosition = useCallback(
    (dockPosition: DockPosition) => {
      mutatePinning(cur => ({ ...cur, dockPosition }))
    },
    [mutatePinning],
  )

  const lookupEntityModule = useCallback(
    (key: string) => meta?.entities.find(e => e.key === key)?.module,
    [meta?.entities],
  )

  const togglePinItem = useCallback(
    (item: UiPinnedItem) => {
      if (!isRoutePinnableForUser(item.to, me, can, lookupEntityModule)) {
        toast.error('You do not have permission to pin this route')
        return
      }
      mutatePinning(cur => {
        const exists = cur.pinnedItems.some(p => p.to === item.to || p.id === item.id)
        if (exists) {
          return { ...cur, pinnedItems: cur.pinnedItems.filter(p => p.to !== item.to && p.id !== item.id) }
        }
        const nextItems = [...cur.pinnedItems, { ...item, id: item.id || item.to }].slice(0, 24)
        // Auto-reveal top dock if user pins their very first item while dock and floating pad are both hidden
        const nextDock = cur.dockPosition === 'hidden' && !cur.floatingPad.enabled ? 'top' : cur.dockPosition
        return { ...cur, dockPosition: nextDock, pinnedItems: nextItems }
      })
    },
    [me, can, mutatePinning, toast],
  )

  const removePin = useCallback(
    (id: string) => {
      mutatePinning(cur => ({ ...cur, pinnedItems: cur.pinnedItems.filter(p => p.id !== id && p.to !== id) }))
    },
    [mutatePinning],
  )

  const togglePinHighlight = useCallback(
    (id: string) => {
      mutatePinning(cur => ({
        ...cur,
        pinnedItems: cur.pinnedItems.map(p => (p.id === id ? { ...p, highlighted: !p.highlighted } : p)),
      }))
    },
    [mutatePinning],
  )

  const setPinAccentColor = useCallback(
    (id: string, hex: string | undefined) => {
      mutatePinning(cur => ({
        ...cur,
        pinnedItems: cur.pinnedItems.map(p => (p.id === id ? { ...p, accentColor: hex } : p)),
      }))
    },
    [mutatePinning],
  )

  const reorderPins = useCallback(
    (fromIdx: number, toIdx: number) => {
      mutatePinning(cur => {
        if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= cur.pinnedItems.length || toIdx >= cur.pinnedItems.length) {
          return cur
        }
        const next = [...cur.pinnedItems]
        const [moved] = next.splice(fromIdx, 1)
        if (!moved) return cur
        next.splice(toIdx, 0, moved)
        return { ...cur, pinnedItems: next }
      })
    },
    [mutatePinning],
  )

  const isPinned = useCallback(
    (to: string) => pinning.pinnedItems.some(p => p.to === to),
    [pinning.pinnedItems],
  )

  const setAppOrder = useCallback(
    (appOrder: string[]) => {
      mutatePinning(cur => ({ ...cur, appOrder }))
    },
    [mutatePinning],
  )

  const resetAppOrder = useCallback(() => {
    mutatePinning(cur => ({ ...cur, appOrder: [] }))
    toast.ok('Home app order restored to default')
  }, [mutatePinning, toast])

  const toggleAppHighlight = useCallback(
    (appKey: string) => {
      mutatePinning(cur => {
        const has = cur.highlightedAppKeys.includes(appKey)
        const nextKeys = has
          ? cur.highlightedAppKeys.filter(k => k !== appKey)
          : [...cur.highlightedAppKeys, appKey].slice(0, 20)
        return { ...cur, highlightedAppKeys: nextKeys }
      })
    },
    [mutatePinning],
  )

  const updateFloatingPad = useCallback(
    (patch: Partial<UiPinningPrefs['floatingPad']>) => {
      mutatePinning(cur => ({
        ...cur,
        floatingPad: { ...cur.floatingPad, ...patch },
      }))
    },
    [mutatePinning],
  )

  const value = useMemo<UiCustomizationCtx>(
    () => ({
      prefs: effectivePrefs,
      hasPersonalTheme,
      hasCompanyDefault,
      companyDefault,
      isOwner,
      saving,
      canUndo: undoStack.length > 0,
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      toggleDrawer: () => setDrawerOpen(o => !o),
      applyPreset,
      updateColors,
      autoFixContrast,
      updateTypography,
      updateLayout,
      updateHighlight,
      setMode,
      undoTheme,
      saveNow,
      resetThemeToCompanyDefault,
      resetAllPreferences,
      applyAsCompanyDefault,
      clearCompanyDefault,
      importThemeJson,
      setDockPosition,
      togglePinItem,
      removePin,
      togglePinHighlight,
      setPinAccentColor,
      reorderPins,
      isPinned,
      setAppOrder,
      resetAppOrder,
      toggleAppHighlight,
      updateFloatingPad,
    }),
    [
      effectivePrefs,
      hasPersonalTheme,
      hasCompanyDefault,
      companyDefault,
      isOwner,
      saving,
      undoStack.length,
      drawerOpen,
      applyPreset,
      updateColors,
      autoFixContrast,
      updateTypography,
      updateLayout,
      updateHighlight,
      setMode,
      undoTheme,
      saveNow,
      resetThemeToCompanyDefault,
      resetAllPreferences,
      applyAsCompanyDefault,
      clearCompanyDefault,
      importThemeJson,
      setDockPosition,
      togglePinItem,
      removePin,
      togglePinHighlight,
      setPinAccentColor,
      reorderPins,
      isPinned,
      setAppOrder,
      resetAppOrder,
      toggleAppHighlight,
      updateFloatingPad,
    ],
  )

  return <UiCustomizationContext.Provider value={value}>{children}</UiCustomizationContext.Provider>
}
