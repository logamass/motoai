/**
 * Auth helpers — Auth.js / Google OAuth config and lightweight HMAC-SHA256 session tokens.
 *
 * Usage:
 *   import { authConfig, signSessionToken, verifySessionToken } from '@motoai/core/auth'
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../config/index.js'

export interface SessionPayload {
  sub: string
  email?: string
  name?: string
  role?: string
  iat: number
  exp: number
}

export type SessionInput = Omit<SessionPayload, 'iat' | 'exp'> &
  Partial<Pick<SessionPayload, 'iat' | 'exp'>>

/**
 * Auth.js / Google OAuth configuration sourced from validated environment variables.
 */
export const authConfig = {
  secret: env.NEXTAUTH_SECRET,
  sessionCookieName: 'motoai_session',
  sessionMaxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
  providers: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
      enabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    },
  },
} as const

/**
 * Sign a session payload into an HMAC-SHA256 cookie token (`<base64url>.<sig>`).
 */
export function signSessionToken(
  payload: SessionInput,
  ttlSeconds: number = authConfig.sessionMaxAgeSeconds
): string {
  const now = Math.floor(Date.now() / 1000)
  const fullPayload: SessionPayload = {
    ...payload,
    iat: payload.iat ?? now,
    exp: payload.exp ?? now + ttlSeconds,
  }

  const body = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url')
  const signature = createHmac('sha256', authConfig.secret)
    .update(body)
    .digest('base64url')

  return `${body}.${signature}`
}

/**
 * Verify an HMAC-SHA256 session token and return the decoded payload, or null if invalid/expired.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') {
    return null
  }

  const dotIndex = token.indexOf('.')
  if (dotIndex <= 0 || dotIndex === token.length - 1) {
    return null
  }

  const body = token.slice(0, dotIndex)
  const providedSig = token.slice(dotIndex + 1)

  const expectedSig = createHmac('sha256', authConfig.secret)
    .update(body)
    .digest('base64url')

  const providedBuf = Buffer.from(providedSig, 'utf8')
  const expectedBuf = Buffer.from(expectedSig, 'utf8')

  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return null
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as SessionPayload).sub !== 'string' ||
      typeof (parsed as SessionPayload).exp !== 'number'
    ) {
      return null
    }

    const session = parsed as SessionPayload
    if (session.exp <= Math.floor(Date.now() / 1000)) {
      return null
    }

    return session
  } catch {
    return null
  }
}
