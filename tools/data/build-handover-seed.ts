import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import readXlsxFile from 'read-excel-file/node'
import { SWK_STAFF_ACCOUNTS } from '../../src/shared/swk-staff-access'
import type { RawVaultPropertyInput } from '../../src/server/domain/crm-vault'
import type { HandoverDocMeta } from '../../src/server/domain/handover'

/**
 * Builds data-seed/swk-handover.enc.bin: the Ejari 0–60D dialer leads (all 7 desks) plus the staff playbooks,
 * field guides, calling booklets and dialer workbooks, encrypted with AES-256-GCM.
 * The file holds no readable name or phone number without SWK_HANDOVER_KEY.
 *
 * Usage: SWK_HANDOVER_KEY=<64-hex> tsx tools/data/build-handover-seed.ts <folder with the unzipped uploads>
 */
const blank = (v: unknown) => { const s = v == null ? '' : String(v).trim(); return s === '—' || s === '-' ? '' : s }
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, '')); return blank(v) && Number.isFinite(n) ? n : null }
const int = (v: unknown) => { const n = num(v); return n == null ? null : Math.round(n) }
const date = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : blank(v).slice(0, 32))

function staffEmail(name: string): string | null {
  const first = name.toLowerCase().replace(/^muhammad\s+/, '').split(/[\s_]+/)[0]
  return SWK_STAFF_ACCOUNTS.find(a => a.email.split('@')[0] === first)?.email ?? null
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
}

const DIVISION: Record<string, string> = {
  '1_FINISHING_NEXT_0_TO_30_DAYS': 'EJARI_FINISHING_0_30D',
  '2_FINISHING_NEXT_31_TO_60_DAYS': 'EJARI_FINISHING_31_60D',
}

