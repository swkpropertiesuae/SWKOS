/**
 * Builds the SWK OS launcher icon set: public/brand/apps/<app>.svg.
 * Corporate glass tile in the swkpropertiesuae.com palette: deep petrol body, hairline architectural grid,
 * SWK crest gold glyph, crest-gold accent. Run: npx tsx tools/brand/app-icons.tsx
 */
import { writeFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MessageCircleMore,SquareCheckBig,Gauge,Building2,UsersRound,Handshake,KeyRound,Landmark,Wallet,ShieldCheck,Globe,Contact,MapPinned,ScrollText,Settings2,Fingerprint,BookOpen,TrendingUp,LayoutGrid,type LucideIcon } from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  messages: MessageCircleMore, work: SquareCheckBig, command: Gauge, inventory: Building2, clients: UsersRound, sales: Handshake, leasing: KeyRound,
  owners: Landmark, finance: Wallet, compliance: ShieldCheck, website: Globe, team: Contact, field: MapPinned, tools: ScrollText, admin: Settings2,
  attendance: Fingerprint, manual: BookOpen, market_pulse: TrendingUp, general: LayoutGrid,
}

const glyph = (I: LucideIcon) => renderToStaticMarkup(createElement(I, { size: 24 })).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')

for (const [key, I] of Object.entries(ICONS)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-hidden="true">
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22424c"/><stop offset=".55" stop-color="#12303a"/><stop offset="1" stop-color="#0b2027"/></linearGradient>
    <linearGradient id="gold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="24" y2="24"><stop offset="0" stop-color="#f3dca6"/><stop offset=".5" stop-color="#d4ab5f"/><stop offset="1" stop-color="#a77b33"/></linearGradient>
    <radialGradient id="mint" cx=".9" cy=".95" r=".5"><stop offset="0" stop-color="#d4a752" stop-opacity=".3"/><stop offset="1" stop-color="#d4a752" stop-opacity="0"/></radialGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <pattern id="grid" width="8" height="120" patternUnits="userSpaceOnUse"><rect width="1" height="120" fill="#fff" fill-opacity=".045"/></pattern>
    <clipPath id="tile"><rect x="6" y="6" width="108" height="108" rx="28"/></clipPath>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#0f2a33" flood-opacity=".22"/></filter>
  </defs>
  <g filter="url(#drop)">
    <rect x="6" y="6" width="108" height="108" rx="28" fill="url(#body)"/>
    <g clip-path="url(#tile)">
      <rect x="6" y="6" width="108" height="108" fill="url(#grid)"/>
      <rect x="6" y="6" width="108" height="108" fill="url(#mint)"/>
      <rect x="6" y="6" width="108" height="56" fill="url(#sheen)"/>
    </g>
    <rect x="6.5" y="6.5" width="107" height="107" rx="27.5" fill="none" stroke="#fff" stroke-opacity=".12"/>
  </g>
  <g transform="translate(30 30) scale(2.5)" fill="none" stroke="url(#gold)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${glyph(I)}</g>
  <circle cx="92" cy="28" r="4.5" fill="#d4a752"/><circle cx="92" cy="28" r="8" fill="#d4a752" fill-opacity=".18"/>
</svg>
`
  writeFileSync(`public/brand/apps/${key}.svg`, svg)
}
console.log(`wrote ${Object.keys(ICONS).length} icons`)
