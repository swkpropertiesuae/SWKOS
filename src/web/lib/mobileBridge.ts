import { useSyncExternalStore } from 'react'
import { deriveDeviceIdFromJwk, getDevicePublicKeyJwk, signProof, type EcP256Jwk } from './deviceKey'

export const LOCK_BACKGROUND_MS = 45_000
export const LOCK_IDLE_MS = 10 * 60 * 1000

const SESSION_KEY = 'swk.mobile.session'
const DEVICE_ID_KEY = 'swk.mobile.device_id'
const API_BASE_KEY = 'swk.api_base'
const LOCK_PIN_KEY = 'swk.lock.pin_hash'
const LOCK_FLAG_KEY = 'swk.lock.locked'
const DEFAULT_NATIVE_API_BASE = 'https://os.swk.properties'

export type NativePlatform = 'android' | 'ios' | 'web'

export interface MobileLockSnapshot {
  locked: boolean
  reason: 'background' | 'idle' | 'manual' | null
  lockedAt: number | null
  armed: boolean
  biometricReady: boolean
  hasPin: boolean
  lastError: string | null
}

function cap(): any {
  return typeof window !== 'undefined' ? (window as any).Capacitor : undefined
}

function plugin(name: string): any {
  const c = cap()
  return c?.Plugins?.[name]
}

export function isNativeMobile(): boolean {
  try {
    return Boolean(cap()?.isNativePlatform?.())
  } catch {
    return false
  }
}

export function getNativePlatform(): NativePlatform {
  try {
    const p = String(cap()?.getPlatform?.() || '').toLowerCase()
    if (p === 'android' || p === 'ios') return p
  } catch {
    /* ignore */
  }
  return 'web'
}

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return ''
  const injected = String((window as any).__SWK_CONFIG__?.API_BASE || '').trim()
  if (injected) return injected.replace(/\/+$/, '')
  try {
    const stored = String(localStorage.getItem(API_BASE_KEY) || '').trim()
    if (stored) return stored.replace(/\/+$/, '')
  } catch {
    /* ignore */
  }
  if (isNativeMobile()) return DEFAULT_NATIVE_API_BASE
  return ''
}

