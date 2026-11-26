/**
 * 30-Scenario Evaluation Harness for MotoAI Agent.
 *
 * Executable via:
 *   tsx evals/runner.ts
 *
 * Boots all modules with bootModuleList, detects whether live Postgres is
 * reachable & seeded (falling back cleanly to an exact in-memory Epic Toyota
 * Chennai demo dataset when Postgres is offline), runs all 30 scenarios
 * through runAgent, verifies language, guardrails, and tool/keyword accuracy,
 * prints a pass/fail table, and exits 0 if >= 95% pass (1 otherwise).
 */

import { join } from 'node:path'
import { bootModuleList } from '../packages/core/src/boot.js'
import { closeDb, getDb } from '../packages/core/src/db/index.js'
import type { ModuleDefinition, ToolDefinition } from '../packages/core/src/module-system.js'
import { checkGuardrails, detectLanguage, runAgent } from '../packages/agent/src/index.js'
import { discoverPlaybooks } from '../packages/agent/src/playbook-loader.js'
import catalogModule from '../modules/catalog/src/index.js'
import pricingModule from '../modules/pricing/src/index.js'
import { PRICE_DISCLAIMER } from '../modules/pricing/src/tools.js'
import ingestionModule from '../modules/ingestion/src/index.js'
import customersModule from '../modules/customers/src/index.js'
import leadsModule from '../modules/leads/src/index.js'
import handoffModule from '../modules/handoff/src/index.js'
import { EVAL_SCENARIOS, type EvalScenario } from './scenarios.js'

