import { useSyncExternalStore } from 'react'
import {
  Invitation,
  Inviter,
  Registerer,
  RegistererState,
  Session,
  SessionState,
  SIPExtension,
  URI,
  UserAgent,
  UserAgentState,
  Web,
} from 'sip.js'
import { get, post } from './api'
import { buildStreamUrl } from './chatLive'

export type SipRegistrationState = 'unconfigured' | 'disconnected' | 'connecting' | 'registered' | 'error'
export type SipCallState = 'idle' | 'ringing_in' | 'dialing' | 'connecting' | 'connected' | 'terminating'

export interface SipIceServer {
  urls: string | string[]
  username?: string
  credential?: string
}

export interface SipMyConfigResponse {
  configured: boolean
  reason?: string
  ws_url?: string
  domain?: string
  outbound_proxy?: string
  ice_servers?: SipIceServer[]
  caller_id_mode?: string
  has_vault_prefix?: boolean
  extension?: {
    extension_no: string
    sip_username: string
    sip_password: string
    display_name: string
    allow_direct_dial: boolean
  }
}

export interface SipCallSnapshot {
  id: string
  direction: 'in' | 'out'
  state: SipCallState
  remoteTarget: string
  remoteDisplay: string
  isMaskedVault: boolean
  vaultPropertyId: number | null
  muted: boolean
  onHold: boolean
  startedAt: number | null
  connectedAt: number | null
  durationSec: number
  error: string | null
}

export interface SipWakeAlert {
  call_id: string
  extension_no: string
  caller_id: string
  caller_name: string
  at: string
}

export interface SipClientSnapshot {
  configured: boolean
  reason: string
  registration: SipRegistrationState
  extensionNo: string | null
  displayName: string | null
  domain: string | null
  allowDirectDial: boolean
  hasVaultPrefix: boolean
  activeCall: SipCallSnapshot | null
  consultCall: SipCallSnapshot | null
  lastWake: SipWakeAlert | null
  lastError: string | null
  inputDeviceId: string
  outputDeviceId: string
}

const INPUT_DEV_KEY = 'swk.sip.inputDeviceId'
const OUTPUT_DEV_KEY = 'swk.sip.outputDeviceId'

function readStorage(key: string): string {
  if (typeof window === 'undefined') return ''
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    /* ignore storage failures */
  }
}

function isVaultTarget(raw: string): boolean {
  return /(?:sip:)?\d*vt_[0-9a-f]{8,}/i.test(raw)
}

class SwkSipClient {
  private snapshot: SipClientSnapshot = {
    configured: false,
    reason: 'SIP softphone has not been initialized yet.',
    registration: 'unconfigured',
    extensionNo: null,
    displayName: null,
    domain: null,
    allowDirectDial: false,
    hasVaultPrefix: false,
    activeCall: null,
    consultCall: null,
    lastWake: null,
    lastError: null,
    inputDeviceId: readStorage(INPUT_DEV_KEY),
    outputDeviceId: readStorage(OUTPUT_DEV_KEY),
  }

  private listeners = new Set<() => void>()
  private ua: UserAgent | null = null
  private registerer: Registerer | null = null
  private activeSession: Session | null = null
  private consultSession: Inviter | null = null
  private audioEl: HTMLAudioElement | null = null
  private durationTimer: number | null = null
  private ringTimer: number | null = null
  private ringCtx: AudioContext | null = null
  private initPromise: Promise<void> | null = null
  private wakeEs: EventSource | null = null
  private wakeStop = false
  private wakeRefCount = 0
  private wakeConnecting = false
  private wakeReconnectTimer: number | null = null
  private configCache: SipMyConfigResponse | null = null

  getSnapshot = (): SipClientSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(patch?: Partial<SipClientSnapshot>) {
    if (patch) {
      this.snapshot = { ...this.snapshot, ...patch }
    } else {
      this.snapshot = { ...this.snapshot }
    }
    for (const fn of this.listeners) {
      try {
        fn()
      } catch {
        /* ignore subscriber errors */
      }
    }
  }

  private updateCall(patch: Partial<SipCallSnapshot> | null) {
    if (patch === null) {
      this.emit({ activeCall: null })
      return
    }
    if (!this.snapshot.activeCall) return
    this.emit({ activeCall: { ...this.snapshot.activeCall, ...patch } })
  }

  private updateConsult(patch: Partial<SipCallSnapshot> | null) {
    if (patch === null) {
      this.emit({ consultCall: null })
      return
    }
    if (!this.snapshot.consultCall) return
    this.emit({ consultCall: { ...this.snapshot.consultCall, ...patch } })
  }

