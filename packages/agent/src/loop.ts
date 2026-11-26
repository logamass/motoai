/**
 * Agent loop — the core AI conversation engine.
 *
 * Takes a customer message, runs either:
 * 1. The Anthropic Claude tool-use loop (when ANTHROPIC_API_KEY is set), or
 * 2. The DB-backed Smart Advisor fallback (when ANTHROPIC_API_KEY is not set)
 *    using real registered module tools (search_cars, get_onroad_price,
 *    compare_variants, book_test_drive, get_car_link, handoff_to_human).
 *
 * Key design:
 * - Never generates or guesses prices — always reads exact DB values via tools.
 * - System prompt includes playbook index (stable prefix → prompt caching).
 * - Language auto-detection (en / ta / tl) → reply in same language.
 * - Guardrails checked before every response.
 */

import Anthropic from '@anthropic-ai/sdk'
import { env } from '@motoai/core/config'
import { getAllTools, type ToolDefinition } from '@motoai/core'
import { getDb } from '@motoai/core/db'
import { toAnthropicTools } from './tool-registry.js'
import { detectLanguage, type Language } from './language.js'
import { checkGuardrails } from './guardrails.js'
import { listPlaybooks, loadPlaybook } from './playbook-loader.js'
import { runGeminiAgent } from './gemini-loop.js'

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentContext {
  conversationId: string
  customerId?: string
  history: AgentMessage[]
  channel: 'whatsapp' | 'web'
  systemPromptExtra?: string
}

export interface AgentResult {
  reply: string
  toolCalls: Array<{ name: string; input: any; result: any }>
  language: string
  buttons?: Array<{ id: string; title: string }>
  ctaUrl?: { label: string; url: string }
}

export type ToolCallRecord = { name: string; input: any; result: any }

const MAX_TOOL_ROUNDS = 8
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const loadPlaybookTool: ToolDefinition = {
  name: 'load_playbook',
  description:
    'Load a showroom playbook markdown document by name from the playbook index to follow standard sales flows.',
  parameters: {
    name: {
      type: 'string',
      description: 'Playbook name without .md (e.g. "discovery", "recommend", "compare", "price-breakup")',
      required: true,
    },
  },
  handler: async (params: { name?: string }) => {
    const playbookName = params?.name?.trim()
    if (!playbookName) {
      return {
        found: false,
        error: 'Playbook name is required',
        availablePlaybooks: listPlaybooks().map((p) => p.name),
      }
    }
    const content = await loadPlaybook(playbookName)
    if (!content) {
      return {
        found: false,
        name: playbookName,
        availablePlaybooks: listPlaybooks().map((p) => p.name),
      }
    }
    return {
      found: true,
      name: playbookName,
      content,
    }
  },
}

/**
 * Run the agent loop for one user message.
 */
export async function runAgent(
  userMessage: string,
  ctx: AgentContext
): Promise<AgentResult> {
  const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY?.trim())
  const hasGemini = Boolean(env.GEMINI_API_KEY?.trim())

  if (!hasAnthropic && hasGemini) {
    const moduleTools = getAllTools()
    const tools = moduleTools.some((t) => t.name === 'load_playbook')
      ? moduleTools
      : [...moduleTools, loadPlaybookTool]
    const language = detectLanguage(userMessage)
    const { staticPrompt, dynamicPrompt } = buildSystemPromptParts(language, ctx)
    try {
      return await runGeminiAgent(
        userMessage,
        ctx,
        tools,
        `${staticPrompt}\n\n${dynamicPrompt}`,
        language
      )
    } catch (err) {
      console.error('[agent] Gemini API failed, falling back to DB advisor:', err)
      return runFallbackAdvisor(userMessage, ctx)
    }
  }

  if (!hasAnthropic) {
    return runFallbackAdvisor(userMessage, ctx)
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const moduleTools = getAllTools()
  const tools = moduleTools.some((t) => t.name === 'load_playbook')
    ? moduleTools
    : [...moduleTools, loadPlaybookTool]
  const db = getDb()

  const language = detectLanguage(userMessage)
  const { staticPrompt, dynamicPrompt } = buildSystemPromptParts(language, ctx)

  const messages: any[] = ctx.history.map((m) => ({
    role: m.role,
    content: m.content,
  }))
  messages.push({ role: 'user', content: userMessage })

  const allToolCalls: ToolCallRecord[] = []
  let ctaUrl: { label: string; url: string } | undefined

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: [
        { type: 'text', text: staticPrompt, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: dynamicPrompt },
      ],
      tools: toAnthropicTools(tools),
      messages,
    })

    const toolUseBlocks = response.content.filter((b: any) => b.type === 'tool_use')
    const textBlocks = response.content.filter((b: any) => b.type === 'text')

    if (toolUseBlocks.length === 0) {
      const reply = textBlocks.map((b: any) => b.text).join('\n')
      const guardrailResult = checkGuardrails(reply, allToolCalls)
      const finalReply = guardrailResult.passed ? reply : guardrailResult.correctedReply

      return {
        reply: finalReply,
        toolCalls: allToolCalls,
        language,
        ...(ctaUrl ? { ctaUrl } : {}),
      }
    }

    messages.push({ role: 'assistant', content: response.content })

    const toolResults: any[] = []
    for (const toolBlock of toolUseBlocks) {
      const name = (toolBlock as any).name as string
      const input = (toolBlock as any).input
      const toolDef = tools.find((t) => t.name === name)
      let result: any
      try {
        result = toolDef
          ? await toolDef.handler(input, { db })
          : { error: `Unknown tool: ${name}` }
      } catch (err: any) {
        result = { error: err?.message ?? 'Tool execution failed' }
      }

      if (name === 'get_car_link' && result?.success && typeof result.url === 'string') {
        ctaUrl = { label: 'View Car Details', url: result.url }
      }

      allToolCalls.push({ name, input, result })

      toolResults.push({
        type: 'tool_result',
        tool_use_id: (toolBlock as any).id,
        content: JSON.stringify(result),
      })
    }

    messages.push({ role: 'user', content: toolResults })
  }

  return {
    reply: 'I took too many steps. Let me simplify — could you ask again?',
    toolCalls: allToolCalls,
    language,
    ...(ctaUrl ? { ctaUrl } : {}),
  }
}

function buildSystemPromptParts(
  language: Language,
  ctx: AgentContext
): { staticPrompt: string; dynamicPrompt: string } {
  const playbooks = listPlaybooks()
  const playbookIndex =
    playbooks.length > 0
      ? playbooks
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((pb) => `- ${pb.name} (${pb.module}): ${pb.summary}`)
          .join('\n')
      : '- (No playbooks loaded)'

  const staticPrompt = `You are MotoAI, a friendly and knowledgeable AI car sales advisor.

CRITICAL RULES:
1. NEVER generate or guess any price. ALWAYS use get_onroad_price or compare_variants to get exact prices from the database.
2. ALWAYS include the disclaimer: "Price prevailing at delivery applies. Always pay only at the showroom."
3. NEVER share bank account details, IFSC, UPI ID, or online payment info. Say: "Payment showroom-la mattum pannunga."
4. If asked about a brand/model not in the database, honestly say the data is not available and offer Toyota alternatives if helpful.
5. Only present technical figures marked verified: true. If unverified, say you will confirm from the official spec sheet.

PLAYBOOK INDEX (call load_playbook(name) when needed):
${playbookIndex}

Your approach:
- Ask about family size, budget, usage, fuel preference, and transmission (1-2 questions at a time)
- Use search_cars to find matching vehicles
- Present top 2-3 picks with clear reasons
- Show exact on-road price breakup when asked
- Offer to compare, calculate EMI, send car web link, or book a test drive`

  const langInstructions: Record<Language, string> = {
    en: 'Reply in English.',
    ta: 'Reply in Tamil (தமிழ்). Use Tamil script.',
    tl: 'Reply in Tanglish (Tamil words in English script). Example: "Vanakkam! Unga budget evlo?"',
  }

  const dynamicPrompt = [
    `Language instruction: ${langInstructions[language]}`,
    `Channel: ${ctx.channel}`,
    ctx.customerId ? `Customer ID: ${ctx.customerId}` : '',
    ctx.conversationId ? `Conversation ID: ${ctx.conversationId}` : '',
    ctx.systemPromptExtra || '',
  ]
    .filter(Boolean)
    .join('\n')

  return { staticPrompt, dynamicPrompt }
}

