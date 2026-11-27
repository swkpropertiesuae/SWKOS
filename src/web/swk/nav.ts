import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  LineChart,
  KanbanSquare,
  CalendarDays,
  Sparkles,
  Building2,
  Home,
  Rocket,
  Map,
  Landmark as DevIcon,
  Megaphone,
  UserPlus,
  Users,
  Target,
  PhoneCall,
  MessageCircle,
  Mail,
  FilePen,
  CalendarCheck,
  HandCoins,
  FileSignature,
  FileCheck,
  ShieldCheck,
  KeyRound,
  CalendarClock,
  Wallet,
  ReceiptText,
  Wrench,
  ClipboardCheck,
  DoorOpen,
  UserRoundCog,
  FileBarChart,
  Percent,
  Receipt,
  FileInput,
  Banknote,
  Scale,
  BadgeCheck,
  ScrollText,
  FileStack,
  Trophy,
  IdCard,
  Clock,
  Plane,
  Calculator,
  FileCode2,
  BarChart3,
  Settings,
  ShieldHalf,
  History,
  Plug,
  DatabaseBackup,
  Building,
  Gavel,
  Layers,
  ShieldAlert,
  CheckCheck,
  MapPinned,
  Briefcase,
  Star,
  PackageCheck,
  QrCode,
  Trash2,
  Globe,
  Flame,
  Contact,
  MessagesSquare,
  ListChecks,
  FolderKanban,
  Workflow,
  Zap,
  ScanText,
  Languages,
  Search,
  Navigation,
  MessageCircleMore,
  SquareCheckBig,
  Gauge,
  UsersRound,
  Handshake,
  Settings2,
  Crown,
  Database,
  FolderLock,
  Brain,
  Radio,
} from 'lucide-react'
import {
  canAccessCrmVault,
  canAccessDocumentTemplates,
  canAccessFieldLiveMap,
  canAccessMasterLog,
  canAccessShabibsCorner,
  canAccessSwkAdminLogic,
  canPrintReceptionQr,
  isAllowedPathForRestrictedStaff,
  isRestrictedStaffUser,
} from '@shared/swk-staff-access'

export type NavItem = { label: string; to: string; icon: LucideIcon; module?: string; isNew?: boolean; desc?: string }
export type NavSection = { key: string; label: string; items: NavItem[] }

/**
 * Restructured SWK OS v4 — Clean App-Icon Architecture with simple names:
 * Shabib's Corner, Command Center, Dashboard, Master Log, Pipeline Playbook,
 * CRM, Mortgage Desk, Sales & Services, Documents Vault, Accounts, Compliance,
 * Website & Social, Employees, Field GPS Services, AI Case-Study Lab,
 * Utilities & Documents, Settings + SWK Core Suite (Inside, Work, Phone).
 */
export const SWK_CORE_SUITE_KEYS = new Set(['messages', 'work', 'phone'])

