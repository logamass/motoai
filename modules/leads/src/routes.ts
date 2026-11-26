import type { ModuleDefinition } from '@motoai/core'
import { db } from '@motoai/core/db'
import { emitter } from '@motoai/core/events'
import { and, desc, eq, type SQL } from 'drizzle-orm'
import { LEAD_STAGES, leads, type LeadStage } from './schema.js'

type RouteDefinition = NonNullable<ModuleDefinition['routes']>[number]

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value)
}

function isLeadStage(value: unknown): value is LeadStage {
  return typeof value === 'string' && (LEAD_STAGES as readonly string[]).includes(value)
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const leadRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/',
    handler: async (req: Request): Promise<Response> => {
      const url = new URL(req.url, 'http://localhost')
      const stage = url.searchParams.get('stage')
      const customerId = url.searchParams.get('customerId')
      const dealerId = url.searchParams.get('dealerId')
      const limitParam = Number(url.searchParams.get('limit') ?? 50)
      const offsetParam = Number(url.searchParams.get('offset') ?? 0)

      const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 50
      const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0

      if (stage && !isLeadStage(stage)) {
        return json({ error: `Invalid stage. Allowed: ${LEAD_STAGES.join(', ')}` }, 400)
      }
      if (customerId && !isValidUuid(customerId)) {
        return json({ error: 'Invalid customerId UUID' }, 400)
      }
      if (dealerId && !isValidUuid(dealerId)) {
        return json({ error: 'Invalid dealerId UUID' }, 400)
      }

      const conditions: SQL[] = []
      if (stage && isLeadStage(stage)) conditions.push(eq(leads.stage, stage))
      if (customerId) conditions.push(eq(leads.customerId, customerId))
      if (dealerId) conditions.push(eq(leads.dealerId, dealerId))

      const rows = await db
        .select()
        .from(leads)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(leads.createdAt))
        .limit(limit)
        .offset(offset)

      return json({ leads: rows })
    },
  },
  {
    method: 'POST',
    path: '/',
    handler: async (req: Request): Promise<Response> => {
      let body: Record<string, unknown>
      try {
        body = (await req.json()) as Record<string, unknown>
      } catch {
        return json({ error: 'Invalid JSON request body' }, 400)
      }

      if (!isValidUuid(body.customerId)) {
        return json({ error: 'Valid customerId UUID is required' }, 400)
      }

      if (body.stage !== undefined && !isLeadStage(body.stage)) {
        return json({ error: `Invalid stage. Allowed: ${LEAD_STAGES.join(', ')}` }, 400)
      }

      if (body.conversationId !== undefined && body.conversationId !== null && !isValidUuid(body.conversationId)) {
        return json({ error: 'Invalid conversationId UUID' }, 400)
      }

      if (body.dealerId !== undefined && body.dealerId !== null && !isValidUuid(body.dealerId)) {
        return json({ error: 'Invalid dealerId UUID' }, 400)
      }

      const stage: LeadStage = isLeadStage(body.stage) ? body.stage : 'new'
      const shortlistedVariantIds = Array.isArray(body.shortlistedVariantIds)
        ? body.shortlistedVariantIds.filter((id): id is string => typeof id === 'string')
        : []

      const [created] = await db
        .insert(leads)
        .values({
          customerId: body.customerId,
          conversationId: isValidUuid(body.conversationId) ? body.conversationId : null,
          dealerId: isValidUuid(body.dealerId) ? body.dealerId : null,
          stage,
          shortlistedVariantIds,
          testDriveSlot: typeof body.testDriveSlot === 'string' ? body.testDriveSlot : null,
          assignedHuman: typeof body.assignedHuman === 'string' ? body.assignedHuman : null,
          notes: typeof body.notes === 'string' ? body.notes : null,
        })
        .returning()

      emitter.emit('lead:created', {
        leadId: created.id,
        customerId: created.customerId,
        conversationId: created.conversationId,
        stage: created.stage,
      })

      return json({ lead: created }, 201)
    },
  },
  {
    method: 'PATCH',
    path: '/:id/stage',
    handler: async (req: Request): Promise<Response> => {
      const url = new URL(req.url, 'http://localhost')
      const match = url.pathname.match(/\/([^/]+)\/stage\/?$/)
      const leadId = match?.[1]

      if (!isValidUuid(leadId)) {
        return json({ error: 'Valid lead id UUID is required' }, 400)
      }

      let body: Record<string, unknown>
      try {
        body = (await req.json()) as Record<string, unknown>
      } catch {
        return json({ error: 'Invalid JSON request body' }, 400)
      }

      if (!isLeadStage(body.stage)) {
        return json({ error: `Invalid stage. Allowed: ${LEAD_STAGES.join(', ')}` }, 400)
      }

      const [updated] = await db
        .update(leads)
        .set({
          stage: body.stage,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, leadId))
        .returning()

      if (!updated) {
        return json({ error: 'Lead not found' }, 404)
      }

      return json({ lead: updated })
    },
  },
]
