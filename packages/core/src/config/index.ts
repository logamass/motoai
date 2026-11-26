/**
 * Environment configuration — Zod-validated.
 *
 * All env vars are validated at startup.
 * If a required var is missing → crash immediately with a clear error.
 *
 * Usage:
 *   import { env } from '@motoai/core/config'
 *   console.log(env.DATABASE_URL)
 */

import { z } from 'zod'

/** Parses string env flags properly ("false" -> false, "true"/"1" -> true). */
const boolFlag = z
  .preprocess((val) => {
    if (typeof val === 'boolean') return val
    if (typeof val === 'string') return val.trim().toLowerCase() === 'true' || val.trim() === '1'
    return false
  }, z.boolean())
  .default(false)

const envSchema = z.object({
  // --- Core ---
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // --- Auth ---
  NEXTAUTH_SECRET: z.string().min(1, 'NEXTAUTH_SECRET is required'),
  NEXTAUTH_URL: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // --- LLM (Phase 3) ---
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),

  // --- WhatsApp (Phase 4) ---
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),

  // --- Storage (Phase 2) ---
  R2_ENDPOINT: z.string().optional(),
  R2_ACCESS_KEY: z.string().optional(),
  R2_SECRET_KEY: z.string().optional(),
  R2_BUCKET: z.string().default('motoai'),

  // --- Feature Flags ---
  FLAG_ANALYTICS: boolFlag,
  FLAG_TELEGRAM: boolFlag,
  FLAG_VOICE: boolFlag,
  FLAG_EMI_BANKS: boolFlag,
  FLAG_MULTI_CITY: boolFlag,
})

export type Env = z.infer<typeof envSchema>

function validateEnv(): Env {
  const isBuildOrDev =
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PHASE === 'phase-production-build'

  const rawEnv: Record<string, string | undefined> = { ...process.env }

  // Allow Next.js build phase and local dev to succeed without live prod secrets
  if (isBuildOrDev) {
    if (!rawEnv.DATABASE_URL) {
      rawEnv.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/motoai_dev'
    }
    if (!rawEnv.NEXTAUTH_SECRET) {
      rawEnv.NEXTAUTH_SECRET = 'dev-secret-change-in-production'
    }
  }

  const result = envSchema.safeParse(rawEnv)
  if (!result.success) {
    console.error('❌ Invalid environment variables:')
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`)
    }
    throw new Error('Environment validation failed')
  }
  return result.data
}

export const env = validateEnv()

export { envSchema }
