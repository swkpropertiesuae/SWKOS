export interface ScrubResult {
  text: string
  map: Map<string, string>
  redactedCount: number
}

const VAULT_REF_RE = /\b(?:VAULT|EJ26|CL1920|CRM[-_]?VAULT)[-_][A-Z0-9][A-Z0-9_-]{1,40}\b/gi
const ENCRYPTED_SECRET_RE = /\benc:v1:[A-Za-z0-9+/=]{12,}/g
const UAE_IBAN_RE = /\bAE\d{2}(?:[ -]?\d){19}\b/gi
const EMIRATES_ID_RE = /\b784[- ]?\d{4}[- ]?\d{7}[- ]?\d\b/g
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const INTL_PHONE_RE = /(?<!\w)(?:\+|00)[1-9]\d{0,2}(?:[ .-]*\d){6,13}\b/g
const UAE_LOCAL_PHONE_RE = /\b(?:971[ -]?(?:5[024568]|2|3|4|6|7|9)|0(?:5[024568]|[234679]))(?:[ -]?\d){7}\b/g
const LABELED_PASSPORT_RE = /(passport(?:\s*(?:no\.?|number|#))?\s*[:#-]\s*)([A-Z0-9]{6,12})\b/gi
const ALNUM_PASSPORT_RE = /(?<![A-Z0-9\-\[])\b[A-Z]{1,2}\d{6,8}\b(?![\-\]])/g

const PLACEHOLDER_TOKEN_RE = /\[(?:PHONE|EID|IBAN|EMAIL|PASSPORT|VAULT_REF|SECRET)_\d+\]/g

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface ScrubberState {
  map: Map<string, string>
  reverse: Map<string, string>
  counters: Record<string, number>
  redactedCount: number
}

function createScrubberState(existingMap?: Map<string, string>): ScrubberState {
  const map = existingMap ?? new Map<string, string>()
  const reverse = new Map<string, string>()
  const counters: Record<string, number> = {}
  for (const [tok, orig] of map.entries()) {
    reverse.set(orig, tok)
    const m = /^\[([A-Z_]+)_(\d+)\]$/.exec(tok)
    if (m) {
      counters[m[1]] = Math.max(counters[m[1]] ?? 0, Number(m[2]))
    }
  }
  return { map, reverse, counters, redactedCount: 0 }
}

function scrubWithState(input: string, state: ScrubberState): string {
  if (!input) return input

  const tokenFor = (tag: string, raw: string): string => {
    const existing = state.reverse.get(raw)
    if (existing) return existing
    let idx = (state.counters[tag] ?? 0) + 1
    let tok = `[${tag}_${idx}]`
    while (state.map.has(tok) || input.includes(tok)) {
      idx++
      tok = `[${tag}_${idx}]`
    }
    state.counters[tag] = idx
    state.map.set(tok, raw)
    state.reverse.set(raw, tok)
    state.redactedCount++
    return tok
  }

  let out = input
  out = out.replace(ENCRYPTED_SECRET_RE, m => tokenFor('SECRET', m))
  out = out.replace(VAULT_REF_RE, m => tokenFor('VAULT_REF', m))
  out = out.replace(UAE_IBAN_RE, m => tokenFor('IBAN', m))
  out = out.replace(EMIRATES_ID_RE, m => tokenFor('EID', m))
  out = out.replace(EMAIL_RE, m => tokenFor('EMAIL', m))
  out = out.replace(INTL_PHONE_RE, m => tokenFor('PHONE', m))
  out = out.replace(UAE_LOCAL_PHONE_RE, m => tokenFor('PHONE', m))
  out = out.replace(LABELED_PASSPORT_RE, (_full, prefix: string, code: string) => {
    if (PLACEHOLDER_TOKEN_RE.test(code)) {
      PLACEHOLDER_TOKEN_RE.lastIndex = 0
      return _full
    }
    PLACEHOLDER_TOKEN_RE.lastIndex = 0
    return `${prefix}${tokenFor('PASSPORT', code)}`
  })
  out = out.replace(ALNUM_PASSPORT_RE, m => tokenFor('PASSPORT', m))
  return out
}

/**
 * Redacts UAE/E.164 phones, Emirates IDs (784-), passport numbers, UAE IBANs,
 * email addresses, encrypted secret tokens, and CRM Vault references before
 * sending prompts to routes with zero_retention = false.
 */
export function scrubSensitivePii(input: string): ScrubResult {
  const state = createScrubberState()
  const text = scrubWithState(String(input ?? ''), state)
  return { text, map: state.map, redactedCount: state.redactedCount }
}

/** Restores redacted PII placeholders back to their original values locally. */
export function restoreScrubbedPii(text: string, map: Map<string, string>): string {
  if (!text || !map.size) return text
  const keys = [...map.keys()]
  if (!keys.length) return text
  const re = new RegExp(keys.map(escapeRegExp).join('|'), 'g')
  return text.replace(re, match => map.get(match) ?? match)
}

/** Clones and scrubs all text content across a ChatMsg[] array using a shared token map. */
export function scrubMessages<T extends { role: string; content: any }>(
  messages: T[],
): { messages: T[]; map: Map<string, string>; redactedCount: number } {
  const state = createScrubberState()
  const scrubbed = messages.map(msg => {
    if (typeof msg.content === 'string') {
      return { ...msg, content: scrubWithState(msg.content, state) }
    }
    if (Array.isArray(msg.content)) {
      const parts = msg.content.map(part => {
        if (part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string') {
          return { ...part, text: scrubWithState(part.text, state) }
        }
        return part
      })
      return { ...msg, content: parts }
    }
    return { ...msg }
  })
  return { messages: scrubbed, map: state.map, redactedCount: state.redactedCount }
}

/**
 * Detects whether a partial tail of streamed text could be the beginning of a
 * redacted placeholder like `[PHONE_1]` so streaming buffers can hold it back
 * until the closing `]` arrives.
 */
export function findPendingPlaceholderStart(buffer: string): number {
  const openIdx = buffer.lastIndexOf('[')
  if (openIdx === -1) return -1
  const tail = buffer.slice(openIdx)
  if (tail.includes(']')) return -1
  if (/^\[[A-Z0-9_]*$/.test(tail)) return openIdx
  return -1
}