// ============================================================================
// DB-Backed Smart Advisor Fallback (used when ANTHROPIC_API_KEY is unset)
// ============================================================================

interface ModelPattern {
  slug: string
  displayName: string
  searchQuery: string
  regex: RegExp
}

const MODEL_PATTERNS: ModelPattern[] = [
  {
    slug: 'urban-cruiser-hyryder',
    displayName: 'Urban Cruiser Hyryder',
    searchQuery: 'Hyryder',
    regex: /\b(?:hyryder|urban\s*cruiser)\b|ஹைரைடர்/i,
  },
  {
    slug: 'innova-hycross',
    displayName: 'Innova Hycross',
    searchQuery: 'Hycross',
    regex: /\b(?:hycross|innova)\b|ஹைகிராஸ்|இன்னோவா/i,
  },
  {
    slug: 'glanza',
    displayName: 'Glanza',
    searchQuery: 'Glanza',
    regex: /\bglanza\b|கிளான்ஸா/i,
  },
  {
    slug: 'taisor',
    displayName: 'Taisor',
    searchQuery: 'Taisor',
    regex: /\btaisor\b|டைசர்/i,
  },
  {
    slug: 'rumion',
    displayName: 'Rumion',
    searchQuery: 'Rumion',
    regex: /\brumion\b|ரூமியான்/i,
  },
  {
    slug: 'fortuner',
    displayName: 'Fortuner',
    searchQuery: 'Fortuner',
    regex: /\bfortuner\b|ஃபார்ச்சூனர்/i,
  },
]

const VARIANT_HINTS: Array<{ regex: RegExp; query: string }> = [
  { regex: /\bzx\s*\(?o\)?/i, query: 'ZX(O)' },
  { regex: /\bvx\s*hybrid\b/i, query: 'VX Hybrid' },
  { regex: /\bv\s*hybrid\b/i, query: 'V Hybrid' },
  { regex: /\bs\s*hybrid\b/i, query: 'S Hybrid' },
  { regex: /\bv\s*turbo\b/i, query: 'V Turbo' },
  { regex: /\bv\s*amt\b/i, query: 'V AMT' },
  { regex: /\bs\+\s*mt\b|\bs\s*plus\b/i, query: 'S+' },
  { regex: /\bs\s*cng\b/i, query: 'S CNG' },
  { regex: /\b4x2\s*diesel\s*at\b|\bdiesel\s*at\b/i, query: '4x2 Diesel AT' },
  { regex: /\b4x2\s*diesel\s*mt\b|\bdiesel\s*mt\b/i, query: '4x2 Diesel MT' },
  { regex: /\bgx\b/i, query: 'GX' },
  { regex: /\bvx\b/i, query: 'VX' },
  { regex: /\be\s*mt\b/i, query: 'E MT' },
  { regex: /\bs\s*mt\b/i, query: 'S MT' },
  { regex: /\bhybrid\b/i, query: 'Hybrid' },
  { regex: /\bcng\b/i, query: 'CNG' },
  { regex: /\bdiesel\b/i, query: 'Diesel' },
  { regex: /\bamt\b/i, query: 'AMT' },
]

const BANK_TRAP_REGEX =
  /\b(?:bank|upi|account|ifsc|neft|rtgs|gpay|google\s*pay|phonepe|paytm|transfer|payment\s*link|pay\s*online|pay\s*now)\b|வங்கி|அக்கவுண்ட்|யுபிஐ/i
const UNKNOWN_BRAND_REGEX =
  /\b(?:maruti|suzuki|hyundai|tata|kia|mahindra|honda|mg|skoda|volkswagen|vw|renault|nissan|byd|creta|brezza|nexon|seltos|xuv\d*|scorpio|elevate|swift|baleno|ertiga|fronx|grand\s*vitara|punch|harrier|safari|carens|alcazar|venue|sonet)\b|கிரெட்டா|பிரெஸ்ஸா|நெக்ஸான்|மாருதி|ஹூண்டாய்|டாடா|கியா/i
const TAXI_REGEX =
  /\b(?:taxi|cab|yellow\s*board|t[\s-]?board|commercial|fleet|uber|ola|tourist)\b|டாக்ஸி|கமர்ஷியல்/i
const TEST_DRIVE_REGEX = /\b(?:test\s*drive|td\s*slot|drive\s*test)\b|டெஸ்ட்\s*டிரைவ்/i
const HANDOFF_REGEX =
  /\b(?:human|advisor|executive|salesperson|manager|callback|call\s*me|talk\s*to\s*someone|exchange|trade[\s-]?in|old\s*car)\b|பேச\s*வேண்டும்|மனித/i
const LINK_REGEX =
  /\b(?:link|photo|photos|image|images|pic|pics|picture|pictures|brochure|website|web\s*page|car\s*page)\b|போட்டோ|படம்|லிங்க்/i
const COMPARE_REGEX = /\b(?:compare|vs|versus|difference\s*between)\b|ஒப்பீடு|வித்தியாசம்/i
const EMI_REGEX =
  /\b(?:emi|loan|finance|down\s*payment|downpayment|installment|monthly\s*payment)\b|இஎம்ஐ|லோன்|கடன்|மாத\s*தவணை/i
const INSURANCE_REGEX =
  /\b(?:1\s*\+\s*3|3\s*\+\s*3|insurance|zero\s*dep|bumper\s*to\s*bumper)\b|இன்சூரன்ஸ்|காப்பீடு/i
const OBJECTION_REGEX =
  /\b(?:expensive|costly|over\s*budget|out\s*of\s*budget|too\s*much|discount|cheaper|less\s*price|jaasthi|adhigam)\b|விலை\s*அதிகம்/i
const PRICE_REGEX =
  /\b(?:price|on[\s-]?road|onroad|cost|rate|quote|breakup|how\s*much|evlo|vilai)\b|விலை|எவ்வளவு|ஆன்[\s-]?ரோடு/i

interface ExtractedEntities {
  modelSlugs: string[]
  historyModelSlug: string | null
  variantHint: string | null
  budgetMaxInr: number | null
  seats: number | null
  fuel: string | null
  transmission: 'MT' | 'AT' | null
  bodyType: string | null
  emiMonths: number
  downPaymentRatio: number
  testDriveSlot: string | null
}

function pickLang<T>(lang: Language, textMap: Record<Language, T>): T {
  return textMap[lang] ?? textMap.en
}

