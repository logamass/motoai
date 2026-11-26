/**
 * Channel router — persists conversations/messages in Postgres and routes
 * normalized inbound messages through the AI agent.
 */

import { runAgent, type AgentContext, type AgentMessage } from '@motoai/agent'
import { db } from '@motoai/core/db'
import {
  conversations,
  customers,
  messages,
  type Customer,
  type Conversation,
  type MessageToolCall,
} from '@motoai/mod-customers/schema'
import { desc, eq } from 'drizzle-orm'
import type { CtaUrlButton, InboundMessage, OutboundMessage, QuickReplyButton } from './types.js'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HISTORY_LIMIT = 12
const HUMAN_TAKEOVER_ACK =
  'A showroom advisor is currently handling your chat and will reply shortly.'

interface AgentResultExtras {
  buttons?: QuickReplyButton[]
  ctaUrl?: CtaUrlButton | string
}

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value)
}

async function findOrCreateCustomer(msg: InboundMessage): Promise<Customer> {
  const senderId = msg.senderId
  const senderIsUuid = isValidUuid(senderId)

  let existing: Customer | undefined

  if (senderIsUuid) {
    const [byId] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, senderId))
      .limit(1)
    existing = byId
  }

  if (!existing) {
    const [byWaId] = await db
      .select()
      .from(customers)
      .where(eq(customers.waId, senderId))
      .limit(1)
    existing = byWaId
  }

  if (existing) {
    if (msg.senderName && !existing.name) {
      const [updated] = await db
        .update(customers)
        .set({ name: msg.senderName, updatedAt: new Date() })
        .where(eq(customers.id, existing.id))
        .returning()
      if (updated) return updated
    }
    return existing
  }

  const [created] = await db
    .insert(customers)
    .values({
      ...(senderIsUuid ? { id: senderId } : { waId: senderId }),
      ...(msg.channel === 'whatsapp' ? { waId: senderId, phone: senderId } : {}),
      name: msg.senderName ?? null,
    })
    .returning()

  return created
}

async function findOrCreateConversation(
  msg: InboundMessage,
  customerId: string
): Promise<Conversation> {
  const convIsUuid = isValidUuid(msg.conversationId)

  if (convIsUuid) {
    const [existing] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, msg.conversationId))
      .limit(1)
    if (existing) {
      return existing
    }
  } else {
    const [latest] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.customerId, customerId))
      .orderBy(desc(conversations.updatedAt))
      .limit(1)
    if (latest) {
      return latest
    }
  }

  const [created] = await db
    .insert(conversations)
    .values({
      ...(convIsUuid ? { id: msg.conversationId } : {}),
      customerId,
    })
    .returning()

  return created
}

function toMessageToolCalls(
  toolCalls: Array<{ name: string; input: unknown; result: unknown }>
): MessageToolCall[] {
  return toolCalls.map((call) => ({
    name: call.name,
    input:
      call.input && typeof call.input === 'object' && !Array.isArray(call.input)
        ? (call.input as Record<string, unknown>)
        : { value: call.input },
    result: call.result,
  }))
}

/**
 * Route an inbound channel message through persistence, human-takeover check,
 * and the AI agent, returning an OutboundMessage.
 */
export async function routeInboundMessage(
  msg: InboundMessage,
  history: AgentMessage[] = []
): Promise<OutboundMessage> {
  let activeConversationId = msg.conversationId
  let activeCustomerId = msg.senderId
  let effectiveHistory = history
  let humanTakeover = false
  let dbPersistenceActive = false

  try {
    const customer = await findOrCreateCustomer(msg)
    activeCustomerId = customer.id

    const conversation = await findOrCreateConversation(msg, customer.id)
    activeConversationId = conversation.id
    humanTakeover = conversation.humanTakeover === true

    if (history.length === 0) {
      const recentRows = await db
        .select({
          role: messages.role,
          content: messages.content,
        })
        .from(messages)
        .where(eq(messages.conversationId, conversation.id))
        .orderBy(desc(messages.createdAt))
        .limit(HISTORY_LIMIT)

      effectiveHistory = recentRows
        .reverse()
        .filter((row): row is { role: 'user' | 'assistant'; content: string } => {
          return row.role === 'user' || row.role === 'assistant'
        })
        .map((row) => ({
          role: row.role,
          content: row.content,
        }))
    }

    await db.insert(messages).values({
      conversationId: conversation.id,
      channel: msg.channel,
      role: 'user',
      content: msg.text,
    })

    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversation.id))

    dbPersistenceActive = true
  } catch (err) {
    console.warn('[channel/router] DB persistence unavailable, continuing in-memory:', err)
  }

  if (humanTakeover) {
    return {
      channel: msg.channel,
      recipientId: msg.senderId,
      conversationId: activeConversationId,
      text: HUMAN_TAKEOVER_ACK,
      humanTakeover: true,
      toolCalls: [],
      metadata: { humanTakeover: true },
    }
  }

  const agentChannel: AgentContext['channel'] =
    msg.channel === 'whatsapp' ? 'whatsapp' : 'web'

  const result = await runAgent(msg.text, {
    conversationId: activeConversationId,
    customerId: activeCustomerId,
    history: effectiveHistory,
    channel: agentChannel,
    systemPromptExtra:
      msg.channel === 'telegram' ? 'Original channel: telegram' : undefined,
  })

  if (dbPersistenceActive && isValidUuid(activeConversationId)) {
    try {
      await db.insert(messages).values({
        conversationId: activeConversationId,
        channel: msg.channel,
        role: 'assistant',
        content: result.reply,
        toolCalls:
          result.toolCalls.length > 0 ? toMessageToolCalls(result.toolCalls) : null,
      })

      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, activeConversationId))
    } catch (err) {
      console.warn('[channel/router] Failed to persist assistant message:', err)
    }
  }

  const extras = result as typeof result & AgentResultExtras

  return {
    channel: msg.channel,
    recipientId: msg.senderId,
    conversationId: activeConversationId,
    text: result.reply,
    language: result.language,
    toolCalls: result.toolCalls,
    ...(extras.buttons
      ? { buttons: extras.buttons, quickReplies: extras.buttons }
      : {}),
    ...(extras.ctaUrl
      ? {
          ctaUrl: extras.ctaUrl,
          ...(typeof extras.ctaUrl === 'object' ? { ctaButton: extras.ctaUrl } : {}),
        }
      : {}),
  }
}
