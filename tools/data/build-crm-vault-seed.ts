import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { syncSchema } from '../../src/server/schema'
import { q } from '../../src/server/db'
import { decryptSecret } from '../../src/server/settings'
import { seedReference } from '../../src/server/seed'
import { parseAndImportVaultBuffer } from '../../src/server/domain/crm-vault'
import { safeJson } from '../../src/server/util'

/**
 * Builds an AES-256-GCM encrypted seed bundle (`data-seed/crm-vault.enc.bin`) from a local folder of SWK CRM Excel/CSV files.
 * Safe to store in a repository because NO plaintext owner names or phone numbers exist in the file without SWK_CRM_VAULT_KEY.
 */
async function main() {
  const folder = process.argv[2]
  const keyHex = String(process.env.SWK_CRM_VAULT_KEY || '').trim()
  if (!folder || !keyHex) {
    console.error('Usage: SWK_CRM_VAULT_KEY=<64-hex-key> tsx tools/data/build-crm-vault-seed.ts <crm-folder>')
    process.exit(1)
  }

  syncSchema()
  await seedReference()

  const files = fs.readdirSync(folder).sort().filter(name => {
    const lower = name.toLowerCase()
    if (lower.startsWith('agent_') && fs.existsSync(path.join(folder, 'SWK_6_Agents_1920_Cluster_Closing_Deals_Master.xlsx'))) return false
    return lower.endsWith('.xlsx') || lower.endsWith('.csv')
  })

  for (const name of files) {
    const res = await parseAndImportVaultBuffer(fs.readFileSync(path.join(folder, name)), name)
    console.log(`Parsed ${name}: ${res.properties.total} properties, ${res.routes.total} routes`)
  }

  const properties = q.all<any>(`SELECT * FROM crm_vault_properties ORDER BY id`).map(r => ({
    external_deal_id: r.external_deal_id,
    source_dataset: r.source_dataset,
    source_sheet: r.source_sheet,
    suggested_agent: r.suggested_agent,
    agent_cluster_territory: r.agent_cluster_territory,
    agent_deal_rank: r.agent_deal_rank,
    deal_division: r.deal_division,
    dubai_area_community: r.dubai_area_community,
    primary_area_dld: r.primary_area_dld,
    master_project: r.master_project,
    building_or_project: r.building_or_project,
    exact_unit_door_no: r.exact_unit_door_no,
    floor_or_zone: r.floor_or_zone,
    property_layout_type: r.property_layout_type,
    area_sqm: r.area_sqm,
    size_sqft: r.size_sqft,
    urgency_or_deal_window: r.urgency_or_deal_window,
    score: r.score,
    target_deal_value_aed: r.target_deal_value_aed,
    current_or_benchmark_aed: r.current_or_benchmark_aed,
    est_agency_commission_aed: r.est_agency_commission_aed,
    event_or_expiry_date: r.event_or_expiry_date,
    days_to_event: r.days_to_event,
    portal_or_source_status: r.portal_or_source_status,
    owner_name: r.owner_name,
    owner_entity_type: r.owner_entity_type,
    owner_nationality: r.owner_nationality,
    direct_mobile: r.direct_mobile_enc ? decryptSecret(r.direct_mobile_enc) : '',
    secondary_phone: r.secondary_phone_enc ? decryptSecret(r.secondary_phone_enc) : '',
    email_address: r.email_address_enc ? decryptSecret(r.email_address_enc) : '',
    closing_strategy_playbook: r.closing_strategy_playbook,
    extra: safeJson(r.extra_json, {}),
  }))

  const routes = q.all<any>(`SELECT * FROM crm_vault_route_tracker ORDER BY id`).map(r => ({
    route_date: r.route_date,
    cluster_id: r.cluster_id,
    territory_captain: r.territory_captain,
    assigned_corridor: r.assigned_corridor,
    total_cluster_units: r.total_cluster_units,
    morning_towers_scheduled: r.morning_towers_scheduled,
    makani_0915_checkin: r.makani_0915_checkin,
    target_doors_swept: r.target_doors_swept,
    watchmen_snaggers_onboarded: r.watchmen_snaggers_onboarded,
    qr_serials_issued: r.qr_serials_issued,
    direct_forma_keys_locked: r.direct_forma_keys_locked,
    afternoon_viewings_conducted: r.afternoon_viewings_conducted,
    overflow_tenants_routed_80ltv: r.overflow_tenants_routed_80ltv,
    ejaris_closed_today: r.ejaris_closed_today,
    day21_landlord_equity_pitches: r.day21_landlord_equity_pitches,
    manager_haseeb_signoff: r.manager_haseeb_signoff,
  }))

  const gz = zlib.gzipSync(Buffer.from(JSON.stringify({ properties, routes }), 'utf8'), { level: 9 })
  const key = /^[0-9a-f]{64}$/i.test(keyHex) ? Buffer.from(keyHex, 'hex') : crypto.createHash('sha256').update(keyHex).digest()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(gz), cipher.final()])
  const tag = cipher.getAuthTag()
  const outDir = path.resolve(process.cwd(), 'data-seed')
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'crm-vault.enc.bin')
  fs.writeFileSync(outPath, Buffer.concat([iv, tag, encrypted]))
  console.log(`Wrote encrypted CRM Vault seed bundle: ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB, ${properties.length} properties, ${routes.length} routes)`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
