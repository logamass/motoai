/**
 * Google Gemini API (AI Studio) tool-use agent loop.
 *
 * Uses native fetch against the Gemini REST API (zero extra dependencies)
 * with full Function Calling over our registered Postgres tools.
 */

import { env } from '@motoai/core/config'
import type { ToolDefinition } from '@motoai/core'
import { getDb } from '@motoai/core/db'
import { checkGuardrails } from './guardrails.js'
import type { AgentContext, AgentResult, ToolCallRecord } from './loop.js'

const MAX_TOOL_ROUNDS = 6

function toGeminiType(type?: string): string {
  switch ((type ?? 'string').toLowerCase()) {
    case 'number':
      return 'NUMBER'
    case 'integer':
      return 'INTEGER'
    case 'boolean':
      return 'BOOLEAN'
    case 'array':
      return 'ARRAY'
    case 'object':
      return 'OBJECT'
    default:
      return 'STRING'
  }
}

function toGeminiFunctionDeclarations(tools: ToolDefinition[]): Array<Record<string, unknown>> {
  return tools.map((t) => {
    const properties: Record<string, Record<string, unknown>> = {}
    const required: string[] = []

    for (const [key, spec] of Object.entries(t.parameters ?? {})) {
      const s = spec as Record<string, unknown>
      const prop: Record<string, unknown> = {
        type: toGeminiType(typeof s.type === 'string' ? s.type : 'string'),
      }
      if (typeof s.description === 'string') prop.description = s.description
      if (Array.isArray(s.enum)) prop.enum = s.enum
      if (prop.type === 'ARRAY') {
        prop.items = { type: 'STRING' }
      }
      properties[key] = prop
      if (s.required === true) required.push(key)
    }

    return {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'OBJECT',
        properties,
        ...(required.length > 0 ? { required } : {}),
      },
    }
  })
}

export async function runGeminiAgent(
  userMessage: string,
  ctx: AgentContext,
  tools: ToolDefinition[],
  systemPrompt: string,
  language: string
): Promise<AgentResult> {
  const apiKey = env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured')
  }

  const model = env.GEMINI_MODEL || 'gemini-2.5-flash'
  const candidateEndpoints = apiKey.startsWith('AQ.')
    ? [
        `https://aiplatform.googleapis.com/v1/publishers/google/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        `https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      ]
    : [
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      ]

  let activeEndpoint = candidateEndpoints[0]

  const db = getDb()
  const functionDeclarations = toGeminiFunctionDeclarations(tools)

  const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = ctx.history
    .slice(-10)
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
  contents.push({ role: 'user', parts: [{ text: userMessage }] })

  const allToolCalls: ToolCallRecord[] = []
  let ctaUrl: { label: string; url: string } | undefined

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const payload = JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      tools: [{ functionDeclarations }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1024,
      },
    })

    let res: Response | null = null
    let lastErr = ''
    const urlsToTry = round === 0 ? candidateEndpoints : [activeEndpoint]
    for (const url of urlsToTry) {
      const attempt = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(25000),
      })
      if (attempt.ok) {
        res = attempt
        activeEndpoint = url
        break
      }
      lastErr = `HTTP ${attempt.status}: ${(await attempt.text().catch(() => '')).slice(0, 180)}`
    }

    if (!res) {
      throw new Error(`Gemini API failed across endpoints: ${lastErr}`)
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: {
          role?: string
          parts?: Array<{
            text?: string
            functionCall?: { name: string; args?: Record<string, unknown> }
          }>
        }
      }>
    }

    const parts = data.candidates?.[0]?.content?.parts ?? []
    const fnCalls = parts.filter((p) => p.functionCall)
    const textParts = parts.filter((p) => typeof p.text === 'string' && p.text.trim())

    if (fnCalls.length === 0) {
      const rawReply =
        textParts.map((p) => p.text).join('\n').trim() ||
        'I am here to help you find the right car in Chennai. Tell me your budget and family size!'
      const guardrail = checkGuardrails(rawReply, allToolCalls)
      return {
        reply: guardrail.passed ? rawReply : guardrail.correctedReply,
        toolCalls: allToolCalls,
        language,
        ...(ctaUrl ? { ctaUrl } : {}),
      }
    }

    // Append model turn containing function calls
    contents.push({ role: 'model', parts })

    // Execute every requested tool against real Postgres DB
    const responseParts: Array<Record<string, unknown>> = []
    for (const part of fnCalls) {
      const call = part.functionCall!
      const toolDef = tools.find((t) => t.name === call.name)
      let result: unknown
      try {
        result = toolDef
          ? await toolDef.handler(call.args ?? {}, { db })
          : { error: `Unknown tool: ${call.name}` }
      } catch (err: unknown) {
        result = { error: err instanceof Error ? err.message : 'Tool execution error' }
      }

      if (
        call.name === 'get_car_link' &&
        result &&
        typeof result === 'object' &&
        'url' in result &&
        typeof (result as { url?: unknown }).url === 'string'
      ) {
        ctaUrl = {
          label: 'View Photos & Full On-Road Breakup ↗',
          url: (result as { url: string }).url,
        }
      }

      allToolCalls.push({ name: call.name, input: call.args ?? {}, result })
      responseParts.push({
        functionResponse: {
          name: call.name,
          response: { result },
        },
      })
    }

    contents.push({ role: 'user', parts: responseParts })
  }

  return {
    reply: 'I needed a few too many lookups — could you tell me the model or budget you want to check?',
    toolCalls: allToolCalls,
    language,
    ...(ctaUrl ? { ctaUrl } : {}),
  }
}