export const SWK_NAV: NavSection[] = [
  {
    key: 'messages',
    label: 'SWK Inside',
    items: [
      { label: 'SWK Inside Messenger', to: '/chat', icon: MessagesSquare, isNew: true, desc: 'Team chats, attendance check-in group & broadcasts' },
    ],
  },
  {
    key: 'work',
    label: 'SWK Work',
    items: [
      { label: 'My Work', to: '/my-work', icon: ListChecks, module: 'projects', isNew: true, desc: 'My tasks today, by due date' },
      { label: 'Team Tasks', to: '/e/tasks', icon: ListChecks, module: 'projects', desc: 'Table, board & calendar of all team tasks' },
      { label: 'Projects', to: '/e/projects', icon: FolderKanban, module: 'projects', desc: 'Projects with owners, budgets & dates' },
      { label: 'Automations', to: '/automations', icon: Zap, module: 'admin', isNew: true, desc: 'No-code workflow rules' },
      { label: 'Automation Runs', to: '/e/workflow_runs', icon: Workflow, module: 'admin', desc: 'Execution history' },
    ],
  },
  {
    key: 'phone',
    label: 'SWK Phone',
    items: [
      { label: 'SWK Phone & Dialer', to: '/phone', icon: PhoneCall, isNew: true, desc: 'WebRTC SIP extension, directory & Masked Vault calling' },
    ],
  },
  {
    key: 'shabib_corner',
    label: "Shabib's Workspace",
    items: [
      { label: "Shabib's Workspace", to: '/shabibs-corner', icon: Crown, isNew: true, desc: 'Owner Command: Team Tasks, Forensic Visits, Brochure Studio, Legal Forms, Closings & Commissions' },
      { label: 'Team & Daily To-Do', to: '/shabibs-corner?tab=team-tasks', icon: ListChecks, isNew: true, desc: 'Staff roles, tasks to do/done today & assign Verification Authority' },
      { label: 'Forensic Visits & Viewings', to: '/shabibs-corner?tab=forensic-visits', icon: MapPinned, isNew: true, desc: 'GPS-pinned, authority-verified site visits, unit photos & 3rd-party records' },
      { label: 'Catalog & Brochure Studio', to: '/shabibs-corner?tab=catalog-studio', icon: Building2, isNew: true, desc: 'Add Communities, Developers, Projects & Units + Brochure color customizer' },
      { label: 'Legal Forms (Word/JPEG)', to: '/shabibs-corner?tab=legal-forms', icon: FileSignature, isNew: true, desc: 'A2A, LOI, Tenancy, Ejari, NOC fillable forms in Word, JPEG & PDF' },
      { label: 'Pin-to-Pin Closings (5)', to: '/shabibs-corner?tab=closings', icon: ClipboardCheck, isNew: true, desc: 'Scratch-to-handover dossiers & cheque ledger for Off-Plan, Secondary, Handover, Leasing & PM' },
      { label: 'Commissions & Expenses', to: '/shabibs-corner?tab=commissions', icon: Percent, isNew: true, desc: 'Paid/Received/Pending agent commissions & expenses (Cash/BT/Botim/3rd Party)' },
      { label: 'Privacy Fast Track', to: '/shabibs-corner?tab=fast-track', icon: Flame, desc: 'Bypass Master Log for immediate cash & VIP deals' },
      { label: 'Owner Approvals Hub', to: '/shabibs-corner?tab=approvals', icon: CheckCheck, desc: 'Master Log, Seals, Delete Bin & Universal sign-offs' },
      { label: 'Bulk AI Upload', to: '/shabibs-corner?tab=bulk-ai', icon: Sparkles, desc: 'Fast CSV/WhatsApp import into Fast Track or Leads' },
      { label: 'Consolidated Ledger', to: '/shabibs-corner?tab=ledger', icon: Wallet, desc: 'Combined Standard + Private VAT & P&L view' },
    ],
  },
  {
    key: 'command',
    label: 'Command Center',
    items: [
      { label: 'Command Center', to: '/command-center', icon: Radio, isNew: true, desc: '12-stage live counts, tasks, alerts, QR attendance & GPS' },
      { label: 'Company Operations', to: '/enterprise/master-os', icon: ShieldCheck, module: 'admin', desc: 'Daily reports, NOCs, commissions & governance' },
      { label: 'Approvals Queue', to: '/e/universal_approvals', icon: CheckCheck, module: 'admin', desc: 'Items waiting for sign-off' },
      { label: 'Delete Bin', to: '/recycle-bin', icon: Trash2, module: 'admin', desc: 'Owner approval for deletions' },
      { label: 'Calendar', to: '/calendar', icon: CalendarDays, desc: 'Viewings, valuations & meetings' },
    ],
  },
  {
    key: 'dashboard',
    label: 'Dashboard',
    items: [
      { label: 'Executive Dashboard', to: '/dashboard', icon: LayoutDashboard, module: 'dashboard', desc: 'Revenue, 12-stage counts, my tasks & team alerts' },
      { label: 'Market Pulse', to: '/market', icon: LineChart, desc: 'Live Dubai prices, PSF & rental yields' },
      { label: 'Reports', to: '/reports', icon: BarChart3, module: 'reports', desc: 'Executive analytics & exports' },
    ],
  },
  {
    key: 'master_log',
    label: 'Master Log',
    items: [
      { label: 'CORE Master Log (20)', to: '/master-log', icon: Database, isNew: true, desc: 'HQ registries + Office Admin approval gate' },
      { label: 'Communities', to: '/e/communities', icon: Map, module: 'masters', desc: 'All Dubai & Abu Dhabi communities, yields & masterplans' },
      { label: 'Developers', to: '/e/developers', icon: DevIcon, module: 'masters', desc: '80+ Dubai & Abu Dhabi master developers & RERA/DMT IDs' },
      { label: 'Branches & Geofence', to: '/e/branches', icon: Building, module: 'admin', desc: 'Al Saqr Building SZR Wi-Fi & geofence' },
      { label: 'Departments', to: '/e/departments', icon: Users, module: 'admin', desc: 'Management, BDM, HR, Accounts, Sales & Ops' },
      { label: 'Projects', to: '/e/properties', icon: Building2, module: 'properties', desc: 'Master Dubai & Abu Dhabi projects (e.g. Shahrukhz by Danube)' },
      { label: 'Project Units', to: '/e/units', icon: Home, module: 'properties', desc: 'Individual residences, villas, townhouses & offices' },
      { label: 'Payment Plans', to: '/e/payment_plan_templates', icon: Rocket, module: 'properties', desc: 'Off-plan developer instalment plans' },
    ],
  },
  {
    key: 'pipeline',
    label: 'Pipeline Playbook',
    items: [
      { label: '12-Stage Kanban', to: '/pipeline', icon: KanbanSquare, module: 'sales', isNew: true, desc: 'Inventory → Marketing → Form F → Mortgage → DLD → Closure' },
      { label: 'Dubai Agency Hub', to: '/dubai-agency-hub', icon: Zap, module: 'properties', isNew: true, desc: 'Portal XML (PF/Bayut), 5-min Lead SLA, Smart Matcher, 3-Project ROI & Expiry Radar' },
      { label: 'Off-Plan Launches', to: '/offplan', icon: Rocket, module: 'properties', desc: 'All Dubai & Abu Dhabi unhanded-over launches & promotions' },
      { label: 'Project Listing Studio', to: '/listings', icon: Megaphone, module: 'properties', desc: 'Project brochures, PPTX, 3D, social & portal syndication' },
      { label: 'Smart Search', to: '/smart-search', icon: Search, module: 'properties', desc: 'Plain-language buyer shortlist matcher' },
    ],
  },
  {
    key: 'clients',
    label: 'CRM',
    items: [
      { label: 'Leads & Enquiries', to: '/e/leads', icon: UserPlus, module: 'crm', desc: 'Daily enquiries, routing & assigned clients' },
      { label: 'Contacts & Clients', to: '/e/parties', icon: Users, module: 'crm', desc: 'Buyers, sellers, landlords & tenants' },
      { label: 'CRM Property Vault', to: '/crm-vault', icon: ShieldCheck, module: 'admin', desc: 'Leadership Vault · 3,600+ properties & masked dispatch' },
      { label: 'My Assigned Deals', to: '/my-deals', icon: Briefcase, desc: 'Dispatched deals & masked calling' },
      { label: 'WhatsApp', to: '/whatsapp', icon: MessageCircle, module: 'crm', desc: 'Live client WhatsApp threads' },
      { label: 'Email Inbox', to: '/email', icon: Mail, module: 'crm', desc: 'Client email inbox' },
      { label: 'Follow-Ups & Calls', to: '/e/activities', icon: CalendarCheck, module: 'crm', desc: 'Callbacks, meetings & activity log' },
      { label: 'Opportunities', to: '/e/opportunities', icon: Target, module: 'crm', desc: 'Qualified buyer/tenant requirements' },
      { label: 'Routing Rules', to: '/e/lead_routing_rules', icon: History, module: 'crm', desc: 'Automated lead distribution' },
    ],
  },
  {
    key: 'mortgage_desk',
    label: 'Mortgage Desk',
    items: [
      { label: 'Mortgage Business Desk', to: '/mortgage-desk', icon: DevIcon, module: 'crm', isNew: true, desc: 'Schedules, deadlines, valuations, RM follow-ups & CBUAE calc' },
      { label: 'Mortgage Cases', to: '/e/mortgage_cases', icon: Briefcase, module: 'crm', desc: 'All active bank referrals & LTV/FOL milestones' },
    ],
  },
  {
    key: 'sales',
    label: 'Sales & Services',
    items: [
      { label: 'Deal Files', to: '/e/jobs', icon: FileSignature, module: 'sales', desc: 'Master closing & 50/50 split files' },
      { label: 'Seller Form A', to: '/e/mandates', icon: FilePen, module: 'mandates', desc: 'Seller listing mandates' },
      { label: 'Viewings', to: '/e/viewings', icon: CalendarCheck, module: 'mandates', desc: 'Scheduled property visits' },
      { label: 'Buyer Offers', to: '/e/offers', icon: HandCoins, module: 'transactions', desc: 'Written offers & counter-offers' },
      { label: 'Form F / Sale Contract', to: '/e/sales_contracts', icon: FileCheck, module: 'transactions', desc: 'Signed MOU / SPA' },
      { label: 'Developer NOC', to: '/e/developer_requests', icon: FileCheck, module: 'transactions', desc: 'SOA & Developer clearance' },
      { label: 'DLD Transfer / Oqood', to: '/e/dld_filings', icon: FileCheck, module: 'transactions', desc: 'Trustee transfer & Title Deed' },
      { label: 'Leases & Ejari', to: '/e/leases', icon: KeyRound, module: 'leases', desc: 'Tenancy contracts, PDC cheques & handovers' },
      { label: 'Rent Schedules', to: '/e/rent_schedules', icon: CalendarClock, module: 'leases', desc: 'Rent payment dates & schedules' },
      { label: 'Rent Cheques (PDC)', to: '/pdc', icon: Wallet, module: 'leases', desc: 'Post-dated cheques tracker' },
      { label: 'Landlord Hub', to: '/owners', icon: UserRoundCog, module: 'finance', desc: 'Owner portfolios & payout statements' },
      { label: 'Withdrawals & Refunds', to: '/withdrawals', icon: Scale, module: 'sales', desc: 'Cancellations & Owner sign-off' },
    ],
  },
  {
    key: 'vault',
    label: 'Documents Vault',
    items: [
      { label: 'Per-Client 13-Doc Vault', to: '/client-vault', icon: FolderLock, module: 'documents', isNew: true, desc: 'Passport, EID, Visa, Payslips, AECB, Form F, Oqood, Title Deed, NOC' },
      { label: 'All Uploaded PDFs', to: '/documents', icon: FileStack, module: 'documents', desc: 'Full file library & expiry search' },
      { label: 'E-Signatures', to: '/e/esign_requests', icon: FilePen, module: 'documents', desc: 'Send client agreements to sign' },
    ],
  },
  {
    key: 'finance',
    label: 'Accounts',
    items: [
      { label: 'Tax Invoices', to: '/e/invoices', icon: Receipt, module: 'finance', desc: 'Client VAT invoices & PINT AE' },
      { label: 'Receipts', to: '/e/receipts', icon: HandCoins, module: 'finance', desc: 'Confirmed bank receipts' },
      { label: 'Commissions (50/50)', to: '/e/agent_commissions', icon: Percent, module: 'finance', desc: 'Broker commission splits & payouts' },
      { label: 'Supplier Bills', to: '/e/bills', icon: FileInput, module: 'finance', desc: 'Incoming vendor bills' },
      { label: 'Payments', to: '/e/payments', icon: Banknote, module: 'finance', desc: 'Outgoing corporate transfers' },
      { label: 'Bank Matching', to: '/e/bank_transactions', icon: Scale, module: 'finance', desc: 'Statement reconciliation' },
      { label: 'Profit, Balance & VAT', to: '/finance/statements', icon: FileBarChart, module: 'finance', desc: 'IFRS P&L, GL & UAE VAT 201' },
    ],
  },
  {
    key: 'compliance',
    label: 'Compliance',
    items: [
      { label: 'KYC Checks', to: '/e/kyc_checks', icon: ShieldCheck, module: 'compliance', desc: 'Client ID, PEP & source of funds' },
      { label: 'RERA Centre', to: '/rera', icon: Gavel, module: 'compliance', desc: 'Trakheesi permits & RERA forms' },
      { label: 'AML & goAML Reports', to: '/e/aml_reports', icon: ShieldAlert, module: 'compliance', desc: 'Sanctions screening & goAML filings' },
      { label: 'Trade Licences', to: '/compliance', icon: BadgeCheck, module: 'compliance', desc: 'Company licences & statutory calendar' },
      { label: 'Broker Cards (BRN)', to: '/e/agent_authorisations', icon: IdCard, module: 'compliance', desc: 'Agent RERA card renewals' },
      { label: 'Risk Cases', to: '/e/compliance_cases', icon: ShieldAlert, module: 'compliance', desc: 'Compliance investigations' },
    ],
  },
  {
    key: 'website',
    label: 'Website & Social',
    items: [
      { label: 'Website & Social Studio', to: '/website', icon: Globe, module: 'website', isNew: true, desc: 'Live listings, offers, updates, social & zero-Shabib lock' },
      { label: 'Website Listings', to: '/e/website_listings', icon: Building2, module: 'website', desc: 'All listings on swkpropertiesuae.com' },
      { label: 'Offers & Promotions', to: '/e/website_promotions', icon: Flame, module: 'website', desc: 'Trending spotlight & hot offers' },
    ],
  },
  {
    key: 'team',
    label: 'Employees',
    items: [
      { label: 'Team Directory', to: '/team', icon: Contact, desc: 'Profiles, bios & role access' },
      { label: 'Staff & HR Records', to: '/e/employees', icon: Users, module: 'hr', desc: 'Employee master directory' },
      { label: 'Reception QR Desk', to: '/reception-qr', icon: QrCode, desc: 'Office reception QR generation & attendance check-in' },
      { label: 'Attendance Log', to: '/e/attendance', icon: Clock, module: 'hr', desc: 'Daily check-in & check-out log' },
      { label: 'Leave Requests', to: '/e/leave_requests', icon: Plane, module: 'hr', desc: 'Annual & sick leave approvals' },
      { label: 'Visas & Emirates IDs', to: '/e/immigration_cases', icon: ScrollText, module: 'hr', desc: 'Visa & EID expiry tracking' },
      { label: 'Payroll (WPS)', to: '/e/payslips', icon: Banknote, module: 'hr', desc: 'MOHRE WPS salary slips' },
      { label: 'Broker Leaderboard', to: '/agents', icon: Trophy, module: 'sales', desc: 'Top performing advisors' },
    ],
  },
  {
    key: 'field',
    label: 'Field GPS Services',
    items: [
      { label: 'Field Duty GPS', to: '/field-duty', icon: Navigation, isNew: true, desc: 'Live field viewing GPS, visit check-in & SOS' },
      { label: 'Live Field GPS Map', to: '/field-live', icon: MapPinned, module: 'admin', isNew: true, desc: 'Leadership · Real-time map of all active field staff' },
      { label: 'Field Visits Log', to: '/e/field_sessions', icon: MapPinned, module: 'hr', desc: 'History of verified GPS site visits' },
      { label: 'Reception QR Check-In', to: '/reception-qr', icon: QrCode, desc: 'Office Wi-Fi & reception QR terminal' },
      { label: 'Daily Reports', to: '/e/daily_reports', icon: ClipboardCheck, module: 'hr', desc: 'Mandatory end-of-day staff summary' },
    ],
  },
  {
    key: 'ai_lab',
    label: 'AI Case-Study Lab',
    items: [
      { label: 'Case-Study Training Lab', to: '/ai-training', icon: Brain, module: 'ai', isNew: true, desc: 'Train & query real Dubai deal & mortgage scenarios' },
      { label: 'SWK AI Assistant', to: '/ai', icon: Sparkles, module: 'ai', desc: 'AI Copilot connected to trained case studies' },
    ],
  },
  {
    key: 'tools',
    label: 'Utilities & Documents',
    items: [
      { label: 'Utility Suite Hub', to: '/utilities', icon: Wrench, isNew: true, desc: 'Word Studio, PDF/OCR, Translator & Search' },
      { label: 'Word Studio (.docx)', to: '/utilities/word', icon: FileCode2, desc: 'Letterhead, Owner seal & PDF/.docx export' },
      { label: 'Letter Studio Templates', to: '/studio', icon: FileCode2, module: 'documents', desc: '160+ RERA forms & executive templates' },
      { label: 'Document Tools & OCR', to: '/document-tools', icon: ScanText, module: 'documents', desc: 'Emirates ID / Passport OCR, merge, split & watermark' },
      { label: 'Translator (9 Langs)', to: '/utilities/translator', icon: Languages, desc: 'UAE real-estate glossary translator' },
      { label: 'Calculators & QR', to: '/toolkit', icon: Calculator, desc: 'DLD fee, ROI, mortgage & PDC calculators' },
      { label: 'Unified Search', to: '/utilities/search', icon: Search, desc: 'Search OS, website & live market' },
      { label: 'Mobile Apps (Android & iOS)', to: '/mobile-apps', icon: QrCode, isNew: true, desc: 'Install Android APK, iOS App & download 8K SWK logo kit' },
    ],
  },
  {
    key: 'admin',
    label: 'Settings',
    items: [
      { label: 'Company & Wi-Fi Settings', to: '/admin/settings', icon: Settings, module: 'admin', desc: 'Logo, seal, Al Saqr Wi-Fi & company details' },
      { label: 'Office Branches & Geofence', to: '/e/branches', icon: Building, module: 'admin', desc: 'Registered Dubai office & GPS perimeter' },
      { label: 'Roles & Permissions', to: '/admin/roles', icon: ShieldHalf, module: 'admin', desc: 'Hardcoded RBAC & access controls' },
      { label: 'Connections & Webhooks', to: '/admin/integrations', icon: Plug, module: 'admin', desc: 'Website webhook, WhatsApp, email & portals' },
      { label: 'Master Excel & Daily Backups', to: '/admin/backup', icon: DatabaseBackup, module: 'admin', isNew: true, desc: 'Download all OS data as Excel (.xlsx) & automatic daily backups' },
      { label: 'Audit Trail', to: '/admin/audit', icon: History, module: 'admin', desc: 'Immutable record change log' },
      { label: 'Activity Log', to: '/e/audit_events', icon: History, module: 'admin', desc: 'Security event history' },
    ],
  },
]

