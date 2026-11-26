/**
 * Database migration runner.
 *
 * Usage: pnpm db:migrate
 *
 * Reads all migration files from modules/<name>/migrations/ and
 * the core migrations, then applies them in order.
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { env } from '../config/index.js'

async function runMigrations() {
  console.log('🔄 Running database migrations...')

  const cleanUrl = env.DATABASE_URL.replace(/[&?]channel_binding=[^&]*/gi, '').replace(/\?$/, '')
  const client = postgres(cleanUrl, { max: 1 })
  const db = drizzle(client)

  try {
    // Core migrations
    await migrate(db, { migrationsFolder: './drizzle' })
    console.log('✅ Migrations complete')
  } catch (err) {
    console.error('❌ Migration failed:', err)
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigrations()
