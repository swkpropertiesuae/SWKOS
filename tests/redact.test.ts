import assert from 'node:assert/strict'
import { redactForStaff as r } from '../src/shared/redact'

assert.equal(r('Call +971 52 444 1112 now'), 'Call [number hidden] now')
assert.equal(r('or 050 123 4567'), 'or [number hidden]')
assert.equal(r('mail a.b@swk.properties'), 'mail [email hidden]')
assert.equal(r('Pool AED 212.4M / yr'), 'Pool AED [hidden] / yr')
assert.equal(r('Rent pool AED 212,387,207'), 'Rent pool AED [hidden]')
assert.equal(r('Unit @ AED 70,000/yr, 15,253 leads, 2026-11-16, 20 pages'), 'Unit @ AED 70,000/yr, 15,253 leads, 2026-11-16, 20 pages')
console.log('redact ok')
