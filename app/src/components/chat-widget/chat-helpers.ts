export interface ToolCallRecord {
  name: string
  input: Record<string, unknown>
  result: unknown
}

export interface ChatQuickReply {
  id: string
  title: string
}

export interface ChatCtaButton {
  displayText: string
  url: string
}

export interface ChatUiMessage {
  id?: string
  role: 'user' | 'assistant'
  content: string
  createdAt?: string
  quickReplies?: ChatQuickReply[]
  ctaButtons?: ChatCtaButton[]
}

/**
 * Normalize a handoff or car URL so that optional variant path segments
 * route cleanly to `/cars/[brand]/[model]?variant=...&token=...`.
 */
export function normalizeCarLinkUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl, 'http://localhost')
    const segments = parsed.pathname.split('/').filter(Boolean)
    let nextPath = parsed.pathname

    if (segments[0] === 'cars' && segments.length >= 4) {
      const [, brand, model, variant] = segments
      nextPath = `/cars/${encodeURIComponent(brand)}/${encodeURIComponent(model)}`
      if (!parsed.searchParams.has('variant')) {
        parsed.searchParams.set('variant', variant)
      }
    }

    const query = parsed.searchParams.toString()
    return query ? `${nextPath}?${query}` : nextPath
  } catch {
    return rawUrl
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export interface ExtractedCarRef {
  brandSlug: string
  modelSlug: string
  label: string
  variantId?: string
  variantSlug?: string
}

/**
 * Extract car references from `search_cars` or `get_onroad_price` tool calls
 * so simulators/widgets can offer CTA links or mint handoff tokens.
 */
export function extractCarRefsFromToolCalls(
  toolCalls: ToolCallRecord[] | undefined
): ExtractedCarRef[] {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return []

  const seen = new Set<string>()
  const refs: ExtractedCarRef[] = []

  for (const tc of toolCalls) {
    const res = asRecord(tc.result)
    if (!res) continue

    if (tc.name === 'search_cars' && Array.isArray(res.cars)) {
      for (const item of res.cars) {
        const car = asRecord(item)
        if (!car) continue
        const brandSlug = asString(car.brandSlug)
        const modelSlug = asString(car.modelSlug)
        const modelName = asString(car.modelName) ?? modelSlug
        const brandName = asString(car.brandName) ?? brandSlug
        if (!brandSlug || !modelSlug) continue

        const key = `${brandSlug}/${modelSlug}`
        if (seen.has(key)) continue
        seen.add(key)

        refs.push({
          brandSlug,
          modelSlug,
          label: `${brandName} ${modelName}`.trim(),
          variantId: asString(car.variantId) ?? undefined,
          variantSlug: asString(car.variantSlug) ?? undefined,
        })
      }
    }

    if (tc.name === 'get_variant_details' && res.found === true) {
      const brand = asRecord(res.brand)
      const model = asRecord(res.model)
      const variant = asRecord(res.variant)
      const brandSlug = asString(brand?.slug)
      const modelSlug = asString(model?.slug)
      if (brandSlug && modelSlug) {
        const key = `${brandSlug}/${modelSlug}`
        if (!seen.has(key)) {
          seen.add(key)
          refs.push({
            brandSlug,
            modelSlug,
            label: `${asString(brand?.name) ?? brandSlug} ${asString(model?.name) ?? modelSlug}`.trim(),
            variantId: asString(variant?.id) ?? undefined,
            variantSlug: asString(variant?.slug) ?? undefined,
          })
        }
      }
    }
  }

  return refs.slice(0, 3)
}

/**
 * Derive interactive quick replies and CTA buttons from `/api/chat` response fields.
 */
export function extractInteractiveActions(params: {
  buttons?: unknown
  quickReplies?: unknown
  ctaUrl?: unknown
  ctaButton?: unknown
  toolCalls?: ToolCallRecord[]
}): {
  quickReplies: ChatQuickReply[]
  ctaButtons: ChatCtaButton[]
} {
  const quickReplies: ChatQuickReply[] = []
  const ctaButtons: ChatCtaButton[] = []
  const seenUrls = new Set<string>()
  const seenReplies = new Set<string>()

  const rawButtons = Array.isArray(params.buttons)
    ? params.buttons
    : Array.isArray(params.quickReplies)
      ? params.quickReplies
      : []

  for (const item of rawButtons) {
    const rec = asRecord(item)
    const title = asString(rec?.title) ?? asString(rec?.label)
    const id = asString(rec?.id) ?? title
    if (title && id && !seenReplies.has(title)) {
      seenReplies.add(title)
      quickReplies.push({ id, title })
    }
  }

  for (const rawCta of [params.ctaUrl, params.ctaButton]) {
    if (typeof rawCta === 'string' && rawCta.trim()) {
      const normalized = normalizeCarLinkUrl(rawCta.trim())
      if (!seenUrls.has(normalized)) {
        seenUrls.add(normalized)
        ctaButtons.push({
          displayText: 'View Car & Continue on Web ↗',
          url: normalized,
        })
      }
      continue
    }

    const ctaObj = asRecord(rawCta)
    if (ctaObj) {
      const url = asString(ctaObj.url)
      const displayText =
        asString(ctaObj.displayText) ??
        asString(ctaObj.label) ??
        'View Car & Continue on Web ↗'
      if (url) {
        const normalized = normalizeCarLinkUrl(url)
        if (!seenUrls.has(normalized)) {
          seenUrls.add(normalized)
          ctaButtons.push({ displayText, url: normalized })
        }
      }
    }
  }

  const toolCalls = Array.isArray(params.toolCalls) ? params.toolCalls : []
  for (const tc of toolCalls) {
    const res = asRecord(tc.result)
    if (!res) continue

    if (tc.name === 'get_car_link' && res.success === true) {
      const url = asString(res.url)
      if (url) {
        const normalized = normalizeCarLinkUrl(url)
        if (!seenUrls.has(normalized)) {
          seenUrls.add(normalized)
          const inputModel = asString(tc.input?.modelSlug)
          ctaButtons.push({
            displayText: inputModel
              ? `Open ${inputModel.replace(/-/g, ' ')} on Web ↗`
              : 'View Car & Continue on Web ↗',
            url: normalized,
          })
        }
      }
    }

    if (tc.name === 'search_cars' && Array.isArray(res.cars)) {
      const seenModels = new Set<string>()
      for (const item of res.cars) {
        const car = asRecord(item)
        if (!car) continue
        const modelName = asString(car.modelName)
        const brandSlug = asString(car.brandSlug)
        const modelSlug = asString(car.modelSlug)
        if (modelName && !seenModels.has(modelName) && seenModels.size < 2) {
          seenModels.add(modelName)
          const replyTitle = `${modelName} on-road price`
          if (!seenReplies.has(replyTitle)) {
            seenReplies.add(replyTitle)
            quickReplies.push({
              id: `price-${modelSlug ?? modelName}`,
              title: replyTitle,
            })
          }
        }
        if (brandSlug && modelSlug && ctaButtons.length === 0) {
          const url = `/cars/${encodeURIComponent(brandSlug)}/${encodeURIComponent(modelSlug)}`
          if (!seenUrls.has(url)) {
            seenUrls.add(url)
            ctaButtons.push({
              displayText: `View ${modelName ?? modelSlug} Details ↗`,
              url,
            })
          }
        }
      }
    }

    if (tc.name === 'get_onroad_price' && res.found === true && Array.isArray(res.quotes)) {
      const firstQuote = asRecord(res.quotes[0])
      const modelName = asString(firstQuote?.model)
      const suggestions = [
        modelName ? `Calculate EMI for ${modelName}` : 'Calculate EMI',
        'Book test drive',
      ]
      for (const title of suggestions) {
        if (!seenReplies.has(title) && quickReplies.length < 3) {
          seenReplies.add(title)
          quickReplies.push({ id: title.toLowerCase().replace(/\s+/g, '-'), title })
        }
      }
    }
  }

  return {
    quickReplies: quickReplies.slice(0, 3),
    ctaButtons: ctaButtons.slice(0, 2),
  }
}

export interface ChatCarPreview {
  slug: string
  brandSlug: string
  title: string
  subtitle: string
  href: string
}

const KNOWN_SHOWROOM_CARS: Array<{
  slug: string
  brandSlug: string
  title: string
  subtitle: string
  keywords: string[]
}> = [
  {
    slug: 'glanza',
    brandSlug: 'toyota',
    title: 'Toyota Glanza',
    subtitle: 'Hatchback · 5 Seater · Petrol / CNG',
    keywords: ['glanza'],
  },
  {
    slug: 'taisor',
    brandSlug: 'toyota',
    title: 'Toyota Urban Cruiser Taisor',
    subtitle: 'Compact SUV · 5 Seater · Petrol / Turbo',
    keywords: ['taisor'],
  },
  {
    slug: 'urban-cruiser-hyryder',
    brandSlug: 'toyota',
    title: 'Toyota Urban Cruiser Hyryder',
    subtitle: 'Mid-Size SUV · Hybrid / Petrol / CNG',
    keywords: ['hyryder', 'urban cruiser hyryder'],
  },
  {
    slug: 'rumion',
    brandSlug: 'toyota',
    title: 'Toyota Rumion',
    subtitle: 'Family MPV · 7 Seater · Petrol / CNG',
    keywords: ['rumion'],
  },
  {
    slug: 'innova-hycross',
    brandSlug: 'toyota',
    title: 'Toyota Innova Hycross',
    subtitle: 'Premium MPV · 7–8 Seater · Strong Hybrid',
    keywords: ['hycross', 'innova hycross'],
  },
  {
    slug: 'fortuner',
    brandSlug: 'toyota',
    title: 'Toyota Fortuner',
    subtitle: 'Full-Size SUV · 7 Seater · Diesel / 4x4',
    keywords: ['fortuner'],
  },
]

/**
 * Derive rich car preview cards (with `/cars/<slug>.jpg` image & CTA link)
 * from assistant message content, CTA buttons, or tool calls.
 */
export function extractCarPreviews(params: {
  content: string
  ctaButtons?: ChatCtaButton[]
  toolCalls?: ToolCallRecord[]
}): ChatCarPreview[] {
  const bySlug = new Map<string, ChatCarPreview>()

  // 1. Prefer explicit CTA URLs (may carry ?token= for WhatsApp -> Web continuity)
  for (const cta of params.ctaButtons ?? []) {
    try {
      const parsed = new URL(cta.url, 'http://localhost')
      const segments = parsed.pathname.split('/').filter(Boolean)
      if (segments[0] === 'cars' && segments.length >= 3) {
        const brandSlug = decodeURIComponent(segments[1])
        const modelSlug = decodeURIComponent(segments[2])
        const known = KNOWN_SHOWROOM_CARS.find((c) => c.slug === modelSlug)
        if (!bySlug.has(modelSlug)) {
          bySlug.set(modelSlug, {
            slug: modelSlug,
            brandSlug,
            title: known?.title ?? modelSlug.replace(/-/g, ' '),
            subtitle: known?.subtitle ?? 'Chennai Showroom · Exact On-Road',
            href: cta.url,
          })
        }
      }
    } catch {
      // Ignore malformed CTA URL
    }
  }

  // 2. Check structured tool call references
  for (const ref of extractCarRefsFromToolCalls(params.toolCalls)) {
    if (!bySlug.has(ref.modelSlug)) {
      const known = KNOWN_SHOWROOM_CARS.find((c) => c.slug === ref.modelSlug)
      bySlug.set(ref.modelSlug, {
        slug: ref.modelSlug,
        brandSlug: ref.brandSlug,
        title: known?.title ?? ref.label,
        subtitle: known?.subtitle ?? 'Chennai Showroom · Exact On-Road',
        href: `/cars/${encodeURIComponent(ref.brandSlug)}/${encodeURIComponent(ref.modelSlug)}`,
      })
    }
  }

  // 3. Fallback: match showroom car names mentioned in the assistant reply
  const lower = params.content.toLowerCase()
  for (const car of KNOWN_SHOWROOM_CARS) {
    if (bySlug.has(car.slug)) continue
    if (car.keywords.some((kw) => lower.includes(kw))) {
      bySlug.set(car.slug, {
        slug: car.slug,
        brandSlug: car.brandSlug,
        title: car.title,
        subtitle: car.subtitle,
        href: `/cars/${encodeURIComponent(car.brandSlug)}/${encodeURIComponent(car.slug)}`,
      })
    }
  }

  return Array.from(bySlug.values()).slice(0, 3)
}