export function resolveApiUrl(path: string): string {
  if (!path) return path
  if (/^https?:\/\//i.test(path)) return path
  const base = getApiBaseUrl()
  if (!base) return path
  if (path.startsWith('/')) return `${base}${path}`
  return `${base}/${path}`
}

export function getMobileSessionToken(): string | null {
  if (typeof window === 'undefined') return null
  const winTok = (window as any).__SWK_MOBILE_SESSION__
  if (typeof winTok === 'string' && winTok.trim()) return winTok.trim()
  try {
    const stored = localStorage.getItem(SESSION_KEY)
    return stored && stored.trim() ? stored.trim() : null
  } catch {
    return null
  }
}

export function getMobileDeviceId(): string | null {
  if (typeof window === 'undefined') return null
  const winDev = (window as any).__SWK_MOBILE_DEVICE_ID__
  if (typeof winDev === 'string' && winDev.trim()) return winDev.trim()
  try {
    const stored = localStorage.getItem(DEVICE_ID_KEY)
    return stored && stored.trim() ? stored.trim() : null
  } catch {
    return null
  }
}

export async function secureSet(key: string, value: string): Promise<void> {
  const swk = plugin('SwkSecure')
  if (isNativeMobile() && swk && typeof swk.secureSet === 'function') {
    try {
      await swk.secureSet({ key, value })
      return
    } catch {
      /* fallback below */
    }
  }
  try {
    localStorage.setItem(`swk.secure.${key}`, value)
  } catch {
    /* ignore */
  }
}

export async function secureGet(key: string): Promise<string | null> {
  const swk = plugin('SwkSecure')
  if (isNativeMobile() && swk && typeof swk.secureGet === 'function') {
    try {
      const res = await swk.secureGet({ key })
      if (res && typeof res.value === 'string' && res.value.length > 0) return res.value
      return null
    } catch {
      /* fallback below */
    }
  }
  try {
    return localStorage.getItem(`swk.secure.${key}`)
  } catch {
    return null
  }
}

export async function secureRemove(key: string): Promise<void> {
  const swk = plugin('SwkSecure')
  if (isNativeMobile() && swk && typeof swk.secureRemove === 'function') {
    try {
      await swk.secureRemove({ key })
    } catch {
      /* ignore */
    }
  }
  try {
    localStorage.removeItem(`swk.secure.${key}`)
  } catch {
    /* ignore */
  }
}

export async function setMobileSession(token: string, deviceId?: string | null): Promise<void> {
  const clean = token.trim()
  if (typeof window !== 'undefined') {
    ;(window as any).__SWK_MOBILE_SESSION__ = clean
    if (deviceId) (window as any).__SWK_MOBILE_DEVICE_ID__ = deviceId
  }
  if (isNativeMobile() && plugin('SwkSecure')?.secureSet) {
    await secureSet('session_token', clean)
    if (deviceId) await secureSet('device_id', deviceId)
    try {
      localStorage.removeItem(SESSION_KEY)
      if (deviceId) localStorage.setItem(DEVICE_ID_KEY, deviceId)
    } catch {
      /* ignore */
    }
  } else {
    try {
      localStorage.setItem(SESSION_KEY, clean)
      if (deviceId) localStorage.setItem(DEVICE_ID_KEY, deviceId)
    } catch {
      /* ignore */
    }
  }
}

export async function clearMobileSession(): Promise<void> {
  if (typeof window !== 'undefined') {
    delete (window as any).__SWK_MOBILE_SESSION__
    delete (window as any).__SWK_MOBILE_DEVICE_ID__
  }
  await secureRemove('session_token')
  try {
    localStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(LOCK_FLAG_KEY)
  } catch {
    /* ignore */
  }
  setLockState({ locked: false, reason: null, lockedAt: null, lastError: null })
}

let hydratedOnce = false
export async function hydrateMobileSession(): Promise<void> {
  if (typeof window === 'undefined' || hydratedOnce) return
  hydratedOnce = true
  try {
    if (isNativeMobile()) {
      const [tok, dev, pinHash] = await Promise.all([
        secureGet('session_token'),
        secureGet('device_id'),
        secureGet('lock_pin_hash'),
      ])
      if (tok) (window as any).__SWK_MOBILE_SESSION__ = tok
      if (dev) (window as any).__SWK_MOBILE_DEVICE_ID__ = dev
      if (pinHash) localStorage.setItem(LOCK_PIN_KEY, pinHash)
    }
    const bio = await biometricAvailable()
    const lockedFlag = sessionStorage.getItem(LOCK_FLAG_KEY) === '1'
    setLockState({
      biometricReady: bio,
      hasPin: hasLocalUnlockPin(),
      locked: lockedFlag && (isNativeMobile() || hasLocalUnlockPin()),
      reason: lockedFlag ? 'background' : null,
      lockedAt: lockedFlag ? Date.now() : null,
    })
  } catch {
    /* keep web defaults */
  }
}

export async function getMobileDeviceAuthPayload(): Promise<{
  device_pub?: EcP256Jwk
  device_id: string
  device_name: string
  platform: NativePlatform
  app_version: string
}> {
  const platform = getNativePlatform()
  let deviceName = typeof navigator !== 'undefined' ? navigator.platform || 'SWK Mobile' : 'SWK Mobile'
  let appVersion = '3.1.0'
  let fallbackId = ''
  const swk = plugin('SwkSecure')
  if (isNativeMobile() && swk && typeof swk.deviceInfo === 'function') {
    try {
      const info = await swk.deviceInfo()
      if (info?.device_name) deviceName = String(info.device_name)
      if (info?.app_version) appVersion = String(info.app_version)
      if (info?.device_id) fallbackId = String(info.device_id)
    } catch {
      /* ignore */
    }
  }
  try {
    const pub = await getDevicePublicKeyJwk()
    const derivedId = await deriveDeviceIdFromJwk(pub)
    return {
      device_pub: pub,
      device_id: derivedId,
      device_name: deviceName,
      platform,
      app_version: appVersion,
    }
  } catch {
    const stored = getMobileDeviceId() || fallbackId || `swk-${platform}-${Date.now().toString(36)}`
    return {
      device_id: stored,
      device_name: deviceName,
      platform,
      app_version: appVersion,
    }
  }
}

export async function signDeviceChallengeProof(message: string) {
  return signProof(message)
}

// ------------------------------------------------------------------ Local Biometric / PIN Lock (NO server logout)
let lockSnapshot: MobileLockSnapshot = {
  locked: false,
  reason: null,
  lockedAt: null,
  armed: false,
  biometricReady: false,
  hasPin: hasLocalUnlockPin(),
  lastError: null,
}

const lockListeners = new Set<() => void>()

function setLockState(patch: Partial<MobileLockSnapshot>) {
  lockSnapshot = { ...lockSnapshot, ...patch }
  for (const fn of lockListeners) {
    try {
      fn()
    } catch {
      /* ignore */
    }
  }
}

export function useMobileLockState(): MobileLockSnapshot {
  return useSyncExternalStore(
    listener => {
      lockListeners.add(listener)
      return () => lockListeners.delete(listener)
    },
    () => lockSnapshot,
    () => lockSnapshot,
  )
}

export async function biometricAvailable(): Promise<boolean> {
  const swk = plugin('SwkSecure')
  if (!isNativeMobile() || !swk || typeof swk.biometricAvailable !== 'function') return false
  try {
    const res = await swk.biometricAvailable()
    return Boolean(res?.available)
  } catch {
    return false
  }
}

export function hasLocalUnlockPin(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return Boolean(localStorage.getItem(LOCK_PIN_KEY))
  } catch {
    return false
  }
}

