import { getSetting } from '../settings'
import { sendWhatsApp, normalizePhone } from './whatsapp'
import { logIntegration } from './log'
import { nowIso } from '../util'
import { q } from '../db'

export type ExternalPlatform = 'whatsapp' | 'facebook' | 'instagram'

export interface ExternalChannelStatus {
  platform: ExternalPlatform
  label: string
  configured: boolean
  endpoint: string
  required_permissions: string[]
  policy_note: string
}

export function getExternalMessagingChannels(): ExternalChannelStatus[] {
  const waOk = Boolean(getSetting('wa_enabled') && getSetting('wa_phone_number_id') && getSetting('wa_access_token'))
  const fbOk = Boolean(getSetting('meta_page_id') && getSetting('meta_page_access_token'))
  const igOk = Boolean(getSetting('meta_ig_user_id') && (getSetting('meta_ig_access_token') || getSetting('meta_page_access_token')))

  return [
    {
      platform: 'whatsapp',
      label: 'WhatsApp Business Cloud API',
      configured: waOk,
      endpoint: 'POST https://graph.facebook.com/v21.0/{wa_phone_number_id}/messages',
      required_permissions: ['whatsapp_business_messaging', 'whatsapp_business_management'],
      policy_note: 'Free-form text within 24h customer reply window; outside 24h requires Meta-approved Utility/Marketing template.',
    },
    {
      platform: 'facebook',
      label: 'Facebook Messenger (Meta Page)',
      configured: fbOk,
      endpoint: 'POST https://graph.facebook.com/v21.0/{meta_page_id}/messages',
      required_permissions: ['pages_messaging', 'pages_manage_metadata'],
      policy_note: 'Requires recipient Page-Scoped ID (PSID) captured from inbound Page webhook; 24h standard messaging window applies.',
    },
    {
      platform: 'instagram',
      label: 'Instagram Direct (Professional Account)',
      configured: igOk,
      endpoint: 'POST https://graph.facebook.com/v21.0/{meta_ig_user_id}/messages',
      required_permissions: ['instagram_manage_messages', 'pages_manage_metadata'],
      policy_note: 'Requires linked IG Professional account + recipient IGSID from inbound DM webhook; 24h window applies.',
    },
  ]
}

export async function sendExternalPlatformMessage(args: {
  platform: ExternalPlatform
  recipient: string
  text: string
  template?: string
  senderUserId: number
  senderName: string
}): Promise<{ ok: boolean; platform: ExternalPlatform; message_id?: string; error?: string }> {
  const cleanRecipient = String(args.recipient || '').trim()
  const cleanText = String(args.text || '').trim()
  if (!cleanRecipient) return { ok: false, platform: args.platform, error: 'Recipient phone or Meta PSID/IGSID is required.' }
  if (!cleanText) return { ok: false, platform: args.platform, error: 'Message text is required.' }

  if (args.platform === 'whatsapp') {
    const phone = normalizePhone(cleanRecipient)
    if (!phone) return { ok: false, platform: 'whatsapp', error: 'Invalid WhatsApp phone number.' }
    const res = await sendWhatsApp(phone, cleanText, {
      origin: 'swk_inside',
      tpl: args.template,
    })
    recordExternalCommunication('WhatsApp', phone, cleanText, res.ok, args.senderUserId)
    return { ok: res.ok, platform: 'whatsapp', error: res.error }
  }

  if (args.platform === 'facebook') {
    const pageId = String(getSetting('meta_page_id') || '').trim()
    const token = String(getSetting('meta_page_access_token') || '').trim()
    if (!pageId || !token) {
      return {
        ok: false,
        platform: 'facebook',
        error: 'Facebook Messenger is not configured yet. Add meta_page_id and meta_page_access_token in Admin Settings.',
      }
    }
    try {
      const resp = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_type: 'RESPONSE',
          recipient: { id: cleanRecipient },
          message: { text: cleanText },
        }),
        signal: AbortSignal.timeout(15_000),
      })
      const data: any = await resp.json().catch(() => ({}))
      const ok = resp.ok && !data?.error
      const err = ok ? undefined : String(data?.error?.message || `Meta Messenger API error (${resp.status})`)
      logIntegration('facebook_messenger', 'outbound_send', ok, ok ? `Sent to ${cleanRecipient}` : (err || 'Failed'), { recipient: cleanRecipient, status: resp.status, message_id: data?.message_id })
      recordExternalCommunication('Facebook Messenger', cleanRecipient, cleanText, ok, args.senderUserId, data?.message_id)
      return { ok, platform: 'facebook', message_id: data?.message_id, error: err }
    } catch (e: any) {
      const err = e?.message || 'Meta Messenger request failed'
      logIntegration('facebook_messenger', 'outbound_send', false, err, { recipient: cleanRecipient })
      return { ok: false, platform: 'facebook', error: err }
    }
  }

  // Instagram Direct via Meta Graph API v21.0
  const igUserId = String(getSetting('meta_ig_user_id') || '').trim()
  const igToken = String(getSetting('meta_ig_access_token') || getSetting('meta_page_access_token') || '').trim()
  if (!igUserId || !igToken) {
    return {
      ok: false,
      platform: 'instagram',
      error: 'Instagram DM is not configured yet. Add meta_ig_user_id and meta_ig_access_token in Admin Settings.',
    }
  }
  try {
    const resp = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(igUserId)}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${igToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: cleanRecipient },
        message: { text: cleanText },
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const data: any = await resp.json().catch(() => ({}))
    const ok = resp.ok && !data?.error
    const err = ok ? undefined : String(data?.error?.message || `Meta Instagram API error (${resp.status})`)
    logIntegration('instagram_dm', 'outbound_send', ok, ok ? `Sent to ${cleanRecipient}` : (err || 'Failed'), { recipient: cleanRecipient, status: resp.status, message_id: data?.message_id })
    recordExternalCommunication('Instagram DM', cleanRecipient, cleanText, ok, args.senderUserId, data?.message_id)
    return { ok, platform: 'instagram', message_id: data?.message_id, error: err }
  } catch (e: any) {
    const err = e?.message || 'Meta Instagram request failed'
    logIntegration('instagram_dm', 'outbound_send', false, err, { recipient: cleanRecipient })
    return { ok: false, platform: 'instagram', error: err }
  }
}

function recordExternalCommunication(
  channel: string,
  recipient: string,
  body: string,
  ok: boolean,
  userId: number,
  externalId?: string,
) {
  try {
    const now = nowIso()
    q.run(
      `INSERT INTO communications (channel, direction, to_address, subject, body, status, external_id, sent_at, created_at, updated_at, created_by, updated_by)
       VALUES (?, 'Outbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      channel,
      recipient,
      `SWK Inside → ${channel}`,
      body.slice(0, 4000),
      ok ? 'Sent' : 'Failed',
      externalId ?? null,
      now,
      now,
      now,
      userId,
      userId,
    )
  } catch {
    // communications table logging is best-effort
  }
}
