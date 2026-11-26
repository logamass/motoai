/**
 * Feature flags — toggle modules and features without code changes.
 *
 * Usage:
 *   import { isEnabled } from '@motoai/core/config'
 *   if (isEnabled('module:analytics')) { ... }
 *
 * Flags are read from env vars (FLAG_*).
 * Deploy with flag OFF → feature invisible in production.
 * Test → turn ON → instant enable, no redeploy needed if using runtime flags.
 */

import { env } from './index.js'

const FLAGS = {
  'module:analytics': env.FLAG_ANALYTICS,
  'module:telegram': env.FLAG_TELEGRAM,
  'feature:voice-notes': env.FLAG_VOICE,
  'feature:emi-banks': env.FLAG_EMI_BANKS,
  'feature:multi-city': env.FLAG_MULTI_CITY,
} as const

export type FlagName = keyof typeof FLAGS

/**
 * Check if a feature/module is enabled.
 */
export function isEnabled(flag: FlagName): boolean {
  return FLAGS[flag] ?? false
}

/**
 * Get all flag states (for admin dashboard display).
 */
export function getAllFlags(): Record<FlagName, boolean> {
  return { ...FLAGS }
}