async function hashPin(pin: string): Promise<string> {
  const clean = pin.trim()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`swk-pin-v1:${clean}`))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function setLocalUnlockPin(pin: string): Promise<void> {
  const clean = pin.trim()
  if (!/^\d{4,6}$/.test(clean)) {
    throw new Error('PIN must be 4 to 6 digits.')
  }
  const hashed = await hashPin(clean)
  try {
    localStorage.setItem(LOCK_PIN_KEY, hashed)
  } catch {
    /* ignore */
  }
  if (isNativeMobile()) {
    await secureSet('lock_pin_hash', hashed)
  }
  setLockState({ hasPin: true, lastError: null })
}

export async function clearLocalUnlockPin(): Promise<void> {
  try {
    localStorage.removeItem(LOCK_PIN_KEY)
  } catch {
    /* ignore */
  }
  if (isNativeMobile()) {
    await secureRemove('lock_pin_hash')
  }
  setLockState({ hasPin: false })
}

export async function unlockWithLocalPin(pin: string): Promise<boolean> {
  const clean = pin.trim()
  if (!/^\d{4,6}$/.test(clean)) {
    setLockState({ lastError: 'Enter your 4 to 6 digit PIN.' })
    return false
  }
  const expected = localStorage.getItem(LOCK_PIN_KEY) || (isNativeMobile() ? await secureGet('lock_pin_hash') : null)
  if (!expected) {
    setLockState({ lastError: 'No local PIN is configured on this device.' })
    return false
  }
  const actual = await hashPin(clean)
  if (actual === expected) {
    markScreenUnlocked()
    return true
  }
  setLockState({ lastError: 'Incorrect PIN. Please try again.' })
  return false
}

