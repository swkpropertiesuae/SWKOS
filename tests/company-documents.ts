import { corporatePdfFooter, SWK_COMPANY_ADDRESS, SWK_COMPANY_PHONE, SWK_RERA_ORN, SWK_TRADE_LICENSE } from '../src/shared/corporate-footer'
import assert from 'node:assert/strict'
import { syncSchema } from '../src/server/schema'
import { seedReference } from '../src/server/seed'
import { q } from '../src/server/db'
import { getSetting, setSettings } from '../src/server/settings'
import { mergeCompanyTokens, presentDocumentHtml } from '../src/shared/studio-html'

syncSchema()
// Simulate an existing installation whose original compliance seed already ran with the old placeholder address.
q.run("INSERT INTO settings(key,value,updated_at) VALUES ('seed:compliance','1',?)", new Date().toISOString())
setSettings({ company_name: 'SWK Properties L.L.C.', company_address: 'Dubai, United Arab Emirates', company_phone: '', company_email: 'accounts@example.test', company_trn: '100123456700003', company_trade_license: '' })
seedReference()
assert.equal(getSetting('company_name'), 'SWK Properties L.L.C.')
assert.equal(getSetting('company_address'), SWK_COMPANY_ADDRESS)
assert.equal(getSetting('company_phone'), SWK_COMPANY_PHONE)
assert.equal(getSetting('company_email'), 'accounts@example.test')
assert.equal(getSetting('company_trn'), '100123456700003')
assert.equal(getSetting('company_trade_license'), SWK_TRADE_LICENSE)
assert.equal(getSetting('ct_registered'), false)
assert.equal(getSetting('ct_trn'), '')
for (const key of ['dcci_no', 'commercial_register_no', 'establishment_card_no', 'ct_application_reference']) assert.ok(!getSetting(key), `${key} must not be seeded`)
assert.ok(!q.val("SELECT reference_no FROM compliance_items WHERE name='Corporate tax registration'"))
const count = q.val('SELECT COUNT(*) FROM compliance_items')
setSettings({ company_address: 'Administrator updated office', ct_application_status: 'Approved - certificate reviewed', company_trade_license: 'TL-TEST-1' })
seedReference()
assert.equal(getSetting('company_address'), 'Administrator updated office')
assert.equal(getSetting('ct_application_status'), 'Approved - certificate reviewed')
assert.equal(getSetting('company_trade_license'), 'TL-TEST-1')
assert.equal(q.val('SELECT COUNT(*) FROM compliance_items'), count)
const html = mergeCompanyTokens('{{company.address_ar}} / {{company.dcci_no}} / {{company.legal_form}} / {{company.ct_application_reference}} / {{company.orn}} / {{company.trade_license}}', { company_address_ar: 'دبي', dcci_no: 'DCCI-TEST-1', company_legal_form: '<LLC & SO>', ct_application_reference: 'CT-REF-TEST-1' }, '2026-10-15')
assert.equal(html, `دبي / DCCI-TEST-1 / &lt;LLC &amp; SO&gt; / CT-REF-TEST-1 / ${SWK_RERA_ORN} / ${SWK_TRADE_LICENSE}`)
for (const code of ['CO-FACTS', 'CO-LETTER', 'CO-REG']) assert.equal(q.val('SELECT COUNT(*) FROM doc_templates WHERE code=? AND active=1', code), 1)
const coFactsRaw = q.val<string>("SELECT content FROM doc_templates WHERE code='CO-FACTS'")!
const coFactsRendered = mergeCompanyTokens(presentDocumentHtml(coFactsRaw, 'Company particulars'), {}, '2026-11-23')
assert.ok(coFactsRendered.includes(SWK_TRADE_LICENSE) && coFactsRendered.includes(SWK_RERA_ORN) && coFactsRendered.includes(SWK_COMPANY_ADDRESS) && coFactsRendered.includes(SWK_COMPANY_PHONE), 'CO-FACTS renders official website licence, ORN, address and phone')
console.log('Company documents passed: existing-install migration, website defaults, licence/ORN preservation, token escaping, template installation and preservation of administrator changes.')

const contact = '<table><tr><th>Trade licence</th><td>1511391</td><th>Contact</th><td>info@swkpropertiesuae.com</td></tr><tr><th>Supplier TRN</th><td>100123456700003</td></tr></table><p>{{company.name_ar}}</p><h1>Letter / رسالة</h1>'
const general = presentDocumentHtml(contact, 'Company profile')
assert.ok(!/100123456700003|[\u0600-\u06ff]|name_ar/.test(general))
assert.ok(general.includes('1511391') && general.includes('info@swkpropertiesuae.com'))
for (const title of ['Tax Invoice', 'Credit Note', 'Debit Note']) {
  const tax = presentDocumentHtml(contact, title)
  assert.ok(tax.includes('100123456700003') && tax.includes('1511391'))
}
assert.ok(!presentDocumentHtml(contact, 'Proforma Invoice').includes('100123456700003'))
assert.ok(presentDocumentHtml('<p>Bur Dubai, Dubai, UAE</p>', 'Letter').includes(SWK_COMPANY_ADDRESS))
console.log('English presentation passed: no Arabic, Supplier TRN restricted to tax documents, Trade Licence preserved, address normalised to Sheikh Zayed Road HQ.')

const footer = corporatePdfFooter({ company_name: 'SWK <Properties>', company_address: SWK_COMPANY_ADDRESS, company_phone: SWK_COMPANY_PHONE, company_info_email: 'info@swkpropertiesuae.com', company_website: 'https://www.swkpropertiesuae.com' })
assert.ok(footer.includes('SWK &lt;Properties&gt;') && footer.includes(SWK_COMPANY_ADDRESS) && footer.includes(SWK_RERA_ORN) && footer.includes(SWK_TRADE_LICENSE))
assert.ok(footer.includes('www.swkpropertiesuae.com') && footer.includes('pageNumber') && footer.includes('totalPages'))
assert.ok(!corporatePdfFooter({}, { pageNumbers: false }).includes('pageNumber'))
assert.ok(corporatePdfFooter({}, { footerText: '<script>bad()</script>' }).includes('&lt;script&gt;'))
console.log('Corporate footer passed: safe company contact details, RERA ORN & DET licence, repeated PDF numbering and optional note.')
