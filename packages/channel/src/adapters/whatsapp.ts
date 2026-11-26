/**
 * Meta WhatsApp Cloud API adapter (Graph API v21.0).
 *
 * Supports:
 * - Webhook GET challenge verification (`verifyChallenge`)
 * - X-Hub-Signature-256 HMAC-SHA256 verification (`verifySignature`)
 * - Inbound webhook payload parsing (`parseInbound`)
 * - Outbound sending for text, quick-reply buttons, and CTA URL buttons (`sendOutbound`)
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '@motoai/core/config'
import type { ChannelAdapter, InboundMessage, OutboundMessage } from '../types.js'

const GRAPH_API_VERSION = 'v21.0'
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

export type WhatsAppTemplateName =
  | 'price_update_notification'
  | 'test_drive_reminder'

export interface WhatsAppTemplatePayload {
  messaging_product: 'whatsapp'
  recipient_type: 'individual'
  to: string
  type: 'template'
  template: {
    name: WhatsAppTemplateName
    language: { code: string }
    components: Array<{
      type: 'body'
      parameters: Array<{ type: 'text'; text: string }>
    }>
  }
}

export interface WhatsAppSendResult {
  messaging_product: string
  contacts?: Array<{ input: string; wa_id: string }>
  messages?: Array<{ id: string }>
}

export interface WhatsAppSendOptions {
  accessToken?: string
  phoneNumberId?: string
}

export type ChallengeInput =
  | Request
  | URLSearchParams
  | {
      mode?: string | null
      token?: string | null
      challenge?: string | null
    }

interface WhatsAppWebhookPayload {
  object?: string
  entry?: Array<{
    id?: string
    changes?: Array<{
      field?: string
      value?: {
        messaging_product?: string
        metadata?: {
          display_phone_number?: string
          phone_number_id?: string
        }
        contacts?: Array<{
          profile?: { name?: string }
          wa_id?: string
        }>
        messages?: Array<{
          from?: string
          id?: string
          timestamp?: string
          type?: string
          text?: { body?: string }
          button?: { text?: string; payload?: string }
          interactive?: {
            type?: string
            button_reply?: { id?: string; title?: string }
            list_reply?: { id?: string; title?: string; description?: string }
          }
        }>
      }
    }>
  }>
}

/**
 * Verify Meta Cloud API webhook GET challenge (`hub.mode`, `hub.verify_token`, `hub.challenge`).
 */
export function verifyChallenge(
  input: ChallengeInput,
  verifyToken: string | undefined = env.WHATSAPP_VERIFY_TOKEN
): Response {
  let mode: string | null | undefined
  let token: string | null | undefined
  let challenge: string | null | undefined

  if (input instanceof Request) {
    const params = new URL(input.url).searchParams
    mode = params.get('hub.mode')
    token = params.get('hub.verify_token')
    challenge = params.get('hub.challenge')
  } else if (input instanceof URLSearchParams) {
    mode = input.get('hub.mode')
    token = input.get('hub.verify_token')
    challenge = input.get('hub.challenge')
  } else {
    mode = input.mode
    token = input.token
    challenge = input.challenge
  }

  if (mode === 'subscribe' && verifyToken && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200 })
  }

  return new Response('Forbidden', { status: 403 })
}

/**
 * Verify `X-Hub-Signature-256` HMAC-SHA256 signature on incoming Meta webhook requests.
 */
export function verifySignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  appSecret: string | undefined = env.WHATSAPP_APP_SECRET
): boolean {
  if (!appSecret || !signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false
  }

  const expected =
    'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex')

  const sigBuf = Buffer.from(signatureHeader, 'utf8')
  const expectedBuf = Buffer.from(expected, 'utf8')

  if (sigBuf.length !== expectedBuf.length) {
    return false
  }

  return timingSafeEqual(sigBuf, expectedBuf)
}

/**
 * Parse a Meta Cloud API webhook payload into normalized `InboundMessage[]`.
 */
export function parseWhatsAppInbound(payload: unknown): InboundMessage[] {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const data = payload as WhatsAppWebhookPayload
  const messages: InboundMessage[] = []

  for (const entry of data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      if (!value?.messages?.length) continue

      const contactNames = new Map<string, string>()
      for (const contact of value.contacts ?? []) {
        if (contact.wa_id && contact.profile?.name) {
          contactNames.set(contact.wa_id, contact.profile.name)
        }
      }

      for (const msg of value.messages) {
        if (!msg.from || !msg.id) continue

        const text = extractMessageText(msg)
        if (!text) continue

        const timestampSeconds = msg.timestamp ? Number(msg.timestamp) : NaN
        const timestamp = Number.isFinite(timestampSeconds)
          ? new Date(timestampSeconds * 1000)
          : new Date()

        messages.push({
          channel: 'whatsapp',
          messageId: msg.id,
          conversationId: msg.from,
          senderId: msg.from,
          senderName: contactNames.get(msg.from),
          text,
          timestamp,
          metadata: {
            phoneNumberId: value.metadata?.phone_number_id,
            messageType: msg.type,
            interactiveId:
              msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id,
          },
        })
      }
    }
  }

  return messages
}

function extractMessageText(
  msg: NonNullable<
    NonNullable<
      NonNullable<WhatsAppWebhookPayload['entry']>[number]['changes']
    >[number]['value']
  >['messages'] extends Array<infer M> | undefined
    ? M
    : never
): string {
  if (msg.type === 'text') {
    return msg.text?.body?.trim() ?? ''
  }
  if (msg.type === 'interactive') {
    return (
      msg.interactive?.button_reply?.title?.trim() ??
      msg.interactive?.list_reply?.title?.trim() ??
      msg.interactive?.button_reply?.id?.trim() ??
      msg.interactive?.list_reply?.id?.trim() ??
      ''
    )
  }
  if (msg.type === 'button') {
    return msg.button?.text?.trim() ?? msg.button?.payload?.trim() ?? ''
  }
  return ''
}

