import { useEffect,useState } from 'react'
import QRCode from 'qrcode'
import { useQuery,useQueryClient } from '@tanstack/react-query'
import { KeyRound,ShieldCheck,Smartphone,MonitorSmartphone,Camera,Trash2 } from 'lucide-react'
import { api,del,get,post,upload } from '../lib/api'
import { teamProfileByEmail } from '@shared/swk-team-profiles'
import { useMeta } from '../lib/meta'
import { Badge,PageHeader,Spinner } from '../ui/kit'
import { useToast } from '../lib/toast'
import { fmtIsoStamp } from '../lib/format'

export function ProfilePage() {
  const { me, reload } = useMeta(); const toast = useToast(); const qc = useQueryClient()
  const [cur, setCur] = useState(''); const [nw, setNw] = useState(''); const [nw2, setNw2] = useState(''); const [busy, setBusy] = useState(false)
  const [setup, setSetup] = useState<null | { secret: string; uri: string; qr: string }>(null); const [code, setCode] = useState(''); const [pwOff, setPwOff] = useState(''); const [pwSetup, setPwSetup] = useState(''); const [offCode, setOffCode] = useState('')
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => get<any[]>('/api/auth/sessions') })
  const history = useQuery({ queryKey: ['loginhist'], queryFn: () => get<any[]>('/api/auth/login-history') })
  useEffect(() => { void reload() }, [])
  const changePw = async (e: React.FormEvent) => { e.preventDefault(); if (nw !== nw2) { toast.error('The new passwords do not match'); return } setBusy(true); try { await post('/api/auth/change-password', { current: cur, next: nw }); toast.ok('Password changed — other sessions were signed out'); setCur(''); setNw(''); setNw2(''); await reload() } catch (er: any) { toast.error(er.message) } finally { setBusy(false) } }
  const start2fa = async () => { try { const r = await post<{ secret: string; uri: string }>('/api/auth/totp/setup', { password: pwSetup }); setSetup({ ...r, qr: await QRCode.toDataURL(r.uri, { margin: 1, width: 180 }) }); setPwSetup('') } catch (er: any) { toast.error(er.message) } }
  return (
    <div className="fade-in max-w-5xl">
      <PageHeader icon={<KeyRound size={20} />} title="Profile & security" subtitle={`${me?.name} · ${me?.email} · ${me?.role}`} />
      {me?.mustChangePassword && <div className="mb-4 p-4 rounded-xl border border-[#f7f7f7] bg-[#f7f7f7] text-[14px]"><b>Set your own password to continue.</b> The account was created with a temporary password. Choose a new one (at least 10 characters with upper-case, lower-case and a digit) – the rest of the application unlocks right after.</div>}
      <MyProfileCard />
      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={changePw} className="card p-5 grid gap-3 content-start"><h3 className="m-0 text-[16px]">Change password</h3>
          {me?.defaultPassword && <div className="text-sm bg-gold text-[#4a1f4d] rounded-lg px-3 py-2 font-semibold">You are still using the default password — please change it.</div>}
          <div><label className="label">Current password</label><input className="input" type="password" autoComplete="current-password" required value={cur} onChange={e => setCur(e.target.value)} /></div>
          <div><label className="label">New password</label><input className="input" type="password" autoComplete="new-password" required minLength={10} value={nw} onChange={e => setNw(e.target.value)} /><div className="help">At least 10 characters with upper-case, lower-case and a digit.</div></div>
          <div><label className="label">Repeat new password</label><input className="input" type="password" autoComplete="new-password" required value={nw2} onChange={e => setNw2(e.target.value)} /></div>
          <button className="btn green w-fit" disabled={busy}>Update password</button></form>
        <div className="card p-5 grid gap-3 content-start"><h3 className="m-0 text-[16px] flex items-center gap-2"><Smartphone size={18} /> Two-step verification {me?.totp ? <Badge value="On" tone="green" /> : <Badge value="Off" tone="grey" />}</h3>
          <p className="text-sm text-muted m-0">Add a 6-digit code from an authenticator app (Microsoft Authenticator, Google Authenticator, 1Password…) to your sign-in.</p>
          {me?.totp ? <div className="grid gap-2 max-w-xs"><input className="input" type="password" placeholder="Confirm your password" value={pwOff} onChange={e => setPwOff(e.target.value)} /><input className="input" aria-label="Current authenticator code" placeholder="Current 6-digit code" inputMode="numeric" maxLength={6} value={offCode} onChange={e => setOffCode(e.target.value.replace(/\D/g, ''))} /><button className="btn red w-fit" disabled={me?.mustChangePassword || !pwOff || offCode.length !== 6} onClick={async () => { try { await post('/api/auth/totp/disable', { password: pwOff, code: offCode }); toast.ok('Two-step verification turned off'); setPwOff(''); setOffCode(''); await reload(); void qc.invalidateQueries({ queryKey: ['sessions'] }) } catch (er: any) { toast.error(er.message) } }}>Turn off</button></div>
            : setup ? <div className="grid gap-3"><div className="flex gap-4 items-center flex-wrap"><img src={setup.qr} alt="QR code to scan with your authenticator app" width="140" height="140" className="rounded-lg border border-line" /><div className="text-sm"><div className="text-muted">Can't scan? Enter this key:</div><code className="block font-mono text-[13px] bg-soft border border-line rounded px-2 py-1 mt-1 break-all">{setup.secret}</code></div></div>
              <div className="flex gap-2 max-w-xs"><input className="input text-center tracking-[.3em]" inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /><button className="btn green" disabled={code.length !== 6} onClick={async () => { try { await post('/api/auth/totp/enable', { code }); toast.ok('Two-step verification is on'); setSetup(null); setCode(''); await reload(); void qc.invalidateQueries({ queryKey: ['sessions'] }) } catch (er: any) { toast.error(er.message) } }}>Verify</button></div></div>
            : <div className="grid gap-2 max-w-xs"><label className="label" htmlFor="totp-password">Confirm your password</label><input id="totp-password" className="input" type="password" autoComplete="current-password" value={pwSetup} onChange={e => setPwSetup(e.target.value)} /><button className="btn green w-fit" disabled={me?.mustChangePassword || !pwSetup} onClick={() => void start2fa()}><ShieldCheck /> Set up</button></div>}</div>
        <div className="card p-5 lg:col-span-2"><h3 className="m-0 mb-3 text-[16px] flex items-center gap-2"><MonitorSmartphone size={18} /> Active sessions</h3>
          {!sessions.data ? <Spinner /> : <table className="grid"><thead><tr><th>Device</th><th>IP</th><th>Signed in</th><th>Last active</th><th /></tr></thead><tbody>{sessions.data.map(s => <tr key={s.id}><td className="max-w-[360px] truncate" title={s.user_agent}>{(s.user_agent ?? '').slice(0, 70) || 'Unknown'} {s.current && <Badge value="This device" tone="green" />}</td><td>{s.ip}</td><td>{fmtIsoStamp(s.created_at)}</td><td>{fmtIsoStamp(s.last_seen)}</td><td>{!s.current && <button className="btn outline sm" onClick={async () => { await del(`/api/auth/sessions/${s.id}`); void qc.invalidateQueries({ queryKey: ['sessions'] }) }}>Sign out</button>}</td></tr>)}</tbody></table>}</div>
        <div className="card p-5 lg:col-span-2"><h3 className="m-0 mb-3 text-[16px]">Recent sign-in activity</h3>{!history.data ? <Spinner /> : <table className="grid"><thead><tr><th>When</th><th>Result</th><th>IP</th></tr></thead><tbody>{history.data.map((h, i) => <tr key={i}><td>{fmtIsoStamp(h.at)}</td><td><Badge value={h.success ? 'Success' : `Failed – ${h.reason}`} tone={h.success ? 'green' : 'red'} /></td><td>{h.ip}</td></tr>)}</tbody></table>}</div>
      </div>
    </div>
  )
}
void api

