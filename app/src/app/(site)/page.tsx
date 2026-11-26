import { db } from '@motoai/core'
import { brands, media, models, variants } from '@motoai/mod-catalog/schema'
import { dealers, priceLists, priceRows } from '@motoai/mod-pricing/schema'
import { ensureBooted } from '@/lib/bootstrap'
import {
  CustomerPlatformHome,
  type ShowroomModelCard,
} from '@/components/home/CustomerPlatformHome'

export const dynamic = 'force-dynamic'

async function fetchLiveShowroomModels(): Promise<{
  models: ShowroomModelCard[]
  dbAvailable: boolean
}> {
  try {
    const [brandList, modelList, variantList, dealerList, priceListEntries, priceRowEntries, mediaList] =
      await Promise.all([
        db.select().from(brands),
        db.select().from(models),
        db.select().from(variants),
        db.select().from(dealers),
        db.select().from(priceLists),
        db.select().from(priceRows),
        db.select().from(media),
      ])

    const heroMediaByModel = new Map<string, string>()
    for (const item of mediaList) {
      if (item.approved && item.kind === 'hero' && !heroMediaByModel.has(item.modelId)) {
        heroMediaByModel.set(item.modelId, item.url)
      }
    }

    const activeBrandMap = new Map(
      brandList.filter((b) => b.active).map((b) => [b.id, b])
    )
    const activeDealerIds = new Set(
      dealerList.filter((d) => d.active).map((d) => d.id)
    )

    const publishedLists = priceListEntries
      .filter((pl) => pl.status === 'published' && activeDealerIds.has(pl.dealerId))
      .sort((a, b) => {
        const dateCmp = b.effectiveDate.localeCompare(a.effectiveDate)
        return dateCmp !== 0 ? dateCmp : b.version - a.version
      })

    const publishedListMap = new Map(publishedLists.map((pl) => [pl.id, pl]))

    const minPriceByVariant = new Map<
      string,
      {
        exShowroom: number
        onroad1p3: number
        onroad3p3: number
        effectiveDate: string
      }
    >()

    for (const row of priceRowEntries) {
      const pl = publishedListMap.get(row.priceListId)
      if (!pl || row.onroad1p3 <= 0) continue

      const current = minPriceByVariant.get(row.variantId)
      if (!current || row.onroad1p3 < current.onroad1p3) {
        minPriceByVariant.set(row.variantId, {
          exShowroom: row.exShowroom,
          onroad1p3: row.onroad1p3,
          onroad3p3: row.onroad3p3,
          effectiveDate: pl.effectiveDate,
        })
      }
    }

    const variantsByModel = new Map<string, typeof variantList>()
    for (const v of variantList) {
      if (!v.active) continue
      const list = variantsByModel.get(v.modelId) ?? []
      list.push(v)
      variantsByModel.set(v.modelId, list)
    }

    const cards: ShowroomModelCard[] = []
    for (const m of modelList) {
      if (!m.active) continue
      const brand = activeBrandMap.get(m.brandId)
      if (!brand) continue

      const modelVariants = variantsByModel.get(m.id) ?? []
      const fuels = Array.from(new Set(modelVariants.map((v) => v.fuel))).sort((a, b) =>
        a.localeCompare(b)
      )

      let minExShowroom: number | null = null
      let minOnroad1p3: number | null = null
      let minOnroad3p3: number | null = null
      let effectiveDate: string | null = null

      for (const v of modelVariants) {
        const priceInfo = minPriceByVariant.get(v.id)
        if (!priceInfo) continue
        if (minOnroad1p3 === null || priceInfo.onroad1p3 < minOnroad1p3) {
          minExShowroom = priceInfo.exShowroom
          minOnroad1p3 = priceInfo.onroad1p3
          minOnroad3p3 = priceInfo.onroad3p3
          effectiveDate = priceInfo.effectiveDate
        }
      }

      const seatsLabel =
        m.seatsLabel?.trim() ||
        (m.seatsMin === m.seatsMax
          ? `${m.seatsMin} Seater`
          : `${m.seatsMin}–${m.seatsMax} Seater`)

      cards.push({
        id: m.id,
        brandSlug: brand.slug,
        brandName: brand.name,
        slug: m.slug,
        name: m.name,
        bodyType: m.bodyType,
        segment: m.segment,
        seatsLabel,
        fuels,
        variantCount: modelVariants.length,
        minExShowroom,
        minOnroad1p3,
        minOnroad3p3,
        effectiveDate,
        imageUrl: heroMediaByModel.get(m.id) ?? null,
      })
    }

    cards.sort((a, b) => {
      if (a.minOnroad1p3 !== null && b.minOnroad1p3 !== null) {
        return a.minOnroad1p3 - b.minOnroad1p3
      }
      if (a.minOnroad1p3 !== null) return -1
      if (b.minOnroad1p3 !== null) return 1
      return a.name.localeCompare(b.name)
    })

    return { models: cards, dbAvailable: true }
  } catch {
    return { models: [], dbAvailable: false }
  }
}

export default async function HomePage() {
  await ensureBooted()
  const { models: showroomModels, dbAvailable } = await fetchLiveShowroomModels()

  return <CustomerPlatformHome models={showroomModels} dbAvailable={dbAvailable} />
}
