export interface FooterCompany {
  company_name?: string; company_address?: string; company_phone?: string
  company_email?: string; company_info_email?: string; company_website?: string
  company_trade_license?: string
}

export const SWK_COMPANY_NAME = 'SWK Properties LLC'
export const SWK_COMPANY_ADDRESS = '25th Floor, Al Saqr Building, Sheikh Zayed Road, Dubai, UAE'
export const SWK_COMPANY_PHONE = '+971 56 433 0448'
export const SWK_COMPANY_EMAIL = 'info@swkpropertiesuae.com'
export const SWK_COMPANY_HOURS = 'Sun–Thu 9:00 AM – 7:00 PM · Sat 10:00 AM – 4:00 PM GST'
export const SWK_RERA_ORN = '51517'
export const SWK_TRADE_LICENSE = '1511391'

export const SWK_OFFICIAL_WEBSITES = [
  'www.swkpropertiesuae.com',
  'www.swk.properties',
  'www.swk.rent',
] as const

export const SWK_OFFICIAL_WEBSITES_TEXT = SWK_OFFICIAL_WEBSITES.join(' · ')

export function normalizeSwkCompanyName(raw?: string | null): string {
  const trimmed = (raw || '').trim()
  if (!trimmed || trimmed.toUpperCase() === 'SWK OS' || trimmed === 'SWK Properties L.L.C') {
    return SWK_COMPANY_NAME
  }
  return trimmed
}

export function normalizeSwkWebsitesText(raw?: string | null): string {
  const cleaned = (raw || '').replace(/^https?:\/\//, '').replace(/\/$/, '').trim()
  if (!cleaned) return SWK_OFFICIAL_WEBSITES_TEXT
  const lower = cleaned.toLowerCase()
  if (SWK_OFFICIAL_WEBSITES.every(domain => lower.includes(domain))) return cleaned
  return SWK_OFFICIAL_WEBSITES_TEXT
}

export function corporateFooterDetails(s: FooterCompany = {}) {
  return {
    name: normalizeSwkCompanyName(s.company_name),
    address: (s.company_address || '').trim() || SWK_COMPANY_ADDRESS,
    phone: (s.company_phone || '').trim() || SWK_COMPANY_PHONE,
    email: (s.company_info_email || s.company_email || '').trim() || SWK_COMPANY_EMAIL,
    website: normalizeSwkWebsitesText(s.company_website),
    websites: [...SWK_OFFICIAL_WEBSITES],
    orn: SWK_RERA_ORN,
    tradeLicense: (s.company_trade_license || '').trim() || SWK_TRADE_LICENSE,
  }
}

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Chromium footer templates have no access to the document stylesheet. Styled to match swkpropertiesuae.com. */
export function corporatePdfFooter(s: FooterCompany, opts: { pageNumbers?: boolean; footerText?: string } = {}) {
  const c = corporateFooterDetails(s)
  const regLine = `RERA ORN ${c.orn}${c.tradeLicense ? ` · DET Licence ${c.tradeLicense}` : ''}`
  return `<div style="width:100%;box-sizing:border-box;padding:0 14mm;font-family:Arial,Helvetica,sans-serif;font-size:8px;color:#3d4a51;line-height:1.5"><div style="border-top:1px solid #0f2a33;position:relative;padding-top:6px;display:flex;justify-content:space-between;gap:12px"><div style="position:absolute;left:0;top:-2px;width:54px;height:2px;background:#d4a752"></div><div><div style="font-size:9px;font-weight:700;letter-spacing:.6px;color:#0f2a33;text-transform:uppercase">${esc(c.name)} <span style="font-weight:600;color:#8a621c;letter-spacing:.4px;text-transform:none">· ${esc(regLine)}</span></div><div>${esc(c.address)}</div></div><div style="text-align:right"><div>${esc([c.phone, c.email].filter(Boolean).join(' | '))}</div><div style="font-weight:700;color:#0f2a33">${esc(c.website)}</div></div></div><div style="display:flex;justify-content:space-between;gap:12px;padding-top:4px;color:#5b676e"><span>${esc(opts.footerText || '')}</span><span>${opts.pageNumbers !== false ? 'Page <span class="pageNumber"></span> of <span class="totalPages"></span>' : ''}</span></div></div>`
}
