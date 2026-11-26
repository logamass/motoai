import { NextResponse } from 'next/server'
import { env, getAllFlags, getAllModules, getAllTools } from '@motoai/core'
import { ensureBooted } from '@/lib/bootstrap'

export const dynamic = 'force-dynamic'

/**
 * Health check endpoint used by Docker and CI/CD pipelines.
 */
export async function GET(): Promise<NextResponse> {
  await ensureBooted()

  const llmProvider = env.ANTHROPIC_API_KEY?.trim()
    ? 'claude'
    : env.GEMINI_API_KEY?.trim()
      ? `gemini (${env.GEMINI_MODEL})`
      : 'fallback-db'

  return NextResponse.json({
    status: 'ok',
    service: 'motoai',
    llmProvider,
    modules: getAllModules().map((m) => m.name),
    toolsCount: getAllTools().length,
    flags: getAllFlags(),
    timestamp: new Date().toISOString(),
  })
}
