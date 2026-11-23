import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  Copy,
  Delete,
  Grid3X3,
  History,
  KeyRound,
  Lock,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneCall,
  PhoneForwarded,
  PhoneIncoming,
  PhoneOff,
  Play,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
  Volume2,
} from 'lucide-react'
import { canOpenEmployeeRecords } from '@shared/swk-staff-access'
import { del, get, put } from '../../lib/api'
import { useMeta } from '../../lib/meta'
import { sipClient, useSipClient, type SipIceServer } from '../../lib/sipClient'
import { useToast } from '../../lib/toast'
import { ModuleHeader, Pill, Segmented } from '../../swk/ui'

interface DirectoryEntry {
  user_id: number
  name: string
  extension_no: string
  display_name: string
  designation: string
}

interface CallHistoryRow {
  id: number
  call_id: string
  started_at: string
  ended_at: string | null
  direction: 'in' | 'out'
  from_number: string
  to_number: string
  caller_name: string
  status: string
  outcome: string
  duration_sec: number
  summary: string
  user_id: number | null
  user_name: string
  extension_no: string
  is_vault_masked: boolean
}

interface AdminExtensionRow {
  id: number
  user_id: number
  user_name: string
  user_email: string
  designation: string
  extension_no: string
  sip_username: string
  sip_password: string
  has_password: boolean
  display_name: string
  allow_direct_dial: boolean
  active: boolean
  updated_at: string
}