const EVAL_CUSTOMER_ID = '11111111-1111-4111-8111-111111111111'
const EVAL_CONVERSATION_ID = '22222222-2222-4222-8222-222222222222'
const BANK_LEAK_REGEX =
  /\b(?:account\s*(?:no|number|#)|IFSC|NEFT|RTGS|UPI\s*ID|bank\s*details?)\b/i

interface DemoVariantRow {
  variantId: string
  variantSlug: string
  variantName: string
  suffix: string
  fuel: string
  transmission: 'MT' | 'AT'
  powertrainType: string
  trim: string
  modelId: string
  modelSlug: string
  modelName: string
  bodyType: string
  segment: 'private' | 'taxi' | 'commercial'
  seatsMin: number
  seatsMax: number
  seatsLabel: string
  brandId: string
  brandSlug: string
  brandName: string
  spec: {
    engine: string
    mileage: string
    safetyRating: string
    airbags: number
    verified: boolean
  }
  price: {
    exShowroom: number
    tcs: number
    taxReg: number
    insurance1p3: number
    insurance3p3: number
    ew: number
    servicePack: number
    accessories: number
    ceramic: number
    underbody: number
    extras: number
    packageItems: null
    onroad1p3: number
    onroad3p3: number
  }
}

const DEMO_DEALER = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Epic Toyota Chennai',
  slug: 'epic-toyota-chennai',
  city: 'Chennai',
  rtoJurisdiction: 'Chennai RTO',
  address: 'Guindy, Chennai',
  contactPhone: null,
}

const EFFECTIVE_DATE = '2026-10-11'

const DEMO_CATALOG: DemoVariantRow[] = [
  {
    variantId: 'a0000001-0000-4000-8000-000000000001',
    variantSlug: 's-mt',
    variantName: 'S MT',
    suffix: 'GLZSMT',
    fuel: 'Petrol',
    transmission: 'MT',
    powertrainType: 'Petrol',
    trim: 'S',
    modelId: 'm0000001-0000-4000-8000-000000000001',
    modelSlug: 'glanza',
    modelName: 'Glanza',
    bodyType: 'hatchback',
    segment: 'private',
    seatsMin: 5,
    seatsMax: 5,
    seatsLabel: '5 Seater',
    brandId: 'b0000001-0000-4000-8000-000000000001',
    brandSlug: 'toyota',
    brandName: 'Toyota',
    spec: {
      engine: '1197 cc K-Series Dual Jet Petrol',
      mileage: '22.35 km/l',
      safetyRating: 'Unrated (Heartect Platform)',
      airbags: 2,
      verified: false,
    },
    price: {
      exShowroom: 779000,
      tcs: 0,
      taxReg: 105000,
      insurance1p3: 36500,
      insurance3p3: 51500,
      ew: 14500,
      servicePack: 9500,
      accessories: 18000,
      ceramic: 0,
      underbody: 0,
      extras: 0,
      packageItems: null,
      onroad1p3: 962500,
      onroad3p3: 977500,
    },
  },
  {
    variantId: 'a0000001-0000-4000-8000-000000000002',
    variantSlug: 'v-amt',
    variantName: 'V AMT',
    suffix: 'GLZVAT',
    fuel: 'Petrol',
    transmission: 'AT',
    powertrainType: 'Petrol',
    trim: 'V',
    modelId: 'm0000001-0000-4000-8000-000000000001',
    modelSlug: 'glanza',
    modelName: 'Glanza',
    bodyType: 'hatchback',
    segment: 'private',
    seatsMin: 5,
    seatsMax: 5,
    seatsLabel: '5 Seater',
    brandId: 'b0000001-0000-4000-8000-000000000001',
    brandSlug: 'toyota',
    brandName: 'Toyota',
    spec: {
      engine: '1197 cc K-Series Dual Jet Petrol',
      mileage: '22.94 km/l',
      safetyRating: 'Unrated (Heartect Platform)',
      airbags: 6,
      verified: false,
    },
    price: {
      exShowroom: 982000,
      tcs: 0,
      taxReg: 132000,
      insurance1p3: 44200,
      insurance3p3: 61800,
      ew: 16500,
      servicePack: 11000,
      accessories: 22000,
      ceramic: 0,
      underbody: 0,
      extras: 0,
      packageItems: null,
      onroad1p3: 1207700,
      onroad3p3: 1225300,
    },
  },
  {
    variantId: 'a0000001-0000-4000-8000-000000000003',
    variantSlug: 's-plus-mt',
    variantName: 'S+ MT',
    suffix: 'TSRSMT',
    fuel: 'Petrol',
    transmission: 'MT',
    powertrainType: 'Petrol',
    trim: 'S+',
    modelId: 'm0000001-0000-4000-8000-000000000002',
    modelSlug: 'taisor',
    modelName: 'Taisor',
    bodyType: 'compact-suv',
    segment: 'private',
    seatsMin: 5,
    seatsMax: 5,
    seatsLabel: '5 Seater',
    brandId: 'b0000001-0000-4000-8000-000000000001',
    brandSlug: 'toyota',
    brandName: 'Toyota',
    spec: {
      engine: '1197 cc K-Series Petrol',
      mileage: '21.79 km/l',
      safetyRating: 'Unrated (Heartect Platform)',
      airbags: 2,
      verified: false,
    },
    price: {
      exShowroom: 855000,
      tcs: 0,
      taxReg: 115000,
      insurance1p3: 39800,
      insurance3p3: 55600,
      ew: 15500,
      servicePack: 10500,
      accessories: 20000,
      ceramic: 0,
      underbody: 0,
      extras: 0,
      packageItems: null,
      onroad1p3: 1055800,
      onroad3p3: 1071600,
    },
  },
  {
    variantId: 'a0000001-0000-4000-8000-000000000004',
    variantSlug: 'v-turbo-at',
    variantName: 'V Turbo AT',
    suffix: 'TSRVAT',
    fuel: 'Petrol',
    transmission: 'AT',
    powertrainType: 'Turbo Petrol',
    trim: 'V',
    modelId: 'm0000001-0000-4000-8000-000000000002',
    modelSlug: 'taisor',
    modelName: 'Taisor',
    bodyType: 'compact-suv',
    segment: 'private',
    seatsMin: 5,
    seatsMax: 5,
    seatsLabel: '5 Seater',
    brandId: 'b0000001-0000-4000-8000-000000000001',
    brandSlug: 'toyota',
    brandName: 'Toyota',
    spec: {
      engine: '998 cc Boosterjet Turbo Petrol',
      mileage: '20.01 km/l',
      safetyRating: 'Unrated (Heartect Platform)',
      airbags: 6,
      verified: false,
    },
    price: {
      exShowroom: 1288000,
      tcs: 12880,
      taxReg: 235000,
      insurance1p3: 58400,
      insurance3p3: 81200,
      ew: 19500,
      servicePack: 12500,
      accessories: 28000,
      ceramic: 0,
      underbody: 0,
      extras: 0,
      packageItems: null,
      onroad1p3: 1654280,
      onroad3p3: 1677080,
    },
  },
  {
    variantId: 'a0000001-0000-4000-8000-000000000005',
    variantSlug: 'e-mt',
    variantName: 'E MT',
    suffix: 'HYREMT',
    fuel: 'Petrol',
    transmission: 'MT',
    powertrainType: 'Neo Drive Petrol',
    trim: 'E',
    modelId: 'm0000001-0000-4000-8000-000000000003',
    modelSlug: 'urban-cruiser-hyryder',
    modelName: 'Urban Cruiser Hyryder',
    bodyType: 'suv',
    segment: 'private',
    seatsMin: 5,
    seatsMax: 5,
    seatsLabel: '5 Seater',
    brandId: 'b0000001-0000-4000-8000-000000000001',
    brandSlug: 'toyota',
    brandName: 'Toyota',
    spec: {
      engine: '1462 cc K15C Neo Drive Petrol',
      mileage: '21.12 km/l',
      safetyRating: '4 Star (Global NCAP Est.)',
      airbags: 2,
      verified: false,
    },
    price: {
      exShowroom: 1114000,
      tcs: 11140,
      taxReg: 245000,
      insurance1p3: 56598,
      insurance3p3: 78598,
      ew: 25000,
      servicePack: 15000,
      accessories: 40000,
      ceramic: 0,
      underbody: 0,
      extras: 0,
      packageItems: null,
      onroad1p3: 1506738,
      onroad3p3: 1528738,
    },
  },
  {
    variantId: 'a0000001-0000-4000-8000-000000000006',
    variantSlug: 's-hybrid-ecvt',
    variantName: 'S Hybrid e-CVT',
    suffix: 'HYRSAT',
    fuel: 'Hybrid',
    transmission: 'AT',
    powertrainType: 'Strong Hybrid',
    trim: 'S',
    modelId: 'm0000001-0000-4000-8000-000000000003',
    modelSlug: 'urban-cruiser-hyryder',
    modelName: 'Urban Cruiser Hyryder',
    bodyType: 'suv',
    segment: 'private',
    seatsMin: 5,
    seatsMax: 5,
    seatsLabel: '5 Seater',
    brandId: 'b0000001-0000-4000-8000-000000000001',
    brandSlug: 'toyota',
    brandName: 'Toyota',
    spec: {
      engine: '1490 cc TNGA Strong Hybrid',
      mileage: '27.97 km/l',
      safetyRating: '4 Star (Global NCAP Est.)',
      airbags: 2,
      verified: false,
    },
    price: {
      exShowroom: 1666000,
      tcs: 16660,
      taxReg: 310000,
      insurance1p3: 72400,
      insurance3p3: 101500,
      ew: 28000,
      servicePack: 16500,
      accessories: 40000,
      ceramic: 0,
      underbody: 0,
      extras: 0,
      packageItems: null,
      onroad1p3: 2149560,
      onroad3p3: 2178660,
    },
  },
  {
    variantId: 'a0000001-0000-4000-8000-000000000007',
    variantSlug: 'v-hybrid-ecvt',
    variantName: 'V Hybrid e-CVT',
    suffix: 'HYRVAT',
    fuel: 'Hybrid',
    transmission: 'AT',
    powertrainType: 'Strong Hybrid',
    trim: 'V',
    modelId: 'm0000001-0000-4000-8000-000000000003',
    modelSlug: 'urban-cruiser-hyryder',
    modelName: 'Urban Cruiser Hyryder',
    bodyType: 'suv',
    segment: 'private',
    seatsMin: 5,
    seatsMax: 5,
    seatsLabel: '5 Seater',
    brandId: 'b0000001-0000-4000-8000-000000000001',
    brandSlug: 'toyota',
    brandName: 'Toyota',
    spec: {
      engine: '1490 cc TNGA Strong Hybrid',
      mileage: '27.97 km/l',
      safetyRating: '4 Star (Global NCAP Est.)',
      airbags: 6,
      verified: false,
    },
    price: {
      exShowroom: 1999000,
      tcs: 19990,
      taxReg: 372000,
      insurance1p3: 84600,
      insurance3p3: 118400,
      ew: 30000,
      servicePack: 18000,
      accessories: 45000,
      ceramic: 0,
      underbody: 0,
      extras: 0,
      packageItems: null,
      onroad1p3: 2568590,
      onroad3p3: 2602390,
    },
  },
  {
    variantId: 'a0000001-0000-4000-8000-000000000008',
    variantSlug: 's-mt',
    variantName: 'S MT',
    suffix: 'RUMSMT',
    fuel: 'Petrol',
    transmission: 'MT',
    powertrainType: 'Petrol',
    trim: 'S',
    modelId: 'm0000001-0000-4000-8000-000000000004',
    modelSlug: 'rumion',
    modelName: 'Rumion',
    bodyType: 'mpv',
    segment: 'private',
    seatsMin: 7,
    seatsMax: 7,
    seatsLabel: '7 Seater',
    brandId: 'b0000001-0000-4000-8000-000000000001',
    brandSlug: 'toyota',
    brandName: 'Toyota',
    spec: {
      engine: '1462 cc K15C Neo Drive Petrol',
      mileage: '20.51 km/l',
      safetyRating: '3 Star (Global NCAP Est.)',
      airbags: 4,
      verified: false,
    },
    price: {
      exShowroom: 1044000,
      tcs: 10440,
      taxReg: 192000,
      insurance1p3: 48900,
      insurance3p3: 68400,
      ew: 21000,
      servicePack: 13500,
      accessories: 25000,
      ceramic: 0,
      underbody: 0,
      extras: 0,
      packageItems: null,
      onroad1p3: 1354840,
      onroad3p3: 1374340,
    },
  },
  {
    variantId: 'a0000001-0000-4000-8000-000000000009',
    variantSlug: 's-cng-mt',
    variantName: 'S CNG MT',
    suffix: 'RUMCNG',
    fuel: 'CNG',
    transmission: 'MT',
    powertrainType: 'CNG',
    trim: 'S CNG',
    modelId: 'm0000001-0000-4000-8000-000000000004',
    modelSlug: 'rumion',
    modelName: 'Rumion',
    bodyType: 'mpv',
    segment: 'private',
    seatsMin: 7,
    seatsMax: 7,
    seatsLabel: '7 Seater',
    brandId: 'b0000001-0000-4000-8000-000000000001',
    brandSlug: 'toyota',
    brandName: 'Toyota',
    spec: {
      engine: '1462 cc K15C Bi-Fuel CNG',
      mileage: '26.11 km/kg',
      safetyRating: '3 Star (Global NCAP Est.)',
      airbags: 4,
      verified: false,
    },
    price: {
      exShowroom: 1139000,
      tcs: 11390,
      taxReg: 210000,
      insurance1p3: 52400,
      insurance3p3: 73200,
      ew: 22000,
      servicePack: 14000,
      accessories: 25000,
      ceramic: 0,
      underbody: 0,
      extras: 0,
      packageItems: null,
      onroad1p3: 1473790,
      onroad3p3: 1494590,
    },
  },
  {
    variantId: 'a0000001-0000-4000-8000-000000000010',
    variantSlug: 'gx-7s-at',
    variantName: 'GX 7S AT',
    suffix: 'HYCGX7',
    fuel: 'Petrol',
    transmission: 'AT',
    powertrainType: 'Petrol',
    trim: 'GX',
    modelId: 'm0000001-0000-4000-8000-000000000005',
    modelSlug: 'innova-hycross',
    modelName: 'Innova Hycross',
    bodyType: 'mpv',
    segment: 'private',
    seatsMin: 7,
    seatsMax: 8,
    seatsLabel: '7-8 Seater',
    brandId: 'b0000001-0000-4000-8000-000000000001',
    brandSlug: 'toyota',
    brandName: 'Toyota',
    spec: {
      engine: '1987 cc TNGA-C Petrol',
      mileage: '16.13 km/l',
      safetyRating: '5 Star (Bharat NCAP)',
      airbags: 6,
      verified: false,
    },
    price: {
      exShowroom: 1994000,
      tcs: 19940,
      taxReg: 370000,
      insurance1p3: 84200,
      insurance3p3: 117800,
      ew: 32000,
      servicePack: 22000,
      accessories: 50000,
      ceramic: 0,
      underbody: 0,
      extras: 0,
      packageItems: null,
      onroad1p3: 2572140,
      onroad3p3: 2605740,
    },
  },
  {
    variantId: 'a0000001-0000-4000-8000-000000000011',
    variantSlug: 'vx-hybrid-7s-ecvt',
    variantName: 'VX Hybrid 7S e-CVT',
    suffix: 'HYCVX7',
    fuel: 'Hybrid',
    transmission: 'AT',
    powertrainType: 'Strong Hybrid',
    trim: 'VX',
    modelId: 'm0000001-0000-4000-8000-000000000005',
    modelSlug: 'innova-hycross',
    modelName: 'Innova Hycross',
    bodyType: 'mpv',
    segment: 'private',
    seatsMin: 7,
    seatsMax: 8,
    seatsLabel: '7-8 Seater',
    brandId: 'b0000001-0000-4000-8000-000000000001',
    brandSlug: 'toyota',
    brandName: 'Toyota',
    spec: {
      engine: '1987 cc TNGA-C 5th Gen Strong Hybrid',
      mileage: '23.24 km/l',
      safetyRating: '5 Star (Bharat NCAP)',
      airbags: 6,
      verified: false,
    },
    price: {
      exShowroom: 2597000,
      tcs: 25970,
      taxReg: 482000,
      insurance1p3: 106500,
      insurance3p3: 148900,
      ew: 38000,
      servicePack: 25000,
      accessories: 55000,
      ceramic: 0,
      underbody: 0,
      extras: 0,
      packageItems: null,
      onroad1p3: 3329470,
      onroad3p3: 3371870,
    },
  },
  {
    variantId: 'a0000001-0000-4000-8000-000000000012',
    variantSlug: 'zx-o-hybrid-7s-ecvt',
    variantName: 'ZX(O) Hybrid 7S e-CVT',
    suffix: 'HYCZXO',
    fuel: 'Hybrid',
    transmission: 'AT',
    powertrainType: 'Strong Hybrid',
    trim: 'ZX(O)',
    modelId: 'm0000001-0000-4000-8000-000000000005',
    modelSlug: 'innova-hycross',
    modelName: 'Innova Hycross',
    bodyType: 'mpv',
    segment: 'private',
    seatsMin: 7,
    seatsMax: 8,
    seatsLabel: '7-8 Seater',
    brandId: 'b0000001-0000-4000-8000-000000000001',
    brandSlug: 'toyota',
    brandName: 'Toyota',
    spec: {
      engine: '1987 cc TNGA-C 5th Gen Strong Hybrid',
      mileage: '23.24 km/l',
      safetyRating: '5 Star (Bharat NCAP)',
      airbags: 6,
      verified: false,
    },
    price: {
      exShowroom: 3098000,
      tcs: 30980,
      taxReg: 575000,
      insurance1p3: 124800,
      insurance3p3: 174500,
      ew: 42000,
      servicePack: 28000,
      accessories: 65000,
      ceramic: 0,
      underbody: 0,
      extras: 0,
      packageItems: null,
      onroad1p3: 3963780,
      onroad3p3: 4013480,
    },
  },
  {
    variantId: 'a0000001-0000-4000-8000-000000000013',
    variantSlug: '4x2-diesel-mt',
    variantName: '4x2 Diesel MT',
    suffix: 'FTN42M',
    fuel: 'Diesel',
    transmission: 'MT',
    powertrainType: 'Diesel',
    trim: '4x2',
    modelId: 'm0000001-0000-4000-8000-000000000006',
    modelSlug: 'fortuner',
    modelName: 'Fortuner',
    bodyType: 'suv',
    segment: 'private',
    seatsMin: 7,
    seatsMax: 7,
    seatsLabel: '7 Seater',
    brandId: 'b0000001-0000-4000-8000-000000000001',
    brandSlug: 'toyota',
    brandName: 'Toyota',
    spec: {
      engine: '2755 cc 1GD-FTV Turbo Diesel',
      mileage: '14.60 km/l',
      safetyRating: '5 Star (ASEAN NCAP)',
      airbags: 7,
      verified: false,
    },
    price: {
      exShowroom: 3633000,
      tcs: 36330,
      taxReg: 674000,
      insurance1p3: 145200,
      insurance3p3: 202800,
      ew: 55000,
      servicePack: 35000,
      accessories: 75000,
      ceramic: 0,
      underbody: 0,
      extras: 0,
      packageItems: null,
      onroad1p3: 4653530,
      onroad3p3: 4711130,
    },
  },
  {
    variantId: 'a0000001-0000-4000-8000-000000000014',
    variantSlug: '4x2-diesel-at',
    variantName: '4x2 Diesel AT',
    suffix: 'FTN42A',
    fuel: 'Diesel',
    transmission: 'AT',
    powertrainType: 'Diesel',
    trim: '4x2',
    modelId: 'm0000001-0000-4000-8000-000000000006',
    modelSlug: 'fortuner',
    modelName: 'Fortuner',
    bodyType: 'suv',
    segment: 'private',
    seatsMin: 7,
    seatsMax: 7,
    seatsLabel: '7 Seater',
    brandId: 'b0000001-0000-4000-8000-000000000001',
    brandSlug: 'toyota',
    brandName: 'Toyota',
    spec: {
      engine: '2755 cc 1GD-FTV Turbo Diesel',
      mileage: '14.20 km/l',
      safetyRating: '5 Star (ASEAN NCAP)',
      airbags: 7,
      verified: false,
    },
    price: {
      exShowroom: 3861000,
      tcs: 38610,
      taxReg: 716000,
      insurance1p3: 153600,
      insurance3p3: 214500,
      ew: 55000,
      servicePack: 35000,
      accessories: 75000,
      ceramic: 0,
      underbody: 0,
      extras: 0,
      packageItems: null,
      onroad1p3: 4934210,
      onroad3p3: 4995110,
    },
  },
]

function buildMockToolHandlers(): Record<string, ToolDefinition['handler']> {
  return {
    search_cars: async (params: any) => {
      let rows = [...DEMO_CATALOG]
      if (params?.query?.trim()) {
        const q = params.query.trim().toLowerCase()
        rows = rows.filter(
          (r) =>
            r.brandName.toLowerCase().includes(q) ||
            r.modelName.toLowerCase().includes(q) ||
            r.variantName.toLowerCase().includes(q) ||
            r.trim.toLowerCase().includes(q)
        )
      }
      if (params?.fuel?.trim()) {
        const f = params.fuel.trim().toLowerCase()
        rows = rows.filter((r) => r.fuel.toLowerCase().includes(f))
      }
      if (params?.transmission) {
        rows = rows.filter((r) => r.transmission === params.transmission)
      }
      if (params?.bodyType?.trim()) {
        const bt = params.bodyType.trim().toLowerCase()
        rows = rows.filter((r) => r.bodyType.toLowerCase().includes(bt))
      }
      if (params?.segment) {
        rows = rows.filter((r) => r.segment === params.segment)
      }
      if (typeof params?.seats === 'number') {
        rows = rows.filter((r) => r.seatsMin <= params.seats && r.seatsMax >= params.seats)
      }
      const maxRows = Math.min(Math.max(params?.limit ?? 10, 1), 25)
      const cars = rows.slice(0, maxRows).map(({ spec: _s, price: _p, ...rest }) => rest)
      return { cars, total: cars.length }
    },

    get_variant_details: async (params: any) => {
      const row = DEMO_CATALOG.find((r) =>
        params?.variantId ? r.variantId === params.variantId : r.variantSlug === params?.slug
      )
      if (!row) return { found: false, message: 'Variant not found' }
      return {
        found: true,
        brand: { id: row.brandId, slug: row.brandSlug, name: row.brandName },
        model: {
          id: row.modelId,
          slug: row.modelSlug,
          name: row.modelName,
          bodyType: row.bodyType,
          segment: row.segment,
          seatsMin: row.seatsMin,
          seatsMax: row.seatsMax,
          seatsLabel: row.seatsLabel,
        },
        variant: {
          id: row.variantId,
          slug: row.variantSlug,
          name: row.variantName,
          fuel: row.fuel,
          transmission: row.transmission,
        },
        specs: row.spec,
        specsVerified: row.spec.verified,
        media: [],
      }
    },

    get_onroad_price: async (params: any) => {
      let rows = [...DEMO_CATALOG]
      if (params?.variantId) {
        rows = rows.filter((r) => r.variantId === params.variantId)
      }
      if (params?.variantQuery?.trim()) {
        const q = params.variantQuery.trim().toLowerCase()
        rows = rows.filter(
          (r) =>
            r.variantName.toLowerCase().includes(q) ||
            r.variantSlug.toLowerCase().includes(q) ||
            r.suffix.toLowerCase().includes(q) ||
            r.modelName.toLowerCase().includes(q)
        )
      }
      if (params?.modelSlug?.trim()) {
        rows = rows.filter((r) => r.modelSlug === params.modelSlug.trim())
      }
      if (rows.length === 0) {
        return { found: false, message: 'No matching price found', disclaimer: PRICE_DISCLAIMER }
      }
      return {
        found: true,
        quotes: rows.slice(0, 5).map((r) => ({
          brand: r.brandName,
          model: r.modelName,
          variant: r.variantName,
          variantId: r.variantId,
          suffix: r.suffix,
          fuel: r.fuel,
          transmission: r.transmission,
          dealer: DEMO_DEALER,
          effectiveDate: EFFECTIVE_DATE,
          priceListVersion: 1,
          breakup: r.price,
        })),
        effectiveDate: EFFECTIVE_DATE,
        disclaimer: PRICE_DISCLAIMER,
      }
    },

    compare_variants: async (params: any) => {
      const ids: string[] = params?.variantIds ?? []
      const slugs: string[] = params?.variantSlugs ?? []
      const matched = DEMO_CATALOG.filter((r) =>
        ids.length > 0 ? ids.includes(r.variantId) : slugs.includes(r.variantSlug)
      )
      if (matched.length === 0) {
        return { found: false, message: 'No variants found', disclaimer: PRICE_DISCLAIMER }
      }
      const items = matched.map((r) => ({
        variantId: r.variantId,
        brand: r.brandName,
        model: r.modelName,
        variant: r.variantName,
        fuel: r.fuel,
        transmission: r.transmission,
        dealer: { name: DEMO_DEALER.name, city: DEMO_DEALER.city },
        effectiveDate: EFFECTIVE_DATE,
        exShowroom: r.price.exShowroom,
        onroad1p3: r.price.onroad1p3,
        onroad3p3: r.price.onroad3p3,
        specs: r.spec,
      }))
      const sorted = [...items].sort((a, b) => a.onroad1p3 - b.onroad1p3)
      const low = sorted[0]
      const high = sorted[sorted.length - 1]
      return {
        found: true,
        variants: items,
        priceSpread: {
          exShowroomDiff: high.exShowroom - low.exShowroom,
          onroad1p3Diff: high.onroad1p3 - low.onroad1p3,
          onroad3p3Diff: high.onroad3p3 - low.onroad3p3,
        },
        effectiveDate: EFFECTIVE_DATE,
        disclaimer: PRICE_DISCLAIMER,
      }
    },

    book_test_drive: async (params: any) => ({
      success: true,
      lead: {
        id: '44444444-4444-4444-8444-444444444444',
        customerId: params.customerId,
        stage: 'test_drive',
        testDriveSlot: params.testDriveSlot,
        shortlistedVariantIds: params.variantId ? [params.variantId] : [],
      },
    }),

    handoff_to_human: async (params: any) => ({
      success: true,
      handoffRequested: true,
      lead: {
        id: '55555555-5555-4555-8555-555555555555',
        customerId: params.customerId,
        stage: 'qualified',
        notes: params.reason ?? null,
      },
    }),

    get_car_link: async (params: any) => {
      const slugPath = params.variantSlug
        ? `${params.brandSlug}/${params.modelSlug}/${params.variantSlug}`
        : `${params.brandSlug}/${params.modelSlug}`
      return {
        success: true,
        url: `http://localhost:3000/cars/${slugPath}?token=eval-demo-token`,
        token: 'eval-demo-token',
        expiresAt: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
      }
    },
  }
}

function wrapModuleWithMocks(
  mod: ModuleDefinition,
  handlers: Record<string, ToolDefinition['handler']>
): ModuleDefinition {
  if (!mod.tools || mod.tools.length === 0) return mod
  return {
    ...mod,
    tools: mod.tools.map((tool) =>
      handlers[tool.name] ? { ...tool, handler: handlers[tool.name] } : tool
    ),
  }
}

async function isLiveDbSeeded(): Promise<boolean> {
  try {
    const db = getDb()
    const priceTool = pricingModule.tools?.find((t) => t.name === 'get_onroad_price')
    if (!priceTool) return false

    const checkPromise = priceTool.handler({ modelSlug: 'glanza', city: 'Chennai' }, { db })
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DB check timeout')), 2000)
    )
    const res = (await Promise.race([checkPromise, timeoutPromise])) as {
      found?: boolean
      quotes?: unknown[]
    }
    return Boolean(res?.found && Array.isArray(res.quotes) && res.quotes.length > 0)
  } catch {
    return false
  }
}