  private resolveTargetUri(target: string): URI {
    const clean = target.trim()
    if (!clean) throw new Error('Enter a colleague extension, phone number, or SIP URI.')
    const domain = this.snapshot.domain || this.configCache?.domain || ''
    const uriStr = /^sips?:/i.test(clean)
      ? clean
      : domain
        ? `sip:${clean.replace(/[\s()-]+/g, '')}@${domain}`
        : ''
    const parsed = uriStr ? UserAgent.makeURI(uriStr) : undefined
    if (!parsed) throw new Error('Invalid SIP target URI or missing domain.')
    return parsed
  }

  private getAudioConstraints(): MediaTrackConstraints | boolean {
    if (this.snapshot.inputDeviceId) {
      return { deviceId: { exact: this.snapshot.inputDeviceId } }
    }
    return true
  }

  private ensureAudioElement(): HTMLAudioElement | null {
    if (typeof document === 'undefined') return null
    if (!this.audioEl) {
      const el = document.createElement('audio')
      el.autoplay = true
      el.setAttribute('playsinline', 'true')
      el.style.display = 'none'
      document.body.appendChild(el)
      this.audioEl = el
      if (this.snapshot.outputDeviceId && typeof (el as any).setSinkId === 'function') {
        void (el as any).setSinkId(this.snapshot.outputDeviceId).catch(() => {})
      }
    }
    return this.audioEl
  }

  private attachRemoteMedia(session: Session) {
    const sdh = session.sessionDescriptionHandler as Web.SessionDescriptionHandler | undefined
    const el = this.ensureAudioElement()
    if (!sdh || !el) return

    const syncStream = () => {
      const stream = sdh.remoteMediaStream
      if (!stream) return
      if (el.srcObject !== stream) {
        el.srcObject = stream
      }
      void el.play().catch(() => {})
    }

    syncStream()
    sdh.remoteMediaStream?.addEventListener('addtrack', syncStream)
    sdh.peerConnection?.addEventListener('track', syncStream)
  }

