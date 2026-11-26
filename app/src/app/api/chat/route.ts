import { NextResponse } from 'next/server'
import type { AgentMessage } from '@motoai/agent'
import { routeInboundMessage, webWidgetAdapter, type InboundMessage } from '@motoai/channel'
import { ensureBooted } from '@/lib/bootstrap'

export const dynamic = 'force-dynamic'

type SupportedChatChannel = 'web' | 'whatsapp'

interface ChatRequestBody {
  message?: unknown
  conversationId?: unknown
  senderId?: unknown
  channel?: unknown
  history?: unknown
}

function sanitizeHistory(raw: unknown): AgentMessage[] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw.filter((item): item is AgentMessage => {
    if (!item || typeof item !== 'object') return false
    const record = item as Record<string, unknown>
    return (
      (record.role === 'user' || record.role === 'assistant') &&
      typeof record.content === 'string' &&
      record.content.trim().length > 0
    )
  })
}

function parseChannel(raw: unknown): SupportedChatChannel | null {
  if (raw === undefined || raw === null) {
    return 'web'
  }
  if (raw === 'web' || raw === 'whatsapp') {
    return raw
  }
  return null
}

/**
 * Unified chat endpoint — routes inbound web or WhatsApp simulator messages through the AI agent.
 */
export async function POST(req: Request): Promise<NextResponse> {
  await ensureBooted()

  let body: ChatRequestBody
  try {
    body = (await req.json()) as ChatRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const channel = parseChannel(body.channel)
  if (!channel) {
    return NextResponse.json(
      { error: 'Field "channel" must be "web" or "whatsapp"' },
      { status: 400 }
    )
  }

  const inboundMessages = webWidgetAdapter.parseInbound(body)
  const parsed = inboundMessages[0]
  if (!parsed) {
    return NextResponse.json(
      { error: 'Field "message" must be a non-empty string' },
      { status: 400 }
    )
  }

  const conversationId =
    typeof body.conversationId === 'string' && body.conversationId.trim().length > 0
      ? body.conversationId.trim()
      : parsed.conversationId

  const senderId =
    typeof body.senderId === 'string' && body.senderId.trim().length > 0
      ? body.senderId.trim()
      : parsed.senderId

  const inbound: InboundMessage = {
    ...parsed,
    channel,
    conversationId,
    senderId,
  }

  try {
    const history = sanitizeHistory(body.history)
    const outbound = await routeInboundMessage(inbound, history)

    return NextResponse.json({
      reply: outbound.text,
      conversationId: outbound.conversationId,
      language: outbound.language ?? 'en',
      buttons: outbound.quickReplies ?? [],
      ctaUrl: outbound.ctaButton ?? null,
      toolCallsCount: outbound.toolCalls?.length ?? 0,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to process chat message'
    console.error('[/api/chat] Error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
