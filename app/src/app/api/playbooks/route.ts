import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SAFE_SEGMENT_RE = /^[a-zA-Z0-9-]+$/

interface PlaybookRecord {
  id: string
  module: string
  name: string
  content: string
}

interface UpdatePlaybookBody {
  module?: unknown
  name?: unknown
  content?: unknown
}

async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    const info = await stat(dirPath)
    return info.isDirectory()
  } catch {
    return false
  }
}

async function resolveModulesDir(): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), '..', 'modules'),
    path.resolve(process.cwd(), 'modules'),
  ]

  for (const candidate of candidates) {
    if (await isDirectory(candidate)) {
      return candidate
    }
  }

  return candidates[0]
}

function isSafeSegment(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 100 &&
    SAFE_SEGMENT_RE.test(value)
  )
}

function isInsideDir(parentDir: string, targetPath: string): boolean {
  const resolvedParent = path.resolve(parentDir)
  const resolvedTarget = path.resolve(targetPath)
  return resolvedTarget.startsWith(`${resolvedParent}${path.sep}`)
}

/**
 * List all markdown playbooks discovered under `modules/<module>/playbooks/<name>.md`.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const modulesDir = await resolveModulesDir()
    if (!(await isDirectory(modulesDir))) {
      return NextResponse.json({ playbooks: [] satisfies PlaybookRecord[] })
    }

    const moduleEntries = await readdir(modulesDir, { withFileTypes: true })
    const moduleNames = moduleEntries
      .filter((entry) => entry.isDirectory() && isSafeSegment(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))

    const playbooks: PlaybookRecord[] = []

    for (const moduleName of moduleNames) {
      const playbooksDir = path.join(modulesDir, moduleName, 'playbooks')
      if (!(await isDirectory(playbooksDir))) {
        continue
      }

      const files = await readdir(playbooksDir, { withFileTypes: true })
      const mdFiles = files
        .filter((file) => file.isFile() && file.name.endsWith('.md'))
        .map((file) => file.name)
        .sort((a, b) => a.localeCompare(b))

      for (const fileName of mdFiles) {
        const name = fileName.slice(0, -3)
        if (!isSafeSegment(name)) {
          continue
        }

        const filePath = path.join(playbooksDir, fileName)
        if (!isInsideDir(playbooksDir, filePath)) {
          continue
        }

        const content = await readFile(filePath, 'utf-8')
        playbooks.push({
          id: `${moduleName}/${name}`,
          module: moduleName,
          name,
          content,
        })
      }
    }

    return NextResponse.json({ playbooks })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load playbooks'
    console.error('[/api/playbooks GET] Error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Update a markdown playbook under `modules/<module>/playbooks/<name>.md`.
 */
export async function PUT(req: Request): Promise<NextResponse> {
  let body: UpdatePlaybookBody
  try {
    body = (await req.json()) as UpdatePlaybookBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 })
  }

  if (!isSafeSegment(body.module)) {
    return NextResponse.json(
      { error: 'Invalid module name (only alphanumeric and hyphens allowed)' },
      { status: 400 }
    )
  }

  if (!isSafeSegment(body.name)) {
    return NextResponse.json(
      { error: 'Invalid playbook name (only alphanumeric and hyphens allowed)' },
      { status: 400 }
    )
  }

  if (typeof body.content !== 'string') {
    return NextResponse.json(
      { error: 'Field "content" must be a string' },
      { status: 400 }
    )
  }

  try {
    const modulesDir = await resolveModulesDir()
    const moduleDir = path.join(modulesDir, body.module)

    if (!isInsideDir(modulesDir, moduleDir) || !(await isDirectory(moduleDir))) {
      return NextResponse.json(
        { error: `Module "${body.module}" does not exist` },
        { status: 404 }
      )
    }

    const playbooksDir = path.join(moduleDir, 'playbooks')
    if (!isInsideDir(moduleDir, playbooksDir)) {
      return NextResponse.json({ error: 'Invalid playbooks directory' }, { status: 400 })
    }

    await mkdir(playbooksDir, { recursive: true })

    const targetPath = path.join(playbooksDir, `${body.name}.md`)
    if (!isInsideDir(playbooksDir, targetPath)) {
      return NextResponse.json({ error: 'Invalid playbook target path' }, { status: 400 })
    }

    await writeFile(targetPath, body.content, 'utf-8')
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save playbook'
    console.error('[/api/playbooks PUT] Error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
