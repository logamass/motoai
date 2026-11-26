'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ChatWidget } from '@/components/chat-widget/ChatWidget'

interface CompareStoredItem {
  brandSlug: string
  modelSlug: string
  variantId: string
}

interface CatalogSummaryVariant {
  id: string
  slug: string
  name: string
  suffix: string | null
  fuel: string
  transmission: 'MT' | 'AT'
  specs: {
    engine: string | null
    power: string | null
    mileage: string | null
    safetyRating: string | null
    airbags: number | null
    verified: boolean
  } | null
  price: {
    effectiveDate: string
    dealer: {
      name: string
      city: string
    }
    exShowroom: number
    onroad1p3: number
    onroad3p3: number
  } | null
}

interface CatalogSummaryModel {
  id: string
  slug: string
  name: string
  bodyType: string
  seatsMin: number
  seatsMax: number
  seatsLabel: string | null
  brand: {
    id: string
    slug: string
    name: string
  }
  variants: CatalogSummaryVariant[]
}

interface FlattenedVariantOption {
  variantId: string
  brandSlug: string
  brandName: string
  modelSlug: string
  modelName: string
  seatsDisplay: string
  variantSlug: string
  variantName: string
  suffix: string | null
  fuel: string
  transmission: 'MT' | 'AT'
  exShowroom: number | null
  onroad1p3: number | null
  onroad3p3: number | null
  engine: string | null
  mileage: string | null
  airbags: number | null
  specsVerified: boolean
  dealerName: string | null
  effectiveDate: string | null
}

const COMPARE_STORAGE_KEY = 'motoai.compare'
const MAX_COMPARE = 3

function formatInr(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return `₹${new Intl.NumberFormat('en-IN').format(value)}`
}

function readStoredCompare(): CompareStoredItem[] {
  try {
    const raw = window.localStorage.getItem(COMPARE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is CompareStoredItem =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as CompareStoredItem).variantId === 'string'
      )
      .slice(0, MAX_COMPARE)
  } catch {
    return []
  }
}

function writeStoredCompare(items: CompareStoredItem[]): void {
  try {
    window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Ignore storage error
  }
}

