import { and, desc, eq, type SQL } from 'drizzle-orm'
import type { RouteDefinition } from '@motoai/core'
import { db } from '@motoai/core/db'
import { emitter } from '@motoai/core/events'
import { queue } from '@motoai/core/queue'
import { storage } from '@motoai/core/storage'
import { models, variants } from '@motoai/mod-catalog/schema'
import { dealerBrands, priceLists, priceRows } from '@motoai/mod-pricing/schema'
import {
  diffPriceRows,
  validatePriceRow,
  type PriceRowInput,
} from '@motoai/mod-pricing/validators'
import { extractWithClaudeVision } from './claude-extractor.js'
import {
  uploadJobs,
  type ExtractedIngestionPayload,
  type ExtractedRowResult,
  type UploadJobStatus,
} from './schema.js'
import type { PdfExtractJobData } from './workers.js'

const VALID_JOB_STATUSES: ReadonlySet<UploadJobStatus> = new Set([
  'queued',
  'extracting',
  'validating',
  'review',
  'published',
  'failed',
])

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value)
}

function extractJobId(req: Request): string | null {
  const { pathname } = new URL(req.url, 'http://localhost')
  const segments = pathname.split('/').filter(Boolean)
  const jobsIdx = segments.lastIndexOf('jobs')
  if (jobsIdx === -1 || jobsIdx + 1 >= segments.length) {
    return null
  }
  return decodeURIComponent(segments[jobsIdx + 1])
}

function toInt(value: number | undefined | null): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0
}

/**
 * Load currently published price rows for a dealer mapped to `PriceRowInput`
 * so `diffPriceRows` can compare candidate uploads against live pricing.
 */
async function getPublishedPriceRowsForDealer(
  dealerId: string
): Promise<PriceRowInput[]> {
  const [publishedList] = await db
    .select()
    .from(priceLists)
    .where(
      and(
        eq(priceLists.dealerId, dealerId),
        eq(priceLists.status, 'published')
      )
    )
    .orderBy(desc(priceLists.version), desc(priceLists.publishedAt))
    .limit(1)

  if (!publishedList) {
    return []
  }

  const rows = await db
    .select({
      row: priceRows,
      suffix: variants.suffix,
    })
    .from(priceRows)
    .leftJoin(variants, eq(priceRows.variantId, variants.id))
    .where(eq(priceRows.priceListId, publishedList.id))

  return rows.map(({ row, suffix }) => ({
    variantId: row.variantId,
    suffix: suffix ?? null,
    exShowroom: row.exShowroom,
    tcs: row.tcs,
    taxReg: row.taxReg,
    insurance1p3: row.insurance1p3,
    insurance3p3: row.insurance3p3,
    ew: row.ew,
    servicePack: row.servicePack,
    accessories: row.accessories,
    ceramic: row.ceramic,
    underbody: row.underbody,
    onroad1p3: row.onroad1p3,
    onroad3p3: row.onroad3p3,
    extras: row.extras ?? null,
  }))
}

/**
 * Build a lookup of suffix -> variantId (preferring brands linked to the dealer).
 */
async function buildVariantLookup(dealerId: string): Promise<{
  validVariantIds: Set<string>
  suffixToVariantId: Map<string, string>
}> {
  const linkedBrandSet = new Set(
    (
      await db
        .select({ brandId: dealerBrands.brandId })
        .from(dealerBrands)
        .where(eq(dealerBrands.dealerId, dealerId))
    ).map((b) => b.brandId)
  )

  const allVariants = await db
    .select({
      id: variants.id,
      suffix: variants.suffix,
      brandId: models.brandId,
    })
    .from(variants)
    .innerJoin(models, eq(variants.modelId, models.id))

  const validVariantIds = new Set<string>(allVariants.map((v) => v.id))
  const suffixToVariantId = new Map<string, string>()

  for (const v of allVariants) {
    if (v.suffix) {
      suffixToVariantId.set(v.suffix.trim().toUpperCase(), v.id)
    }
  }
  // Prefer variants belonging to brands explicitly carried by this dealer
  for (const v of allVariants) {
    if (v.suffix && linkedBrandSet.has(v.brandId)) {
      suffixToVariantId.set(v.suffix.trim().toUpperCase(), v.id)
    }
  }

  return { validVariantIds, suffixToVariantId }
}

