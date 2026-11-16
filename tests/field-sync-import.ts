/* Offline sync replay and CSV import idempotency.  Needs a server on a fresh data directory:  npx tsx tests/field-sync-import.ts */
import { Api, ok, sec, finish } from './_api'

async function main() {
  const a = new Api()
  ok('administrator signs in', await a.login())

  sec('Offline sync')
  const key = 'test-' + Date.now() + '-aaaa'
  const act = { key, op: 'create', entity: 'activities', payload: { subject: 'Offline call', activity_type: 'Call' } }
  const r1 = await a.post('/api/sync/actions', { device_id: 'dev-1', actions: [act] })
  ok('first replay is synced', r1.data.results?.[0]?.status === 'synced', r1.data)
  const r2 = await a.post('/api/sync/actions', { device_id: 'dev-1', actions: [act] })
  ok('same key again returns the stored result', r2.data.results?.[0]?.replay === true && r2.data.results[0].id === r1.data.results[0].id, r2.data)
  const count = (await a.get('/api/e/activities?q=Offline%20call')).data.total
  ok('only one record was created', count === 1, count)
  const bad = await a.post('/api/sync/actions', { actions: [{ key: 'test-' + Date.now() + '-bbbb', op: 'create', entity: 'users', payload: {} }] })
  ok('entities outside the allowlist are rejected', bad.data.results?.[0]?.status === 'rejected', bad.data)
  const id = r1.data.results[0].id
  const stale = await a.post('/api/sync/actions', { actions: [{ key: 'test-' + Date.now() + '-cccc', op: 'update', entity: 'activities', id, payload: { subject: 'Changed offline', version: 999 } }] })
  ok('an edit on a stale version is a conflict', stale.data.results?.[0]?.status === 'conflict', stale.data)

  sec('CSV import')
  const csv = 'name\nImport Co One\nImport Co Two\n'
  const i1 = await a.post('/api/e/parties/import', { csv })
  ok('first import creates rows and a batch', i1.data.created === 2 && !!i1.data.batchId, i1.data)
  const i2 = await a.post('/api/e/parties/import', { csv })
  ok('same file again is refused with 409', i2.status === 409, i2)
  const i3 = await a.post('/api/e/parties/import', { csv, dryRun: true })
  ok('dry run is still allowed', i3.status === 200 && i3.data.dryRun === true, i3)
  const i4 = await a.post('/api/e/parties/import', { csv: 'name,status\nBad Status Co,NotAStatus\n', force: false })
  ok('failed rows come back as a CSV with the reason', i4.data.failed === 1 && /import_error/.test(i4.data.failedCsv ?? ''), i4.data)

  sec('Lead intake')
  const hook = (await a.post('/api/integrations/webhook-secret/lead')).data.url as string
  const path = new URL(hook).pathname
  const lead = { external_id: 'form-' + Date.now(), name: 'Web Lead', email: 'web.lead@example.com', phone: '+971501234567', message: 'Interested in a 2BR', source: 'Website' }
  const l1 = await a.post(path, lead)
  ok('first delivery creates a lead', l1.status === 201 && l1.data.new_lead === true, l1)
  const l2 = await a.post(path, lead)
  ok('retried delivery returns the same lead', l2.data.duplicate_delivery === true && l2.data.lead_id === l1.data.lead_id, l2)
  const l3 = await a.post(path, { ...lead, external_id: 'form-other-' + Date.now(), message: 'Second enquiry' })
  ok('a new enquiry from the same phone joins the open lead', l3.data.lead_id === l1.data.lead_id && l3.data.new_lead === false, l3)
  const l4 = await a.post(path.replace(/[^/]+$/, 'wrong'), lead)
  ok('wrong secret is a 404', l4.status === 404, l4)
  finish()
}
main().catch(e => { console.error(e); process.exit(1) })
