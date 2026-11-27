import { SWK_COMPANY_EMAIL, SWK_COMPANY_NAME, SWK_COMPANY_PHONE, SWK_RERA_ORN } from './corporate-footer'
import { assertZeroShabibPublicPayload } from './zero-shabib-guard'

export type SocialPlatformKey =
  | 'whatsapp'
  | 'instagram'
  | 'facebook'
  | 'linkedin'
  | 'x'
  | 'tiktok'
  | 'youtube'
  | 'email'

export interface SocialDraftVariant {
  headline: string
  body: string
  hashtags: string[]
  cta: string
}

export interface SocialPlatformDraft {
  platform: SocialPlatformKey
  label: string
  channel: string
  english: SocialDraftVariant
  arabic: SocialDraftVariant
}

export interface SocialKitInput {
  entity: 'properties' | 'developers' | 'communities'
  title: string
  projectName?: string
  developerName?: string
  communityName?: string
  emirate: string
  priceLabel?: string
  paymentPlan?: string
  handover?: string
  yieldPct?: number | null
  unitMix?: string
  promoBadge?: string
  promoHeadline?: string
  amenities?: string[]
  highlights?: string[]
  isOffPlan?: boolean
  shareUrl?: string
}

export interface SocialKitBundle {
  entity: SocialKitInput['entity']
  title: string
  emirate: string
  offerHighlight: string
  targetUrl: string
  platforms: SocialPlatformDraft[]
}

const cleanTag = (s: string) => s.replace(/[^A-Za-z0-9]/g, '')

