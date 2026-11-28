import { Navigate,Route,Routes,useLocation,useParams,Link } from 'react-router-dom'
import { Suspense,lazy,useCallback,useState,type ReactNode } from 'react'
import { useMeta } from './lib/meta'
import { canAccessSwkAdminLogic,canAccessMasterLog,canAccessShabibsCorner,canPrintReceptionQr,canAccessCrmVault,canAccessDocumentTemplates,canAccessFieldLiveMap,isRestrictedStaffUser,isAllowedPathForRestrictedStaff } from '@shared/swk-staff-access'
import { Shell } from './components/Shell'
import { BrandSplashScreen } from './components/BrandSplashScreen'
import { Login } from './pages/Login'
import { Launcher } from './pages/Launcher'
import { Loading,ErrorBox } from './ui/kit'

// Core workspace pages (code-split for instant mobile & Android WebView boot)
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const EmailPage = lazy(() => import('./pages/EmailPage'))
const Workspaces = lazy(() => import('./pages/Workspaces').then(m => ({ default: m.Workspaces })))
const WorkspaceUtilities = lazy(() => import('./pages/Workspaces').then(m => ({ default: m.WorkspaceUtilities })))
const EntityListPage = lazy(() => import('./pages/EntityPages').then(m => ({ default: m.EntityListPage })))
const EntityRecordPage = lazy(() => import('./pages/EntityPages').then(m => ({ default: m.EntityRecordPage })))
const CalendarPage = lazy(() => import('./pages/CalendarPage').then(m => ({ default: m.CalendarPage })))
const ReportsPage = lazy(() => import('./pages/ReportPages').then(m => ({ default: m.ReportsPage })))
const ToolsPage = lazy(() => import('./pages/ToolsPage').then(m => ({ default: m.ToolsPage })))
const DocumentsPage = lazy(() => import('./pages/DocumentsPage').then(m => ({ default: m.DocumentsPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })))
const RolesPage = lazy(() => import('./pages/AdminPages').then(m => ({ default: m.RolesPage })))
const SettingsPage = lazy(() => import('./pages/AdminPages').then(m => ({ default: m.SettingsPage })))
const AuditPage = lazy(() => import('./pages/AdminPages').then(m => ({ default: m.AuditPage })))
const BackupPage = lazy(() => import('./pages/AdminPages').then(m => ({ default: m.BackupPage })))
const CompliancePage = lazy(() => import('./pages/CompliancePage').then(m => ({ default: m.CompliancePage })))
const WorkQueuePage = lazy(() => import('./pages/WorkPages').then(m => ({ default: m.WorkQueuePage })))
const HandoverPage = lazy(() => import('./pages/WorkPages').then(m => ({ default: m.HandoverPage })))
const PublicTrack = lazy(() => import('./pages/PublicTrack').then(m => ({ default: m.PublicTrack })))
const PublicListing = lazy(() => import('./pages/PublicListing').then(m => ({ default: m.PublicListing })))
const PromoterShowcasePage = lazy(() => import('./pages/PromoterShowcasePage').then(m => ({ default: m.PromoterShowcasePage })))
const AcceptInvite = lazy(() => import('./pages/AcceptInvite').then(m => ({ default: m.AcceptInvite })))
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage').then(m => ({ default: m.IntegrationsPage })))
const AiPage = lazy(() => import('./pages/AiPage').then(m => ({ default: m.AiPage })))
const WhatsAppPage = lazy(() => import('./pages/WhatsAppPage').then(m => ({ default: m.WhatsAppPage })))
const ChatPage = lazy(() => import('./pages/ChatPage').then(m => ({ default: m.ChatPage })))
const PortalPage = lazy(() => import('./pages/PortalPage').then(m => ({ default: m.PortalPage })))
const ReceptionDisplayPage = lazy(() => import('./pages/ReceptionDisplayPage').then(m => ({ default: m.ReceptionDisplayPage })))
const InspectList = lazy(() => import('./pages/InspectPage').then(m => ({ default: m.InspectList })))
const InspectPage = lazy(() => import('./pages/InspectPage').then(m => ({ default: m.InspectPage })))
const SmartSearchPage = lazy(() => import('./pages/SmartSearchPage').then(m => ({ default: m.SmartSearchPage })))
const BankImportPage = lazy(() => import('./pages/FinanceExtras').then(m => ({ default: m.BankImportPage })))
const YearEndPage = lazy(() => import('./pages/FinanceExtras').then(m => ({ default: m.YearEndPage })))
const WpsPage = lazy(() => import('./pages/FinanceExtras').then(m => ({ default: m.WpsPage })))
const PrintPage = lazy(() => import('./print/PrintPage').then(m => ({ default: m.PrintPage })))
const StudioHome = lazy(() => import('./pages/StudioPage').then(m => ({ default: m.StudioHome })))
const StudioEditor = lazy(() => import('./pages/StudioPage').then(m => ({ default: m.StudioEditor })))
const NewInvoicePage = lazy(() => import('./pages/NewInvoicePage').then(m => ({ default: m.NewInvoicePage })))

