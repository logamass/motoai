'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'

interface DealerOption {
  id: string
  name: string
  slug: string
  city: string
  rtoJurisdiction?: string | null
}

interface PriceRowData {
  variantId?: string
  variantName?: string
  modelName?: string
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

interface PriceFieldChange {
  field: string
  oldValue: number
  newValue: number
  delta: number
}

type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged'

interface PreviewRow {
  rowIndex: number
  raw: PriceRowData
  valid: boolean
  errors: string[]
  computedOnroad1p3?: number
  computedOnroad3p3?: number
  diffStatus?: DiffStatus
  changes: PriceFieldChange[]
}

interface PreviewResult {
  jobId: string
  status: string
  rowCount: number
  failedRowCount: number
  rows: PreviewRow[]
}

interface UploadJobSummary {
  id: string
  dealerId: string
  fileName: string
  status: string
  rowCount: number
  failedRowCount: number
  errorText?: string | null
  createdAt: string
}

interface PublishSuccessInfo {
  version: number | null
  priceListId?: string
  effectiveDate: string
  fileName: string
}

const DEMO_ROW_VALID_CHANGED: PriceRowData = {
  suffix: 'HYREMT',
  variantName: 'Urban Cruiser Hyryder E MT',
  exShowroom: 1_134_000,
  tcs: 11_340,
  taxReg: 245_000,
  insurance1p3: 56_598,
  insurance3p3: 78_598,
  ew: 25_000,
  servicePack: 15_000,
  accessories: 40_000,
  ceramic: 0,
  underbody: 0,
  onroad1p3: 1_526_938,
  onroad3p3: 1_548_938,
}

const DEMO_ROW_SECOND_VALID: PriceRowData = {
  suffix: 'HYRVAT',
  variantName: 'Urban Cruiser Hyryder V Hybrid e-CVT',
  exShowroom: 1_999_000,
  tcs: 19_990,
  taxReg: 372_000,
  insurance1p3: 84_600,
  insurance3p3: 118_400,
  ew: 30_000,
  servicePack: 18_000,
  accessories: 45_000,
  ceramic: 0,
  underbody: 0,
  onroad1p3: 2_568_590,
  onroad3p3: 2_602_390,
}

const DEMO_ROW_SECOND_INVALID: PriceRowData = {
  ...DEMO_ROW_SECOND_VALID,
  tcs: 5_000, // Intentional 1% TCS mismatch (expected 19,990)
  onroad1p3: 2_699_999, // Intentional sum mismatch
}

function formatInr(value: number | undefined | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return `₹${new Intl.NumberFormat('en-IN').format(value)}`
}

function formatDeltaInr(delta: number): string {
  const formatted = new Intl.NumberFormat('en-IN').format(Math.abs(delta))
  return delta >= 0 ? `+₹${formatted}` : `-₹${formatted}`
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function encodeUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

interface RawApiDiff {
  key?: string
  variantId?: string
  suffix?: string | null
  status?: DiffStatus
  changes?: PriceFieldChange[]
}

interface RawApiRow {
  rowIndex?: number
  raw?: PriceRowData
  validation?: {
    valid?: boolean
    errors?: string[]
    computedOnroad1p3?: number
    computedOnroad3p3?: number
  }
  valid?: boolean
  errors?: string[]
  computedOnroad1p3?: number
  computedOnroad3p3?: number
  diffStatus?: DiffStatus
  diff?: RawApiDiff
  changes?: PriceFieldChange[]
}

function normalizePreviewResponse(payload: unknown): PreviewResult {
  const data = (payload ?? {}) as Record<string, unknown>
  const job = (data.job ?? {}) as Record<string, unknown>
  const preview = (data.preview ?? {}) as Record<string, unknown>

  const jobId =
    (typeof data.jobId === 'string' && data.jobId) ||
    (typeof job.id === 'string' && job.id) ||
    (typeof data.id === 'string' && data.id) ||
    ''

  const status =
    (typeof data.status === 'string' && data.status) ||
    (typeof job.status === 'string' && job.status) ||
    'review'

  const rawRows = (
    Array.isArray(data.rows)
      ? data.rows
      : Array.isArray(preview.rows)
        ? preview.rows
        : Array.isArray((job.extractedJson as { rows?: unknown[] } | undefined)?.rows)
          ? (job.extractedJson as { rows: unknown[] }).rows
          : []
  ) as RawApiRow[]

  const topDiffs = (
    Array.isArray(data.diff)
      ? data.diff
      : Array.isArray(data.diffs)
        ? data.diffs
        : Array.isArray(preview.diff)
          ? preview.diff
          : Array.isArray(preview.diffs)
            ? preview.diffs
            : []
  ) as RawApiDiff[]

  const diffByVariantOrSuffix = new Map<string, RawApiDiff>()
  for (const d of topDiffs) {
    if (d.status === 'removed') continue
    if (d.variantId) diffByVariantOrSuffix.set(`v:${d.variantId}`, d)
    if (d.suffix) diffByVariantOrSuffix.set(`s:${d.suffix.trim().toUpperCase()}`, d)
    if (d.key) diffByVariantOrSuffix.set(`k:${d.key}`, d)
  }

  const rows: PreviewRow[] = rawRows.map((entry, idx) => {
    const raw: PriceRowData = entry.raw
      ? entry.raw
      : (entry as unknown as PriceRowData)

    const valid =
      typeof entry.validation?.valid === 'boolean'
        ? entry.validation.valid
        : typeof entry.valid === 'boolean'
          ? entry.valid
          : true

    const errors = entry.validation?.errors ?? entry.errors ?? []
    const matchedDiff =
      entry.diff ??
      (raw.variantId ? diffByVariantOrSuffix.get(`v:${raw.variantId}`) : undefined) ??
      (raw.suffix
        ? diffByVariantOrSuffix.get(`s:${raw.suffix.trim().toUpperCase()}`)
        : undefined) ??
      diffByVariantOrSuffix.get(`k:index:${idx}`)

    const changes = entry.changes ?? matchedDiff?.changes ?? []
    const diffStatus = entry.diffStatus ?? matchedDiff?.status

    return {
      rowIndex: typeof entry.rowIndex === 'number' ? entry.rowIndex : idx,
      raw,
      valid,
      errors,
      computedOnroad1p3: entry.validation?.computedOnroad1p3 ?? entry.computedOnroad1p3,
      computedOnroad3p3: entry.validation?.computedOnroad3p3 ?? entry.computedOnroad3p3,
      diffStatus,
      changes,
    }
  })

  const rowCount =
    typeof data.rowCount === 'number'
      ? data.rowCount
      : typeof job.rowCount === 'number'
        ? job.rowCount
        : rows.length

  const failedRowCount =
    typeof data.failedRowCount === 'number'
      ? data.failedRowCount
      : typeof job.failedRowCount === 'number'
        ? job.failedRowCount
        : rows.filter((r) => !r.valid).length

  return {
    jobId,
    status,
    rowCount,
    failedRowCount,
    rows,
  }
}

function PriceDiffCell({
  value,
  field,
  changes,
}: {
  value: number | undefined
  field: string
  changes: PriceFieldChange[]
}) {
  const change = changes.find((c) => c.field === field)
  if (!change) {
    return <span>{formatInr(value)}</span>
  }

  const isIncrease = change.delta > 0

  return (
    <div
      style={{
        background: '#fef6e4',
        border: '1px solid rgba(242, 165, 22, 0.45)',
        borderRadius: 8,
        padding: '4px 8px',
        display: 'inline-flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <span style={{ fontWeight: 700, color: '#0f1b2d' }}>{formatInr(change.newValue)}</span>
      <span style={{ fontSize: '0.75rem', color: '#4b5b70', whiteSpace: 'nowrap' }}>
        {formatInr(change.oldValue)} → {formatInr(change.newValue)}
      </span>
      <span
        style={{
          fontSize: '0.74rem',
          fontWeight: 700,
          color: isIncrease ? '#b45309' : '#15803d',
        }}
      >
        {formatDeltaInr(change.delta)}
      </span>
    </div>
  )
}

export default function AdminUploadPage() {
  const [dealers, setDealers] = useState<DealerOption[]>([])
  const [jobs, setJobs] = useState<UploadJobSummary[]>([])
  const [dealersLoading, setDealersLoading] = useState(true)
  const [jobsLoading, setJobsLoading] = useState(true)

  const [dealerId, setDealerId] = useState('')
  const [fileName, setFileName] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(todayIsoDate)

  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null)
  const [uploadedJsonRows, setUploadedJsonRows] = useState<PriceRowData[] | null>(null)
  const [demoLoaded, setDemoLoaded] = useState(false)
  const [includeInvalidDemoRow, setIncludeInvalidDemoRow] = useState(true)

  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null)
  const [publishSuccess, setPublishSuccess] = useState<PublishSuccessInfo | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const dealerNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const d of dealers) {
      map.set(d.id, `${d.name} (${d.city})`)
    }
    return map
  }, [dealers])

  const activeRowsForPreview = useMemo(() => {
    if (demoLoaded) {
      return [
        DEMO_ROW_VALID_CHANGED,
        includeInvalidDemoRow ? DEMO_ROW_SECOND_INVALID : DEMO_ROW_SECOND_VALID,
      ]
    }
    return uploadedJsonRows
  }, [demoLoaded, includeInvalidDemoRow, uploadedJsonRows])

  const loadDealers = useCallback(async () => {
    setDealersLoading(true)
    try {
      const res = await fetch('/api/modules/pricing/dealers')
      if (!res.ok) throw new Error(`Failed to fetch dealers (${res.status})`)
      const data = (await res.json()) as { dealers?: DealerOption[] }
      const list = data.dealers ?? []
      setDealers(list)
      setDealerId((prev) => prev || list[0]?.id || '')
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to load dealers from API'
      )
    } finally {
      setDealersLoading(false)
    }
  }, [])

  const loadJobs = useCallback(async () => {
    setJobsLoading(true)
    try {
      const res = await fetch('/api/modules/ingestion/jobs')
      if (!res.ok) throw new Error(`Failed to fetch jobs (${res.status})`)
      const data = (await res.json()) as { jobs?: UploadJobSummary[] }
      setJobs(data.jobs ?? [])
    } catch {
      // Keep jobs empty gracefully if DB/API is unavailable
    } finally {
      setJobsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDealers()
    void loadJobs()
  }, [loadDealers, loadJobs])

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setErrorMessage(null)
    setPublishSuccess(null)
    setPreviewResult(null)
    setDemoLoaded(false)
    setFileName(file.name)

    if (file.name.toLowerCase().endsWith('.json') || file.type === 'application/json') {
      try {
        const text = await file.text()
        const parsed = JSON.parse(text) as PriceRowData[] | { rows?: PriceRowData[] }
        const rows = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.rows)
            ? parsed.rows
            : null

        if (!rows || rows.length === 0) {
          throw new Error('JSON file must be an array of price rows or { "rows": [...] }.')
        }
        setUploadedJsonRows(rows)
        setSelectedPdfFile(null)
      } catch (err) {
        setUploadedJsonRows(null)
        setSelectedPdfFile(null)
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to parse uploaded JSON file.'
        )
      }
      return
    }

    setUploadedJsonRows(null)
    setSelectedPdfFile(file)
  }

  function handleLoadDemo() {
    setErrorMessage(null)
    setPublishSuccess(null)
    setPreviewResult(null)
    setSelectedPdfFile(null)
    setUploadedJsonRows(null)
    setDemoLoaded(true)
    setIncludeInvalidDemoRow(true)
    setFileName('toyota-price-update-demo.json')
  }

  function handleToggleInvalidDemoRow(checked: boolean) {
    setIncludeInvalidDemoRow(checked)
    setPreviewResult(null)
    setPublishSuccess(null)
    setErrorMessage(null)
  }

  async function handleValidatePreview() {
    setErrorMessage(null)
    setPublishSuccess(null)

    if (!dealerId) {
      setErrorMessage('Please select a dealer before running validation.')
      return
    }
    if (!fileName.trim()) {
      setErrorMessage('Please provide a file name or load a file / sample update.')
      return
    }
    if (!selectedPdfFile && (!activeRowsForPreview || activeRowsForPreview.length === 0)) {
      setErrorMessage('Upload a .pdf / .json price list or click "Load Sample Price Update (Demo)".')
      return
    }

    setIsPreviewing(true)
    try {
      let res: Response
      if (selectedPdfFile) {
        const formData = new FormData()
        formData.append('dealerId', dealerId)
        formData.append('fileName', fileName.trim())
        formData.append('effectiveDate', effectiveDate)
        formData.append('file', selectedPdfFile)

        res = await fetch('/api/modules/ingestion/extract-preview', {
          method: 'POST',
          body: formData,
        })
      } else {
        const jsonPayload = JSON.stringify({ rows: activeRowsForPreview })
        res = await fetch('/api/modules/ingestion/extract-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dealerId,
            fileName: fileName.trim(),
            effectiveDate,
            rows: activeRowsForPreview,
            contentBase64: encodeUtf8Base64(jsonPayload),
          }),
        })
      }

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        const msg =
          typeof data.error === 'string'
            ? data.error
            : `Validation preview failed (${res.status})`
        throw new Error(msg)
      }

      const normalized = normalizePreviewResponse(data)
      setPreviewResult(normalized)
      void loadJobs()
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to validate and preview price list.'
      )
    } finally {
      setIsPreviewing(false)
    }
  }

  async function handlePublish() {
    if (!previewResult || !previewResult.jobId || previewResult.failedRowCount > 0) {
      return
    }

    setErrorMessage(null)
    setIsPublishing(true)
    try {
      const res = await fetch(
        `/api/modules/ingestion/jobs/${encodeURIComponent(previewResult.jobId)}/publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dealerId, effectiveDate }),
        }
      )

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        const msg =
          typeof data.error === 'string'
            ? data.error
            : `Publish failed (${res.status})`
        throw new Error(msg)
      }

      const priceList = (data.priceList ?? {}) as Record<string, unknown>
      const version =
        typeof data.version === 'number'
          ? data.version
          : typeof priceList.version === 'number'
            ? priceList.version
            : null

      const priceListId =
        typeof data.priceListId === 'string'
          ? data.priceListId
          : typeof priceList.id === 'string'
            ? priceList.id
            : undefined

      setPublishSuccess({
        version,
        priceListId,
        effectiveDate,
        fileName: fileName.trim(),
      })
      void loadJobs()
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to publish price list.'
      )
    } finally {
      setIsPublishing(false)
    }
  }

  const passedCount = previewResult
    ? previewResult.rowCount - previewResult.failedRowCount
    : 0
  const changedCount = previewResult
    ? previewResult.rows.filter(
        (r) => r.diffStatus === 'changed' || r.changes.length > 0
      ).length
    : 0
  const canPublish = Boolean(
    previewResult &&
      previewResult.jobId &&
      previewResult.rowCount > 0 &&
      previewResult.failedRowCount === 0 &&
      !isPublishing
  )

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
            Phase 2 · Price List Ingestion &amp; Review
          </span>
          <h1 style={{ margin: '6px 0 6px', fontSize: '1.75rem' }}>
            Dealer Price List Upload &amp; Validation
          </h1>
          <p style={{ margin: 0, color: 'var(--moto-ink-muted)' }}>
            Extract dealer price updates, audit 1% TCS &amp; on-road arithmetic checks, review
            price deltas, and publish a versioned price list.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/admin/catalog" className="moto-btn-secondary">
            Live Catalog →
          </Link>
          <Link href="/admin" className="moto-btn-secondary">
            ← Admin Dashboard
          </Link>
        </div>
      </div>

      {/* Banners */}
      {errorMessage && (
        <div
          role="alert"
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 18,
            fontWeight: 600,
          }}
        >
          {errorMessage}
        </div>
      )}

      {publishSuccess && (
        <div
          role="status"
          style={{
            background: '#ecfdf5',
            border: '1px solid #86efac',
            color: '#14532d',
            borderRadius: 12,
            padding: '14px 18px',
            marginBottom: 18,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem' }}>
              ✓ Price List Published Successfully
              {publishSuccess.version !== null ? ` — Version v${publishSuccess.version}` : ''}
            </div>
            <div style={{ fontSize: '0.88rem', marginTop: 2 }}>
              Source: <strong>{publishSuccess.fileName}</strong> · Effective:{' '}
              <strong>{publishSuccess.effectiveDate}</strong>
              {publishSuccess.priceListId ? ` · ID: ${publishSuccess.priceListId}` : ''}
            </div>
          </div>
          <Link href="/admin/catalog" className="moto-btn-primary">
            View Live Catalog
          </Link>
        </div>
      )}

      {/* Upload & Demo Controls Card */}
      <section className="moto-card" style={{ marginBottom: 24 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 18,
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.15rem' }}>1. Upload or Load Sample Update</h2>
          <button
            type="button"
            className="moto-btn-accent"
            onClick={handleLoadDemo}
          >
            Load Sample Price Update (Demo)
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: 18,
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--moto-ink)' }}>
              Dealer
            </span>
            <select
              value={dealerId}
              onChange={(e) => setDealerId(e.target.value)}
              disabled={dealersLoading}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--moto-border)',
                background: '#ffffff',
                color: 'var(--moto-ink)',
                fontSize: '0.92rem',
              }}
            >
              {dealers.length === 0 ? (
                <option value="">
                  {dealersLoading ? 'Loading dealers…' : 'No active dealers found'}
                </option>
              ) : (
                dealers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} — {d.city}
                  </option>
                ))
              )}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--moto-ink)' }}>
              File Name
            </span>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="e.g. toyota-chennai-nov.pdf"
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--moto-border)',
                color: 'var(--moto-ink)',
                fontSize: '0.92rem',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--moto-ink)' }}>
              Effective Date
            </span>
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--moto-border)',
                color: 'var(--moto-ink)',
                fontSize: '0.92rem',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--moto-ink)' }}>
              Price List File (.pdf or .json)
            </span>
            <input
              type="file"
              accept=".pdf,.json,application/pdf,application/json"
              onChange={handleFileChange}
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid var(--moto-border)',
                background: '#f8fafc',
                fontSize: '0.86rem',
              }}
            />
          </label>
        </div>

        {/* Demo Mode Controls */}
        {demoLoaded && (
          <div
            style={{
              background: 'var(--moto-amber-soft)',
              border: '1px solid rgba(242, 165, 22, 0.4)',
              borderRadius: 12,
              padding: '12px 16px',
              marginBottom: 18,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--moto-ink)' }}>
                Demo Loaded: 2-Row Toyota Hyryder Price Update
              </div>
              <div style={{ fontSize: '0.83rem', color: 'var(--moto-ink-muted)' }}>
                Row 1 (HYREMT) includes a +₹20,000 Ex-Showroom update. Toggle Row 2 (HYRVAT)
                below to test red validation failures vs. a clean green publishable diff.
              </div>
            </div>

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.88rem',
                background: '#ffffff',
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid var(--moto-border)',
              }}
            >
              <input
                type="checkbox"
                checked={includeInvalidDemoRow}
                onChange={(e) => handleToggleInvalidDemoRow(e.target.checked)}
              />
              <span>
                Include intentionally invalid row (TCS &amp; onroad1p3 mismatch)
              </span>
            </label>
          </div>
        )}

        {/* Action Bar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ fontSize: '0.86rem', color: 'var(--moto-ink-muted)' }}>
            {selectedPdfFile
              ? `Ready to extract PDF: ${selectedPdfFile.name} (${Math.round(selectedPdfFile.size / 1024)} KB)`
              : activeRowsForPreview
                ? `Ready to validate ${activeRowsForPreview.length} JSON price row(s)`
                : 'Select a .pdf / .json file or load the sample Toyota update.'}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="moto-btn-primary"
              onClick={handleValidatePreview}
              disabled={isPreviewing}
            >
              {isPreviewing ? 'Validating…' : 'Validate & Preview Diff'}
            </button>

            <button
              type="button"
              className="moto-btn-accent"
              onClick={handlePublish}
              disabled={!canPublish}
              title={
                previewResult && previewResult.failedRowCount > 0
                  ? 'Fix all failed rows before publishing'
                  : undefined
              }
              style={{
                opacity: canPublish ? 1 : 0.5,
                cursor: canPublish ? 'pointer' : 'not-allowed',
              }}
            >
              {isPublishing ? 'Publishing…' : 'Publish Price List'}
            </button>
          </div>
        </div>
      </section>

      {/* Validation & Diff Review Table */}
      {previewResult && (
        <section className="moto-card" style={{ marginBottom: 24 }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <h2 style={{ margin: '0 0 4px', fontSize: '1.15rem' }}>
                2. Validation &amp; Diff Review
              </h2>
              <p style={{ margin: 0, fontSize: '0.86rem' }}>
                Job ID: <code>{previewResult.jobId || 'preview'}</code> · Status:{' '}
                <strong>{previewResult.status}</strong>
              </p>
            </div>

            <div className="moto-badges" style={{ marginTop: 0 }}>
              <span className="moto-badge">Total: {previewResult.rowCount}</span>
              <span className="moto-badge moto-badge-on">Passed: {passedCount}</span>
              <span
                className="moto-badge"
                style={{
                  background: previewResult.failedRowCount > 0 ? '#fee2e2' : '#e5f6ec',
                  color: previewResult.failedRowCount > 0 ? '#991b1b' : '#166534',
                }}
              >
                Failed: {previewResult.failedRowCount}
              </span>
              <span
                className="moto-badge"
                style={{
                  background: 'var(--moto-amber-soft)',
                  color: '#8a5700',
                }}
              >
                Changed: {changedCount}
              </span>
            </div>
          </div>

          {previewResult.failedRowCount > 0 && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                borderRadius: 10,
                padding: '10px 14px',
                marginBottom: 14,
                fontSize: '0.88rem',
                fontWeight: 600,
              }}
            >
              Publishing is blocked until all {previewResult.failedRowCount} failed row(s) pass
              arithmetic validation.
            </div>
          )}

          <div className="moto-table-wrap">
            <table className="moto-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Variant / Suffix</th>
                  <th>Diff</th>
                  <th>Ex-Showroom</th>
                  <th>TCS (1%)</th>
                  <th>Tax &amp; Reg</th>
                  <th>Ins (1+3 / 3+3)</th>
                  <th>On-Road (1+3)</th>
                  <th>On-Road (3+3)</th>
                  <th>Validation Status</th>
                </tr>
              </thead>
              <tbody>
                {previewResult.rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', color: 'var(--moto-ink-muted)' }}>
                      No rows were extracted from this upload.
                    </td>
                  </tr>
                ) : (
                  previewResult.rows.map((row) => {
                    const isFailed = !row.valid
                    const rowBg = isFailed
                      ? '#fef2f2'
                      : row.diffStatus === 'changed' || row.changes.length > 0
                        ? '#f0fdf4'
                        : undefined

                    return (
                      <tr
                        key={`${row.rowIndex}-${row.raw.suffix ?? row.raw.variantId ?? 'row'}`}
                        style={{
                          background: rowBg,
                          boxShadow: isFailed ? 'inset 4px 0 0 #dc2626' : undefined,
                        }}
                      >
                        <td style={{ fontWeight: 700 }}>{row.rowIndex + 1}</td>
                        <td>
                          <div style={{ fontWeight: 700 }}>
                            {row.raw.variantName || row.raw.modelName || row.raw.variantId || 'Variant'}
                          </div>
                          {row.raw.suffix && (
                            <div
                              style={{
                                fontFamily: 'monospace',
                                fontSize: '0.78rem',
                                color: 'var(--moto-ink-muted)',
                              }}
                            >
                              Suffix: {row.raw.suffix}
                            </div>
                          )}
                        </td>
                        <td>
                          <span
                            className="moto-badge"
                            style={{
                              background:
                                row.diffStatus === 'changed'
                                  ? 'var(--moto-amber-soft)'
                                  : row.diffStatus === 'added'
                                    ? '#e5f6ec'
                                    : '#f1f4f8',
                              color:
                                row.diffStatus === 'changed'
                                  ? '#8a5700'
                                  : row.diffStatus === 'added'
                                    ? '#166534'
                                    : 'var(--moto-ink-muted)',
                            }}
                          >
                            {row.diffStatus ?? (row.changes.length > 0 ? 'changed' : 'new')}
                          </span>
                        </td>
                        <td>
                          <PriceDiffCell
                            value={row.raw.exShowroom}
                            field="exShowroom"
                            changes={row.changes}
                          />
                        </td>
                        <td>
                          <PriceDiffCell
                            value={row.raw.tcs}
                            field="tcs"
                            changes={row.changes}
                          />
                        </td>
                        <td>
                          <PriceDiffCell
                            value={row.raw.taxReg}
                            field="taxReg"
                            changes={row.changes}
                          />
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.84rem' }}>
                          <div>1+3: {formatInr(row.raw.insurance1p3)}</div>
                          <div style={{ color: 'var(--moto-ink-muted)' }}>
                            3+3: {formatInr(row.raw.insurance3p3)}
                          </div>
                        </td>
                        <td style={{ fontWeight: 700 }}>
                          <PriceDiffCell
                            value={row.raw.onroad1p3}
                            field="onroad1p3"
                            changes={row.changes}
                          />
                        </td>
                        <td style={{ fontWeight: 700 }}>
                          <PriceDiffCell
                            value={row.raw.onroad3p3}
                            field="onroad3p3"
                            changes={row.changes}
                          />
                        </td>
                        <td style={{ minWidth: 230 }}>
                          {row.valid ? (
                            <span className="moto-badge moto-badge-on">✓ Valid</span>
                          ) : (
                            <div>
                              <span
                                className="moto-badge"
                                style={{
                                  background: '#fee2e2',
                                  color: '#991b1b',
                                  marginBottom: 6,
                                }}
                              >
                                ✕ Failed ({row.errors.length})
                              </span>
                              <ul
                                style={{
                                  margin: 0,
                                  paddingLeft: 16,
                                  color: '#991b1b',
                                  fontSize: '0.8rem',
                                }}
                              >
                                {row.errors.map((err, i) => (
                                  <li key={i}>{err}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent Upload Jobs History */}
      <section className="moto-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Recent Upload Jobs</h2>
          <button
            type="button"
            className="moto-btn-secondary"
            onClick={() => void loadJobs()}
            disabled={jobsLoading}
            style={{ padding: '7px 14px', fontSize: '0.84rem' }}
          >
            {jobsLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <div className="moto-table-wrap">
          <table className="moto-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Dealer</th>
                <th>Status</th>
                <th>Row Count</th>
                <th>Failed Rows</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--moto-ink-muted)' }}>
                    {jobsLoading ? 'Loading upload jobs…' : 'No upload jobs recorded yet.'}
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id}>
                    <td style={{ fontWeight: 600 }}>{job.fileName}</td>
                    <td style={{ fontSize: '0.86rem', color: 'var(--moto-ink-muted)' }}>
                      {dealerNameById.get(job.dealerId) ?? job.dealerId}
                    </td>
                    <td>
                      <span
                        className={`moto-badge ${
                          job.status === 'published'
                            ? 'moto-badge-on'
                            : job.status === 'failed'
                              ? ''
                              : ''
                        }`}
                        style={
                          job.status === 'failed'
                            ? { background: '#fee2e2', color: '#991b1b' }
                            : job.status === 'review'
                              ? { background: 'var(--moto-amber-soft)', color: '#8a5700' }
                              : undefined
                        }
                      >
                        {job.status}
                      </span>
                    </td>
                    <td>{job.rowCount}</td>
                    <td>
                      <span
                        style={{
                          fontWeight: 700,
                          color: job.failedRowCount > 0 ? '#dc2626' : '#166534',
                        }}
                      >
                        {job.failedRowCount}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.84rem', color: 'var(--moto-ink-muted)' }}>
                      {formatDateTime(job.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
