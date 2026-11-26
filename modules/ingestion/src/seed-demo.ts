import { and, eq } from 'drizzle-orm'
import type { DB } from '@motoai/core/db'
import {
  brands,
  models,
  specs,
  variants,
} from '@motoai/mod-catalog/schema'
import {
  dealerBrands,
  dealers,
  priceLists,
  priceRows,
} from '@motoai/mod-pricing/schema'
import {
  validatePriceRow,
  type PriceRowInput,
} from '@motoai/mod-pricing/validators'

interface SeedVariantSpec {
  engine: string
  mileage: string
  safetyRating: string
  airbags: number
}

interface SeedVariantPrice {
  exShowroom: number
  tcs: number
  taxReg: number
  insurance1p3: number
  insurance3p3: number
  ew: number
  servicePack: number
  accessories: number
  ceramic?: number
  underbody?: number
  onroad1p3: number
  onroad3p3: number
}

interface SeedVariantDef {
  slug: string
  name: string
  suffix: string
  fuel: string
  transmission: 'MT' | 'AT'
  powertrainType: string
  trim: string
  spec: SeedVariantSpec
  price: SeedVariantPrice
}

interface SeedModelDef {
  slug: string
  name: string
  bodyType: string
  segment: 'private' | 'taxi' | 'commercial'
  seatsMin: number
  seatsMax: number
  seatsLabel: string
  variants: SeedVariantDef[]
}

