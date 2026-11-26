import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core'
import type {
  PriceRowInput,
  PriceRowValidationResult,
} from '@motoai/mod-pricing/validators'

export type UploadJobStatus =
  | 'queued'
  | 'extracting'
  | 'validating'
  | 'review'
  | 'published'
  | 'failed'

export interface ExtractedRowResult {
  rowIndex: number
  raw: PriceRowInput
  validation: PriceRowValidationResult
}

export interface ExtractedIngestionPayload {
  fileName: string
  byteLength: number
  extractedAt: string
  effectiveDate?: string
  rows: ExtractedRowResult[]
}

/** Tracks dealer PDF price list uploads through extraction, validation, and review. */
export const uploadJobs = pgTable('upload_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealerId: uuid('dealer_id').notNull(),
  fileName: text('file_name').notNull(),
  storageKey: text('storage_key').notNull(),
  status: text('status', {
    enum: ['queued', 'extracting', 'validating', 'review', 'published', 'failed'],
  })
    .notNull()
    .default('queued'),
  rowCount: integer('row_count').notNull().default(0),
  failedRowCount: integer('failed_row_count').notNull().default(0),
  extractedJson: jsonb('extracted_json').$type<ExtractedIngestionPayload | null>(),
  errorText: text('error_text'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type UploadJob = typeof uploadJobs.$inferSelect
export type NewUploadJob = typeof uploadJobs.$inferInsert
