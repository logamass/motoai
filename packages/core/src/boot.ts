/**
 * Module boot loader.
 *
 * Discovers all modules in modules/<name>/index.ts,
 * checks feature flags, validates dependencies,
 * and registers them.
 *
 * Usage (called once at app startup):
 *   import { bootModules } from '@motoai/core/boot'
 *   await bootModules()
 */

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { isEnabled, type FlagName } from './config/flags.js'
import { registerModule, type ModuleDefinition, getModule } from './module-system.js'
import { emitter } from './events/index.js'
import { registerHandler } from './queue/index.js'
import { registerSeed } from './db/seed.js'

/**
 * Register a pre-imported list of module definitions.
 *
 * Safe for bundled/Next.js environments where dynamic filesystem imports
 * cannot be used. Idempotent — already-registered modules are skipped.
 */
export function bootModuleList(defs: ModuleDefinition[]): void {
  const sorted = topoSort(defs)
  let loaded = 0

  for (const def of sorted) {
    // Idempotent: skip already-registered modules cleanly
    if (getModule(def.name)) {
      continue
    }

    // Check feature flag
    if (def.featureFlag && !isEnabled(def.featureFlag as FlagName)) {
      console.log(`  ⏭️  Module skipped (flag OFF): ${def.name}`)
      continue
    }

    // Check dependencies
    if (def.dependsOn) {
      const missing = def.dependsOn.filter((d) => !getModule(d))
      if (missing.length > 0) {
        console.error(`  ❌ Module "${def.name}" missing deps: ${missing.join(', ')}`)
        continue
      }
    }

    // Register the module
    registerModule(def)
    loaded++

    // Wire up event listeners
    if (def.events) {
      for (const [event, handler] of Object.entries(def.events)) {
        emitter.on(event as any, handler as any)
      }
    }

    // Wire up queue workers
    if (def.workers) {
      for (const [jobName, handler] of Object.entries(def.workers)) {
        registerHandler(jobName, handler)
      }
    }

    // Register seed function
    if (def.seed) {
      registerSeed(def.name, def.seed)
    }
  }

  console.log(`✅ ${loaded} module(s) loaded`)
}

/**
 * Discover and register all modules from the filesystem.
 *
 * @param modulesDir - Absolute path to the modules/ directory
 */
export async function bootModules(modulesDir: string): Promise<void> {
  console.log('🔍 Discovering modules...')

  let entries: string[]
  try {
    entries = await readdir(modulesDir)
  } catch {
    console.log('  No modules/ directory found, skipping')
    return
  }

  // Load all module definitions
  const defs: ModuleDefinition[] = []
  for (const entry of entries) {
    const indexPath = join(modulesDir, entry, 'index.ts')
    // Also check compiled .js for production
    const indexPathJs = join(modulesDir, entry, 'index.js')

    try {
      const mod = await import(/* webpackIgnore: true */ indexPath).catch(
        () => import(/* webpackIgnore: true */ indexPathJs)
      )
      const def: ModuleDefinition = mod.default ?? mod
      if (def?.name) {
        defs.push(def)
      }
    } catch {
      // Not a valid module directory, skip silently
    }
  }

  bootModuleList(defs)
}

/** Simple topological sort by dependsOn */
function topoSort(defs: ModuleDefinition[]): ModuleDefinition[] {
  const byName = new Map(defs.map((d) => [d.name, d]))
  const visited = new Set<string>()
  const result: ModuleDefinition[] = []

  function visit(name: string) {
    if (visited.has(name)) return
    visited.add(name)
    const def = byName.get(name)
    if (!def) return
    for (const dep of def.dependsOn ?? []) {
      visit(dep)
    }
    result.push(def)
  }

  for (const def of defs) {
    visit(def.name)
  }
  return result
}