const DEMO_MODELS: SeedModelDef[] = [
  {
    slug: 'glanza',
    name: 'Glanza',
    bodyType: 'hatchback',
    segment: 'private',
    seatsMin: 5,
    seatsMax: 5,
    seatsLabel: '5 Seater',
    variants: [
      {
        slug: 's-mt',
        name: 'S MT',
        suffix: 'GLZSMT',
        fuel: 'Petrol',
        transmission: 'MT',
        powertrainType: 'Petrol',
        trim: 'S',
        spec: {
          engine: '1197 cc K-Series Dual Jet Petrol',
          mileage: '22.35 km/l',
          safetyRating: 'Unrated (Heartect Platform)',
          airbags: 2,
        },
        price: {
          exShowroom: 779000,
          tcs: 0,
          taxReg: 105000,
          insurance1p3: 36500,
          insurance3p3: 51500,
          ew: 14500,
          servicePack: 9500,
          accessories: 18000,
          onroad1p3: 962500,
          onroad3p3: 977500,
        },
      },
      {
        slug: 'v-amt',
        name: 'V AMT',
        suffix: 'GLZVAT',
        fuel: 'Petrol',
        transmission: 'AT',
        powertrainType: 'Petrol',
        trim: 'V',
        spec: {
          engine: '1197 cc K-Series Dual Jet Petrol',
          mileage: '22.94 km/l',
          safetyRating: 'Unrated (Heartect Platform)',
          airbags: 6,
        },
        price: {
          exShowroom: 982000,
          tcs: 0,
          taxReg: 132000,
          insurance1p3: 44200,
          insurance3p3: 61800,
          ew: 16500,
          servicePack: 11000,
          accessories: 22000,
          onroad1p3: 1207700,
          onroad3p3: 1225300,
        },
      },
    ],
  },
  {
    slug: 'taisor',
    name: 'Taisor',
    bodyType: 'compact-suv',
    segment: 'private',
    seatsMin: 5,
    seatsMax: 5,
    seatsLabel: '5 Seater',
    variants: [
      {
        slug: 's-plus-mt',
        name: 'S+ MT',
        suffix: 'TSRSMT',
        fuel: 'Petrol',
        transmission: 'MT',
        powertrainType: 'Petrol',
        trim: 'S+',
        spec: {
          engine: '1197 cc K-Series Petrol',
          mileage: '21.79 km/l',
          safetyRating: 'Unrated (Heartect Platform)',
          airbags: 2,
        },
        price: {
          exShowroom: 855000,
          tcs: 0,
          taxReg: 115000,
          insurance1p3: 39800,
          insurance3p3: 55600,
          ew: 15500,
          servicePack: 10500,
          accessories: 20000,
          onroad1p3: 1055800,
          onroad3p3: 1071600,
        },
      },
      {
        slug: 'v-turbo-at',
        name: 'V Turbo AT',
        suffix: 'TSRVAT',
        fuel: 'Petrol',
        transmission: 'AT',
        powertrainType: 'Turbo Petrol',
        trim: 'V',
        spec: {
          engine: '998 cc Boosterjet Turbo Petrol',
          mileage: '20.01 km/l',
          safetyRating: 'Unrated (Heartect Platform)',
          airbags: 6,
        },
        price: {
          exShowroom: 1288000,
          tcs: 12880,
          taxReg: 235000,
          insurance1p3: 58400,
          insurance3p3: 81200,
          ew: 19500,
          servicePack: 12500,
          accessories: 28000,
          onroad1p3: 1654280,
          onroad3p3: 1677080,
        },
      },
    ],
  },
  {
    slug: 'urban-cruiser-hyryder',
    name: 'Urban Cruiser Hyryder',
    bodyType: 'suv',
    segment: 'private',
    seatsMin: 5,
    seatsMax: 5,
    seatsLabel: '5 Seater',
    variants: [
      {
        slug: 'e-mt',
        name: 'E MT',
        suffix: 'HYREMT',
        fuel: 'Petrol',
        transmission: 'MT',
        powertrainType: 'Neo Drive Petrol',
        trim: 'E',
        spec: {
          engine: '1462 cc K15C Neo Drive Petrol',
          mileage: '21.12 km/l',
          safetyRating: '4 Star (Global NCAP Est.)',
          airbags: 2,
        },
        price: {
          exShowroom: 1114000,
          tcs: 11140,
          taxReg: 245000,
          insurance1p3: 56598,
          insurance3p3: 78598,
          ew: 25000,
          servicePack: 15000,
          accessories: 40000,
          onroad1p3: 1506738,
          onroad3p3: 1528738,
        },
      },
      {
        slug: 's-hybrid-ecvt',
        name: 'S Hybrid e-CVT',
        suffix: 'HYRSAT',
        fuel: 'Hybrid',
        transmission: 'AT',
        powertrainType: 'Strong Hybrid',
        trim: 'S',
        spec: {
          engine: '1490 cc TNGA Strong Hybrid',
          mileage: '27.97 km/l',
          safetyRating: '4 Star (Global NCAP Est.)',
          airbags: 2,
        },
        price: {
          exShowroom: 1666000,
          tcs: 16660,
          taxReg: 310000,
          insurance1p3: 72400,
          insurance3p3: 101500,
          ew: 28000,
          servicePack: 16500,
          accessories: 40000,
          onroad1p3: 2149560,
          onroad3p3: 2178660,
        },
      },
      {
        slug: 'v-hybrid-ecvt',
        name: 'V Hybrid e-CVT',
        suffix: 'HYRVAT',
        fuel: 'Hybrid',
        transmission: 'AT',
        powertrainType: 'Strong Hybrid',
        trim: 'V',
        spec: {
          engine: '1490 cc TNGA Strong Hybrid',
          mileage: '27.97 km/l',
          safetyRating: '4 Star (Global NCAP Est.)',
          airbags: 6,
        },
        price: {
          exShowroom: 1999000,
          tcs: 19990,
          taxReg: 372000,
          insurance1p3: 84600,
          insurance3p3: 118400,
          ew: 30000,
          servicePack: 18000,
          accessories: 45000,
          onroad1p3: 2568590,
          onroad3p3: 2602390,
        },
      },
    ],
  },
  {
    slug: 'rumion',
    name: 'Rumion',
    bodyType: 'mpv',
    segment: 'private',
    seatsMin: 7,
    seatsMax: 7,
    seatsLabel: '7 Seater',
    variants: [
      {
        slug: 's-mt',
        name: 'S MT',
        suffix: 'RUMSMT',
        fuel: 'Petrol',
        transmission: 'MT',
        powertrainType: 'Petrol',
        trim: 'S',
        spec: {
          engine: '1462 cc K15C Neo Drive Petrol',
          mileage: '20.51 km/l',
          safetyRating: '3 Star (Global NCAP Est.)',
          airbags: 4,
        },
        price: {
          exShowroom: 1044000,
          tcs: 10440,
          taxReg: 192000,
          insurance1p3: 48900,
          insurance3p3: 68400,
          ew: 21000,
          servicePack: 13500,
          accessories: 25000,
          onroad1p3: 1354840,
          onroad3p3: 1374340,
        },
      },
      {
        slug: 's-cng-mt',
        name: 'S CNG MT',
        suffix: 'RUMCNG',
        fuel: 'CNG',
        transmission: 'MT',
        powertrainType: 'CNG',
        trim: 'S CNG',
        spec: {
          engine: '1462 cc K15C Bi-Fuel CNG',
          mileage: '26.11 km/kg',
          safetyRating: '3 Star (Global NCAP Est.)',
          airbags: 4,
        },
        price: {
          exShowroom: 1139000,
          tcs: 11390,
          taxReg: 210000,
          insurance1p3: 52400,
          insurance3p3: 73200,
          ew: 22000,
          servicePack: 14000,
          accessories: 25000,
          onroad1p3: 1473790,
          onroad3p3: 1494590,
        },
      },
    ],
  },
  {
    slug: 'innova-hycross',
    name: 'Innova Hycross',
    bodyType: 'mpv',
    segment: 'private',
    seatsMin: 7,
    seatsMax: 8,
    seatsLabel: '7-8 Seater',
    variants: [
      {
        slug: 'gx-7s-at',
        name: 'GX 7S AT',
        suffix: 'HYCGX7',
        fuel: 'Petrol',
        transmission: 'AT',
        powertrainType: 'Petrol',
        trim: 'GX',
        spec: {
          engine: '1987 cc TNGA-C Petrol',
          mileage: '16.13 km/l',
          safetyRating: '5 Star (Bharat NCAP)',
          airbags: 6,
        },
        price: {
          exShowroom: 1994000,
          tcs: 19940,
          taxReg: 370000,
          insurance1p3: 84200,
          insurance3p3: 117800,
          ew: 32000,
          servicePack: 22000,
          accessories: 50000,
          onroad1p3: 2572140,
          onroad3p3: 2605740,
        },
      },
      {
        slug: 'vx-hybrid-7s-ecvt',
        name: 'VX Hybrid 7S e-CVT',
        suffix: 'HYCVX7',
        fuel: 'Hybrid',
        transmission: 'AT',
        powertrainType: 'Strong Hybrid',
        trim: 'VX',
        spec: {
          engine: '1987 cc TNGA-C 5th Gen Strong Hybrid',
          mileage: '23.24 km/l',
          safetyRating: '5 Star (Bharat NCAP)',
          airbags: 6,
        },
        price: {
          exShowroom: 2597000,
          tcs: 25970,
          taxReg: 482000,
          insurance1p3: 106500,
          insurance3p3: 148900,
          ew: 38000,
          servicePack: 25000,
          accessories: 55000,
          onroad1p3: 3329470,
          onroad3p3: 3371870,
        },
      },
      {
        slug: 'zx-o-hybrid-7s-ecvt',
        name: 'ZX(O) Hybrid 7S e-CVT',
        suffix: 'HYCZXO',
        fuel: 'Hybrid',
        transmission: 'AT',
        powertrainType: 'Strong Hybrid',
        trim: 'ZX(O)',
        spec: {
          engine: '1987 cc TNGA-C 5th Gen Strong Hybrid',
          mileage: '23.24 km/l',
          safetyRating: '5 Star (Bharat NCAP)',
          airbags: 6,
        },
        price: {
          exShowroom: 3098000,
          tcs: 30980,
          taxReg: 575000,
          insurance1p3: 124800,
          insurance3p3: 174500,
          ew: 42000,
          servicePack: 28000,
          accessories: 65000,
          onroad1p3: 3963780,
          onroad3p3: 4013480,
        },
      },
    ],
  },
  {
    slug: 'fortuner',
    name: 'Fortuner',
    bodyType: 'suv',
    segment: 'private',
    seatsMin: 7,
    seatsMax: 7,
    seatsLabel: '7 Seater',
    variants: [
      {
        slug: '4x2-diesel-mt',
        name: '4x2 Diesel MT',
        suffix: 'FTN42M',
        fuel: 'Diesel',
        transmission: 'MT',
        powertrainType: 'Diesel',
        trim: '4x2',
        spec: {
          engine: '2755 cc 1GD-FTV Turbo Diesel',
          mileage: '14.60 km/l',
          safetyRating: '5 Star (ASEAN NCAP)',
          airbags: 7,
        },
        price: {
          exShowroom: 3633000,
          tcs: 36330,
          taxReg: 674000,
          insurance1p3: 145200,
          insurance3p3: 202800,
          ew: 55000,
          servicePack: 35000,
          accessories: 75000,
          onroad1p3: 4653530,
          onroad3p3: 4711130,
        },
      },
      {
        slug: '4x2-diesel-at',
        name: '4x2 Diesel AT',
        suffix: 'FTN42A',
        fuel: 'Diesel',
        transmission: 'AT',
        powertrainType: 'Diesel',
        trim: '4x2',
        spec: {
          engine: '2755 cc 1GD-FTV Turbo Diesel',
          mileage: '14.20 km/l',
          safetyRating: '5 Star (ASEAN NCAP)',
          airbags: 7,
        },
        price: {
          exShowroom: 3861000,
          tcs: 38610,
          taxReg: 716000,
          insurance1p3: 153600,
          insurance3p3: 214500,
          ew: 55000,
          servicePack: 35000,
          accessories: 75000,
          onroad1p3: 4934210,
          onroad3p3: 4995110,
        },
      },
    ],
  },
]

