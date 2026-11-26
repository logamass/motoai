/**
 * Database seed script.
 *
 * Usage: pnpm db:seed
 *
 * Loads initial data (brands, models from extracted PDFs, etc.)
 * Each module can register a seed function.
 */

import { getDb, closeDb, type DB } from './index.js'

const seedFunctions: Array<{ name: string; fn: (db: DB) => Promise<void> }> = []

/** Modules call this to register their seed data */
export function registerSeed(name: string, fn: (db: DB) => Promise<void>) {
  seedFunctions.push({ name, fn })
}

async function runSeeds() {
  console.log('🌱 Seeding database...')
  const db = getDb()

  try {
    if (!seedFunctions.some((entry) => entry.name === 'ingestion')) {
      const seedDemoUrl = new URL(
        '../../../../modules/ingestion/src/seed-demo.ts',
        import.meta.url
      ).href
      const { seedDemoData } = (await import(
        /* webpackIgnore: true */ seedDemoUrl
      )) as {
        seedDemoData: (db: DB) => Promise<{
          dealerId: string
          modelsCount: number
          variantsCount: number
          priceRowsCount: number
        }>
      }

      registerSeed('ingestion', async (database) => {
        const result = await seedDemoData(database)
        console.log(
          `    Seeded dealer=${result.dealerId}, models=${result.modelsCount}, variants=${result.variantsCount}, priceRows=${result.priceRowsCount}`
        )
      })
    }

    for (const { name, fn } of seedFunctions) {
      console.log(`  Seeding: ${name}`)
      await fn(db)
    }

    console.log('✅ Seeding complete')
  } finally {
    await closeDb()
  }
}

// Only run if executed directly
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  runSeeds().catch((err) => {
    console.error('❌ Seeding failed:', err)
    process.exitCode = 1
  })
}