export async function unlockWithBiometric(reason = 'Unlock SWK Properties OS'): Promise<boolean> {
  const swk = plugin('SwkSecure')
  if (!isNativeMobile() || !swk || typeof swk.biometricAuth !== 'function') {
    setLockState({ lastError: 'Biometric authentication is only available inside the native mobile app.' })
    return false
  }
  try {
    const res = await swk.biometricAuth({ reason })
    if (res?.verified) {
      markScreenUnlocked()
      return true
    }
    setLockState({ lastError: 'Biometric verification was cancelled.' })
    return false
  } catch (err: any) {
    setLockState({ lastError: err?.message || 'Biometric unlock failed. Use your local PIN instead.' })
    return false
  }
}

export function isLockAutoArmed(): boolean {
  return isNativeMobile() || hasLocalUnlockPin()
}

export function lockScreenNow(reason: 'background' | 'idle' | 'manual' = 'manual'): void {
  try {
    sessionStorage.setItem(LOCK_FLAG_KEY, '1')
  } catch {
    /* ignore */
  }
  setLockState({
    locked: true,
    reason,
    lockedAt: Date.now(),
    lastError: null,
  })
}

export function markScreenUnlocked(): void {
  try {
    sessionStorage.removeItem(LOCK_FLAG_KEY)
  } catch {
    /* ignore */
  }
  setLockState({
    locked: false,
    reason: null,
    lockedAt: null,
    lastError: null,
  })
}

/**
 * Starts the 45-second background and 10-minute idle UI lock monitors.
 * CRITICAL: Locking only shows the local UI overlay and NEVER calls /api/auth/logout or clears session_token.
 */
export function startLockMonitors(enabled: boolean): () => void {
  if (typeof window === 'undefined' || !enabled) {
    setLockState({ armed: false, locked: false, reason: null, lockedAt: null })
    return () => {}
  }

  let disposed = false
  let backgroundAt: number | null = document.hidden ? Date.now() : null
  let bgTimer: number | null = null
  let idleTimer: number | null = null
  let appListenerHandle: { remove?: () => Promise<void> | void } | null = null

  const armed = isLockAutoArmed()
  setLockState({ armed, hasPin: hasLocalUnlockPin() })
  void biometricAvailable().then(ready => {
    if (!disposed) setLockState({ biometricReady: ready })
  })

  const clearBgTimer = () => {
    if (bgTimer !== null) {
      window.clearTimeout(bgTimer)
      bgTimer = null
    }
  }

  const clearIdleTimer = () => {
    if (idleTimer !== null) {
      window.clearTimeout(idleTimer)
      idleTimer = null
    }
  }

  const resetIdleTimer = () => {
    clearIdleTimer()
    if (disposed || lockSnapshot.locked || !isLockAutoArmed()) return
    idleTimer = window.setTimeout(() => {
      if (!disposed && isLockAutoArmed()) {
        lockScreenNow('idle')
      }
    }, LOCK_IDLE_MS)
  }

  const handleBackground = () => {
    if (disposed || !isLockAutoArmed()) return
    if (backgroundAt === null) backgroundAt = Date.now()
    clearBgTimer()
    bgTimer = window.setTimeout(() => {
      if (!disposed && isLockAutoArmed()) {
        lockScreenNow('background')
      }
    }, LOCK_BACKGROUND_MS)
  }

  const handleForeground = () => {
    clearBgTimer()
    if (disposed) return
    if (backgroundAt !== null && isLockAutoArmed() && Date.now() - backgroundAt >= LOCK_BACKGROUND_MS) {
      lockScreenNow('background')
    }
    backgroundAt = null
    resetIdleTimer()
  }

  const onVisibilityChange = () => {
    if (document.hidden) handleBackground()
    else handleForeground()
  }

  const onActivity = () => {
    if (!lockSnapshot.locked) resetIdleTimer()
  }

  const onManualLock = () => lockScreenNow('manual')

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pointerdown', onActivity, { passive: true })
  window.addEventListener('keydown', onActivity, { passive: true })
  window.addEventListener('touchstart', onActivity, { passive: true })
  window.addEventListener('scroll', onActivity, { passive: true })
  window.addEventListener('swk:lock', onManualLock)

  resetIdleTimer()

  const appPlugin = plugin('App')
  if (isNativeMobile() && appPlugin && typeof appPlugin.addListener === 'function') {
    void Promise.resolve(
      appPlugin.addListener('appStateChange', (state: { isActive?: boolean }) => {
        if (disposed) return
        if (state?.isActive === false) handleBackground()
        else handleForeground()
      }),
    )
      .then(handle => {
        if (disposed) void handle?.remove?.()
        else appListenerHandle = handle
      })
      .catch(() => {})
  }

  return () => {
    disposed = true
    clearBgTimer()
    clearIdleTimer()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pointerdown', onActivity)
    window.removeEventListener('keydown', onActivity)
    window.removeEventListener('touchstart', onActivity)
    window.removeEventListener('scroll', onActivity)
    window.removeEventListener('swk:lock', onManualLock)
    if (appListenerHandle?.remove) {
      void appListenerHandle.remove()
    }
  }
}

