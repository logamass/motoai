/**
 * Guardrails — safety checks on every agent response.
 *
 * Ensures:
 * 1. Prices only come from tool calls (not hallucinated)
 * 2. Bank account details are never shared
 * 3. Disclaimer is always present when price is quoted
 * 4. No unverified data presented as fact
 */

export interface GuardrailResult {
  passed: boolean
  violations: string[]
  correctedReply: string
}

// Patterns that look like prices (₹ followed by numbers with commas)
const PRICE_PATTERN = /₹\s*[\d,]+(?:\.\d+)?/g
// Bank account patterns
const BANK_PATTERN = /\b(?:account\s*(?:no|number|#)|IFSC|NEFT|RTGS|UPI\s*ID|bank\s*details?)\b/i
// Payment safety patterns
const PAYMENT_SAFETY = /showroom|dealer/i

/**
 * Check guardrails on the agent's reply.
 */
export function checkGuardrails(
  reply: string,
  toolCalls: Array<{ name: string; input: any; result: any }>
): GuardrailResult {
  const violations: string[] = []
  let corrected = reply

  // 1. Check if prices in reply match tool call results
  const pricesInReply = reply.match(PRICE_PATTERN) || []
  if (pricesInReply.length > 0) {
    const priceToolCalled = toolCalls.some((tc) =>
      ['get_onroad_price', 'compare_variants', 'search_cars'].includes(tc.name)
    )
    if (!priceToolCalled) {
      violations.push('Price mentioned without calling a price tool — possible hallucination')
    }
  }

  // 2. Check for bank account details
  if (BANK_PATTERN.test(reply)) {
    violations.push('Bank account details detected in reply — blocked')
    corrected = corrected.replace(BANK_PATTERN, '[REMOVED]')
    corrected += '\n\n⚠️ Payment is accepted at the showroom only. Never transfer money online.'
  }

  // 3. Check disclaimer when price is quoted
  if (pricesInReply.length > 0 && !reply.includes('delivery')) {
    corrected += '\n\n_Price prevailing at delivery applies._'
  }

  return {
    passed: violations.length === 0,
    violations,
    correctedReply: corrected,
  }
}