interface ScenarioOutcome {
  id: number
  name: string
  category: string
  passed: boolean
  language: string
  toolsCalled: string[]
  failures: string[]
}

async function evaluateScenario(scenario: EvalScenario): Promise<ScenarioOutcome> {
  const failures: string[] = []
  const result = await runAgent(scenario.userMessage, {
    conversationId: EVAL_CONVERSATION_ID,
    customerId: EVAL_CUSTOMER_ID,
    history: scenario.history ?? [],
    channel: scenario.channel ?? 'web',
  })

  const toolsCalled = result.toolCalls.map((t) => t.name)

  // 1. Language check (both returned language and detected reply language)
  if (result.language !== scenario.expectedLanguage) {
    failures.push(`Expected language "${scenario.expectedLanguage}", got "${result.language}"`)
  }
  const replyDetectedLang = detectLanguage(result.reply)
  if (replyDetectedLang !== scenario.expectedLanguage) {
    failures.push(
      `Reply language mismatch: expected "${scenario.expectedLanguage}", reply detected as "${replyDetectedLang}"`
    )
  }

  // 2. Guardrail checks
  const guardrail = checkGuardrails(result.reply, result.toolCalls)
  if (!guardrail.passed) {
    failures.push(`Guardrail violations: ${guardrail.violations.join('; ')}`)
  }
  if (BANK_LEAK_REGEX.test(result.reply)) {
    failures.push('Bank/UPI pattern leaked in reply')
  }
  if (/₹\s*[\d,]+/.test(result.reply) && !result.reply.includes('delivery')) {
    failures.push('Price quoted without delivery disclaimer')
  }

  // 3. Expected tools check
  if (scenario.expectedTools && scenario.expectedTools.length > 0) {
    const anyToolCalled = scenario.expectedTools.some((t) => toolsCalled.includes(t))
    if (!anyToolCalled) {
      failures.push(
        `Expected one of [${scenario.expectedTools.join(', ')}], got [${toolsCalled.join(', ') || 'none'}]`
      )
    }
  }

  // 4. Expected keywords check
  const lowerReply = result.reply.toLowerCase()
  for (const kw of scenario.expectedKeywords ?? []) {
    if (!lowerReply.includes(kw.toLowerCase())) {
      failures.push(`Missing expected keyword: "${kw}"`)
    }
  }
  for (const group of scenario.expectedAnyKeywords ?? []) {
    if (!group.some((kw) => lowerReply.includes(kw.toLowerCase()))) {
      failures.push(`Missing any of keywords: [${group.join(' | ')}]`)
    }
  }
  for (const bad of scenario.forbiddenKeywords ?? []) {
    if (lowerReply.includes(bad.toLowerCase())) {
      failures.push(`Found forbidden keyword: "${bad}"`)
    }
  }

  // 5. CTA URL & Buttons check
  if (scenario.expectCtaUrl && !result.ctaUrl?.url) {
    failures.push('Expected ctaUrl to be returned')
  }
  if (scenario.expectButtons && (!result.buttons || result.buttons.length === 0)) {
    failures.push('Expected quick-reply buttons to be returned')
  }

  return {
    id: scenario.id,
    name: scenario.name,
    category: scenario.category,
    passed: failures.length === 0,
    language: result.language,
    toolsCalled,
    failures,
  }
}

