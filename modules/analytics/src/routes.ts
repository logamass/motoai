import { getAllFlags, type ModuleDefinition } from '@motoai/core'
import { db } from '@motoai/core/db'
import { brands, models, variants } from '@motoai/mod-catalog/schema'
import { conversations, customers, messages } from '@motoai/mod-customers/schema'
import { LEAD_STAGES, leads, type LeadStage } from '@motoai/mod-leads/schema'
import { priceLists } from '@motoai/mod-pricing/schema'
import { desc, eq, sql } from 'drizzle-orm'
import { analyticsEvents } from './schema.js'

type RouteDefinition = NonNullable<ModuleDefinition['routes']>[number]

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const analyticsRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/summary',
    handler: async (): Promise<Response> => {
      const [
        customerCountRows,
        conversationCountRows,
        channelRows,
        leadStageRows,
        topModels,
        publishedPriceListRows,
        recentEvents,
      ] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(customers),
        db.select({ count: sql<number>`count(*)::int` }).from(conversations),
        db
          .select({
            channel: messages.channel,
            count: sql<number>`count(*)::int`,
          })
          .from(messages)
          .groupBy(messages.channel),
        db
          .select({
            stage: leads.stage,
            count: sql<number>`count(*)::int`,
          })
          .from(leads)
          .groupBy(leads.stage),
        db
          .select({
            id: models.id,
            slug: models.slug,
            name: models.name,
            bodyType: models.bodyType,
            brandName: brands.name,
            variantCount: sql<number>`count(${variants.id})::int`,
          })
          .from(models)
          .innerJoin(brands, eq(models.brandId, brands.id))
          .leftJoin(variants, eq(variants.modelId, models.id))
          .where(eq(models.active, true))
          .groupBy(models.id, models.slug, models.name, models.bodyType, brands.name)
          .orderBy(desc(sql<number>`count(${variants.id})`))
          .limit(5),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(priceLists)
          .where(eq(priceLists.status, 'published')),
        db
          .select()
          .from(analyticsEvents)
          .orderBy(desc(analyticsEvents.createdAt))
          .limit(20),
      ])

      const totalCustomers = Number(customerCountRows[0]?.count ?? 0)
      const totalConversations = Number(conversationCountRows[0]?.count ?? 0)
      const publishedPriceLists = Number(publishedPriceListRows[0]?.count ?? 0)

      const messagesByChannel: {
        whatsapp: number
        web: number
        telegram: number
        total: number
      } = {
        whatsapp: 0,
        web: 0,
        telegram: 0,
        total: 0,
      }

      for (const row of channelRows) {
        const count = Number(row.count ?? 0)
        if (row.channel === 'whatsapp' || row.channel === 'web' || row.channel === 'telegram') {
          messagesByChannel[row.channel] = count
        }
        messagesByChannel.total += count
      }

      const leadsByStage = Object.fromEntries(
        LEAD_STAGES.map((stage) => [stage, 0])
      ) as Record<LeadStage, number>

      let totalLeads = 0
      for (const row of leadStageRows) {
        const count = Number(row.count ?? 0)
        leadsByStage[row.stage] = count
        totalLeads += count
      }

      const conversionRate =
        totalConversations > 0
          ? Number(((totalLeads / totalConversations) * 100).toFixed(2))
          : 0

      return json({
        totalCustomers,
        totalConversations,
        totalLeads,
        conversionRate,
        publishedPriceLists,
        messagesByChannel,
        leadsByStage,
        topModels,
        recentEvents,
        featureFlags: getAllFlags(),
      })
    },
  },
]
