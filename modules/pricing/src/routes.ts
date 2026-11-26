import { and, asc, desc, eq, ilike, type SQL } from 'drizzle-orm'
import type { RouteDefinition } from '@motoai/core'
import { db } from '@motoai/core/db'
import { brands, models, specs, variants } from '@motoai/mod-catalog/schema'
import { dealers, priceLists, priceRows } from './schema.js'
import { validatePriceRow, type PriceRowInput } from './validators.js'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** HTTP routes exposed by the pricing module under /api/modules/pricing/*. */
export const pricingRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/dealers',
    handler: async (req: Request) => {
      const { searchParams } = new URL(req.url, 'http://localhost')
      const city = searchParams.get('city')
      const includeInactive = searchParams.get('active') === 'false'

      const conditions: SQL[] = []
      if (!includeInactive) {
        conditions.push(eq(dealers.active, true))
      }
      if (city?.trim()) {
        conditions.push(ilike(dealers.city, `%${city.trim()}%`))
      }

      const rows = await db
        .select()
        .from(dealers)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(dealers.name))

      return jsonResponse({ dealers: rows, total: rows.length })
    },
  },
  {
    method: 'GET',
    path: '/price-lists',
    handler: async (req: Request) => {
      const { searchParams } = new URL(req.url, 'http://localhost')
      const dealerId = searchParams.get('dealerId')
      const status = searchParams.get('status') as
        | 'draft'
        | 'review'
        | 'published'
        | 'archived'
        | null

      const conditions: SQL[] = []
      if (dealerId) {
        conditions.push(eq(priceLists.dealerId, dealerId))
      }
      if (
        status &&
        ['draft', 'review', 'published', 'archived'].includes(status)
      ) {
        conditions.push(eq(priceLists.status, status))
      }

      const rows = await db
        .select({
          priceList: priceLists,
          dealer: {
            id: dealers.id,
            name: dealers.name,
            slug: dealers.slug,
            city: dealers.city,
          },
        })
        .from(priceLists)
        .innerJoin(dealers, eq(priceLists.dealerId, dealers.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(priceLists.createdAt))

      return jsonResponse({ priceLists: rows, total: rows.length })
    },
  },
  {
    method: 'POST',
    path: '/validate',
    handler: async (req: Request) => {
      let body: unknown
      try {
        body = await req.json()
      } catch {
        return jsonResponse({ error: 'Invalid JSON request body' }, 400)
      }

      const rows: PriceRowInput[] = Array.isArray(body)
        ? (body as PriceRowInput[])
        : Array.isArray((body as { rows?: unknown })?.rows)
          ? ((body as { rows: PriceRowInput[] }).rows)
          : []

      if (rows.length === 0) {
        return jsonResponse(
          { error: 'Provide a non-empty "rows" array to validate' },
          400
        )
      }

      const results = rows.map((row, index) => ({
        index,
        variantId: row.variantId ?? null,
        suffix: row.suffix ?? null,
        ...validatePriceRow(row),
      }))

      const failedCount = results.filter((r) => !r.valid).length

      return jsonResponse({
        valid: failedCount === 0,
        totalRows: results.length,
        passedCount: results.length - failedCount,
        failedCount,
        results,
      })
    },
  },
  {
    method: 'GET',
    path: '/catalog-summary',
    handler: async (req: Request) => {
      const { searchParams } = new URL(req.url, 'http://localhost')
      const brandSlug = searchParams.get('brand')?.trim() || null
      const bodyType = searchParams.get('bodyType')?.trim() || null
      const segment = searchParams.get('segment')?.trim() as
        | 'private'
        | 'taxi'
        | 'commercial'
        | null
      const dealerId = searchParams.get('dealerId')?.trim() || null
      const dealerSlug = searchParams.get('dealerSlug')?.trim() || null
      const includeInactive = searchParams.get('active') === 'false'

      const modelConditions: SQL[] = []
      if (!includeInactive) {
        modelConditions.push(eq(models.active, true))
        modelConditions.push(eq(brands.active, true))
      }
      if (brandSlug) {
        modelConditions.push(eq(brands.slug, brandSlug))
      }
      if (bodyType) {
        modelConditions.push(eq(models.bodyType, bodyType))
      }
      if (segment && ['private', 'taxi', 'commercial'].includes(segment)) {
        modelConditions.push(eq(models.segment, segment))
      }

      const [catalogRows, publishedPriceRows] = await Promise.all([
        db
          .select({
            brand: brands,
            model: models,
            variant: variants,
            spec: specs,
          })
          .from(models)
          .innerJoin(brands, eq(models.brandId, brands.id))
          .leftJoin(
            variants,
            includeInactive
              ? eq(variants.modelId, models.id)
              : and(eq(variants.modelId, models.id), eq(variants.active, true))
          )
          .leftJoin(specs, eq(specs.variantId, variants.id))
          .where(modelConditions.length > 0 ? and(...modelConditions) : undefined)
          .orderBy(asc(models.name), asc(variants.name)),
        db
          .select({
            variantId: priceRows.variantId,
            priceRowId: priceRows.id,
            priceListId: priceLists.id,
            version: priceLists.version,
            effectiveDate: priceLists.effectiveDate,
            dealerId: dealers.id,
            dealerName: dealers.name,
            dealerSlug: dealers.slug,
            dealerCity: dealers.city,
            exShowroom: priceRows.exShowroom,
            tcs: priceRows.tcs,
            taxReg: priceRows.taxReg,
            insurance1p3: priceRows.insurance1p3,
            insurance3p3: priceRows.insurance3p3,
            ew: priceRows.ew,
            servicePack: priceRows.servicePack,
            accessories: priceRows.accessories,
            ceramic: priceRows.ceramic,
            underbody: priceRows.underbody,
            onroad1p3: priceRows.onroad1p3,
            onroad3p3: priceRows.onroad3p3,
            extras: priceRows.extras,
          })
          .from(priceRows)
          .innerJoin(
            priceLists,
            and(
              eq(priceRows.priceListId, priceLists.id),
              eq(priceLists.status, 'published')
            )
          )
          .innerJoin(
            dealers,
            and(
              eq(priceLists.dealerId, dealers.id),
              eq(dealers.active, true),
              ...(dealerId ? [eq(dealers.id, dealerId)] : []),
              ...(dealerSlug ? [eq(dealers.slug, dealerSlug)] : [])
            )
          )
          .orderBy(asc(priceRows.onroad1p3)),
      ])

      const priceByVariant = new Map<string, (typeof publishedPriceRows)[number]>()
      for (const p of publishedPriceRows) {
        if (!priceByVariant.has(p.variantId)) {
          priceByVariant.set(p.variantId, p)
        }
      }

      const joinedRows = catalogRows.map((row) => ({
        ...row,
        price: row.variant ? (priceByVariant.get(row.variant.id) ?? null) : null,
      }))

      type SummaryVariant = {
        id: string
        slug: string
        name: string
        suffix: string | null
        fuel: string
        transmission: 'MT' | 'AT'
        powertrainType: string | null
        trim: string | null
        active: boolean
        specs: {
          id: string
          engine: string | null
          power: string | null
          mileage: string | null
          bootSpace: string | null
          safetyRating: string | null
          airbags: number | null
          adas: boolean
          source: 'brochure' | 'web' | 'manual'
          verified: boolean
        } | null
        price: {
          priceRowId: string
          priceListId: string
          version: number
          effectiveDate: string
          dealer: {
            id: string
            name: string
            slug: string
            city: string
          }
          exShowroom: number
          tcs: number
          taxReg: number
          insurance1p3: number
          insurance3p3: number
          ew: number
          servicePack: number
          accessories: number
          ceramic: number
          underbody: number
          onroad1p3: number
          onroad3p3: number
          extras: Record<string, number> | null
        } | null
      }

      type SummaryModel = {
        id: string
        slug: string
        name: string
        bodyType: string
        segment: 'private' | 'taxi' | 'commercial'
        seatsMin: number
        seatsMax: number
        seatsLabel: string | null
        active: boolean
        brand: {
          id: string
          slug: string
          name: string
          country: string | null
        }
        minExShowroom: number | null
        minOnroad1p3: number | null
        maxOnroad1p3: number | null
        minOnroad3p3: number | null
        maxOnroad3p3: number | null
        variantCount: number
        variants: SummaryVariant[]
        _seenVariants: Set<string>
      }

      const modelMap = new Map<string, SummaryModel>()

      for (const row of joinedRows) {
        let modelEntry = modelMap.get(row.model.id)
        if (!modelEntry) {
          modelEntry = {
            id: row.model.id,
            slug: row.model.slug,
            name: row.model.name,
            bodyType: row.model.bodyType,
            segment: row.model.segment,
            seatsMin: row.model.seatsMin,
            seatsMax: row.model.seatsMax,
            seatsLabel: row.model.seatsLabel,
            active: row.model.active,
            brand: {
              id: row.brand.id,
              slug: row.brand.slug,
              name: row.brand.name,
              country: row.brand.country,
            },
            minExShowroom: null,
            minOnroad1p3: null,
            maxOnroad1p3: null,
            minOnroad3p3: null,
            maxOnroad3p3: null,
            variantCount: 0,
            variants: [],
            _seenVariants: new Set<string>(),
          }
          modelMap.set(row.model.id, modelEntry)
        }

        if (!row.variant) continue
        const variantKey = `${row.variant.id}:${row.price?.priceRowId ?? 'none'}`
        if (modelEntry._seenVariants.has(variantKey)) continue
        modelEntry._seenVariants.add(variantKey)

        const hasPrice = Boolean(row.price && row.price.priceRowId)
        const priceObj =
          hasPrice && row.price
            ? {
                priceRowId: row.price.priceRowId,
                priceListId: row.price.priceListId,
                version: row.price.version,
                effectiveDate: row.price.effectiveDate,
                dealer: {
                  id: row.price.dealerId,
                  name: row.price.dealerName,
                  slug: row.price.dealerSlug,
                  city: row.price.dealerCity,
                },
                exShowroom: row.price.exShowroom,
                tcs: row.price.tcs,
                taxReg: row.price.taxReg,
                insurance1p3: row.price.insurance1p3,
                insurance3p3: row.price.insurance3p3,
                ew: row.price.ew,
                servicePack: row.price.servicePack,
                accessories: row.price.accessories,
                ceramic: row.price.ceramic,
                underbody: row.price.underbody,
                onroad1p3: row.price.onroad1p3,
                onroad3p3: row.price.onroad3p3,
                extras: row.price.extras ?? {},
              }
            : null

        if (priceObj) {
          modelEntry.minExShowroom =
            modelEntry.minExShowroom === null
              ? priceObj.exShowroom
              : Math.min(modelEntry.minExShowroom, priceObj.exShowroom)
          modelEntry.minOnroad1p3 =
            modelEntry.minOnroad1p3 === null
              ? priceObj.onroad1p3
              : Math.min(modelEntry.minOnroad1p3, priceObj.onroad1p3)
          modelEntry.maxOnroad1p3 =
            modelEntry.maxOnroad1p3 === null
              ? priceObj.onroad1p3
              : Math.max(modelEntry.maxOnroad1p3, priceObj.onroad1p3)
          modelEntry.minOnroad3p3 =
            modelEntry.minOnroad3p3 === null
              ? priceObj.onroad3p3
              : Math.min(modelEntry.minOnroad3p3, priceObj.onroad3p3)
          modelEntry.maxOnroad3p3 =
            modelEntry.maxOnroad3p3 === null
              ? priceObj.onroad3p3
              : Math.max(modelEntry.maxOnroad3p3, priceObj.onroad3p3)
        }

        modelEntry.variants.push({
          id: row.variant.id,
          slug: row.variant.slug,
          name: row.variant.name,
          suffix: row.variant.suffix,
          fuel: row.variant.fuel,
          transmission: row.variant.transmission,
          powertrainType: row.variant.powertrainType,
          trim: row.variant.trim,
          active: row.variant.active,
          specs: row.spec
            ? {
                id: row.spec.id,
                engine: row.spec.engine,
                power: row.spec.power,
                mileage: row.spec.mileage,
                bootSpace: row.spec.bootSpace,
                safetyRating: row.spec.safetyRating,
                airbags: row.spec.airbags,
                adas: row.spec.adas,
                source: row.spec.source,
                verified: row.spec.verified,
              }
            : null,
          price: priceObj,
        })
        modelEntry.variantCount = modelEntry.variants.length
      }

      const catalogModels = Array.from(modelMap.values()).map(
        ({ _seenVariants: _, ...rest }) => rest
      )

      return jsonResponse({ models: catalogModels, total: catalogModels.length })
    },
  },
]
