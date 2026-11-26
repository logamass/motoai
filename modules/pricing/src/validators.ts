export interface PriceRowInput {
  variantId?: string
  suffix?: string | null
  exShowroom: number
  tcs?: number
  taxReg?: number
  insurance1p3?: number
  insurance3p3?: number
  ew?: number
  servicePack?: number
  accessories?: number
  ceramic?: number
  underbody?: number
  onroad1p3: number
  onroad3p3: number
  extras?: Record<string, number> | null
}

export interface PriceRowValidationResult {
  valid: boolean
  errors: string[]
  computedOnroad1p3: number
  computedOnroad3p3: number
}

export interface PriceFieldChange {
  field: string
  oldValue: number
  newValue: number
  delta: number
}

export type PriceDiffStatus = 'added' | 'removed' | 'changed' | 'unchanged'

export interface PriceRowDiff {
  key: string
  variantId?: string
  suffix?: string | null
  status: PriceDiffStatus
  changes: PriceFieldChange[]
  oldRow?: PriceRowInput
  newRow?: PriceRowInput
}

const TCS_THRESHOLD = 1_000_000
const SUFFIX_REGEX = /^[A-Z0-9]{4,6}$/

const COMPARED_NUMERIC_FIELDS: Array<keyof PriceRowInput> = [
  'exShowroom',
  'tcs',
  'taxReg',
  'insurance1p3',
  'insurance3p3',
  'ew',
  'servicePack',
  'accessories',
  'ceramic',
  'underbody',
  'onroad1p3',
  'onroad3p3',
]

function num(value: number | undefined | null): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function sumExtras(extras: Record<string, number> | null | undefined): number {
  if (!extras) return 0
  return Object.values(extras).reduce(
    (acc, val) => acc + (typeof val === 'number' && Number.isFinite(val) ? val : 0),
    0
  )
}

/**
 * Validate arithmetic integrity of a single dealer price row.
 *
 * Rules:
 * - TCS = 1% of exShowroom when exShowroom >= 10,00,000 (±1 rounding); else 0.
 * - Base + insurance1p3 === onroad1p3.
 * - Base + insurance3p3 === onroad3p3.
 * - Optional suffix must match ^[A-Z0-9]{4,6}$.
 */
export function validatePriceRow(row: PriceRowInput): PriceRowValidationResult {
  const errors: string[] = []

  const exShowroom = num(row.exShowroom)
  const tcs = num(row.tcs)
  const taxReg = num(row.taxReg)
  const insurance1p3 = num(row.insurance1p3)
  const insurance3p3 = num(row.insurance3p3)
  const ew = num(row.ew)
  const servicePack = num(row.servicePack)
  const accessories = num(row.accessories)
  const ceramic = num(row.ceramic)
  const underbody = num(row.underbody)
  const extrasTotal = sumExtras(row.extras)

  if (exShowroom <= 0) {
    errors.push(`exShowroom must be greater than 0 (got ${exShowroom})`)
  }

  if (exShowroom >= TCS_THRESHOLD) {
    const expectedTcs = Math.round(exShowroom * 0.01)
    if (Math.abs(tcs - expectedTcs) > 1) {
      errors.push(
        `TCS mismatch: expected ~${expectedTcs} (1% of ${exShowroom}, ±1), got ${tcs}`
      )
    }
  } else if (tcs !== 0) {
    errors.push(
      `TCS must be 0 when exShowroom (${exShowroom}) is below ${TCS_THRESHOLD}, got ${tcs}`
    )
  }

  const commonTotal =
    exShowroom +
    tcs +
    taxReg +
    ew +
    servicePack +
    accessories +
    ceramic +
    underbody +
    extrasTotal

  const computedOnroad1p3 = commonTotal + insurance1p3
  const computedOnroad3p3 = commonTotal + insurance3p3

  if (computedOnroad1p3 !== row.onroad1p3) {
    errors.push(
      `onroad1p3 mismatch: computed ${computedOnroad1p3}, got ${row.onroad1p3}`
    )
  }

  if (computedOnroad3p3 !== row.onroad3p3) {
    errors.push(
      `onroad3p3 mismatch: computed ${computedOnroad3p3}, got ${row.onroad3p3}`
    )
  }

  if (row.suffix !== undefined && row.suffix !== null && row.suffix !== '') {
    if (!SUFFIX_REGEX.test(row.suffix)) {
      errors.push(
        `Invalid suffix "${row.suffix}": must match ${SUFFIX_REGEX.source}`
      )
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    computedOnroad1p3,
    computedOnroad3p3,
  }
}

function getRowKey(row: PriceRowInput, index: number): string {
  if (row.variantId) return row.variantId
  if (row.suffix) return `suffix:${row.suffix}`
  return `index:${index}`
}

/**
 * Compute per-variant price diffs between an old and new price list for Admin review.
 */
export function diffPriceRows(
  oldRows: PriceRowInput[],
  newRows: PriceRowInput[]
): PriceRowDiff[] {
  const oldMap = new Map<string, PriceRowInput>()
  const newMap = new Map<string, PriceRowInput>()

  oldRows.forEach((row, idx) => oldMap.set(getRowKey(row, idx), row))
  newRows.forEach((row, idx) => newMap.set(getRowKey(row, idx), row))

  const allKeys = new Set([...oldMap.keys(), ...newMap.keys()])
  const diffs: PriceRowDiff[] = []

  for (const key of allKeys) {
    const oldRow = oldMap.get(key)
    const newRow = newMap.get(key)

    if (!oldRow && newRow) {
      diffs.push({
        key,
        variantId: newRow.variantId,
        suffix: newRow.suffix,
        status: 'added',
        changes: [],
        newRow,
      })
      continue
    }

    if (oldRow && !newRow) {
      diffs.push({
        key,
        variantId: oldRow.variantId,
        suffix: oldRow.suffix,
        status: 'removed',
        changes: [],
        oldRow,
      })
      continue
    }

    if (oldRow && newRow) {
      const changes: PriceFieldChange[] = []
      for (const field of COMPARED_NUMERIC_FIELDS) {
        const oldVal = num(oldRow[field] as number | undefined)
        const newVal = num(newRow[field] as number | undefined)
        if (oldVal !== newVal) {
          changes.push({
            field,
            oldValue: oldVal,
            newValue: newVal,
            delta: newVal - oldVal,
          })
        }
      }

      diffs.push({
        key,
        variantId: newRow.variantId ?? oldRow.variantId,
        suffix: newRow.suffix ?? oldRow.suffix,
        status: changes.length > 0 ? 'changed' : 'unchanged',
        changes,
        oldRow,
        newRow,
      })
    }
  }

  return diffs
}