// ------------------------------------------------------------------ Native Camera QR / Document Scan
export async function ensureNativeCameraPermission(): Promise<boolean> {
  const camera = plugin('Camera')
  if (!isNativeMobile() || !camera) return true
  try {
    if (typeof camera.checkPermissions === 'function') {
      const current = await camera.checkPermissions()
      if (current?.camera === 'granted') return true
    }
    if (typeof camera.requestPermissions === 'function') {
      const res = await camera.requestPermissions({ permissions: ['camera'] })
      if (res?.camera && res.camera !== 'granted' && res.camera !== 'limited') return false
    }
    return true
  } catch {
    return true
  }
}

export async function captureNativeCameraPhoto(): Promise<{ dataUrl: string } | null> {
  const camera = plugin('Camera')
  if (!isNativeMobile() || !camera || typeof camera.getPhoto !== 'function') return null
  const photo = await camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: 'dataUrl',
    source: 'CAMERA', // strictly live camera, never gallery
  })
  if (photo?.dataUrl) return { dataUrl: String(photo.dataUrl) }
  return null
}

// ------------------------------------------------------------------ Field Duty GPS & Anti-Spoof Native Bridge
export interface NativeGpsFix {
  lat: number
  lng: number
  accuracy_m: number
  speed_mps: number | null
  heading: number | null
  recorded_at: string
  is_mock: boolean
}

export async function getVerifiedDeviceFix(timeoutMs = 8000): Promise<NativeGpsFix | null> {
  const swk = plugin('SwkSecure')
  if (isNativeMobile() && swk && typeof swk.getFix === 'function') {
    try {
      const fix = await swk.getFix()
      if (fix && Number.isFinite(Number(fix.lat)) && Number.isFinite(Number(fix.lng))) {
        return {
          lat: Number(fix.lat),
          lng: Number(fix.lng),
          accuracy_m: Number.isFinite(Number(fix.accuracy)) ? Math.round(Number(fix.accuracy)) : 25,
          speed_mps: Number.isFinite(Number(fix.speed_mps)) && Number(fix.speed_mps) >= 0 ? Number(fix.speed_mps) : null,
          heading: Number.isFinite(Number(fix.heading)) && Number(fix.heading) >= 0 ? Number(fix.heading) : null,
          recorded_at: String(fix.capturedAt || new Date().toISOString()),
          is_mock: Boolean(fix.mock),
        }
      }
    } catch {
      /* fallback to browser geolocation */
    }
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : 25,
          speed_mps: pos.coords.speed !== null && Number.isFinite(pos.coords.speed) && pos.coords.speed >= 0 ? pos.coords.speed : null,
          heading: pos.coords.heading !== null && Number.isFinite(pos.coords.heading) && pos.coords.heading >= 0 ? pos.coords.heading : null,
          recorded_at: new Date(pos.timestamp || Date.now()).toISOString(),
          is_mock: false,
        })
      },
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: timeoutMs },
    )
  })
}