async function leadsFromWorkbook(file: string): Promise<RawVaultPropertyInput[]> {
  const desk = path.basename(file).split('_')[0] // 01..07
  const sheets = (await readXlsxFile(fs.readFileSync(file))) as unknown as { sheet: string; data: unknown[][] }[]
  const out: RawVaultPropertyInput[] = []
  for (const { sheet, data } of sheets) {
    const seeker = sheet.startsWith('04_')
    if (!(sheet.startsWith('03_') || seeker || sheet.startsWith('05_'))) continue // 01/02 are subsets of 03
    const hdr = (data[0] ?? []).map(c => blank(c))
    const v = (r: unknown[], k: string) => { const i = hdr.indexOf(k); return i < 0 ? undefined : r[i] }
    for (const r of data.slice(1)) {
      const id = blank(v(r, 'Forensic_Client_ID'))
      if (!id) continue
      const deskLabel = blank(v(r, 'Assigned_SWK_Leasing_Agent'))
      const agent = (deskLabel.match(/—\s*([^(]+)/)?.[1] ?? '').trim().split(' ')[0]
      const passing = num(v(r, seeker ? 'Current_Or_Target_Rent_AED' : 'Passing_Ejari_Rent_AED'))
      const window = blank(v(r, seeker ? 'Seeker_Cohort' : 'Urgency_Window'))
      out.push({
        external_deal_id: `EJ26-${desk}-${id}`,
        source_dataset: 'ejari_dialer_2026',
        source_sheet: sheet,
        suggested_agent: agent,
        agent_cluster_territory: deskLabel,
        agent_deal_rank: int(blank(v(r, 'Dialer_Call_Seq')).split('-').pop()),
        deal_division: seeker ? 'ACTIVE_UNIT_SEEKER' : sheet.startsWith('05_') ? 'VACANT_RECENTLY_EXPIRED' : (DIVISION[window] ?? 'EJARI_FINISHING_0_60D'),
        dubai_area_community: blank(v(r, seeker ? 'Current_Or_Target_Area' : 'Area_DLD_Community')),
        master_project: blank(v(r, 'Master_Project')),
        building_or_project: blank(v(r, seeker ? 'Current_Building_And_Door' : 'Current_Building_Tower')),
        exact_unit_door_no: blank(v(r, 'Exact_Unit_Door_No')),
        floor_or_zone: blank(v(r, 'Floor')),
        property_layout_type: blank(v(r, seeker ? 'Layout_Requirement' : 'Layout_Type')),
        area_sqm: num(v(r, 'Area_SqM')),
        size_sqft: num(v(r, 'Size_SqFt')),
        urgency_or_deal_window: window,
        target_deal_value_aed: num(v(r, 'DLD_2026_Market_Rent_AED')),
        current_or_benchmark_aed: passing,
        est_agency_commission_aed: passing == null ? null : Math.round(passing * 0.05),
        event_or_expiry_date: date(v(r, seeker ? 'Lease_Expiry_Or_Inquiry_Date' : 'Ejari_Expiry_Date')),
        days_to_event: int(v(r, seeker ? 'Days_To_Move_Window' : 'Days_Until_Expiry')),
        portal_or_source_status: blank(v(r, 'Portal_Listing_Status')),
        owner_name: blank(v(r, 'Client_Full_Name')),
        owner_entity_type: blank(v(r, 'Entity_Type')),
        owner_nationality: blank(v(r, 'Nationality')),
        direct_mobile: blank(v(r, 'Direct_Mobile_WhatsApp')),
        secondary_phone: blank(v(r, 'Secondary_Phone')),
        email_address: blank(v(r, 'Email_Address')),
        closing_strategy_playbook: blank(v(r, 'Leasing_First_Show_Playbook')),
        extra: Object.fromEntries(Object.entries({
          dialer_seq: blank(v(r, 'Dialer_Call_Seq')),
          dld_property_id: blank(v(r, 'DLD_Property_ID')),
          unit_match_precision: blank(v(r, 'Unit_Match_Precision')),
          dld_2026_audit: blank(v(r, 'DLD_2026_Tx_And_Renewal_Audit')),
          under_market_pct: num(v(r, 'Under_Market_Discount_Pct')),
          rera_increase_pct: num(v(r, 'RERA_Statutory_Increase_Pct')),
          rera_rent_shock_aed: num(v(r, 'RERA_Annual_Rent_Shock_AED')),
          arbitrage: blank(v(r, 'Arbitrage_Classification')),
          doors_held: int(v(r, 'Client_Portfolio_Doors_Held')),
          rent_roll_aed: num(v(r, 'Client_Total_Annual_Rent_Roll_AED')),
          capacity_tier: blank(v(r, 'Client_Capacity_Tier')),
          matched_units: blank(v(r, 'First_Show_Matched_Available_Leasing_Units')),
        }).filter(([, x]) => x !== '' && x != null)),
      })
    }
  }
  return out
}

/** Staff view copy: every page rendered exactly as uploaded (needs poppler's pdftoppm). Staff never receive the PDF. */
function renderPages(file: string): Buffer[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swk-pages-'))
  try {
    execFileSync('pdftoppm', ['-r', '100', '-jpeg', '-jpegopt', 'quality=75', file, path.join(dir, 'p')])
    return fs.readdirSync(dir).sort().map(n => fs.readFileSync(path.join(dir, n)))
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}

function docMeta(file: string): Omit<HandoverDocMeta, 'offset' | 'length' | 'sha256'> | null {
  const name = path.basename(file)
  const lower = name.toLowerCase()
  const mime = lower.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  let m: RegExpMatchArray | null
  if ((m = name.match(/^SWK_Playbook_(Muhammad_)?([A-Za-z]+)_(.+)\.pdf$/))) return { name, title: `Personal Playbook – ${m[2]}: ${m[3].replace(/_/g, ' ')}`, kind: 'Personal Playbook', staff_email: staffEmail(m[2]), contains_contacts: false, mime }
  if ((m = name.match(/^SWK_([A-Za-z]+)\.pdf$/))) return { name, title: `Field Guide – ${m[1]}`, kind: 'Field Guide', staff_email: staffEmail(m[1]), contains_contacts: false, mime }
  if ((m = name.match(/^\d\d_([A-Za-z]+)(_Shabbir)?_Ejari_30D_60D_Leasing_Calling_Booklet\.pdf$/))) return { name, title: `Ejari 0–60D Calling Booklet – ${m[1]}`, kind: 'Calling Booklet', staff_email: staffEmail(m[1]), contains_contacts: true, mime }
  if ((m = name.match(/^\d\d_([A-Za-z]+)(_Shabbir)?_Ejari_30D_60D_Leasing_Dialer_Workbook\.xlsx$/))) return { name, title: `Ejari 0–60D Dialer Workbook – ${m[1]}`, kind: 'Dialer Workbook', staff_email: staffEmail(m[1]), contains_contacts: true, mime }
  if (/^00_SWK_7_Desks_.*Master_Roster_Index\.xlsx$/.test(name)) return { name, title: '7 Desks Master Roster Index (15,253 leads)', kind: 'Roster Index', staff_email: null, contains_contacts: false, mime }
  return null // CSV dialer masters duplicate the workbooks; their rows are in the lead import
}

async function main() {
  const folder = process.argv[2]
  const keyHex = String(process.env.SWK_HANDOVER_KEY || '').trim()
  if (!folder || !/^[0-9a-f]{64}$/i.test(keyHex)) {
    console.error('Usage: SWK_HANDOVER_KEY=<64-hex> tsx tools/data/build-handover-seed.ts <folder>')
    process.exit(1)
  }
  const files = walk(folder).sort()
  const leads: RawVaultPropertyInput[] = []
  for (const f of files.filter(f => /_Leasing_Dialer_Workbook\.xlsx$/.test(f))) {
    const rows = await leadsFromWorkbook(f)
    console.log(`${path.basename(f)}: ${rows.length} leads`)
    leads.push(...rows)
  }
  const ids = new Set(leads.map(l => l.external_deal_id))
  if (ids.size !== leads.length) throw new Error(`Duplicate lead ids: ${leads.length - ids.size}`)

  const docs: HandoverDocMeta[] = []
  const blobs: Buffer[] = []
  const seen = new Set<string>()
  let offset = 0
  for (const f of files) {
    const meta = docMeta(f)
    if (!meta || seen.has(meta.name)) continue // the booklets ship in two zips; keep one copy
    seen.add(meta.name)
    const buf = fs.readFileSync(f)
    docs.push({ ...meta, offset, length: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') })
    blobs.push(buf)
    offset += buf.length
    if (meta.contains_contacts || meta.mime !== 'application/pdf') continue
    const pages: { offset: number; length: number }[] = []
    for (const img of renderPages(f)) { pages.push({ offset, length: img.length }); blobs.push(img); offset += img.length }
    docs[docs.length - 1].pages = pages
  }
  const header = Buffer.from(JSON.stringify({ version: 1, built_at: new Date().toISOString(), leads, docs }))
  const len = Buffer.alloc(4); len.writeUInt32BE(header.length)
  const gz = zlib.gzipSync(Buffer.concat([len, header, ...blobs]), { level: 9 })
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv)
  const ct = Buffer.concat([cipher.update(gz), cipher.final()])
  const out = path.resolve('data-seed', 'swk-handover.enc.bin')
  fs.writeFileSync(out, Buffer.concat([iv, cipher.getAuthTag(), ct]))
  console.log(`\n${leads.length} leads, ${docs.length} documents -> ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`)
  for (const d of docs) console.log(`  ${d.kind.padEnd(18)} ${d.staff_email ?? 'management only'}  ${d.name}`)
}

main().catch(e => { console.error(e); process.exit(1) })
