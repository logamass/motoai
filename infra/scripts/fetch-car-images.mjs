import fs from 'node:fs'
import path from 'node:path'

const outDir = path.resolve('app/public/cars')
fs.mkdirSync(outDir, { recursive: true })

const TARGETS = [
  { slug: 'glanza', queries: ['Toyota Glanza front', 'Toyota Starlet 2022', 'Suzuki Baleno 2022 front'] },
  { slug: 'taisor', queries: ['Toyota Urban Cruiser Taisor', 'Toyota Starlet Cross', 'Suzuki Fronx front'] },
  { slug: 'urban-cruiser-hyryder', queries: ['Toyota Urban Cruiser Hyryder', 'Toyota Urban Cruiser 2023'] },
  { slug: 'rumion', queries: ['Toyota Rumion front', 'Toyota Rumion 2023', 'Toyota Rumion'] },
  { slug: 'innova-hycross', queries: ['Toyota Zenix 2.0 V 2023', 'Toyota Innova Hycross', 'Toyota Innova Zenix'] },
  { slug: 'fortuner', queries: ['Toyota Fortuner 2023 front', 'Toyota Fortuner Legender', 'Toyota Fortuner 2021'] },
]

const HEADERS = {
  'User-Agent': 'MotoAI-CarCatalog/1.0 (https://motoai.in; contact@motoai.in)',
}

async function searchWikimedia(query) {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
    `&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=10` +
    `&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=960&format=json`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) return []
  const data = await res.json()
  const pages = Object.values(data?.query?.pages || {})
  return pages.filter((p) => {
    const info = p.imageinfo?.[0]
    if (!info) return false
    const mime = info.mime || ''
    const title = (p.title || '').toLowerCase()
    return (
      (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp') &&
      !title.includes('interior') &&
      !title.includes('rear') &&
      !title.includes('logo') &&
      !title.includes('badge') &&
      !title.includes('dashboard')
    )
  })
}

async function main() {
  const credits = []
  for (const t of TARGETS) {
    let saved = false
    for (const q of t.queries) {
      const hits = await searchWikimedia(q)
      for (const h of hits) {
        const info = h.imageinfo[0]
        const imgUrl = info.thumburl || info.url
        const r = await fetch(imgUrl, { headers: HEADERS })
        if (!r.ok) continue
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length < 15000) continue
        const dest = path.join(outDir, `${t.slug}.jpg`)
        fs.writeFileSync(dest, buf)
        const license = info.extmetadata?.LicenseShortName?.value || 'CC-BY-SA'
        const author = (info.extmetadata?.Artist?.value || 'Wikimedia Commons')
          .replace(/<[^>]+>/g, '')
          .trim()
          .slice(0, 80)
        credits.push({
          slug: t.slug,
          file: `/cars/${t.slug}.jpg`,
          title: h.title,
          license,
          author,
          bytes: buf.length,
        })
        console.log(`OK ${t.slug}.jpg (${Math.round(buf.length / 1024)} KB) <- ${h.title} [${license}]`)
        saved = true
        break
      }
      if (saved) break
    }
    if (!saved) console.log(`MISS ${t.slug}`)
  }
  fs.writeFileSync(path.join(outDir, 'ATTRIBUTION.json'), JSON.stringify(credits, null, 2))
  console.log(`Saved ${credits.length}/${TARGETS.length} CC-licensed real car photos.`)
}

main()
