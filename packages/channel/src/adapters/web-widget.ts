/**
 * Web widget adapter — inbound request parser and Server-Sent Events (SSE) formatter.
 */

import { randomUUID } from 'node:crypto'
import type { ChannelAdapter, InboundMessage, OutboundMessage } from '../types.js'

export interface WebWidgetPayload {
  message?: string
  text?: string
  conversationId?: string
  sessionId?: string
  senderId?: string
  senderName?: string
  messageId?: string
  metadata?: Record<string, unknown>
}

/**
 * Parse a web widget chat payload into a normalized `InboundMessage[]`.
 */
export function parseWebWidgetInbound(payload: unknown): InboundMessage[] {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const data = payload as WebWidgetPayload
  const text = (data.message ?? data.text ?? '').trim()
  if (!text) {
    return []
  }

  const conversationId = data.conversationId || data.sessionId || randomUUID()
  const senderId = data.senderId || data.sessionId || conversationId

  return [
    {
      channel: 'web',
      messageId: data.messageId || randomUUID(),
      conversationId,
      senderId,
      senderName: data.senderName,
      text,
      timestamp: new Date(),
      metadata: data.metadata,
    },
  ]
}

/**
 * Format a Server-Sent Events (SSE) frame.
 */
export function formatSseEvent(event: string, data: unknown, id?: string): string {
  const lines: string[] = []
  if (id) {
    lines.push(`id: ${id}`)
  }
  if (event) {
    lines.push(`event: ${event}`)
  }

  const serialized = typeof data === 'string' ? data : JSON.stringify(data)
  for (const line of serialized.split(/\r?\n/)) {
    lines.push(`data: ${line}`)
  }

  return `${lines.join('\n')}\n\n`
}

/**
 * Format an outbound message as an SSE `message` frame for streaming web responses.
 */
export async function sendWebWidgetOutbound(message: OutboundMessage): Promise<string> {
  return formatSseEvent('message', message)
}

export const webWidgetAdapter: ChannelAdapter<string> = {
  name: 'web',
  parseInbound: parseWebWidgetInbound,
  sendOutbound: sendWebWidgetOutbound,
}

export {
  parseWebWidgetInbound as parseInbound,
  sendWebWidgetOutbound as sendOutbound,
}
