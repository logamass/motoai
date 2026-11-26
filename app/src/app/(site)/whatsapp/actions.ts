'use server'

import { createHash } from 'node:crypto'
import { env } from '@motoai/core/config'
import { db } from '@motoai/core/db'
import { brands, models } from '@motoai/mod-catalog/schema'
import { conversations, customers } from '@motoai/mod-customers/schema'
import { signHandoffToken } from '@motoai/mod-handoff'
import { webSessions } from '@motoai/mod-handoff/schema'
import { ensureBooted } from '@/lib/bootstrap'
import type { ChatCtaButton } from '@/components/chat-widget/chat-helpers'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export interface EnsureWhatsAppCtaInput {
  conversationId: string
  customerId?: string | null
  userMessage: string
  assistantReply: string
}

export interface EnsureWhatsAppCtaResult {
  customerId: string | null
  conversationId: string
  ctaButtons: ChatCtaButton[]
}

/**
 * Resolves the persisted `customerId` for a WhatsApp simulator conversation and,
 * if the agent reply mentioned a showroom model without already emitting a
 * `ctaUrl`, mints a signed 7-day handoff link in `web_sessions`.
 */
export async function ensureWhatsAppHandoffCta(
  input: EnsureWhatsAppCtaInput
): Promise<EnsureWhatsAppCtaResult> {
  await ensureBooted()

  const convId = UUID_REGEX.test(input.conversationId)
    ? input.conversationId
    : crypto.randomUUID()

  const allConversations = await db.select().from(conversations)
  const existingConv = allConversations.find((c) => c.id === convId)

  let resolvedCustomerId: string | null =
    existingConv?.customerId ??
    (input.customerId && UUID_REGEX.test(input.customerId) ? input.customerId : null)

  if (!resolvedCustomerId) {
    const [createdCustomer] = await db
      .insert(customers)
      .values({
        name: 'WhatsApp Demo Customer',
        city: 'Chennai',
        preferredLang: 'en',
      })
      .returning({ id: customers.id })
    resolvedCustomerId = createdCustomer.id
  }

  if (!existingConv) {
    await db.insert(conversations).values({
      id: convId,
      customerId: resolvedCustomerId,
      stage: 'discovery',
    })
  }

  const [brandList, modelList] = await Promise.all([
    db.select().from(brands),
    db.select().from(models),
  ])

  const brandMap = new Map(brandList.filter((b) => b.active).map((b) => [b.id, b]))
  const combinedText = `${input.userMessage} ${input.assistantReply}`.toLowerCase()

  const matchedModels: Array<{ brandSlug: string; modelSlug: string; label: string }> = []
  for (const m of modelList) {
    if (!m.active) continue
    const brand = brandMap.get(m.brandId)
    if (!brand) continue

    const nameLower = m.name.toLowerCase()
    const slugLower = m.slug.toLowerCase()
    if (combinedText.includes(nameLower) || combinedText.includes(slugLower)) {
      matchedModels.push({
        brandSlug: brand.slug,
        modelSlug: m.slug,
        label: `${brand.name} ${m.name}`,
      })
    }
    if (matchedModels.length >= 2) break
  }

  if (matchedModels.length === 0) {
    return {
      customerId: resolvedCustomerId,
      conversationId: convId,
      ctaButtons: [],
    }
  }

  const secret = process.env.HANDOFF_SECRET || env.NEXTAUTH_SECRET
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
  const expiresAt = new Date(exp * 1000)
  const token = signHandoffToken(
    {
      conversationId: convId,
      customerId: resolvedCustomerId,
      exp,
    },
    secret
  )

  await db
    .insert(webSessions)
    .values({
      customerId: resolvedCustomerId,
      conversationId: convId,
      tokenHash: sha256Hex(token),
      expiresAt,
    })
    .onConflictDoNothing({ target: webSessions.tokenHash })

  const ctaButtons: ChatCtaButton[] = matchedModels.map((ref) => ({
    displayText: `View ${ref.label} On-Road Price ↗`,
    url: `/cars/${encodeURIComponent(ref.brandSlug)}/${encodeURIComponent(ref.modelSlug)}?token=${encodeURIComponent(token)}`,
  }))

  return {
    customerId: resolvedCustomerId,
    conversationId: convId,
    ctaButtons,
  }
}