export default function ComparePage() {
  const [options, setOptions] = useState<FlattenedVariantOption[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const stored = readStoredCompare()
    const storedIds = stored.map((s) => s.variantId)

    let cancelled = false

    async function loadCatalog() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/modules/pricing/catalog-summary', {
          cache: 'no-store',
        })
        if (!res.ok) {
          throw new Error(`Catalog summary failed (${res.status})`)
        }

        const data = (await res.json()) as { models?: CatalogSummaryModel[] }
        const flattened: FlattenedVariantOption[] = []

        for (const m of data.models ?? []) {
          const seatsDisplay =
            m.seatsLabel?.trim() ||
            (m.seatsMin === m.seatsMax
              ? `${m.seatsMin} Seater`
              : `${m.seatsMin}–${m.seatsMax} Seater`)

          for (const v of m.variants ?? []) {
            flattened.push({
              variantId: v.id,
              brandSlug: m.brand.slug,
              brandName: m.brand.name,
              modelSlug: m.slug,
              modelName: m.name,
              seatsDisplay,
              variantSlug: v.slug,
              variantName: v.name,
              suffix: v.suffix,
              fuel: v.fuel,
              transmission: v.transmission,
              exShowroom: v.price?.exShowroom ?? null,
              onroad1p3: v.price?.onroad1p3 ?? null,
              onroad3p3: v.price?.onroad3p3 ?? null,
              engine: v.specs?.engine ?? null,
              mileage: v.specs?.mileage ?? null,
              airbags: v.specs?.airbags ?? null,
              specsVerified: v.specs?.verified ?? false,
              dealerName: v.price?.dealer.name ?? null,
              effectiveDate: v.price?.effectiveDate ?? null,
            })
          }
        }

        if (cancelled) return
        setOptions(flattened)

        const validIdSet = new Set(flattened.map((o) => o.variantId))
        const validStored = storedIds.filter((id) => validIdSet.has(id))
        setSelectedIds(validStored)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load catalog variants')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadCatalog()
    return () => {
      cancelled = true
    }
  }, [])

  const optionById = useMemo(
    () => new Map(options.map((o) => [o.variantId, o])),
    [options]
  )

  const selectedVariants = useMemo(
    () =>
      selectedIds
        .map((id) => optionById.get(id))
        .filter((v): v is FlattenedVariantOption => Boolean(v)),
    [selectedIds, optionById]
  )

  const lowestOnroad1p3 = useMemo(() => {
    const prices = selectedVariants
      .map((v) => v.onroad1p3)
      .filter((p): p is number => typeof p === 'number' && p > 0)
    return prices.length > 0 ? Math.min(...prices) : null
  }, [selectedVariants])

  function syncSelection(nextIds: string[]) {
    const deduped = Array.from(new Set(nextIds.filter(Boolean))).slice(0, MAX_COMPARE)
    setSelectedIds(deduped)
    const toStore: CompareStoredItem[] = deduped
      .map((id) => optionById.get(id))
      .filter((opt): opt is FlattenedVariantOption => Boolean(opt))
      .map((opt) => ({
        brandSlug: opt.brandSlug,
        modelSlug: opt.modelSlug,
        variantId: opt.variantId,
      }))
    writeStoredCompare(toStore)
  }

  function handleSlotChange(slotIndex: number, variantId: string) {
    const next = [...selectedIds]
    if (!variantId) {
      next.splice(slotIndex, 1)
    } else {
      next[slotIndex] = variantId
    }
    syncSelection(next)
  }

  function handleQuickPrefill() {
    // Pick up to 3 distinct models if available
    const picks: string[] = []
    const seenModels = new Set<string>()
    for (const opt of options) {
      if (opt.onroad1p3 === null) continue
      if (!seenModels.has(opt.modelSlug)) {
        seenModels.add(opt.modelSlug)
        picks.push(opt.variantId)
      }
      if (picks.length === 3) break
    }
    if (picks.length < 2) {
      for (const opt of options) {
        if (!picks.includes(opt.variantId)) picks.push(opt.variantId)
        if (picks.length === 3) break
      }
    }
    syncSelection(picks)
  }

  const slotCount = 3

  return (
    <>
      <div className="moto-container moto-section">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div>
            <span className="moto-pill" style={{ marginBottom: 8 }}>
              Side-by-Side Comparison · Live Dealer Prices
            </span>
            <h1 style={{ margin: '6px 0 4px', fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>
              Compare Variants
            </h1>
            <p style={{ margin: 0, color: 'var(--moto-ink-muted)', fontSize: '0.94rem' }}>
              Compare up to 3 vehicles across exact ex-showroom, 1+3 &amp; 3+3 on-road
              prices, powertrain, seating, mileage, and airbags.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {options.length >= 2 && (
              <button
                type="button"
                onClick={handleQuickPrefill}
                className="moto-btn-secondary"
                style={{ cursor: 'pointer' }}
              >
                Auto-Pick 3 Models
              </button>
            )}
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => syncSelection([])}
                className="moto-btn-secondary"
                style={{ cursor: 'pointer' }}
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Variant Pickers */}
        <section className="moto-card" style={{ marginBottom: 22 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 14,
            }}
          >
            {Array.from({ length: slotCount }).map((_, idx) => {
              const currentId = selectedIds[idx] ?? ''
              return (
                <div key={idx}>
                  <label
                    htmlFor={`compare-slot-${idx}`}
                    style={{
                      display: 'block',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'var(--moto-ink-muted)',
                      marginBottom: 6,
                    }}
                  >
                    Car {idx + 1}
                  </label>
                  <select
                    id={`compare-slot-${idx}`}
                    value={currentId}
                    disabled={loading || options.length === 0}
                    onChange={(e) => handleSlotChange(idx, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--moto-border)',
                      background: '#ffffff',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      color: 'var(--moto-ink)',
                    }}
                  >
                    <option value="">
                      {loading ? 'Loading variants…' : 'Select a variant…'}
                    </option>
                    {options.map((opt) => (
                      <option key={opt.variantId} value={opt.variantId}>
                        {opt.brandName} {opt.modelName} — {opt.variantName} ({opt.fuel} ·{' '}
                        {opt.transmission})
                        {opt.onroad1p3 ? ` · ${formatInr(opt.onroad1p3)}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>

          {error && (
            <p style={{ marginTop: 12, color: '#b91c1c', fontWeight: 600 }}>{error}</p>
          )}
        </section>

        {/* Comparison Table */}
        {selectedVariants.length === 0 ? (
          <div className="moto-card" style={{ textAlign: 'center', padding: '36px 20px' }}>
            <h2 style={{ margin: '0 0 8px' }}>No cars selected for comparison yet</h2>
            <p style={{ margin: '0 auto 18px', maxWidth: 500 }}>
              Choose 2 or 3 variants from the dropdowns above, click Auto-Pick 3 Models, or
              tap <strong>+ Compare</strong> on any car detail page.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
              {options.length >= 2 && (
                <button
                  type="button"
                  onClick={handleQuickPrefill}
                  className="moto-btn-primary"
                >
                  Compare Top 3 Models
                </button>
              )}
              <Link href="/" className="moto-btn-secondary">
                Browse Live Showroom Cars
              </Link>
            </div>
          </div>
        ) : (
          <section className="moto-card">
            <div className="moto-table-wrap">
              <table className="moto-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 160 }}>Specification / Price</th>
                    {selectedVariants.map((car, idx) => (
                      <th key={car.variantId} style={{ minWidth: 210 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: 8,
                            textTransform: 'none',
                            letterSpacing: 'normal',
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: '0.74rem',
                                color: 'var(--moto-teal)',
                                textTransform: 'uppercase',
                                fontWeight: 700,
                              }}
                            >
                              {car.brandName}
                            </div>
                            <Link
                              href={`/cars/${car.brandSlug}/${car.modelSlug}?variant=${encodeURIComponent(car.variantSlug)}`}
                              style={{
                                fontSize: '1rem',
                                fontWeight: 800,
                                color: 'var(--moto-ink)',
                              }}
                            >
                              {car.modelName} {car.variantName}
                            </Link>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSlotChange(idx, '')}
                            aria-label={`Remove ${car.modelName} ${car.variantName}`}
                            style={{
                              background: '#f1f4f8',
                              border: 'none',
                              borderRadius: 6,
                              padding: '3px 8px',
                              fontSize: '0.78rem',
                              cursor: 'pointer',
                              color: 'var(--moto-ink-muted)',
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 700 }}>Ex-Showroom</td>
                    {selectedVariants.map((car) => (
                      <td key={car.variantId} style={{ fontWeight: 600 }}>
                        {formatInr(car.exShowroom)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 700 }}>On-Road (1+3 Year)</td>
                    {selectedVariants.map((car) => {
                      const isLowest =
                        lowestOnroad1p3 !== null &&
                        car.onroad1p3 !== null &&
                        car.onroad1p3 === lowestOnroad1p3 &&
                        selectedVariants.filter((v) => v.onroad1p3 !== null).length > 1
                      return (
                        <td
                          key={car.variantId}
                          style={{
                            fontWeight: 800,
                            fontSize: '1rem',
                            background: isLowest ? '#e5f6ec' : undefined,
                            color: isLowest ? '#166534' : 'var(--moto-ink)',
                          }}
                        >
                          {formatInr(car.onroad1p3)}
                          {isLowest && (
                            <span
                              style={{
                                display: 'inline-block',
                                marginLeft: 8,
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '2px 7px',
                                borderRadius: 999,
                                background: '#166534',
                                color: '#ffffff',
                              }}
                            >
                              Lowest Price
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 700 }}>On-Road (3+3 Year)</td>
                    {selectedVariants.map((car) => (
                      <td key={car.variantId} style={{ fontWeight: 700 }}>
                        {formatInr(car.onroad3p3)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 700 }}>Fuel / Transmission</td>
                    {selectedVariants.map((car) => (
                      <td key={car.variantId}>
                        {car.fuel} · {car.transmission}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 700 }}>Seats</td>
                    {selectedVariants.map((car) => (
                      <td key={car.variantId}>{car.seatsDisplay}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 700 }}>Engine</td>
                    {selectedVariants.map((car) => (
                      <td key={car.variantId}>{car.engine ?? '—'}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 700 }}>Mileage</td>
                    {selectedVariants.map((car) => (
                      <td key={car.variantId}>{car.mileage ?? '—'}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 700 }}>Airbags</td>
                    {selectedVariants.map((car) => (
                      <td key={car.variantId}>
                        {car.airbags !== null ? `${car.airbags} Airbags` : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 700 }}>Full Breakup &amp; EMI</td>
                    {selectedVariants.map((car) => (
                      <td key={car.variantId}>
                        <Link
                          href={`/cars/${car.brandSlug}/${car.modelSlug}`}
                          style={{
                            color: 'var(--moto-teal)',
                            fontWeight: 700,
                            fontSize: '0.86rem',
                          }}
                        >
                          View Details →
                        </Link>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <div
              style={{
                marginTop: 14,
                fontSize: '0.8rem',
                color: 'var(--moto-ink-muted)',
              }}
            >
              Price prevailing at delivery applies. Always pay only at the showroom.
            </div>
          </section>
        )}
      </div>

      <ChatWidget />
    </>
  )
}