export const QUICK_CREATE: { label: string; desc: string; to: string; icon: LucideIcon; module: string }[] = [
  { label: 'New Lead', desc: 'Log a buyer or tenant enquiry', to: '/e/leads?new=1', icon: UserPlus, module: 'crm' },
  { label: 'New Deal File', desc: 'Start a 12-stage property deal', to: '/e/jobs?new=1', icon: Briefcase, module: 'sales' },
  { label: 'New Mortgage Case', desc: 'Open a bank mortgage / valuation file', to: '/e/mortgage_cases?new=1', icon: DevIcon, module: 'crm' },
  { label: 'Book Viewing', desc: 'Schedule a GPS-tracked viewing', to: '/e/viewings?new=1', icon: CalendarCheck, module: 'mandates' },
  { label: 'Submit Project', desc: 'Add a project (e.g. Shahrukhz by Danube)', to: '/e/properties?new=1', icon: Building2, module: 'properties' },
  { label: 'New Lease (Ejari)', desc: 'Create a tenancy contract', to: '/e/leases?new=1', icon: KeyRound, module: 'leases' },
  { label: 'Daily Report', desc: 'Submit today’s work summary', to: '/e/daily_reports?new=1', icon: ClipboardCheck, module: 'hr' },
]

export function findNav(pathname: string) {
  let best: { section: NavSection; item: NavItem } | null = null
  for (const section of SWK_NAV)
    for (const item of section.items) {
      const p = item.to.split('?')[0]
      if (pathname === p || pathname.startsWith(p + '/')) if (!best || p.length > best.item.to.length) best = { section, item }
    }
  return best
}

