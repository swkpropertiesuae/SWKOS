import { q } from '../db'
import { getSetting,setSettings } from '../settings'
import { createRecord,patchRecord,getDef,SYSTEM_CTX } from '../engine'
import { SWK_COMPANY_ADDRESS,SWK_COMPANY_EMAIL,SWK_COMPANY_NAME,SWK_COMPANY_PHONE,SWK_OFFICIAL_WEBSITES_TEXT,SWK_TRADE_LICENSE } from '../../shared/corporate-footer'

/** Official company profile facts matching swkpropertiesuae.com (preserving custom administrator overrides). */
export function seedCompanyDocuments() {
  const patch: Record<string, unknown> = {}
  const facts = {
    company_name_ar: 'إس دبليو كي العقارية ش.ذ.م.م',
    company_legal_form: 'Limited Liability Company - Single Owner (LLC - SO)',
    licence_authority: 'Department of Economy and Tourism (DET), Dubai',
  }
  for (const [key, value] of Object.entries(facts)) if (!getSetting(key)) patch[key] = value
  const currentName = String(getSetting('company_name') || '').trim()
  if (!currentName || currentName === 'SWK Properties L.L.C' || currentName.toUpperCase() === 'SWK OS') {
    patch.company_name = SWK_COMPANY_NAME
  }
  const currentAddr = String(getSetting('company_address') || '').trim()
  if (!currentAddr || /^(?:Bur Dubai,\s*Dubai,\s*(?:UAE|United Arab Emirates)|Dubai,\s*United Arab Emirates)$/i.test(currentAddr)) {
    patch.company_address = SWK_COMPANY_ADDRESS
  }
  const currentPhone = String(getSetting('company_phone') || '').trim()
  if (!currentPhone || currentPhone === '+971 4 330 4899') {
    patch.company_phone = SWK_COMPANY_PHONE
  }
  const currentEmail = String(getSetting('company_email') || '').trim()
  if (!currentEmail || currentEmail.toLowerCase() === 'sales@swkpropertiesuae.com') {
    patch.company_email = SWK_COMPANY_EMAIL
  }
  const currentInfoEmail = String(getSetting('company_info_email') || '').trim()
  if (!currentInfoEmail) {
    patch.company_info_email = SWK_COMPANY_EMAIL
  }
  const currentLic = String(getSetting('company_trade_license') || '').trim()
  if (!currentLic) {
    patch.company_trade_license = SWK_TRADE_LICENSE
  }
  const currentWeb = String(getSetting('company_website') || '').trim()
  if (!currentWeb || currentWeb === 'https://www.swkpropertiesuae.com' || currentWeb === 'www.swkpropertiesuae.com' || currentWeb === 'www.swk.properties · www.swkpropertiesuae.com · www.swk.rent') {
    patch.company_website = SWK_OFFICIAL_WEBSITES_TEXT
  }
  setSettings(patch)
  const detLicence = q.get<{ id: number; reference_no: string | null }>('SELECT id, reference_no FROM compliance_items WHERE name = ? AND deleted_at IS NULL', 'Commercial licence (DET)')
  if (detLicence && !String(detLicence.reference_no || '').trim()) {
    patchRecord(getDef('compliance_items'), detLicence.id, { reference_no: SWK_TRADE_LICENSE }, SYSTEM_CTX)
  }
  const items = [
    { type: 'ICP establishment card', name: 'ICP establishment card', status: 'To verify', notes: 'Enter the card number and expiry date. Not evidence of MOHRE/WPS enrolment.' },
    { type: 'Corporate tax registration (FTA)', name: 'Corporate tax registration', status: 'To verify', notes: 'Enter the application reference or registration number. An application reference is not a VAT or corporate tax TRN.' },
  ]
  for (const item of items) {
    const existing = q.get<{ id: number; reference_no: string; status: string }>('SELECT id, reference_no, status FROM compliance_items WHERE name = ? AND deleted_at IS NULL', item.name)
    if (!existing) createRecord(getDef('compliance_items'), { renewal_lead_days: 60, ...item }, SYSTEM_CTX)
    else if (!existing.reference_no && existing.status === 'To verify') patchRecord(getDef('compliance_items'), existing.id, item, SYSTEM_CTX)
  }
}
