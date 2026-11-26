import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/** Persisted showroom, channel, and pipeline analytics events. */
export const analyticsEvents = pgTable('analytics_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventName: text('event_name').notNull(),
  channel: text('channel'),
  modelSlug: text('model_slug'),
  customerId: uuid('customer_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert
