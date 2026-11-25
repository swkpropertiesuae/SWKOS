# SWK OS vs Dubai real-estate CRMs

Researched 2026-11-25. Most sources are vendor pages or vendor-written comparisons, so treat prices and AI claims as marketing until a demo confirms them. ✅ built · 🟡 partial · ❌ missing.

## 1. Competitors at a glance

| Product | Owner / focus | Strongest at | Weakest at | Price signal |
|---|---|---|---|---|
| **PropSpace** | Brokerages; ex-Property Finder (divested 2024) | Real-time Property Finder listing sync, portal leads auto-assigned, iOS/Android app | WhatsApp conversations stay in WhatsApp (no shared inbox) | AED 220/user/month, AED 11/unit/month for property management |
| **Profolio** (Bayut) | Bayut/Dubizzle advertisers | Native Bayut + Dubizzle, Listing Quality Score, TruCheck verification, per-listing CTR/clicks/leads/impressions | Bayut-only; no evidence of internal lead routing | Bundled with Bayut packages |
| **PF Expert** (Property Finder) | Property Finder advertisers | Listing quality score, SuperAgent ranking (response under 2 h, response rate above 80 %, quality above 85 %), upgrade recommendations by credits | Property Finder only | Bundled with PF packages |
| **Goyzer** | Brokers, developers, property managers | Property management (tenant/landlord app, inspections, work orders), e-signed contracts, double-booking prevention, "Spark" AI descriptions and price insights, Arabic/English | Little independent review | Quote |
| **Pixxi** | Portal-heavy brokers | Lead capture from PF, Bayut, Dubizzle, WhatsApp, Facebook, Instagram, TikTok, YouTube, Google Ads; rotation rules; approval before publishing with validation | App reviews report slowness and crashes; AI is vague | Not published |
| **PropCRM** | SMB brokers | Listing-based assignment (enquiry goes to the listing agent), WhatsApp Business API, broadcasts, viewing reminders | AI scoring marked "coming"; pricing unclear | Quote |
| **Zoho / Salesforce / Bitrix24 / Odoo** | Generic | Flexibility, ecosystem | No Dubai pipelines, permits or portal feeds without heavy setup | Low licence, high setup |

## 2. Feature-by-feature: who does it best, and where SWK OS stands

