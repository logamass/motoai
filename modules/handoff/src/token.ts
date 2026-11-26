import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const DEFAULT_HANDOFF_TTL_SECONDS = 7 * 24 * 60 * 60

export interface HandoffPayload {
  conversationId: string
  customerId: string
  variantId?: string
  exp: number
}

export type VerifyHandoffResult =
  | { valid: true; payload: HandoffPayload }
  | { valid: false; reason: 'malformed' | 'invalid_signature' | 'expired' }

/**
 * Sign a cross-channel handoff token using HMAC-SHA256.
 * Format: base64url(payload) + "." + base64url(hmac_sha256).
 * Defaults to a 7-day expiry (Unix seconds).
 */
export function signHandoffToken(
  payload: {
    conversationId: string
    customerId: string
    variantId?: string
    exp?: number
  },
  secret: string
): string {
  if (!secret) {
    throw new Error('Handoff token secret is required')
  }

  const exp = payload.exp ?? Math.floor(Date.now() / 1000) + DEFAULT_HANDOFF_TTL_SECONDS
  const fullPayload: HandoffPayload = {
    conversationId: payload.conversationId,
    customerId: payload.customerId,
    ...(payload.variantId !== undefined ? { variantId: payload.variantId } : {}),
    exp,
  }

  const encodedPayload = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url')
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url')

  return `${encodedPayload}.${signature}`
}

/**
 * Verify an HMAC-SHA256 handoff token using timing-safe comparison.
 */
export function verifyHandoffToken(token: string, secret: string): VerifyHandoffResult {
  if (typeof token !== 'string' || !secret) {
    return { valid: false, reason: 'malformed' }
  }

  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: 'malformed' }
  }

  const [encodedPayload, providedSig] = parts
  const expectedSig = createHmac('sha256', secret).update(encodedPayload).digest('base64url')

  const providedBuf = Buffer.from(providedSig, 'utf8')
  const expectedBuf = Buffer.from(expectedSig, 'utf8')

  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    return { valid: false, reason: 'invalid_signature' }
  }

  let parsed: unknown
  try {
    const decoded = Buffer.from(encodedPayload, 'base64url').toString('utf8')
    parsed = JSON.parse(decoded)
  } catch {
    return { valid: false, reason: 'malformed' }
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as HandoffPayload).conversationId !== 'string' ||
    typeof (parsed as HandoffPayload).customerId !== 'string' ||
    typeof (parsed as HandoffPayload).exp !== 'number' ||
    !Number.isFinite((parsed as HandoffPayload).exp) ||
    ((parsed as HandoffPayload).variantId !== undefined &&
      typeof (parsed as HandoffPayload).variantId !== 'string')
  ) {
    return { valid: false, reason: 'malformed' }
  }

  const payload = parsed as HandoffPayload
  if (Math.floor(Date.now() / 1000) >= payload.exp) {
    return { valid: false, reason: 'expired' }
  }

  return { valid: true, payload }
}

/**
 * Compute a deterministic SHA-256 hex digest of a handoff token for storage in webSessions.
 */
export function hashHandoffToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/**
 * Build a deep-link car page URL with the signed handoff token attached.
 */
export function buildCarHandoffUrl(
  baseUrl: string,
  params: {
    brandSlug: string
    modelSlug: string
    variantSlug?: string
    token: string
  }
): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '')
  const brand = encodeURIComponent(params.brandSlug)
  const model = encodeURIComponent(params.modelSlug)
  const variant = params.variantSlug ? `/${encodeURIComponent(params.variantSlug)}` : ''

  return `${normalizedBase}/cars/${brand}/${model}${variant}?token=${encodeURIComponent(params.token)}`
}
