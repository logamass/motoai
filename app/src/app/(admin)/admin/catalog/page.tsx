'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

interface CatalogSummaryRow {
  variantId: string
  brandName: string
  modelName: string
  variantName: string
  suffix: string | null
  fuel: string
  transmission: string
  exShowroom: number | null
  onroad1p3: number | null
  onroad3p3: number | null
  effectiveDate: string | null
  dealerName: string | null
  specsVerified: boolean
}

function formatInr(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return `₹${new Intl.NumberFormat('en-IN').format(value)}`
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeFlatRow(raw: Record<string, unknown>, idx: number): CatalogSummaryRow {
  const brandObj = (raw.brand ?? {}) as Record<string, unknown>
  const modelObj = (raw.model ?? {}) as Record<string, unknown>
  const variantObj = (raw.variant ?? {}) as Record<string, unknown>
  const priceObj = (raw.price ?? raw.priceRow ?? {}) as Record<string, unknown>
  const priceListObj = (raw.priceList ?? {}) as Record<string, unknown>
  const dealerObj = (raw.dealer ?? {}) as Record<string, unknown>
  const specsObj = (raw.specs ?? {}) as Record<string, unknown>

  const variantId =
    asString(raw.variantId) ||
    asString(variantObj.id) ||
    asString(raw.id) ||
    `row-${idx}`

  const brandName =
    asString(raw.brandName) ||
    asString(brandObj.name) ||
    asString(raw.brand) ||
    'Unknown Brand'

  const modelName =
    asString(raw.modelName) ||
    asString(modelObj.name) ||
    asString(raw.model) ||
    'Unknown Model'

  const variantName =
    asString(raw.variantName) ||
    asString(variantObj.name) ||
    asString(raw.variant) ||
    asString(raw.name) ||
    'Variant'

  const suffix =
    asNullableString(raw.suffix) ?? asNullableString(variantObj.suffix)

  const fuel =
    asString(raw.fuel) || asString(variantObj.fuel) || '—'

  const transmission =
    asString(raw.transmission) || asString(variantObj.transmission) || '—'

  const exShowroom =
    asNullableNumber(raw.exShowroom) ?? asNullableNumber(priceObj.exShowroom)

  const onroad1p3 =
    asNullableNumber(raw.onroad1p3) ?? asNullableNumber(priceObj.onroad1p3)

  const onroad3p3 =
    asNullableNumber(raw.onroad3p3) ?? asNullableNumber(priceObj.onroad3p3)

  const effectiveDate =
    asNullableString(raw.effectiveDate) ??
    asNullableString(priceObj.effectiveDate) ??
    asNullableString(priceListObj.effectiveDate)

  const priceDealerObj = (priceObj.dealer ?? {}) as Record<string, unknown>
  const dealerName =
    asNullableString(raw.dealerName) ??
    asNullableString(dealerObj.name) ??
    asNullableString(priceDealerObj.name)

  const specsVerified =
    typeof raw.specsVerified === 'boolean'
      ? raw.specsVerified
      : typeof raw.verified === 'boolean'
        ? raw.verified
        : typeof specsObj.verified === 'boolean'
          ? specsObj.verified
          : false

  return {
    variantId,
    brandName,
    modelName,
    variantName,
    suffix,
    fuel,
    transmission,
    exShowroom,
    onroad1p3,
    onroad3p3,
    effectiveDate,
    dealerName,
    specsVerified,
  }
}

function normalizeCatalogPayload(payload: unknown): CatalogSummaryRow[] {
  const data = (payload ?? {}) as Record<string, unknown>

  const directList =
    (Array.isArray(data.items) && data.items) ||
    (Array.isArray(data.rows) && data.rows) ||
    (Array.isArray(data.variants) && data.variants) ||
    (Array.isArray(data.catalog) && data.catalog) ||
    (Array.isArray(data.summary) && data.summary) ||
    (Array.isArray(payload) && payload)

  if (directList) {
    return directList.map((item, idx) =>
      normalizeFlatRow((item ?? {}) as Record<string, unknown>, idx)
    )
  }

  // Handle nested { models: [{ name, brandName, variants: [...] }] }
  if (Array.isArray(data.models)) {
    const flattened: CatalogSummaryRow[] = []
    for (const modelEntry of data.models) {
      const m = (modelEntry ?? {}) as Record<string, unknown>
      const mVariants = Array.isArray(m.variants) ? m.variants : []
      mVariants.forEach((v, idx) => {
        const vObj = (v ?? {}) as Record<string, unknown>
        flattened.push(
          normalizeFlatRow(
            {
              brand: m.brand,
              brandName: m.brandName ?? (m.brand as { name?: string } | undefined)?.name,
              model: m,
              modelName: m.name ?? m.modelName,
              ...vObj,
            },
            flattened.length + idx
          )
        )
      })
    }
    return flattened
  }

  return []
}

export default function AdminCatalogPage() {
  const [rows, setRows] = useState<CatalogSummaryRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [fuelFilter, setFuelFilter] = useState('ALL')
  const [isFetchingPhotos, setIsFetchingPhotos] = useState(false)
  const [photoStatus, setPhotoStatus] = useState<string | null>(null)

  const handleAutoFetchPhotos = async () => {
    setIsFetchingPhotos(true)
    setPhotoStatus(null)
    try {
      const res = await fetch('/api/modules/catalog/media/auto-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoApprove: true }),
      })
      const data = (await res.json()) as { fetchedCount?: number; error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setPhotoStatus(`✓ Auto-fetched ${data.fetchedCount ?? 0} CC-licensed photo(s) from Wikimedia Commons!`)
    } catch (err) {
      setPhotoStatus(
        err instanceof Error ? `Photo fetch failed: ${err.message}` : 'Photo fetch failed'
      )
    } finally {
      setIsFetchingPhotos(false)
    }
  }

  const loadCatalog = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const res = await fetch('/api/modules/pricing/catalog-summary')
      if (!res.ok) {
        throw new Error(`Catalog summary endpoint returned ${res.status}`)
      }
      const data = (await res.json()) as unknown
      setRows(normalizeCatalogPayload(data))
    } catch (err) {
      setRows([])
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to load catalog summary'
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  const fuelOptions = useMemo(() => {
    const set = new Set<string>()
    for (const row of rows) {
      if (row.fuel && row.fuel !== '—') {
        set.add(row.fuel)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows])

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return rows.filter((row) => {
      if (fuelFilter !== 'ALL' && row.fuel.toLowerCase() !== fuelFilter.toLowerCase()) {
        return false
      }
      if (!q) return true
      return (
        row.modelName.toLowerCase().includes(q) ||
        row.brandName.toLowerCase().includes(q) ||
        row.variantName.toLowerCase().includes(q) ||
        row.fuel.toLowerCase().includes(q) ||
        (row.suffix?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [rows, searchQuery, fuelFilter])

  const stats = useMemo(() => {
    const uniqueBrands = new Set(rows.map((r) => r.brandName))
    const uniqueModels = new Set(rows.map((r) => `${r.brandName}:${r.modelName}`))
    const unverifiedCount = rows.filter((r) => !r.specsVerified).length
    const pricedCount = rows.filter((r) => r.onroad1p3 !== null).length
    return {
      brands: uniqueBrands.size,
      models: uniqueModels.size,
      variants: rows.length,
      pricedCount,
      unverifiedCount,
    }
  }, [rows])

  return (
    <div className="moto-container moto-section">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div>
          <span className="moto-pill" style={{ marginBottom: 10 }}>
            Live Catalog &amp; Published Pricing
          </span>
          <h1 style={{ margin: '6px 0 6px', fontSize: '1.75rem' }}>
            Vehicle Catalog &amp; On-Road Price Matrix
          </h1>
          <p style={{ margin: 0, color: 'var(--moto-ink-muted)' }}>
            Inspect all registered brands, models, variants, published 1+3 &amp; 3+3 on-road
            pricing, and spec verification status.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => void handleAutoFetchPhotos()}
            disabled={isFetchingPhotos}
            className="moto-btn-secondary"
          >
            {isFetchingPhotos ? 'Fetching CC Photos…' : '✨ Auto-Fetch CC Photos (Wikimedia)'}
          </button>
          <Link href="/admin/upload" className="moto-btn-primary">
            Upload Price List
          </Link>
        </div>
      </div>

      {photoStatus && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 10,
            background: photoStatus.startsWith('✓') ? '#dcfce7' : '#fee2e2',
            color: photoStatus.startsWith('✓') ? '#166534' : '#991b1b',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {photoStatus}
        </div>
      )}

      {/* Summary Stats */}
      <div className="moto-grid" style={{ marginBottom: 22 }}>
        <div className="moto-card">
          <div className="moto-stat">{stats.brands}</div>
          <h3>Brands</h3>
          <p>Active OEMs in catalog</p>
        </div>
        <div className="moto-card">
          <div className="moto-stat">{stats.models}</div>
          <h3>Models</h3>
          <p>Showroom vehicle lines</p>
        </div>
        <div className="moto-card">
          <div className="moto-stat">{stats.variants}</div>
          <h3>Variants ({stats.pricedCount} Priced)</h3>
          <p>Published dealer on-road rows</p>
        </div>
        <div className="moto-card">
          <div
            className="moto-stat"
            style={{ color: stats.unverifiedCount > 0 ? '#b45309' : 'var(--moto-teal)' }}
          >
            {stats.unverifiedCount}
          </div>
          <h3>Unverified Specs</h3>
          <p>Variants pending brochure verification</p>
        </div>
      </div>

      {/* Filter Bar */}
      <section className="moto-card" style={{ marginBottom: 20 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by model, variant, suffix, or fuel…"
            aria-label="Search catalog by model or fuel"
            style={{
              flex: '1 1 260px',
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid var(--moto-border)',
              fontSize: '0.92rem',
              color: 'var(--moto-ink)',
            }}
          />

          <select
            value={fuelFilter}
            onChange={(e) => setFuelFilter(e.target.value)}
            aria-label="Filter by fuel type"
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid var(--moto-border)',
              background: '#ffffff',
              fontSize: '0.92rem',
              color: 'var(--moto-ink)',
            }}
          >
            <option value="ALL">All Fuel Types</option>
            {fuelOptions.map((fuel) => (
              <option key={fuel} value={fuel}>
                {fuel}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="moto-btn-secondary"
            onClick={() => void loadCatalog()}
            disabled={isLoading}
          >
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </section>

      {/* Catalog Table / Empty Fallback */}
      <section className="moto-card">
        {isLoading ? (
          <p style={{ padding: '18px 0', textAlign: 'center' }}>
            Loading live catalog &amp; published dealer pricing…
          </p>
        ) : errorMessage ? (
          <div style={{ padding: '16px 4px' }}>
            <div
              style={{
                background: 'var(--moto-amber-soft)',
                border: '1px solid rgba(242, 165, 22, 0.45)',
                borderRadius: 12,
                padding: '14px 16px',
                color: '#8a5700',
                fontWeight: 600,
              }}
            >
              Catalog data is currently unavailable ({errorMessage}). Ensure PostgreSQL is
              running and migrations/seeds have been applied.
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '24px 12px', textAlign: 'center' }}>
            <h2 style={{ marginBottom: 8 }}>No Catalog Rows Published Yet</h2>
            <p style={{ marginBottom: 16 }}>
              The catalog or published dealer price list is currently empty. Seed the database
              or publish a price list from the Admin Upload screen.
            </p>
            <Link href="/admin/upload" className="moto-btn-primary">
              Go to Price List Upload
            </Link>
          </div>
        ) : (
          <div className="moto-table-wrap">
            <table className="moto-table">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Model</th>
                  <th>Variant</th>
                  <th>Suffix</th>
                  <th>Fuel / Trans</th>
                  <th>Ex-Showroom</th>
                  <th>On-Road (1+3)</th>
                  <th>On-Road (3+3)</th>
                  <th>Effective Date</th>
                  <th>Specs</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', color: 'var(--moto-ink-muted)' }}>
                      No variants match &ldquo;{searchQuery || fuelFilter}&rdquo;.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={`${row.variantId}-${row.effectiveDate ?? 'none'}`}>
                      <td style={{ fontWeight: 600 }}>{row.brandName}</td>
                      <td style={{ fontWeight: 700, color: 'var(--moto-ink)' }}>
                        {row.modelName}
                      </td>
                      <td>{row.variantName}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.84rem' }}>
                        {row.suffix ?? '—'}
                      </td>
                      <td>
                        <span className="moto-badge">
                          {row.fuel} · {row.transmission}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatInr(row.exShowroom)}</td>
                      <td style={{ whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--moto-teal)' }}>
                        {formatInr(row.onroad1p3)}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                        {formatInr(row.onroad3p3)}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.84rem', color: 'var(--moto-ink-muted)' }}>
                        {row.effectiveDate ?? '—'}
                      </td>
                      <td>
                        {row.specsVerified ? (
                          <span className="moto-badge moto-badge-on">Verified</span>
                        ) : (
                          <span
                            className="moto-badge"
                            style={{
                              background: 'var(--moto-amber-soft)',
                              color: '#8a5700',
                              border: '1px solid rgba(242, 165, 22, 0.45)',
                            }}
                          >
                            Unverified Specs
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
