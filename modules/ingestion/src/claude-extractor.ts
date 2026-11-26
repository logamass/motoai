import { env } from '@motoai/core/config'
import type { PriceRowInput } from '@motoai/mod-pricing/validators'

interface AnthropicContentBlock {
  type: string
  text?: string
}

interface AnthropicMessageResponse {
  content?: AnthropicContentBlock[]
  error?: { message?: string }
}

const EXTRACTION_PROMPT = `You are a precision automotive price list parser.
Extract every vehicle variant row from the attached dealer price list PDF and return ONLY a strict JSON array of objects (no markdown fences, no commentary).

Each object in the JSON array MUST follow this TypeScript interface:
{
  "suffix": string | null,       // 4-6 uppercase alphanumeric model/variant suffix code if shown, else null
  "exShowroom": number,          // integer rupees (no commas)
  "tcs": number,                 // 1% of exShowroom if exShowroom >= 1000000, else 0
  "taxReg": number,              // RTO road tax + registration charges in integer rupees (0 if absent)
  "insurance1p3": number,        // 1 year OD + 3 year TP insurance in integer rupees (0 if absent)
  "insurance3p3": number,        // 3 year OD + 3 year TP insurance in integer rupees (0 if absent)
  "ew": number,                  // extended warranty in integer rupees (0 if absent)
  "servicePack": number,         // service pack / RSA / SMP in integer rupees (0 if absent)
  "accessories": number,         // accessories kit in integer rupees (0 if absent)
  "ceramic": number,             // ceramic / coating in integer rupees (0 if absent)
  "underbody": number,           // anti-rust / underbody coating in integer rupees (0 if absent)
  "onroad1p3": number,           // total on-road price with 1+3 insurance in integer rupees
  "onroad3p3": number,           // total on-road price with 3+3 insurance in integer rupees
  "extras": Record<string, number> | null // any other itemized fee columns not listed above, or null
}

Rules:
- All monetary values MUST be plain integers in INR (round only if decimals appear).
- Do NOT invent or recalculate values that conflict with the PDF; transcribe exact numbers from the table.
- Output ONLY the JSON array.`

function stripMarkdownFences(raw: string): string {
  const trimmed = raw.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenceMatch ? fenceMatch[1].trim() : trimmed
}

function toInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value)
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[₹,\s]/g, '')
    const parsed = Number(cleaned)
    if (Number.isFinite(parsed)) {
      return Math.round(parsed)
    }
  }
  return 0
}

function normalizeRow(item: Record<string, unknown>): PriceRowInput {
  const suffixRaw = typeof item.suffix === 'string' ? item.suffix.trim().toUpperCase() : null
  const suffix = suffixRaw && suffixRaw.length > 0 ? suffixRaw : null

  let extras: Record<string, number> | null = null
  if (item.extras && typeof item.extras === 'object' && !Array.isArray(item.extras)) {
    const normalizedExtras: Record<string, number> = {}
    for (const [k, v] of Object.entries(item.extras as Record<string, unknown>)) {
      const n = toInt(v)
      if (n !== 0) normalizedExtras[k] = n
    }
    if (Object.keys(normalizedExtras).length > 0) {
      extras = normalizedExtras
    }
  }

  return {
    ...(typeof item.variantId === 'string' && item.variantId.trim()
      ? { variantId: item.variantId.trim() }
      : {}),
    suffix,
    exShowroom: toInt(item.exShowroom),
    tcs: toInt(item.tcs),
    taxReg: toInt(item.taxReg),
    insurance1p3: toInt(item.insurance1p3),
    insurance3p3: toInt(item.insurance3p3),
    ew: toInt(item.ew),
    servicePack: toInt(item.servicePack),
    accessories: toInt(item.accessories),
    ceramic: toInt(item.ceramic),
    underbody: toInt(item.underbody),
    onroad1p3: toInt(item.onroad1p3),
    onroad3p3: toInt(item.onroad3p3),
    extras,
  }
}

/**
 * Extract structured dealer price rows from a PDF buffer using Claude Vision
 * via the Anthropic Messages API (`document` base64 block).
 */
export async function extractWithClaudeVision(
  pdfBuffer: Buffer,
  fileName: string
): Promise<PriceRowInput[]> {
  const apiKey = env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY not configured for PDF vision extraction; upload JSON payload or configure key'
    )
  }

  if (pdfBuffer.byteLength === 0) {
    throw new Error(`Uploaded PDF file "${fileName}" is empty`)
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBuffer.toString('base64'),
              },
            },
            {
              type: 'text',
              text: `${EXTRACTION_PROMPT}\n\nSource filename: ${fileName}`,
            },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(
      `Anthropic PDF extraction failed (${response.status}): ${errBody || response.statusText}`
    )
  }

  const data = (await response.json()) as AnthropicMessageResponse
  const textContent = (data.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text ?? '')
    .join('\n')

  if (!textContent.trim()) {
    throw new Error('Claude Vision returned an empty response for PDF extraction')
  }

  const cleaned = stripMarkdownFences(textContent)
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid JSON'
    throw new Error(`Claude Vision returned invalid JSON: ${msg}`)
  }

  const rawArray = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as { rows?: unknown }).rows)
      ? (parsed as { rows: unknown[] }).rows
      : null

  if (!rawArray) {
    throw new Error('Claude Vision output must be a JSON array of price rows')
  }

  return rawArray
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map(normalizeRow)
}
