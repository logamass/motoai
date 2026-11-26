import { and, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm'
import { defineTool } from '@motoai/agent/tools'
import { brands, models, specs, variants } from '@motoai/mod-catalog/schema'
import { dealers, priceLists, priceRows } from './schema.js'

export const PRICE_DISCLAIMER =
  'Price prevailing at delivery applies. Always pay only at the showroom.'

interface GetOnroadPriceParams {
  variantId?: string
  variantQuery?: string
  modelSlug?: string
  city?: string
  dealerSlug?: string
}

interface CompareVariantsParams {
  variantIds?: string[]
  variantSlugs?: string[]
  city?: string
  dealerSlug?: string
}

/** Fetch exact published on-road price breakup for a variant from dealer price lists. */
export const getOnroadPrice = defineTool({
  name: 'get_onroad_price',
  description:
    'Get exact published on-road price breakup (ex-showroom, TCS, RTO/tax, 1+3 & 3+3 insurance, EW, accessories) for a car variant in a city/dealer.',
  parameters: {
    variantId: {
      type: 'string',
      description: 'UUID of the variant',
    },
    variantQuery: {
      type: 'string',
      description: 'Variant name, slug, or suffix (e.g. "Hyryder V Hybrid", "hyryder-v-at")',
    },
    modelSlug: {
      type: 'string',
      description: 'Optional model slug to narrow the search',
    },
    city: {
      type: 'string',
      description: 'City name for RTO/dealer pricing (e.g. "Chennai", "Coimbatore")',
    },
    dealerSlug: {
      type: 'string',
      description: 'Optional specific dealer slug',
    },
  },
  handler: async (params: GetOnroadPriceParams, ctx) => {
    if (!params.variantId && !params.variantQuery && !params.modelSlug) {
      return {
        found: false,
        message: 'Provide variantId, variantQuery, or modelSlug to look up pricing.',
        disclaimer: PRICE_DISCLAIMER,
      }
    }

    try {
      const conditions: SQL[] = [
        eq(dealers.active, true),
        eq(priceLists.status, 'published'),
        eq(variants.active, true),
      ]

      if (params.variantId) {
        conditions.push(eq(variants.id, params.variantId))
      }

      if (params.variantQuery?.trim()) {
        const pattern = `%${params.variantQuery.trim()}%`
        const queryFilter = or(
          ilike(variants.name, pattern),
          ilike(variants.slug, pattern),
          ilike(variants.suffix, pattern),
          ilike(models.name, pattern)
        )
        if (queryFilter) {
          conditions.push(queryFilter)
        }
      }

      if (params.modelSlug?.trim()) {
        conditions.push(eq(models.slug, params.modelSlug.trim()))
      }

      if (params.city?.trim()) {
        conditions.push(ilike(dealers.city, `%${params.city.trim()}%`))
      }

      if (params.dealerSlug?.trim()) {
        conditions.push(eq(dealers.slug, params.dealerSlug.trim()))
      }

      const rows = await ctx.db
        .select({
          priceRow: priceRows,
          priceList: {
            id: priceLists.id,
            effectiveDate: priceLists.effectiveDate,
            version: priceLists.version,
            publishedAt: priceLists.publishedAt,
          },
          dealer: {
            id: dealers.id,
            name: dealers.name,
            slug: dealers.slug,
            city: dealers.city,
            rtoJurisdiction: dealers.rtoJurisdiction,
            address: dealers.address,
            contactPhone: dealers.contactPhone,
          },
          variant: {
            id: variants.id,
            slug: variants.slug,
            name: variants.name,
            suffix: variants.suffix,
            fuel: variants.fuel,
            transmission: variants.transmission,
          },
          model: {
            id: models.id,
            slug: models.slug,
            name: models.name,
          },
          brand: {
            id: brands.id,
            slug: brands.slug,
            name: brands.name,
          },
        })
        .from(priceRows)
        .innerJoin(priceLists, eq(priceRows.priceListId, priceLists.id))
        .innerJoin(dealers, eq(priceLists.dealerId, dealers.id))
        .innerJoin(variants, eq(priceRows.variantId, variants.id))
        .innerJoin(models, eq(variants.modelId, models.id))
        .innerJoin(brands, eq(models.brandId, brands.id))
        .where(and(...conditions))
        .orderBy(desc(priceLists.effectiveDate), desc(priceLists.version))
        .limit(5)

      if (rows.length === 0) {
        return {
          found: false,
          message: 'No published price list found matching the requested variant/city.',
          disclaimer: PRICE_DISCLAIMER,
        }
      }

      const quotes = rows.map((r) => ({
        brand: r.brand.name,
        model: r.model.name,
        variant: r.variant.name,
        variantId: r.variant.id,
        suffix: r.variant.suffix,
        fuel: r.variant.fuel,
        transmission: r.variant.transmission,
        dealer: r.dealer,
        effectiveDate: r.priceList.effectiveDate,
        priceListVersion: r.priceList.version,
        breakup: {
          exShowroom: r.priceRow.exShowroom,
          tcs: r.priceRow.tcs,
          taxReg: r.priceRow.taxReg,
          insurance1p3: r.priceRow.insurance1p3,
          insurance3p3: r.priceRow.insurance3p3,
          ew: r.priceRow.ew,
          servicePack: r.priceRow.servicePack,
          accessories: r.priceRow.accessories,
          ceramic: r.priceRow.ceramic,
          underbody: r.priceRow.underbody,
          extras: r.priceRow.extras,
          packageItems: r.priceRow.packageItems,
          onroad1p3: r.priceRow.onroad1p3,
          onroad3p3: r.priceRow.onroad3p3,
        },
      }))

      return {
        found: true,
        quotes,
        effectiveDate: quotes[0].effectiveDate,
        disclaimer: PRICE_DISCLAIMER,
      }
    } catch (error) {
      return {
        found: false,
        message: 'Pricing data is currently unavailable.',
        disclaimer: PRICE_DISCLAIMER,
        error: error instanceof Error ? error.message : 'Unknown database error',
      }
    }
  },
})

/** Compare specs and published on-road pricing across 2 or more variants. */
export const compareVariants = defineTool({
  name: 'compare_variants',
  description:
    'Compare exact published on-road prices and key specs side-by-side for two or more car variants.',
  parameters: {
    variantIds: {
      type: 'array',
      description: 'List of variant UUIDs to compare (2 to 4 variants)',
    },
    variantSlugs: {
      type: 'array',
      description: 'List of variant slugs to compare if UUIDs are not known',
    },
    city: {
      type: 'string',
      description: 'Optional city filter for dealer pricing',
    },
    dealerSlug: {
      type: 'string',
      description: 'Optional dealer slug',
    },
  },
  handler: async (params: CompareVariantsParams, ctx) => {
    const ids = params.variantIds?.filter(Boolean) ?? []
    const slugs = params.variantSlugs?.filter(Boolean) ?? []

    if (ids.length === 0 && slugs.length === 0) {
      return {
        found: false,
        message: 'Provide at least two variantIds or variantSlugs to compare.',
        disclaimer: PRICE_DISCLAIMER,
      }
    }

    try {
      const variantFilter =
        ids.length > 0
          ? inArray(variants.id, ids)
          : inArray(variants.slug, slugs)

      const conditions: SQL[] = [
        variantFilter,
        eq(variants.active, true),
        eq(dealers.active, true),
        eq(priceLists.status, 'published'),
      ]

      if (params.city?.trim()) {
        conditions.push(ilike(dealers.city, `%${params.city.trim()}%`))
      }
      if (params.dealerSlug?.trim()) {
        conditions.push(eq(dealers.slug, params.dealerSlug.trim()))
      }

      const rows = await ctx.db
        .select({
          variant: variants,
          model: models,
          brand: brands,
          priceRow: priceRows,
          priceList: {
            effectiveDate: priceLists.effectiveDate,
            version: priceLists.version,
          },
          dealer: {
            name: dealers.name,
            city: dealers.city,
          },
        })
        .from(priceRows)
        .innerJoin(priceLists, eq(priceRows.priceListId, priceLists.id))
        .innerJoin(dealers, eq(priceLists.dealerId, dealers.id))
        .innerJoin(variants, eq(priceRows.variantId, variants.id))
        .innerJoin(models, eq(variants.modelId, models.id))
        .innerJoin(brands, eq(models.brandId, brands.id))
        .where(and(...conditions))
        .orderBy(desc(priceLists.effectiveDate), desc(priceLists.version))

      // Deduplicate keeping latest published entry per variant
      const byVariant = new Map<string, (typeof rows)[number]>()
      for (const row of rows) {
        if (!byVariant.has(row.variant.id)) {
          byVariant.set(row.variant.id, row)
        }
      }

      const comparedIds = Array.from(byVariant.keys())
      if (comparedIds.length === 0) {
        return {
          found: false,
          message: 'No published pricing found for the requested variants.',
          disclaimer: PRICE_DISCLAIMER,
        }
      }

      const specRows = await ctx.db
        .select()
        .from(specs)
        .where(inArray(specs.variantId, comparedIds))

      const specByVariant = new Map<string, (typeof specRows)[number]>()
      for (const s of specRows) {
        const existing = specByVariant.get(s.variantId)
        if (!existing || (!existing.verified && s.verified)) {
          specByVariant.set(s.variantId, s)
        }
      }

      const items = Array.from(byVariant.values()).map((r) => ({
        variantId: r.variant.id,
        brand: r.brand.name,
        model: r.model.name,
        variant: r.variant.name,
        fuel: r.variant.fuel,
        transmission: r.variant.transmission,
        dealer: r.dealer,
        effectiveDate: r.priceList.effectiveDate,
        exShowroom: r.priceRow.exShowroom,
        onroad1p3: r.priceRow.onroad1p3,
        onroad3p3: r.priceRow.onroad3p3,
        specs: specByVariant.get(r.variant.id) ?? null,
      }))

      const sortedByOnroad = [...items].sort((a, b) => a.onroad1p3 - b.onroad1p3)
      const lowest = sortedByOnroad[0]
      const highest = sortedByOnroad[sortedByOnroad.length - 1]

      return {
        found: true,
        variants: items,
        priceSpread: {
          exShowroomDiff: highest.exShowroom - lowest.exShowroom,
          onroad1p3Diff: highest.onroad1p3 - lowest.onroad1p3,
          onroad3p3Diff: highest.onroad3p3 - lowest.onroad3p3,
        },
        effectiveDate: items[0].effectiveDate,
        disclaimer: PRICE_DISCLAIMER,
      }
    } catch (error) {
      return {
        found: false,
        message: 'Unable to compare variant pricing.',
        disclaimer: PRICE_DISCLAIMER,
        error: error instanceof Error ? error.message : 'Unknown database error',
      }
    }
  },
})