/** HTTP routes exposed by the ingestion module under /api/modules/ingestion/*. */
export const ingestionRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/jobs',
    handler: async (req: Request) => {
      const { searchParams } = new URL(req.url, 'http://localhost')
      const dealerId = searchParams.get('dealerId')
      const status = searchParams.get('status') as UploadJobStatus | null

      const conditions: SQL[] = []
      if (dealerId) {
        if (!isUuid(dealerId)) {
          return jsonResponse({ error: 'Invalid dealerId UUID' }, 400)
        }
        conditions.push(eq(uploadJobs.dealerId, dealerId))
      }
      if (status && VALID_JOB_STATUSES.has(status)) {
        conditions.push(eq(uploadJobs.status, status))
      }

      const jobs = await db
        .select()
        .from(uploadJobs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(uploadJobs.createdAt))
        .limit(50)

      return jsonResponse({ jobs, total: jobs.length })
    },
  },
  {
    method: 'POST',
    path: '/upload',
    handler: async (req: Request) => {
      const contentType = req.headers.get('content-type') ?? ''

      let dealerId = ''
      let fileName = ''
      let storageKey = ''
      let fileBuffer: Buffer | null = null

      if (contentType.includes('multipart/form-data')) {
        const formData = await req.formData()
        const dealerEntry = formData.get('dealerId')
        const fileEntry = formData.get('file')
        const keyEntry = formData.get('storageKey')

        dealerId = typeof dealerEntry === 'string' ? dealerEntry.trim() : ''
        storageKey = typeof keyEntry === 'string' ? keyEntry.trim() : ''

        if (fileEntry && typeof fileEntry !== 'string') {
          fileName = fileEntry.name || 'price-list.pdf'
          fileBuffer = Buffer.from(await fileEntry.arrayBuffer())
        }
      } else {
        let body: {
          dealerId?: string
          fileName?: string
          storageKey?: string
          contentBase64?: string
        }
        try {
          body = (await req.json()) as typeof body
        } catch {
          return jsonResponse({ error: 'Invalid JSON request body' }, 400)
        }

        dealerId = body.dealerId?.trim() ?? ''
        fileName = body.fileName?.trim() ?? ''
        storageKey = body.storageKey?.trim() ?? ''
        if (body.contentBase64) {
          fileBuffer = Buffer.from(body.contentBase64, 'base64')
        }
      }

      if (!dealerId || !isUuid(dealerId)) {
        return jsonResponse({ error: 'Valid dealerId UUID is required' }, 400)
      }
      if (!fileName) {
        return jsonResponse({ error: 'fileName (or uploaded file) is required' }, 400)
      }

      if (!storageKey) {
        if (!fileBuffer) {
          return jsonResponse(
            { error: 'Provide either an uploaded file, contentBase64, or an existing storageKey' },
            400
          )
        }
        storageKey = `price-lists/${dealerId}/${Date.now()}-${sanitizeFileName(fileName)}`
        await storage.upload(storageKey, fileBuffer, 'application/pdf')
      }

      const [job] = await db
        .insert(uploadJobs)
        .values({
          dealerId,
          fileName,
          storageKey,
          status: 'queued',
        })
        .returning()

      const jobData: PdfExtractJobData = {
        jobId: job.id,
        dealerId,
        storageKey,
        fileName,
      }
      const queueJobId = await queue.enqueue('pdf-extract', jobData)

      return jsonResponse({ job, queueJobId }, 202)
    },
  },
  {
    method: 'POST',
    path: '/extract-preview',
    handler: async (req: Request) => {
      const contentType = req.headers.get('content-type') ?? ''

      let dealerId = ''
      let fileName = ''
      let effectiveDate: string | undefined
      let byteLength = 0
      let candidateRows: PriceRowInput[] = []

      if (contentType.includes('multipart/form-data')) {
        const formData = await req.formData()
        const dealerEntry = formData.get('dealerId')
        const fileNameEntry = formData.get('fileName')
        const effectiveEntry = formData.get('effectiveDate')
        const rowsEntry = formData.get('rows')
        const fileEntry = formData.get('file')

        dealerId = typeof dealerEntry === 'string' ? dealerEntry.trim() : ''
        fileName = typeof fileNameEntry === 'string' ? fileNameEntry.trim() : ''
        effectiveDate =
          typeof effectiveEntry === 'string' && effectiveEntry.trim()
            ? effectiveEntry.trim()
            : undefined

        if (typeof rowsEntry === 'string' && rowsEntry.trim()) {
          try {
            const parsed = JSON.parse(rowsEntry) as PriceRowInput[]
            if (!Array.isArray(parsed)) {
              return jsonResponse({ error: '"rows" must be a JSON array' }, 400)
            }
            candidateRows = parsed
            byteLength = Buffer.byteLength(rowsEntry, 'utf-8')
            if (!fileName) fileName = 'uploaded-rows.json'
          } catch {
            return jsonResponse({ error: 'Invalid JSON in "rows" form field' }, 400)
          }
        } else if (fileEntry && typeof fileEntry !== 'string') {
          fileName = fileName || fileEntry.name || 'price-list.pdf'
          const fileBuffer = Buffer.from(await fileEntry.arrayBuffer())
          byteLength = fileBuffer.byteLength

          if (
            fileEntry.type === 'application/json' ||
            fileName.toLowerCase().endsWith('.json')
          ) {
            try {
              const parsed = JSON.parse(fileBuffer.toString('utf-8')) as
                | PriceRowInput[]
                | { rows?: PriceRowInput[] }
              candidateRows = Array.isArray(parsed)
                ? parsed
                : Array.isArray(parsed.rows)
                  ? parsed.rows
                  : []
            } catch {
              return jsonResponse({ error: 'Uploaded JSON file is invalid' }, 400)
            }
          } else {
            try {
              candidateRows = await extractWithClaudeVision(fileBuffer, fileName)
            } catch (err) {
              const message =
                err instanceof Error ? err.message : 'PDF extraction failed'
              return jsonResponse({ error: message }, 400)
            }
          }
        }
      } else {
        let body: {
          dealerId?: string
          fileName?: string
          effectiveDate?: string
          rows?: PriceRowInput[]
        }
        try {
          body = (await req.json()) as typeof body
        } catch {
          return jsonResponse({ error: 'Invalid JSON request body' }, 400)
        }

        dealerId = body.dealerId?.trim() ?? ''
        fileName = body.fileName?.trim() ?? ''
        effectiveDate = body.effectiveDate?.trim() || undefined
        candidateRows = Array.isArray(body.rows) ? body.rows : []
        byteLength = Buffer.byteLength(JSON.stringify(candidateRows), 'utf-8')
      }

      if (!dealerId || !isUuid(dealerId)) {
        return jsonResponse({ error: 'Valid dealerId UUID is required' }, 400)
      }
      if (!fileName) {
        return jsonResponse({ error: 'fileName (or uploaded file) is required' }, 400)
      }
      if (candidateRows.length === 0) {
        return jsonResponse(
          { error: 'Provide a non-empty "rows" array or PDF file with price rows' },
          400
        )
      }

      // Resolve missing variantId via suffix lookup so diff & publish match catalog variants
      const { suffixToVariantId } = await buildVariantLookup(dealerId)
      const enrichedRows: PriceRowInput[] = candidateRows.map((row) => {
        if (row.variantId) return row
        const suffixKey = row.suffix?.trim().toUpperCase()
        const matchedVariantId = suffixKey
          ? suffixToVariantId.get(suffixKey)
          : undefined
        return matchedVariantId ? { ...row, variantId: matchedVariantId } : row
      })

      const validatedRows: ExtractedRowResult[] = enrichedRows.map(
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
        byteLength,
        extractedAt: new Date().toISOString(),
        ...(effectiveDate ? { effectiveDate } : {}),
        rows: validatedRows,
      }

      const storageKey = `preview/${dealerId}/${Date.now()}-${sanitizeFileName(fileName)}`

      const [job] = await db
        .insert(uploadJobs)
        .values({
          dealerId,
          fileName,
          storageKey,
          status: 'review',
          rowCount,
          failedRowCount,
          extractedJson: payload,
        })
        .returning()

      const publishedRows = await getPublishedPriceRowsForDealer(dealerId)
      const diff = diffPriceRows(publishedRows, enrichedRows)

      const validationSummary = {
        valid: failedRowCount === 0,
        totalRows: rowCount,
        passedCount: rowCount - failedRowCount,
        failedCount: failedRowCount,
        failedRows: validatedRows
          .filter((r) => !r.validation.valid)
          .map((r) => ({
            rowIndex: r.rowIndex,
            variantId: r.raw.variantId ?? null,
            suffix: r.raw.suffix ?? null,
            errors: r.validation.errors,
          })),
      }

      return jsonResponse({ job, validationSummary, diff })
    },
  },
  {
    method: 'GET',
    path: '/jobs/:id/diff',
    handler: async (req: Request) => {
      const jobId = extractJobId(req)
      if (!jobId || !isUuid(jobId)) {
        return jsonResponse({ error: 'Valid job ID UUID is required' }, 400)
      }

      const [job] = await db
        .select()
        .from(uploadJobs)
        .where(eq(uploadJobs.id, jobId))
        .limit(1)

      if (!job) {
        return jsonResponse({ error: 'Upload job not found' }, 404)
      }

      const candidateRows = (job.extractedJson?.rows ?? []).map((r) => r.raw)
      const publishedRows = await getPublishedPriceRowsForDealer(job.dealerId)
      const diff = diffPriceRows(publishedRows, candidateRows)

      return jsonResponse({ job, diff })
    },
  },
  {
    method: 'POST',
    path: '/jobs/:id/publish',
    handler: async (req: Request) => {
      const jobId = extractJobId(req)
      if (!jobId || !isUuid(jobId)) {
        return jsonResponse({ error: 'Valid job ID UUID is required' }, 400)
      }

      let bodyEffectiveDate: string | undefined
      const contentLength = req.headers.get('content-length')
      if (contentLength && contentLength !== '0') {
        try {
          const body = (await req.json()) as { effectiveDate?: string }
          bodyEffectiveDate = body.effectiveDate?.trim() || undefined
        } catch {
          // Allow empty or non-JSON body on publish
        }
      }

      const [job] = await db
        .select()
        .from(uploadJobs)
        .where(eq(uploadJobs.id, jobId))
        .limit(1)

      if (!job) {
        return jsonResponse({ error: 'Upload job not found' }, 404)
      }

      const extractedRows = job.extractedJson?.rows ?? []
      if (extractedRows.length === 0) {
        return jsonResponse(
          { error: 'Job has no extracted rows to publish' },
          400
        )
      }

      const hasFailedRows =
        job.failedRowCount > 0 ||
        extractedRows.some((r) => !validatePriceRow(r.raw).valid)

      if (hasFailedRows) {
        return jsonResponse(
          {
            error:
              'Cannot publish price list: one or more rows failed arithmetic validation',
            failedRowCount: job.failedRowCount,
          },
          400
        )
      }

      const effectiveDate =
        bodyEffectiveDate ??
        job.extractedJson?.effectiveDate ??
        new Date().toISOString().slice(0, 10)

      const { validVariantIds, suffixToVariantId } = await buildVariantLookup(
        job.dealerId
      )

      const rowsToInsert: Array<{
        variantId: string
        raw: PriceRowInput
      }> = []
      const skippedRows: Array<{
        rowIndex: number
        suffix: string | null
        reason: string
      }> = []

      for (const item of extractedRows) {
        const directId = item.raw.variantId?.trim()
        let resolvedVariantId: string | undefined

        if (directId && validVariantIds.has(directId)) {
          resolvedVariantId = directId
        } else if (item.raw.suffix) {
          resolvedVariantId = suffixToVariantId.get(
            item.raw.suffix.trim().toUpperCase()
          )
        }

        if (!resolvedVariantId) {
          skippedRows.push({
            rowIndex: item.rowIndex,
            suffix: item.raw.suffix ?? null,
            reason: 'No matching catalog variant found for variantId/suffix',
          })
          continue
        }

        rowsToInsert.push({ variantId: resolvedVariantId, raw: item.raw })
      }

      const result = await db.transaction(async (tx) => {
        const existingLists = await tx
          .select({ version: priceLists.version })
          .from(priceLists)
          .where(eq(priceLists.dealerId, job.dealerId))
          .orderBy(desc(priceLists.version))
          .limit(1)

        const maxVersion = existingLists[0]?.version ?? 0
        const nextVersion = maxVersion + 1

        await tx
          .update(priceLists)
          .set({ status: 'archived' })
          .where(
            and(
              eq(priceLists.dealerId, job.dealerId),
              eq(priceLists.status, 'published')
            )
          )

        const [priceList] = await tx
          .insert(priceLists)
          .values({
            dealerId: job.dealerId,
            sourcePdf: job.fileName,
            effectiveDate,
            status: 'published',
            version: nextVersion,
            publishedAt: new Date(),
          })
          .returning()

        const insertedRows =
          rowsToInsert.length > 0
            ? await tx
                .insert(priceRows)
                .values(
                  rowsToInsert.map(({ variantId, raw }) => ({
                    priceListId: priceList.id,
                    variantId,
                    exShowroom: toInt(raw.exShowroom),
                    tcs: toInt(raw.tcs),
                    taxReg: toInt(raw.taxReg),
                    insurance1p3: toInt(raw.insurance1p3),
                    insurance3p3: toInt(raw.insurance3p3),
                    ew: toInt(raw.ew),
                    servicePack: toInt(raw.servicePack),
                    accessories: toInt(raw.accessories),
                    ceramic: toInt(raw.ceramic),
                    underbody: toInt(raw.underbody),
                    onroad1p3: toInt(raw.onroad1p3),
                    onroad3p3: toInt(raw.onroad3p3),
                    extras: raw.extras ?? {},
                  }))
                )
                .returning()
            : []

        await tx
          .update(uploadJobs)
          .set({
            status: 'published',
            updatedAt: new Date(),
          })
          .where(eq(uploadJobs.id, job.id))

        return { priceList, insertedRows }
      })

      emitter.emit('ingestion:published', {
        jobId: job.id,
        priceListId: result.priceList.id,
        dealerId: job.dealerId,
      })

      return jsonResponse({
        priceList: result.priceList,
        insertedRows: result.insertedRows,
        insertedCount: result.insertedRows.length,
        skippedCount: skippedRows.length,
        skippedRows,
      })
    },
  },
]
