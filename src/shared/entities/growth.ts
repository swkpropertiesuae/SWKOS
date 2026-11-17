import type { EntityDef } from '../types'
import { T, TA, I, N, M, P, B, S, R, D, DT } from '../dsl'
import { LEAD_SOURCES } from './crm'

export const UAE_BANKS = ['Emirates NBD', 'Mashreq', 'First Abu Dhabi Bank', 'Abu Dhabi Commercial Bank', 'Dubai Islamic Bank', 'RAKBANK', 'HSBC', 'Standard Chartered', 'Commercial Bank of Dubai', 'Ajman Bank', 'Other']
export const MORTGAGE_STATUS = ['Referred', 'Documents Collected', 'Submitted to Bank', 'Pre-Approved', 'Valuation Done', 'Final Offer Letter', 'Offer Signed', 'Disbursed', 'Declined', 'Cancelled']
export const TARGET_METRICS = ['Leads converted', 'Calls logged', 'Viewings held', 'Deals won', 'Won value (AED)']

export const growth: EntityDef[] = [
  // Who gets a new lead. The first active rule (lowest priority number) that matches source and department picks the next person in its team.
  {
    key: 'lead_routing_rules', label: 'Lead Routing Rule', plural: 'Lead Routing Rules', module: 'crm', icon: 'Route',
    title: ['name'], panel: true,
    fields: [
      T('name', 'Rule', { required: true, list: true, search: true, section: 'Rule' }),
      B('active', 'Active', { default: true, list: true }),
      I('priority', 'Priority (1 = first)', { default: 10, list: true }),
      S('source', 'Lead source', ['Any', ...LEAD_SOURCES], { default: 'Any', list: true }),
      S('department_division', 'Department', ['Any', 'Sales of Off-Plan Projects', 'Secondary Projects', 'Leasing'], { default: 'Any', list: true }),
      S('strategy', 'Strategy', ['Round robin', 'Least open leads'], { default: 'Round robin', list: true }),
      T('team_roles', 'Team (role names, comma separated)', { default: 'Sales', list: true, help: 'Active users in these roles share the leads. Example: Sales, Manager' }),
      R('last_user_id', 'Last assigned', 'users', { readonly: true }),
    ],
    defaultSort: { field: 'priority', dir: 'asc' },
  },
  // Bank mortgage referral and its milestones (Huspy-style case tracking).
  {
    key: 'mortgage_cases', label: 'Mortgage Case', plural: 'Mortgage Cases', module: 'crm', icon: 'Landmark',
    title: ['case_no', 'client_name'], titleSep: ' – ',
    numbering: { field: 'case_no', pattern: 'MTG-{YY}{seq:5}' },
    panel: true, statusField: 'status', kanban: { field: 'status' },
    fields: [
      T('case_no', 'Case No.', { readonly: true, list: true, search: true, section: 'Case' }),
      R('lead_id', 'Lead', 'leads', { list: true }),
      R('party_id', 'Client', 'parties', { list: true }),
      T('client_name', 'Client', { required: true, list: true, search: true }),
      R('owner_id', 'Sales advisor', 'users', { default: 'me', list: true }),
      R('unit_id', 'Unit', 'units'),
      S('bank', 'Bank', UAE_BANKS, { list: true, section: 'Loan' }),
      M('property_value', 'Property value', { required: true }),
      M('loan_amount', 'Loan amount', { required: true, list: true }),
      P('ltv_pct', 'LTV %', { readonly: true, list: true }),
      N('tenor_years', 'Tenor (years)', { min: 1, max: 30, default: 25 }),
      N('rate_pct', 'Rate %', { min: 0, max: 30 }),
      S('status', 'Milestone', MORTGAGE_STATUS, { default: 'Referred', list: true, key: true, section: 'Milestones' }),
      D('submitted_date', 'Submitted to bank', { readonly: true }),
      D('preapproval_date', 'Pre-approved', { readonly: true }),
      D('offer_date', 'Offer letter', { readonly: true }),
      D('disbursed_date', 'Disbursed'),
      TA('decline_reason', 'Decline / cancel reason'),
      P('referral_commission_pct', 'Bank referral commission % of loan', { default: 0, min: 0, max: 5, section: 'Referral commission' }),
      M('referral_commission', 'Referral commission', { readonly: true, list: true }),
      B('commission_received', 'Commission received from bank'),
      TA('notes', 'Notes'),
    ],
    defaultSort: { field: 'id', dir: 'desc' },
  },
  // Reusable off-plan payment plan (down payment, instalments, handover, post-handover) that can be applied to any unit price.
  {
    key: 'payment_plan_templates', label: 'Payment Plan', plural: 'Payment Plans', module: 'properties', icon: 'ListChecks',
    title: ['name'], panel: true,
    fields: [
      T('name', 'Plan', { required: true, list: true, search: true, section: 'Plan' }),
      R('developer_id', 'Developer', 'developers', { list: true }),
      B('active', 'Active', { default: true, list: true }),
      P('booking_pct', 'Booking / down payment %', { default: 10, list: true, section: 'Split (must total 100%)' }),
      P('construction_pct', 'During construction %', { default: 50, list: true }),
      N('construction_instalments', 'Construction instalments', { min: 0, max: 60, default: 5 }),
      P('handover_pct', 'On handover %', { default: 40, list: true }),
      P('post_handover_pct', 'Post-handover %', { default: 0 }),
      N('post_handover_months', 'Post-handover months', { min: 0, max: 120, default: 0 }),
      I('instalment_gap_months', 'Months between construction instalments', { default: 3, min: 1, max: 12 }),
      TA('notes', 'Notes'),
    ],
    defaultSort: { field: 'id', dir: 'desc' },
  },
  // Monthly goals per advisor, scored against the leaderboard.
  {
    key: 'agent_targets', label: 'Target', plural: 'Targets', module: 'crm', icon: 'Target',
    title: ['user_name', 'metric', 'period'], titleSep: ' · ',
    fields: [
      R('user_id', 'Advisor', 'users', { required: true, list: true, section: 'Target' }),
      T('user_name', 'Advisor', { readonly: true, list: true }),
      T('period', 'Month (YYYY-MM)', { required: true, list: true }),
      S('metric', 'Metric', TARGET_METRICS, { required: true, list: true }),
      N('target', 'Target', { required: true, min: 0, list: true }),
    ],
    defaultSort: { field: 'period', dir: 'desc' },
  },
]
