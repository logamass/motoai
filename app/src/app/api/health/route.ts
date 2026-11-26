import { NextResponse } from 'next/server'
import { env, getAllFlags, getAllModules, getAllTools } from '@motoai/core'
import { ensureBooted } from '@/lib/bootstrap'

export const dynamic = 'force-dynamic'

/**
 * Health check endpoint used by Docker and CI/CD pipelines.
 */
export async function GET(req: Request): Promise<NextResponse> {
  await ensureBooted()

  const llmProvider = env.ANTHROPIC_API_KEY?.trim()
    ? 'claude'
    : env.GEMINI_API_KEY?.trim()
      ? `gemini (${env.GEMINI_MODEL})`
      : 'fallback-db'

  const url = new URL(req.url)
  let llmTest: Record<string, unknown> | undefined
  if (url.searchParams.get('testLlm') === '1' && env.GEMINI_API_KEY?.trim()) {
    const key = env.GEMINI_API_KEY.trim()
    const model = env.GEMINI_MODEL || 'gemini-2.5-flash'
    const testUrl = key.startsWith('AQ.')
      ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
      : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
    try {
      const r = await fetch(testUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Say OK' }] }],
        }),
        signal: AbortSignal.timeout(10000),
      })
      const txt = await r.text()
      llmTest = { ok: r.ok, status: r.status, endpoint: testUrl.split('?')[0], sample: txt.slice(0, 220) }
    } catch (e) {
      llmTest = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  return NextResponse.json({
    status: 'ok',
    service: 'motoai',
    llmProvider,
    ...(llmTest ? { llmTest } : {}),
    modules: getAllModules().map((m) => m.name),
    toolsCount: getAllTools().length,
    flags: getAllFlags(),
    timestamp: new Date().toISOString(),
  })
}
