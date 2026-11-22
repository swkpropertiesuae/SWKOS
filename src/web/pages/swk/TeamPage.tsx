import { useMemo,useState } from 'react'
import { Link,useParams } from 'react-router-dom'
import { ArrowLeft,ArrowUpRight,Mail,Phone,Globe,ShieldCheck,Languages,Building2,Star,Briefcase } from 'lucide-react'
import { useMeta } from '../../lib/meta'
import { ProfileCard,ProfileAvatar } from '../../components/ui/profile-card'
import { SWK_TEAM_PROFILES,teamProfileBySlug,type SwkTeamProfile } from '@shared/swk-team-profiles'
import { SWK_STAFF_ACCOUNTS,canViewEmployeeRecords } from '@shared/swk-staff-access'

const WEBSITE = 'https://www.swkpropertiesuae.com'

/** What each OS role can open, in plain words (mirrors the role permissions in src/shared/swk-staff-access.ts and the seed). */
const ACCESS_SUMMARY: Record<string, string[]> = {
  Owner: ['Full access to every SWK OS module', 'Final approver for deletions, withdrawals and admin decisions', 'Website inventory, hot offers & deploy'],
  Admin: ['Full access to every SWK OS module', 'Website inventory, hot offers & deploy', 'Operates under Owner supervision'],
  Manager: ['CRM, sales, properties, leases, finance, HR, reports', 'Deletions need Owner approval', 'View-only administration'],
  HR: ['HR & Payroll: employees, leave, attendance, payroll (with approvals)', 'Employee records', 'HR documents, tasks and HR reports'],
  'Office Admin': ['Reception & walk-in enquiries (create leads)', 'Company documents, calendar and tasks', 'Support tickets; own attendance & leave'],
  'Staff (Attendance & General)': ['Attendance check-in, own leave & daily reports', 'Company manual, Market Pulse, calendar and AI assistant', 'Assigned deals only'],
}

const accountOf = (p: SwkTeamProfile) => (p.email ? SWK_STAFF_ACCOUNTS.find(a => a.email === p.email) : undefined)
const titleOf = (p: SwkTeamProfile) => p.title || accountOf(p)?.designation || ''
const websiteSlugOf = (p: SwkTeamProfile) => (p.slug === 'mohammed-islam-rex' ? 'mohammed-islam' : p.slug)

export function TeamDirectoryPage() {
  const [filter, setFilter] = useState<'all' | 'website' | 'office'>('all')
  const rows = useMemo(() => SWK_TEAM_PROFILES.filter(p => filter === 'all' || (filter === 'website' ? p.onWebsite : !p.onWebsite)), [filter])
  return (
    <div className="mx-auto max-w-[1260px]">
      <header className="mb-8">
        <div className="web-eyebrow">SWK Properties · RERA ORN 51517</div>
        <h1 className="web-title">Our team</h1>
        <p className="web-lead">Everyone at the 25th Floor Al Saqr Building desk. Website profiles match swkpropertiesuae.com word for word; office roles show what each person can open in SWK OS.</p>
        <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Filter team">
          {([['all', 'All'], ['website', 'On the website'], ['office', 'Office & management']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={filter === k ? 'web-btn' : 'web-btn light'} style={{ height: 38 }}>{l}</button>
          ))}
        </div>
      </header>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(p => (
          <Link key={p.slug} to={`/team/${p.slug}`} className="block no-underline" aria-label={`${p.name}, ${titleOf(p)}`}>
            <ProfileCard
              className="hoverable h-full"
              name={p.name}
              role={titleOf(p)}
              avatarSrc={p.photo || undefined}
              bio={p.bio ? (p.bio.length > 150 ? p.bio.slice(0, 147).trimEnd() + '…' : p.bio) : undefined}
              badge={accountOf(p) ? <span className="web-pill mint">{accountOf(p)!.roleName === 'Staff (Attendance & General)' ? 'Staff' : accountOf(p)!.roleName}</span> : <span className="web-pill">Website</span>}
              stats={p.deals ? [{ label: 'Track record', value: p.deals.replace(/ (Verified )?Transactions.*$/i, '') }, { label: 'Experience', value: p.experience.split(' ')[0] }] : undefined}
            />
          </Link>
        ))}
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, items }: { icon: typeof Star; title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <section className="web-card p-6">
      <div className="mb-4 flex items-center gap-2"><Icon size={16} className="text-[#0e9f6e]" /><h2 className="m-0 text-[11px] font-medium uppercase tracking-[0.18em] text-[#8b8b8b]">{title}</h2></div>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">{items.map(i => <li key={i} className="rounded-full bg-[#f7f7f7] px-3.5 py-1.5 text-[13px] text-[#121212]">{i}</li>)}</ul>
    </section>
  )
}

