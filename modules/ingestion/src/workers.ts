import { eq } from 'drizzle-orm'
import { db } from '@motoai/core/db'
import { emitter } from '@motoai/core/events'
import { storage } from '@motoai/core/storage'
import {
  validatePriceRow,
  type PriceRowInput,
} from '@motoai/mod-pricing/validators'
import {
  uploadJobs,
  type ExtractedIngestionPayload,
  type ExtractedRowResult,
} from './schema.js'

declare module '@motoai/core/events' {
  interface AppEvents {
    'ingestion:extracted': {
      jobId: string
      dealerId: string
      rowCount: number
      failedRowCount: number
    }
    'ingestion:published': {
      jobId: string
      priceListId: string
      dealerId: string
    }
  }
}

export interface PdfExtractJobData {
  jobId: string
  dealerId: string
  storageKey: string
  fileName: string
}

export interface QueueJob<T = PdfExtractJobData> {
  id?: string
  data: T
}

/**
 * Parse candidate price rows from a downloaded PDF buffer.
 * Skeleton hook ready to be backed by PDF text/table extraction (e.g. pdf-parse / Claude Vision).
 */
async function extractRowsFromPdf(
  pdfBuffer: Buffer,
  _fileName: string
): Promise<PriceRowInput[]> {
  if (pdfBuffer.byteLength === 0) {
    throw new Error('Uploaded PDF file is empty')
  }

  // Skeleton: if JSON rows are embedded for test/dry-run payloads, parse them;
  // otherwise return empty list awaiting real PDF parser integration.
  const textPreview = pdfBuffer.subarray(0, 32).toString('utf-8').trimStart()
  if (textPreview.startsWith('[') || textPreview.startsWith('{')) {
    try {
      const parsed = JSON.parse(pdfBuffer.toString('utf-8')) as
        | PriceRowInput[]
        | { rows?: PriceRowInput[] }
      if (Array.isArray(parsed)) return parsed
      if (Array.isArray(parsed.rows)) return parsed.rows
    } catch {
      // Not a JSON payload — fall through to empty skeleton extraction
    }
  }

  return []
}

/**
 * Background worker for `pdf-extract` jobs:
 * 1. Marks job extracting and downloads PDF from object storage.
 * 2. Extracts candidate rows and marks job validating.
 * 3. Validates every row with `validatePriceRow`.
 * 4. Persists review payload + counts and emits `ingestion:extracted`.
 */
export async function pdfExtractWorker(
  job: QueueJob<PdfExtractJobData>
): Promise<void> {
  const { jobId, dealerId, storageKey, fileName } = job.data

  try {
    await db
      .update(uploadJobs)
      .set({ status: 'extracting', updatedAt: new Date(), errorText: null })
      .where(eq(uploadJobs.id, jobId))

    const pdfBuffer = await storage.download(storageKey)
    const candidateRows = await extractRowsFromPdf(pdfBuffer, fileName)

    await db
      .update(uploadJobs)
      .set({ status: 'validating', updatedAt: new Date() })
      .where(eq(uploadJobs.id, jobId))

    const validatedRows: ExtractedRowResult[] = candidateRows.map(
      (raw, rowIndex) => ({
        rowIndex,
        raw,
        validation: validatePriceRow(raw),
      })
    )

    const rowCount = validatedRows.length
    const failedRowCount = validatedRows.filter(
      (r) => !r.validation.valid
    ).length

    const payload: ExtractedIngestionPayload = {
      fileName,
      byteLength: pdfBuffer.byteLength,
      extractedAt: new Date().toISOString(),
      rows: validatedRows,
    }

    await db
      .update(uploadJobs)
      .set({
        status: 'review',
        rowCount,
        failedRowCount,
        extractedJson: payload,
        updatedAt: new Date(),
      })
      .where(eq(uploadJobs.id, jobId))

    emitter.emit('ingestion:extracted', {
      jobId,
      dealerId,
      rowCount,
      failedRowCount,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'PDF extraction failed'

    await db
      .update(uploadJobs)
      .set({
        status: 'failed',
        errorText: message,
        updatedAt: new Date(),
      })
      .where(eq(uploadJobs.id, jobId))

    throw error
  }
}