export type AppTone = 'navy' | 'champ' | 'oasis' | 'ocean' | 'dune' | 'plum'
export const APP_META: Record<string, { blurb: string; icon: LucideIcon; tone: AppTone }> = {
  messages: { blurb: 'Team chats, attendance check-in group & broadcasts', icon: MessageCircleMore, tone: 'oasis' },
  work: { blurb: 'My tasks today, team task monitor, projects & automations', icon: SquareCheckBig, tone: 'champ' },
  phone: { blurb: 'WebRTC SIP extension, directory & Masked Vault calling', icon: PhoneCall, tone: 'dune' },
  shabib_corner: { blurb: 'Privacy Fast Track, Immediate Cash, Bulk AI, Approvals & Ledger', icon: Crown, tone: 'champ' },
  command: { blurb: 'Live 12-stage counts, alerts, attendance, tasks & GPS radar', icon: Radio, tone: 'navy' },
  dashboard: { blurb: 'Executive KPIs, 12-stage funnel, tasks & Dubai Market Pulse', icon: Gauge, tone: 'ocean' },
  master_log: { blurb: '20 CORE headquarters registries + Office Admin approval gate', icon: Database, tone: 'champ' },
  pipeline: { blurb: '12-stage Kanban from Inventory to Final Closure & Gold Rush', icon: KanbanSquare, tone: 'oasis' },
  clients: { blurb: 'Leads, assigned clients, CRM Vault, WhatsApp & follow-ups', icon: UsersRound, tone: 'oasis' },
  mortgage_desk: { blurb: 'Schedules, deadlines, valuations, Bank RMs & CBUAE calculator', icon: DevIcon, tone: 'plum' },
  sales: { blurb: 'Deal files, Form A/F, viewings, offers, NOC, DLD & leasing', icon: Handshake, tone: 'champ' },
  vault: { blurb: 'Per-client 13-doc compliance vault (Passport, EID, Form F, NOC)', icon: FolderLock, tone: 'navy' },
  finance: { blurb: 'Tax invoices, receipts, 50/50 commissions, VAT 201 & P&L', icon: Wallet, tone: 'oasis' },
  compliance: { blurb: 'KYC checks, RERA Trakheesi, goAML, licences & broker BRNs', icon: ShieldCheck, tone: 'dune' },
  website: { blurb: 'Two-way swkpropertiesuae.com listings, offers, updates & social', icon: Globe, tone: 'oasis' },
  team: { blurb: 'Staff directory, Meenakshi QR reception, visas, leave & WPS', icon: Contact, tone: 'ocean' },
  field: { blurb: 'Live Field Duty GPS tracking, visit check-ins & SOS radar', icon: MapPinned, tone: 'champ' },
  ai_lab: { blurb: 'Trained Dubai brokerage & mortgage case studies + AI Copilot', icon: Brain, tone: 'plum' },
  tools: { blurb: 'Word Studio, 160+ templates, OCR, translator & calculators', icon: Wrench, tone: 'plum' },
  admin: { blurb: 'Al Saqr Wi-Fi lock, geofence, roles, webhooks & backups', icon: Settings2, tone: 'navy' },
}

