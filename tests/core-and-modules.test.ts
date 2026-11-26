import { describe, it, expect } from 'vitest'
import { validatePriceRow, diffPriceRows } from '../modules/pricing/src/validators.js'
import { detectLanguage, checkGuardrails } from '../packages/agent/src/index.js'
import {
  signHandoffToken,
  verifyHandoffToken,
  buildCarHandoffUrl,
} from '../modules/handoff/src/token.js'
import { bootModuleList } from '../packages/core/src/boot.js'
import { envSchema } from '../packages/core/src/config/index.js'
import { getAllModules, getAllTools, getAllRoutes } from '../packages/core/src/module-system.js'
import catalogModule from '../modules/catalog/src/index.js'
import pricingModule from '../modules/pricing/src/index.js'
import ingestionModule from '../modules/ingestion/src/index.js'
import customersModule from '../modules/customers/src/index.js'
import leadsModule from '../modules/leads/src/index.js'
import handoffModule from '../modules/handoff/src/index.js'

describe('Pricing arithmetic validators', () => {
  it('validates a correct price row with exact sum check and 1% TCS', () => {
    const res = validatePriceRow({
      suffix: 'E12MT',
      exShowroom: 1_114_000,
      tcs: 11_140,
      taxReg: 245_000,
      insurance1p3: 56_598,
      insurance3p3: 78_598,
      ew: 25_000,
      servicePack: 15_000,
      accessories: 40_000,
      onroad1p3: 1_506_738,
      onroad3p3: 1_528_738,
    })

    expect(res.valid).toBe(true)
    expect(res.errors).toEqual([])
    expect(res.computedOnroad1p3).toBe(1_506_738)
    expect(res.computedOnroad3p3).toBe(1_528_738)
  })

  it('rejects TCS mismatch and on-road sum mismatch', () => {
    const res = validatePriceRow({
      suffix: 'BAD!!',
      exShowroom: 1_200_000,
      tcs: 5_000, // wrong, should be 12,000
      taxReg: 200_000,
      insurance1p3: 50_000,
      insurance3p3: 70_000,
      onroad1p3: 1_999_999, // wrong
      onroad3p3: 1_475_000, // wrong
    })

    expect(res.valid).toBe(false)
    expect(res.errors.length).toBeGreaterThanOrEqual(3)
  })

  it('computes price diffs accurately for admin review', () => {
    const diffs = diffPriceRows(
      [{ variantId: 'v1', exShowroom: 1_000_000, onroad1p3: 1_250_000, onroad3p3: 1_270_000 }],
      [
        { variantId: 'v1', exShowroom: 1_020_000, onroad1p3: 1_275_000, onroad3p3: 1_295_000 },
        { variantId: 'v2', exShowroom: 1_500_000, onroad1p3: 1_850_000, onroad3p3: 1_880_000 },
      ]
    )

    expect(diffs).toHaveLength(2)
    const v1 = diffs.find((d) => d.key === 'v1')
    const v2 = diffs.find((d) => d.key === 'v2')
    expect(v1?.status).toBe('changed')
    expect(v1?.changes.some((c) => c.field === 'exShowroom' && c.delta === 20_000)).toBe(true)
    expect(v2?.status).toBe('added')
  })
})

describe('Agent language detection and guardrails', () => {
  it('detects English, Tamil script, and Tanglish', () => {
    expect(detectLanguage('I need a 7 seater SUV under 25 lakhs')).toBe('en')
    expect(detectLanguage('எனக்கு 7 seater car வேணும், budget 20 லட்சம்')).toBe('ta')
    expect(detectLanguage('Vanakkam, unga budget evlo? Enna car irukku?')).toBe('tl')
  })

  it('flags hallucinated prices when no price tool was called', () => {
    const res = checkGuardrails('Hyryder on-road price is ₹15,06,738.', [])
    expect(res.passed).toBe(false)
    expect(res.violations.some((v) => v.includes('price tool'))).toBe(true)
    expect(res.correctedReply).toContain('delivery')
  })

  it('passes when price came from get_onroad_price tool and blocks bank details', () => {
    const ok = checkGuardrails(
      'Hyryder on-road price is ₹15,06,738. Price prevailing at delivery applies.',
      [{ name: 'get_onroad_price', input: {}, result: { onroad1p3: 1506738 } }]
    )
    expect(ok.passed).toBe(true)

    const bank = checkGuardrails('Please transfer to IFSC HDFC0001234 Account No 12345.', [])
    expect(bank.passed).toBe(false)
    expect(bank.correctedReply).toContain('showroom only')
  })
})

