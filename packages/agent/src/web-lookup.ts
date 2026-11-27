/**
 * Live Web Lookup Tool (`search_web_cars`) using Gemini Google Search Grounding.
 *
 * Called ONLY when a customer asks about a brand, model, variant, or feature+budget
 * combination that is NOT in MotoAI's verified showroom database.
 * Returns real Google-grounded facts clearly labeled as online/indicative.
 */

import { env } from '@motoai/core/config'
import type { ToolDefinition } from '@motoai/core'

export const searchWebCarsTool: ToolDefinition = {
  name: 'search_web_cars',
  description:
    'Search the live internet (Google Search) for Indian car models, features (e.g., sunroof, 7-seater), or brands NOT present in MotoAI verified database. Always label results as online/indicative.',
  parameters: {
    query: {
      type: 'string',
      description:
        'Specific Indian car market search query (e.g. "cars with sunroof under 12 lakh on road Chennai India 2026", "Hyundai Creta sunroof variants India", "does Toyota Taisor have sunroof India")',
      required: true,
    },
  },
  handler: async (params: { query?: string }) => {
    const query = params?.query?.trim()
    if (!query) {
      return {
        found: false,
        inMotoAiDatabase: false,
        error: 'Search query is required',
      }
    }

    const apiKey = env.GEMINI_API_KEY?.trim()
    if (!apiKey) {
      return {
        found: false,
        inMotoAiDatabase: false,
        source: 'web-unavailable',
        message:
          'Live web search is not configured right now. Tell the customer honestly that this data is not in MotoAI database.',
      }
    }

    const models = ['gemini-flash-lite-latest', 'gemini-2.5-flash-lite']
    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent`

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              role: 'system',
              parts: [
                {
                  text: 'You are a factual Indian automotive research assistant. Answer ONLY using facts from Google Search results. Be brief (max 5 bullet points), accurate for the Indian market, and NEVER invent features or variants that do not exist.',
                },
              ],
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: `Indian car market factual check: ${query}` }],
              },
            ],
            tools: [{ google_search: {} }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 450,
            },
          }),
          signal: AbortSignal.timeout(12000),
        })

        if (!res.ok) continue

        const data = (await res.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> }
            groundingMetadata?: {
              groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>
            }
          }>
        }

        const candidate = data.candidates?.[0]
        const summary =
          candidate?.content?.parts
            ?.map((p) => p.text ?? '')
            .join('\n')
            .trim() ?? ''

        const sources = (candidate?.groundingMetadata?.groundingChunks ?? [])
          .map((c) => c.web)
          .filter((w): w is { title?: string; uri?: string } => Boolean(w?.uri))
          .slice(0, 3)
          .map((w) => ({ title: w.title ?? 'Web source', url: w.uri! }))

        if (summary) {
          return {
            found: true,
            inMotoAiDatabase: false,
            source: 'google-web-search',
            verified: false,
            summary,
            sources,
            note: 'Online indicative info from web search — NOT in MotoAI verified dealer price list yet. Always tell the customer this clearly.',
          }
        }
      } catch {
        // Try next model
      }
    }

    return {
      found: false,
      inMotoAiDatabase: false,
      source: 'google-web-search',
      message:
        'Could not fetch live web search results right now. Honestly inform the customer that this car/feature is not in MotoAI verified database.',
    }
  },
}
