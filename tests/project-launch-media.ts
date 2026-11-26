import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Minimal valid 1x1 PNG (68 bytes)
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c49444154789c63f8cfc000000301010018dd8db00000000049454e44ae426082',
  'hex',
)
const TINY_MP4 = Buffer.from('00000018667479706d703432000000006d70343269736f6d000000086d646174', 'hex')
const TINY_PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n', 'utf8')
const TINY_GLB = Buffer.from('676c544602000000140000000000000000000000', 'hex')

const dataDir = process.env.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'swk-launch-media-'))
const ownsDataDir = !process.env.DATA_DIR
process.env.DATA_DIR = dataDir
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = ''
  process.env.REQUIRE_DATABASE_URL = 'false'
}
process.env.DEMO_ENABLED = 'false'
process.env.STARTER_DATA = 'false'
process.env.NODE_ENV = 'test'

const { syncSchema } = await import('../src/server/schema')
const { seedReference } = await import('../src/server/seed')
const { ensureDirs, config } = await import('../src/server/config')
const { buildApp } = await import('../src/server/app')
const { db } = await import('../src/server/db')
const { classifyEmbedUrl } = await import('../src/shared/media')

ensureDirs()
syncSchema()
seedReference()

// 1. Unit checks for YouTube / Vimeo / Matterport / Kuula / Sketchfab embed classifier
assert.equal(classifyEmbedUrl('https://youtu.be/dQw4w9WgXcQ')?.mode, 'youtube')
assert.equal(classifyEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1')
assert.equal(classifyEmbedUrl('https://vimeo.com/123456789')?.mode, 'vimeo')
assert.equal(classifyEmbedUrl('https://my.matterport.com/show/?m=SxQL3iGyoDo')?.mode, 'iframe')
assert.equal(classifyEmbedUrl('https://kuula.co/share/collection/7l123')?.mode, 'iframe')
assert.equal(classifyEmbedUrl('https://sketchfab.com/3d-models/tower-0123456789abcdef0123456789abcdef')?.mode, 'iframe')
assert.equal(classifyEmbedUrl('/api/files/9/download', 'video/mp4')?.mode, 'video')

const app = await buildApp()

try {
  // Sign in as Admin (has properties + website + masters permissions)
  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'content-type': 'application/json', 'x-swk-client': 'web' },
    payload: { email: config.accounts.adminSwkEmail, password: config.accounts.adminSwkPassword },
  })
  assert.equal(loginRes.statusCode, 200, `Admin login failed: ${loginRes.body}`)
  const sidCookie = String(loginRes.headers['set-cookie'] || '').split(';')[0]
  assert.ok(sidCookie.startsWith('swk_sid='), 'Expected session cookie')

  const authHeaders = { cookie: sidCookie, 'x-swk-client': 'web' }

  // 2. Launch a full new developer project ("Shahrukhz by Danube") with unit mix, video, 3D tour & website publishing
  const launchRes = await app.inject({
    method: 'POST',
    url: '/api/projects/launch',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    payload: {
      title: 'Shahrukhz by Danube',
      subtitle: 'Iconic tower on Sheikh Zayed Road with 1% monthly post-handover plan',
      developer_name: 'Danube Properties',
      community_name: 'Sheikh Zayed Road',
      building_name: 'Shahrukhz Tower',
      property_type: 'Office',
      starting_price: 1850000,
      completion_year: 2029,
      handover_label: 'Q4 2029',
      payment_plan: '1% Monthly (Danube Style · 70/30 Post-Handover)',
      down_payment_pct: 10,
      roi_percent: 6,
      is_exclusive: true,
      description: 'Flagship commercial and mixed-use tower by Danube Properties.',
      features: '1% Monthly Plan, 0% Commission, Golden Visa Eligible',
      amenities: 'Sky Pool, Helipad, Executive Lounge, Valet Concierge',
      video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      virtual_tour_url: 'https://my.matterport.com/show/?m=SxQL3iGyoDo',
      units: [
        { unit_no: 'OFF-1201', unit_type: 'Office', bedrooms: 0, bathrooms: 1, area_sqft: 880, sale_price: 1850000, view: 'Sheikh Zayed Road' },
        { unit_no: 'OFF-2405', unit_type: 'Office', bedrooms: 0, bathrooms: 2, area_sqft: 1450, sale_price: 3100000, view: 'Burj Khalifa Skyline' },
      ],
      publish_to_website: true,
      hot_offer: true,
      create_spotlight: true,
    },
  })
  assert.equal(launchRes.statusCode, 200, `Project launch failed: ${launchRes.body}`)
  const launched = launchRes.json()
  assert.ok(launched.property?.id > 0, 'Expected created property id')
  assert.equal(launched.units.length, 2, 'Expected 2 created units')
  assert.ok(launched.websiteListing?.id > 0, 'Expected created website listing')
  assert.ok(launched.websitePromotion?.id > 0, 'Expected created spotlight promotion')

  const propId = launched.property.id
  const webId = launched.websiteListing.id

  // 3. Upload real PNG photo, MP4 video, PDF brochure, and GLB 3D model via multipart Media Studio endpoint
  function buildMultipart(files: { field: string; name: string; mime: string; data: Buffer }[], fields: Record<string, string>) {
    const boundary = '----SWKMediaBoundary7MA4YWxkTrZu0gW'
    const chunks: Buffer[] = []
    for (const [k, v] of Object.entries(fields)) {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`))
    }
    for (const f of files) {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.name}"\r\nContent-Type: ${f.mime}\r\n\r\n`))
      chunks.push(f.data)
      chunks.push(Buffer.from('\r\n'))
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`))
    return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` }
  }

  const mpPhoto = buildMultipart(
    [
      { field: 'file', name: 'shahrukhz-facade.png', mime: 'image/png', data: TINY_PNG },
      { field: 'file', name: 'shahrukhz-lobby.png', mime: 'image/png', data: TINY_PNG },
    ],
    { kind: 'photo', category: 'Exterior' },
  )
  const upPhotoRes = await app.inject({
    method: 'POST',
    url: `/api/media/properties/${propId}/upload`,
    headers: { ...authHeaders, 'content-type': mpPhoto.contentType },
    payload: mpPhoto.body,
  })
  assert.equal(upPhotoRes.statusCode, 200, `Photo upload failed: ${upPhotoRes.body}`)
  assert.equal(upPhotoRes.json().added.length, 2)

  const mpMixed = buildMultipart(
    [
      { field: 'file', name: 'shahrukhz-film.mp4', mime: 'video/mp4', data: TINY_MP4 },
      { field: 'file', name: 'shahrukhz-brochure.pdf', mime: 'application/pdf', data: TINY_PDF },
      { field: 'file', name: 'shahrukhz-tower.glb', mime: 'model/gltf-binary', data: TINY_GLB },
    ],
    { kind: 'brochure', category: 'Official Brochure' },
  )
  const upMixedRes = await app.inject({
    method: 'POST',
    url: `/api/media/properties/${propId}/upload`,
    headers: { ...authHeaders, 'content-type': mpMixed.contentType },
    payload: mpMixed.body,
  })
  assert.equal(upMixedRes.statusCode, 200, `Mixed media upload failed: ${upMixedRes.body}`)
  const mediaStudioRes = await app.inject({ method: 'GET', url: `/api/media/properties/${propId}`, headers: authHeaders })
  assert.equal(mediaStudioRes.statusCode, 200)
  const studio = mediaStudioRes.json()
  assert.equal(studio.items.filter((x: any) => x.kind === 'photo').length, 2)
  assert.ok(studio.items.some((x: any) => x.kind === 'video' && x.mime === 'video/mp4'))
  assert.ok(studio.items.some((x: any) => x.kind === 'tour3d' && x.url.startsWith('/api/files/')))
  assert.ok(studio.items.some((x: any) => x.kind === 'brochure' && x.mime === 'application/pdf'))

  // 4. Verify Range request streaming works on uploaded MP4 via /api/files/:id/download
  const uploadedMp4 = studio.items.find((x: any) => x.kind === 'video' && x.attachment_id)
  const rangeRes = await app.inject({
    method: 'GET',
    url: uploadedMp4.url,
    headers: { ...authHeaders, range: 'bytes=0-15' },
  })
  assert.equal(rangeRes.statusCode, 206, `Expected 206 Partial Content for MP4 Range, got ${rangeRes.statusCode}`)
  assert.equal(rangeRes.headers['content-type'], 'video/mp4')
  assert.ok(String(rangeRes.headers['content-range'] || '').startsWith('bytes 0-15/'))

  // 5. Reorder & set second photo as Cover
  const photos = studio.items.filter((x: any) => x.kind === 'photo')
  const reordered = studio.items.map((it: any) =>
    it.kind === 'photo' ? { ...it, is_cover: it.id === photos[1].id } : it,
  )
  const reorderRes = await app.inject({
    method: 'PUT',
    url: `/api/media/properties/${propId}/reorder`,
    headers: { ...authHeaders, 'content-type': 'application/json' },
    payload: { items: reordered },
  })
  assert.equal(reorderRes.statusCode, 200, `Reorder failed: ${reorderRes.body}`)
  const newCover = reorderRes.json().items.find((x: any) => x.kind === 'photo' && x.is_cover)
  assert.equal(newCover.id, photos[1].id, 'Expected second photo to become cover')

  // 6. Verify Watermarked Public Client Share Link serves watermarked uploaded PNG + scoped uploaded MP4/PDF/GLB (never leaks raw /api/files)
  const shareCreate = await app.inject({
    method: 'POST',
    url: '/api/share-links',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    payload: { entity: 'properties', ids: [propId], title: 'Shahrukhz by Danube VIP Pack' },
  })
  assert.equal(shareCreate.statusCode, 200)
  const token = shareCreate.json().token

  const pubShare = await app.inject({ method: 'GET', url: `/api/public/share/${token}` })
  assert.equal(pubShare.statusCode, 200)
  const shared = pubShare.json()
  const sharedItem = shared.items[0]
  assert.ok(sharedItem.images.length >= 2)
  assert.ok(!JSON.stringify(sharedItem).includes('/api/files/'), 'Public share payload must NEVER expose raw /api/files/ URLs')
  assert.ok(sharedItem.video_url, 'Expected video_url in public share')
  assert.ok(sharedItem.tour, 'Expected 3D tour in public share')
  assert.ok(sharedItem.brochure_url?.startsWith(`/api/public/share/${token}/asset/`), 'Expected token-scoped brochure asset URL')
  assert.ok(sharedItem.model_3d_url?.startsWith(`/api/public/share/${token}/asset/`), 'Expected token-scoped 3D GLB asset URL')

  // Fetch watermarked uploaded PNG
  const wmImgRes = await app.inject({ method: 'GET', url: sharedItem.images[0] })
  assert.equal(wmImgRes.statusCode, 200)
  assert.equal(wmImgRes.headers['content-type'], 'image/jpeg')
  assert.equal(wmImgRes.headers['x-swk-watermark'], 'logo+icon')
  assert.ok(wmImgRes.rawPayload.length > 5000, 'Expected full watermarked JPEG bytes')

  // Fetch scoped uploaded brochure PDF via public share asset route (no auth cookie required)
  const scopedPdfRes = await app.inject({ method: 'GET', url: sharedItem.brochure_url })
  assert.equal(scopedPdfRes.statusCode, 200)
  assert.equal(scopedPdfRes.headers['content-type'], 'application/pdf')

  // 7. Verify Website Studio export includes videoUrl & virtualTourUrl cleanly
  const webLinkRes = await app.inject({
    method: 'POST',
    url: `/api/media/website_listings/${webId}/link`,
    headers: { ...authHeaders, 'content-type': 'application/json' },
    payload: { kind: 'tour3d', url: 'https://my.matterport.com/show/?m=SxQL3iGyoDo', title: 'Shahrukhz 3D Showcase', set_primary: true },
  })
  assert.equal(webLinkRes.statusCode, 200)
  const cmsRes = await app.inject({ method: 'GET', url: '/api/public/website/cms' })
  assert.equal(cmsRes.statusCode, 200)
  const cms = cmsRes.json()
  const cmsLaunch = cms.featuredListings.find((l: any) => l.title === 'Shahrukhz by Danube')
  assert.ok(cmsLaunch, 'Expected Shahrukhz by Danube in public website CMS feed')
  assert.equal(cmsLaunch.videoUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  assert.equal(cmsLaunch.virtualTourUrl, 'https://my.matterport.com/show/?m=SxQL3iGyoDo')

  // 8. Verify Helmet CSP allows trusted video/3D frames while maintaining strict script-src 'self'
  const healthRes = await app.inject({ method: 'GET', url: '/api/health' })
  const csp = String(healthRes.headers['content-security-policy'] || '')
  assert.ok(csp.includes('https://www.youtube-nocookie.com'), 'CSP frame-src must allow youtube-nocookie')
  assert.ok(csp.includes('https://my.matterport.com'), 'CSP frame-src must allow matterport')
  assert.match(csp, /script-src 'self'([;\s]|$)/, 'CSP script-src must stay strict self')

  console.log('project-launch-media: PASS (launch wizard API, multipart photo/video/PDF/GLB upload, Range streaming, watermarked client share, scoped public assets, website CMS export, CSP)')
} finally {
  await app.close()
  try { db.close() } catch {}
  if (ownsDataDir) fs.rmSync(dataDir, { recursive: true, force: true })
}
