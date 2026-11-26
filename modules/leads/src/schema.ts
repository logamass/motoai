import { customers } from '@motoai/mod-customers/schema'
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const LEAD_STAGES = [
  'new',
  'qualified',
  'test_drive',
  'negotiation',
  'won',
  'lost',
] as const

export type LeadStage = (typeof LEAD_STAGES)[number]

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id'),
  dealerId: uuid('dealer_id'),
  stage: text('stage', { enum: LEAD_STAGES }).notNull().default('new'),
  shortlistedVariantIds: jsonb('shortlisted_variant_ids').$type<string[]>().notNull().default([]),
  testDriveSlot: text('test_drive_slot'),
  assignedHuman: text('assigned_human'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Lead = typeof leads.$inferSelect
export type NewLead = typeof leads.$inferInsert
