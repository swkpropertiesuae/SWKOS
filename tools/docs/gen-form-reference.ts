// Writes docs/SWK-OS-WORKBOOK-FORMS.md: every form behind a menu item, field by field, straight from the entity definitions.
// Run: npx tsx tools/docs/gen-form-reference.ts
import { writeFileSync } from 'node:fs'
import { ENTITIES } from '../../src/shared/entities/index'
import { optLabel } from '../../src/shared/types'
import { SWK_NAV } from '../../src/web/swk/nav'

const TYPE: Record<string, string> = { text: 'Text', textarea: 'Long text', int: 'Whole number', number: 'Number', money: 'Amount (AED)', percent: '%', date: 'Date', datetime: 'Date & time', select: 'Choose one', bool: 'Tick box', email: 'E-mail', phone: 'Phone', url: 'Link', ref: 'Pick record' }
const esc = (s: string) => s.replace(/\|/g, '/').replace(/\n/g, ' ')
const out: string[] = [
  '# SWK OS Workbook — Part B: Form Field Reference',
  '',
  '> Generated from the system itself (`npx tsx tools/docs/gen-form-reference.ts`). Do not edit by hand: re-run the command after a form changes.',
  '>',
  '> **How to read it.** *Required* = the form will not save without it. *Automatic* = filled by the system (numbers, totals, approver names, time stamps); you never type it. *Pick record* = choose an existing record from a drop-down (create that record first if it is missing).',
  '',
]
const done = new Set<string>()
for (const s of SWK_NAV) {
  const items = s.items.filter(i => i.to.startsWith('/e/'))
  if (!items.length) continue
  out.push(`## ${s.label}`, '')
  for (const i of items) {
    const key = i.to.slice(3).split('?')[0]!
    const e = ENTITIES[key]
    if (!e) continue
    if (done.has(key)) { out.push(`### ${i.label}`, '', `Same form as **${ENTITIES[key]!.plural}** above.`, ''); continue }
    done.add(key)
    out.push(`### ${i.label} — ${e.plural}`, '')
    out.push(`Menu: **${s.label} → ${i.label}**${i.desc ? ` (${i.desc})` : ''} · Address: \`${i.to}\``)
    const facts = [e.numbering ? `numbered automatically (${e.numbering.pattern.replace(/\{YY\}/, 'YY').replace(/\{seq:(\d)\}/, (_m, n) => '0'.repeat(+n))})` : '', e.noDelete ? 'cannot be deleted (cancel or void instead)' : '', e.readonlyApi ? 'read-only: rows are written by the system' : '', e.print ? 'can be printed / e-mailed as PDF' : '', e.kanban ? `has a board view by ${e.kanban.field}` : '']
    const f = facts.filter(Boolean)
    if (f.length) out.push('', `Record rules: ${f.join(' · ')}.`)
    if (e.description) out.push('', `*${e.description}*`)
    out.push('', '| Section | Field | Type | Rule | Choices / help |', '|---|---|---|---|---|')
    let sec = ''
    for (const fd of e.fields) {
      if (fd.hidden || fd.secret) continue
      if (fd.section) sec = fd.section
      const type = fd.type === 'ref' ? `Pick record (${ENTITIES[fd.ref!]?.label ?? fd.ref})` : TYPE[fd.type] ?? fd.type
      const rule = fd.required ? '**Required**' : (fd.readonly || fd.computed) ? 'Automatic' : 'Optional'
      const choices = [fd.options?.map(optLabel).filter(Boolean).join(' · ') ?? '', fd.help ?? ''].filter(Boolean).join(' — ')
      out.push(`| ${esc(sec)} | ${esc(fd.label)} | ${esc(type)} | ${rule} | ${esc(choices)} |`)
    }
    for (const c of e.children ?? []) out.push('', `Inside this form: a **${c.label}** table (add one line per item).`)
    out.push('')
  }
}
writeFileSync(new URL('../../docs/SWK-OS-WORKBOOK-FORMS.md', import.meta.url), out.join('\n'))
console.log(`forms: ${done.size}`)