export type LauncherApp = { key: string; label: string; blurb: string; icon: LucideIcon; tone: AppTone; items: NavItem[]; landing: string }

export const RESTRICTED_STAFF_LAUNCHER_APPS: LauncherApp[] = [
  {
    key: 'messages',
    label: 'SWK Inside',
    blurb: 'Team chats, live check-in updates & broadcasts',
    icon: MessageCircleMore,
    tone: 'oasis',
    landing: '/chat',
    items: [{ label: 'SWK Inside Messenger', to: '/chat', icon: MessagesSquare, desc: 'Team chats, groups & announcements' }],
  },
  {
    key: 'phone',
    label: 'SWK Phone',
    blurb: 'SIP softphone extension, directory & Masked Vault calling',
    icon: PhoneCall,
    tone: 'dune',
    landing: '/phone',
    items: [{ label: 'SWK Phone & Dialer', to: '/phone', icon: PhoneCall, desc: 'SIP extension & Masked Vault calling' }],
  },
  {
    key: 'attendance',
    label: 'Attendance & Field GPS',
    blurb: 'Office QR check-in, Field Duty GPS, attendance history & daily reports',
    icon: Clock,
    tone: 'champ',
    landing: '/reception-qr',
    items: [
      { label: 'Scan & Check-In Attendance', to: '/reception-qr', icon: QrCode, desc: 'Daily office attendance check-in' },
      { label: 'Field Duty GPS', to: '/field-duty', icon: Navigation, isNew: true, desc: 'Start field viewing GPS, own trail & SOS alert' },
      { label: 'My Attendance Log', to: '/e/attendance', icon: Clock, module: 'hr', desc: 'Personal daily check-in history' },
      { label: 'Leave Requests', to: '/e/leave_requests', icon: Plane, module: 'hr', desc: 'Apply for holiday or sick leave' },
      { label: 'Daily Work Summary', to: '/e/daily_reports', icon: ClipboardCheck, module: 'hr', desc: 'End-of-day activity report' },
    ],
  },
  {
    key: 'tools',
    label: 'Utilities & Documents',
    blurb: 'Word Studio, Translator, Unified Search & UAE deal calculators',
    icon: Wrench,
    tone: 'navy',
    landing: '/utilities',
    items: [
      { label: 'Utility Suite Hub', to: '/utilities', icon: Wrench, isNew: true, desc: 'All personal productivity & real-estate tools' },
      { label: 'Word Studio (.docx)', to: '/utilities/word', icon: FileCode2, desc: 'Draft, edit & export .docx or .pdf documents' },
      { label: 'Translator (9 Langs)', to: '/utilities/translator', icon: Languages, desc: 'RERA/DLD glossary translation' },
      { label: 'Unified Search', to: '/utilities/search', icon: Search, desc: 'Search permitted records & market' },
      { label: 'Deal Calculators & QR', to: '/toolkit', icon: Calculator, desc: 'DLD fee, ROI, mortgage & PDC calculators' },
      { label: 'Mobile Apps (Android & iOS)', to: '/mobile-apps', icon: QrCode, isNew: true, desc: 'Install Android APK, iOS App & 8K logo assets' },
    ],
  },
  {
    key: 'market_pulse',
    label: 'Market Pulse',
    blurb: 'Live Dubai community prices, rental yields & developers',
    icon: LineChart,
    tone: 'oasis',
    landing: '/market',
    items: [
      { label: 'Market Pulse Live', to: '/market', icon: LineChart, desc: 'Dubai community prices & gross yields' },
      { label: 'Dubai Communities', to: '/e/communities', icon: Map, module: 'masters', desc: 'Prime Dubai districts' },
      { label: 'Master Developers', to: '/e/developers', icon: DevIcon, module: 'masters', desc: 'Emaar, Nakheel, Sobha, DAMAC & more' },
    ],
  },
  {
    key: 'general',
    label: 'My Assigned Deals',
    blurb: 'Assigned deals, AI Assistant, calendar & team profiles',
    icon: Briefcase,
    tone: 'ocean',
    landing: '/my-deals',
    items: [
      { label: 'My Assigned Deals', to: '/my-deals', icon: Briefcase, isNew: true, desc: 'Assigned properties & hard-masked calling' },
      { label: 'AI Assistant', to: '/ai', icon: Sparkles, module: 'ai', desc: 'Internal SWK AI assistant' },
      { label: 'Calendar', to: '/calendar', icon: CalendarDays, desc: 'Company schedule & events' },
      { label: 'Team Profiles', to: '/team', icon: Contact, desc: 'Colleagues & extensions' },
    ],
  },
]