interface StaffUserOption {
  id: number
  name: string
  email: string
  designation: string
  role_name: string
}

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function PhonePage() {
  const { me } = useMeta()
  const snap = useSipClient()
  const toast = useToast()
  const isSipAdmin = canOpenEmployeeRecords(me)

  const [tab, setTab] = useState<'dialer' | 'directory' | 'history' | 'admin'>('dialer')
  const [dialInput, setDialInput] = useState('')
  const [transferMode, setTransferMode] = useState<'blind' | 'attended'>('blind')
  const [transferTarget, setTransferTarget] = useState('')
  const [busy, setBusy] = useState(false)

  // Directory & History
  const [directory, setDirectory] = useState<DirectoryEntry[]>([])
  const [dirSearch, setDirSearch] = useState('')
  const [calls, setCalls] = useState<CallHistoryRow[]>([])

  // Audio Devices
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([])
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([])

  // Admin SIP Config & Extensions
  const [cfgForm, setCfgForm] = useState({
    sip_enabled: false,
    sip_ws_url: '',
    sip_domain: '',
    sip_outbound_proxy: '',
    sip_ice_servers_text: '[{"urls":"stun:stun.l.google.com:19302"}]',
    sip_caller_id_mode: 'company_main',
    sip_vault_bridge_prefix: '',
    sip_webhook_secret: '',
    sip_webhook_secret_set: false,
  })
  const [generatedSecret, setGeneratedSecret] = useState('')
  const [copiedSecret, setCopiedSecret] = useState(false)
  const [extRows, setExtRows] = useState<AdminExtensionRow[]>([])
  const [staffOptions, setStaffOptions] = useState<StaffUserOption[]>([])
  const [extForm, setExtForm] = useState({
    user_id: '',
    extension_no: '',
    sip_username: '',
    sip_password: '',
    display_name: '',
    allow_direct_dial: false,
    active: true,
  })

  const refreshDevices = useCallback(async () => {
    const res = await sipClient.listAudioDevices()
    setInputs(res.inputs)
    setOutputs(res.outputs)
  }, [])

  const loadDirectory = useCallback(async () => {
    try {
      const res = await get<{ rows: DirectoryEntry[] }>('/api/sip/directory')
      setDirectory(res.rows || [])
    } catch (e: any) {
      toast.error(e?.message || 'Could not load extension directory')
    }
  }, [toast])

  const loadHistory = useCallback(async () => {
    try {
      const res = await get<{ rows: CallHistoryRow[] }>('/api/sip/calls')
      setCalls(res.rows || [])
    } catch (e: any) {
      toast.error(e?.message || 'Could not load SIP call history')
    }
  }, [toast])

  const loadAdmin = useCallback(async () => {
    if (!isSipAdmin) return
    try {
      const [cfg, exts] = await Promise.all([
        get<any>('/api/sip/admin/config'),
        get<{ rows: AdminExtensionRow[]; staff: StaffUserOption[] }>('/api/sip/admin/extensions'),
      ])
      setCfgForm({
        sip_enabled: Boolean(cfg.sip_enabled),
        sip_ws_url: cfg.sip_ws_url || '',
        sip_domain: cfg.sip_domain || '',
        sip_outbound_proxy: cfg.sip_outbound_proxy || '',
        sip_ice_servers_text: JSON.stringify(cfg.sip_ice_servers || [], null, 2),
        sip_caller_id_mode: cfg.sip_caller_id_mode || 'company_main',
        sip_vault_bridge_prefix: cfg.sip_vault_bridge_prefix || '',
        sip_webhook_secret: cfg.sip_webhook_secret || '',
        sip_webhook_secret_set: Boolean(cfg.sip_webhook_secret_set),
      })
      setExtRows(exts.rows || [])
      setStaffOptions(exts.staff || [])
    } catch (e: any) {
      toast.error(e?.message || 'Could not load SIP admin setup')
    }
  }, [isSipAdmin, toast])

  useEffect(() => {
    void sipClient.init()
    const stopWake = sipClient.connectWakeStream()
    void refreshDevices()
    void loadDirectory()
    void loadHistory()
    return () => {
      stopWake()
    }
  }, [refreshDevices, loadDirectory, loadHistory])

  useEffect(() => {
    if (tab === 'directory') void loadDirectory()
    if (tab === 'history') void loadHistory()
    if (tab === 'admin') void loadAdmin()
  }, [tab, loadDirectory, loadHistory, loadAdmin])

  const filteredDirectory = useMemo(() => {
    const q = dirSearch.trim().toLowerCase()
    if (!q) return directory
    return directory.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.display_name.toLowerCase().includes(q) ||
        d.extension_no.toLowerCase().includes(q) ||
        d.designation.toLowerCase().includes(q),
    )
  }, [directory, dirSearch])

  const dialTarget = async (target: string, label?: string) => {
    if (!target.trim() || busy) return
    setBusy(true)
    try {
      await sipClient.dial(target.trim(), { displayLabel: label || target.trim() })
    } catch (e: any) {
      toast.error(e?.message || 'Failed to place SIP call')
    } finally {
      setBusy(false)
    }
  }

  const handleTransfer = async (target: string, mode: 'blind' | 'attended' = transferMode) => {
    if (!target.trim() || busy) return
    setBusy(true)
    try {
      if (mode === 'attended') {
        await sipClient.startAttendedTransfer(target.trim())
        toast.ok(`Dialing consultation target ${target.trim()} (primary call on hold)`)
      } else {
        await sipClient.transferBlind(target.trim())
        toast.ok(`Transferred active call to ${target.trim()}`)
        setTransferTarget('')
      }
    } catch (e: any) {
      toast.error(e?.message || 'Transfer failed')
    } finally {
      setBusy(false)
    }
  }

  const handleCompleteAttended = async () => {
    if (busy) return
    setBusy(true)
    try {
      await sipClient.completeAttendedTransfer()
      toast.ok('Attended transfer completed')
      setTransferTarget('')
    } catch (e: any) {
      toast.error(e?.message || 'Could not complete attended transfer')
    } finally {
      setBusy(false)
    }
  }

  const handleCancelAttended = async () => {
    if (busy) return
    setBusy(true)
    try {
      await sipClient.cancelAttendedTransfer()
      toast.ok('Consultation ended — primary call resumed')
    } catch (e: any) {
      toast.error(e?.message || 'Could not resume primary call')
    } finally {
      setBusy(false)
    }
  }

  const saveTrunkConfig = async (regenerateSecret = false) => {
    let parsedIce: SipIceServer[] = []
    try {
      const raw = JSON.parse(cfgForm.sip_ice_servers_text || '[]')
      if (!Array.isArray(raw)) throw new Error('ICE servers must be a JSON array')
      parsedIce = raw
    } catch (e: any) {
      toast.error(e?.message || 'Invalid ICE servers JSON')
      return
    }
    setBusy(true)
    try {
      const res = await put<any>('/api/sip/admin/config', {
        sip_enabled: cfgForm.sip_enabled,
        sip_ws_url: cfgForm.sip_ws_url.trim(),
        sip_domain: cfgForm.sip_domain.trim(),
        sip_outbound_proxy: cfgForm.sip_outbound_proxy.trim(),
        sip_ice_servers: parsedIce,
        sip_caller_id_mode: cfgForm.sip_caller_id_mode,
        sip_vault_bridge_prefix: cfgForm.sip_vault_bridge_prefix.trim(),
        sip_webhook_secret: cfgForm.sip_webhook_secret,
        regenerate_secret: regenerateSecret,
      })
      if (res.generated_webhook_secret) {
        setGeneratedSecret(res.generated_webhook_secret)
        setCopiedSecret(false)
        toast.ok('New SIP PBX webhook secret generated — copy it below')
      } else {
        toast.ok('SIP trunk configuration saved')
      }
      await loadAdmin()
      await sipClient.init(true)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save SIP configuration')
    } finally {
      setBusy(false)
    }
  }

  const saveExtension = async () => {
    const uid = Number(extForm.user_id)
    if (!uid || !extForm.extension_no.trim() || !extForm.sip_username.trim()) {
      toast.error('Select a staff member and enter extension number & SIP username')
      return
    }
    setBusy(true)
    try {
      await put('/api/sip/admin/extensions', {
        user_id: uid,
        extension_no: extForm.extension_no.trim(),
        sip_username: extForm.sip_username.trim(),
        sip_password: extForm.sip_password || undefined,
        display_name: extForm.display_name.trim() || undefined,
        allow_direct_dial: extForm.allow_direct_dial,
        active: extForm.active,
      })
      toast.ok(`Extension ${extForm.extension_no.trim()} saved`)
      setExtForm((f) => ({ ...f, sip_password: '' }))
      await loadAdmin()
      await loadDirectory()
      await sipClient.init(true)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save extension')
    } finally {
      setBusy(false)
    }
  }

  const deleteExtension = async (userId: number, name: string) => {
    setBusy(true)
    try {
      await del(`/api/sip/admin/extensions/${userId}`)
      toast.ok(`Removed SIP extension for ${name}`)
      await loadAdmin()
      await loadDirectory()
      await sipClient.init(true)
    } catch (e: any) {
      toast.error(e?.message || 'Could not remove extension')
    } finally {
      setBusy(false)
    }
  }

  const copySecret = async () => {
    if (!generatedSecret) return
    try {
      await navigator.clipboard.writeText(generatedSecret)
      setCopiedSecret(true)
      toast.ok('Copied webhook secret')
    } catch {
      toast.error('Copy failed — select and copy manually')
    }
  }

  const call = snap.activeCall
  const consult = snap.consultCall
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://os.swk.properties'
  const regTone =
    snap.registration === 'registered'
      ? 'oasis'
      : snap.registration === 'error'
        ? 'dune'
        : snap.registration === 'connecting'
          ? 'sky'
          : 'grey'

  const tabOptions = [
    { value: 'dialer', label: 'Dialer & Audio' },
    { value: 'directory', label: `Directory (${directory.length})` },
    { value: 'history', label: `Call History (${calls.length})` },
    ...(isSipAdmin ? [{ value: 'admin', label: 'SIP Trunk & Extensions' }] : []),
  ] as { value: 'dialer' | 'directory' | 'history' | 'admin'; label: string }[]

  return (
    <div className="p-5 max-w-6xl mx-auto space-y-5">
      <ModuleHeader
        eyebrow="SWK Voice & Masked Vault Protocol"
        title="WebRTC SIP Softphone"
        subtitle="Direct browser/mobile extension calling, internal transfers, and zero-leak Masked Vault dialing"
        icon={<PhoneCall size={22} />}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Pill tone={regTone}>
              {snap.configured
                ? snap.registration === 'registered'
                  ? `Registered · Ext ${snap.extensionNo}`
                  : snap.registration === 'connecting'
                    ? 'Connecting…'
                    : snap.registration === 'error'
                      ? 'SIP Error'
                      : 'Disconnected'
                : 'Not Configured'}
            </Pill>
            <button
              type="button"
              onClick={() => void sipClient.init(true)}
              className="btn outline sm"
            >
              <RefreshCw size={14} /> Reconnect
            </button>
          </div>
        }
      />

      {!snap.configured && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-3">
          <div>
            <b>Softphone Not Configured:</b> {snap.reason}
          </div>
          {isSipAdmin && (
            <button
              type="button"
              onClick={() => setTab('admin')}
              className="px-3 py-1.5 rounded-xl bg-[#121212] text-white text-xs font-bold border-0 cursor-pointer"
            >
              Configure SIP Trunk &amp; Extensions
            </button>
          )}
        </div>
      )}

      {snap.lastWake && !call && (
        <div className="rounded-2xl border border-[#047857]/40 bg-[#e8fff6] px-4 py-3 text-xs text-[#0a4638] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <PhoneIncoming size={16} className="text-[#047857]" />
            <span>
              <b>Incoming PBX Wake Alert:</b> {snap.lastWake.caller_name || snap.lastWake.caller_id || 'Caller'} on Ext{' '}
              <b>{snap.lastWake.extension_no}</b>
            </span>
          </div>
          <button
            type="button"
            onClick={() => void sipClient.init(true)}
            className="px-3 py-1.5 rounded-lg bg-[#047857] text-white font-bold border-0 cursor-pointer"
          >
            Sync SIP Line
          </button>
        </div>
      )}

      <Segmented
        value={tab}
        onChange={setTab}
        options={tabOptions}
        layoutId="phone-tabs"
      />

      {/* ===================================================================
          TAB 1: Dialer, Active Call Workspace & Audio Device Selector
         =================================================================== */}
      {tab === 'dialer' && (
        <div className="grid gap-5 lg:grid-cols-[380px_1fr] items-start">
          {/* Dialpad Card */}
          <div className="rounded-2xl border border-line bg-card p-5 shadow-xs space-y-4">
            {call ? (
              <div className="space-y-4">
                <div className="rounded-2xl bg-[#121212] text-white p-4 text-center space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#d4b672]">
                    {call.isMaskedVault ? (
                      <>
                        <Lock size={12} /> Masked Vault Session
                      </>
                    ) : call.direction === 'in' ? (
                      <>
                        <PhoneIncoming size={12} /> Incoming Call
                      </>
                    ) : (
                      <>
                        <PhoneCall size={12} /> Outbound Call
                      </>
                    )}
                  </div>
                  <div className="text-lg font-bold">{call.remoteDisplay}</div>
                  <div className="text-xs font-mono text-white/60">
                    {call.isMaskedVault ? 'MASKED •••• (Zero Phone Exposure)' : call.remoteTarget}
                  </div>
                  <div className="text-2xl font-mono font-bold text-[#047857] pt-1">
                    {call.state === 'ringing_in'
                      ? 'Ringing…'
                      : call.state === 'dialing' || call.state === 'connecting'
                        ? 'Connecting…'
                        : call.onHold
                          ? `HOLD · ${fmtDuration(call.durationSec)}`
                          : fmtDuration(call.durationSec)}
                  </div>
                </div>

                {call.state === 'ringing_in' ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => void sipClient.answer().catch((e: any) => toast.error(e?.message || 'Answer failed'))}
                      className="py-3 rounded-xl bg-[#047857] hover:bg-[#0a4638] text-white text-xs font-bold flex items-center justify-center gap-1.5 border-0 cursor-pointer"
                    >
                      <Phone size={15} /> Answer
                    </button>
                    <button
                      type="button"
                      onClick={() => void sipClient.hangup()}
                      className="py-3 rounded-xl bg-[#dc2626] hover:bg-red-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 border-0 cursor-pointer"
                    >
                      <PhoneOff size={15} /> Decline
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => sipClient.toggleMute()}
                        className={`py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border cursor-pointer ${
                          call.muted
                            ? 'bg-amber-50 border-amber-300 text-amber-900'
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      >
                        {call.muted ? <MicOff size={14} /> : <Mic size={14} />}
                        {call.muted ? 'Unmute Mic' : 'Mute Mic'}
                      </button>
                      <button
                        type="button"
                        disabled={call.state !== 'connected'}
                        onClick={() => void sipClient.toggleHold().catch((e: any) => toast.error(e?.message || 'Hold failed'))}
                        className={`py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border cursor-pointer disabled:opacity-40 ${
                          call.onHold
                            ? 'bg-amber-50 border-amber-300 text-amber-900'
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      >
                        {call.onHold ? <Play size={14} /> : <Pause size={14} />}
                        {call.onHold ? 'Resume' : 'Hold'}
                      </button>
                    </div>

                    <div className="pt-1">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                        <Grid3X3 size={12} /> In-Call DTMF Keypad
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {KEYPAD.map((k) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => void sipClient.sendDtmf(k)}
                            className="h-10 rounded-xl bg-slate-100 hover:bg-slate-200 font-mono text-sm font-bold text-slate-900 border-0 cursor-pointer"
                          >
                            {k}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1">
                          <PhoneForwarded size={12} /> Call Transfer
                        </span>
                        <div className="flex gap-1 text-[11px] font-bold">
                          <button
                            type="button"
                            disabled={!!consult}
                            onClick={() => setTransferMode('blind')}
                            className={`px-2.5 py-1 rounded-lg border cursor-pointer disabled:opacity-50 ${
                              transferMode === 'blind'
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-600 border-slate-200'
                            }`}
                          >
                            Blind
                          </button>
                          <button
                            type="button"
                            onClick={() => setTransferMode('attended')}
                            className={`px-2.5 py-1 rounded-lg border cursor-pointer ${
                              transferMode === 'attended'
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-600 border-slate-200'
                            }`}
                          >
                            Attended
                          </button>
                        </div>
                      </div>

                      {consult ? (
                        <div className="space-y-2">
                          <div className="rounded-lg bg-white border border-slate-200 px-3 py-2 flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-800 truncate">
                              Consult: {consult.remoteDisplay}
                            </span>
                            <span className="font-mono font-bold text-[#047857]">
                              {consult.state === 'connected' ? fmtDuration(consult.durationSec) : 'Ringing…'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={busy || consult.state !== 'connected'}
                              onClick={() => void handleCompleteAttended()}
                              className="py-2 rounded-xl bg-[#047857] hover:bg-[#0a4638] text-white text-xs font-bold border-0 cursor-pointer disabled:opacity-40"
                            >
                              Complete Transfer
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleCancelAttended()}
                              className="py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 text-xs font-bold border border-amber-300 cursor-pointer disabled:opacity-40"
                            >
                              Cancel &amp; Resume
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-1.5">
                          <input
                            value={transferTarget}
                            onChange={(e) => setTransferTarget(e.target.value)}
                            placeholder={
                              transferMode === 'attended'
                                ? 'Consult Ext or SIP URI (holds current call)'
                                : 'Blind transfer to Ext or SIP URI'
                            }
                            className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs"
                          />
                          <button
                            type="button"
                            disabled={busy || call.state !== 'connected' || !transferTarget.trim()}
                            onClick={() => void handleTransfer(transferTarget, transferMode)}
                            className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1 border-0 cursor-pointer disabled:opacity-40"
                          >
                            <PhoneForwarded size={13} /> {transferMode === 'attended' ? 'Start Consult' : 'Transfer'}
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => void sipClient.hangup()}
                      className="w-full py-3 rounded-xl bg-[#dc2626] hover:bg-red-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 border-0 cursor-pointer"
                    >
                      <PhoneOff size={15} /> End Call
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="label" htmlFor="sip-dial-input">
                    Extension, Number, or SIP URI
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="sip-dial-input"
                      value={dialInput}
                      onChange={(e) => setDialInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void dialTarget(dialInput)
                      }}
                      placeholder={snap.allowDirectDial ? '102 or +97150...' : 'Colleague Ext (e.g. 102)'}
                      className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-line bg-soft text-ink font-mono text-base"
                    />
                    {dialInput && (
                      <button
                        type="button"
                        aria-label="Backspace"
                        onClick={() => setDialInput((s) => s.slice(0, -1))}
                        className="p-2.5 rounded-xl border border-line bg-soft text-ink hover:bg-hover cursor-pointer"
                      >
                        <Delete size={16} />
                      </button>
                    )}
                  </div>
                  {snap.configured && !snap.allowDirectDial && (
                    <p className="text-[11px] text-muted mt-1 mb-0">
                      Direct external dialing is restricted; use internal extensions or <b>My Assigned Deals</b> for Masked Vault calls.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {KEYPAD.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setDialInput((s) => s + k)
                        void sipClient.sendDtmf(k)
                      }}
                      className="h-12 rounded-xl bg-soft hover:bg-hover text-ink font-mono text-base font-bold border border-line cursor-pointer transition-colors"
                    >
                      {k}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={busy || !snap.configured || !dialInput.trim()}
                  onClick={() => void dialTarget(dialInput)}
                  className="w-full py-3 rounded-xl bg-[#047857] hover:bg-[#0a4638] text-white text-sm font-bold flex items-center justify-center gap-2 border-0 cursor-pointer disabled:opacity-40"
                >
                  <Phone size={16} /> Place SIP Call
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Audio Devices + Quick Team Extensions */}
          <div className="space-y-5">
            <div className="rounded-2xl border border-line bg-card p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Volume2 size={18} className="text-[#047857] dark:text-[#34d399]" />
                  <h2 className="text-sm font-bold text-ink m-0">Audio Hardware &amp; Ringtone</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void sipClient.playTestTone()}
                    className="btn outline sm"
                  >
                    Test Tone
                  </button>
                  <button
                    type="button"
                    onClick={() => void refreshDevices()}
                    className="btn outline sm"
                  >
                    <RefreshCw size={13} /> Refresh
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="label" htmlFor="sip-mic-select">
                    Microphone (Input)
                  </label>
                  <select
                    id="sip-mic-select"
                    className="select"
                    value={snap.inputDeviceId}
                    onChange={(e) => void sipClient.setAudioDevices({ inputDeviceId: e.target.value })}
                  >
                    <option value="">System Default Microphone</option>
                    {inputs.map((d, idx) => (
                      <option key={d.deviceId || idx} value={d.deviceId}>
                        {d.label || `Microphone ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="sip-spk-select">
                    Speaker / Headset (Output)
                  </label>
                  <select
                    id="sip-spk-select"
                    className="select"
                    value={snap.outputDeviceId}
                    onChange={(e) => void sipClient.setAudioDevices({ outputDeviceId: e.target.value })}
                  >
                    <option value="">System Default Speaker</option>
                    {outputs.map((d, idx) => (
                      <option key={d.deviceId || idx} value={d.deviceId}>
                        {d.label || `Speaker ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-card p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-[#047857] dark:text-[#34d399]" />
                  <h2 className="text-sm font-bold text-ink m-0">Internal Colleague Quick-Dial</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setTab('directory')}
                  className="text-xs font-bold text-[#047857] dark:text-[#34d399] bg-transparent border-0 cursor-pointer"
                >
                  View all →
                </button>
              </div>
              {directory.length === 0 ? (
                <div className="text-xs text-muted py-4 text-center">
                  No active SIP extensions provisioned yet.
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {directory.slice(0, 8).map((d) => (
                    <div
                      key={d.user_id}
                      className="flex items-center justify-between gap-2 p-3 rounded-xl border border-line bg-soft"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-ink truncate">{d.display_name || d.name}</div>
                        <div className="text-[11px] text-muted truncate">
                          Ext <span className="font-mono font-bold text-ink">{d.extension_no}</span>
                          {d.designation ? ` · ${d.designation}` : ''}
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {call?.state === 'connected' && !consult ? (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => void handleTransfer(d.extension_no, 'blind')}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold flex items-center gap-1 border-0 cursor-pointer"
                            >
                              <PhoneForwarded size={12} /> Blind
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleTransfer(d.extension_no, 'attended')}
                              className="px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-950 text-[11px] font-bold border border-amber-300 cursor-pointer"
                            >
                              Consult
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={!snap.configured || d.extension_no === snap.extensionNo}
                            onClick={() => void dialTarget(d.extension_no, d.display_name || d.name)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#047857] hover:bg-[#0a4638] text-white text-[11px] font-bold flex items-center gap-1 border-0 cursor-pointer disabled:opacity-40"
                          >
                            <Phone size={12} /> Call
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          TAB 2: Internal Extension Directory
         =================================================================== */}
      {tab === 'directory' && (
        <div className="rounded-2xl border border-line bg-card p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <input
              value={dirSearch}
              onChange={(e) => setDirSearch(e.target.value)}
              placeholder="Search colleague name, extension, or role..."
              className="flex-1 min-w-[220px] px-3 py-2 text-xs rounded-xl border border-line bg-soft text-ink"
            />
            <button type="button" onClick={() => void loadDirectory()} className="btn outline sm">
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          <div className="overflow-x-auto border border-line rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-soft border-b border-line text-[11px] uppercase text-muted">
                  <th className="p-3">Ext</th>
                  <th className="p-3">Staff Member</th>
                  <th className="p-3">Designation</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredDirectory.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted">
                      No matching extensions found.
                    </td>
                  </tr>
                ) : (
                  filteredDirectory.map((d) => (
                    <tr key={d.user_id} className="hover:bg-hover">
                      <td className="p-3 font-mono font-bold text-[#047857] dark:text-[#34d399]">{d.extension_no}</td>
                      <td className="p-3 font-semibold text-ink">{d.display_name || d.name}</td>
                      <td className="p-3 text-muted">{d.designation || '—'}</td>
                      <td className="p-3 text-right">
                        <div className="inline-flex gap-1.5">
                          <button
                            type="button"
                            disabled={!snap.configured || !!call || d.extension_no === snap.extensionNo}
                            onClick={() => void dialTarget(d.extension_no, d.display_name || d.name)}
                            className="px-3 py-1.5 rounded-lg bg-[#047857] text-white font-bold flex items-center gap-1 border-0 cursor-pointer disabled:opacity-40"
                          >
                            <Phone size={12} /> Call
                          </button>
                          {call?.state === 'connected' && !consult && (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleTransfer(d.extension_no, 'blind')}
                                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-bold flex items-center gap-1 border-0 cursor-pointer"
                              >
                                <PhoneForwarded size={12} /> Blind
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleTransfer(d.extension_no, 'attended')}
                                className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-950 font-bold border border-amber-300 cursor-pointer"
                              >
                                Consult
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================
          TAB 3: Role-Scoped Call History (Masked Vault numbers never shown)
         =================================================================== */}
      {tab === 'history' && (
        <div className="rounded-2xl border border-line bg-card p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-ink">
              <History size={16} className="text-[#047857] dark:text-[#34d399]" />
              SIP Call History (Vault numbers remain strictly masked)
            </div>
            <button type="button" onClick={() => void loadHistory()} className="btn outline sm">
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          <div className="overflow-x-auto border border-line rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-soft border-b border-line text-[11px] uppercase text-muted">
                  <th className="p-3">Started</th>
                  <th className="p-3">Agent</th>
                  <th className="p-3">Dir</th>
                  <th className="p-3">Caller / Target</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {calls.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted">
                      No SIP calls recorded yet.
                    </td>
                  </tr>
                ) : (
                  calls.map((c) => (
                    <tr key={c.id}>
                      <td className="p-3 font-mono text-[11px] text-muted">{c.started_at}</td>
                      <td className="p-3 font-semibold text-ink">
                        {c.user_name || (c.extension_no ? `Ext ${c.extension_no}` : '—')}
                      </td>
                      <td className="p-3 uppercase font-bold text-[11px] text-body">{c.direction}</td>
                      <td className="p-3 font-medium text-ink">
                        {c.is_vault_masked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 text-[#d4b672] font-mono text-[11px] font-bold">
                            <Lock size={10} /> Masked Vault Owner
                          </span>
                        ) : (
                          <span>{c.direction === 'out' ? c.to_number : c.from_number}</span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-ink">{fmtDuration(c.duration_sec)}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            c.status === 'Completed'
                              ? 'bg-emerald-50 text-emerald-800'
                              : c.status === 'Failed'
                                ? 'bg-red-50 text-red-700'
                                : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="p-3 text-muted max-w-xs truncate">{c.summary}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================
          TAB 4: Owner & Admin SIP Trunk & Extension Setup (canOpenEmployeeRecords)
         =================================================================== */}
      {tab === 'admin' && isSipAdmin && (
        <div className="space-y-5">
          {/* Trunk & Dual Masked-Vault Protocol Setup */}
          <div className="rounded-2xl border border-line bg-card p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-ink">
                  <Settings2 size={17} className="text-[#047857] dark:text-[#34d399]" /> Company SIP Trunk &amp; Dual Masked-Vault Config
                </div>
                <p className="text-xs text-muted mt-0.5 mb-0">
                  Configure your WebRTC WSS gateway (Asterisk, FreeSWITCH, 3CX, or Yealink/Yeastar) and Vault dial prefix.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-ink cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-[#047857]"
                  checked={cfgForm.sip_enabled}
                  onChange={(e) => setCfgForm((f) => ({ ...f, sip_enabled: e.target.checked }))}
                />
                Enable SIP Softphone
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="label">SIP WebSocket URL (WSS)</label>
                <input
                  className="input"
                  placeholder="wss://pbx.swkproperties.com:8089/ws"
                  value={cfgForm.sip_ws_url}
                  onChange={(e) => setCfgForm((f) => ({ ...f, sip_ws_url: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">SIP Domain / Realm</label>
                <input
                  className="input"
                  placeholder="pbx.swkproperties.com"
                  value={cfgForm.sip_domain}
                  onChange={(e) => setCfgForm((f) => ({ ...f, sip_domain: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Outbound Proxy (Optional)</label>
                <input
                  className="input"
                  placeholder="sip:proxy.pbx.local"
                  value={cfgForm.sip_outbound_proxy}
                  onChange={(e) => setCfgForm((f) => ({ ...f, sip_outbound_proxy: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Caller ID Policy</label>
                <select
                  className="select"
                  value={cfgForm.sip_caller_id_mode}
                  onChange={(e) => setCfgForm((f) => ({ ...f, sip_caller_id_mode: e.target.value }))}
                >
                  <option value="company_main">Company Main DID (Recommended)</option>
                  <option value="extension_did">Extension Assigned DID</option>
                  <option value="anonymous">Private / Anonymous</option>
                </select>
              </div>
              <div>
                <label className="label">Masked Vault Dial Prefix</label>
                <input
                  className="input font-mono"
                  placeholder="e.g. 99"
                  value={cfgForm.sip_vault_bridge_prefix}
                  onChange={(e) => setCfgForm((f) => ({ ...f, sip_vault_bridge_prefix: e.target.value }))}
                />
                <div className="help">
                  When set, agents dial <code>sip:&lt;prefix&gt;vt_&lt;token&gt;@&lt;domain&gt;</code> and PBX resolves via webhook. Leave blank to fall back to Twilio/Webhook bridge.
                </div>
              </div>
              <div>
                <label className="label">PBX Webhook Secret (AES-256-GCM Encrypted)</label>
                <div className="flex gap-2">
                  <input
                    className="input font-mono flex-1"
                    type="password"
                    autoComplete="new-password"
                    placeholder={cfgForm.sip_webhook_secret_set ? '********' : 'Auto-generated on enable'}
                    value={cfgForm.sip_webhook_secret}
                    onChange={(e) => setCfgForm((f) => ({ ...f, sip_webhook_secret: e.target.value }))}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveTrunkConfig(true)}
                    className="btn outline sm whitespace-nowrap"
                  >
                    <KeyRound size={13} /> Rotate Secret
                  </button>
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="label">WebRTC ICE Servers (STUN / TURN JSON)</label>
                <textarea
                  className="textarea font-mono text-xs"
                  rows={3}
                  value={cfgForm.sip_ice_servers_text}
                  onChange={(e) => setCfgForm((f) => ({ ...f, sip_ice_servers_text: e.target.value }))}
                />
              </div>
            </div>

            {generatedSecret && (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-950 space-y-2">
                <div className="font-bold flex items-center gap-1.5">
                  <ShieldCheck size={15} className="text-[#047857]" /> Copy New PBX Webhook Secret (Shown Once):
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-2.5 py-1.5 rounded bg-white border border-emerald-200 font-mono break-all">
                    {generatedSecret}
                  </code>
                  <button type="button" onClick={() => void copySecret()} className="btn outline sm">
                    {copiedSecret ? <Check size={13} /> : <Copy size={13} />} {copiedSecret ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="text-[11px] text-emerald-900 space-y-0.5 font-mono">
                  <div>Resolve Vault Token: POST {origin}/api/public/sip/{generatedSecret}/resolve-vault-token</div>
                  <div>Incoming Wake Push: POST {origin}/api/public/sip/{generatedSecret}/incoming-wake</div>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveTrunkConfig(false)}
                className="btn green"
              >
                <Save size={15} /> Save SIP Trunk Settings
              </button>
            </div>
          </div>

          {/* Staff Extensions Provisioning */}
          <div className="rounded-2xl border border-line bg-card p-5 shadow-xs space-y-4">
            <div className="text-sm font-bold text-ink">Staff SIP Extensions</div>

            <div className="grid gap-3 md:grid-cols-4 items-end bg-soft p-3.5 rounded-xl border border-line">
              <div className="md:col-span-2">
                <label className="label">Staff User</label>
                <select
                  className="select"
                  value={extForm.user_id}
                  onChange={(e) => {
                    const uid = Number(e.target.value)
                    const st = staffOptions.find((s) => s.id === uid)
                    const existing = extRows.find((r) => r.user_id === uid)
                    setExtForm({
                      user_id: e.target.value,
                      extension_no: existing?.extension_no || '',
                      sip_username: existing?.sip_username || '',
                      sip_password: '',
                      display_name: existing?.display_name || st?.name || '',
                      allow_direct_dial: existing?.allow_direct_dial ?? false,
                      active: existing?.active ?? true,
                    })
                  }}
                >
                  <option value="">Select staff member…</option>
                  {staffOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.email})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Extension #</label>
                <input
                  className="input font-mono"
                  placeholder="101"
                  value={extForm.extension_no}
                  onChange={(e) => setExtForm((f) => ({ ...f, extension_no: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">SIP Username</label>
                <input
                  className="input font-mono"
                  placeholder="ext101"
                  value={extForm.sip_username}
                  onChange={(e) => setExtForm((f) => ({ ...f, sip_username: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Display Name</label>
                <input
                  className="input"
                  placeholder="Caller ID Display Name"
                  value={extForm.display_name}
                  onChange={(e) => setExtForm((f) => ({ ...f, display_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">SIP Password</label>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Leave blank to keep"
                  value={extForm.sip_password}
                  onChange={(e) => setExtForm((f) => ({ ...f, sip_password: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5 pb-1">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-[#047857]"
                    checked={extForm.allow_direct_dial}
                    onChange={(e) => setExtForm((f) => ({ ...f, allow_direct_dial: e.target.checked }))}
                  />
                  Allow Direct Dial
                </label>
                <label className="flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-[#047857]"
                    checked={extForm.active}
                    onChange={(e) => setExtForm((f) => ({ ...f, active: e.target.checked }))}
                  />
                  Active Extension
                </label>
              </div>
              <div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveExtension()}
                  className="btn green sm w-full"
                >
                  <Save size={13} /> Save Ext
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-line rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-soft border-b border-line text-[11px] uppercase text-muted">
                    <th className="p-3">Ext</th>
                    <th className="p-3">Staff Member</th>
                    <th className="p-3">SIP Username</th>
                    <th className="p-3">Password</th>
                    <th className="p-3">Direct Dial</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {extRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted">
                        No SIP extensions provisioned yet.
                      </td>
                    </tr>
                  ) : (
                    extRows.map((r) => (
                      <tr key={r.user_id}>
                        <td className="p-3 font-mono font-bold text-[#047857] dark:text-[#34d399]">{r.extension_no}</td>
                        <td className="p-3">
                          <div className="font-semibold text-ink">{r.user_name}</div>
                          <div className="text-[11px] text-muted">{r.user_email}</div>
                        </td>
                        <td className="p-3 font-mono text-body">{r.sip_username}</td>
                        <td className="p-3 font-mono text-muted">{r.sip_password || '—'}</td>
                        <td className="p-3 text-body">{r.allow_direct_dial ? 'Enabled' : 'Restricted'}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              r.active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {r.active ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="inline-flex gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setExtForm({
                                  user_id: String(r.user_id),
                                  extension_no: r.extension_no,
                                  sip_username: r.sip_username,
                                  sip_password: '',
                                  display_name: r.display_name,
                                  allow_direct_dial: r.allow_direct_dial,
                                  active: r.active,
                                })
                              }
                              className="btn outline sm"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void deleteExtension(r.user_id, r.user_name)}
                              className="px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs font-bold cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
