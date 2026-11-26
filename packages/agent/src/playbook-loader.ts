/**
 * Playbook loader — loads conversation skill documents.
 *
 * Playbooks are markdown files in modules/<name>/playbooks/<file>.md
 * They guide the agent's conversation flow.
 *
 * The system prompt includes only the playbook INDEX (names + descriptions).
 * When the agent needs a specific playbook, it calls load_playbook(name).
 * This keeps the system prompt small → better prompt caching.
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { getAllModules } from '@motoai/core'

interface Playbook {
  name: string
  module: string
  content: string
  path: string
}

const cache = new Map<string, Playbook>()

/**
 * Discover all playbooks from all modules.
 * Call once at boot to populate the cache.
 */
export async function discoverPlaybooks(modulesDir: string): Promise<void> {
  cache.clear()

  for (const mod of getAllModules()) {
    if (!mod.playbooks) continue
    const playbookDir = join(modulesDir, mod.name, mod.playbooks)

    try {
      const files = await readdir(playbookDir)
      for (const file of files) {
        if (!file.endsWith('.md')) continue
        const name = basename(file, '.md')
        const content = await readFile(join(playbookDir, file), 'utf-8')
        cache.set(name, { name, module: mod.name, content, path: join(playbookDir, file) })
      }
    } catch {
      // Playbook dir doesn't exist yet, skip
    }
  }

  console.log(`  📖 ${cache.size} playbook(s) discovered`)
}

/**
 * Load a specific playbook by name.
 * Used as an agent tool: load_playbook("discovery")
 */
export async function loadPlaybook(name: string): Promise<string | null> {
  const pb = cache.get(name)
  return pb?.content ?? null
}

/**
 * List all available playbooks (names + first line as description).
 * This goes into the system prompt index.
 */
export function listPlaybooks(): Array<{ name: string; module: string; summary: string }> {
  return Array.from(cache.values()).map((pb) => ({
    name: pb.name,
    module: pb.module,
    summary: pb.content.split('\n').find((l) => l.trim())?.slice(0, 100) || '',
  }))
}
