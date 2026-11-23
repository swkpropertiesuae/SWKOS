import { useEffect, useState } from 'react'
import { Fingerprint, KeyRound, Lock, LogOut, PhoneCall, ShieldCheck, X } from 'lucide-react'
import { post } from '../lib/api'
import { useMeta } from '../lib/meta'
import {
  clearLocalUnlockPin,
  markScreenUnlocked,
  setLocalUnlockPin,
  startLockMonitors,
  unlockWithBiometric,
  unlockWithLocalPin,
  useMobileLockState,
  verifyLocalUnlockPin,
} from '../lib/mobileBridge'
import { useSipClient } from '../lib/sipClient'
import { useToast } from '../lib/toast'
import { StaffPhoto } from './ui/staff-photo'

interface BiometricLockOverlayProps {
  onLogout: () => Promise<void> | void
}

/**
 * Local UI lock overlay triggered after 45s in background or 10 min idle (or manually).
 *
 * Security invariants:
 * - Locking NEVER calls /api/auth/logout or clears the active session token, keeping active
 *   SIP calls, background Field GPS foreground services, and incoming push deep links alive.
 * - While locked, NEVER allow setting or overwriting a PIN without verifying existing credentials:
 *   unlocking requires native Biometrics/Device Credential, the pre-enrolled local PIN, or
 *   re-verifying the signed-in user's SWKOS account password (+ TOTP if enabled).
 * - Setting, changing, or removing the local PIN is ONLY permitted while unlocked.
 */
