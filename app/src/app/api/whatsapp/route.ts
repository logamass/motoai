import { NextResponse } from 'next/server'
import { env } from '@motoai/core'
import {
  routeInboundMessage,
  verifyChallenge,
  verifySignature,
  whatsappAdapter,
} from '@motoai/channel'
import { ensureBooted } from '@/lib/bootstrap'

export const dynamic = 'force-dynamic'

/**
 * Meta Cloud API webhook verification challenge handler.
 */
export async function GET(req: Request): Promise<Response> {
  await ensureBooted()
  return verifyChallenge(req)
}

/**
 * Meta Cloud API inbound WhatsApp message webhook handler.
 */
export async function POST(req: Request): Promise<NextResponse> {
  await ensureBooted()

  const rawBody = await req.text()
  const signature = req.headers.get('x-hub-signature-256')

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  const inboundMessages = whatsappAdapter.parseInbound(payload)

  for (const inbound of inboundMessages) {
    try {
      const outbound = await routeInboundMessage(inbound)
      if (env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
        await whatsappAdapter.sendOutbound(outbound)
      }
    } catch (err) {
      console.error('[/api/whatsapp] Failed to process message:', inbound.messageId, err)
    }
  }

  return NextResponse.json({ status: 'ok', processed: inboundMessages.length })
}