async function main(): Promise<void> {
  console.log('\n🚀 MotoAI 30-Scenario Eval Harness')
  console.log('====================================')

  const liveDb = await isLiveDbSeeded()
  const modeLabel = liveDb ? 'LIVE POSTGRES DB' : 'IN-MEMORY DEMO DB (Postgres unreachable/unseeded)'
  console.log(`Mode: ${modeLabel}`)

  const rawModules = [
    catalogModule,
    pricingModule,
    ingestionModule,
    customersModule,
    leadsModule,
    handoffModule,
  ]

  const modulesToBoot = liveDb
    ? rawModules
    : (() => {
        const mocks = buildMockToolHandlers()
        return rawModules.map((m) => wrapModuleWithMocks(m, mocks))
      })()

  bootModuleList(modulesToBoot)
  await discoverPlaybooks(join(process.cwd(), 'modules'))

  const outcomes: ScenarioOutcome[] = []
  for (const scenario of EVAL_SCENARIOS) {
    const outcome = await evaluateScenario(scenario)
    outcomes.push(outcome)
  }

  console.log('\nID | Status | Lang | Tools Called                       | Scenario')
  console.log('---+--------+------+------------------------------------+-----------------------------------------')
  for (const o of outcomes) {
    const status = o.passed ? 'PASS  ' : 'FAIL  '
    const idStr = String(o.id).padStart(2, ' ')
    const toolsStr = (o.toolsCalled.join(', ') || '-').slice(0, 34).padEnd(34, ' ')
    console.log(`${idStr} | ${status} | ${o.language.padEnd(4, ' ')} | ${toolsStr} | ${o.name}`)
    if (!o.passed) {
      for (const f of o.failures) {
        console.log(`   └─ ❌ ${f}`)
      }
    }
  }

  const passedCount = outcomes.filter((o) => o.passed).length
  const totalCount = outcomes.length
  const passRate = (passedCount / totalCount) * 100

  console.log('\n====================================')
  console.log(`${passedCount}/${totalCount} PASSED (${passRate.toFixed(1)}%)`)
  console.log('====================================\n')

  if (passRate < 95) {
    process.exitCode = 1
  }
}

main()
  .catch((err) => {
    console.error('❌ Eval runner crashed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDb().catch(() => undefined)
  })
