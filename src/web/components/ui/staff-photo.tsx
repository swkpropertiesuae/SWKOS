import { useState } from 'react'
import { teamProfileByEmail } from '@shared/swk-team-profiles'
import { useAuthObjectUrl } from '../../lib/api'

// E-mails with no uploaded photo, remembered for this page load so every screen does not re-request a 404.
const missing = new Set<string>()
export const forgetPhotoMiss = (email?: string | null) => { if (email) missing.delete(email.toLowerCase()) }

/** Photo for a staff member: their own uploaded profile photo first, then the website portrait, then nothing (caller shows initials). */
export function StaffPhoto({ email, className, fallback }: { email?: string | null; className?: string; fallback: React.ReactNode }) {
  const key = email?.toLowerCase() ?? ''
  const sources = [key && !missing.has(key) ? `/api/users/${encodeURIComponent(key)}/photo` : '', teamProfileByEmail(email)?.photo ?? ''].filter(Boolean)
  const [i, setI] = useState(0)
  const current = i < sources.length ? sources[i] : undefined
  const onFail = () => {
    if (current?.startsWith('/api/')) missing.add(key)
    setI(n => n + 1)
  }
  const resolved = useAuthObjectUrl(current, onFail)
  if (i >= sources.length || !resolved) return <>{fallback}</>
  return <img src={resolved} alt="" loading="lazy" className={className} onError={onFail} />
}
