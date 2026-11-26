/**
 * Database client — Drizzle ORM + PostgreSQL + pgvector.
 *
 * Usage:
 *   import { db } from '@motoai/core/db'
 *   const rows = await db.select().from(someTable)
 *
 * Connection is lazy — created on first use.
 * Uses DATABASE_URL from env.
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '../config/index.js'

let _client: ReturnType<typeof postgres> | null = null
let _db: ReturnType<typeof drizzle> | null = null

function getClient() {
  if (!_client) {
    _client = postgres(env.DATABASE_URL, {
      max: 20,
      idle_timeout: 20,
      connect_timeout: 10,
    })
  }
  return _client
}

export function getDb() {
  if (!_db) {
    _db = drizzle(getClient())
  }
  return _db
}

/** Lazy singleton — call db.select()... directly */
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_, prop) {
    return (getDb() as any)[prop]
  },
})

export type DB = ReturnType<typeof drizzle>

/**
 * Close the connection pool. Call on graceful shutdown.
 */
export async function closeDb() {
  if (_client) {
    await _client.end()
    _client = null
    _db = null
  }
}
