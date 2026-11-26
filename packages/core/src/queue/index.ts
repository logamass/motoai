/**
 * Queue — pg-boss wrapper for background jobs.
 *
 * Uses PostgreSQL as the job queue (no Redis needed).
 * Each module registers its own job handlers.
 *
 * Usage:
 *   import { queue } from '@motoai/core/queue'
 *
 *   // Register handler (in module init):
 *   queue.registerHandler('pdf-extract', async (job) => { ... })
 *
 *   // Enqueue job (from route/tool):
 *   await queue.enqueue('pdf-extract', { pdfUrl: '...', dealerId: '...' })
 */

import PgBoss from 'pg-boss'
import { env } from '../config/index.js'

let _boss: PgBoss | null = null

type JobHandler<T = any> = (job: PgBoss.Job<T>) => Promise<void>

const handlers = new Map<string, JobHandler>()

/**
 * Get or create the pg-boss instance.
 */
async function getBoss(): Promise<PgBoss> {
  if (!_boss) {
    _boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      expireInHours: 24,
      archiveCompletedAfterSeconds: 86400, // 1 day
      deleteAfterDays: 7,
    })

    _boss.on('error', (err) => console.error('[queue] pg-boss error:', err))
  }
  return _boss
}

/**
 * Start the queue — call once at app startup.
 * Registers all handlers that modules added via registerHandler().
 */
export async function startQueue(): Promise<void> {
  const boss = await getBoss()
  await boss.start()
  console.log('✅ Queue started (pg-boss)')

  // Register all handlers that were added before start
  for (const [name, handler] of handlers) {
    await boss.work(name, async (jobs) => {
      for (const job of jobs) {
        await handler(job)
      }
    })
    console.log(`  📋 Queue handler: ${name}`)
  }
}

/**
 * Stop the queue — call on graceful shutdown.
 */
export async function stopQueue(): Promise<void> {
  if (_boss) {
    await _boss.stop()
    _boss = null
  }
}

/**
 * Register a job handler. Call during module initialization (before startQueue).
 */
export function registerHandler<T = any>(jobName: string, handler: JobHandler<T>): void {
  handlers.set(jobName, handler as JobHandler)
}

/**
 * Enqueue a job for background processing.
 */
export async function enqueue<T = any>(
  jobName: string,
  data: T,
  options?: PgBoss.SendOptions
): Promise<string | null> {
  const boss = await getBoss()
  return options
    ? boss.send(jobName, data as object, options)
    : boss.send(jobName, data as object)
}

/**
 * Schedule a recurring job (cron-like).
 */
export async function schedule(
  jobName: string,
  cron: string,
  data?: object,
  options?: PgBoss.ScheduleOptions
): Promise<void> {
  const boss = await getBoss()
  await boss.schedule(jobName, cron, data, options)
}

export const queue = {
  start: startQueue,
  stop: stopQueue,
  registerHandler,
  enqueue,
  schedule,
}