// SWK real-estate modules (code-split)
const MarketPage = lazy(() => import('./pages/swk/MarketPage'))
const ToolkitPage = lazy(() => import('./pages/swk/ToolkitPage'))
const ListingsStudio = lazy(() => import('./pages/swk/ListingsStudio'))
const OffPlanPage = lazy(() => import('./pages/swk/OffPlanPage'))
const PdcVault = lazy(() => import('./pages/swk/PdcVault'))
const PipelinePage = lazy(() => import('./pages/swk/PipelinePage'))
const AgentsPage = lazy(() => import('./pages/swk/AgentsPage'))
const ReraCentre = lazy(() => import('./pages/swk/ReraCentre'))
const Owner360 = lazy(() => import('./pages/swk/Owner360'))
const EnterpriseMasterOsPage = lazy(() => import('./pages/swk/EnterpriseMasterOsPage'))
const ReceptionQrPage = lazy(() => import('./pages/swk/ReceptionQrPage'))
const RecycleBinPage = lazy(() => import('./pages/swk/RecycleBinPage'))
const WithdrawalsPage = lazy(() => import('./pages/swk/WithdrawalsPage'))
const CrmVaultPage = lazy(() => import('./pages/swk/CrmVaultPage'))
const MyAssignedDealsPage = lazy(() => import('./pages/swk/MyAssignedDealsPage'))
const TeamDirectoryPage = lazy(() => import('./pages/swk/TeamPage').then(m => ({ default: m.TeamDirectoryPage })))
const TeamProfilePage = lazy(() => import('./pages/swk/TeamPage').then(m => ({ default: m.TeamProfilePage })))
const WebsiteStudioPage = lazy(() => import('./pages/swk/WebsiteStudioPage'))
const AutomationsPage = lazy(() => import('./pages/swk/AutomationsPage'))
const MyWorkPage = lazy(() => import('./pages/swk/MyWorkPage'))
const DocumentToolsPage = lazy(() => import('./pages/swk/DocumentToolsPage'))
const UtilitiesHubPage = lazy(() => import('./pages/swk/UtilitiesHubPage'))
const WordStudioPage = lazy(() => import('./pages/swk/WordStudioPage'))
const TranslatorPage = lazy(() => import('./pages/swk/TranslatorPage'))
const UnifiedSearchPage = lazy(() => import('./pages/swk/UnifiedSearchPage'))
const PhonePage = lazy(() => import('./pages/swk/PhonePage'))
const FieldDutyPage = lazy(() => import('./pages/swk/FieldDutyPage'))
const FieldLiveMapPage = lazy(() => import('./pages/swk/FieldLiveMapPage'))
const ShabibsCornerPage = lazy(() => import('./pages/swk/ShabibsCornerPage'))
const MasterLogPage = lazy(() => import('./pages/swk/MasterLogPage'))
const CommandCenterPage = lazy(() => import('./pages/swk/CommandCenterPage'))
const ClientDocumentVaultPage = lazy(() => import('./pages/swk/ClientDocumentVaultPage'))
const MortgageDeskPage = lazy(() => import('./pages/swk/MortgageDeskPage'))
const AiCaseStudyPage = lazy(() => import('./pages/swk/AiCaseStudyPage'))
const DubaiAgencyHubPage = lazy(() => import('./pages/swk/DubaiAgencyHubPage'))
const MobileAppsPage = lazy(() => import('./pages/swk/MobileAppsPage'))
const CustomiseUiPage = lazy(() => import('./pages/swk/CustomiseUiPage'))

