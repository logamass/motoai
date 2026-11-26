import { defineTool } from '@motoai/agent/tools'
import { env } from '@motoai/core/config'
import { webSessions } from './schema.js'
import {
  buildCarHandoffUrl,
  DEFAULT_HANDOFF_TTL_SECONDS,
  hashHandoffToken,
  signHandoffToken,
} from './token.js'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface GetCarLinkInput {
  conversationId: string
  customerId: string
  brandSlug: string
  modelSlug: string
  variantSlug?: string
  variantId?: string
}

/**
 * Tool: get_car_link
 * Signs a 7-day handoff token and returns a personalized web URL for WhatsApp -> Website continuity.
 */
export const getCarLink = defineTool<GetCarLinkInput>({
  name: 'get_car_link',
  description:
    'Generate a personalized 7-day handoff link to a car page on the website so the customer can continue seamlessly from WhatsApp to Web.',
  parameters: {
    conversationId: {
      type: 'string',
      description: 'Conversation UUID',
      required: true,
    },
    customerId: {
      type: 'string',
      description: 'Customer UUID',
      required: true,
    },
    brandSlug: {
      type: 'string',
      description: 'Car brand URL slug (e.g. hyundai)',
      required: true,
    },
    modelSlug: {
      type: 'string',
      description: 'Car model URL slug (e.g. creta)',
      required: true,
    },
    variantSlug: {
      type: 'string',
      description: 'Optional car variant URL slug',
    },
    variantId: {
      type: 'string',
      description: 'Optional car variant UUID to pre-focus on the website',
    },
  },
  handler: async (params: GetCarLinkInput, { db }) => {
    if (!params.conversationId || !UUID_REGEX.test(params.conversationId)) {
      return { success: false, error: 'Valid conversationId UUID is required' }
    }
    if (!params.customerId || !UUID_REGEX.test(params.customerId)) {
      return { success: false, error: 'Valid customerId UUID is required' }
    }
    if (!params.brandSlug || !params.modelSlug) {
      return { success: false, error: 'brandSlug and modelSlug are required' }
    }

    const secret = process.env.HANDOFF_SECRET || env.NEXTAUTH_SECRET
    const baseUrl = process.env.WEB_APP_URL || env.NEXTAUTH_URL || 'http://localhost:3000'
    const exp = Math.floor(Date.now() / 1000) + DEFAULT_HANDOFF_TTL_SECONDS

    const token = signHandoffToken(
      {
        conversationId: params.conversationId,
        customerId: params.customerId,
        ...(params.variantId ? { variantId: params.variantId } : {}),
        exp,
      },
      secret
    )

    const expiresAt = new Date(exp * 1000)

    await db
      .insert(webSessions)
      .values({
        customerId: params.customerId,
        conversationId: params.conversationId,
        tokenHash: hashHandoffToken(token),
        expiresAt,
      })
      .onConflictDoNothing({ target: webSessions.tokenHash })

    const url = buildCarHandoffUrl(baseUrl, {
      brandSlug: params.brandSlug,
      modelSlug: params.modelSlug,
      variantSlug: params.variantSlug,
      token,
    })

    return {
      success: true,
      url,
      token,
      expiresAt: expiresAt.toISOString(),
    }
  },
})