/**
 * Idempotently seed Epic Toyota Chennai demo catalog, specs, and Oct 2026
 * published price list (6 models, 14 variants, 14 arithmetically verified price rows).
 */
export async function seedDemoData(db: DB): Promise<{
  dealerId: string
  modelsCount: number
  variantsCount: number
  priceRowsCount: number
}> {
  // 1. Brand: Toyota
  let [brand] = await db
    .select()
    .from(brands)
    .where(eq(brands.slug, 'toyota'))
    .limit(1)

  if (!brand) {
    ;[brand] = await db
      .insert(brands)
      .values({
        slug: 'toyota',
        name: 'Toyota',
        country: 'Japan',
        active: true,
      })
      .returning()
  }

  // 2. Dealer: Epic Toyota Chennai
  let [dealer] = await db
    .select()
    .from(dealers)
    .where(eq(dealers.slug, 'epic-toyota-chennai'))
    .limit(1)

  if (!dealer) {
    ;[dealer] = await db
      .insert(dealers)
      .values({
        name: 'Epic Toyota Chennai',
        slug: 'epic-toyota-chennai',
        city: 'Chennai',
        rtoJurisdiction: 'Chennai RTO',
        active: true,
      })
      .returning()
  }

  // 3. dealer_brands link
  const [existingDealerBrand] = await db
    .select()
    .from(dealerBrands)
    .where(
      and(
        eq(dealerBrands.dealerId, dealer.id),
        eq(dealerBrands.brandId, brand.id)
      )
    )
    .limit(1)

  if (!existingDealerBrand) {
    await db.insert(dealerBrands).values({
      dealerId: dealer.id,
      brandId: brand.id,
    })
  }

  // 4. Models, Variants, Specs
  let modelsCount = 0
  let variantsCount = 0
  const seededPriceTargets: Array<{
    variantId: string
    variantName: string
    suffix: string
    price: SeedVariantPrice
  }> = []

  for (const modelDef of DEMO_MODELS) {
    let [modelRow] = await db
      .select()
      .from(models)
      .where(eq(models.slug, modelDef.slug))
      .limit(1)

    if (!modelRow) {
      ;[modelRow] = await db
        .insert(models)
        .values({
          brandId: brand.id,
          slug: modelDef.slug,
          name: modelDef.name,
          bodyType: modelDef.bodyType,
          segment: modelDef.segment,
          seatsMin: modelDef.seatsMin,
          seatsMax: modelDef.seatsMax,
          seatsLabel: modelDef.seatsLabel,
          active: true,
        })
        .returning()
    }
    modelsCount++

    for (const variantDef of modelDef.variants) {
      let [variantRow] = await db
        .select()
        .from(variants)
        .where(
          and(
            eq(variants.modelId, modelRow.id),
            eq(variants.slug, variantDef.slug)
          )
        )
        .limit(1)

      if (!variantRow) {
        ;[variantRow] = await db
          .insert(variants)
          .values({
            modelId: modelRow.id,
            slug: variantDef.slug,
            name: variantDef.name,
            suffix: variantDef.suffix,
            fuel: variantDef.fuel,
            transmission: variantDef.transmission,
            powertrainType: variantDef.powertrainType,
            trim: variantDef.trim,
            active: true,
          })
          .returning()
      }
      variantsCount++

      const [existingSpec] = await db
        .select()
        .from(specs)
        .where(eq(specs.variantId, variantRow.id))
        .limit(1)

      if (!existingSpec) {
        await db.insert(specs).values({
          variantId: variantRow.id,
          engine: variantDef.spec.engine,
          mileage: variantDef.spec.mileage,
          safetyRating: variantDef.spec.safetyRating,
          airbags: variantDef.spec.airbags,
          source: 'web',
          verified: false,
        })
      }

      seededPriceTargets.push({
        variantId: variantRow.id,
        variantName: `${modelDef.name} ${variantDef.name}`,
        suffix: variantDef.suffix,
        price: variantDef.price,
      })
    }
  }

  // 5. Published price_lists row + 14 validated price_rows
  let [priceList] = await db
    .select()
    .from(priceLists)
    .where(
      and(
        eq(priceLists.dealerId, dealer.id),
        eq(priceLists.status, 'published')
      )
    )
    .limit(1)

  if (!priceList) {
    ;[priceList] = await db
      .insert(priceLists)
      .values({
        dealerId: dealer.id,
        sourcePdf: 'Epic Toyota Chennai - Oct 2026 (Demo Seed)',
        effectiveDate: '2026-10-11',
        status: 'published',
        version: 1,
        publishedAt: new Date(),
      })
      .returning()
  }

  const existingPriceRows = await db
    .select()
    .from(priceRows)
    .where(eq(priceRows.priceListId, priceList.id))

  const existingVariantIds = new Set(existingPriceRows.map((r) => r.variantId))
  let insertedNewRowsCount = 0

  for (const target of seededPriceTargets) {
    if (existingVariantIds.has(target.variantId)) {
      continue
    }

    const rowInput: PriceRowInput = {
      variantId: target.variantId,
      suffix: target.suffix,
      exShowroom: target.price.exShowroom,
      tcs: target.price.tcs,
      taxReg: target.price.taxReg,
      insurance1p3: target.price.insurance1p3,
      insurance3p3: target.price.insurance3p3,
      ew: target.price.ew,
      servicePack: target.price.servicePack,
      accessories: target.price.accessories,
      ceramic: target.price.ceramic ?? 0,
      underbody: target.price.underbody ?? 0,
      onroad1p3: target.price.onroad1p3,
      onroad3p3: target.price.onroad3p3,
    }

    const validation = validatePriceRow(rowInput)
    if (!validation.valid) {
      throw new Error(
        `Seed price row arithmetic failed for ${target.variantName} (${target.suffix}): ${validation.errors.join('; ')}`
      )
    }

    await db.insert(priceRows).values({
      priceListId: priceList.id,
      variantId: target.variantId,
      exShowroom: rowInput.exShowroom,
      tcs: rowInput.tcs ?? 0,
      taxReg: rowInput.taxReg ?? 0,
      insurance1p3: rowInput.insurance1p3 ?? 0,
      insurance3p3: rowInput.insurance3p3 ?? 0,
      ew: rowInput.ew ?? 0,
      servicePack: rowInput.servicePack ?? 0,
      accessories: rowInput.accessories ?? 0,
      ceramic: rowInput.ceramic ?? 0,
      underbody: rowInput.underbody ?? 0,
      onroad1p3: rowInput.onroad1p3,
      onroad3p3: rowInput.onroad3p3,
    })
    insertedNewRowsCount++
  }

  return {
    dealerId: dealer.id,
    modelsCount,
    variantsCount,
    priceRowsCount: existingPriceRows.length + insertedNewRowsCount,
  }
}
