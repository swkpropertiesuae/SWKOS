/**
 * DEAD-HARDCODED ZERO-SHABIB PUBLIC WEBSITE GUARD
 *
 * Non-negotiable policy: Shabib Siraj must NEVER be mentioned anywhere on the
 * public company website (swkpropertiesuae.com / SWKPROPERTY.COM) or in any
 * public website CMS export / payload.
 */
export const ZERO_SHABIB_PATTERN = /\bshabib\b|\bsiraj\b|shabib@|shabib[-_ ]?siraj/i

export function findShabibViolations(input: unknown, path = 'root'): string[] {
  const hits: string[] = []
  const visit = (val: unknown, loc: string) => {
    if (typeof val === 'string') {
      if (ZERO_SHABIB_PATTERN.test(val)) hits.push(loc)
      return
    }
    if (Array.isArray(val)) {
      val.forEach((item, idx) => visit(item, `${loc}[${idx}]`))
      return
    }
    if (val && typeof val === 'object') {
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (ZERO_SHABIB_PATTERN.test(k)) hits.push(`${loc}.${k}`)
        visit(v, `${loc}.${k}`)
      }
    }
  }
  visit(input, path)
  return hits
}

export function assertZeroShabibPublicPayload(payload: unknown, label = 'Website payload'): void {
  const hits = findShabibViolations(payload, label)
  if (hits.length > 0) {
    throw new Error(
      `HARD LOCK BLOCKED: Public website content cannot mention restricted owner identity (${hits.slice(0, 5).join(', ')}). Remove the reference before publishing.`,
    )
  }
}

export function isRestrictedPublicProfile(profile: { slug?: string | null; email?: string | null; name?: string | null }): boolean {
  return (
    ZERO_SHABIB_PATTERN.test(String(profile.slug || '')) ||
    ZERO_SHABIB_PATTERN.test(String(profile.email || '')) ||
    ZERO_SHABIB_PATTERN.test(String(profile.name || ''))
  )
}