function formatInr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`
}

function disclaimer(lang: Language): string {
  return pickLang(lang, {
    en: '_Price prevailing at delivery applies. Always pay only at the showroom._',
    ta: '_டெலிவரி நேரத்து விலை பொருந்தும் (Price prevailing at delivery applies). பணத்தை ஷோரூமில் மட்டுமே செலுத்துங்கள்._',
    tl: '_Price prevailing at delivery applies. Payment showroom-la mattum pannunga._',
  })
}

function extractEntities(userMessage: string, history: AgentMessage[]): ExtractedEntities {
  const modelSlugs: string[] = []
  for (const mp of MODEL_PATTERNS) {
    if (mp.regex.test(userMessage) && !modelSlugs.includes(mp.slug)) {
      modelSlugs.push(mp.slug)
    }
  }

  let historyModelSlug: string | null = null
  for (let i = history.length - 1; i >= 0; i--) {
    const content = history[i].content
    for (const mp of MODEL_PATTERNS) {
      if (mp.regex.test(content)) {
        historyModelSlug = mp.slug
        break
      }
    }
    if (historyModelSlug) break
  }

  let variantHint: string | null = null
  for (const vh of VARIANT_HINTS) {
    if (vh.regex.test(userMessage)) {
      variantHint = vh.query
      break
    }
  }

  // Budget extraction: supports "10L", "15 lakh", "20 lakhs", "45 to 50 lakh", "15,00,000"
  let budgetMaxInr: number | null = null
  const lakhMatches = Array.from(
    userMessage.matchAll(/(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs|l\b|லட்சம்|லட்ச)/gi)
  )
  if (lakhMatches.length > 0) {
    const values = lakhMatches.map((m) => Number(m[1]) * 100_000).filter((n) => Number.isFinite(n))
    if (values.length > 0) {
      budgetMaxInr = Math.max(...values)
    }
  } else {
    const rawRupees = userMessage.match(/₹\s*([\d,]{6,9})/)
    if (rawRupees) {
      const val = Number(rawRupees[1].replace(/,/g, ''))
      if (Number.isFinite(val) && val >= 500_000) {
        budgetMaxInr = val
      }
    }
  }

  // Seating extraction: "family of 6" / "7 seater" -> 7 seats; "family of 4" / "5 seater" -> 5 seats
  let seats: number | null = null
  const seatMatch =
    userMessage.match(/(\d)\s*[- ]?(?:seater|seats?|சீட்டர்)/i) ||
    userMessage.match(/(?:family\s*of|members?|people)\s*(\d)/i) ||
    userMessage.match(/(\d)\s*(?:பேர்|பேருக்கு)/i)
  if (seatMatch) {
    const count = Number(seatMatch[1])
    if (count >= 6) seats = 7
    else if (count >= 4 && count <= 5) seats = 5
  }

  // Fuel extraction
  let fuel: string | null = null
  if (/\bhybrid\b|ஹைப்ரிட்/i.test(userMessage)) fuel = 'Hybrid'
  else if (/\bcng\b|சிஎன்ஜி/i.test(userMessage)) fuel = 'CNG'
  else if (/\bdiesel\b|டீசல்/i.test(userMessage)) fuel = 'Diesel'
  else if (/\bpetrol\b|பெட்ரோல்/i.test(userMessage)) fuel = 'Petrol'

  // Transmission extraction
  let transmission: 'MT' | 'AT' | null = null
  if (/\b(?:at|amt|cvt|ecvt|e-cvt|automatic|auto)\b|ஆட்டோமேட்டிக்/i.test(userMessage)) {
    transmission = 'AT'
  } else if (/\b(?:mt|manual)\b|மேனுவல்/i.test(userMessage)) {
    transmission = 'MT'
  }

  // Body type extraction
  let bodyType: string | null = null
  if (/\bsuv\b/i.test(userMessage)) bodyType = 'suv'
  else if (/\bmpv\b/i.test(userMessage)) bodyType = 'mpv'
  else if (/\bhatchback\b/i.test(userMessage)) bodyType = 'hatchback'

  // EMI tenure extraction
  let emiMonths = 60
  const yrMatch = userMessage.match(/(\d+)\s*(?:year|years|yr|yrs|ஆண்டு)/i)
  const moMatch = userMessage.match(/(\d+)\s*(?:month|months|மாத)/i)
  if (yrMatch) {
    const yrs = Number(yrMatch[1])
    if (yrs >= 1 && yrs <= 8) emiMonths = yrs * 12
  } else if (moMatch) {
    const mos = Number(moMatch[1])
    if (mos >= 12 && mos <= 96) emiMonths = mos
  }

  // Test drive slot extraction
  let testDriveSlot: string | null = null
  const slotMatch = userMessage.match(
    /\b(?:tomorrow|today|this\s*(?:weekend|saturday|sunday)|next\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:\d{4}-\d{2}-\d{2}))(?:\s+(?:morning|afternoon|evening|at))?(?:\s+\d{1,2}(?::\d{2})?\s*(?:am|pm))?/i
  ) || userMessage.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i)
  if (slotMatch) {
    testDriveSlot = slotMatch[0].trim()
  }

  return {
    modelSlugs,
    historyModelSlug,
    variantHint,
    budgetMaxInr,
    seats,
    fuel,
    transmission,
    bodyType,
    emiMonths,
    downPaymentRatio: 0.2,
    testDriveSlot,
  }
}

function modelDisplayName(slug: string): string {
  return MODEL_PATTERNS.find((m) => m.slug === slug)?.displayName ?? slug
}

function modelSearchQuery(slug: string): string {
  return MODEL_PATTERNS.find((m) => m.slug === slug)?.searchQuery ?? slug
}

/**
 * DB-backed Smart Advisor fallback when ANTHROPIC_API_KEY is not configured.
 * Routes intents through real registered tools and checks guardrails on every reply.
 */
export async function runFallbackAdvisor(
  userMessage: string,
  ctx: AgentContext
): Promise<AgentResult> {
  const lang = detectLanguage(userMessage)
  const tools = getAllTools()
  const db = getDb()
  const allToolCalls: ToolCallRecord[] = []

  const invokeTool = async (name: string, input: Record<string, any>): Promise<any> => {
    const toolDef = tools.find((t) => t.name === name)
    let result: any
    if (!toolDef) {
      result = { error: `Tool "${name}" is not registered` }
    } else {
      try {
        result = await toolDef.handler(input, { db })
      } catch (err: any) {
        result = { error: err?.message ?? 'Tool execution failed' }
      }
    }
    allToolCalls.push({ name, input, result })
    return result
  }

  const entities = extractEntities(userMessage, ctx.history)
  let reply = ''
  let buttons: Array<{ id: string; title: string }> | undefined
  let ctaUrl: { label: string; url: string } | undefined

  const finalize = (text: string): AgentResult => {
    const guardrail = checkGuardrails(text, allToolCalls)
    const finalReply = guardrail.passed ? text : guardrail.correctedReply
    return {
      reply: finalReply,
      toolCalls: allToolCalls,
      language: lang,
      ...(buttons ? { buttons } : {}),
      ...(ctaUrl ? { ctaUrl } : {}),
    }
  }

  // 1. Bank / online payment trap (highest safety priority — never trigger BANK_PATTERN)
  if (BANK_TRAP_REGEX.test(userMessage)) {
    reply = pickLang(lang, {
      en: 'For your security, we never share online money transfer information or collect advance payments digitally here. All bookings and payments are accepted directly at our authorised Epic Toyota Chennai showroom only. Would you like to book a showroom visit or test drive?',
      ta: 'உங்கள் பாதுகாப்பிற்காக, ஆன்லைன் பணப் பரிமாற்ற விவரங்கள் எதுவும் இங்கே பகிரப்படாது. அனைத்து கட்டணங்களும் எங்கள் அங்கீகரிக்கப்பட்ட எபிக் டொயோட்டா சென்னை ஷோரூமில் (showroom) மட்டுமே நேரடியாக ஏற்கப்படும். ஷோரூம் வருகை அல்லது டெஸ்ட் டிரைவ் முன்பதிவு செய்யலாமா?',
      tl: 'Unga safety-kaaga, naanga online transfer info edhuvum share panna maatom, digital-aa advance-um vanguradhu illa. Payment showroom-la mattum pannunga — authorise panna Epic Toyota Chennai showroom counter-la mattum dhaan accept pannuvom. Showroom visit illa test drive book pannalama?',
    })
    buttons = [
      { id: 'book_td', title: 'Book Test Drive' },
      { id: 'show_prices', title: 'View Car Prices' },
    ]
    return finalize(reply)
  }

  // 2. Non-Toyota / Unavailable Brand trap
  if (UNKNOWN_BRAND_REGEX.test(userMessage)) {
    reply = pickLang(lang, {
      en: 'Thank you for asking! Currently we only have **Toyota (Chennai)** showroom catalog and published pricing data available here — we do not have data for Maruti, Hyundai, Tata, Kia, or other brands. If you would like to explore comparable Toyota options (like Urban Cruiser Hyryder, Taisor, or Rumion), I can share exact Chennai on-road prices right away!',
      ta: 'கேட்டதற்கு நன்றி! தற்போது எங்களிடம் **டொயோட்டா (சென்னை)** ஷோரூம் கார்கள் மற்றும் விலை விவரங்கள் மட்டுமே உள்ளன — மற்ற பிராண்டுகளின் தரவு எங்களிடம் இல்லை. அதற்கு இணையான டொயோட்டா கார்கள் (Hyryder, Taisor, Rumion) பற்றி பார்க்க வேண்டுமா?',
      tl: 'Kettadhukku nandri! Ippo enga kitta **Toyota (Chennai)** showroom catalog matrum price data mattum dhaan irukku — vera brand data illa. Adhukku match aagura Toyota options (Hyryder, Taisor, Rumion) pathi pakkalama? Sollunga!',
    })
    buttons = [
      { id: 'opt_hyryder', title: 'Hyryder SUV' },
      { id: 'opt_taisor', title: 'Taisor Compact' },
      { id: 'opt_rumion', title: 'Rumion 7-Seater' },
    ]
    return finalize(reply)
  }

  // 3. Taxi / Commercial / Fleet inquiry
  if (TAXI_REGEX.test(userMessage)) {
    const taxiRes = await invokeTool('search_cars', { segment: 'taxi', limit: 10 })
    const cngRes =
      taxiRes?.cars?.length > 0
        ? taxiRes
        : await invokeTool('search_cars', { fuel: 'CNG', limit: 5 })

    if (UUID_REGEX.test(ctx.customerId ?? '')) {
      await invokeTool('handoff_to_human', {
        customerId: ctx.customerId,
        conversationId: ctx.conversationId,
        reason: 'Taxi / commercial yellow-board fleet inquiry',
      })
    }

    const suggested = (cngRes?.cars ?? [])
      .slice(0, 2)
      .map((c: any) => `${c.modelName} ${c.variantName} (${c.fuel}, ${c.seatsLabel})`)
      .join(', ')

    reply = pickLang(lang, {
      en: `For yellow-board taxi or commercial fleet use, commercial RTO tax, permit fees, and fleet insurance differ from private white-board pricing, so our showroom fleet desk provides custom commercial quotes.${suggested ? ` Popular high-efficiency Toyota options in our catalog include **${suggested}**.` : ''} I can connect you with our Chennai showroom fleet advisor for an official commercial quote. All payments happen at the showroom only.`,
      ta: 'டாக்ஸி அல்லது கமர்ஷியல் (yellow-board) பயன்பாட்டிற்கு, கமர்ஷியல் RTO வரி, பர்மிட் மற்றும் இன்சூரன்ஸ் தனியார் கார்களில் இருந்து மாறுபடும். எங்கள் சென்னை ஷோரூம் ஃப்ளீட் ஆலோசகர் உங்களுக்கு சரியான கமர்ஷியல் விலை பட்டியலைத் தருவார். அனைத்து கட்டணங்களும் ஷோரூமில் மட்டுமே செலுத்த வேண்டும்.',
      tl: `Yellow-board taxi illa commercial fleet use-ku, commercial RTO tax, permit, insurance ellam private rate-oda maarupadum.${suggested ? ` High mileage-ku **${suggested}** romba nalla option-aa irukku.` : ''} Ungalukku exact commercial quote venum-na enga Chennai showroom fleet advisor kitta connect panniduren. Payment showroom-la mattum pannunga.`,
    })
    buttons = [{ id: 'book_td', title: 'Book Test Drive' }]
    return finalize(reply)
  }

  // 4. Test drive booking
  if (TEST_DRIVE_REGEX.test(userMessage)) {
    const targetSlug = entities.modelSlugs[0] ?? entities.historyModelSlug ?? 'urban-cruiser-hyryder'
    const searchRes = await invokeTool('search_cars', {
      query: modelSearchQuery(targetSlug),
      limit: 5,
    })
    const chosen = searchRes?.cars?.[0]
    const carTitle = chosen ? `${chosen.modelName} ${chosen.variantName}` : modelDisplayName(targetSlug)

    if (!entities.testDriveSlot) {
      reply = pickLang(lang, {
        en: `I would love to arrange a **${carTitle}** test drive at Epic Toyota Chennai! Which date and time slot works best for you (for example, tomorrow at 11:00 AM or this weekend)?`,
        ta: `எபிக் டொயோட்டா சென்னையில் **${carTitle}** டெஸ்ட் டிரைவ் ஏற்பாடு செய்ய நான் தயாராக உள்ளேன்! உங்களுக்கு எந்த தேதி மற்றும் நேரம் வசதியாக இருக்கும் (எடுத்துக்காட்டாக: நாளை காலை 11 மணி)?`,
        tl: `Epic Toyota Chennai-la **${carTitle}** test drive arrange pannalam! Ungalukku eppo venum — endha date & time slot convenient-aa irukkum (example: tomorrow 11:00 AM)? Sollunga!`,
      })
      buttons = [
        { id: 'slot_tmrw_11', title: 'Tomorrow 11 AM' },
        { id: 'slot_sat_16', title: 'Saturday 4 PM' },
        { id: 'slot_sun_10', title: 'Sunday 10 AM' },
      ]
      return finalize(reply)
    }

    let booked = false
    if (UUID_REGEX.test(ctx.customerId ?? '')) {
      const bookRes = await invokeTool('book_test_drive', {
        customerId: ctx.customerId,
        testDriveSlot: entities.testDriveSlot,
        conversationId: UUID_REGEX.test(ctx.conversationId) ? ctx.conversationId : undefined,
        variantId: chosen?.variantId,
        notes: `Test drive requested for ${carTitle}`,
      })
      booked = Boolean(bookRes?.success)
    }

    reply = pickLang(lang, {
      en: booked
        ? `Your test drive for **${carTitle}** is scheduled for **${entities.testDriveSlot}** at Epic Toyota Chennai! Please carry a valid driving licence. Test drives are completely complimentary.`
        : `Noted! We have requested a **${carTitle}** test drive for **${entities.testDriveSlot}** at Epic Toyota Chennai. Please carry a valid driving licence; our showroom coordinator will confirm the slot shortly.`,
      ta: `நன்றி! **${carTitle}** காரின் டெஸ்ட் டிரைவ் **${entities.testDriveSlot}** நேரத்திற்கு எபிக் டொயோட்டா சென்னையில் பதிவு செய்யப்பட்டுள்ளது. தயவுசெய்து உங்கள் ஓட்டுநர் உரிமத்தை (driving licence) கொண்டு வாருங்கள்.`,
      tl: `Super! **${carTitle}** test drive **${entities.testDriveSlot}** slot-ku Epic Toyota Chennai-la note panniyachu. Driving licence kondu vaanga — test drive completely free dhaan!`,
    })
    buttons = [{ id: 'get_link', title: 'View Car Photos' }]
    return finalize(reply)
  }

  // 5. Human handoff / Exchange / Callback
  if (HANDOFF_REGEX.test(userMessage)) {
    if (UUID_REGEX.test(ctx.customerId ?? '')) {
      await invokeTool('handoff_to_human', {
        customerId: ctx.customerId,
        conversationId: UUID_REGEX.test(ctx.conversationId) ? ctx.conversationId : undefined,
        reason: userMessage.slice(0, 120),
      })
    }

    reply = pickLang(lang, {
      en: 'I have requested a callback from our Epic Toyota Chennai showroom advisor to assist you personally (including exchange appraisal or custom offers). All official payments and documentation happen strictly at the showroom only.',
      ta: 'எங்கள் எபிக் டொயோட்டா சென்னை ஷோரூம் ஆலோசகர் உங்களை விரைவில் தொடர்பு கொள்ள பதிவு செய்துள்ளேன். அனைத்து கட்டணங்களும் ஷோரூமில் மட்டுமே நேரடியாக ஏற்கப்படும்.',
      tl: 'Naan enga Epic Toyota Chennai showroom advisor-ku callback request pannitten — avanga unga kitta seekiram pesuvaanga. Payment ellam showroom-la mattum pannunga.',
    })
    return finalize(reply)
  }

  // 6. Handoff Link / Photos / Website Details
  if (LINK_REGEX.test(userMessage)) {
    const targetSlug = entities.modelSlugs[0] ?? entities.historyModelSlug ?? 'urban-cruiser-hyryder'
    const searchRes = await invokeTool('search_cars', {
      query: modelSearchQuery(targetSlug),
      limit: 5,
    })
    const chosen = searchRes?.cars?.[0]

    if (chosen && UUID_REGEX.test(ctx.customerId ?? '') && UUID_REGEX.test(ctx.conversationId)) {
      const linkRes = await invokeTool('get_car_link', {
        conversationId: ctx.conversationId,
        customerId: ctx.customerId,
        brandSlug: chosen.brandSlug ?? 'toyota',
        modelSlug: chosen.modelSlug ?? targetSlug,
        variantSlug: chosen.variantSlug,
        variantId: chosen.variantId,
      })
      if (linkRes?.success && typeof linkRes.url === 'string') {
        ctaUrl = {
          label: pickLang(lang, {
            en: `View ${chosen.modelName} Details`,
            ta: `${chosen.modelName} விவரம் பார்க்க`,
            tl: `${chosen.modelName} Details Paarunga`,
          }),
          url: linkRes.url,
        }
      }
    }

    const carName = chosen ? `${chosen.brandName} ${chosen.modelName} ${chosen.variantName}` : modelDisplayName(targetSlug)
    reply = pickLang(lang, {
      en: ctaUrl
        ? `Here is your personalised webpage link for **${carName}** with photos, specs, and Chennai pricing: ${ctaUrl.url}`
        : `Here are the details for **${carName}** — visit our Chennai showroom page or book a test drive to experience it in person!`,
      ta: ctaUrl
        ? `**${carName}** காரின் புகைப்படங்கள், சிறப்பம்சங்கள் மற்றும் முழு விவரங்களைப் பார்க்க இந்த லிங்கைப் பயன்படுத்துங்கள்: ${ctaUrl.url}`
        : `**${carName}** காரின் புகைப்படங்கள் மற்றும் விவரங்களை எங்கள் ஷோரூம் பக்கத்தில் பார்க்கலாம். டெஸ்ட் டிரைவ் முன்பதிவு செய்ய வேண்டுமா?`,
      tl: ctaUrl
        ? `**${carName}** photos, specs matrum full details paakka indha personal link-a click pannunga: ${ctaUrl.url}`
        : `**${carName}** photos matrum full details paakka showroom website-la check pannunga. Test drive venum-na sollunga!`,
    })
    buttons = [{ id: 'book_td', title: 'Book Test Drive' }]
    return finalize(reply)
  }

  // 7. 1+3 vs 3+3 Insurance query (check before compare so "1+3 vs 3+3" routes here)
  if (INSURANCE_REGEX.test(userMessage)) {
    const targetSlug = entities.modelSlugs[0] ?? entities.historyModelSlug
    const quote = targetSlug ? await fetchBestQuote(invokeTool, targetSlug, entities.variantHint) : null

    const insuranceGuide = pickLang(lang, {
      en: '**1+3 vs 3+3 Car Insurance Explained:**\n• **1+3 Insurance**: 1 Year Own Damage (OD) + 3 Years Third Party (TP). Lower upfront on-road price; you renew OD cover annually from Year 2.\n• **3+3 Insurance**: 3 Years Own Damage (OD) + 3 Years Third Party (TP) bundled upfront — protects against annual premium increases for 3 years.',
      ta: '**1+3 vs 3+3 கார் இன்சூரன்ஸ் விளக்கம்:**\n• **1+3 இன்சூரன்ஸ்**: 1 வருட Own Damage (OD) + 3 வருட Third Party (TP). ஆரம்ப ஆன்-ரோடு விலை குறைவாக இருக்கும்; 2-ஆம் ஆண்டில் இருந்து OD புதுப்பிக்க வேண்டும்.\n• **3+3 இன்சூரன்ஸ்**: 3 வருட OD + 3 வருட TP ஒன்றாக கிடைக்கும் — 3 வருடங்களுக்குப் பிரீமியம் உயர்விலிருந்து பாதுகாப்பு தரும்.',
      tl: '**1+3 vs 3+3 Car Insurance Difference:**\n• **1+3 Insurance**: 1 Year Own Damage (OD) + 3 Years Third Party (TP). Upfront on-road price kammi-ya irukkum; Year 2-la irundhu OD renew pannanum.\n• **3+3 Insurance**: 3 Years OD + 3 Years TP — 3 varushathukkum OD cover lock aagidum, renewal tension illa.',
    })

    if (quote) {
      const diff = quote.breakup.onroad3p3 - quote.breakup.onroad1p3
      reply = `${insuranceGuide}\n\n**${quote.model} ${quote.variant}** (effective ${quote.effectiveDate}):\n• 1+3 Insurance: ${formatInr(quote.breakup.insurance1p3)} → On-Road **${formatInr(quote.breakup.onroad1p3)}**\n• 3+3 Insurance: ${formatInr(quote.breakup.insurance3p3)} → On-Road **${formatInr(quote.breakup.onroad3p3)}** (+${formatInr(diff)})\n\n${disclaimer(lang)}`
    } else {
      reply = `${insuranceGuide}\n\n${pickLang(lang, {
        en: 'Tell me which Toyota model you are considering and I will show exact 1+3 vs 3+3 on-road numbers!',
        ta: 'எந்த டொயோட்டா கார் என்று சொன்னால், 1+3 மற்றும் 3+3 ஆன்-ரோடு விலை விவரத்தைத் தருகிறேன்!',
        tl: 'Endha Toyota model venum-nu sollunga, exact 1+3 vs 3+3 on-road price solliduren!',
      })}`
    }
    return finalize(reply)
  }

  // 8. Compare variants / models
  if (COMPARE_REGEX.test(userMessage)) {
    const variantIds: string[] = []
    if (entities.modelSlugs.length >= 2) {
      const lowerMsg = userMessage.toLowerCase()
      for (const slug of entities.modelSlugs.slice(0, 3)) {
        const res = await invokeTool('search_cars', {
          query: modelSearchQuery(slug),
          limit: 6,
        })
        const candidates: any[] = res?.cars ?? []
        const scored = candidates
          .map((c) => {
            const trim = (c.trim ?? '').toLowerCase()
            const vName = (c.variantName ?? '').toLowerCase()
            const fuel = (c.fuel ?? '').toLowerCase()
            let score = 0
            if (vName && lowerMsg.includes(vName)) score += 5
            if (trim && new RegExp(`\\b${trim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lowerMsg)) {
              score += 3
            }
            if (fuel && lowerMsg.includes(fuel)) score += 1
            return { c, score }
          })
          .sort((a, b) => b.score - a.score)
        const picked = scored[0]?.c
        if (picked?.variantId) variantIds.push(picked.variantId)
      }
    } else {
      const slug = entities.modelSlugs[0] ?? entities.historyModelSlug ?? 'urban-cruiser-hyryder'
      const res = await invokeTool('search_cars', {
        query: modelSearchQuery(slug),
        limit: 6,
      })
      const candidates: any[] = res?.cars ?? []
      // Prefer variants mentioned in message, else pick 2 distinct variants
      const matched = candidates.filter((c) => {
        const lowerMsg = userMessage.toLowerCase()
        const trim = (c.trim ?? '').toLowerCase()
        const vName = (c.variantName ?? '').toLowerCase()
        return (
          (trim && new RegExp(`\\b${trim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lowerMsg)) ||
          lowerMsg.includes(vName)
        )
      })
      const pool = matched.length >= 2 ? matched : candidates
      for (const c of pool.slice(0, 3)) {
        if (c.variantId && !variantIds.includes(c.variantId)) variantIds.push(c.variantId)
      }
    }

    if (variantIds.length >= 2) {
      const cmp = await invokeTool('compare_variants', { variantIds, city: 'Chennai' })
      if (cmp?.found && Array.isArray(cmp.variants) && cmp.variants.length >= 2) {
        const lines = cmp.variants.map((v: any) => {
          const mileage = v.specs?.mileage ? ` | ${v.specs.mileage}` : ''
          return pickLang(lang, {
            en: `• **${v.model} ${v.variant}** (${v.fuel}, ${v.transmission}${mileage}): Ex-Showroom ${formatInr(v.exShowroom)} | On-Road (1+3) **${formatInr(v.onroad1p3)}** | On-Road (3+3) ${formatInr(v.onroad3p3)}`,
            ta: `• **${v.model} ${v.variant}** (${v.fuel}, ${v.transmission}${mileage}): எக்ஸ்-ஷோரூம் ${formatInr(v.exShowroom)} | ஆன்-ரோடு (1+3) **${formatInr(v.onroad1p3)}** | ஆன்-ரோடு (3+3) ${formatInr(v.onroad3p3)}`,
            tl: `• **${v.model} ${v.variant}** (${v.fuel}, ${v.transmission}${mileage}): Ex-Showroom ${formatInr(v.exShowroom)} | On-Road (1+3) **${formatInr(v.onroad1p3)}** | On-Road (3+3) ${formatInr(v.onroad3p3)}`,
          })
        })
        const diff = formatInr(cmp.priceSpread.onroad1p3Diff)
        reply = pickLang(lang, {
          en: `Here is the side-by-side Chennai comparison (effective ${cmp.effectiveDate}):\n\n${lines.join('\n')}\n\n• **On-Road (1+3) Price Difference**: ${diff}\n\n${disclaimer(lang)}`,
          ta: `சென்னை ஆன்-ரோடு ஒப்பீடு (விலை பட்டியல் தேதி: ${cmp.effectiveDate}):\n\n${lines.join('\n')}\n\n• **ஆன்-ரோடு விலை வித்தியாசம் (1+3)**: ${diff}\n\n${disclaimer(lang)}`,
          tl: `Chennai on-road comparison (effective ${cmp.effectiveDate}):\n\n${lines.join('\n')}\n\n• **Price Difference (1+3)**: ${diff}\n\n${disclaimer(lang)}`,
        })
        buttons = [
          { id: 'calc_emi', title: 'Calculate EMI' },
          { id: 'book_td', title: 'Book Test Drive' },
        ]
        return finalize(reply)
      }
    }

    reply = pickLang(lang, {
      en: 'Please tell me which two Toyota models or variants you want to compare (for example, Hyryder S Hybrid vs V Hybrid, or Rumion S CNG vs Hycross GX).',
      ta: 'எந்த இரண்டு டொயோட்டா கார்களை அல்லது வேரியண்ட்களை ஒப்பிட வேண்டும் என்று சொல்லுங்கள் (உதா: Hyryder S Hybrid vs V Hybrid).',
      tl: 'Endha rendu Toyota models illa variants-a compare pannanum-nu sollunga (example: Hyryder S Hybrid vs V Hybrid).',
    })
    return finalize(reply)
  }

  // 9. EMI / Loan calculation (grounded in live DB get_onroad_price)
  if (EMI_REGEX.test(userMessage)) {
    const targetSlug = entities.modelSlugs[0] ?? entities.historyModelSlug ?? 'urban-cruiser-hyryder'
    const quote = await fetchBestQuote(invokeTool, targetSlug, entities.variantHint)

    if (!quote) {
      reply = pickLang(lang, {
        en: 'Which Toyota model would you like an EMI calculation for (Glanza, Taisor, Hyryder, Rumion, Innova Hycross, or Fortuner)?',
        ta: 'எந்த டொயோட்டா காருக்கு மாதாந்திர EMI கணக்கிட வேண்டும் என்று சொல்லுங்கள்?',
        tl: 'Endha Toyota car-ku monthly EMI calculate pannanum-nu sollunga?',
      })
      return finalize(reply)
    }

    const onroad = quote.breakup.onroad1p3
    const downPayment = Math.round(onroad * entities.downPaymentRatio)
    const principal = onroad - downPayment
    const annualRate = 9.0
    const monthlyRate = annualRate / 12 / 100
    const n = entities.emiMonths
    const factor = Math.pow(1 + monthlyRate, n)
    const emi = Math.round((principal * monthlyRate * factor) / (factor - 1))

    reply = pickLang(lang, {
      en: `**Indicative EMI for ${quote.model} ${quote.variant}** (Chennai, effective ${quote.effectiveDate}):\n• On-Road Price (1+3): **${formatInr(onroad)}**\n• Assumed 20% Down Payment: ${formatInr(downPayment)}\n• Loan Amount: ${formatInr(principal)} @ ${annualRate}% p.a. for ${n} months\n• **Estimated Monthly EMI**: **${formatInr(emi)}/month**\n\n_Indicative estimate only; final ROI & sanction are confirmed at the showroom finance desk._\n${disclaimer(lang)}`,
      ta: `**${quote.model} ${quote.variant} க்கான மாதாந்திர EMI விவரம்** (தேதி: ${quote.effectiveDate}):\n• ஆன்-ரோடு விலை (1+3): **${formatInr(onroad)}**\n• முன்பணம் (20%): ${formatInr(downPayment)}\n• கடன் தொகை: ${formatInr(principal)} (${annualRate}% வட்டி, ${n} மாதங்கள்)\n• **மாதாந்திர EMI (தோராயமாக)**: **${formatInr(emi)}/மாதம்**\n\nஇறுதி வட்டி விகிதம் ஷோரூம் ஃபைனான்ஸ் பிரிவில் உறுதி செய்யப்படும்.\n${disclaimer(lang)}`,
      tl: `**${quote.model} ${quote.variant} Indicative EMI** (Chennai, effective ${quote.effectiveDate}):\n• On-Road Price (1+3): **${formatInr(onroad)}**\n• 20% Down Payment: ${formatInr(downPayment)}\n• Loan Amount: ${formatInr(principal)} (${annualRate}% p.a., ${n} months)\n• **Monthly EMI**: **${formatInr(emi)}/month**\n\n_Final bank interest rate & sanction showroom finance desk-la confirm aagum._\n${disclaimer(lang)}`,
    })
    buttons = [{ id: 'book_td', title: 'Book Test Drive' }]
    return finalize(reply)
  }

  // 10. Price objection handling
  if (OBJECTION_REGEX.test(userMessage)) {
    const targetSlug = entities.modelSlugs[0] ?? entities.historyModelSlug ?? 'urban-cruiser-hyryder'
    const priceRes = await invokeTool('get_onroad_price', {
      modelSlug: targetSlug,
      city: 'Chennai',
    })
    const quotes: any[] = priceRes?.quotes ?? []
    const sorted = [...quotes].sort((a, b) => a.breakup.onroad1p3 - b.breakup.onroad1p3)
    const entryQuote = sorted[0]
    const topQuote = sorted[sorted.length - 1]

    if (entryQuote) {
      const optionalTotal =
        (topQuote.breakup.ew ?? 0) +
        (topQuote.breakup.servicePack ?? 0) +
        (topQuote.breakup.accessories ?? 0)
      reply = pickLang(lang, {
        en: `I completely understand keeping your budget comfortable! On **${topQuote.model} ${topQuote.variant}** (On-Road 1+3: **${formatInr(topQuote.breakup.onroad1p3)}**, effective ${priceRes.effectiveDate}), note that **${formatInr(optionalTotal)}** is optional packs (Extended Warranty, Service Pack & Accessories) that you can customise at the showroom. Alternatively, the entry **${entryQuote.model} ${entryQuote.variant}** starts at **${formatInr(entryQuote.breakup.onroad1p3)}** on-road (1+3), or we can check EMI & official showroom exchange offers.\n\n${disclaimer(lang)}`,
        ta: `உங்கள் பட்ஜெட்டைப் புரிந்துகொள்கிறேன்! **${topQuote.model} ${topQuote.variant}** ஆன்-ரோடு விலையில் (${formatInr(topQuote.breakup.onroad1p3)}, தேதி: ${priceRes.effectiveDate}), **${formatInr(optionalTotal)}** மதிப்புள்ள EW, சர்வீஸ் பேக் மற்றும் ஆக்சஸரீஸ் விருப்பத்தேர்வுகளாகும் (optional). குறைந்த பட்ஜெட்டில் **${entryQuote.model} ${entryQuote.variant}** ஆன்-ரோடு **${formatInr(entryQuote.breakup.onroad1p3)}** விலையில் கிடைக்கிறது.\n\n${disclaimer(lang)}`,
        tl: `Unga budget concern puriyudhu! **${topQuote.model} ${topQuote.variant}** on-road (${formatInr(topQuote.breakup.onroad1p3)}, effective ${priceRes.effectiveDate}) price-la **${formatInr(optionalTotal)}** optional packs (EW, Service Pack, Accessories) irukku — adha showroom-la customise pannalam. Illa entry **${entryQuote.model} ${entryQuote.variant}** on-road **${formatInr(entryQuote.breakup.onroad1p3)}** irukku. EMI illa exchange offer-um showroom-la check pannalam!\n\n${disclaimer(lang)}`,
      })
      buttons = [
        { id: 'calc_emi', title: 'Calculate EMI' },
        { id: 'talk_advisor', title: 'Showroom Advisor' },
      ]
      return finalize(reply)
    }
  }

  // 11. Price breakup OR specific model query (without budget search overriding)
  if (
    (PRICE_REGEX.test(userMessage) || entities.modelSlugs.length > 0) &&
    entities.budgetMaxInr === null
  ) {
    const targetSlug = entities.modelSlugs[0] ?? entities.historyModelSlug
    if (targetSlug) {
      const priceRes = await fetchModelQuotes(invokeTool, targetSlug, entities.variantHint)
      const quotes: any[] = priceRes?.quotes ?? []

      if (quotes.length === 1 || entities.variantHint) {
        const q = quotes[0]
        if (q) {
          const b = q.breakup
          reply = pickLang(lang, {
            en: `**${q.brand} ${q.model} ${q.variant}** — Chennai On-Road Price Breakup (${q.dealer.name}, effective ${priceRes.effectiveDate}):\n• Ex-Showroom: ${formatInr(b.exShowroom)}\n• TCS: ${formatInr(b.tcs)}\n• RTO / Tax & Reg: ${formatInr(b.taxReg)}\n• Insurance (1+3): ${formatInr(b.insurance1p3)} | (3+3): ${formatInr(b.insurance3p3)}\n• Extended Warranty: ${formatInr(b.ew)} | Service Pack: ${formatInr(b.servicePack)} | Accessories: ${formatInr(b.accessories)}\n• **Total On-Road (1+3): ${formatInr(b.onroad1p3)}**\n• **Total On-Road (3+3): ${formatInr(b.onroad3p3)}**\n\n${disclaimer(lang)}`,
            ta: `**${q.brand} ${q.model} ${q.variant}** — சென்னை ஆன்-ரோடு விலை விவரம் (${q.dealer.name}, தேதி: ${priceRes.effectiveDate}):\n• எக்ஸ்-ஷோரூம் (Ex-Showroom): ${formatInr(b.exShowroom)}\n• TCS: ${formatInr(b.tcs)}\n• RTO வரி & பதிவு: ${formatInr(b.taxReg)}\n• இன்சூரன்ஸ் (1+3): ${formatInr(b.insurance1p3)} | (3+3): ${formatInr(b.insurance3p3)}\n• Extended Warranty: ${formatInr(b.ew)} | Service Pack: ${formatInr(b.servicePack)} | Accessories: ${formatInr(b.accessories)}\n• **மொத்த ஆன்-ரோடு விலை (1+3): ${formatInr(b.onroad1p3)}**\n• **மொத்த ஆன்-ரோடு விலை (3+3): ${formatInr(b.onroad3p3)}**\n\n${disclaimer(lang)}`,
            tl: `**${q.brand} ${q.model} ${q.variant}** — Chennai On-Road Price Breakup (${q.dealer.name}, effective ${priceRes.effectiveDate}):\n• Ex-Showroom: ${formatInr(b.exShowroom)}\n• TCS: ${formatInr(b.tcs)}\n• RTO / Tax: ${formatInr(b.taxReg)}\n• Insurance (1+3): ${formatInr(b.insurance1p3)} | (3+3): ${formatInr(b.insurance3p3)}\n• EW: ${formatInr(b.ew)} | Service Pack: ${formatInr(b.servicePack)} | Accessories: ${formatInr(b.accessories)}\n• **Total On-Road (1+3): ${formatInr(b.onroad1p3)}**\n• **Total On-Road (3+3): ${formatInr(b.onroad3p3)}**\n\n${disclaimer(lang)}`,
          })
          buttons = [
            { id: 'calc_emi', title: 'Calculate EMI' },
            { id: 'book_td', title: 'Book Test Drive' },
            { id: 'get_link', title: 'View Photos Link' },
          ]
          return finalize(reply)
        }
      } else if (quotes.length > 1) {
        const rows = quotes.slice(0, 4).map((q: any) =>
          pickLang(lang, {
            en: `• **${q.variant}** (${q.fuel}, ${q.transmission}): Ex-Showroom ${formatInr(q.breakup.exShowroom)} | On-Road (1+3) **${formatInr(q.breakup.onroad1p3)}** | (3+3) ${formatInr(q.breakup.onroad3p3)}`,
            ta: `• **${q.variant}** (${q.fuel}, ${q.transmission}): எக்ஸ்-ஷோரூம் ${formatInr(q.breakup.exShowroom)} | ஆன்-ரோடு (1+3) **${formatInr(q.breakup.onroad1p3)}** | (3+3) ${formatInr(q.breakup.onroad3p3)}`,
            tl: `• **${q.variant}** (${q.fuel}, ${q.transmission}): Ex-Showroom ${formatInr(q.breakup.exShowroom)} | On-Road (1+3) **${formatInr(q.breakup.onroad1p3)}** | (3+3) ${formatInr(q.breakup.onroad3p3)}`,
          })
        )
        reply = pickLang(lang, {
          en: `**${quotes[0].brand} ${quotes[0].model}** — Chennai On-Road Prices (${quotes[0].dealer.name}, effective ${priceRes.effectiveDate}):\n\n${rows.join('\n')}\n\n${disclaimer(lang)}`,
          ta: `**${quotes[0].brand} ${quotes[0].model}** — சென்னை ஷோரூம் ஆன்-ரோடு விலை பட்டியல் (${quotes[0].dealer.name}, தேதி: ${priceRes.effectiveDate}):\n\n${rows.join('\n')}\n\n${disclaimer(lang)}`,
          tl: `**${quotes[0].brand} ${quotes[0].model}** — Chennai On-Road Prices (${quotes[0].dealer.name}, effective ${priceRes.effectiveDate}):\n\n${rows.join('\n')}\n\n${disclaimer(lang)}`,
        })
        buttons = [
          { id: 'cmp_var', title: 'Compare Variants' },
          { id: 'calc_emi', title: 'Calculate EMI' },
          { id: 'book_td', title: 'Book Test Drive' },
        ]
        return finalize(reply)
      }
    }
  }

  // 12. Budget / Seater / Fuel / Transmission / BodyType search & recommendation
  if (
    entities.budgetMaxInr !== null ||
    entities.seats !== null ||
    entities.fuel !== null ||
    entities.transmission !== null ||
    entities.bodyType !== null
  ) {
    const searchInput: Record<string, any> = { limit: 20 }
    if (entities.seats !== null) searchInput.seats = entities.seats
    if (entities.fuel) searchInput.fuel = entities.fuel
    if (entities.transmission) searchInput.transmission = entities.transmission
    if (entities.bodyType) searchInput.bodyType = entities.bodyType

    const searchRes = await invokeTool('search_cars', searchInput)
    const cars: any[] = searchRes?.cars ?? []

    if (cars.length > 0) {
      const variantIds = cars.map((c: any) => c.variantId).filter(Boolean)
      const cmpRes = await invokeTool('compare_variants', { variantIds, city: 'Chennai' })
      const pricedVariants: any[] = cmpRes?.variants ?? []

      if (pricedVariants.length > 0) {
        let picks = pricedVariants
        if (entities.budgetMaxInr !== null) {
          const budget = entities.budgetMaxInr
          const maxStretch = budget * 1.1
          const primary = pricedVariants
            .filter((v) => v.onroad1p3 <= budget)
            .sort((a, b) => b.onroad1p3 - a.onroad1p3)
          const stretch = pricedVariants
            .filter((v) => v.onroad1p3 > budget && v.onroad1p3 <= maxStretch)
            .sort((a, b) => a.onroad1p3 - b.onroad1p3)
          const combined = [...primary, ...stretch.slice(0, 1)]
          picks =
            combined.length > 0
              ? combined
              : [...pricedVariants].sort((a, b) => a.onroad1p3 - b.onroad1p3)
        } else {
          picks = [...pricedVariants].sort((a, b) => a.onroad1p3 - b.onroad1p3)
        }

        const topPicks = picks.slice(0, 3)
        const pickLines = topPicks.map((v: any) => {
          const mileage = v.specs?.mileage ? ` (${v.specs.mileage})` : ''
          return pickLang(lang, {
            en: `• **${v.model} ${v.variant}** — ${v.fuel} ${v.transmission}${mileage} | On-Road (1+3): **${formatInr(v.onroad1p3)}** | (3+3): ${formatInr(v.onroad3p3)}`,
            ta: `• **${v.model} ${v.variant}** — ${v.fuel} ${v.transmission}${mileage} | ஆன்-ரோடு (1+3): **${formatInr(v.onroad1p3)}** | (3+3): ${formatInr(v.onroad3p3)}`,
            tl: `• **${v.model} ${v.variant}** — ${v.fuel} ${v.transmission}${mileage} | On-Road (1+3): **${formatInr(v.onroad1p3)}** | (3+3): ${formatInr(v.onroad3p3)}`,
          })
        })

        const budgetNote =
          entities.budgetMaxInr !== null && topPicks[0].onroad1p3 > entities.budgetMaxInr * 1.12
            ? pickLang(lang, {
                en: `Our closest entry options for your requirements start slightly above ${formatInr(entities.budgetMaxInr)}:\n\n`,
                ta: `உங்கள் தேவைக்கு ஏற்ப கிடைக்கும் மிகக் குறைந்த விலை மாடல்கள்:\n\n`,
                tl: `Unga requirement-ku match aagura closest Toyota options idho irukku:\n\n`,
              })
            : ''

        reply = pickLang(lang, {
          en: `${budgetNote}Here are the top Toyota recommendations from our Chennai catalog (effective ${cmpRes.effectiveDate}):\n\n${pickLines.join('\n')}\n\nWould you like a full price breakup, comparison, or test drive?\n${disclaimer(lang)}`,
          ta: `${budgetNote}உங்கள் தேவைக்கு ஏற்ற சிறந்த டொயோட்டா கார்கள் (சென்னை, தேதி: ${cmpRes.effectiveDate}):\n\n${pickLines.join('\n')}\n\nமுழு விலை விவரம் அல்லது டெஸ்ட் டிரைவ் வேண்டுமா?\n${disclaimer(lang)}`,
          tl: `${budgetNote}Unga requirement-ku match aagura top Toyota picks (Chennai, effective ${cmpRes.effectiveDate}):\n\n${pickLines.join('\n')}\n\nFull price breakup venuma illa test drive book pannalama? Sollunga!\n${disclaimer(lang)}`,
        })
        buttons = [
          { id: 'price_breakup', title: 'Price Breakup' },
          { id: 'calc_emi', title: 'Calculate EMI' },
          { id: 'book_td', title: 'Book Test Drive' },
        ]
        return finalize(reply)
      }
    }
  }

  // 13. Greeting / General Discovery fallback
  reply = pickLang(lang, {
    en: 'Vanakkam! Welcome to Epic Toyota Chennai. To suggest the best Toyota car for you, could you share:\n1. **Family size / seating** (5-seater or 7-seater)?\n2. **Approximate on-road budget** (e.g. 10 lakh, 20 lakh, or 35+ lakh) and fuel/gear preference?',
    ta: 'வணக்கம்! எபிக் டொயோட்டா சென்னை ஷோரூமுக்கு வரவேற்கிறோம். உங்களுக்குச் சரியான காரைப் பரிந்துரைக்க, தயவுசெய்து சொல்லுங்கள்:\n1. **எத்தனை பேர் பயணிப்பீர்கள்** (5-சீட்டர் அல்லது 7-சீட்டர்)?\n2. **உங்கள் பட்ஜெட் எவ்வளவு** மற்றும் பெட்ரோல் / ஹைப்ரிட் / டீசல் விருப்பம் என்ன?',
    tl: 'Vanakkam! Epic Toyota Chennai-ku welcome! Ungalukku best Toyota car suggest panna konjam sollunga:\n1. **Evlo members** (5-seater venuma illa 7-seater-a)?\n2. **Unga budget evlo** matrum Petrol / Hybrid / Diesel, Manual / Automatic preference enna?',
  })
  buttons = [
    { id: 'disc_15l', title: 'Under 15 Lakh' },
    { id: 'disc_25l', title: '15L - 25L SUV/MPV' },
    { id: 'disc_7s', title: '7-Seater Family' },
  ]
  return finalize(reply)
}

async function fetchModelQuotes(
  invokeTool: (name: string, input: Record<string, any>) => Promise<any>,
  modelSlug: string,
  variantHint: string | null
): Promise<any | null> {
  if (variantHint) {
    const narrow = await invokeTool('get_onroad_price', {
      modelSlug,
      variantQuery: variantHint,
      city: 'Chennai',
    })
    if (narrow?.found && narrow.quotes?.length > 0) {
      return narrow
    }
  }

  const broad = await invokeTool('get_onroad_price', {
    modelSlug,
    city: 'Chennai',
  })
  return broad?.found && broad.quotes?.length > 0 ? broad : null
}

async function fetchBestQuote(
  invokeTool: (name: string, input: Record<string, any>) => Promise<any>,
  modelSlug: string,
  variantHint: string | null
): Promise<any | null> {
  const res = await fetchModelQuotes(invokeTool, modelSlug, variantHint)
  return res?.quotes?.[0] ?? null
}