export function BiometricLockOverlay({ onLogout }: BiometricLockOverlayProps) {
  const { me } = useMeta()
  const lock = useMobileLockState()
  const sipSnap = useSipClient()
  const toast = useToast()
  const isStaff = Boolean(me?.id && !me?.party_id)

  const [pin, setPin] = useState('')
  const [accountPw, setAccountPw] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [needTotp, setNeedTotp] = useState(false)
  const [showPwForm, setShowPwForm] = useState(false)
  const [unlockErr, setUnlockErr] = useState('')
  const [busy, setBusy] = useState(false)

  // Unlocked-only PIN enrollment / rotation modal state
  const [manageOpen, setManageOpen] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [manageErr, setManageErr] = useState('')

  useEffect(() => {
    return startLockMonitors(isStaff)
  }, [isStaff, me?.id])

  useEffect(() => {
    if (!isStaff) {
      setManageOpen(false)
      return
    }
    const onManage = () => {
      if (lock.locked) return
      setCurrentPin('')
      setNewPin('')
      setConfirmPin('')
      setManageErr('')
      setManageOpen(true)
    }
    window.addEventListener('swk:manage-pin', onManage)
    return () => window.removeEventListener('swk:manage-pin', onManage)
  }, [isStaff, lock.locked])

  useEffect(() => {
    if (!lock.locked) {
      setPin('')
      setAccountPw('')
      setTotpCode('')
      setNeedTotp(false)
      setShowPwForm(false)
      setUnlockErr('')
      return
    }
    // Never leave the unlocked PIN-management modal open when locking transitions on
    setManageOpen(false)
    let prompted = false
    const tryPrompt = () => {
      if (prompted || document.hidden || !lock.biometricReady) return
      prompted = true
      void unlockWithBiometric('Unlock SWK Properties OS')
    }
    tryPrompt()
    const onVisibility = () => {
      if (!document.hidden) tryPrompt()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [lock.locked, lock.biometricReady])

  // 1) Locked screen UI (strictly verification-only: NO Change/Set PIN while locked)
  if (isStaff && lock.locked) {
    const initials = (me?.name || me?.email || 'S')
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(s => s[0]!.toUpperCase())
      .join('')

    const handleBiometric = async () => {
      if (busy) return
      setUnlockErr('')
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
      setUnlockErr('')
      setBusy(true)
      try {
        const ok = await unlockWithLocalPin(pin)
        if (ok) setPin('')
      } finally {
        setBusy(false)
      }
    }

    const handlePasswordUnlock = async (e: React.FormEvent) => {
      e.preventDefault()
      if (busy || !me?.email) return
      setUnlockErr('')
      setBusy(true)
      try {
        const r = await post<{ ok: boolean; needsTotp?: boolean }>('/api/auth/verify-password', {
          password: accountPw,
          ...(totpCode.trim() ? { totp: totpCode.trim() } : {}),
        })
        if (r?.needsTotp) {
          setNeedTotp(true)
          setUnlockErr('Enter the 6-digit code from your authenticator app to unlock.')
          return
        }
        if (!r?.ok) {
          setUnlockErr('Password verification failed.')
          return
        }
        setAccountPw('')
        setTotpCode('')
        setNeedTotp(false)
        markScreenUnlocked()
      } catch (err: any) {
        setUnlockErr(err?.message || 'Incorrect account password.')
      } finally {
        setBusy(false)
      }
    }

    const activeCall = sipSnap.activeCall
    const mustUsePassword = !lock.biometricReady && !lock.hasPin

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
                  : 'Screen locked locally. Verify your identity to continue.'}
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

          {(unlockErr || lock.lastError) && (
            <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
              {unlockErr || lock.lastError}
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

          {lock.hasPin && !showPwForm && (
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
          )}

          {(mustUsePassword || showPwForm) && (
            <form onSubmit={e => void handlePasswordUnlock(e)} className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-3.5">
              <div className="text-xs font-semibold text-[#51fec0]">Verify SWKOS Account Password</div>
              <input
                type="password"
                autoComplete="current-password"
                value={accountPw}
                onChange={e => setAccountPw(e.target.value)}
                placeholder="Enter your account password"
                aria-label="Account password"
                required
                className="w-full h-10 rounded-xl border border-white/15 bg-black/50 px-3 text-sm text-white outline-none focus:border-[#51fec0]"
              />
              {(needTotp || me?.totp) && (
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit 2FA code (if enabled)"
                  aria-label="Authenticator code"
                  className="w-full h-10 rounded-xl border border-white/15 bg-black/50 px-3 text-center font-mono text-sm tracking-[0.3em] text-white outline-none focus:border-[#51fec0]"
                />
              )}
              <button
                type="submit"
                disabled={busy || !accountPw}
                className="w-full h-10 rounded-xl border-0 bg-[#0e9f6e] hover:bg-[#0b7f58] text-white font-bold text-xs cursor-pointer disabled:opacity-40"
              >
                {busy ? 'Verifying…' : 'Verify Password & Unlock'}
              </button>
            </form>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
            {!mustUsePassword ? (
              <button
                type="button"
                onClick={() => {
                  setUnlockErr('')
                  setShowPwForm(v => !v)
                }}
                className="bg-transparent border-0 text-white/60 hover:text-white cursor-pointer p-0 text-xs"
              >
                {showPwForm ? (lock.hasPin ? 'Use Local PIN instead' : 'Hide password form') : 'Use account password'}
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

  // 2) Unlocked-only PIN setup / rotation dialog (NEVER reachable while locked)
  if (!isStaff || !manageOpen) return null

  const handleSavePinUnlocked = async (e: React.FormEvent) => {
    e.preventDefault()
    setManageErr('')
    if (!/^\d{4,6}$/.test(newPin.trim())) {
      setManageErr('Choose a 4 to 6 digit PIN.')
      return
    }
    if (newPin.trim() !== confirmPin.trim()) {
      setManageErr('PIN confirmation does not match.')
      return
    }
    setBusy(true)
    try {
      await setLocalUnlockPin(newPin.trim(), lock.hasPin ? { currentPin: currentPin.trim() } : undefined)
      toast.ok(lock.hasPin ? 'Local lock PIN updated' : 'Local lock PIN enabled')
      setManageOpen(false)
    } catch (err: any) {
      setManageErr(err?.message || 'Could not update local PIN.')
    } finally {
      setBusy(false)
    }
  }

  const handleRemovePinUnlocked = async () => {
    setManageErr('')
    if (lock.hasPin) {
      const ok = await verifyLocalUnlockPin(currentPin.trim())
      if (!ok) {
        setManageErr('Enter your current PIN to remove it.')
        return
      }
    }
    await clearLocalUnlockPin()
    toast.ok('Local lock PIN removed')
    setManageOpen(false)
  }

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs no-print"
      role="dialog"
      aria-modal="true"
      aria-label="Manage Local Screen Lock PIN"
      onMouseDown={e => {
        if (e.target === e.currentTarget) setManageOpen(false)
      }}
    >
      <div className="w-full max-w-[380px] rounded-2xl border border-line bg-white p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#0e9f6e]">Device Security</div>
            <h3 className="m-0 text-base font-bold text-ink">{lock.hasPin ? 'Change Local Lock PIN' : 'Set Local Lock PIN'}</h3>
          </div>
          <button
            type="button"
            onClick={() => setManageOpen(false)}
            aria-label="Close PIN settings"
            className="size-8 rounded-full border border-line bg-soft text-ink grid place-items-center cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        <p className="m-0 text-xs text-muted">
          Protects this device after 45 seconds in background or 10 minutes idle without signing out your session, SIP calls, or Field GPS.
        </p>

        {manageErr && (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {manageErr}
          </div>
        )}

        <form onSubmit={e => void handleSavePinUnlocked(e)} className="space-y-2.5">
          {lock.hasPin && (
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={currentPin}
              onChange={e => setCurrentPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Current 4–6 digit PIN"
              aria-label="Current local PIN"
              required
              className="input text-center font-mono tracking-[0.3em]"
            />
          )}
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={newPin}
            onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
            placeholder="New 4–6 digit PIN"
            aria-label="New local PIN"
            required
            className="input text-center font-mono tracking-[0.3em]"
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={confirmPin}
            onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
            placeholder="Confirm new PIN"
            aria-label="Confirm new PIN"
            required
            className="input text-center font-mono tracking-[0.3em]"
          />
          <div className="flex items-center gap-2 pt-1">
            <button type="submit" disabled={busy} className="btn green flex-1 justify-center">
              {lock.hasPin ? 'Update PIN' : 'Enable PIN'}
            </button>
            {lock.hasPin && (
              <button type="button" disabled={busy} onClick={() => void handleRemovePinUnlocked()} className="btn outline">
                Remove
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
