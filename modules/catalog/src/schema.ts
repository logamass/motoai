import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core'

/** Automotive OEM brands (e.g., Toyota, Maruti Suzuki, Hyundai). */
export const brands = pgTable('brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  country: text('country'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Vehicle models belonging to a brand (e.g., Urban Cruiser Hyryder, Innova Hycross). */
export const models = pgTable('models', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id')
    .notNull()
    .references(() => brands.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  bodyType: text('body_type').notNull(),
  segment: text('segment', { enum: ['private', 'taxi', 'commercial'] })
    .notNull()
    .default('private'),
  seatsMin: integer('seats_min').notNull().default(5),
  seatsMax: integer('seats_max').notNull().default(5),
  seatsLabel: text('seats_label'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Trim/powertrain variants of a model. */
export const variants = pgTable('variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  modelId: uuid('model_id')
    .notNull()
    .references(() => models.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  suffix: text('suffix'),
  fuel: text('fuel').notNull(),
  transmission: text('transmission', { enum: ['MT', 'AT'] }).notNull(),
  powertrainType: text('powertrain_type'),
  trim: text('trim'),
  colorTone: text('color_tone'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Verified technical specifications per variant. */
export const specs = pgTable('specs', {
  id: uuid('id').primaryKey().defaultRandom(),
  variantId: uuid('variant_id')
    .notNull()
    .references(() => variants.id, { onDelete: 'cascade' }),
  engine: text('engine'),
  power: text('power'),
  mileage: text('mileage'),
  bootSpace: text('boot_space'),
  safetyRating: text('safety_rating'),
  airbags: integer('airbags'),
  adas: boolean('adas').notNull().default(false),
  dimensions: jsonb('dimensions').$type<Record<string, unknown>>(),
  source: text('source', { enum: ['brochure', 'web', 'manual'] })
    .notNull()
    .default('manual'),
  verified: boolean('verified').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Approved model/variant media assets. */
export const media = pgTable('media', {
  id: uuid('id').primaryKey().defaultRandom(),
  modelId: uuid('model_id')
    .notNull()
    .references(() => models.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').references(() => variants.id, {
    onDelete: 'set null',
  }),
  url: text('url').notNull(),
  kind: text('kind', { enum: ['hero', 'gallery', 'color'] })
    .notNull()
    .default('gallery'),
  approved: boolean('approved').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Brand = typeof brands.$inferSelect
export type NewBrand = typeof brands.$inferInsert
export type Model = typeof models.$inferSelect
export type NewModel = typeof models.$inferInsert
export type Variant = typeof variants.$inferSelect
export type NewVariant = typeof variants.$inferInsert
export type Spec = typeof specs.$inferSelect
export type NewSpec = typeof specs.$inferInsert
export type Media = typeof media.$inferSelect
export type NewMedia = typeof media.$inferInsert