  private clearCallMedia() {
    if (this.durationTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.durationTimer)
      this.durationTimer = null
    }
    this.stopRingtone()
    if (this.audioEl) {
      this.audioEl.pause()
      this.audioEl.srcObject = null
    }
  }

  private ensureDurationTicker() {
    if (typeof window === 'undefined') return
    if (this.durationTimer !== null) return
    this.durationTimer = window.setInterval(() => {
      const primary = this.snapshot.activeCall
      const consult = this.snapshot.consultCall
      const patch: Partial<SipClientSnapshot> = {}
      let changed = false

      if (primary && primary.state === 'connected' && primary.connectedAt) {
        const sec = Math.max(0, Math.floor((Date.now() - primary.connectedAt) / 1000))
        if (sec !== primary.durationSec) {
          patch.activeCall = { ...primary, durationSec: sec }
          changed = true
        }
      }
      if (consult && consult.state === 'connected' && consult.connectedAt) {
        const sec = Math.max(0, Math.floor((Date.now() - consult.connectedAt) / 1000))
        if (sec !== consult.durationSec) {
          patch.consultCall = { ...consult, durationSec: sec }
          changed = true
        }
      }
      if (!primary && !consult) {
        if (this.durationTimer !== null) {
          window.clearInterval(this.durationTimer)
          this.durationTimer = null
        }
        return
      }
      if (changed) this.emit(patch)
    }, 500)
  }

  private startRingtone() {
    if (typeof window === 'undefined') return
    this.stopRingtone()
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return

    const playBurst = () => {
      try {
        const ctx = this.ringCtx || new AudioCtx()
        this.ringCtx = ctx
        if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
        const now = ctx.currentTime
        const gain = ctx.createGain()
        gain.gain.setValueAtTime(0.0001, now)
        gain.gain.exponentialRampToValueAtTime(0.08, now + 0.04)
        gain.gain.setValueAtTime(0.08, now + 0.75)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85)
        gain.connect(ctx.destination)

        const o1 = ctx.createOscillator()
        const o2 = ctx.createOscillator()
        o1.frequency.setValueAtTime(440, now)
        o2.frequency.setValueAtTime(480, now)
        o1.connect(gain)
        o2.connect(gain)
        o1.start(now)
        o2.start(now)
        o1.stop(now + 0.86)
        o2.stop(now + 0.86)
      } catch {
        /* ignore autoplay restrictions */
      }
    }

    playBurst()
    this.ringTimer = window.setInterval(playBurst, 2600)
  }

  private stopRingtone() {
    if (this.ringTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.ringTimer)
      this.ringTimer = null
    }
  }

  private playDtmfBeep(digit: string) {
    if (typeof window === 'undefined') return
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const rowFreq: Record<string, number> = {
      '1': 697, '2': 697, '3': 697, A: 697,
      '4': 770, '5': 770, '6': 770, B: 770,
      '7': 852, '8': 852, '9': 852, C: 852,
      '*': 941, '0': 941, '#': 941, D: 941,
    }
    const colFreq: Record<string, number> = {
      '1': 1209, '4': 1209, '7': 1209, '*': 1209,
      '2': 1336, '5': 1336, '8': 1336, '0': 1336,
      '3': 1477, '6': 1477, '9': 1477, '#': 1477,
      A: 1633, B: 1633, C: 1633, D: 1633,
    }
    const f1 = rowFreq[digit]
    const f2 = colFreq[digit]
    if (!f1 || !f2) return
    try {
      const ctx = this.ringCtx || new AudioCtx()
      this.ringCtx = ctx
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
      const now = ctx.currentTime
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.05, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11)
      gain.connect(ctx.destination)
      const o1 = ctx.createOscillator()
      const o2 = ctx.createOscillator()
      o1.frequency.setValueAtTime(f1, now)
      o2.frequency.setValueAtTime(f2, now)
      o1.connect(gain)
      o2.connect(gain)
      o1.start(now)
      o2.start(now)
      o1.stop(now + 0.12)
      o2.stop(now + 0.12)
    } catch {
      /* ignore */
    }
  }

  async playTestTone(): Promise<void> {
    if (typeof window === 'undefined') return
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = this.ringCtx || new AudioCtx()
    this.ringCtx = ctx
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
    const now = ctx.currentTime
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)
    gain.connect(ctx.destination)
    const osc = ctx.createOscillator()
    osc.frequency.setValueAtTime(523.25, now)
    osc.connect(gain)
    osc.start(now)
    osc.stop(now + 0.46)
  }

  async init(force = false): Promise<void> {
    if (this.initPromise && !force) return this.initPromise
    this.initPromise = this._initInternal(force).finally(() => {
      this.initPromise = null
    })
    return this.initPromise
  }

  private async _initInternal(force: boolean): Promise<void> {
    if (this.ua && !force && this.snapshot.registration === 'registered') return

    let cfg: SipMyConfigResponse
    try {
      cfg = await get<SipMyConfigResponse>('/api/sip/my-config')
    } catch (e: any) {
      this.emit({
        configured: false,
        reason: e?.message || 'Unable to load SIP configuration.',
        registration: 'unconfigured',
        lastError: e?.message || null,
      })
      return
    }

    this.configCache = cfg
    if (!cfg.configured || !cfg.ws_url || !cfg.domain || !cfg.extension) {
      await this.teardownAgent()
      this.emit({
        configured: false,
        reason: cfg.reason || 'SIP trunk or staff extension is not configured yet.',
        registration: 'unconfigured',
        extensionNo: null,
        displayName: null,
        domain: null,
        allowDirectDial: false,
        hasVaultPrefix: false,
        lastError: null,
      })
      return
    }

    await this.teardownAgent()

    const uri = UserAgent.makeURI(`sip:${cfg.extension.sip_username}@${cfg.domain}`)
    if (!uri) {
      this.emit({
        configured: false,
        reason: 'Invalid SIP URI domain or username.',
        registration: 'error',
        lastError: 'Invalid SIP URI configuration',
      })
      return
    }

    this.emit({
      configured: true,
      reason: '',
      registration: 'connecting',
      extensionNo: cfg.extension.extension_no,
      displayName: cfg.extension.display_name,
      domain: cfg.domain,
      allowDirectDial: cfg.extension.allow_direct_dial,
      hasVaultPrefix: Boolean(cfg.has_vault_prefix),
      lastError: null,
    })

    const ua = new UserAgent({
      uri,
      transportOptions: {
        server: cfg.ws_url,
      },
      authorizationUsername: cfg.extension.sip_username,
      authorizationPassword: cfg.extension.sip_password,
      displayName: cfg.extension.display_name,
      preloadedRouteSet: cfg.outbound_proxy ? [cfg.outbound_proxy] : [],
      sipExtensionReplaces: SIPExtension.Supported,
      logLevel: 'warn',
      sessionDescriptionHandlerFactoryOptions: {
        iceGatheringTimeout: 2000,
        peerConnectionConfiguration: {
          iceServers: (cfg.ice_servers || []) as RTCIceServer[],
        },
        constraints: {
          audio: this.getAudioConstraints(),
          video: false,
        },
      },
      delegate: {
        onInvite: (invitation) => {
          this.handleIncomingInvitation(invitation)
        },
        onDisconnect: (err) => {
          if (this.ua === ua) {
            this.emit({
              registration: err ? 'error' : 'disconnected',
              lastError: err ? err.message : this.snapshot.lastError,
            })
          }
        },
      },
    })

    ua.stateChange.addListener((st) => {
      if (this.ua !== ua) return
      if (st === UserAgentState.Stopped && this.snapshot.configured) {
        this.emit({ registration: 'disconnected' })
      }
    })

    const registerer = new Registerer(ua)
    registerer.stateChange.addListener((st) => {
      if (this.registerer !== registerer) return
      if (st === RegistererState.Registered) {
        this.emit({ registration: 'registered', lastError: null })
      } else if (st === RegistererState.Unregistered) {
        this.emit({ registration: 'disconnected' })
      } else if (st === RegistererState.Terminated) {
        this.emit({ registration: 'disconnected' })
      }
    })

    this.ua = ua
    this.registerer = registerer

    try {
      await ua.start()
      await registerer.register()
    } catch (e: any) {
      this.emit({
        registration: 'error',
        lastError: e?.message || 'SIP WebSocket connection failed',
      })
    }
  }

  private async teardownAgent(): Promise<void> {
    if (this.consultSession) {
      try {
        await this.terminateSession(this.consultSession)
      } catch {
        /* ignore */
      }
      this.consultSession = null
      this.emit({ consultCall: null })
    }
    if (this.activeSession) {
      try {
        await this.hangup()
      } catch {
        /* ignore */
      }
    }
    const reg = this.registerer
    const ua = this.ua
    this.registerer = null
    this.ua = null
    if (reg) {
      try {
        if (reg.state === RegistererState.Registered) await reg.unregister()
      } catch {
        /* ignore */
      }
      try {
        await reg.dispose()
      } catch {
        /* ignore */
      }
    }
    if (ua) {
      try {
        await ua.stop()
      } catch {
        /* ignore */
      }
    }
  }

  async disconnect(): Promise<void> {
    this.wakeRefCount = 0
    this.stopWakeStream()
    await this.teardownAgent()
    this.emit({ registration: this.snapshot.configured ? 'disconnected' : 'unconfigured' })
  }

  connectWakeStream(): () => void {
    if (typeof EventSource === 'undefined') return () => {}
    this.wakeRefCount += 1
    this.wakeStop = false
    if (!this.wakeEs && !this.wakeConnecting && this.wakeReconnectTimer === null) {
      void this.openWakeStream()
    }
    let released = false
    return () => {
      if (released) return
      released = true
      this.wakeRefCount = Math.max(0, this.wakeRefCount - 1)
      if (this.wakeRefCount === 0) {
        this.stopWakeStream()
      }
    }
  }

  private async openWakeStream(backoff = 2000): Promise<void> {
    if (this.wakeStop || this.wakeEs || this.wakeConnecting || this.wakeRefCount <= 0) return
    this.wakeConnecting = true
    try {
      const url = await buildStreamUrl('/api/sip/stream')
      // Re-check after async yield so unmounted/concurrent callers cannot leak duplicate EventSources
      if (this.wakeStop || this.wakeEs || this.wakeRefCount <= 0) return
      const next = new EventSource(url)
      this.wakeEs = next
      let curBackoff = backoff
      next.onopen = () => {
        curBackoff = 2000
      }
      next.addEventListener('sip', (ev) => {
        try {
          const payload = JSON.parse((ev as MessageEvent).data)
          if (payload?.type === 'incoming_wake') {
            this.emit({
              lastWake: {
                call_id: String(payload.call_id || ''),
                extension_no: String(payload.extension_no || ''),
                caller_id: String(payload.caller_id || ''),
                caller_name: String(payload.caller_name || ''),
                at: String(payload.at || new Date().toISOString()),
              },
            })
            if (this.snapshot.configured && this.snapshot.registration !== 'registered') {
              void this.init(true)
            }
          }
        } catch {
          /* ignore */
        }
      })
      next.onerror = () => {
        if (this.wakeEs === next) {
          next.close()
          this.wakeEs = null
        }
        if (this.wakeStop || this.wakeRefCount <= 0 || this.wakeReconnectTimer !== null) return
        const wait = curBackoff
        curBackoff = Math.min(30_000, curBackoff * 2)
        this.wakeReconnectTimer = window.setTimeout(() => {
          this.wakeReconnectTimer = null
          void this.openWakeStream(curBackoff)
        }, wait)
      }
    } catch {
      /* ignore */
    } finally {
      this.wakeConnecting = false
    }
  }

  stopWakeStream(): void {
    this.wakeStop = true
    if (this.wakeReconnectTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.wakeReconnectTimer)
      this.wakeReconnectTimer = null
    }
    if (this.wakeEs) {
      this.wakeEs.close()
      this.wakeEs = null
    }
  }

  private async terminateSession(session: Session): Promise<void> {
    if (session instanceof Invitation && (session.state === SessionState.Initial || session.state === SessionState.Establishing)) {
      await session.reject()
    } else if (session instanceof Inviter && (session.state === SessionState.Initial || session.state === SessionState.Establishing)) {
      await session.cancel()
    } else if (session.state === SessionState.Established) {
      await session.bye()
    } else if (session.state !== SessionState.Terminated) {
      await session.dispose()
    }
  }

  private async setSessionHold(session: Session, hold: boolean, muted: boolean): Promise<void> {
    const sdh = session.sessionDescriptionHandler as Web.SessionDescriptionHandler | undefined
    await session.invite({
      sessionDescriptionHandlerOptions: {
        hold,
      } as Web.SessionDescriptionHandlerOptions,
    })
    sdh?.enableReceiverTracks(!hold)
    sdh?.enableSenderTracks(!hold && !muted)
  }

  private logCallEnd(
    meta: {
      id: string
      direction: 'in' | 'out'
      remoteTarget: string
      remoteDisplay: string
      isMaskedVault: boolean
      vaultPropertyId: number | null
    },
    snap: SipCallSnapshot | null,
  ) {
    const durationSec = snap?.connectedAt ? Math.max(0, Math.round((Date.now() - snap.connectedAt) / 1000)) : 0
    const finalStatus: 'Completed' | 'Failed' = snap?.connectedAt ? 'Completed' : 'Failed'
    const errMsg = snap?.error || undefined
    void post('/api/sip/calls/log', {
      call_id: meta.id,
      direction: meta.direction,
      from_number: meta.direction === 'out' ? this.snapshot.extensionNo || '' : meta.isMaskedVault ? 'Masked Vault Owner' : meta.remoteTarget,
      to_number: meta.direction === 'out' ? (meta.isMaskedVault ? 'Masked Vault Owner' : meta.remoteTarget) : this.snapshot.extensionNo || '',
      caller_name: meta.isMaskedVault ? 'Masked Vault Owner' : meta.remoteDisplay,
      duration_sec: durationSec,
      status: finalStatus,
      outcome: durationSec > 0 ? 'Information given' : 'Abandoned',
      summary: meta.isMaskedVault
        ? `Masked Vault SIP call (${durationSec}s)`
        : `${meta.direction === 'out' ? 'Outbound' : 'Inbound'} SIP call with ${meta.remoteDisplay}${errMsg ? ` · ${errMsg}` : ''}`,
      is_vault_masked: meta.isMaskedVault,
      property_id: meta.vaultPropertyId,
    }).catch(() => {})
  }

  private bindSessionLifecycle(
    session: Session,
    meta: {
      id: string
      direction: 'in' | 'out'
      remoteTarget: string
      remoteDisplay: string
      isMaskedVault: boolean
      vaultPropertyId: number | null
    },
  ) {
    this.activeSession = session
    let logged = false

    session.stateChange.addListener((st) => {
      if (this.activeSession !== session) return
      if (st === SessionState.Establishing) {
        this.updateCall({ state: meta.direction === 'in' ? 'ringing_in' : 'connecting' })
      } else if (st === SessionState.Established) {
        this.stopRingtone()
        if (!this.consultSession) {
          this.attachRemoteMedia(session)
        }
        this.updateCall({
          state: 'connected',
          connectedAt: this.snapshot.activeCall?.connectedAt ?? Date.now(),
        })
        this.ensureDurationTicker()
      } else if (st === SessionState.Terminating) {
        this.updateCall({ state: 'terminating' })
      } else if (st === SessionState.Terminated) {
        if (!logged) {
          logged = true
          this.logCallEnd(meta, this.snapshot.activeCall)
        }
        if (this.consultSession) {
          const consult = this.consultSession
          this.consultSession = null
          void this.terminateSession(consult).catch(() => {})
        }
        this.clearCallMedia()
        this.activeSession = null
        this.emit({ activeCall: null, consultCall: null })
      }
    })
  }

  private bindConsultLifecycle(
    session: Inviter,
    meta: {
      id: string
      remoteTarget: string
      remoteDisplay: string
    },
  ) {
    this.consultSession = session
    let logged = false

    session.stateChange.addListener((st) => {
      if (this.consultSession !== session) return
      if (st === SessionState.Establishing) {
        this.updateConsult({ state: 'connecting' })
      } else if (st === SessionState.Established) {
        this.attachRemoteMedia(session)
        this.updateConsult({
          state: 'connected',
          connectedAt: this.snapshot.consultCall?.connectedAt ?? Date.now(),
        })
        this.ensureDurationTicker()
      } else if (st === SessionState.Terminating) {
        this.updateConsult({ state: 'terminating' })
      } else if (st === SessionState.Terminated) {
        if (!logged) {
          logged = true
          this.logCallEnd(
            {
              id: meta.id,
              direction: 'out',
              remoteTarget: meta.remoteTarget,
              remoteDisplay: meta.remoteDisplay,
              isMaskedVault: false,
              vaultPropertyId: null,
            },
            this.snapshot.consultCall,
          )
        }
        this.consultSession = null
        this.emit({ consultCall: null })
        if (this.activeSession && this.activeSession.state === SessionState.Established && !this.snapshot.activeCall?.onHold) {
          this.attachRemoteMedia(this.activeSession)
        }
      }
    })
  }

  private handleIncomingInvitation(invitation: Invitation) {
    if (this.activeSession) {
      void invitation.reject({ statusCode: 486, reasonPhrase: 'Busy Here' }).catch(() => {})
      return
    }
    const fromUri = invitation.remoteIdentity?.uri?.toString() || 'unknown'
    const display =
      invitation.remoteIdentity?.displayName ||
      invitation.remoteIdentity?.uri?.user ||
      fromUri
    const callId = `sip-${invitation.id || Date.now()}`
    const masked = isVaultTarget(fromUri)

    this.emit({
      activeCall: {
        id: callId,
        direction: 'in',
        state: 'ringing_in',
        remoteTarget: masked ? 'Masked Vault Owner' : fromUri,
        remoteDisplay: masked ? 'Masked Vault Owner' : display,
        isMaskedVault: masked,
        vaultPropertyId: null,
        muted: false,
        onHold: false,
        startedAt: Date.now(),
        connectedAt: null,
        durationSec: 0,
        error: null,
      },
    })

    this.bindSessionLifecycle(invitation, {
      id: callId,
      direction: 'in',
      remoteTarget: masked ? 'Masked Vault Owner' : fromUri,
      remoteDisplay: masked ? 'Masked Vault Owner' : display,
      isMaskedVault: masked,
      vaultPropertyId: null,
    })

    this.startRingtone()
  }

  async dial(
    target: string,
    opts: { displayLabel?: string; isMaskedVault?: boolean; propertyId?: number | null } = {},
  ): Promise<void> {
    const clean = target.trim()
    if (!clean) throw new Error('Enter a phone number, extension, or SIP URI')
    if (/^sips?:/i.test(clean)) {
      return this.dialUri(clean, opts.displayLabel || clean, opts)
    }
    if (!this.snapshot.configured) {
      await this.init(true)
    }
    if (!this.snapshot.configured || !this.snapshot.domain) {
      throw new Error(this.snapshot.reason || 'SIP softphone is not configured yet.')
    }
    const normalized = clean.replace(/[\s()-]+/g, '')
    const uri = `sip:${normalized}@${this.snapshot.domain}`
    return this.dialUri(uri, opts.displayLabel || clean, opts)
  }

  async dialUri(
    uri: string,
    displayLabel = 'Masked Vault Owner',
    opts: { isMaskedVault?: boolean; propertyId?: number | null } = {},
  ): Promise<void> {
    if (this.activeSession) {
      throw new Error('Another call is already active. Hang up before placing a new call.')
    }
    if (!this.ua || this.snapshot.registration === 'unconfigured' || this.snapshot.registration === 'disconnected') {
      await this.init(true)
    }
    if (!this.snapshot.configured || !this.ua) {
      throw new Error(this.snapshot.reason || 'SIP softphone is not configured or connected.')
    }
    const targetUri = UserAgent.makeURI(uri)
    if (!targetUri) {
      throw new Error('Invalid SIP target URI')
    }

    const isMasked = Boolean(opts.isMaskedVault || isVaultTarget(uri))
    const callId = `sip-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    const inviter = new Inviter(this.ua, targetUri, {
      sessionDescriptionHandlerOptions: {
        constraints: {
          audio: this.getAudioConstraints(),
          video: false,
        },
      },
    })

    const safeLabel = isMasked ? (displayLabel || 'Masked Vault Owner') : displayLabel
    this.emit({
      lastError: null,
      activeCall: {
        id: callId,
        direction: 'out',
        state: 'dialing',
        remoteTarget: isMasked ? 'Masked Vault Owner' : uri,
        remoteDisplay: safeLabel,
        isMaskedVault: isMasked,
        vaultPropertyId: opts.propertyId ?? null,
        muted: false,
        onHold: false,
        startedAt: Date.now(),
        connectedAt: null,
        durationSec: 0,
        error: null,
      },
    })

    this.bindSessionLifecycle(inviter, {
      id: callId,
      direction: 'out',
      remoteTarget: isMasked ? 'Masked Vault Owner' : uri,
      remoteDisplay: safeLabel,
      isMaskedVault: isMasked,
      vaultPropertyId: opts.propertyId ?? null,
    })

    try {
      await inviter.invite({
        requestDelegate: {
          onReject: (res) => {
            const msg = `${res.message.statusCode || 480} ${res.message.reasonPhrase || 'Call rejected'}`
            this.updateCall({ error: msg })
            this.emit({ lastError: msg })
          },
        },
      })
    } catch (e: any) {
      const msg = e?.message || 'Failed to place SIP call'
      this.updateCall({ error: msg })
      this.clearCallMedia()
      this.activeSession = null
      this.emit({ activeCall: null, lastError: msg })
      throw e
    }
  }

  async answer(): Promise<void> {
    const session = this.activeSession
    if (!(session instanceof Invitation)) return
    this.stopRingtone()
    await session.accept({
      sessionDescriptionHandlerOptions: {
        constraints: {
          audio: this.getAudioConstraints(),
          video: false,
        },
      },
    })
  }

  async hangup(): Promise<void> {
    this.stopRingtone()
    const consult = this.consultSession
    if (consult) {
      this.consultSession = null
      try {
        await this.terminateSession(consult)
      } catch {
        /* ignore */
      }
      this.emit({ consultCall: null })
    }
    const session = this.activeSession
    if (!session) {
      this.emit({ activeCall: null })
      return
    }
    try {
      await this.terminateSession(session)
    } catch {
      this.clearCallMedia()
      this.activeSession = null
      this.emit({ activeCall: null, consultCall: null })
    }
  }

  toggleMute(): void {
    const targetSession = this.consultSession ?? this.activeSession
    const targetCall = this.consultSession ? this.snapshot.consultCall : this.snapshot.activeCall
    if (!targetSession || !targetCall) return
    const nextMuted = !targetCall.muted
    const sdh = targetSession.sessionDescriptionHandler as Web.SessionDescriptionHandler | undefined
    sdh?.enableSenderTracks(!nextMuted)
    sdh?.localMediaStream?.getAudioTracks().forEach((t) => {
      t.enabled = !nextMuted
    })
    if (this.consultSession) this.updateConsult({ muted: nextMuted })
    else this.updateCall({ muted: nextMuted })
  }

  async toggleHold(): Promise<void> {
    const session = this.activeSession
    const call = this.snapshot.activeCall
    if (!session || !call || session.state !== SessionState.Established) return
    const nextHold = !call.onHold
    await this.setSessionHold(session, nextHold, call.muted)
    if (!nextHold && !this.consultSession) {
      this.attachRemoteMedia(session)
    }
    this.updateCall({ onHold: nextHold })
  }

  async sendDtmf(digit: string): Promise<void> {
    const clean = digit.trim().toUpperCase()
    if (!/^[0-9*#A-D]$/.test(clean)) return
    this.playDtmfBeep(clean)
    const session = this.consultSession?.state === SessionState.Established ? this.consultSession : this.activeSession
    if (!session || session.state !== SessionState.Established) return
    const sdh = session.sessionDescriptionHandler as Web.SessionDescriptionHandler | undefined
    const sentRtp = sdh?.sendDtmf(clean, { duration: 120, interToneGap: 60 }) ?? false
    if (!sentRtp) {
      await session.info({
        requestOptions: {
          body: {
            contentDisposition: 'render',
            contentType: 'application/dtmf-relay',
            content: `Signal=${clean}\r\nDuration=120`,
          },
        },
      })
    }
  }

  async transferBlind(target: string): Promise<void> {
    const session = this.activeSession
    if (!session || session.state !== SessionState.Established) {
      throw new Error('Transfer is available once the call is connected.')
    }
    const targetUri = this.resolveTargetUri(target)
    await session.refer(targetUri)
  }

  async startAttendedTransfer(target: string, displayLabel?: string): Promise<void> {
    const primary = this.activeSession
    const primarySnap = this.snapshot.activeCall
    if (!primary || !primarySnap || primary.state !== SessionState.Established) {
      throw new Error('Attended transfer is available once the primary call is connected.')
    }
    if (this.consultSession) {
      throw new Error('A consultation call is already in progress.')
    }
    if (!this.ua) {
      throw new Error('SIP softphone is not connected.')
    }

    const targetUri = this.resolveTargetUri(target)
    if (!primarySnap.onHold) {
      await this.setSessionHold(primary, true, primarySnap.muted)
      this.updateCall({ onHold: true })
    }

    const consultId = `sip-consult-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    const inviter = new Inviter(this.ua, targetUri, {
      sessionDescriptionHandlerOptions: {
        constraints: {
          audio: this.getAudioConstraints(),
          video: false,
        },
      },
    })

    const label = displayLabel?.trim() || target.trim()
    this.emit({
      lastError: null,
      consultCall: {
        id: consultId,
        direction: 'out',
        state: 'dialing',
        remoteTarget: targetUri.toString(),
        remoteDisplay: label,
        isMaskedVault: false,
        vaultPropertyId: null,
        muted: false,
        onHold: false,
        startedAt: Date.now(),
        connectedAt: null,
        durationSec: 0,
        error: null,
      },
    })

    this.bindConsultLifecycle(inviter, {
      id: consultId,
      remoteTarget: targetUri.toString(),
      remoteDisplay: label,
    })

    try {
      await inviter.invite({
        requestDelegate: {
          onReject: (res) => {
            const msg = `${res.message.statusCode || 480} ${res.message.reasonPhrase || 'Consultation call rejected'}`
            this.updateConsult({ error: msg })
            this.emit({ lastError: msg })
          },
        },
      })
    } catch (e: any) {
      const msg = e?.message || 'Failed to start consultation call'
      this.consultSession = null
      this.emit({ consultCall: null, lastError: msg })
      if (primary.state === SessionState.Established && this.snapshot.activeCall?.onHold) {
        try {
          await this.setSessionHold(primary, false, primarySnap.muted)
          this.attachRemoteMedia(primary)
          this.updateCall({ onHold: false })
        } catch {
          /* ignore */
        }
      }
      throw e
    }
  }

  async completeAttendedTransfer(): Promise<void> {
    const primary = this.activeSession
    const consult = this.consultSession
    if (!primary || primary.state !== SessionState.Established) {
      throw new Error('Primary call is no longer connected.')
    }
    if (!consult || consult.state !== SessionState.Established || !consult.dialog) {
      throw new Error('Wait for the consultation call to answer before completing the transfer.')
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finishOk = () => {
        if (settled) return
        settled = true
        resolve()
      }
      const finishErr = (err: Error) => {
        if (settled) return
        settled = true
        reject(err)
      }

      const cleanupBothLegs = () => {
        const curConsult = this.consultSession
        const curPrimary = this.activeSession
        if (curConsult && curConsult === consult) {
          this.consultSession = null
          void this.terminateSession(curConsult).catch(() => {})
          this.emit({ consultCall: null })
        }
        if (curPrimary && curPrimary === primary) {
          void this.terminateSession(curPrimary).catch(() => {})
        }
      }

      void primary
        .refer(consult, {
          requestDelegate: {
            onAccept: () => {
              finishOk()
              // Give PBX/peer a moment to process REFER with Replaces, then close remaining local legs if still open
              if (typeof window !== 'undefined') {
                window.setTimeout(cleanupBothLegs, 800)
              } else {
                cleanupBothLegs()
              }
            },
            onReject: (res) => {
              finishErr(new Error(`${res.message.statusCode || 480} ${res.message.reasonPhrase || 'Transfer rejected'}`))
            },
          },
          onNotify: (notif) => {
            void notif.accept().catch(() => {})
            const body = String(notif.request?.body || '')
            if (/^SIP\/2\.0\s+2\d\d\b/m.test(body)) {
              cleanupBothLegs()
            }
          },
        })
        .catch((err) => finishErr(err instanceof Error ? err : new Error(String(err))))
    })
  }

  async cancelAttendedTransfer(): Promise<void> {
    const consult = this.consultSession
    if (consult) {
      this.consultSession = null
      try {
        await this.terminateSession(consult)
      } catch {
        /* ignore */
      }
      this.emit({ consultCall: null })
    }
    const primary = this.activeSession
    const primarySnap = this.snapshot.activeCall
    if (primary && primary.state === SessionState.Established && primarySnap?.onHold) {
      await this.setSessionHold(primary, false, primarySnap.muted)
      this.attachRemoteMedia(primary)
      this.updateCall({ onHold: false })
    }
  }

  async listAudioDevices(): Promise<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return { inputs: [], outputs: [] }
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      return {
        inputs: devices.filter((d) => d.kind === 'audioinput'),
        outputs: devices.filter((d) => d.kind === 'audiooutput'),
      }
    } catch {
      return { inputs: [], outputs: [] }
    }
  }

  async setAudioDevices(opts: { inputDeviceId?: string; outputDeviceId?: string }): Promise<void> {
    const patch: Partial<SipClientSnapshot> = {}
    if (opts.inputDeviceId !== undefined) {
      writeStorage(INPUT_DEV_KEY, opts.inputDeviceId)
      patch.inputDeviceId = opts.inputDeviceId
    }
    if (opts.outputDeviceId !== undefined) {
      writeStorage(OUTPUT_DEV_KEY, opts.outputDeviceId)
      patch.outputDeviceId = opts.outputDeviceId
      if (this.audioEl && typeof (this.audioEl as any).setSinkId === 'function') {
        await (this.audioEl as any).setSinkId(opts.outputDeviceId).catch(() => {})
      }
    }
    this.emit(patch)
    if (opts.inputDeviceId !== undefined && !this.activeSession && this.snapshot.configured) {
      await this.init(true)
    }
  }
}

export const sipClient = new SwkSipClient()

export function useSipClient(): SipClientSnapshot {
  return useSyncExternalStore(sipClient.subscribe, sipClient.getSnapshot, sipClient.getSnapshot)
}
