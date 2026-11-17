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
  finish()
}
main().catch(e => { console.error(e); process.exit(1) })
