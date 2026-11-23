import type { EntityDef } from '../types'
import { T,TA,I,N,M,B,S,D,J } from '../dsl'

/**
 * Public website inventory and promotions (swkpropertiesuae.com).
 * Owner and Admin edit these in SWK OS (/website) and press "Publish & deploy": the server writes the
 * website's src/data/listings-expanded.json (+ src/data/promotions.json) to the website repo, which
 * auto-deploys on Cloudflare Workers and Vercel. Field values mirror the website's PropertyListing type.
 */
export const WEBSITE_PURPOSES = ['buy', 'rent', 'off-plan']
export const WEBSITE_STATUSES = ['available', 'reserved', 'rented', 'sold']
export const WEBSITE_TYPES = ['Apartment', 'Villa', 'Townhouse', 'Penthouse', 'Duplex', 'Office']
export const WEBSITE_BADGES = ['Verified Permit', 'New Launch', 'Direct Mandate', 'Waterfront']

export const website: EntityDef[] = [
  {
    key: 'website_listings', label: 'Website Listing', plural: 'Website Listings', module: 'website', icon: 'Globe',
    title: ['title'], statusField: 'status',
    fields: [
      T('reference', 'Reference', { required: true, unique: true, list: true, search: true, section: 'Listing', help: 'SWK-DXB-2026-501 style reference shown on the website' }),
      T('slug', 'URL slug', { required: true, unique: true, search: true, help: 'Page address: swkpropertiesuae.com/properties/<slug>. Lowercase words joined by hyphens.' }),
      T('title', 'Title', { required: true, list: true, search: true, span: 2 }),
      T('subtitle', 'Subtitle', { span: 3 }),
      S('purpose', 'Purpose', WEBSITE_PURPOSES, { required: true, default: 'buy', list: true }),
      S('status', 'Status', WEBSITE_STATUSES, { required: true, default: 'available', list: true }),
      S('property_type', 'Property type', WEBSITE_TYPES, { required: true, default: 'Apartment', list: true }),
      B('published', 'Show on website', { default: true, list: true }),
      B('hot_offer', 'Hot offer (promote)', { default: false, list: true, help: 'Pinned first in the listings and added to the website "Trending" spotlight.' }),
      S('badge', 'Badge', WEBSITE_BADGES, { list: true }),
      I('sort_order', 'Sort order', { help: 'Lower shows first. Hot offers always lead.' }),
      T('community', 'Community', { required: true, list: true, search: true, section: 'Location & developer' }),
      T('community_slug', 'Community slug', { help: 'Matches a website community page, e.g. downtown-dubai' }),
      T('building', 'Building / project', { list: true, search: true }),
      T('developer', 'Developer', { list: true, search: true }),
      T('developer_slug', 'Developer slug', { help: 'e.g. emaar, nakheel, binghatti' }),
      M('price_aed', 'Price (AED)', { required: true, list: true, section: 'Price & size', help: 'Sale price, or annual rent for rentals' }),
      N('bedrooms', 'Bedrooms', { min: 0, max: 20, list: true, help: '0 = Studio' }),
      N('bathrooms', 'Bathrooms', { min: 0, max: 20 }),
      N('area_sqft', 'Area (sq ft)', { min: 0, list: true }),
      S('furnished', 'Furnishing', ['Furnished', 'Unfurnished', 'Partly furnished'], { default: 'Unfurnished' }),
      S('completion', 'Completion', ['Ready', 'Off-Plan'], { default: 'Ready' }),
      T('handover', 'Handover'),
      T('payment_plan', 'Payment plan', { help: 'Off-plan only, e.g. 60/40 construction-linked' }),
      N('down_payment_pct', 'Down payment %', { min: 0, max: 100 }),
      N('service_charge_per_sqft', 'Service charge / sq ft'),
      T('agent_slug', 'Agent', { section: 'Agent & media', help: 'Website agent slug, e.g. mohammad-haseeb' }),
      T('image_url', 'Main image', { span: 3, help: 'Website image path (/img/listings/…) or full https:// address' }),
      TA('description', 'Description', { help: 'One paragraph per line' }),
      TA('features', 'Features', { help: 'One per line' }),
      D('listed_at', 'Listed on', { default: 'today', list: true }),
      J('payload', 'Website record', { heavy: true, help: 'Full website JSON (floor plan, DLD permit, map, amenities). Kept so nothing is lost on deploy.' }),
    ],
    defaultSort: { field: 'sort_order', dir: 'asc' },
  },
  {
    key: 'website_promotions', label: 'Website Promotion', plural: 'Website Promotions', module: 'website', icon: 'Megaphone',
    title: ['title'],
    fields: [
      T('title', 'Headline', { required: true, list: true, search: true, span: 2, section: 'Promotion' }),
      T('short_title', 'Short title', { help: 'Two or three words for the small rotating pill, e.g. Palm Jebel Ali' }),
      T('eyebrow', 'Eyebrow', { help: 'Small caps line, e.g. TRENDING OFF-PLAN LAUNCH · NAKHEEL', list: true }),
      S('tab', 'Spotlight tab', ['off-plan', 'secondary', 'commercial'], { required: true, default: 'off-plan', list: true }),
      B('active', 'Live on website', { default: true, list: true }),
      I('sort_order', 'Sort order'),
      T('developer', 'Developer'),
      T('community', 'Community'),
      T('price_guide', 'Price guide', { list: true, help: 'From AED 1.65M' }),
      T('plan_highlight', 'Plan highlight', { help: '80/20 Construction-Linked · 0% Buyer Fee' }),
      T('image', 'Image', { span: 3, help: 'Website image path or full https:// address' }),
      T('href', 'Link', { help: 'Website page, e.g. /off-plan/palm-jebel-ali' }),
      TA('benefits', 'Benefits', { help: 'One per line' }),
      D('starts_on', 'Starts'), D('ends_on', 'Ends', { help: 'Leave empty to keep running' }),
    ],
    defaultSort: { field: 'sort_order', dir: 'asc' },
  },
]

export const WEBSITE_URL = 'https://www.swkpropertiesuae.com'
export const WEBSITE_REPO_DEFAULT = 'swkpropertiesuae/swkproperty.com'
export const websiteImage = (p: string | null | undefined) => (!p ? '' : /^https?:\/\//.test(p) ? p : WEBSITE_URL + (p.startsWith('/') ? p : '/' + p))
