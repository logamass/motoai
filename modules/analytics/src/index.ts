import { defineModule } from '@motoai/core'
import { db } from '@motoai/core/db'
import { analyticsRoutes } from './routes.js'
import { analyticsEvents } from './schema.js'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface LeadCreatedEventPayload {
  leadId: string
  customerId: string
  conversationId?: string | null
  stage: string
}

interface IngestionPublishedEventPayload {
  jobId: string
  priceListId: string
  dealerId: string
}

async function recordEvent(params: {
  eventName: string
  channel?: string | null
  modelSlug?: string | null
  customerId?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const validCustomerId =
      params.customerId && UUID_REGEX.test(params.customerId)
        ? params.customerId
        : null

    await db.insert(analyticsEvents).values({
      eventName: params.eventName,
      channel: params.channel ?? null,
      modelSlug: params.modelSlug ?? null,
      customerId: validCustomerId,
      metadata: params.metadata ?? {},
    })
  } catch (err) {
    console.warn(`[analytics] Failed to record event "${params.eventName}":`, err)
  }
}

export const analyticsModule = defineModule({
  name: 'analytics',
  dependsOn: ['customers', 'leads', 'pricing'],
  schema: {
    analyticsEvents,
  },
  routes: analyticsRoutes,
  events: {
    'lead:created': async (data: LeadCreatedEventPayload) => {
      await recordEvent({
        eventName: 'lead:created',
        customerId: data?.customerId ?? null,
        metadata: {
          leadId: data?.leadId ?? null,
          conversationId: data?.conversationId ?? null,
          stage: data?.stage ?? 'new',
        },
      })
    },
    'ingestion:published': async (data: IngestionPublishedEventPayload) => {
      await recordEvent({
        eventName: 'ingestion:published',
        metadata: {
          jobId: data?.jobId ?? null,
          priceListId: data?.priceListId ?? null,
          dealerId: data?.dealerId ?? null,
        },
      })
    },
  },
})

export default analyticsModule
