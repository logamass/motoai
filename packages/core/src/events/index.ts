/**
 * Typed event bus — pub/sub between modules.
 *
 * Modules emit events. Other modules listen.
 * No direct imports between modules — loose coupling.
 *
 * Usage:
 *   // Emit (from ingestion module):
 *   emitter.emit('ingestion:published', { priceListId: '123', dealerId: 'abc' })
 *
 *   // Listen (from analytics module):
 *   emitter.on('ingestion:published', async (data) => { ... })
 */

import { EventEmitter } from 'node:events'

/**
 * Event type registry.
 * When a module adds a new event, it extends this interface via declaration merging.
 *
 * Example in modules/ingestion/events.ts:
 *   declare module '@motoai/core/events' {
 *     interface AppEvents {
 *       'ingestion:published': { priceListId: string; dealerId: string }
 *       'ingestion:failed': { jobId: string; error: string }
 *     }
 *   }
 */
export interface AppEvents {
  // Base events (core)
  'app:started': { timestamp: Date }
  'app:shutdown': { reason: string }
}

class TypedEmitter {
  private ee = new EventEmitter()

  constructor() {
    this.ee.setMaxListeners(50)
  }

  on<K extends keyof AppEvents>(event: K, handler: (data: AppEvents[K]) => void | Promise<void>): void {
    this.ee.on(event as string, handler as any)
  }

  once<K extends keyof AppEvents>(event: K, handler: (data: AppEvents[K]) => void | Promise<void>): void {
    this.ee.once(event as string, handler as any)
  }

  emit<K extends keyof AppEvents>(event: K, data: AppEvents[K]): void {
    this.ee.emit(event as string, data)
  }

  off<K extends keyof AppEvents>(event: K, handler: (data: AppEvents[K]) => void | Promise<void>): void {
    this.ee.off(event as string, handler as any)
  }
}

/** Singleton event bus — shared across all modules */
export const emitter = new TypedEmitter()