export type NavAccessUser = {
  id?: number | null
  email?: string | null
  name?: string | null
  role?: string | null
  role_name?: string | null
  party_id?: number | null
  permissions?: any
} | null | undefined

export function isAdminOnlyItem(item: NavItem): boolean {
  const clean = item.to.split('?')[0] || ''
  return (
    item.module === 'admin' ||
    clean.startsWith('/admin') ||
    clean === '/recycle-bin' ||
    clean === '/withdrawals' ||
    clean === '/approvals' ||
    clean === '/e/universal_approvals' ||
    clean === '/enterprise/master-os' ||
    clean === '/crm-vault' ||
    clean === '/field-live'
  )
}

export function isNavItemVisible(
  item: NavItem,
  can: (module: string, action?: 'view') => boolean,
  user?: NavAccessUser,
): boolean {
  if (!user || user.party_id) return false
  const clean = item.to.split('?')[0] || ''
  if (clean === '/shabibs-corner') return canAccessShabibsCorner(user)
  if (clean === '/master-log') return canAccessMasterLog(user)
  if (clean === '/command-center') return canAccessSwkAdminLogic(user) || canPrintReceptionQr(user)
  if (clean === '/crm-vault' && !canAccessCrmVault(user)) return false
  if (clean === '/field-live' && !canAccessFieldLiveMap(user)) return false
  if ((clean === '/studio' || clean === '/e/doc_templates') && !canAccessDocumentTemplates(user)) return false
  const adminOk = canAccessSwkAdminLogic(user)
  if (!adminOk && isAdminOnlyItem(item)) return false
  if (item.module && !can(item.module, 'view')) return false
  if (isRestrictedStaffUser(user) && !isAllowedPathForRestrictedStaff(clean)) return false
  return true
}

