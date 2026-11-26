import { and, asc, desc, eq, type SQL } from 'drizzle-orm'
import type { RouteDefinition } from '@motoai/core'
import { db } from '@motoai/core/db'
import { brands, media, models, variants } from './schema.js'
import { fetchCopyrightFreeCarPhoto } from './media-fetcher.js'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function extractSlug(req: Request): string | null {
  const { pathname } = new URL(req.url, 'http://localhost')
  const segments = pathname.split('/').filter(Boolean)
  const slug = segments.at(-1)
  return slug ? decodeURIComponent(slug) : null
}

/** HTTP routes exposed by the catalog module under /api/modules/catalog/*. */
export const catalogRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/models',
    handler: async (req: Request) => {
      const { searchParams } = new URL(req.url, 'http://localhost')
      const brandSlug = searchParams.get('brand')
      const bodyType = searchParams.get('bodyType')
      const segment = searchParams.get('segment') as
        | 'private'
        | 'taxi'
        | 'commercial'
        | null
      const includeInactive = searchParams.get('active') === 'false'

      const conditions: SQL[] = []
      if (!includeInactive) {
        conditions.push(eq(models.active, true))
        conditions.push(eq(brands.active, true))
      }
      if (brandSlug) {
        conditions.push(eq(brands.slug, brandSlug))
      }
      if (bodyType) {
        conditions.push(eq(models.bodyType, bodyType))
      }
      if (segment && ['private', 'taxi', 'commercial'].includes(segment)) {
        conditions.push(eq(models.segment, segment))
      }

      const rows = await db
        .select({
          id: models.id,
          slug: models.slug,
          name: models.name,
          bodyType: models.bodyType,
          segment: models.segment,
          seatsMin: models.seatsMin,
          seatsMax: models.seatsMax,
          seatsLabel: models.seatsLabel,
          active: models.active,
          brand: {
            id: brands.id,
            slug: brands.slug,
            name: brands.name,
          },
        })
        .from(models)
        .innerJoin(brands, eq(models.brandId, brands.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(models.name))

      return jsonResponse({ models: rows, total: rows.length })
    },
  },
  {
    method: 'GET',
    path: '/models/:slug',
    handler: async (req: Request) => {
      const slug = extractSlug(req)
      if (!slug) {
        return jsonResponse({ error: 'Model slug is required' }, 400)
      }

      const [row] = await db
        .select({
          model: models,
          brand: brands,
        })
        .from(models)
        .innerJoin(brands, eq(models.brandId, brands.id))
        .where(eq(models.slug, slug))
        .limit(1)

      if (!row) {
        return jsonResponse({ error: 'Model not found' }, 404)
      }

      const modelVariants = await db
        .select()
        .from(variants)
        .where(and(eq(variants.modelId, row.model.id), eq(variants.active, true)))
        .orderBy(asc(variants.name))

      const modelMedia = await db
        .select()
        .from(media)
        .where(and(eq(media.modelId, row.model.id), eq(media.approved, true)))

      return jsonResponse({
        model: row.model,
        brand: row.brand,
        variants: modelVariants,
        media: modelMedia,
      })
    },
  },
  {
    method: 'GET',
    path: '/media/queue',
    handler: async () => {
      const rows = await db
        .select({
          id: media.id,
          modelId: media.modelId,
          url: media.url,
          kind: media.kind,
          approved: media.approved,
          createdAt: media.createdAt,
          modelName: models.name,
          modelSlug: models.slug,
          brandName: brands.name,
        })
        .from(media)
        .innerJoin(models, eq(media.modelId, models.id))
        .innerJoin(brands, eq(models.brandId, brands.id))
        .orderBy(desc(media.createdAt))

      return jsonResponse({ media: rows, total: rows.length })
    },
  },
  {
    method: 'POST',
    path: '/media/auto-fetch',
    handler: async (req: Request) => {
      let body: { modelId?: string; autoApprove?: boolean; force?: boolean } = {}
      try {
        body = (await req.json()) as typeof body
      } catch {
        // Optional empty body — fetch for all models missing hero media
      }

      const targetModels = await db
        .select({
          id: models.id,
          name: models.name,
          slug: models.slug,
          brandName: brands.name,
        })
        .from(models)
        .innerJoin(brands, eq(models.brandId, brands.id))
        .where(
          body.modelId
            ? and(eq(models.id, body.modelId), eq(models.active, true))
            : eq(models.active, true)
        )

      const existingMedia = await db.select().from(media)
      const modelsWithHero = new Set(
        existingMedia.filter((m) => m.kind === 'hero').map((m) => m.modelId)
      )

      const results: Array<{
        modelSlug: string
        status: 'fetched' | 'skipped' | 'not_found'
        url?: string
        license?: string
      }> = []

      for (const m of targetModels) {
        if (!body.force && modelsWithHero.has(m.id)) {
          results.push({ modelSlug: m.slug, status: 'skipped' })
          continue
        }

        const photo = await fetchCopyrightFreeCarPhoto(m.brandName, m.name)
        if (!photo) {
          results.push({ modelSlug: m.slug, status: 'not_found' })
          continue
        }

        await db.insert(media).values({
          modelId: m.id,
          url: photo.url,
          kind: 'hero',
          approved: Boolean(body.autoApprove),
        })

        results.push({
          modelSlug: m.slug,
          status: 'fetched',
          url: photo.url,
          license: photo.license,
        })
      }

      return jsonResponse({
        fetchedCount: results.filter((r) => r.status === 'fetched').length,
        results,
      })
    },
  },
  {
    method: 'PATCH',
    path: '/media/:id/approve',
    handler: async (req: Request) => {
      const { pathname } = new URL(req.url, 'http://localhost')
      const segments = pathname.split('/').filter(Boolean)
      const id = segments.at(-2)
      if (!id) return jsonResponse({ error: 'Media id is required' }, 400)

      let approved = true
      try {
        const body = (await req.json()) as { approved?: boolean }
        if (typeof body.approved === 'boolean') approved = body.approved
      } catch {
        // Default approve = true
      }

      const [updated] = await db
        .update(media)
        .set({ approved })
        .where(eq(media.id, id))
        .returning()

      if (!updated) return jsonResponse({ error: 'Media not found' }, 404)
      return jsonResponse({ media: updated })
    },
  },
]
