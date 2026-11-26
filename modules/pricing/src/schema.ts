import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core'

/** Authorized dealership locations and RTO jurisdictions. */
export const dealers = pgTable('dealers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  city: text('city').notNull(),
  rtoJurisdiction: text('rto_jurisdiction'),
  address: text('address'),
  contactPhone: text('contact_phone'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Mapping between dealers and the catalog brands they sell. */
export const dealerBrands = pgTable('dealer_brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealerId: uuid('dealer_id')
    .notNull()
    .references(() => dealers.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').notNull(),
})

/** Versioned dealer price list headers (draft -> review -> published -> archived). */
export const priceLists = pgTable('price_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealerId: uuid('dealer_id')
    .notNull()
    .references(() => dealers.id, { onDelete: 'cascade' }),
  sourcePdf: text('source_pdf'),
  effectiveDate: text('effective_date').notNull(),
  status: text('status', {
    enum: ['draft', 'review', 'published', 'archived'],
  })
    .notNull()
    .default('draft'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
})

/** Exact integer-rupee on-road breakup rows per variant inside a price list. */
export const priceRows = pgTable('price_rows', {
  id: uuid('id').primaryKey().defaultRandom(),
  priceListId: uuid('price_list_id')
    .notNull()
    .references(() => priceLists.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').notNull(),
  exShowroom: integer('ex_showroom').notNull(),
  tcs: integer('tcs').notNull().default(0),
  taxReg: integer('tax_reg').notNull().default(0),
  insurance1p3: integer('insurance_1p3').notNull().default(0),
  insurance3p3: integer('insurance_3p3').notNull().default(0),
  ew: integer('ew').notNull().default(0),
  servicePack: integer('service_pack').notNull().default(0),
  accessories: integer('accessories').notNull().default(0),
  ceramic: integer('ceramic').notNull().default(0),
  underbody: integer('underbody').notNull().default(0),
  onroad1p3: integer('onroad_1p3').notNull().default(0),
  onroad3p3: integer('onroad_3p3').notNull().default(0),
  extras: jsonb('extras').$type<Record<string, number>>().default({}),
  packageItems: jsonb('package_items').$type<string[]>().default([]),
})

export type Dealer = typeof dealers.$inferSelect
export type NewDealer = typeof dealers.$inferInsert
export type DealerBrand = typeof dealerBrands.$inferSelect
export type NewDealerBrand = typeof dealerBrands.$inferInsert
export type PriceList = typeof priceLists.$inferSelect
export type NewPriceList = typeof priceLists.$inferInsert
export type PriceRow = typeof priceRows.$inferSelect
export type NewPriceRow = typeof priceRows.$inferInsert
