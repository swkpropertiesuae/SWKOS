import { useState } from 'react'
import { teamProfileByEmail } from '@shared/swk-team-profiles'
import { resolveApiUrl } from '../../lib/mobileBridge'

/** Photo for a staff member: their own uploaded profile photo first, then the website portrait, then nothing (caller shows initials). */
export function StaffPhoto({ email, className, fallback }: { email?: string | null; className?: string; fallback: React.ReactNode }) {
  const sources = [email ? resolveApiUrl(`/api/users/${encodeURIComponent(email.toLowerCase())}/photo`) : '', teamProfileByEmail(email)?.photo ?? ''].filter(Boolean)
  const [i, setI] = useState(0)
  if (i >= sources.length) return <>{fallback}</>
  return <img src={sources[i]} alt="" loading="lazy" className={className} onError={() => setI(n => n + 1)} />
}