export async function startNativeFieldDuty(args: {
  sessionId: number
  assignedLocation: string
  deviceId?: string | null
}): Promise<boolean> {
  const swk = plugin('SwkSecure')
  const token = getMobileSessionToken()
  if (!isNativeMobile() || !swk || typeof swk.startDuty !== 'function' || !token) return false
  try {
    const res = await swk.startDuty({
      sessionId: args.sessionId,
      assignedLocation: args.assignedLocation,
      serverUrl: getApiBaseUrl() || window.location.origin,
      sessionToken: token,
      deviceId: args.deviceId || getMobileDeviceId() || '',
    })
    return Boolean(res?.started)
  } catch {
    return false
  }
}

export async function stopNativeFieldDuty(): Promise<void> {
  const swk = plugin('SwkSecure')
  if (!isNativeMobile() || !swk || typeof swk.stopDuty !== 'function') return
  try {
    await swk.stopDuty()
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------------ Native FCM / APNs & Incoming Call Wake Bridge
function dispatchSafeNavigate(rawUrl: unknown) {
  if (typeof window === 'undefined' || typeof rawUrl !== 'string') return
  const candidate = rawUrl.trim()
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return
  window.dispatchEvent(new CustomEvent('swk:navigate', { detail: { url: candidate } }))
}

let pushInitialized = false
let registeredNativeToken: string | null = null
let pushListeners: Array<{ remove?: () => Promise<void> | void }> = []

function mobileFetchHeaders(): Record<string, string> {
  const tok = getMobileSessionToken()
  return {
    'content-type': 'application/json',
    'x-swk-client': isNativeMobile() || tok ? 'mobile' : 'web',
    ...(tok ? { 'x-swk-session': tok } : {}),
  }
}

export async function registerNativePush(): Promise<() => void> {
  if (typeof window === 'undefined' || !isNativeMobile()) return () => {}
  const push = plugin('PushNotifications')
  const swk = plugin('SwkSecure')
  const appPlugin = plugin('App')
  const platform = getNativePlatform()

  if (swk && typeof swk.ensureNotificationChannels === 'function') {
    void swk.ensureNotificationChannels().catch(() => {})
  }

  if (swk && typeof swk.consumeLaunchRoute === 'function') {
    void swk.consumeLaunchRoute()
      .then((res: { route?: string }) => {
        if (res?.route) dispatchSafeNavigate(res.route)
      })
      .catch(() => {})
  }

  if (!pushInitialized) {
    pushInitialized = true

    if (push && typeof push.addListener === 'function') {
      try {
        const regH = await push.addListener('registration', async (tok: { value?: string }) => {
          const value = String(tok?.value || '').trim()
          if (!value) return
          registeredNativeToken = value
          try {
            await fetch(resolveApiUrl('/api/push/subscribe'), {
              method: 'POST',
              credentials: getApiBaseUrl() ? 'omit' : 'same-origin',
              headers: mobileFetchHeaders(),
              body: JSON.stringify({
                channel: platform === 'ios' ? 'apns' : 'fcm',
                token: value,
                device_id: getMobileDeviceId() || undefined,
              }),
            })
          } catch {
            /* retry next mount */
          }
        })
        const actH = await push.addListener('pushNotificationActionPerformed', (ev: any) => {
          const data = ev?.notification?.data || {}
          if (data?.url) dispatchSafeNavigate(data.url)
        })
        const recH = await push.addListener('pushNotificationReceived', (notif: any) => {
          const data = notif?.data || {}
          if (data?.channel === 'swk_calls_sos' || String(data?.url || '').startsWith('/phone')) {
            window.dispatchEvent(new CustomEvent('swk:sip-wake', { detail: data }))
          }
        })
        pushListeners.push(regH, actH, recH)
      } catch {
        /* ignore push registration failures */
      }
    }

    if (swk && typeof swk.addListener === 'function') {
      try {
        const callH = await swk.addListener('swkIncomingCall', (data: any) => {
          window.dispatchEvent(new CustomEvent('swk:sip-wake', { detail: data }))
          dispatchSafeNavigate('/phone?incoming=1')
        })
        const navH = await swk.addListener('swkNavigate', (data: any) => {
          if (data?.route) dispatchSafeNavigate(data.route)
        })
        pushListeners.push(callH, navH)
      } catch {
        /* ignore */
      }
    }

    if (appPlugin && typeof appPlugin.addListener === 'function') {
      try {
        const urlH = await appPlugin.addListener('appUrlOpen', (ev: { url?: string }) => {
          try {
            const u = new URL(String(ev?.url || ''))
            if (u.pathname) dispatchSafeNavigate(`${u.pathname}${u.search}`)
          } catch {
            /* ignore malformed URL */
          }
        })
        pushListeners.push(urlH)
      } catch {
        /* ignore */
      }
    }
  }

  if (push && typeof push.requestPermissions === 'function') {
    try {
      const perm = await push.requestPermissions()
      if (perm?.receive === 'granted' && typeof push.register === 'function') {
        await push.register()
      }
    } catch {
      /* ignore */
    }
  }

  return () => {
    pushInitialized = false
    const handles = pushListeners
    pushListeners = []
    for (const h of handles) {
      if (h?.remove) void h.remove()
    }
  }
}

export async function unregisterNativePush(): Promise<void> {
  if (!isNativeMobile() || !registeredNativeToken) return
  const tok = registeredNativeToken
  registeredNativeToken = null
  try {
    await fetch(resolveApiUrl('/api/push/unsubscribe'), {
      method: 'DELETE',
      credentials: getApiBaseUrl() ? 'omit' : 'same-origin',
      headers: mobileFetchHeaders(),
      body: JSON.stringify({ token: tok }),
    })
  } catch {
    /* ignore */
  }
}

export async function triggerIncomingCallWake(args: {
  callId: string
  callerName: string
  callerId?: string
  extensionNo?: string
  isMaskedVault?: boolean
}): Promise<void> {
  const swk = plugin('SwkSecure')
  const callBridge = plugin('SwkCallPushBridge')
  if (!isNativeMobile()) return
  try {
    if (swk && typeof swk.showIncomingCall === 'function') {
      await swk.showIncomingCall(args)
    } else if (callBridge && typeof callBridge.reportIncomingCall === 'function') {
      await callBridge.reportIncomingCall(args)
    }
  } catch {
    /* ignore */
  }
}

export async function clearIncomingCallWake(callId?: string): Promise<void> {
  const swk = plugin('SwkSecure')
  const callBridge = plugin('SwkCallPushBridge')
  if (!isNativeMobile()) return
  try {
    if (swk && typeof swk.endIncomingCall === 'function') {
      await swk.endIncomingCall({ callId: callId || '' })
    } else if (callBridge && typeof callBridge.endCall === 'function') {
      await callBridge.endCall({ callId: callId || '' })
    }
  } catch {
    /* ignore */
  }
}

export async function startNativeCallAudioService(label: string): Promise<void> {
  const swk = plugin('SwkSecure')
  if (!isNativeMobile() || !swk || typeof swk.startCallAudioService !== 'function') return
  try {
    await swk.startCallAudioService({ label })
  } catch {
    /* ignore */
  }
}

export async function stopNativeCallAudioService(): Promise<void> {
  const swk = plugin('SwkSecure')
  if (!isNativeMobile() || !swk || typeof swk.stopCallAudioService !== 'function') return
  try {
    await swk.stopCallAudioService()
  } catch {
    /* ignore */
  }
}
