import type { ModuleDefinition } from '@motoai/core'
import { db } from '@motoai/core/db'
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { conversations, customers, messages, type MessageChannel } from './schema.js'

type RouteDefinition = NonNullable<ModuleDefinition['routes']>[number]

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REPLY_CHANNELS = ['web', 'whatsapp'] as const

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value)
}

function extractConversationId(req: Request, suffix: 'messages' | 'takeover' | 'reply'): string | undefined {
  const url = new URL(req.url, 'http://localhost')
  const match = url.pathname.match(new RegExp(`/conversations/([^/]+)/${suffix}/?$`))
  return match?.[1]
}

export const customerRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/conversations',
    handler: async (req: Request): Promise<Response> => {
      const url = new URL(req.url, 'http://localhost')
      const customerId = url.searchParams.get('customerId')
      const stage = url.searchParams.get('stage')
      const limitParam = Number(url.searchParams.get('limit') ?? 50)
      const offsetParam = Number(url.searchParams.get('offset') ?? 0)

      const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50
      const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0

      if (customerId && !isValidUuid(customerId)) {
        return json({ error: 'Invalid customerId UUID' }, 400)
      }

      const conditions: SQL[] = []
      if (customerId) conditions.push(eq(conversations.customerId, customerId))
      if (stage) conditions.push(eq(conversations.stage, stage))

      const rows = await db
        .select({
          conversation: conversations,
          customer: {
            id: customers.id,
            name: customers.name,
            phone: customers.phone,
            waId: customers.waId,
            city: customers.city,
            preferredLang: customers.preferredLang,
          },
        })
        .from(conversations)
        .leftJoin(customers, eq(conversations.customerId, customers.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(conversations.updatedAt))
        .limit(limit)
        .offset(offset)

      const convIds = rows.map((row) => row.conversation.id)
      const countRows =
        convIds.length > 0
          ? await db
              .select({
                conversationId: messages.conversationId,
                messageCount: sql<number>`count(*)::int`,
              })
              .from(messages)
              .where(inArray(messages.conversationId, convIds))
              .groupBy(messages.conversationId)
          : []

      const messageCountByConv = new Map<string, number>(
        countRows.map((row) => [row.conversationId, Number(row.messageCount) || 0])
      )

      return json({
        conversations: rows.map((row) => ({
          ...row.conversation,
          customer: row.customer,
          messageCount: messageCountByConv.get(row.conversation.id) ?? 0,
        })),
      })
    },
  },
  {
    method: 'GET',
    path: '/conversations/:id/messages',
    handler: async (req: Request): Promise<Response> => {
      const conversationId = extractConversationId(req, 'messages')

      if (!isValidUuid(conversationId)) {
        return json({ error: 'Valid conversation id UUID is required' }, 400)
      }

      const [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1)

      if (!conversation) {
        return json({ error: 'Conversation not found' }, 404)
      }

      const rows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(asc(messages.createdAt))

      return json({
        conversation,
        messages: rows,
      })
    },
  },
  {
    method: 'PATCH',
    path: '/conversations/:id/takeover',
    handler: async (req: Request): Promise<Response> => {
      const conversationId = extractConversationId(req, 'takeover')

      if (!isValidUuid(conversationId)) {
        return json({ error: 'Valid conversation id UUID is required' }, 400)
      }

      let body: Record<string, unknown>
      try {
        body = (await req.json()) as Record<string, unknown>
      } catch {
        return json({ error: 'Invalid JSON request body' }, 400)
      }

      if (typeof body.humanTakeover !== 'boolean') {
        return json({ error: 'Field "humanTakeover" must be a boolean' }, 400)
      }

      const [updated] = await db
        .update(conversations)
        .set({
          humanTakeover: body.humanTakeover,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversationId))
        .returning()

      if (!updated) {
        return json({ error: 'Conversation not found' }, 404)
      }

      return json({ conversation: updated })
    },
  },
  {
    method: 'POST',
    path: '/conversations/:id/reply',
    handler: async (req: Request): Promise<Response> => {
      const conversationId = extractConversationId(req, 'reply')

      if (!isValidUuid(conversationId)) {
        return json({ error: 'Valid conversation id UUID is required' }, 400)
      }

      let body: Record<string, unknown>
      try {
        body = (await req.json()) as Record<string, unknown>
      } catch {
        return json({ error: 'Invalid JSON request body' }, 400)
      }

      const content = typeof body.content === 'string' ? body.content.trim() : ''
      if (!content) {
        return json({ error: 'Field "content" must be a non-empty string' }, 400)
      }

      if (
        body.channel !== undefined &&
        (typeof body.channel !== 'string' ||
          !(REPLY_CHANNELS as readonly string[]).includes(body.channel))
      ) {
        return json({ error: 'Field "channel" must be "web" or "whatsapp"' }, 400)
      }

      const [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1)

      if (!conversation) {
        return json({ error: 'Conversation not found' }, 404)
      }

      let channel: MessageChannel
      if (typeof body.channel === 'string') {
        channel = body.channel as MessageChannel
      } else {
        const [latestMsg] = await db
          .select({ channel: messages.channel })
          .from(messages)
          .where(eq(messages.conversationId, conversationId))
          .orderBy(desc(messages.createdAt))
          .limit(1)
        channel = latestMsg?.channel ?? 'web'
      }

      const [created] = await db
        .insert(messages)
        .values({
          conversationId,
          channel,
          role: 'assistant',
          content,
        })
        .returning()

      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversationId))

      return json({ message: created }, 201)
    },
  },
]