function buildOutboundPayload(message: OutboundMessage): Record<string, unknown> {
  const ctaButton =
    message.ctaButton ??
    (message.ctaUrl && typeof message.ctaUrl === 'object' ? message.ctaUrl : undefined)
  const quickReplies = message.quickReplies ?? message.buttons

  if (ctaButton) {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: message.recipientId,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        ...(ctaButton.headerText
          ? { header: { type: 'text', text: ctaButton.headerText } }
          : {}),
        body: { text: message.text },
        ...(ctaButton.footerText
          ? { footer: { text: ctaButton.footerText } }
          : {}),
        action: {
          name: 'cta_url',
          parameters: {
            display_text: ctaButton.displayText,
            url: ctaButton.url,
          },
        },
      },
    }
  }

  if (quickReplies && quickReplies.length > 0) {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: message.recipientId,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: message.text },
        action: {
          buttons: quickReplies.slice(0, 3).map((btn) => ({
            type: 'reply',
            reply: {
              id: btn.id.slice(0, 256),
              title: btn.title.slice(0, 20),
            },
          })),
        },
      },
    }
  }

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: message.recipientId,
    type: 'text',
    text: {
      preview_url: false,
      body: message.text,
    },
  }
}

/**
 * Check whether a customer's last inbound message falls inside Meta's 24-hour customer care window.
 */
export function isWithin24HourWindow(lastCustomerMessageAt: Date | null): boolean {
  if (!lastCustomerMessageAt || Number.isNaN(lastCustomerMessageAt.getTime())) {
    return false
  }
  const elapsedMs = Date.now() - lastCustomerMessageAt.getTime()
  return elapsedMs >= 0 && elapsedMs < TWENTY_FOUR_HOURS_MS
}

/**
 * Build a pre-approved Meta WhatsApp template payload for outbound messages sent outside the 24h window.
 */
export function buildTemplatePayload(
  to: string,
  templateName: WhatsAppTemplateName,
  params: string[]
): WhatsAppTemplatePayload {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en' },
      components:
        params.length > 0
          ? [
              {
                type: 'body',
                parameters: params.map((text) => ({ type: 'text', text })),
              },
            ]
          : [],
    },
  }
}

function splitOversizedSegment(segment: string, maxLen: number): string[] {
  const parts: string[] = []
  let current = ''

  for (const word of segment.split(/\s+/)) {
    if (!word) continue
    if (word.length > maxLen) {
      if (current) {
        parts.push(current)
        current = ''
      }
      for (let i = 0; i < word.length; i += maxLen) {
        parts.push(word.slice(i, i + maxLen))
      }
      continue
    }

    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxLen) {
      current = candidate
    } else {
      parts.push(current)
      current = word
    }
  }

  if (current) {
    parts.push(current)
  }

  return parts
}

/**
 * Split long WhatsApp replies cleanly on paragraph boundaries without exceeding `maxLen`.
 */
export function chunkLongMessage(text: string, maxLen = 1000): string[] {
  const trimmed = text.trim()
  if (!trimmed) {
    return []
  }
  if (maxLen <= 0 || trimmed.length <= maxLen) {
    return [trimmed]
  }

  const paragraphs = trimmed.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let current = ''

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxLen) {
      if (current) {
        chunks.push(current)
        current = ''
      }

      const lines = paragraph.split(/\n/).map((l) => l.trim()).filter(Boolean)
      for (const line of lines) {
        if (line.length > maxLen) {
          if (current) {
            chunks.push(current)
            current = ''
          }
          chunks.push(...splitOversizedSegment(line, maxLen))
        } else {
          const candidate = current ? `${current}\n${line}` : line
          if (candidate.length <= maxLen) {
            current = candidate
          } else {
            chunks.push(current)
            current = line
          }
        }
      }
      continue
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph
    if (candidate.length <= maxLen) {
      current = candidate
    } else {
      chunks.push(current)
      current = paragraph
    }
  }

  if (current) {
    chunks.push(current)
  }

  return chunks
}

/**
 * Send an outbound WhatsApp message (text, quick-reply buttons, or CTA URL button)
 * via Meta Graph API v21.0.
 */
export async function sendWhatsAppOutbound(
  message: OutboundMessage,
  options: WhatsAppSendOptions = {}
): Promise<WhatsAppSendResult> {
  const accessToken = options.accessToken ?? env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = options.phoneNumberId ?? env.WHATSAPP_PHONE_NUMBER_ID

  if (!accessToken || !phoneNumberId) {
    throw new Error(
      'WhatsApp not configured — set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID'
    )
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`
  const payload = buildOutboundPayload(message)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(
      `WhatsApp API error (${response.status}): ${errorText || response.statusText}`
    )
  }

  return (await response.json()) as WhatsAppSendResult
}

export const whatsappAdapter: ChannelAdapter<WhatsAppSendResult> = {
  name: 'whatsapp',
  parseInbound: parseWhatsAppInbound,
  sendOutbound: (message) => sendWhatsAppOutbound(message),
  async verifyWebhook(req: Request, rawBody?: string): Promise<boolean> {
    if (req.method === 'GET') {
      return verifyChallenge(req).status === 200
    }
    const body = rawBody ?? (await req.text())
    const signature = req.headers.get('x-hub-signature-256')
    return verifySignature(body, signature)
  },
}

export {
  parseWhatsAppInbound as parseInbound,
  sendWhatsAppOutbound as sendOutbound,
}
