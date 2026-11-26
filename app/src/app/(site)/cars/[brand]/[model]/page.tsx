import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@motoai/core/db'
import { brands, models, specs, variants } from '@motoai/mod-catalog/schema'
import { dealers, priceLists, priceRows } from '@motoai/mod-pricing/schema'
import { ensureBooted } from '@/lib/bootstrap'
import {
  CarDetailClient,
  type CarVariantItem,
  type CarVariantPriceData,
  type CarVariantSpecData,
} from '@/components/car/CarDetailClient'
import { ChatWidget } from '@/components/chat-widget/ChatWidget'

export const dynamic = 'force-dynamic'

interface CarPageProps {
  params: Promise<{ brand: string; model: string }>
  searchParams: Promise<{ variant?: string }>
}

async function fetchCarDetailData(brandSlug: string, modelSlug: string) {
  await ensureBooted()

  const [brandList, modelList, variantList, specList, dealerList, priceListEntries, priceRowEntries] =
    await Promise.all([
      db.select().from(brands),
      db.select().from(models),
      db.select().from(variants),
      db.select().from(specs),
      db.select().from(dealers),
      db.select().from(priceLists),
      db.select().from(priceRows),
    ])

  const brandRow = brandList.find((b) => b.active && b.slug === brandSlug)
  if (!brandRow) return null

  const modelRow = modelList.find(
    (m) => m.active && m.brandId === brandRow.id && m.slug === modelSlug
  )
  if (!modelRow) return null

  const activeVariants = variantList
    .filter((v) => v.active && v.modelId === modelRow.id)
    .sort((a, b) => a.name.localeCompare(b.name))

  const variantIdSet = new Set(activeVariants.map((v) => v.id))
  const activeDealerMap = new Map(dealerList.filter((d) => d.active).map((d) => [d.id, d]))

  const publishedLists = priceListEntries
    .filter((pl) => pl.status === 'published' && activeDealerMap.has(pl.dealerId))
    .sort((a, b) => {
      const dateCmp = b.effectiveDate.localeCompare(a.effectiveDate)
      return dateCmp !== 0 ? dateCmp : b.version - a.version
    })
  const publishedListRank = new Map(publishedLists.map((pl, idx) => [pl.id, idx]))
  const publishedListMap = new Map(publishedLists.map((pl) => [pl.id, pl]))

  const specByVariant = new Map<string, CarVariantSpecData>()
  for (const s of specList) {
    if (!variantIdSet.has(s.variantId)) continue
    const existing = specByVariant.get(s.variantId)
    if (!existing || (!existing.verified && s.verified)) {
      specByVariant.set(s.variantId, {
        engine: s.engine,
        power: s.power,
        mileage: s.mileage,
        bootSpace: s.bootSpace,
        safetyRating: s.safetyRating,
        airbags: s.airbags,
        adas: s.adas,
        source: s.source,
        verified: s.verified,
      })
    }
  }

  const priceRankByVariant = new Map<string, number>()
  const priceByVariant = new Map<string, CarVariantPriceData>()

  for (const row of priceRowEntries) {
    if (!variantIdSet.has(row.variantId)) continue
    const pl = publishedListMap.get(row.priceListId)
    const rank = publishedListRank.get(row.priceListId)
    if (!pl || rank === undefined) continue

    const dealer = activeDealerMap.get(pl.dealerId)
    if (!dealer) continue

    const currentRank = priceRankByVariant.get(row.variantId)
    if (currentRank !== undefined && currentRank <= rank) continue

    priceRankByVariant.set(row.variantId, rank)
    priceByVariant.set(row.variantId, {
      dealerId: dealer.id,
      dealerName: dealer.name,
      dealerCity: dealer.city,
      rtoJurisdiction: dealer.rtoJurisdiction,
      effectiveDate: pl.effectiveDate,
      version: pl.version,
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
      extras: row.extras ?? {},
      onroad1p3: row.onroad1p3,
      onroad3p3: row.onroad3p3,
    })
  }

  const seatsDisplay =
    modelRow.seatsLabel?.trim() ||
    (modelRow.seatsMin === modelRow.seatsMax
      ? `${modelRow.seatsMin} Seater`
      : `${modelRow.seatsMin}–${modelRow.seatsMax} Seater`)

  const items: CarVariantItem[] = activeVariants
    .map((v) => ({
      id: v.id,
      slug: v.slug,
      name: v.name,
      suffix: v.suffix,
      fuel: v.fuel,
      transmission: v.transmission,
      powertrainType: v.powertrainType,
      trim: v.trim,
      specs: specByVariant.get(v.id) ?? null,
      price: priceByVariant.get(v.id) ?? null,
    }))
    .sort((a, b) => {
      if (a.price && b.price) return a.price.onroad1p3 - b.price.onroad1p3
      if (a.price) return -1
      if (b.price) return 1
      return a.name.localeCompare(b.name)
    })

  return {
    brand: {
      id: brandRow.id,
      slug: brandRow.slug,
      name: brandRow.name,
    },
    model: {
      id: modelRow.id,
      slug: modelRow.slug,
      name: modelRow.name,
      bodyType: modelRow.bodyType,
      segment: modelRow.segment,
      seatsDisplay,
    },
    variants: items,
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ brand: string; model: string }>
}): Promise<Metadata> {
  const { brand, model } = await params
  try {
    const data = await fetchCarDetailData(brand, model)
    if (!data) {
      return { title: 'Car Not Found | MotoAI' }
    }
    return {
      title: `${data.brand.name} ${data.model.name} On-Road Price, Breakup & EMI | MotoAI`,
      description: `Exact dealer-published 1+3 & 3+3 on-road price breakup, key specs, EMI calculator, and test-drive booking for ${data.brand.name} ${data.model.name}.`,
    }
  } catch {
    return { title: 'Car On-Road Price | MotoAI' }
  }
}

export default async function CarDetailPage({ params, searchParams }: CarPageProps) {
  const { brand, model } = await params
  const resolvedSearch = await searchParams

  let data: Awaited<ReturnType<typeof fetchCarDetailData>> = null
  try {
    data = await fetchCarDetailData(brand, model)
  } catch {
    notFound()
  }

  if (!data) {
    notFound()
  }

  return (
    <>
      <CarDetailClient
        brand={data.brand}
        model={data.model}
        variants={data.variants}
        initialVariantSlug={resolvedSearch.variant}
      />
      <ChatWidget />
    </>
  )
}
