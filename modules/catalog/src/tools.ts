import { and, eq, gte, ilike, lte, or, type SQL } from 'drizzle-orm'
import { defineTool } from '@motoai/agent/tools'
import { brands, media, models, specs, variants } from './schema.js'

interface SearchCarsParams {
  query?: string
  fuel?: string
  transmission?: 'MT' | 'AT'
  bodyType?: string
  segment?: 'private' | 'taxi' | 'commercial'
  seats?: number
  sunroof?: boolean
  limit?: number
}

/**
 * Grounded feature truth for verified catalog models/variants.
 * Prevents LLM from hallucinating features like sunroof on Taisor/Glanza/Rumion/Hyryder E MT.
 */
function resolveVariantSunroof(
  modelSlug: string,
  variantName: string,
  dimensions?: Record<string, unknown> | null
): boolean {
  if (dimensions && typeof dimensions.sunroof === 'boolean') {
    return dimensions.sunroof
  }
  const m = modelSlug.toLowerCase()
  const v = variantName.toLowerCase()
  // Confirmed Indian-market specs:
  // Glanza, Taisor, Rumion, Fortuner -> NO sunroof on any India variant
  if (m === 'glanza' || m === 'taisor' || m === 'rumion' || m === 'fortuner') {
    return false
  }
  // Urban Cruiser Hyryder -> Panoramic sunroof ONLY on G / V trims (NOT E or S!)
  if (m === 'urban-cruiser-hyryder') {
    return /\b(g|v)\b/.test(v)
  }
  // Innova Hycross -> Panoramic sunroof ONLY on VX(O) / ZX / ZX(O) trims (NOT GX!)
  if (m === 'innova-hycross') {
    return /\b(zx|vx\(o\))\b/.test(v)
  }
  return false
}

interface GetVariantDetailsParams {
  variantId?: string
  slug?: string
  modelSlug?: string
}

/** Search active vehicles in the catalog by model, fuel, transmission, body type, segment, or seats. */
export const searchCars = defineTool({
  name: 'search_cars',
  description:
    'Search active car models and variants in the showroom catalog by name, fuel type, transmission, body type, segment, or seating capacity.',
  parameters: {
    query: {
      type: 'string',
      description: 'Search text matching brand, model, or variant name (e.g. "Hyryder", "Innova", "Hybrid")',
    },
    fuel: {
      type: 'string',
      description: 'Fuel type filter (e.g. "Petrol", "Hybrid", "CNG", "Diesel", "EV")',
    },
    transmission: {
      type: 'string',
      enum: ['MT', 'AT'],
      description: 'Transmission type: MT (Manual) or AT (Automatic)',
    },
    bodyType: {
      type: 'string',
      description: 'Body style (e.g. "SUV", "MPV", "Sedan", "Hatchback")',
    },
    segment: {
      type: 'string',
      enum: ['private', 'taxi', 'commercial'],
      description: 'Registration/usage segment',
    },
    seats: {
      type: 'number',
      description: 'Required seating capacity (e.g. 5, 7, 8)',
    },
    sunroof: {
      type: 'boolean',
      description: 'Set true ONLY if customer specifically asks for a sunroof',
    },
    limit: {
      type: 'number',
      description: 'Maximum number of matching variants to return (default 10, max 25)',
    },
  },
  handler: async (params: SearchCarsParams, ctx) => {
    try {
      const conditions: SQL[] = [
        eq(brands.active, true),
        eq(models.active, true),
        eq(variants.active, true),
      ]

      if (params.query?.trim()) {
        const pattern = `%${params.query.trim()}%`
        const textFilter = or(
          ilike(brands.name, pattern),
          ilike(models.name, pattern),
          ilike(variants.name, pattern),
          ilike(variants.trim, pattern)
        )
        if (textFilter) {
          conditions.push(textFilter)
        }
      }

      if (params.fuel?.trim()) {
        conditions.push(ilike(variants.fuel, `%${params.fuel.trim()}%`))
      }

      if (params.transmission) {
        conditions.push(eq(variants.transmission, params.transmission))
      }

      if (params.bodyType?.trim()) {
        conditions.push(ilike(models.bodyType, `%${params.bodyType.trim()}%`))
      }

      if (params.segment) {
        conditions.push(eq(models.segment, params.segment))
      }

      if (typeof params.seats === 'number' && Number.isFinite(params.seats)) {
        conditions.push(lte(models.seatsMin, params.seats))
        conditions.push(gte(models.seatsMax, params.seats))
      }

      const maxRows = Math.min(Math.max(params.limit ?? 10, 1), 25)

      const rows = await ctx.db
        .select({
          variantId: variants.id,
          variantSlug: variants.slug,
          variantName: variants.name,
          suffix: variants.suffix,
          fuel: variants.fuel,
          transmission: variants.transmission,
          powertrainType: variants.powertrainType,
          trim: variants.trim,
          colorTone: variants.colorTone,
          modelId: models.id,
          modelSlug: models.slug,
          modelName: models.name,
          bodyType: models.bodyType,
          segment: models.segment,
          seatsMin: models.seatsMin,
          seatsMax: models.seatsMax,
          seatsLabel: models.seatsLabel,
          brandId: brands.id,
          brandSlug: brands.slug,
          brandName: brands.name,
          mileage: specs.mileage,
          airbags: specs.airbags,
          adas: specs.adas,
          dimensions: specs.dimensions,
        })
        .from(variants)
        .innerJoin(models, eq(variants.modelId, models.id))
        .innerJoin(brands, eq(models.brandId, brands.id))
        .leftJoin(specs, eq(specs.variantId, variants.id))
        .where(and(...conditions))
        .limit(25)

      const enriched = rows
        .map((r) => {
          const hasSunroof = resolveVariantSunroof(r.modelSlug, r.variantName, r.dimensions)
          return {
            ...r,
            hasSunroof,
            sunroofNote: hasSunroof
              ? 'Panoramic sunroof available on this variant'
              : 'NO sunroof on this variant',
          }
        })
        .filter((r) => (typeof params.sunroof === 'boolean' ? r.hasSunroof === params.sunroof : true))
        .slice(0, maxRows)

      if (enriched.length === 0) {
        return {
          cars: [],
          total: 0,
          inMotoAiDatabase: false,
          message:
            params.sunroof === true
              ? 'No matching vehicle WITH a sunroof found in MotoAI verified database for these filters. Do NOT guess or invent sunroof availability — tell the customer honestly and use search_web_cars to look up real online options.'
              : 'No matching active vehicles found in MotoAI verified database. Tell the customer honestly and use search_web_cars if helpful.',
        }
      }

      return {
        cars: enriched,
        total: enriched.length,
        inMotoAiDatabase: true,
      }
    } catch (error) {
      return {
        cars: [],
        total: 0,
        message: 'Catalog data is currently unavailable.',
        error: error instanceof Error ? error.message : 'Unknown database error',
      }
    }
  },
})