function Guard({ module, children }: { module: string; children: ReactNode }) {
  const { can, me } = useMeta()
  if (module === 'admin' && !canAccessSwkAdminLogic(me)) {
    return <ErrorBox error={new Error('Administration access is restricted until proper role access is granted by the Owner.')} />
  }
  return can(module, 'view') ? <>{children}</> : <ErrorBox error={new Error('You do not have access to this page. Ask an administrator to grant the permission.')} />
}
function JobAliasRedirect() {
  const { id } = useParams()
  return <Navigate to={id ? `/e/jobs/${id}` : '/e/jobs'} replace />
}
/** Staff-only guard: prevents portal accounts from loading internal staff tools and eliminates 403 API probes. */
function StaffGuard({ children }: { children: ReactNode }) {
  const { me } = useMeta()
  if (!me) return <Loading />
  return me.party_id
    ? <ErrorBox error={new Error('This module is restricted to company staff.')} />
    : <>{children}</>
}
/** The reception code screen exists only for Owner, Admin and Haseeb: everyone else is sent home and never loads the page code. */
function QrGuard({ children }: { children: ReactNode }) {
  const { me } = useMeta()
  if (!me) return <Loading />
  return canPrintReceptionQr(me) ? <>{children}</> : <Navigate to="/home" replace />
}
function CrmVaultGuard({ children }: { children: ReactNode }) {
  const { me } = useMeta()
  if (!me) return <Loading />
  return canAccessCrmVault(me) ? <>{children}</> : <ErrorBox error={new Error('CRM Property Vault is restricted exclusively to Owner Shabib, Admin, and Operations Manager Haseeb.')} />
}
/** Live Field GPS Map is restricted strictly to the 3 canonical elevated accounts via canAccessFieldLiveMap. */
function FieldLiveGuard({ children }: { children: ReactNode }) {
  const { me } = useMeta()
  if (!me) return <Loading />
  return canAccessFieldLiveMap(me)
    ? <>{children}</>
    : <ErrorBox error={new Error('Live Field GPS Map is restricted exclusively to Owner Shabib, Admin, and Operations Manager Haseeb.')} />
}
function DocTemplateGuard({ children }: { children: ReactNode }) {
  const { me } = useMeta()
  if (!me) return <Loading />
  return canAccessDocumentTemplates(me)
    ? <>{children}</>
    : <ErrorBox error={new Error('Document Templates & Letter Studio are restricted strictly to Owner, Admin, HR, and Office Admin.')} />
}
function OwnerOnlyGuard({ children }: { children: ReactNode }) {
  const { me } = useMeta()
  if (!me) return <Loading />
  return canAccessShabibsCorner(me)
    ? <>{children}</>
    : <ErrorBox error={new Error("Shabib's Corner & Privacy Fast Track are locked exclusively to Owner Shabib Siraj.")} />
}
function MasterLogGuard({ children }: { children: ReactNode }) {
  const { me } = useMeta()
  if (!me) return <Loading />
  return canAccessMasterLog(me)
    ? <>{children}</>
    : <ErrorBox error={new Error('Master Log (CORE) is restricted exclusively to Owner Shabib, System Admin, and Office Admin.')} />
}
const Statements = () => <ReportsPage fixed={['trial_balance', 'profit_loss', 'balance_sheet', 'general_ledger', 'vat_return', 'ar_aging', 'ap_aging', 'tax_invoice_register']} />

