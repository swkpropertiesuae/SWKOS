import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import readXlsxFile from 'read-excel-file/node'
import type { RawVaultPropertyInput } from '../../src/server/domain/crm-vault'

/**
 * Builds data-seed/swk-handover.enc.bin: the Ejari 0–60D dialer leads (all 7 desks), encrypted with AES-256-GCM.
 * Documents are uploaded by the Admin in SWK OS instead (CRM Vault → Custody & Handover).
 * The file holds no readable name or phone number without SWK_HANDOVER_KEY.
 *
 * Usage: SWK_HANDOVER_KEY=<64-hex> tsx tools/data/build-handover-seed.ts <folder with the unzipped uploads>
 */
const blank = (v: unknown) => { const s = v == null ? '' : String(v).trim(); return s === '—' || s === '-' ? '' : s }
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, '')); return blank(v) && Number.isFinite(n) ? n : null }
const int = (v: unknown) => { const n = num(v); return n == null ? null : Math.round(n) }
const date = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : blank(v).slice(0, 32))

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

  // Documents are not bundled: the Admin uploads them on Custody & Handover (stored in Cloudflare R2).
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify({ version: 2, built_at: new Date().toISOString(), leads })), { level: 9 })
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv)
  const ct = Buffer.concat([cipher.update(gz), cipher.final()])
  const out = path.resolve('data-seed', 'swk-handover.enc.bin')
  fs.writeFileSync(out, Buffer.concat([iv, cipher.getAuthTag(), ct]))
  console.log(`\n${leads.length} leads -> ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`)
}

main().catch(e => { console.error(e); process.exit(1) })
