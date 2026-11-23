import { useEffect, useState } from 'react'
import { Fingerprint, KeyRound, Lock, LogOut, PhoneCall, ShieldCheck } from 'lucide-react'
import { useMeta } from '../lib/meta'
import {
  clearLocalUnlockPin,
  markScreenUnlocked,
  setLocalUnlockPin,
  startLockMonitors,
  unlockWithBiometric,
  unlockWithLocalPin,
  useMobileLockState,
} from '../lib/mobileBridge'
import { useSipClient } from '../lib/sipClient'
import { StaffPhoto } from './ui/staff-photo'

interface BiometricLockOverlayProps {
  onLogout: () => Promise<void> | void
}

/**
 * Local UI lock overlay triggered after 45s in background or 10 min idle (or manually).
 * CRITICAL INVARIANT: Locking NEVER calls /api/auth/logout or clears the session token,
 * keeping active SIP/VoIP calls, background Field GPS foreground service, and live push deep links intact.
 */
export function BiometricLockOverlay({ onLogout }: BiometricLockOverlayProps) {
  const { me } = useMeta()
  const lock = useMobileLockState()
  const sipSnap = useSipClient()
  const isStaff = Boolean(me?.id && !me?.party_id)

  const [pin, setPin] = useState('')
  const [setupPin, setSetupPin] = useState('')
  const [setupConfirm, setSetupConfirm] = useState('')
  const [setupOpen, setSetupOpen] = useState(false)
  const [setupErr, setSetupErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    return startLockMonitors(isStaff)
  }, [isStaff, me?.id])

  useEffect(() => {
    if (!lock.locked) {
      setPin('')
      setSetupPin('')
      setSetupConfirm('')
      setSetupErr('')
      setSetupOpen(false)
      return
    }
    if (lock.biometricReady) {
      void unlockWithBiometric('Unlock SWK Properties OS')
    }
  }, [lock.locked, lock.biometricReady])

  if (!isStaff || !lock.locked) return null

  const initials = (me?.name || me?.email || 'S')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]!.toUpperCase())
    .join('')

  const handleBiometric = async () => {
    if (busy) return
    setBusy(true)
    try {
      await unlockWithBiometric('Unlock SWK Properties OS')
    } finally {
      setBusy(false)
    }
  }

  const handlePinUnlock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const ok = await unlockWithLocalPin(pin)
      if (ok) setPin('')
    } finally {
      setBusy(false)
    }
  }

  const handleSetupPin = async (e: React.FormEvent) => {
    e.preventDefault()
    setSetupErr('')
    if (!/^\d{4,6}$/.test(setupPin.trim())) {
      setSetupErr('Choose a 4 to 6 digit PIN.')
      return
    }
    if (setupPin.trim() !== setupConfirm.trim()) {
      setSetupErr('PIN confirmation does not match.')
      return
    }
    setBusy(true)
    try {
      await setLocalUnlockPin(setupPin.trim())
      markScreenUnlocked()
    } catch (err: any) {
      setSetupErr(err?.message || 'Could not save local PIN')
    } finally {
      setBusy(false)
    }
  }

  const activeCall = sipSnap.activeCall

  return (
    <div
      className="fixed inset-0 z-[240] flex items-center justify-center bg-[#0b0b0b]/95 p-4 text-white backdrop-blur-xl no-print"
      role="dialog"
      aria-modal="true"
      aria-label="SWK Properties OS Screen Lock"
    >
      <div className="w-full max-w-[390px] rounded-3xl border border-white/15 bg-[#121212] p-6 shadow-[0_32px_80px_rgba(0,0,0,0.65)] space-y-5">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="relative size-16 rounded-full border-2 border-[#0e9f6e] bg-[#1e1e1e] overflow-hidden flex items-center justify-center text-lg font-bold text-[#51fec0]">
            <StaffPhoto email={me?.email} className="size-full object-cover object-top" fallback={initials} />
          </div>
          <div className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.2em] text-[#51fec0] mt-1">
            <Lock size={12} /> Local Session Lock
          </div>
          <h2 className="m-0 text-xl font-bold text-white">{me?.name}</h2>
          <p className="m-0 text-xs text-white/60">
            {lock.reason === 'background'
              ? 'Locked after 45 seconds in background. Your session, GPS & calls remain active.'
              : lock.reason === 'idle'
                ? 'Locked after 10 minutes of inactivity. Your session stays connected.'
                : 'Screen locked locally. Unlock to continue.'}
          </p>
        </div>

        {activeCall && (
          <div className="rounded-2xl border border-[#0e9f6e]/50 bg-[#0e9f6e]/15 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <PhoneCall size={15} className="text-[#51fec0] shrink-0 animate-pulse" />
              <div className="min-w-0">
                <div className="font-bold text-white truncate">
                  {activeCall.isMaskedVault ? 'Masked Vault Call Active' : activeCall.remoteDisplay}
                </div>
                <div className="text-[11px] text-[#51fec0]">
                  {activeCall.state === 'ringing_in' ? 'Incoming SIP Call — unlock to answer' : 'Call remains connected in background'}
                </div>
              </div>
            </div>
          </div>
        )}

        {lock.lastError && (
          <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
            {lock.lastError}
          </div>
        )}

        {lock.biometricReady && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleBiometric()}
            className="w-full h-12 rounded-2xl border-0 bg-[#0e9f6e] hover:bg-[#0b7f58] text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Fingerprint size={18} /> Unlock with Biometrics / Device PIN
          </button>
        )}

        {lock.hasPin && !setupOpen ? (
          <form onSubmit={e => void handlePinUnlock(e)} className="space-y-3">
            <div>
              <label htmlFor="swk-lock-pin" className="block text-[11px] font-semibold uppercase tracking-wider text-white/60 mb-1.5">
                Quick Local PIN
              </label>
              <input
                id="swk-lock-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="4–6 digit PIN"
                className="w-full h-11 rounded-xl border border-white/15 bg-black/50 px-3 text-center font-mono text-base tracking-[0.4em] text-white outline-none focus:border-[#51fec0]"
              />
            </div>
            <button
              type="submit"
              disabled={busy || pin.length < 4}
              className="w-full h-11 rounded-xl border border-white/15 bg-white/10 hover:bg-white/15 text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              <KeyRound size={15} /> Unlock with PIN
            </button>
          </form>
        ) : !lock.biometricReady || setupOpen ? (
          <form onSubmit={e => void handleSetupPin(e)} className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-3.5">
            <div className="text-xs font-semibold text-[#51fec0]">Set a 4–6 digit local unlock PIN</div>
            {setupErr && <div className="text-xs text-rose-300">{setupErr}</div>}
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={setupPin}
              onChange={e => setSetupPin(e.target.value.replace(/\D/g, ''))}
              placeholder="New 4–6 digit PIN"
              aria-label="New local PIN"
              className="w-full h-10 rounded-xl border border-white/15 bg-black/50 px-3 text-center font-mono text-sm tracking-[0.35em] text-white outline-none focus:border-[#51fec0]"
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={setupConfirm}
              onChange={e => setSetupConfirm(e.target.value.replace(/\D/g, ''))}
              placeholder="Confirm PIN"
              aria-label="Confirm local PIN"
              className="w-full h-10 rounded-xl border border-white/15 bg-black/50 px-3 text-center font-mono text-sm tracking-[0.35em] text-white outline-none focus:border-[#51fec0]"
            />
            <button
              type="submit"
              disabled={busy || setupPin.length < 4}
              className="w-full h-10 rounded-xl border-0 bg-[#0e9f6e] text-white font-bold text-xs cursor-pointer disabled:opacity-40"
            >
              Save PIN &amp; Unlock
            </button>
          </form>
        ) : null}

        <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
          {lock.hasPin && !setupOpen ? (
            <button
              type="button"
              onClick={() => setSetupOpen(true)}
              className="bg-transparent border-0 text-white/60 hover:text-white cursor-pointer p-0 text-xs"
            >
              Change PIN
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-white/50">
              <ShieldCheck size={13} className="text-[#0e9f6e]" /> Session Preserved
            </span>
          )}
          <button
            type="button"
            onClick={async () => {
              await clearLocalUnlockPin()
              await onLogout()
            }}
            className="inline-flex items-center gap-1.5 bg-transparent border-0 text-rose-300 hover:text-rose-200 font-semibold cursor-pointer p-0 text-xs"
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
