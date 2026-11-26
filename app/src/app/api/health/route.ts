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
    const configured = env.GEMINI_MODEL || 'gemini-flash-lite-latest'
    const primary = configured === 'gemini-flash-latest' ? 'gemini-flash-lite-latest' : configured
    const modelsToTry = Array.from(
      new Set([primary, 'gemini-2.5-flash-lite', 'gemini-flash-latest'])
    )
    for (const m of modelsToTry) {
      const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`
      try {
        const r = await fetch(testUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Say OK' }] }],
            generationConfig: {
              maxOutputTokens: 16,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
          signal: AbortSignal.timeout(10000),
        })
        const txt = await r.text()
        llmTest = { ok: r.ok, status: r.status, model: m, endpoint: testUrl, sample: txt.slice(0, 220) }
        if (r.ok) break
      } catch (e) {
        llmTest = { ok: false, model: m, error: e instanceof Error ? e.message : String(e) }
      }
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