| Feature | Best competitor | SWK OS | Status after this change |
|---|---|---|---|
| Portal XML feed (PF, Bayut, Dubizzle) | PropSpace, Pixxi | Was manual publishing only | ✅ **Built**: tokened XML feed per portal (`/api/public/portal-feed/<token>/<portal>.xml`), shown on the Pipeline page |
| Block ads without a valid Trakheesi permit | PropSpace, Pixxi (validation) | Field only | ✅ **Built**: a listing never enters a feed without a permit number, unexpired permit, price, agent BRN (unexpired) and description; blocked listings show the reason |
| Portal enquiries into the CRM | PropSpace, Pixxi | Website/Meta webhooks only | ✅ **Built**: `/api/public/portal-lead/<portal>/<secret>` accepts PF/Bayut/Dubizzle/Zapier shapes, deduplicates retries, links the listing |
| Enquiry goes to the listing agent | PropCRM | Round-robin rules only | ✅ **Built**: owner = listing agent's user, else the routing rules |
| Listing quality score | Profolio, PF Expert | Missing | ✅ **Built**: 0-100 per listing with "what to add"; weak live listings listed on the Pipeline page |
| Round-robin / least-busy routing, SLA, lead pool | Pixxi | ✅ Already (`domain/growth.ts`) | — |
| Lead ↔ listing matching | Pixxi, Goyzer | ✅ Already (`matchUnitsForLead`) | — |
| Approval before publishing | Pixxi | ✅ Already (inventory submission gate) | — |
| Double-booking prevention | Goyzer | ✅ Already (unit holds) | — |
| WhatsApp in the CRM | PropCRM | ✅ Cloud API, signed webhooks, owner briefings | Broadcasts and viewing reminders: 🟡 |
| AI descriptions / insights | Goyzer Spark | ✅ Multi-provider AI with PII shield, writing studio, agents, voice | Listing-description button: 🟡 |
| Per-listing portal stats (CTR, impressions, leads) | Profolio, PF Expert | ❌ (needs each portal's partner API) | Next |
| Agent responsiveness score (SuperAgent-style) | PF Expert | 🟡 SLA, first-response time stored | Next: scorecard on leaderboard |
| Ad-platform lead capture (TikTok, Google, YouTube) | Pixxi | 🟡 Meta + website | Next: same webhook pattern |
| Live Trakheesi/Ejari API checks | PropSpace | ❌ needs DLD API Gateway (about AED 30k/year) | Decision for the owner |
| Arabic UI (RTL) | Goyzer | 🟡 Arabic OCR/fonts; UI English | Next |
| Tenant/landlord app, inspections, work orders | Goyzer | 🟡 Customer portal + maintenance | Next: landlord statements |

## 3. Where SWK OS is already better than all of them

- **One system**: CRM, finance (VAT, UAE e-invoicing, WPS), HR and attendance, compliance and goAML, documents, chat and softphone. Competitors cover CRM + listings and leave the rest to other tools.
- **Governance**: Owner-approved Recycle Bin, mandatory edit/delete reasons, full audit log, legal hold, four-eyes controls.
- **Lead custody**: CRM Vault with masked numbers, masked calls and WhatsApp, watermarked documents. This answers agents leaving with the database.
- **Attendance anti-fraud**: rotating QR, office Wi-Fi lock, device binding, field GPS anti-spoof.
- **Cost**: no per-seat fee. 12 users on a per-seat CRM cost about AED 32k-115k a year before the DLD gateway.

## 4. Before switching the feeds on

1. Ask each portal account manager for their current XML specification and compare it with the tags in `src/server/domain/portals.ts` (one function per portal).
2. In Pipeline → Portal feeds, fix every blocked listing (permit, expiry, price, agent BRN, description).
3. Copy each portal's feed URL from the same card and send it to the portal. Rotate the URL (`POST /api/portals/feeds/rotate`) if it ever leaks.
4. Point portal lead forwarding (or Zapier) at `/api/public/portal-lead/<propertyfinder|bayut|dubizzle>/<lead webhook secret>`.

## Sources

[PropSpace CRM](https://www.propspace.com/real-estate-crm-dubai) · [PropSpace PF leads](https://www.propspace.com/blog/managing-property-finder-leads-without-losing-them) · [PropSpace on GetApp](https://www.getapp.com/all-software/a/propspace/) · [PropSpace on Capterra](https://www.capterra.com/p/137192/PropSpace/) · [PropSpace iOS app](https://apps.apple.com/ae/app/propspace-real-estate-crm/id1269090934) · [Profolio features](https://www.bayut.com/agentportal/best-features-profolio-offers/) · [Profolio app](https://www.bayut.com/mybayut/bayut-profolio-mobile-app/) · [Profolio listing insights](https://www.bayut.com/agentportal/announcements/introducing-insights-for-individual-listings-on-profolio/) · [Bayut quality score](https://support.bayut.com/hc/en-us/articles/13283226539922-Why-can-t-I-view-my-Listing-Quality-Score) · [PF Expert](https://www.propertyfinder.ae/partnerhub/pf-expert/) · [PF SuperAgent](https://www.propertyfinder.ae/partnerhub/super-agent/) · [Goyzer](https://www.goyzer.com/) · [Goyzer brokers](https://www.goyzer.com/crm-features-for-brokers) · [Goyzer property managers](https://www.goyzer.com/crm-features-for-property-managers) · [Pixxi](https://pixxicrm.com/) · [Pixxi leads](https://pixxicrm.com/features/leads-management) · [Pixxi PF & Bayut](https://pixxicrm.com/property-finder-bayut-crm) · [PropCRM](https://propcrm.ae/) · [PropCRM portal leads](https://propcrm.ae/blog/how-to-manage-leads-from-property-finder-bayut-dubizzle) · [DVNC comparison](https://dvnc.ae/blog/best-crm-dubai-real-estate-brokerages) · [Krowdbase](https://www.krowdbase.com/post/best-crm-software-real-estate-companies-dubai) · [COM8](https://www.com8.io/blog/best-real-estate-crm-dubai-uae) · [Propertybase PF tags](https://help.propertybase.com/hc/en-us/articles/202899016-Middle-East-Property-Portal-Integration) · [DLD API Gateway](https://dubailand.gov.ae/en/eservices/api-gateway/) · [ERES](https://eres.ae/api-integration.html)
