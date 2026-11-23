/**
 * SWK Properties team profiles shown in SWK OS (Team directory and profile pages).
 * Website staff (bio, photo, track record, developers, projects, languages) are copied from
 * swkpropertiesuae.com: src/data/team.json + agent languages in src/data/listings-expanded.json.
 * Photos live in /public/img/team (same files as the website). `email` links a profile to its OS login.
 */
export interface SwkTeamProfile {
  slug: string
  email: string | null
  name: string
  /** Public title (website wording when the person is on the website). */
  title: string
  /** Portrait path, or '' for initials. */
  photo: string
  bio: string
  deals: string
  experience: string
  developers: string[]
  projects: string[]
  specialties: string[]
  languages: string[]
  /** Listed on the public Team page of swkpropertiesuae.com. */
  onWebsite: boolean
}

export const SWK_TEAM_PROFILES: readonly SwkTeamProfile[] = [
  {
    "photo": "",
    "deals": "",
    "experience": "",
    "developers": [],
    "projects": [],
    "specialties": [],
    "languages": [],
    "onWebsite": false,
    "slug": "shabib-siraj",
    "email": "shabib@swk.properties",
    "name": "Shabib Siraj",
    "title": "Owner & Managing Director",
    "bio": "Founder and owner of SWK Properties LLC (RERA ORN 51517). Final approver for deletions, withdrawals and administrative decisions across SWK OS."
  },
  {
    "slug": "mohammad-haseeb",
    "email": "haseeb@swk.properties",
    "name": "Mohammad Haseeb",
    "title": "Sales & Operations Manager",
    "photo": "/img/team/mohammad-haseeb-2026.webp",
    "bio": "Brings sales leadership and daily transaction operations together at SWK Properties, keeping property selection, developer allocations, and handover moving smoothly across Dubai's leading master developers.",
    "deals": "140+ Verified Transactions",
    "experience": "10+ Years in UAE Real Estate",
    "developers": [
      "Emaar",
      "Azizi",
      "Sobha Realty",
      "DAMAC",
      "Imtiaz"
    ],
    "projects": [
      "Imtiaz Kore",
      "Azizi Florence",
      "Azizi Venice",
      "Emaar The Oasis",
      "Sobha Century"
    ],
    "specialties": [
      "Bulk Investor Allocations",
      "Off-Plan Launch Strategy",
      "High-Value Villa & Penthouse Closings"
    ],
    "languages": [
      "English",
      "Urdu",
      "Hindi",
      "Punjabi"
    ],
    "onWebsite": true
  },
  {
    "slug": "mohammed-islam-rex",
    "email": null,
    "name": "Mohammed Islam (Rex)",
    "title": "Assistant Director · UK & Dubai Advisory",
    "photo": "/img/team/mohammed-islam-2026.webp",
    "bio": "Brings over a decade of international real estate experience across the United Kingdom and Dubai, with a proven track record in sales, investment advisory, and client relationships. With extensive market knowledge and a client-focused approach, he is committed to delivering trusted advice, personalised service, and exceptional results.",
    "deals": "165+ Verified Transactions",
    "experience": "14+ Years (UK & Dubai)",
    "developers": [
      "Emaar",
      "Sobha Realty",
      "Ellington Properties",
      "Aldar",
      "Nakheel"
    ],
    "projects": [
      "Emaar The Oasis",
      "The Meriva Dubai Islands",
      "Ellington Berkeley Tower",
      "Address Residences Al Marjan",
      "Saadiyat Island"
    ],
    "specialties": [
      "UK & Overseas Investor Structuring",
      "Family Office Advisory",
      "Branded & Waterfront Masterplans"
    ],
    "languages": [
      "English",
      "Arabic",
      "Urdu",
      "Hindi"
    ],
    "onWebsite": true
  },
  {
    "slug": "talha-shabbir",
    "email": "talha@swk.properties",
    "name": "Talha Shabbir",
    "title": "Business Development Manager",
    "photo": "/img/team/talha-portrait.webp",
    "bio": "Serves as the primary strategist behind new investor relationships at SWK Properties. Translates an investor's capital and yield brief into a clear comparison of communities, payment schedules, and exit timelines across Dubai and the northern emirates.",
    "deals": "110+ Verified Transactions",
    "experience": "8+ Years in Dubai Property",
    "developers": [
      "DAMAC",
      "Binghatti",
      "Imtiaz",
      "Sobha Realty",
      "Azizi"
    ],
    "projects": [
      "Imtiaz Kore",
      "DAMAC Islands",
      "Binghatti Mercedes-Benz Maybach",
      "Danube Greenz",
      "Azizi Venice"
    ],
    "specialties": [
      "Yield-Driven Off-Plan Selection",
      "1% Monthly Payment Plans",
      "Corporate & Investor Onboarding"
    ],
    "languages": [
      "English",
      "Urdu",
      "Punjabi"
    ],
    "onWebsite": true
  },
  {
    "slug": "fareed-choudhary",
    "email": "fareed@swk.rent",
    "name": "Fareed Choudhary",
    "title": "Senior Property Consultant",
    "photo": "/img/team/fareed-2026.webp",
    "bio": "Helps families and long-term investors look beyond brochure renders to how a residence performs in practice: floor-plate efficiency, school proximity, service charges, and long-term resale liquidity across established communities.",
    "deals": "95+ Verified Transactions",
    "experience": "3+ Years in UAE Advisory",
    "developers": [
      "Emaar",
      "Arada",
      "Sobha Realty",
      "Nakheel",
      "Ellington"
    ],
    "projects": [
      "Dubai Hills Estate",
      "Masaar Sharjah",
      "Lunaya The Bloom Villa",
      "Al Hamra Waterfront"
    ],
    "specialties": [
      "Ready Family Villas & Townhouses",
      "Sharjah & Dubai Master Communities",
      "Secondary Market Transfers"
    ],
    "languages": [
      "English",
      "Urdu",
      "Hindi"
    ],
    "onWebsite": true
  },
  {
    "slug": "issaadi-chahrazed",
    "email": null,
    "name": "Issaadi Chahrazed",
    "title": "Off-Plan Property Consultant",
    "photo": "/img/team/issaadi-chahrazed-portrait.webp",
    "bio": "Specialises in primary off-plan launches across Dubai, Abu Dhabi, and Ras Al Khaimah. Advises French, Arabic, and English-speaking investors on early-phase developer allocations, payment plan milestones, and waterfront appreciation corridors.",
    "deals": "85+ Verified Transactions",
    "experience": "6+ Years in Off-Plan Advisory",
    "developers": [
      "Azizi",
      "Imtiaz",
      "Sobha Realty",
      "Samana",
      "Aldar"
    ],
    "projects": [
      "Azizi Florence",
      "Imtiaz Kore",
      "Azizi Venice",
      "Samana Downtown One",
      "Quattro Del Mar"
    ],
    "specialties": [
      "Launch-Day Priority Allocations",
      "Waterfront & Lagoon Developments",
      "Francophone & MENA Client Desk"
    ],
    "languages": [
      "English",
      "French",
      "Arabic"
    ],
    "onWebsite": true
  },
  {
    "slug": "saifullah",
    "email": "saifullah@swk.properties",
    "name": "Saifullah",
    "title": "Sales Agent",
    "photo": "/img/team/saifullah-portrait.webp",
    "bio": "Focused on high-demand off-plan and growth-corridor residences across Dubai South, Al Jaddaf, and Dubailand. Works closely with first-time investors and overseas buyers seeking structured post-handover payment plans and strong rental demand.",
    "deals": "60+ Verified Transactions",
    "experience": "5+ Years in Dubai Sales",
    "developers": [
      "Azizi",
      "Imtiaz",
      "Danube",
      "Samana",
      "Binghatti"
    ],
    "projects": [
      "Imtiaz Kore",
      "Azizi Florence",
      "Azizi Venice",
      "Danube Greenz",
      "Samana Downtown One"
    ],
    "specialties": [
      "High-Yield Apartments",
      "Flexible Payment Plan Launches",
      "First-Time Overseas Buyers"
    ],
    "languages": [
      "English",
      "Urdu",
      "Hindi",
      "Pashto"
    ],
    "onWebsite": true
  },
  {
    "slug": "mohammad-umar",
    "email": "umar@swk.rent",
    "name": "Mohammad Umar",
    "title": "Sales Agent",
    "photo": "/img/team/umar-portrait.webp",
    "bio": "Guides residential buyers and yield-focused landlords through off-plan reservations and ready resales across Dubailand, Warsan, and emerging island masterplans. Known for responsive viewing coordination and transparent cost breakdowns.",
    "deals": "55+ Verified Transactions",
    "experience": "4+ Years in Dubai Real Estate",
    "developers": [
      "Emaar",
      "DAMAC",
      "Azizi",
      "Dugasta",
      "Sobha Realty"
    ],
    "projects": [
      "Dugasta Platinum Residence",
      "DAMAC Islands",
      "Azizi Leily",
      "Downtown Umm Al Quwain"
    ],
    "specialties": [
      "Guaranteed-Return & Value Projects",
      "Townhouse Communities",
      "Landlord Leasing & Resale"
    ],
    "languages": [
      "English",
      "Urdu",
      "Hindi"
    ],
    "onWebsite": true
  },
  {
    "slug": "sanket-katariya",
    "email": "sanketh@swk.rent",
    "name": "Sanket Katariya",
    "title": "Sales Executive",
    "photo": "/img/team/sanket-katariya-2026.webp",
    "bio": "Advises residential buyers and yield-focused investors across Jumeirah Village Circle, Dubai Land Residence Complex (DLRC), Dubai Silicon Oasis, and emerging Dubai masterplans. Known for sharp project research, clear AED payment-plan comparisons, and responsive viewing coordination.",
    "deals": "Active Advisory Desk",
    "experience": "Dubai Residential & Off-Plan Desk",
    "developers": [
      "Emaar",
      "Binghatti",
      "Azizi",
      "DAMAC",
      "Danube"
    ],
    "projects": [
      "Binghatti JVC Boutique",
      "Azizi Venice",
      "DAMAC Lagoons",
      "Danube Greenz",
      "Dubai South Residences"
    ],
    "specialties": [
      "High-Yield Off-Plan Apartments",
      "First-Time Dubai Buyer Guidance",
      "DLRC, DSO & JVC Corridors"
    ],
    "languages": [
      "English",
      "Hindi",
      "Marathi"
    ],
    "onWebsite": true
  },
  {
    "slug": "mohd-shahid-khan",
    "email": "shahid@swk.rent",
    "name": "Mohd Shahid Khan",
    "title": "Office Admin & IT Executive",
    "photo": "/img/team/shahid-portrait.webp",
    "bio": "Manages SWK Properties' transaction administration, developer portal registrations, and digital infrastructure from Sheikh Zayed Road. Coordinates SPA documentation, Oqood filings, and post-reservation compliance across all partner developers.",
    "deals": "500+ Transactions Coordinated",
    "experience": "3+ Years in Real Estate Operations",
    "developers": [
      "Emaar",
      "DAMAC",
      "Sobha Realty",
      "Azizi",
      "Imtiaz"
    ],
    "projects": [
      "UAE Master Developer Portals",
      "Oqood & Title Deed Documentation",
      "CRM & Client Data Security"
    ],
    "specialties": [
      "Developer Portal Allocations",
      "SPA & Conveyancing Coordination",
      "IT & Operations Infrastructure"
    ],
    "languages": [
      "English",
      "Hindi",
      "Urdu"
    ],
    "onWebsite": true
  },
  {
    "photo": "",
    "deals": "",
    "experience": "",
    "developers": [],
    "projects": [],
    "specialties": [],
    "languages": [],
    "onWebsite": false,
    "slug": "rahaba-azeez",
    "email": "rahaba@swk.properties",
    "name": "Rahaba Azeez",
    "title": "HR Executive",
    "bio": "Runs human resources for SWK Properties: employee records, onboarding, leave and attendance approvals, payroll preparation and HR documentation."
  },
  {
    "photo": "",
    "deals": "",
    "experience": "",
    "developers": [],
    "projects": [],
    "specialties": [],
    "languages": [],
    "onWebsite": false,
    "slug": "meenakshi",
    "email": "meenakshi@swk.properties",
    "name": "Meenakshi",
    "title": "Office Admin",
    "bio": "Runs the 25th Floor Al Saqr Building front office: reception and walk-in enquiries, visitor and viewing calendar, company documents and support tickets."
  },
  {
    "photo": "",
    "deals": "",
    "experience": "",
    "developers": [],
    "projects": [],
    "specialties": [],
    "languages": [],
    "onWebsite": false,
    "slug": "samarth",
    "email": "samarth@swk.properties",
    "name": "Samarth",
    "title": "Property Consultant",
    "bio": "Property consultant at SWK Properties, Sheikh Zayed Road."
  }
]

export const teamProfileBySlug = (slug: string) => SWK_TEAM_PROFILES.find(p => p.slug === slug)
export const teamProfileByEmail = (email: string | null | undefined) => {
  const e = String(email || '').trim().toLowerCase()
  return e ? SWK_TEAM_PROFILES.find(p => p.email === e) : undefined
}