export default function App() {
  const { me, loading } = useMeta()
  const loc = useLocation()
  const defaultLanding = '/home'
  const [showSplash, setShowSplash] = useState(() => {
    if (typeof window === 'undefined') return false
    // Native Android/iOS already renders a hardware SplashScreen; skip the secondary web splash for instant boot
    if ((window as any).Capacitor?.isNativePlatform?.() || (window as any).__SWK_CONFIG__?.MOBILE_SHELL) return false
    if (loc.pathname.startsWith('/l/') || loc.pathname.startsWith('/p/') || loc.pathname.startsWith('/t/') || loc.pathname.startsWith('/print/')) return false
    try {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
      if (sessionStorage.getItem('swk.splash.shown') === '1') return false
    } catch { /* ignore storage restrictions */ }
    return true
  })
  const handleSplashDone = useCallback(() => {
    try { sessionStorage.setItem('swk.splash.shown', '1') } catch { /* ignore */ }
    setShowSplash(false)
  }, [])
  if (loc.pathname === '/accept-invite') return <Suspense fallback={<Loading />}><AcceptInvite /></Suspense>
  if (loc.pathname.startsWith('/t/')) return <Suspense fallback={<Loading />}><Routes><Route path="/t/:token" element={<PublicTrack />} /></Routes></Suspense>
  if (loc.pathname.startsWith('/l/')) return <Suspense fallback={<Loading />}><Routes><Route path="/l/:token" element={<PublicListing />} /></Routes></Suspense>
  if (loc.pathname.startsWith('/p/')) return <Suspense fallback={<Loading />}><Routes><Route path="/p/:slug" element={<PromoterShowcasePage />} /></Routes></Suspense>
  const isStandaloneReceptionQr =
    loc.pathname === '/qr-checkin' ||
    loc.pathname.startsWith('/qr-checkin/') ||
    loc.pathname === '/reception-qr' ||
    loc.pathname.startsWith('/reception-qr/') ||
    loc.pathname === '/swk/reception-qr' ||
    loc.pathname.startsWith('/swk/reception-qr/') ||
    loc.pathname === '/qr-reception' ||
    loc.pathname.startsWith('/qr-reception/')
  if (isStandaloneReceptionQr) {
    return (
      <Suspense fallback={<div className="h-full grid place-items-center bg-[#0b2027] text-white"><Loading label="Starting Standalone Reception QR Terminal…" /></div>}>
        <ReceptionQrPage />
      </Suspense>
    )
  }
  if (showSplash) return <BrandSplashScreen ready={!loading} onDone={handleSplashDone} />
  if (loading) return <div className="h-full grid place-items-center"><Loading label="Starting SWK OS…" /></div>
  if (!me) return <Routes><Route path="/login" element={<Login />} /><Route path="*" element={<Navigate to="/login" replace state={{ from: loc.pathname }} />} /></Routes>
  if (me.mustChangePassword && !loc.pathname.startsWith('/profile') && !loc.pathname.startsWith('/print')) return <Navigate to="/profile" replace />
  if (isRestrictedStaffUser(me) && !isAllowedPathForRestrictedStaff(loc.pathname)) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<Shell />}>
            <Route
              path="*"
              element={
                <div className="max-w-2xl mx-auto my-12 p-8 rounded-2xl border border-[#8a621c]/40 bg-[#0f2a33] text-white shadow-xl">
                  <div className="text-xs font-extrabold uppercase tracking-widest text-[#f8f5ef] mb-2">
                    Staff Access Policy · SWK Properties OS
                  </div>
                  <h2 className="text-xl font-bold mb-2 !text-white">Restricted Module — Attendance, Manual, Market Pulse &amp; General Only</h2>
                  <p className="text-sm text-slate-300 leading-relaxed mb-6">
                    Signed in as <b>{me.name}</b> (<code className="text-[#f8f5ef]">{me.email}</code>). Per company security policy, full OS operational modules are restricted exclusively to <b>Owner Shabib Siraj (shabib@swk.properties)</b>, <b>Full-Access Admin (admin@swk.properties)</b>, and <b>Mohammad Haseeb (haseeb@swk.properties)</b>. Your account is authorised for <b>Attendance &amp; QR Check-In</b>, <b>Company Manual</b>, <b>Market Pulse</b>, and <b>General Workspace</b>.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Link to="/reception-qr?scan=1" className="px-4 py-2.5 rounded-xl bg-[#8a621c] text-white font-bold text-xs no-underline">
                      Scan &amp; Check In Attendance
                    </Link>
                    <Link to="/market" className="px-4 py-2.5 rounded-xl bg-white/10 text-white font-bold text-xs no-underline border border-white/15">
                      Market Pulse
                    </Link>
                    <Link to="/home" className="px-4 py-2.5 rounded-xl bg-white/10 text-white font-bold text-xs no-underline border border-white/15">
                      All Apps
                    </Link>
                  </div>
                </div>
              }
            />
          </Route>
        </Routes>
      </Suspense>
    )
  }
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Navigate to={defaultLanding} replace />} />
        <Route element={<Shell />}>
          <Route index element={<Navigate to={defaultLanding} replace />} />
          <Route path="/home" element={<Launcher />} />
          <Route path="/shabibs-corner" element={<OwnerOnlyGuard><ShabibsCornerPage /></OwnerOnlyGuard>} />
          <Route path="/master-log" element={<MasterLogGuard><MasterLogPage /></MasterLogGuard>} />
          <Route path="/command-center" element={<StaffGuard><CommandCenterPage /></StaffGuard>} />
          <Route path="/client-vault" element={<Guard module="documents"><ClientDocumentVaultPage /></Guard>} />
          <Route path="/mortgage-desk" element={<Guard module="crm"><MortgageDeskPage /></Guard>} />
          <Route path="/ai-training" element={<Guard module="ai"><AiCaseStudyPage /></Guard>} />
          <Route path="/dubai-agency-hub" element={<Guard module="properties"><DubaiAgencyHubPage /></Guard>} />
          <Route path="/mobile-apps" element={<StaffGuard><MobileAppsPage /></StaffGuard>} />
          <Route path="/customise-ui" element={<CustomiseUiPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/enterprise/master-os" element={<Guard module="admin"><EnterpriseMasterOsPage /></Guard>} />
          <Route path="/reception-qr" element={<ReceptionQrPage />} />
          <Route path="/reception-display" element={<QrGuard><ReceptionDisplayPage /></QrGuard>} />
          <Route path="/recycle-bin" element={<Guard module="admin"><RecycleBinPage /></Guard>} />
          <Route path="/withdrawals" element={<Guard module="admin"><WithdrawalsPage /></Guard>} />
          <Route path="/crm-vault" element={<CrmVaultGuard><CrmVaultPage /></CrmVaultGuard>} />
          <Route path="/my-deals" element={<StaffGuard><MyAssignedDealsPage /></StaffGuard>} />
          <Route path="/utilities" element={<StaffGuard><UtilitiesHubPage /></StaffGuard>} />
          <Route path="/utilities/word" element={<StaffGuard><WordStudioPage /></StaffGuard>} />
          <Route path="/utilities/translator" element={<StaffGuard><TranslatorPage /></StaffGuard>} />
          <Route path="/utilities/search" element={<StaffGuard><UnifiedSearchPage /></StaffGuard>} />
          <Route path="/phone" element={<StaffGuard><PhonePage /></StaffGuard>} />
          <Route path="/field-duty" element={<StaffGuard><FieldDutyPage /></StaffGuard>} />
          <Route path="/field-live" element={<FieldLiveGuard><FieldLiveMapPage /></FieldLiveGuard>} />
          <Route path="/document-tools" element={<Guard module="documents"><DocumentToolsPage /></Guard>} />
          <Route path="/my-work" element={<Guard module="projects"><MyWorkPage /></Guard>} />
          <Route path="/automations" element={<Guard module="admin"><AutomationsPage /></Guard>} />
          <Route path="/team" element={<TeamDirectoryPage />} />
          <Route path="/team/:slug" element={<TeamProfilePage />} />
          <Route path="/website" element={<Guard module="website"><WebsiteStudioPage /></Guard>} />
          <Route path="/workspaces" element={<Workspaces />} />
          <Route path="/market" element={<MarketPage />} />
          <Route path="/toolkit" element={<ToolkitPage />} />
          <Route path="/listings" element={<Guard module="properties"><ListingsStudio /></Guard>} />
          <Route path="/offplan" element={<Guard module="properties"><OffPlanPage /></Guard>} />
          <Route path="/pdc" element={<Guard module="leases"><PdcVault /></Guard>} />
          <Route path="/pipeline" element={<Guard module="sales"><PipelinePage /></Guard>} />
          <Route path="/agents" element={<Guard module="hr"><AgentsPage /></Guard>} />
          <Route path="/rera" element={<Guard module="compliance"><ReraCentre /></Guard>} />
          <Route path="/owners" element={<Guard module="finance"><Owner360 /></Guard>} />
          <Route path="/workspace/:workspace" element={<Workspaces key={loc.pathname} />} />
          <Route path="/workspace-tools" element={<WorkspaceUtilities />} />
          <Route path="/e/:entity" element={<EntityListPage />} />
          <Route path="/e/:entity/:id" element={<EntityRecordPage />} />
          <Route path="/jobs/:id" element={<JobAliasRedirect />} />
          <Route path="/work/queues" element={<Guard module="projects"><WorkQueuePage /></Guard>} />
          <Route path="/work/handovers" element={<Guard module="projects"><HandoverPage /></Guard>} />
          <Route path="/email" element={<EmailPage />} />
          <Route path="/smart-search" element={<Guard module="properties"><SmartSearchPage /></Guard>} />
          <Route path="/portal" element={<PortalPage />} />
          <Route path="/inspect" element={<Guard module="leases"><InspectList /></Guard>} />
          <Route path="/inspect/:id" element={<Guard module="leases"><InspectPage /></Guard>} />
          <Route path="/chat" element={<StaffGuard><ChatPage /></StaffGuard>} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/reports" element={<Guard module="reports"><ReportsPage /></Guard>} />
          <Route path="/finance/statements" element={<Guard module="finance"><Statements /></Guard>} />
          <Route path="/studio" element={<DocTemplateGuard><Guard module="documents"><StudioHome /></Guard></DocTemplateGuard>} />
          <Route path="/studio/:id" element={<DocTemplateGuard><Guard module="documents"><StudioEditor /></Guard></DocTemplateGuard>} />
          <Route path="/finance/new-invoice" element={<Guard module="finance"><NewInvoicePage /></Guard>} />
          <Route path="/documents" element={<Guard module="documents"><DocumentsPage /></Guard>} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin/roles" element={<Guard module="admin"><RolesPage /></Guard>} />
          <Route path="/settings" element={<Navigate to="/admin/settings" replace />} />
          <Route path="/admin/settings" element={<Guard module="admin"><SettingsPage /></Guard>} />
          <Route path="/admin/audit" element={<Guard module="admin"><AuditPage /></Guard>} />
          <Route path="/admin/integrations" element={<Guard module="admin"><IntegrationsPage /></Guard>} />
          <Route path="/ai" element={<Guard module="ai"><AiPage /></Guard>} />
          <Route path="/whatsapp" element={<Guard module="crm"><WhatsAppPage /></Guard>} />
          <Route path="/finance/bank-import" element={<Guard module="finance"><BankImportPage /></Guard>} />
          <Route path="/finance/year-end" element={<Guard module="finance"><YearEndPage /></Guard>} />
          <Route path="/hr/wps" element={<Guard module="hr"><WpsPage /></Guard>} />
          <Route path="/compliance" element={<Guard module="compliance"><CompliancePage /></Guard>} />
          <Route path="/admin/backup" element={<Guard module="admin"><BackupPage /></Guard>} />
          <Route path="/print/:entity/:id" element={<PrintPage />} />
          <Route path="*" element={<ErrorBox error={new Error('Page not found')} />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
void lazy