/** Fetch full variant specifications and approved media for a given variant ID or slug. */
export const getVariantDetails = defineTool({
  name: 'get_variant_details',
  description:
    'Get detailed specifications, safety features, and approved media for a specific car variant.',
  parameters: {
    variantId: {
      type: 'string',
      description: 'UUID of the variant',
    },
    slug: {
      type: 'string',
      description: 'Variant slug (e.g. "hyryder-v-hybrid-at")',
    },
    modelSlug: {
      type: 'string',
      description: 'Optional model slug to disambiguate variant slug',
    },
  },
  handler: async (params: GetVariantDetailsParams, ctx) => {
    if (!params.variantId && !params.slug) {
      return {
        found: false,
        message: 'Provide either variantId or slug to look up variant details.',
      }
    }

    try {
      const conditions: SQL[] = [eq(variants.active, true)]
      if (params.variantId) {
        conditions.push(eq(variants.id, params.variantId))
      } else if (params.slug) {
        conditions.push(eq(variants.slug, params.slug))
      }
      if (params.modelSlug) {
        conditions.push(eq(models.slug, params.modelSlug))
      }

      const [variantRow] = await ctx.db
        .select({
          variant: variants,
          model: models,
          brand: brands,
        })
        .from(variants)
        .innerJoin(models, eq(variants.modelId, models.id))
        .innerJoin(brands, eq(models.brandId, brands.id))
        .where(and(...conditions))
        .limit(1)

      if (!variantRow) {
        return {
          found: false,
          message: 'Variant not found or currently inactive.',
        }
      }

      const specRows = await ctx.db
        .select()
        .from(specs)
        .where(eq(specs.variantId, variantRow.variant.id))
        .limit(5)

      const verifiedSpec = specRows.find((s) => s.verified) ?? specRows[0] ?? null

      const mediaRows = await ctx.db
        .select()
        .from(media)
        .where(
          and(
            eq(media.modelId, variantRow.model.id),
            eq(media.approved, true)
          )
        )
        .limit(12)

      return {
        found: true,
        brand: {
          id: variantRow.brand.id,
          slug: variantRow.brand.slug,
          name: variantRow.brand.name,
        },
        model: {
          id: variantRow.model.id,
          slug: variantRow.model.slug,
          name: variantRow.model.name,
          bodyType: variantRow.model.bodyType,
          segment: variantRow.model.segment,
          seatsMin: variantRow.model.seatsMin,
          seatsMax: variantRow.model.seatsMax,
          seatsLabel: variantRow.model.seatsLabel,
        },
        variant: variantRow.variant,
        specs: verifiedSpec,
        specsVerified: verifiedSpec?.verified ?? false,
        media: mediaRows.filter(
          (m) => m.variantId === null || m.variantId === variantRow.variant.id
        ),
      }
    } catch (error) {
      return {
        found: false,
        message: 'Unable to load variant details from catalog.',
        error: error instanceof Error ? error.message : 'Unknown database error',
      }
    }
  },
})
