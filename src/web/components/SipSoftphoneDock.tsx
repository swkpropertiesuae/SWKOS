import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronUp,
  Delete,
  Grid3X3,
  Lock,
  Mic,
  MicOff,
  Minimize2,
  Pause,
  Phone,
  PhoneCall,
  PhoneForwarded,
  PhoneIncoming,
  PhoneOff,
  Play,
  X,
} from 'lucide-react'
import { useMeta } from '../lib/meta'
import { sipClient, useSipClient } from '../lib/sipClient'
import { useToast } from '../lib/toast'

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Persistent floating SIP/VoIP Softphone dock widget.
 * Keeps WebRTC calls alive across page navigation inside Shell.tsx.
 */
export function SipSoftphoneDock({ docked = false }: { docked?: boolean } = {}) {
  const { me } = useMeta()
  const snap = useSipClient()
  const toast = useToast()

  const isStaff = Boolean(me?.id && !me?.party_id)
  const [open, setOpen] = useState(false)
  const [dialInput, setDialInput] = useState('')
  const [showDtmf, setShowDtmf] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferMode, setTransferMode] = useState<'blind' | 'attended'>('blind')
  const [transferTarget, setTransferTarget] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isStaff || !me?.id) {
      void sipClient.disconnect()
      return
    }
    void sipClient.init(me.id)
    const stopWake = sipClient.connectWakeStream()
    return () => {
      stopWake()
    }
  }, [isStaff, me?.id])

  useEffect(() => {
    if (snap.activeCall) {
      setOpen(true)
    }
  }, [snap.activeCall?.id])

  if (!isStaff) return null

  const call = snap.activeCall
  const consult = snap.consultCall
  const statusColor =
    snap.registration === 'registered'
      ? 'bg-[#0e9f6e]'
      : snap.registration === 'connecting'
        ? 'bg-amber-400 animate-pulse'
        : snap.registration === 'error'
          ? 'bg-[#dc2626]'
          : 'bg-slate-400'

  const handleDial = async () => {
    if (!dialInput.trim() || busy) return
    setBusy(true)
    try {
      await sipClient.dial(dialInput.trim())
    } catch (e: any) {
      toast.error(e?.message || 'Unable to place SIP call')
    } finally {
      setBusy(false)
    }
  }

  const handleTransfer = async () => {
    if (!transferTarget.trim() || busy) return
    setBusy(true)
    try {
      if (transferMode === 'attended') {
        await sipClient.startAttendedTransfer(transferTarget.trim())
        toast.ok(`Dialing consultation target ${transferTarget.trim()} (primary call on hold)`)
      } else {
        await sipClient.transferBlind(transferTarget.trim())
        toast.ok(`Transferred call to ${transferTarget.trim()}`)
        setShowTransfer(false)
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
      setShowTransfer(false)
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

  return (
    <div className={docked
      ? 'relative no-print flex flex-col items-end gap-2'
      : 'fixed bottom-4 right-4 z-[65] hidden md:flex no-print flex-col items-end gap-2'}>
      {open && (
        <div className="w-[320px] rounded-2xl border border-white/15 bg-[#0b1f2a] text-white shadow-[0_24px_64px_rgba(11,31,42,0.42)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#181818]">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`size-2.5 rounded-full shrink-0 ${statusColor}`} />
              <div className="min-w-0">
                <div className="text-xs font-bold tracking-wide truncate">
                  {snap.configured ? `SWK Softphone · Ext ${snap.extensionNo}` : 'SWK Softphone'}
                </div>
                <div className="text-[10.5px] text-white/60 truncate">
                  {snap.configured
                    ? snap.registration === 'registered'
                      ? `Registered · ${snap.domain}`
                      : snap.registration === 'connecting'
                        ? 'Connecting to PBX…'
                        : snap.lastError || 'Disconnected'
                    : 'Not Configured'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Link
                to="/phone"
                className="px-2 py-1 rounded-lg text-[10.5px] font-semibold bg-white/10 hover:bg-white/15 text-[#d4b672] no-underline"
              >
                Full Phone
              </Link>
              <button
                type="button"
                aria-label="Minimize softphone"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 border-0 bg-transparent cursor-pointer"
              >
                <Minimize2 size={14} />
              </button>
            </div>
          </div>

          {/* Active Call View */}
          {call ? (
            <div className="p-4 space-y-4">
              <div className="rounded-xl bg-white/5 border border-white/10 p-3.5 text-center space-y-1">
                <div className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-widest text-[#d4b672]">
                  {call.isMaskedVault ? (
                    <>
                      <Lock size={12} /> Masked Vault Line
                    </>
                  ) : call.direction === 'in' ? (
                    <>
                      <PhoneIncoming size={12} /> Incoming SIP Call
                    </>
                  ) : (
                    <>
                      <PhoneCall size={12} /> Outbound SIP Call
                    </>
                  )}
                </div>
                <div className="text-base font-bold text-white truncate">{call.remoteDisplay}</div>
                <div className="text-xs font-mono text-white/60 truncate">
                  {call.isMaskedVault ? 'MASKED •••• (Number Locked)' : call.remoteTarget}
                </div>
                <div className="text-lg font-mono font-bold text-[#0e9f6e] pt-1">
                  {call.state === 'ringing_in'
                    ? 'Ringing…'
                    : call.state === 'dialing' || call.state === 'connecting'
                      ? 'Connecting…'
                      : call.onHold
                        ? `ON HOLD · ${fmtDuration(call.durationSec)}`
                        : fmtDuration(call.durationSec)}
                </div>
              </div>

              {call.state === 'ringing_in' ? (
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => void sipClient.answer().catch((e: any) => toast.error(e?.message || 'Answer failed'))}
                    className="py-2.5 rounded-xl bg-[#0e9f6e] hover:bg-[#0a4638] text-white text-xs font-bold flex items-center justify-center gap-1.5 border-0 cursor-pointer"
                  >
                    <Phone size={15} /> Answer
                  </button>
                  <button
                    type="button"
                    onClick={() => void sipClient.hangup()}
                    className="py-2.5 rounded-xl bg-[#dc2626] hover:bg-red-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 border-0 cursor-pointer"
                  >
                    <PhoneOff size={15} /> Decline
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => sipClient.toggleMute()}
                      className={`py-2.5 rounded-xl text-[11px] font-semibold flex flex-col items-center gap-1 border-0 cursor-pointer ${
                        call.muted ? 'bg-amber-500/20 text-amber-300' : 'bg-white/10 text-white hover:bg-white/15'
                      }`}
                    >
                      {call.muted ? <MicOff size={15} /> : <Mic size={15} />}
                      {call.muted ? 'Unmute' : 'Mute'}
                    </button>
                    <button
                      type="button"
                      disabled={call.state !== 'connected'}
                      onClick={() => void sipClient.toggleHold().catch((e: any) => toast.error(e?.message || 'Hold failed'))}
                      className={`py-2.5 rounded-xl text-[11px] font-semibold flex flex-col items-center gap-1 border-0 cursor-pointer disabled:opacity-40 ${
                        call.onHold ? 'bg-amber-500/20 text-amber-300' : 'bg-white/10 text-white hover:bg-white/15'
                      }`}
                    >
                      {call.onHold ? <Play size={15} /> : <Pause size={15} />}
                      {call.onHold ? 'Resume' : 'Hold'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDtmf((v) => !v)
                        setShowTransfer(false)
                      }}
                      className={`py-2.5 rounded-xl text-[11px] font-semibold flex flex-col items-center gap-1 border-0 cursor-pointer ${
                        showDtmf ? 'bg-[#0e9f6e]/30 text-[#51fec0]' : 'bg-white/10 text-white hover:bg-white/15'
                      }`}
                    >
                      <Grid3X3 size={15} />
                      DTMF
                    </button>
                    <button
                      type="button"
                      disabled={call.state !== 'connected'}
                      onClick={() => {
                        setShowTransfer((v) => !v)
                        setShowDtmf(false)
                      }}
                      className={`py-2.5 rounded-xl text-[11px] font-semibold flex flex-col items-center gap-1 border-0 cursor-pointer disabled:opacity-40 ${
                        showTransfer ? 'bg-[#0e9f6e]/30 text-[#51fec0]' : 'bg-white/10 text-white hover:bg-white/15'
                      }`}
                    >
                      <PhoneForwarded size={15} />
                      Transfer
                    </button>
                  </div>

                  {showDtmf && (
                    <div className="grid grid-cols-3 gap-1.5 pt-1">
                      {KEYPAD.map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => void sipClient.sendDtmf(k)}
                          className="h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white font-mono text-sm font-bold border-0 cursor-pointer"
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                  )}

                  {showTransfer && (
                    <div className="space-y-2 pt-1 rounded-xl bg-white/5 border border-white/10 p-2.5">
                      <div className="flex gap-1 text-[11px] font-bold">
                        <button
                          type="button"
                          disabled={!!consult}
                          onClick={() => setTransferMode('blind')}
                          className={`flex-1 py-1.5 rounded-lg border-0 cursor-pointer disabled:opacity-50 ${
                            transferMode === 'blind' ? 'bg-[#0e9f6e] text-white' : 'bg-white/10 text-white/70'
                          }`}
                        >
                          Blind
                        </button>
                        <button
                          type="button"
                          onClick={() => setTransferMode('attended')}
                          className={`flex-1 py-1.5 rounded-lg border-0 cursor-pointer ${
                            transferMode === 'attended' ? 'bg-[#0e9f6e] text-white' : 'bg-white/10 text-white/70'
                          }`}
                        >
                          Attended
                        </button>
                      </div>

                      {consult ? (
                        <div className="space-y-2">
                          <div className="text-[11px] text-white/80 flex items-center justify-between gap-2">
                            <span className="truncate font-semibold">
                              Consult: {consult.remoteDisplay}
                            </span>
                            <span className="font-mono text-[#51fec0] shrink-0">
                              {consult.state === 'connected' ? fmtDuration(consult.durationSec) : 'Ringing…'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              disabled={busy || consult.state !== 'connected'}
                              onClick={() => void handleCompleteAttended()}
                              className="py-1.5 rounded-lg bg-[#0e9f6e] text-white text-[11px] font-bold border-0 cursor-pointer disabled:opacity-40"
                            >
                              Complete Transfer
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleCancelAttended()}
                              className="py-1.5 rounded-lg bg-amber-500/20 text-amber-200 text-[11px] font-bold border-0 cursor-pointer disabled:opacity-40"
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
                            placeholder="Ext (e.g. 102) or SIP URI"
                            className="flex-1 min-w-0 px-2.5 py-2 rounded-lg bg-black/40 border border-white/15 text-xs text-white outline-none focus:border-[#0e9f6e]"
                          />
                          <button
                            type="button"
                            disabled={busy || !transferTarget.trim()}
                            onClick={() => void handleTransfer()}
                            className="px-3 py-2 rounded-lg bg-[#0e9f6e] text-white text-xs font-bold border-0 cursor-pointer disabled:opacity-40"
                          >
                            {transferMode === 'attended' ? 'Consult' : 'Go'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void sipClient.hangup()}
                    className="w-full py-2.5 rounded-xl bg-[#dc2626] hover:bg-red-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 border-0 cursor-pointer"
                  >
                    <PhoneOff size={15} /> Hang Up
                  </button>
                </>
              )}
            </div>
          ) : !snap.configured ? (
            /* Not Configured State */
            <div className="p-4 space-y-3 text-xs">
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-white/75 leading-relaxed">
                <div className="font-bold text-[#d4b672] mb-1">Softphone Not Configured</div>
                {snap.reason || 'Your SIP trunk or personal extension has not been configured yet.'}
              </div>
              {snap.lastWake && (
                <div className="rounded-xl bg-amber-500/15 border border-amber-400/30 p-2.5 text-amber-200 text-[11px]">
                  Wake alert: {snap.lastWake.caller_name || snap.lastWake.caller_id || 'Incoming call'}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void sipClient.init(true)}
                  className="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold border-0 cursor-pointer"
                >
                  Retry Connection
                </button>
                <Link
                  to="/phone"
                  className="flex-1 py-2 rounded-xl bg-[#0e9f6e] hover:bg-[#0a4638] text-white font-bold text-center no-underline"
                >
                  Open Phone
                </Link>
              </div>
            </div>
          ) : (
            /* Idle Dialpad Drawer */
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-1.5">
                <input
                  value={dialInput}
                  onChange={(e) => setDialInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleDial()
                  }}
                  placeholder={snap.allowDirectDial ? 'Ext or +97150...' : 'Internal Ext (e.g. 102)'}
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-sm font-mono text-white outline-none focus:border-[#0e9f6e]"
                />
                {dialInput && (
                  <button
                    type="button"
                    aria-label="Backspace"
                    onClick={() => setDialInput((s) => s.slice(0, -1))}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 border-0 cursor-pointer"
                  >
                    <Delete size={15} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {KEYPAD.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setDialInput((s) => s + k)
                      void sipClient.sendDtmf(k)
                    }}
                    className="h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white font-mono text-sm font-bold border-0 cursor-pointer transition-colors"
                  >
                    {k}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={busy || !dialInput.trim()}
                onClick={() => void handleDial()}
                className="w-full py-2.5 rounded-xl bg-[#0e9f6e] hover:bg-[#0a4638] text-white text-xs font-bold flex items-center justify-center gap-1.5 border-0 cursor-pointer disabled:opacity-40"
              >
                <Phone size={15} /> Call
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating Pill Toggle */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`h-11 px-4 rounded-full border shadow-[0_12px_30px_rgba(11,31,42,0.24)] flex items-center gap-2 text-xs font-semibold cursor-pointer transition-all hover:-translate-y-0.5 active:scale-95 ${
          call?.state === 'ringing_in'
            ? 'bg-[#047857] border-white/30 text-white animate-pulse'
            : call
              ? 'bg-[#0b1f2a] border-[#047857] text-white'
              : 'bg-card border-line text-ink hover:border-ink'
        }`}
        aria-label="Toggle SWK Softphone"
      >
        <span className={`size-2 rounded-full ${statusColor}`} />
        <Phone size={14} className={call ? 'text-[#d4a752]' : 'text-ink'} />
        {call ? (
          <span className="font-mono">
            {call.isMaskedVault ? 'Vault Call' : call.remoteDisplay} · {call.state === 'connected' ? fmtDuration(call.durationSec) : 'Ringing'}
          </span>
        ) : (
          <span>{snap.configured ? `Ext ${snap.extensionNo}` : 'Softphone'}</span>
        )}
        {open ? <X size={13} className="opacity-70" /> : <ChevronUp size={13} className="opacity-70" />}
      </button>
    </div>
  )
}
