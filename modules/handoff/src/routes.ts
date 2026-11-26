import type { ModuleDefinition } from '@motoai/core'
import { env } from '@motoai/core/config'
import { db } from '@motoai/core/db'
import { conversations, customers } from '@motoai/mod-customers/schema'
import { eq } from 'drizzle-orm'
import { webSessions } from './schema.js'
import { hashHandoffToken, verifyHandoffToken } from './token.js'

type RouteDefinition = NonNullable<ModuleDefinition['routes']>[number]

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const handoffRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/verify',
    handler: async (req: Request): Promise<Response> => {
      let body: Record<string, unknown>
      try {
        body = (await req.json()) as Record<string, unknown>
      } catch {
        return json({ valid: false, error: 'Invalid JSON request body' }, 400)
      }

      const token = typeof body.token === 'string' ? body.token.trim() : ''
      if (!token) {
        return json({ valid: false, error: 'token is required' }, 400)
      }

      const secret = process.env.HANDOFF_SECRET || env.NEXTAUTH_SECRET
      const verification = verifyHandoffToken(token, secret)

      if (!verification.valid) {
        const message =
          verification.reason === 'expired'
            ? 'Handoff token has expired'
            : 'Invalid handoff token'
        return json({ valid: false, reason: verification.reason, error: message }, 401)
      }

      const { payload } = verification
      const tokenHash = hashHandoffToken(token)

      const [session] = await db
        .select()
        .from(webSessions)
        .where(eq(webSessions.tokenHash, tokenHash))
        .limit(1)

      if (session && session.expiresAt.getTime() <= Date.now()) {
        return json({ valid: false, reason: 'expired', error: 'Handoff session has expired' }, 401)
      }

      const [conversation] = UUID_REGEX.test(payload.conversationId)
        ? await db
            .select()
            .from(conversations)
            .where(eq(conversations.id, payload.conversationId))
            .limit(1)
        : [undefined]

      const [customer] = UUID_REGEX.test(payload.customerId)
        ? await db
            .select({
              id: customers.id,
              name: customers.name,
              city: customers.city,
              preferredLang: customers.preferredLang,
              profile: customers.profile,
            })
            .from(customers)
            .where(eq(customers.id, payload.customerId))
            .limit(1)
        : [undefined]

      return json({
        valid: true,
        session: {
          id: session?.id ?? null,
          customerId: payload.customerId,
          conversationId: payload.conversationId,
          variantId: payload.variantId ?? null,
          expiresAt: new Date(payload.exp * 1000).toISOString(),
        },
        customer: customer ?? null,
        conversation: conversation ?? null,
      })
    },
  },
]
