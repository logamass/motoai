/**
 * Automatic Copyright-Free Car Image Fetcher (Wikimedia Commons CC API).
 *
 * Searches Wikimedia Commons by brand + model name, filters strictly for
 * open Creative Commons / Public Domain licenses (CC0, CC-BY, CC-BY-SA, PD),
 * skips interior/logo/badge shots, and returns direct 960px thumbnail URLs.
 */

export interface FetchedCarPhoto {
  url: string
  title: string
  license: string
  author: string
  source: 'wikimedia-commons'
}

const OPEN_LICENSE_RE = /(cc0|cc[- ]by|public domain|pd)/i
const SKIP_TITLE_RE = /(interior|rear|logo|badge|dashboard|steering|wheel|engine|emblem|icon|map|chart)/i

const USER_AGENT = 'MotoAI-CarCatalog/1.0 (https://motoai.in; ops@motoai.in)'

/**
 * Search Wikimedia Commons for a clean exterior photo of a car model.
 * Works for any brand/model (Toyota, Hyundai, Maruti, Tata, Kia, etc.).
 */
export async function fetchCopyrightFreeCarPhoto(
  brandName: string,
  modelName: string
): Promise<FetchedCarPhoto | null> {
  const queries = [
    `${brandName} ${modelName} front`,
    `${brandName} ${modelName}`,
  ]

  // Special international aliases for Indian badge-engineered models
  const lower = modelName.toLowerCase()
  if (lower.includes('hycross')) queries.unshift('Toyota Innova Zenix 2023')
  if (lower.includes('taisor')) queries.unshift('Toyota Urban Cruiser Taisor', 'Suzuki Fronx front')
  if (lower.includes('glanza')) queries.unshift('Toyota Glanza 2022', 'Suzuki Baleno 2022 front')

  for (const query of queries) {
    try {
      const apiUrl =
        `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
        `&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=8` +
        `&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=960&format=json`

      const res = await fetch(apiUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue

      const data = (await res.json()) as {
        query?: {
          pages?: Record<
            string,
            {
              title?: string
              imageinfo?: Array<{
                url?: string
                thumburl?: string
                mime?: string
                extmetadata?: {
                  LicenseShortName?: { value?: string }
                  Artist?: { value?: string }
                }
              }>
            }
          >
        }
      }

      const pages = Object.values(data.query?.pages ?? {})
      for (const page of pages) {
        const title = page.title ?? ''
        const info = page.imageinfo?.[0]
        if (!info) continue

        const mime = info.mime ?? ''
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) continue
        if (SKIP_TITLE_RE.test(title)) continue

        const license = info.extmetadata?.LicenseShortName?.value ?? ''
        if (!OPEN_LICENSE_RE.test(license)) continue

        const url = info.thumburl || info.url
        if (!url) continue

        const author = (info.extmetadata?.Artist?.value ?? 'Wikimedia Commons')
          .replace(/<[^>]+>/g, '')
          .trim()
          .slice(0, 100)

        return {
          url,
          title,
          license,
          author,
          source: 'wikimedia-commons',
        }
      }
    } catch {
      // Network/timeout on this query — try next fallback query
    }
  }

  return null
}
