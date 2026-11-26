import { bootModuleList } from '@motoai/core/boot'
import catalogModule from '@motoai/mod-catalog'
import pricingModule from '@motoai/mod-pricing'
import ingestionModule from '@motoai/mod-ingestion'
import customersModule from '@motoai/mod-customers'
import leadsModule from '@motoai/mod-leads'
import handoffModule from '@motoai/mod-handoff'
import analyticsModule from '@motoai/mod-analytics'

const globalForBoot = globalThis as typeof globalThis & {
  __motoaiBooted?: boolean
  __motoaiBootPromise?: Promise<void>
}

/**
 * Idempotently boots all MotoAI business modules once per process.
 */
export async function ensureBooted(): Promise<void> {
  if (globalForBoot.__motoaiBooted) {
    return
  }

  if (!globalForBoot.__motoaiBootPromise) {
    globalForBoot.__motoaiBootPromise = Promise.resolve()
      .then(() => {
        bootModuleList([
          catalogModule,
          pricingModule,
          ingestionModule,
          customersModule,
          leadsModule,
          handoffModule,
          analyticsModule,
        ])
        globalForBoot.__motoaiBooted = true
      })
      .catch((err) => {
        globalForBoot.__motoaiBootPromise = undefined
        throw err
      })
  }

  await globalForBoot.__motoaiBootPromise
}
