import type { MetadataRoute } from 'next'
import { db } from '@motoai/core/db'
import { brands, models } from '@motoai/mod-catalog/schema'
import { ensureBooted } from '@/lib/bootstrap'

export const dynamic = 'force-dynamic'

function getSiteUrl(): string {
  const raw =
    process.env.WEB_APP_URL ||
    process.env.NEXTAUTH_URL ||
    'http://localhost:3000'
  return raw.replace(/\/+$/, '')
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${siteUrl}/compare`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/whatsapp`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ]

  try {
    await ensureBooted()

    const [brandList, modelList] = await Promise.all([
      db.select().from(brands),
      db.select().from(models),
    ])

    const activeBrandMap = new Map(
      brandList.filter((b) => b.active).map((b) => [b.id, b])
    )

    const carEntries: MetadataRoute.Sitemap = []
    for (const m of modelList) {
      if (!m.active) continue
      const brand = activeBrandMap.get(m.brandId)
      if (!brand) continue

      carEntries.push({
        url: `${siteUrl}/cars/${encodeURIComponent(brand.slug)}/${encodeURIComponent(m.slug)}`,
        lastModified: m.createdAt ?? now,
        changeFrequency: 'daily',
        priority: 0.9,
      })
    }

    return [...staticEntries, ...carEntries]
  } catch {
    return staticEntries
  }
}
