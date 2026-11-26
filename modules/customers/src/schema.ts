import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export interface CustomerProfile {
  familySize?: number
  budgetMin?: number
  budgetMax?: number
  usage?: string
  fuelPreference?: string
  transmissionPreference?: string
  [key: string]: unknown
}

export interface MessageToolCall {
  name: string
  input: Record<string, unknown>
  result: unknown
}

export const MESSAGE_CHANNELS = ['whatsapp', 'web', 'telegram'] as const
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number]

export const MESSAGE_ROLES = ['user', 'assistant', 'system'] as const
export type MessageRole = (typeof MESSAGE_ROLES)[number]

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  waId: text('wa_id').unique(),
  phone: text('phone'),
  email: text('email').unique(),
  name: text('name'),
  city: text('city').notNull().default('Chennai'),
  preferredLang: text('preferred_lang').notNull().default('en'),
  profile: jsonb('profile').$type<CustomerProfile>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  stage: text('stage').notNull().default('discovery'),
  humanTakeover: boolean('human_takeover').notNull().default(false),
  focusVariantId: uuid('focus_variant_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  channel: text('channel', { enum: MESSAGE_CHANNELS }).notNull(),
  role: text('role', { enum: MESSAGE_ROLES }).notNull(),
  content: text('content').notNull(),
  toolCalls: jsonb('tool_calls').$type<MessageToolCall[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Customer = typeof customers.$inferSelect
export type NewCustomer = typeof customers.$inferInsert
export type Conversation = typeof conversations.$inferSelect
export type NewConversation = typeof conversations.$inferInsert
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