export function generateSocialMediaKit(input: SocialKitInput): SocialKitBundle {
  const emirate = input.emirate || 'Dubai'
  const emirateAr = emirate === 'Abu Dhabi' ? 'أبوظبي' : 'دبي'
  const url = input.shareUrl || 'https://www.swkpropertiesuae.com'
  const permitNoticeEn = emirate === 'Abu Dhabi'
    ? 'Verify Abu Dhabi ADM / DMT advertising permit & Madmoun details before paid ad publishing.'
    : 'Verify RERA Trakheesi advertising permit & Madmoun QR before paid ad publishing.'
  const footerEn = `${SWK_COMPANY_NAME} · RERA ORN ${SWK_RERA_ORN} · ${SWK_COMPANY_PHONE} · ${url}\n(${permitNoticeEn})`
  const footerAr = `شركة SWK للعقارات ذ.م.م · ترخيص ريرا ${SWK_RERA_ORN} · ${SWK_COMPANY_PHONE} · ${url}`

  const priceLineEn = input.priceLabel ? `Starting from ${input.priceLabel}` : 'Direct Developer Allocation'
  const priceLineAr = input.priceLabel ? `الأسعار تبدأ من ${input.priceLabel}` : 'تخصيص مباشر من المطور'
  const planEn = input.paymentPlan || (input.isOffPlan ? 'Flexible Construction-Linked Payment Plan' : 'Ready Transfer · Up to 80% UAE Mortgage')
  const planAr = input.isOffPlan ? `خطة دفع مرنة (${input.paymentPlan || 'أقساط ميسرة'})` : 'جاهز للتسليم · مؤهل للتمويل العقاري حتى 80%'
  const handoverEn = input.handover ? `Handover: ${input.handover}` : ''
  const yieldEn = input.yieldPct ? `~${input.yieldPct}% Est. Gross Yield` : 'Prime Capital Appreciation'
  const topAmenities = (input.amenities || []).slice(0, 4)
  const amenitiesEn = topAmenities.length ? topAmenities.join(' · ') : 'Resort Pool · Wellness Club · Concierge · Landscaped Gardens'

  const baseHashtags = Array.from(new Set([
    `#${cleanTag(emirate)}RealEstate`,
    `#${cleanTag(emirate)}Properties`,
    input.developerName ? `#${cleanTag(input.developerName)}` : '#UAEDevelopers',
    input.communityName ? `#${cleanTag(input.communityName)}` : '#UAELuxuryLiving',
    input.isOffPlan ? '#UAEOffPlan' : '#LuxuryHomesUAE',
    '#SWKProperties',
    '#UAEGoldenVisa',
  ])).filter(h => h.length > 2)

  const arHashtags = [
    emirate === 'Abu Dhabi' ? '#عقارات_أبوظبي' : '#عقارات_دبي',
    '#استثمار_عقاري',
    '#عقارات_الإمارات',
    '#الإقامة_الذهبية',
    '#SWK_للعقارات',
  ]

  const kindLabelEn = input.entity === 'developers' ? 'Master Developer Showcase' : input.entity === 'communities' ? 'Community Investment Guide' : input.isOffPlan ? 'Off-Plan Launch Alert' : 'Signature UAE Project'
  const kindLabelAr = input.entity === 'developers' ? 'دليل المطور العقاري' : input.entity === 'communities' ? 'دليل الاستثمار المجتمعي' : input.isOffPlan ? 'إطلاق عقاري جديد على الخارطة' : 'مشروع عقاري مميز في الإمارات'

  const offerHighlight = input.promoBadge || (input.isOffPlan ? `${priceLineEn} · 0% Commission` : `${priceLineEn} · ${yieldEn}`)

  const platforms: SocialPlatformDraft[] = [
    {
      platform: 'whatsapp',
      label: 'WhatsApp Broadcast & VIP Client DM',
      channel: 'WhatsApp',
      english: {
        headline: `*${input.title}* — ${kindLabelEn} (${emirate})`,
        body: [
          `✨ *${input.title}* (${emirate})`,
          input.promoHeadline ? `🔥 ${input.promoHeadline}` : `🏛️ ${priceLineEn}`,
          ``,
          `• *Location:* ${input.communityName || emirate}, ${emirate}`,
          input.developerName ? `• *Developer:* ${input.developerName}` : '',
          input.unitMix ? `• *Residences:* ${input.unitMix}` : '',
          `• *Payment Plan:* ${planEn}`,
          handoverEn ? `• *${handoverEn}*` : '',
          `• *Yield / Growth:* ${yieldEn}`,
          `• *Key Amenities:* ${amenitiesEn}`,
          ``,
          `📎 Reply *BROCHURE* for the official PDF Brochure, Payment Plan Schedule, 3D Floor Plan & PPTX Deck.`,
          `📞 ${footerEn}`,
        ].filter(Boolean).join('\n'),
        hashtags: baseHashtags.slice(0, 3),
        cta: 'Reply BROCHURE or tap to reserve priority developer allocation (0% buyer fee).',
      },
      arabic: {
        headline: `*${input.title}* — ${kindLabelAr} (${emirateAr})`,
        body: [
          `✨ *${input.title}* — ${emirateAr}`,
          `🏛️ ${priceLineAr}`,
          ``,
          `• *الموقع:* ${input.communityName || emirateAr}، ${emirateAr}`,
          input.developerName ? `• *المطور العقاري:* ${input.developerName}` : '',
          `• *خطة الدفع:* ${planAr}`,
          input.handover ? `• *التسليم المتوقع:* ${input.handover}` : '',
          `• *العائد الاستثماري:* ${input.yieldPct ? `حتى ${input.yieldPct}% عائد إيجاري سنوي` : 'نمو رأسمالي متميز'}`,
          ``,
          `📎 أرسل كلمة *كتيب* للحصول على الكتيب الرسمي PDF، جدول الدفعات، المخطط ثلاثي الأبعاد، وعرض المستثمرين.`,
          `📞 ${footerAr}`,
        ].filter(Boolean).join('\n'),
        hashtags: arHashtags.slice(0, 3),
        cta: 'تواصل معنا الآن لحجز أولوية التخصيص المباشر بدون عمولة.',
      },
    },
    {
      platform: 'instagram',
      label: 'Instagram Carousel & Reel Caption',
      channel: 'Instagram',
      english: {
        headline: `${input.title} | ${emirate}'s Next Iconic Address`,
        body: [
          `Introducing ${input.title} in ${input.communityName || emirate}, ${emirate}. ✨`,
          ``,
          `${priceLineEn} | ${planEn}${handoverEn ? ` | ${handoverEn}` : ''}`,
          ``,
          `Why investors are securing allocation now:`,
          `▸ ${input.promoBadge || 'Direct Developer Launch · 0% Buyer Commission'}`,
          `▸ ${yieldEn} & 10-Year UAE Golden Visa eligibility (AED 2M+)`,
          `▸ Signature lifestyle: ${amenitiesEn}`,
          ``,
          `DM "${(input.projectName || input.title).split(' ')[0].toUpperCase()}" for the full PDF brochure, 3D tour & payment plan sheet.`,
          ``,
          `${footerEn}`,
          baseHashtags.join(' '),
        ].join('\n'),
        hashtags: baseHashtags,
        cta: 'DM us for instant PDF brochure, 3D tour & floor plans.',
      },
      arabic: {
        headline: `${input.title} | عنوان الفخامة الجديد في ${emirateAr}`,
        body: [
          `اكتشف ${input.title} في ${input.communityName || emirateAr}، ${emirateAr}. ✨`,
          `${priceLineAr} | ${planAr}`,
          ``,
          `▸ تخصيص مباشر من المطور بدون عمولة`,
          `▸ عائد استثماري مرتفع وإقامة ذهبية لمدة 10 سنوات`,
          `▸ مرافق عالمية وتصاميم معمارية راقية`,
          ``,
          `أرسل رسالة خاصة الآن للحصول على الكتيب الرسمي وجدول الدفعات والمخطط ثلاثي الأبعاد.`,
          `${footerAr}`,
          arHashtags.join(' '),
        ].join('\n'),
        hashtags: arHashtags,
        cta: 'أرسل رسالة خاصة لاستلام الكتيب الرسمي فوراً.',
      },
    },
    {
      platform: 'facebook',
      label: 'Facebook Lead-Gen Ad & Community Post',
      channel: 'Facebook',
      english: {
        headline: `${input.title} — ${priceLineEn} in ${input.communityName || emirate}`,
        body: [
          `Looking for high-yield tax-free real estate in ${emirate}?`,
          ``,
          `Explore ${input.title}${input.developerName ? ` developed by ${input.developerName}` : ''} in ${input.communityName || emirate}.`,
          `✔ ${priceLineEn}`,
          `✔ ${planEn}`,
          handoverEn ? `✔ ${handoverEn}` : `✔ Ready Title Deed & UAE Mortgage Advisory`,
          `✔ ${emirate === 'Abu Dhabi' ? '2% ADM Registration' : '4% DLD Registration'} · 0% Capital Gains & Rental Tax`,
          `✔ Amenities: ${amenitiesEn}`,
          ``,
          `Download the full SWK Investor Pack (Brochure PDF + Payment Plan + PPTX Presentation + 3D Floor Plan) today.`,
          `Contact SWK Properties Advisory Desk: ${footerEn}`,
        ].join('\n'),
        hashtags: baseHashtags.slice(0, 5),
        cta: 'Click Learn More to download the official PDF Brochure & Payment Plan.',
      },
      arabic: {
        headline: `${input.title} — ${priceLineAr} في ${emirateAr}`,
        body: [
          `استثمر اليوم في ${input.title} في ${input.communityName || emirateAr}، ${emirateAr} بعائد إيجاري معفى من الضرائب.`,
          `✔ ${priceLineAr}`,
          `✔ ${planAr}`,
          `✔ كتيب رسمي PDF + جدول دفعات + جولة ثلاثية الأبعاد 3D`,
          ``,
          `تواصل مع فريق الاستشارات العقارية في ${footerAr}`,
        ].join('\n'),
        hashtags: arHashtags,
        cta: 'سجل الآن لتحميل الكتيب وجدول الأقساط.',
      },
    },
    {
      platform: 'linkedin',
      label: 'LinkedIn Executive Investor Briefing',
      channel: 'LinkedIn',
      english: {
        headline: `UAE Real Estate Brief: ${input.title} (${emirate})`,
        body: [
          `Market Spotlight — ${input.title}`,
          ``,
          `As institutional and global HNW demand accelerates across ${emirate}, ${input.title}${input.developerName ? ` by ${input.developerName}` : ''} stands out in ${input.communityName || emirate} with compelling risk-adjusted fundamentals:`,
          ``,
          `• Entry Valuation: ${priceLineEn}`,
          `• Capital Structure: ${planEn}`,
          `• Yield Profile: ${yieldEn} (tax-free AED income, USD-pegged currency)`,
          `• Regulatory Framework: ${emirate === 'Abu Dhabi' ? 'Abu Dhabi DMT / ADM Escrow Protection (2% registration)' : 'Dubai DLD / RERA Escrow Protection (4% registration)'}`,
          ``,
          `SWK Properties Advisory Desk has compiled the full investment dossier — including our branded PDF brochure, milestone cashflow schedule, 3D tour, and downloadable executive PPTX presentation.`,
          ``,
          `Request the dossier via direct message or visit ${url}`,
          `${SWK_COMPANY_NAME} | RERA ORN ${SWK_RERA_ORN} | ${SWK_COMPANY_EMAIL}`,
          baseHashtags.slice(0, 5).join(' '),
        ].join('\n'),
        hashtags: baseHashtags.slice(0, 5),
        cta: 'Message our Advisory Desk for the executive PPTX & cashflow sheet.',
      },
      arabic: {
        headline: `تقرير استثماري: ${input.title} في ${emirateAr}`,
        body: [
          `تحليل استثماري حصري لمشروع ${input.title} في ${input.communityName || emirateAr}، ${emirateAr}.`,
          `• نقطة الدخول: ${priceLineAr}`,
          `• هيكلة الدفع: ${planAr}`,
          `• حماية حساب الضمان الحكومي وعوائد معفاة من الضرائب بالدولار المربوط بالدرهم.`,
          `تواصل مع فريق SWK للعقارات للحصول على العرض التقديمي للمستثمرين (PPTX) ودراسة العائد.`,
          footerAr,
        ].join('\n'),
        hashtags: arHashtags,
        cta: 'اطلب الملف الاستثماري الكامل عبر الرسائل المباشرة.',
      },
    },
    {
      platform: 'x',
      label: 'X (Twitter) Launch Thread Opener',
      channel: 'X',
      english: {
        headline: `${input.title} — ${emirate} Launch Thread`,
        body: `${input.title} in ${input.communityName || emirate} (${emirate}): ${priceLineEn} · ${input.paymentPlan?.split('(')[0].trim() || planEn}${handoverEn ? ` · ${handoverEn}` : ''}. Full PDF brochure, 3D tour & payment plan ready via ${SWK_COMPANY_NAME}: ${url} ${baseHashtags.slice(0, 3).join(' ')}`,
        hashtags: baseHashtags.slice(0, 3),
        cta: 'Reply "DECK" for the investor PPTX & PDF payment plan.',
      },
      arabic: {
        headline: `${input.title} في ${emirateAr}`,
        body: `إطلاق مميز: ${input.title} في ${input.communityName || emirateAr} (${emirateAr}) — ${priceLineAr}. الكتيب الرسمي وجدول الدفعات متوفر الآن عبر SWK للعقارات: ${url} ${arHashtags.slice(0, 3).join(' ')}`,
        hashtags: arHashtags.slice(0, 3),
        cta: 'تواصل معنا للحصول على العرض التقديمي وجدول الدفعات.',
      },
    },
    {
      platform: 'tiktok',
      label: 'TikTok & Reels 30-Second Video Script',
      channel: 'TikTok',
      english: {
        headline: `30s Hook Script: Inside ${input.title} (${emirate})`,
        body: [
          `[0-3s HOOK — Exterior Drone / 3D Reveal]`,
          `"Stop scrolling if you're looking at ${emirate} real estate in 2026 — here's ${input.title}!"`,
          ``,
          `[4-12s VALUE — Amenities & Floorplan Cutaway]`,
          `"Located in ${input.communityName || emirate}, starting from ${input.priceLabel || 'attractive launch pricing'}, with ${amenitiesEn}."`,
          ``,
          `[13-22s NUMBERS — Payment Plan Overlay]`,
          `"${planEn}${handoverEn ? `, ${handoverEn}` : ''}, targeting ${yieldEn} — completely tax-free in AED!"`,
          ``,
          `[23-30s CTA — SWK Branded End Card]`,
          `"Comment '${(input.projectName || 'VIP').split(' ')[0].toUpperCase()}' or tap the link in bio for the instant PDF brochure, 3D tour & floor plans from SWK Properties (RERA ORN ${SWK_RERA_ORN})."`,
          baseHashtags.slice(0, 5).join(' '),
        ].join('\n'),
        hashtags: baseHashtags.slice(0, 5),
        cta: 'Comment VIP for the brochure link & payment plan.',
      },
      arabic: {
        headline: `سيناريو فيديو قصير 30 ثانية: ${input.title}`,
        body: [
          `[0-3 ثانية — افتتاحية جذابة]: "هل تبحث عن أفضل فرصة استثمارية في ${emirateAr}؟ تعرف على ${input.title}!"`,
          `[4-15 ثانية — جولة سريعة]: "في قلب ${input.communityName || emirateAr}، ${priceLineAr}، مع ${planAr}."`,
          `[16-30 ثانية — دعوة للتواصل]: "اكتب كلمة تفاصيل في التعليقات لنرسل لك الكتيب الرسمي والجولة ثلاثية الأبعاد من SWK للعقارات!"`,
          arHashtags.join(' '),
        ].join('\n'),
        hashtags: arHashtags,
        cta: 'اكتب "تفاصيل" في التعليقات لاستلام الكتيب.',
      },
    },
    {
      platform: 'youtube',
      label: 'YouTube Tour Title, Description & Chapters',
      channel: 'YouTube',
      english: {
        headline: `${input.title} | Full Walkthrough, 3D Tour, Payment Plan & ROI Review (${emirate} 2026)`,
        body: [
          `Explore ${input.title} in ${input.communityName || emirate}, ${emirate} with ${SWK_COMPANY_NAME}.`,
          ``,
          `📌 Key Highlights:`,
          `- Price Guide: ${priceLineEn}`,
          `- Payment Plan: ${planEn}`,
          handoverEn ? `- ${handoverEn}` : `- Status: Ready / Prime UAE Inventory`,
          `- Projected Rental Yield: ${yieldEn}`,
          `- Amenities: ${amenitiesEn}`,
          ``,
          `⏱️ Video Chapters:`,
          `00:00 Architectural Exterior & Arrival`,
          `00:25 ${input.communityName || emirate} Location & 3D Masterplan`,
          `00:50 Residences, Interiors & 3D Floor Plan Breakdown`,
          `01:25 Payment Plan, ${emirate === 'Abu Dhabi' ? '2% ADM' : '4% DLD'} Fees & ROI Math`,
          `01:55 How to Reserve Direct Allocation with SWK Properties`,
          ``,
          `📩 Download Official Brochure PDF, Payment Plan PDF & PPTX Deck:`,
          `${footerEn}`,
          `Email: ${SWK_COMPANY_EMAIL}`,
          baseHashtags.join(' '),
        ].join('\n'),
        hashtags: baseHashtags,
        cta: 'Book a private viewing or Zoom walkthrough via WhatsApp.',
      },
      arabic: {
        headline: `جولة كاملة في ${input.title} | الأسعار، خطة الدفع والعائد الاستثماري في ${emirateAr}`,
        body: [
          `جولة عقارية شاملة في ${input.title} بمنطقة ${input.communityName || emirateAr}، ${emirateAr} مقدمة من شركة SWK للعقارات.`,
          `• ${priceLineAr}`,
          `• ${planAr}`,
          `لتحميل الكتيب الرسمي وجدول الدفعات وحجز معاينة خاصة: ${footerAr}`,
          arHashtags.join(' '),
        ].join('\n'),
        hashtags: arHashtags,
        cta: 'احجز جولة خاصة أو استشارة مجانية عبر واتساب.',
      },
    },
    {
      platform: 'email',
      label: 'VIP Investor Email Newsletter',
      channel: 'Email',
      english: {
        headline: `Exclusive UAE Portfolio Brief: ${input.title} (${priceLineEn})`,
        body: [
          `Dear Valued Investor,`,
          ``,
          `We are pleased to share our curated executive brief for ${input.title} in ${input.communityName || emirate}, ${emirate}.`,
          ``,
          `EXECUTIVE SNAPSHOT`,
          `• Project / Focus: ${input.title}`,
          input.developerName ? `• Developer: ${input.developerName}` : '',
          `• Location: ${input.communityName || emirate}, ${emirate}, UAE`,
          `• Price Guide: ${priceLineEn}`,
          `• Payment Plan: ${planEn}`,
          handoverEn ? `• ${handoverEn}` : '',
          `• Yield & Outlook: ${yieldEn}`,
          `• Amenities: ${amenitiesEn}`,
          ``,
          `INCLUDED IN YOUR DEDICATED CLIENT PACK`,
          `1. Official Branded Brochure (PDF)`,
          `2. Full Milestone Payment Plan & ${emirate === 'Abu Dhabi' ? '2% ADM' : '4% DLD'} Fee Schedule (PDF)`,
          `3. Executive Presentation Deck (PowerPoint .PPTX)`,
          `4. Interactive 3D Masterplan & Floor Plan Tour`,
          ``,
          `Reply to this email or call our Advisory Desk directly on ${SWK_COMPANY_PHONE} to arrange a private presentation or secure priority allocation.`,
          ``,
          `Warm regards,`,
          `Private Client Advisory Desk`,
          `${footerEn}`,
        ].filter(Boolean).join('\n'),
        hashtags: [],
        cta: 'Reply to schedule a private presentation or request unit availability.',
      },
      arabic: {
        headline: `ملف استثماري حصري: ${input.title} — ${emirateAr}`,
        body: [
          `عميلنا العزيز،`,
          ``,
          `يسر شركة SWK للعقارات أن تقدم لكم الملف الاستثماري المتكامل لمشروع ${input.title} في ${input.communityName || emirateAr}، ${emirateAr}.`,
          `• ${priceLineAr}`,
          `• ${planAr}`,
          `مرفق لكم الكتيب الرسمي PDF، جدول الدفعات التفصيلي، والعرض التقديمي للمستثمرين PPTX.`,
          `تواصلوا معنا مباشرة على ${SWK_COMPANY_PHONE} لحجز استشارة خاصة أو زيارة ميدانية.`,
          `مع أطيب التحيات،`,
          footerAr,
        ].join('\n'),
        hashtags: [],
        cta: 'قم بالرد على البريد لحجز استشارة عقارية خاصة.',
      },
    },
  ]

  const bundle: SocialKitBundle = {
    entity: input.entity,
    title: input.title,
    emirate,
    offerHighlight,
    targetUrl: url,
    platforms,
  }
  assertZeroShabibPublicPayload(bundle, `Social Media Kit (${input.title})`)
  return bundle
}
