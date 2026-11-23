import { useState } from 'react'
import { teamProfileByEmail } from '@shared/swk-team-profiles'
import { useAuthObjectUrl } from '../../lib/api'

/** Photo for a staff member: their own uploaded profile photo first, then the website portrait, then nothing (caller shows initials). */
export function StaffPhoto({ email, className, fallback }: { email?: string | null; className?: string; fallback: React.ReactNode }) {
  const sources = [email ? `/api/users/${encodeURIComponent(email.toLowerCase())}/photo` : '', teamProfileByEmail(email)?.photo ?? ''].filter(Boolean)
  const [i, setI] = useState(0)
  const current = i < sources.length ? sources[i] : undefined
  const resolved = useAuthObjectUrl(current, () => setI(n => n + 1))
  if (i >= sources.length || !resolved) return <>{fallback}</>
  return <img src={resolved} alt="" loading="lazy" className={className} onError={() => setI(n => n + 1)} />
}
