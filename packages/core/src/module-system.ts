/**
 * Module system — auto-discovery and registration.
 *
 * Each business module in modules/ exports a ModuleDefinition.
 * At app boot, all modules are discovered and registered.
 *
 * Adding a module:
 *   1. Create modules/[name]/index.ts
 *   2. Export: defineModule({ name, schema, routes, tools, ... })
 *   3. Done. No changes to core code.
 */

import type { DB } from './db/index.js'

/** Tool definition for the AI agent */
export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, any>
  handler: (params: any, ctx: { db: DB }) => Promise<any>
}

/** Route definition for API endpoints */
export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  handler: (req: Request) => Promise<Response>
}

/** Event listener definition */
export interface EventListenerDef {
  [eventName: string]: (data: any) => void | Promise<void>
}

/** What every module exports */
export interface ModuleDefinition {
  /** Unique module name (e.g. 'catalog', 'pricing', 'ingestion') */
  name: string

  /** Drizzle table definitions — auto-discovered for migrations */
  schema?: Record<string, any>

  /** API routes — auto-registered under /api/modules/[name]/* */
  routes?: RouteDefinition[]

  /** Agent tools — auto-available to the AI */
  tools?: ToolDefinition[]

  /** Path to playbooks directory (relative to module) */
  playbooks?: string

  /** Event listeners — keyed by event name */
  events?: EventListenerDef

  /** Queue job handlers — keyed by job name */
  workers?: Record<string, (job: any) => Promise<void>>

  /** Seed function for initial data */
  seed?: (db: DB) => Promise<void>

  /** Feature flag name — if set, module only loads when flag is enabled */
  featureFlag?: string

  /** Dependencies — other module names this module requires */
  dependsOn?: string[]
}

/**
 * Define a module. This is the only function a module needs to call.
 *
 * @example
 * // modules/catalog/index.ts
 * export default defineModule({
 *   name: 'catalog',
 *   schema: { brands, models, variants },
 *   tools: [searchCars, getVariantDetails],
 *   playbooks: './playbooks',
 * })
 */
export function defineModule(def: ModuleDefinition): ModuleDefinition {
  return def
}

// ---- Module Registry (populated at boot) ----

const registry = new Map<string, ModuleDefinition>()

/** Register a module (called by the boot loader) */
export function registerModule(mod: ModuleDefinition): void {
  if (registry.has(mod.name)) {
    throw new Error(`Module "${mod.name}" is already registered`)
  }
  registry.set(mod.name, mod)
  console.log(`  📦 Module registered: ${mod.name}`)
}

/** Get a registered module by name */
export function getModule(name: string): ModuleDefinition | undefined {
  return registry.get(name)
}

/** Get all registered modules */
export function getAllModules(): ModuleDefinition[] {
  return Array.from(registry.values())
}

/** Get all tools from all modules (for the agent) */
export function getAllTools(): ToolDefinition[] {
  return getAllModules().flatMap((m) => m.tools ?? [])
}

/** Get all routes from all modules (for the API) */
export function getAllRoutes(): Array<RouteDefinition & { module: string }> {
  return getAllModules().flatMap((m) =>
    (m.routes ?? []).map((r) => ({ ...r, module: m.name }))
  )
}

/** Get all schemas from all modules (for migrations) */
export function getAllSchemas(): Record<string, any> {
  const all: Record<string, any> = {}
  for (const mod of getAllModules()) {
    if (mod.schema) {
      Object.assign(all, mod.schema)
    }
  }
  return all
}