describe('Handoff signed tokens', () => {
  const secret = 'test-handoff-secret-123'

  it('signs and verifies valid tokens and builds deep links', () => {
    const token = signHandoffToken(
      { conversationId: 'conv-1', customerId: 'cust-1', variantId: 'var-1' },
      secret
    )
    const verified = verifyHandoffToken(token, secret)
    expect(verified.valid).toBe(true)
    if (verified.valid) {
      expect(verified.payload.conversationId).toBe('conv-1')
      expect(verified.payload.customerId).toBe('cust-1')
      expect(verified.payload.variantId).toBe('var-1')
    }

    const url = buildCarHandoffUrl('https://motoai.in/', {
      brandSlug: 'toyota',
      modelSlug: 'hyryder',
      variantSlug: 'v-at',
      token,
    })
    expect(url).toContain('https://motoai.in/cars/toyota/hyryder/v-at?token=')
  })

  it('rejects tampered, malformed, and expired tokens', () => {
    const token = signHandoffToken({ conversationId: 'c1', customerId: 'u1' }, secret)
    expect(verifyHandoffToken(token + 'x', secret)).toEqual({
      valid: false,
      reason: 'invalid_signature',
    })
    expect(verifyHandoffToken('not-a-token', secret)).toEqual({
      valid: false,
      reason: 'malformed',
    })

    const expired = signHandoffToken(
      { conversationId: 'c1', customerId: 'u1', exp: Math.floor(Date.now() / 1000) - 10 },
      secret
    )
    expect(verifyHandoffToken(expired, secret)).toEqual({
      valid: false,
      reason: 'expired',
    })
  })
})

describe('Modular plugin boot system', () => {
  it('topologically boots all 6 modules regardless of input order and stays idempotent', () => {
    // Deliberately pass in reverse dependency order
    const allModules = [
      ingestionModule,
      handoffModule,
      leadsModule,
      pricingModule,
      customersModule,
      catalogModule,
    ]

    bootModuleList(allModules)
    bootModuleList(allModules) // idempotent second call

    const names = getAllModules().map((m) => m.name)
    expect(names).toHaveLength(6)
    expect(names.indexOf('catalog')).toBeLessThan(names.indexOf('pricing'))
    expect(names.indexOf('pricing')).toBeLessThan(names.indexOf('ingestion'))
    expect(names.indexOf('customers')).toBeLessThan(names.indexOf('leads'))
    expect(names.indexOf('customers')).toBeLessThan(names.indexOf('handoff'))

    expect(getAllTools().length).toBeGreaterThanOrEqual(8)
    expect(getAllRoutes().length).toBeGreaterThanOrEqual(8)
  })

  it('parses string feature flags correctly ("false" -> false, "true" -> true)', () => {
    const parsed = envSchema.parse({
      DATABASE_URL: 'postgres://localhost/test',
      NEXTAUTH_SECRET: 'secret',
      FLAG_ANALYTICS: 'false',
      FLAG_TELEGRAM: 'true',
      FLAG_VOICE: '1',
      FLAG_EMI_BANKS: '0',
    })
    expect(parsed.FLAG_ANALYTICS).toBe(false)
    expect(parsed.FLAG_TELEGRAM).toBe(true)
    expect(parsed.FLAG_VOICE).toBe(true)
    expect(parsed.FLAG_EMI_BANKS).toBe(false)
    expect(parsed.FLAG_MULTI_CITY).toBe(false)
  })
})
