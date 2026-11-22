# Website enquiries into the CRM

The company website (swkpropertiesuae.com, repository `swkpropertiesuae/SWKPROPERTY.COM`) already has property pages, calculators and enquiry forms with a viewing-date picker. Every form posts to the website's `/api/enquiries`, which can forward each enquiry to a webhook. SWK OS accepts that webhook directly, so website leads land in the CRM with no change to the website code.

## Set it up

1. In SWK OS go to Settings, Connections (Integrations) and set the **Lead webhook secret** to a long random value. Note the lead intake address shown there: `https://os.swk.properties/api/public/lead/<secret>`.
2. In Cloudflare, open the website's Worker settings and set these variables:
   - `LEAD_WEBHOOK_URL` = `https://os.swk.properties/api/public/lead/<secret>`
   - `LEAD_WEBHOOK_SECRET` = any value (it is sent as a Bearer header and ignored; the secret in the address is what is checked)
3. Submit a test enquiry on the website. A lead with source **Website** appears in CRM, Leads.

## What the lead contains

- Name, phone and email from the form.
- A note with the enquiry text, the property (title, reference, community), the **viewing the visitor asked for** (date, time, mode), the qualification answers, preferred contact and the page it came from.
- The website's enquiry id is used to ignore repeated deliveries. An enquiry from a phone or email that already has an open lead is added to that lead as a comment instead of creating a duplicate.

## Notes

- Treat the secret like a password. If it leaks, set a new one in both places.
- The viewing request is a note on the lead; the agent confirms the slot with the client. A self-service booking calendar is not built.