export function TeamProfilePage() {
  const { slug = '' } = useParams()
  const { me } = useMeta()
  const p = teamProfileBySlug(slug)
  if (!p) return <div className="web-card mx-auto max-w-xl p-10 text-center"><h1 className="web-title">Profile not found</h1><Link to="/team" className="web-btn mt-6">Back to team</Link></div>
  const acc = accountOf(p)
  const showContact = canViewEmployeeRecords(me) || me?.email?.toLowerCase() === p.email
  const access = acc ? ACCESS_SUMMARY[acc.roleName] ?? [] : []
  const links = [
    ...(showContact && acc ? [{ label: 'Email', href: `mailto:${acc.displayEmail}`, icon: Mail }, { label: 'Phone', href: `tel:${acc.phone.replace(/\s/g, '')}`, icon: Phone }] : []),
    ...(p.onWebsite ? [{ label: 'Website profile', href: `${WEBSITE}/agents/${websiteSlugOf(p)}`, icon: Globe }] : []),
  ]
  return (
    <div className="mx-auto max-w-[1260px]">
      <Link to="/team" className="mb-6 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-[#4a4a4a] no-underline hover:text-[#0e9f6e]"><ArrowLeft size={14} /> All team</Link>
      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <ProfileCard
            headingLevel="h1"
            name={p.name}
            role={titleOf(p)}
            avatarSrc={p.photo || undefined}
            bio={p.bio}
            badge={acc && <span className="web-pill mint">{acc.roleName === 'Staff (Attendance & General)' ? 'Staff' : acc.roleName}</span>}
            stats={p.deals ? [{ label: 'Track record', value: p.deals.replace(/ (Verified )?Transactions.*$/i, '') }, { label: 'Experience', value: p.experience.split(' ')[0] }] : undefined}
            links={links}
            primaryAction={p.onWebsite ? <a href={`${WEBSITE}/agents/${websiteSlugOf(p)}`} target="_blank" rel="noopener noreferrer" className="web-btn">View on website <ArrowUpRight size={14} /></a> : undefined}
          />
        </div>
        <div className="flex flex-col gap-5">
          <section className="web-card flex flex-wrap items-center gap-5 p-6">
            <ProfileAvatar name={p.name} src={p.photo || undefined} size="md" />
            <div className="min-w-0 flex-1">
              <div className="web-eyebrow">SWK OS account</div>
              <div className="mt-1 text-[15px] font-medium text-[#121212]">{acc ? `${acc.designation} · ${acc.empNo}` : 'Website profile only (no OS sign-in yet)'}</div>
              {showContact && acc && <div className="mt-1 text-[13px] text-[#4a4a4a]">{acc.displayEmail} · {acc.phone}</div>}
            </div>
            {p.experience && <div className="text-right"><div className="web-stat">{p.experience.split(' ')[0]}</div><div className="mt-1 text-[11px] text-[#8b8b8b]">{p.experience.split(' ').slice(1).join(' ')}</div></div>}
          </section>
          {access.length > 0 && (
            <section className="web-card p-6">
              <div className="mb-4 flex items-center gap-2"><ShieldCheck size={16} className="text-[#0e9f6e]" /><h2 className="m-0 text-[11px] font-medium uppercase tracking-[0.18em] text-[#8b8b8b]">Role access · {acc!.roleName}</h2></div>
              <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">{access.map(a => <li key={a} className="rounded-xl border border-[#e5e5e5] px-4 py-3 text-[13.5px] text-[#121212]">{a}</li>)}</ul>
            </section>
          )}
          <Section icon={Star} title="Specialties" items={p.specialties} />
          <Section icon={Building2} title="Top developers" items={p.developers} />
          <Section icon={Briefcase} title="Key projects" items={p.projects} />
          <Section icon={Languages} title="Languages" items={p.languages} />
        </div>
      </div>
    </div>
  )
}

export default TeamDirectoryPage
