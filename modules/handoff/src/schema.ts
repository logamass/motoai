import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const webSessions = pgTable('web_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull(),
  conversationId: uuid('conversation_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type WebSession = typeof webSessions.$inferSelect
export type NewWebSession = typeof webSessions.$inferInsert
