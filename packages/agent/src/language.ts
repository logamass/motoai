/**
 * Language detection — English, Tamil, Tanglish.
 *
 * Detects the language of the customer's message
 * so the bot replies in the same language.
 */

export type Language = 'en' | 'ta' | 'tl'

// Tamil Unicode range: \u0B80-\u0BFF
const TAMIL_REGEX = /[\u0B80-\u0BFF]/
// Common Tanglish words
const TANGLISH_MARKERS = /\b(naan|unga|enna|enga|evlo|pannunga|sollunga|irukku|irukka|irukeenga|epadi|eppadi|epdi|vanakkam|venum|venaam|paarunga|kitta|pola|romba|konjam|dhaan|seri|illa|aana|appo|nalla|machan|anna|akka|thamizh)\b/i

/**
 * Detect language from text.
 *
 * Priority:
 * 1. If Tamil script characters → 'ta' (pure Tamil)
 * 2. If Tanglish markers → 'tl' (Tanglish)
 * 3. Default → 'en' (English)
 */
export function detectLanguage(text: string): Language {
  // Strip URLs before ratio calculation so long signed handoff links don't skew Tamil script ratio
  const cleaned = text.replace(/https?:\/\/\S+/gi, '')
  const tamilChars = (cleaned.match(/[\u0B80-\u0BFF]/g) || []).length
  const totalChars = cleaned.replace(/\s/g, '').length

  // If >20% Tamil characters → Tamil
  if (totalChars > 0 && tamilChars / totalChars > 0.2) {
    return 'ta'
  }

  // If Tanglish markers present → Tanglish
  if (TANGLISH_MARKERS.test(text)) {
    return 'tl'
  }

  // Default → English
  return 'en'
}
