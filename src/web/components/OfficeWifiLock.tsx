import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { get, post } from '../lib/api'
import { ErrorBox, Loading } from '../ui/kit'
import { useToast } from '../lib/toast'

/** Admin only: office Wi-Fi IP lock + Al Saqr Business Tower GPS geofence & rotating QR anti-spoof controls. */
export function OfficeWifiLock() {
  const toast = useToast(), qc = useQueryClient(), [busy, setBusy] = useState(false)
  const q = useQuery({ queryKey: ['office-wifi'], queryFn: () => get<any>('/api/swk-ops/attendance-setup') })
  if (q.error) return <ErrorBox error={q.error} />
  if (!q.data) return <Loading />
  const c = q.data, locked = !!c.office_ip_locked
  const gps = c.office_gps || {}
  const act = async (body: any, done: string) => {
    setBusy(true)
    try { await post('/api/swk-ops/attendance-setup', body); toast.ok(done); await qc.invalidateQueries({ queryKey: ['office-wifi'] }) } catch (e: any) { toast.error(e?.message || 'Could not save') } finally { setBusy(false) }
  }
  return (
    <div className="md:col-span-2 space-y-3 text-sm">
      <div>Status: <b>{locked ? 'Locked' : 'Not locked: nobody can check in yet'}</b></div>
      {locked && <div>Locked network: <code>{c.public_ips}</code></div>}
      <div className="text-muted">You are on: <code>{c.detected_client_ip}</code>{locked ? (c.ip_matches_office ? ' (the locked office network)' : ' (not the locked office network)') : ''}</div>
      <div className="rounded-xl border border-line bg-soft p-3 text-xs space-y-1.5">
        <div className="font-semibold text-ink">Anti-Spoof Reception QR &amp; Al Saqr Business Tower Geofence</div>
        <div>Office Anchor: <b>{gps.name || 'Al Saqr Business Tower, Sheikh Zayed Road, Dubai'}</b> (<code>{gps.lat ?? 25.2131}, {gps.lng ?? 55.2768}</code>)</div>
        <div>Strict GPS Radius: <b>{gps.radius ?? 75}m</b> · Max GPS Accuracy: <b>±{gps.max_accuracy_m ?? 65}m</b> · GPS Enforcement: <b>{gps.enforce_gps !== false ? 'Enabled' : 'Disabled'}</b></div>
        <div>QR Rotation Mode: <b>{gps.qr_mode === 'fixed' ? 'Fixed Wall QR' : `Rotating Short-TTL (${gps.qr_step_s ?? 20}s)`}</b> · Live Camera Attestation: <b>{gps.require_live_camera !== false ? 'Required' : 'Optional'}</b></div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {!locked && <button type="button" className="btn green" disabled={busy} onClick={() => void act({ lock_current_ip: true }, 'Office network locked')}>Lock this network as the office</button>}
        {locked && <button type="button" className="btn outline" disabled={busy} onClick={() => { if (window.confirm('Clear the office network? Check-in stops for everyone until you lock the new one.')) void act({ clear_ips: true }, 'Office network cleared') }}>Clear to change the network</button>}
        <button
          type="button"
          className="btn outline"
          disabled={busy}
          onClick={() =>
            void act(
              {
                office_gps_name: 'Al Saqr Business Tower, Sheikh Zayed Road, Dubai',
                office_gps_lat: '25.2131',
                office_gps_lng: '55.2768',
                office_gps_radius_m: 75,
                gps_max_accuracy_m: 65,
                office_gps_enforce: true,
                qr_step_seconds: 20,
                qr_require_live_camera: true,
              },
              'Al Saqr Business Tower 75m geofence & 20s rotating QR defaults applied',
            )
          }
        >
          Reset to Al Saqr Tower (75m strict)
        </button>
      </div>
      <p className="text-xs text-muted m-0">Lock it once, from a device on the office Wi-Fi. Only the Admin can lock, clear or change it. Check-ins require Office Wi-Fi, rotating short-TTL QR via live camera, and a GPS fix within 75m of Al Saqr Business Tower.</p>
    </div>
  )
}
