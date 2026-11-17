/* Lead routing, scoring, pool, mortgage cases, payment plans, matching and leaderboard.  Needs a server on a fresh data directory:  npx tsx tests/growth.ts */
import { Api, ok, sec, finish } from './_api'

async function main() {
  const a = new Api()
  ok('administrator signs in', await a.login())

  sec('Lead routing')
  const roles = (await a.get('/api/e/roles?pageSize=50')).data.rows
  const salesRole = roles.find((r: any) => r.name === 'Sales').id
  const dxb = (await a.get('/api/e/branches')).data.rows[0].id
  const u1 = (await a.post('/api/e/users', { name: 'Rota One', email: 'rota1@a.example', password: 'Manager-Pass-2026!', role_id: salesRole, branch_id: dxb, active: true })).data.id
  const u2 = (await a.post('/api/e/users', { name: 'Rota Two', email: 'rota2@a.example', password: 'Manager-Pass-2026!', role_id: salesRole, branch_id: dxb, active: true })).data.id
  const rule = await a.post('/api/e/lead_routing_rules', { name: 'Bayut to sales', active: true, priority: 1, source: 'Bayut', strategy: 'Round robin', team_roles: 'Sales' })
  ok('routing rule saves', rule.status === 201 || rule.status === 200, rule)
  const mk = async (n: string, extra: any = {}) => (await a.post('/api/e/leads', { company: n, source: 'Bayut', phone: '+9715000000' + Math.floor(Math.random() * 90 + 10), ...extra })).data
  const l1 = await mk('Route A'), l2 = await mk('Route B'), l3 = await mk('Route C')
  const team = (await a.get('/api/e/users?pageSize=100')).data.rows.filter((r: any) => r.role_id === salesRole).map((r: any) => r.id)
  ok('new leads get an owner from the rule', [l1, l2, l3].every(l => team.includes(l.owner_id)), [l1.owner_id, l2.owner_id, l3.owner_id])
  ok('round robin moves to the next person', l1.owner_id !== l2.owner_id && new Set([l1.owner_id, l2.owner_id, l3.owner_id]).size >= 2, [l1.owner_id, l2.owner_id, l3.owner_id])
  ok('both new users are in the rota', team.includes(u1) && team.includes(u2))
  ok('the lead records which rule routed it', /Rule: Bayut to sales/.test(l1.routed_by ?? ''), l1.routed_by)
  ok('a first-response deadline is set', !!l1.sla_due_at, l1)

  sec('Lead score')
  const hot = await mk('Hot Buyer', { email: 'hot@example.com', est_value: 3_000_000, buyer_finance_type: 'Cash Buyer', interest: 'Apartment Sale', destination: 'Marina', marketing_consent: 'Opted in', bedrooms_wanted: 2 })
  const cold = (await a.post('/api/e/leads', { company: 'Cold Contact', source: 'Other' })).data
  ok('rich lead is Hot', hot.score_band === 'Hot' && hot.lead_score > cold.lead_score, [hot.lead_score, hot.score_band])
  ok('thin lead is Cold', cold.score_band === 'Cold', cold)

  sec('Lead pool')
  const claim = await a.post(`/api/leads/${hot.id}/claim`)
  ok('a lead that has an owner cannot be claimed', claim.status === 400, claim)
  const sweep = await a.post('/api/leads/sla-sweep')
  ok('SLA sweep runs', sweep.status === 200 && typeof sweep.data.warned === 'number', sweep)

  sec('Mortgage cases')
  const m0 = await a.post('/api/e/mortgage_cases', { client_name: 'Loan Client', property_value: 2_000_000, loan_amount: 2_500_000 })
  ok('loan above property value is refused', m0.status === 400, m0)
  const m1 = await a.post('/api/e/mortgage_cases', { client_name: 'Loan Client', property_value: 2_000_000, loan_amount: 1_600_000, referral_commission_pct: 0.5 })
  ok('case saves and works out LTV', m1.status < 300 && m1.data.ltv_pct === 80, m1)
  ok('referral commission is worked out', m1.data.referral_commission === Math.round(m1.data.loan_amount * 0.005), m1.data)
  const id = m1.data.id
  const noBank = await a.put(`/api/e/mortgage_cases/${id}`, { ...m1.data, status: 'Submitted to Bank' })
  ok('cannot move past Referred without a bank', noBank.status === 400, noBank)
  const sub = await a.put(`/api/e/mortgage_cases/${id}`, { ...m1.data, bank: 'Mashreq', status: 'Submitted to Bank' })
  ok('submission date is stamped', sub.status === 200 && !!sub.data.submitted_date, sub)
  const dec = await a.put(`/api/e/mortgage_cases/${id}`, { ...sub.data, status: 'Declined' })
  ok('declining needs a reason', dec.status === 400, dec)
  const rec = await a.put(`/api/e/mortgage_cases/${id}`, { ...sub.data, commission_received: true })
  ok('commission cannot be received before disbursement', rec.status === 400, rec)

  sec('Payment plans')
  const p0 = await a.post('/api/e/payment_plan_templates', { name: 'Bad split', booking_pct: 10, construction_pct: 50, handover_pct: 30, post_handover_pct: 0, construction_instalments: 5 })
  ok('a split that is not 100% is refused', p0.status === 400, p0)
  const p1 = await a.post('/api/e/payment_plan_templates', { name: '20/50/30', booking_pct: 20, construction_pct: 50, handover_pct: 30, post_handover_pct: 0, construction_instalments: 5, instalment_gap_months: 3 })
  ok('a good plan saves', p1.status < 300, p1)
  const sch = await a.get(`/api/growth/payment-schedule?plan=${p1.data.id}&price=1000001&start=2026-12-01&handover=2028-12-01`)
  ok('schedule adds up to the price', sch.status === 200 && sch.data.total === 1000001, sch.data)
  ok('schedule has booking, 5 instalments and handover', sch.data.schedule?.length === 7 && sch.data.schedule[0].stage === 'Booking' && sch.data.schedule[6].stage === 'On handover', sch.data.schedule)

  sec('Matching and leaderboard')
  const mt = await a.get(`/api/growth/match/lead/${hot.id}`)
  ok('lead match returns a list', mt.status === 200 && Array.isArray(mt.data.matches), mt)
  const tgt = await a.post('/api/e/agent_targets', { user_id: u1, user_name: 'Rota One', period: new Date().toISOString().slice(0, 7), metric: 'Calls logged', target: 20 })
  ok('a target saves', tgt.status < 300, tgt)
  const lb = await a.get('/api/growth/leaderboard')
  ok('leaderboard lists advisors with points', lb.status === 200 && lb.data.rows.length > 0 && 'points' in lb.data.rows[0], lb)
  ok('leaderboard rejects a bad month', (await a.get('/api/growth/leaderboard?month=nov')).status === 400)

  sec('Team chat')
  const b = new Api(); ok('second user signs in', await b.login('rota1@a.example', 'Manager-Pass-2026!'))
  const th = await a.post('/api/chat/threads', { user_ids: [u1] })
  ok('chat thread starts', th.status === 200 && th.data.id, th)
  ok('same pair reuses the thread', (await a.post('/api/chat/threads', { user_ids: [u1] })).data.id === th.data.id)
  ok('message sends', (await a.post(`/api/chat/threads/${th.data.id}/messages`, { body: 'Hello team' })).status === 200)
  const seen = await b.get(`/api/chat/threads/${th.data.id}/messages`)
  ok('other member reads it', seen.data?.[0]?.body === 'Hello team', seen)
  const c = new Api(); await c.login('rota2@a.example', 'Manager-Pass-2026!')
  ok('non-member cannot read', (await c.get(`/api/chat/threads/${th.data.id}/messages`)).status === 400)

  sec('Drafts and sequences')
  const sq = await a.post('/api/e/followup_sequences', { name: 'Welcome', steps: '0|WhatsApp|Hi {name}, thanks for your enquiry' })
  ok('sequence saves', sq.status < 300, sq)
  ok('bad step is refused', (await a.post('/api/e/followup_sequences', { name: 'Bad', steps: 'x|Fax|hi' })).status === 400)
  const en = await a.post('/api/e/sequence_enrolments', { sequence_id: sq.data.id, lead_id: hot.id })
  ok('lead enrols', en.status < 300 && en.data.status === 'Running', en)
  ok('same lead cannot enrol twice', (await a.post('/api/e/sequence_enrolments', { sequence_id: sq.data.id, lead_id: hot.id })).status === 400)
  const dr = await a.post('/api/e/message_drafts', { channel: 'WhatsApp', to_name: 'Test', to_phone: '+971501112222', body: 'Hello' })
  ok('draft starts pending', dr.data.status === 'Pending approval', dr)
  ok('send before approval is refused', (await a.post(`/api/message-drafts/${dr.data.id}/send`)).status === 400)
  const own = await a.put(`/api/e/message_drafts/${dr.data.id}`, { ...dr.data, status: 'Approved' })
  ok('administrator may approve', own.status === 200, own)

  sec('E-sign')
  const es = await a.post('/api/e/esign_requests', { title: 'Test MOU', document_text: 'I agree to the terms.', signer_name: 'Buyer One' })
  ok('request saves with a fingerprint', es.status < 300 && /^[0-9a-f]{64}$/.test(es.data.document_hash), es)
  const lk = (await a.post(`/api/esign/${es.data.id}/send`)).data.link as string
  const sp = new URL(lk).pathname
  ok('signing page opens without login', (await fetch('http://127.0.0.1:8080' + sp)).status === 200)
  const sg = await fetch('http://127.0.0.1:8080' + sp, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'name=Buyer+One' })
  ok('signing records the signature', sg.status === 200 && (await a.get(`/api/e/esign_requests/${es.data.id}`)).data.status === 'Signed')
  ok('signed link cannot be reused', (await fetch('http://127.0.0.1:8080' + sp, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'name=Other' })).status === 404)

  sec('Search, calendar feed, connectors')
  const ask = await a.get('/api/growth/ask?q=' + encodeURIComponent('2 bed marina under 2.5m'))
  ok('plain-words search is understood', ask.data.understood?.bedrooms === 2 && ask.data.understood?.max_aed === 2_500_000, ask.data)
  ok('presentation needs units', (await a.get('/api/growth/presentation')).status === 400)
  const feed = await a.post('/api/calendar/feed-link')
  const ics = await fetch('http://127.0.0.1:8080' + new URL(feed.data.url).pathname)
  ok('calendar feed is valid ICS', ics.status === 200 && (await ics.text()).startsWith('BEGIN:VCALENDAR'))
  ok('bad feed token is 404', (await fetch('http://127.0.0.1:8080/api/public/calendar/' + 'a'.repeat(48) + '.ics')).status === 404)
  const ig = await a.get('/api/integrations')
  ok('portal connectors are listed', ['meta_leads', 'property_finder', 'bayut_dubizzle', 'madhmoun', 'esign'].every(k => ig.data.sections.some((x: any) => x.key === k)), ig.data.sections?.map((x: any) => x.key))
  await a.put('/api/admin/settings', { meta_enabled: true, meta_verify_token: 'tok123' })
  ok('Meta verify handshake works', (await (await fetch('http://127.0.0.1:8080/api/public/meta-leads?hub.mode=subscribe&hub.verify_token=tok123&hub.challenge=abc')).text()) === 'abc')
  ok('Meta verify rejects a wrong token', (await fetch('http://127.0.0.1:8080/api/public/meta-leads?hub.mode=subscribe&hub.verify_token=no&hub.challenge=abc')).status === 403)
  finish()
}
main().catch(e => { console.error(e); process.exit(1) })
