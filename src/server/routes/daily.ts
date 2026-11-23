/** Daily close-out report, today's report status and the leadership live roster. */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { q, tx } from '../db'
import { bad, nowIso, todayStr } from '../util'
import { getDef, createRecord, patchRecord } from '../engine'
import { submitDailyReport } from '../domain/enterprise'
import { liveRoster } from '../domain/dailyplan'
import { need } from './helpers'

export default async function (app: FastifyInstance) {
  const employee = (req: any) => {
    const e = q.get('SELECT id FROM employees WHERE user_id = ? AND deleted_at IS NULL AND status IN (?, ?, ?)', req.user.id, 'Active', 'Probation', 'On leave')
    if (!e) throw bad('Ask HR to link your account to an active employee record')
    return e
  }
  app.post('/api/daily/report', async req => tx(() => {
    need(req, 'hr', 'view')
    const b = z.object({ outcomes_narrative: z.string().trim().min(30).max(10000), blockers_narrative: z.string().max(10000).default(''), next_day_priorities: z.string().trim().min(30).max(10000) }).parse(req.body)
    const e = employee(req), day = todayStr()
    const prior = q.get('SELECT id, status FROM daily_reports WHERE employee_id = ? AND report_date = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1', e.id, day)
    if (prior && !['Draft', 'Returned for Clarification'].includes(prior.status)) throw bad('Today’s report is already submitted')
    const ctx = { ...req.ctx, system: true }
    const report = prior ? patchRecord(getDef('daily_reports'), prior.id, b, ctx) : createRecord(getDef('daily_reports'), { ...b, employee_id: e.id, user_id: req.user!.id, report_date: day }, ctx)
    return submitDailyReport(report.id, ctx)
  }))
  // Owner / Manager live roster: who is in the office, in the field, late, on leave, and who has filed the daily report.
  app.get('/api/attendance/live', async req => {
    need(req, 'hr', 'approve')
    return { at: nowIso(), date: todayStr(), roster: liveRoster() }
  })
  app.get('/api/daily/status', async req => {
    need(req, 'hr', 'view')
    const e = employee(req), day = todayStr()
    const r = q.get('SELECT id, status, outcomes_narrative, next_day_priorities, submitted_at FROM daily_reports WHERE employee_id = ? AND report_date = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1', e.id, day)
    return { date: day, submitted: !!r && ['Submitted (Frozen)', 'Approved by Manager', 'Exemption Logged'].includes(r.status), report: r ?? null }
  })
}