/** Permission-filtered apps for the launcher. An app is hidden when none of its features are permitted. */
export function launcherApps(can: (module: string, action?: 'view') => boolean, user?: NavAccessUser): LauncherApp[] {
  if (user && isRestrictedStaffUser(user)) {
    return RESTRICTED_STAFF_LAUNCHER_APPS
      .map(app => {
        const items = app.items.filter(i => (!i.module || can(i.module, 'view')) && isAllowedPathForRestrictedStaff(i.to.split('?')[0] || ''))
        return items.length ? { ...app, items, landing: items[0]!.to } : null
      })
      .filter((app): app is LauncherApp => Boolean(app))
  }
  const out: LauncherApp[] = []
  for (const s of SWK_NAV) {
    if (s.key === 'shabib_corner' && !canAccessShabibsCorner(user)) continue
    if (s.key === 'master_log' && !canAccessMasterLog(user)) continue
    if (s.key === 'admin' && !canAccessSwkAdminLogic(user)) continue
    const items = s.items.filter(i => isNavItemVisible(i, can, user))
    const meta = APP_META[s.key]
    if (!items.length || !meta) continue
    out.push({ key: s.key, label: s.label, ...meta, items, landing: items[0]!.to })
  }
  return out
}

const RECENT_KEY = 'swk.recent'
export function rememberVisit(pathname: string) {
  const hit = findNav(pathname)
  if (!hit) return
  try {
    const list: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    localStorage.setItem(RECENT_KEY, JSON.stringify([hit.item.to, ...list.filter(t => t !== hit.item.to)].slice(0, 8)))
  } catch { /* ignore */ }
}
export function recentItems(can: (module: string, action?: 'view') => boolean, limit = 4, user?: NavAccessUser): (NavItem & { section: string })[] {
  let list: string[] = []
  try { list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { /* ignore */ }
  const all = SWK_NAV.flatMap(s => s.items.map(i => ({ ...i, section: s.label })))
  return list
    .map(to => all.find(i => i.to === to))
    .filter((i): i is NavItem & { section: string } => Boolean(i && isNavItemVisible(i, can, user)))
    .slice(0, limit)
}