type Profile = { name: string; email: string; designation: string | null; work_phone: string; about: string; languages: string; has_photo: boolean; photo_url: string | null }
/** Own profile for internal use: photo, internal phone, languages and a short about line. Name, e-mail, role and designation are managed by HR / Admin. */
function MyProfileCard() {
  const toast = useToast(), qc = useQueryClient()
  const prof = useQuery({ queryKey: ['my-profile'], queryFn: () => get<Profile>('/api/auth/profile') })
  const [form, setForm] = useState<{ work_phone: string; languages: string; about: string } | null>(null)
  const [stamp, setStamp] = useState(Date.now()), [busy, setBusy] = useState(false)
  useEffect(() => { if (prof.data && !form) setForm({ work_phone: prof.data.work_phone, languages: prof.data.languages, about: prof.data.about }) }, [prof.data, form])
  const p = prof.data, web = teamProfileByEmail(p?.email)
  const photo = p?.has_photo ? `${p.photo_url}?v=${stamp}` : web?.photo
  const refresh = () => { setStamp(Date.now()); void qc.invalidateQueries({ queryKey: ['my-profile'] }) }
  const choose = async (f?: File) => { if (!f) return; setBusy(true); try { await upload([f], {}, '/api/auth/profile/photo'); toast.ok('Photo updated'); refresh() } catch (e: any) { toast.error(e.message) } finally { setBusy(false) } }
  const save = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); try { await api('PATCH', '/api/auth/profile', form); toast.ok('Profile saved'); refresh() } catch (er: any) { toast.error(er.message) } finally { setBusy(false) } }
  if (!p || !form) return <div className="card p-5 mb-4"><Spinner /></div>
  return (
    <form onSubmit={save} className="web-card mb-4 grid gap-6 p-6 md:grid-cols-[180px_1fr]">
      <div className="flex flex-col items-center gap-3">
        <span className="flex size-36 items-center justify-center overflow-hidden rounded-full bg-[#121212] text-3xl font-semibold text-[#51fec0] ring-4 ring-white shadow-[0_10px_28px_rgba(12,56,96,0.14)]">
          {photo ? <img src={photo} alt="Your profile photo" className="size-full object-cover object-top" /> : p.name.split(' ').map(x => x[0]).slice(0, 2).join('')}
        </span>
        <label className="web-btn light cursor-pointer" style={{ height: 38 }}><Camera size={14} /> {p.has_photo ? 'Change photo' : 'Upload photo'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy} onChange={e => { void choose(e.target.files?.[0]); e.target.value = '' }} /></label>
        {p.has_photo && <button type="button" className="btn ghost sm" onClick={async () => { await del('/api/auth/profile/photo'); refresh() }}><Trash2 size={14} /> Remove</button>}
        <p className="m-0 text-center text-[11px] text-[#8b8b8b]">JPG, PNG or WebP, up to 5 MB. Seen by colleagues inside SWK OS only.</p>
      </div>
      <div className="grid content-start gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><div className="web-eyebrow">My profile · internal</div><h3 className="m-0 mt-1 text-[22px] font-medium tracking-[-0.03em]">{p.name}</h3><p className="m-0 text-[13px] text-[#737373]">{p.designation || 'SWK Properties'} · {p.email}</p></div>
        <label><span className="label">Internal phone / extension</span><input className="input" value={form.work_phone} maxLength={40} onChange={e => setForm({ ...form, work_phone: e.target.value })} placeholder="+971 …" /></label>
        <label><span className="label">Languages</span><input className="input" value={form.languages} maxLength={120} onChange={e => setForm({ ...form, languages: e.target.value })} placeholder={web?.languages.join(', ') || 'English, Arabic'} /></label>
        <label className="sm:col-span-2"><span className="label">About me (shown to colleagues)</span><textarea className="textarea" value={form.about} maxLength={280} onChange={e => setForm({ ...form, about: e.target.value })} placeholder="What you handle, how to reach you" /><span className="help">{form.about.length}/280</span></label>
        <p className="m-0 text-[12px] text-[#8b8b8b] sm:col-span-2">Name, e-mail, role and designation are set by HR and the Admin.</p>
        <div className="sm:col-span-2"><button className="web-btn" disabled={busy}>Save profile</button></div>
      </div>
    </form>
  )
}
