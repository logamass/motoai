'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ensureWebCustomer } from '@/app/(site)/cars/[brand]/[model]/actions'
import { CarImage } from '@/components/car/CarImage'

export interface CarVariantSpecData {
  engine: string | null
  power: string | null
  mileage: string | null
  bootSpace: string | null
  safetyRating: string | null
  airbags: number | null
  adas: boolean
  source: 'brochure' | 'web' | 'manual'
  verified: boolean
}

export interface CarVariantPriceData {
  dealerId: string
  dealerName: string
  dealerCity: string
  rtoJurisdiction: string | null
  effectiveDate: string
  version: number
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
  extras: Record<string, number>
  onroad1p3: number
  onroad3p3: number
}

export interface CarVariantItem {
  id: string
  slug: string
  name: string
  suffix: string | null
  fuel: string
  transmission: 'MT' | 'AT'
  powertrainType: string | null
  trim: string | null
  specs: CarVariantSpecData | null
  price: CarVariantPriceData | null
}

export interface CarDetailProps {
  brand: {
    id: string
    slug: string
    name: string
  }
  model: {
    id: string
    slug: string
    name: string
    bodyType: string
    segment: 'private' | 'taxi' | 'commercial'
    seatsDisplay: string
  }
  variants: CarVariantItem[]
  initialVariantSlug?: string
}

interface CompareStoredItem {
  brandSlug: string
  modelSlug: string
  variantId: string
}

interface HandoffVerifyResponse {
  valid?: boolean
  reason?: string
  error?: string
  session?: {
    customerId?: string
    conversationId?: string
    variantId?: string | null
  }
  customer?: {
    name?: string | null
  } | null
}

const COMPARE_STORAGE_KEY = 'motoai.compare'
const MAX_COMPARE_ITEMS = 3
const TEST_DRIVE_SLOTS = ['10:00 AM', '12:00 PM', '03:00 PM', '05:00 PM']

function formatInr(value: number): string {
  return `₹${new Intl.NumberFormat('en-IN').format(Math.round(value))}`
}

function formatLakhs(value: number): string {
  return `₹${(value / 100_000).toFixed(2)} Lakh`
}

function readCompareList(): CompareStoredItem[] {
  try {
    const raw = window.localStorage.getItem(COMPARE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is CompareStoredItem =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as CompareStoredItem).brandSlug === 'string' &&
        typeof (item as CompareStoredItem).modelSlug === 'string' &&
        typeof (item as CompareStoredItem).variantId === 'string'
    )
  } catch {
    return []
  }
}

function computeMonthlyEmi(
  principal: number,
  annualRatePct: number,
  tenureYears: number
): { emi: number; totalPayable: number; totalInterest: number } {
  if (principal <= 0) {
    return { emi: 0, totalPayable: 0, totalInterest: 0 }
  }
  const months = Math.max(1, tenureYears * 12)
  const monthlyRate = annualRatePct / 12 / 100
  if (monthlyRate <= 0) {
    const emi = Math.round(principal / months)
    return { emi, totalPayable: emi * months, totalInterest: 0 }
  }
  const factor = Math.pow(1 + monthlyRate, months)
  const emi = Math.round((principal * monthlyRate * factor) / (factor - 1))
  const totalPayable = emi * months
  return {
    emi,
    totalPayable,
    totalInterest: Math.max(0, totalPayable - principal),
  }
}

function defaultTomorrowIso(): string {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

export function CarDetailClient({
  brand,
  model,
  variants,
  initialVariantSlug,
}: CarDetailProps) {
  const initialVariant =
    (initialVariantSlug
      ? variants.find((v) => v.slug === initialVariantSlug)
      : undefined) ??
    variants.find((v) => v.price !== null) ??
    variants[0]

  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    initialVariant?.id ?? ''
  )
  const [insurancePlan, setInsurancePlan] = useState<'1p3' | '3p3'>('1p3')

  // EMI Calculator state
  const [downPaymentPct, setDownPaymentPct] = useState<number>(20)
  const [tenureYears, setTenureYears] = useState<number>(5)
  const [interestRate, setInterestRate] = useState<number>(9.0)

  // Compare state
  const [compareItems, setCompareItems] = useState<CompareStoredItem[]>([])
  const [compareNotice, setCompareNotice] = useState<string | null>(null)

  // Handoff continuity state
  const [handoffCustomerId, setHandoffCustomerId] = useState<string | null>(null)
  const [handoffConversationId, setHandoffConversationId] = useState<string | null>(null)
  const [handoffNotice, setHandoffNotice] = useState<{
    tone: 'info' | 'warning'
    text: string
  } | null>(null)

  // Test Drive Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [tdName, setTdName] = useState('')
  const [tdPhone, setTdPhone] = useState('')
  const [tdDate, setTdDate] = useState(defaultTomorrowIso)
  const [tdTimeSlot, setTdTimeSlot] = useState(TEST_DRIVE_SLOTS[0])
  const [tdNotes, setTdNotes] = useState('')
  const [tdSubmitting, setTdSubmitting] = useState(false)
  const [tdError, setTdError] = useState<string | null>(null)
  const [tdSuccess, setTdSuccess] = useState<{
    leadId: string
    slot: string
  } | null>(null)

  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === selectedVariantId) ?? variants[0] ?? null,
    [variants, selectedVariantId]
  )

  useEffect(() => {
    setCompareItems(readCompareList())
    try {
      const savedCustomerId = window.localStorage.getItem('motoai.customerId')
      const savedConvId = window.localStorage.getItem('motoai.conversationId')
      if (savedCustomerId) setHandoffCustomerId(savedCustomerId)
      if (savedConvId) setHandoffConversationId(savedConvId)
    } catch {
      // Ignore storage errors
    }
  }, [])

  // WhatsApp -> Website Handoff Continuity (?token=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (!token) return

    // Strip token from URL cleanly while keeping other non-sensitive params
    params.delete('token')
    const remaining = params.toString()
    const cleanUrl = `${window.location.pathname}${remaining ? `?${remaining}` : ''}${window.location.hash}`
    window.history.replaceState({}, '', cleanUrl)

    let cancelled = false

    async function verifyHandoff() {
      try {
        const res = await fetch('/api/modules/handoff/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = (await res.json()) as HandoffVerifyResponse
        if (cancelled) return

        if (!res.ok || !data.valid || !data.session?.conversationId) {
          setHandoffNotice({
            tone: 'warning',
            text:
              data.reason === 'expired'
                ? 'Your WhatsApp handoff link has expired, so a fresh session is ready. You can still check live prices and chat with MotoAI below.'
                : 'Your WhatsApp handoff link could not be verified. You can still browse live prices and start a new chat below.',
          })
          return
        }

        const convId = data.session.conversationId
        const custId = data.session.customerId ?? null

        setHandoffConversationId(convId)
        if (custId) {
          setHandoffCustomerId(custId)
        }
        if (data.customer?.name) {
          setTdName(data.customer.name)
        }

        if (
          data.session.variantId &&
          variants.some((v) => v.id === data.session?.variantId)
        ) {
          setSelectedVariantId(data.session.variantId)
        }

        setHandoffNotice({
          tone: 'info',
          text: 'Continued from WhatsApp — your MotoAI conversation has been linked below.',
        })

        window.dispatchEvent(
          new CustomEvent('motoai:open-chat', {
            detail: {
              conversationId: convId,
              customerId: custId ?? undefined,
              handoffBanner: 'Continued from WhatsApp',
            },
          })
        )
      } catch {
        if (!cancelled) {
          setHandoffNotice({
            tone: 'warning',
            text: 'Unable to verify your WhatsApp link right now. Live showroom pricing is still available below.',
          })
        }
      }
    }

    void verifyHandoff()
    return () => {
      cancelled = true
    }
  }, [variants])

  const price = selectedVariant?.price ?? null
  const activeOnRoad = price
    ? insurancePlan === '1p3'
      ? price.onroad1p3
      : price.onroad3p3
    : 0
  const activeInsurance = price
    ? insurancePlan === '1p3'
      ? price.insurance1p3
      : price.insurance3p3
    : 0

  const downPaymentAmount = Math.round((activeOnRoad * downPaymentPct) / 100)
  const loanAmount = Math.max(0, activeOnRoad - downPaymentAmount)
  const emiSummary = useMemo(
    () => computeMonthlyEmi(loanAmount, interestRate, tenureYears),
    [loanAmount, interestRate, tenureYears]
  )

  const isCompared = Boolean(
    selectedVariant && compareItems.some((item) => item.variantId === selectedVariant.id)
  )

  function handleToggleCompare() {
    if (!selectedVariant) return
    setCompareNotice(null)

    const current = readCompareList()
    const exists = current.some((item) => item.variantId === selectedVariant.id)

    let updated: CompareStoredItem[]
    if (exists) {
      updated = current.filter((item) => item.variantId !== selectedVariant.id)
    } else {
      if (current.length >= MAX_COMPARE_ITEMS) {
        setCompareNotice(
          `Compare list holds up to ${MAX_COMPARE_ITEMS} cars. Remove one on the Compare page to add ${selectedVariant.name}.`
        )
        return
      }
      updated = [
        ...current,
        {
          brandSlug: brand.slug,
          modelSlug: model.slug,
          variantId: selectedVariant.id,
        },
      ]
    }

    setCompareItems(updated)
    try {
      window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(updated))
    } catch {
      // Ignore storage errors
    }
  }

  async function handleBookTestDrive(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedVariant || tdSubmitting) return

    const cleanName = tdName.trim()
    const cleanPhone = tdPhone.trim()
    if (!cleanName) {
      setTdError('Please enter your name.')
      return
    }
    if (!cleanPhone || cleanPhone.replace(/\D/g, '').length < 10) {
      setTdError('Please enter a valid 10-digit mobile number.')
      return
    }

    setTdError(null)
    setTdSubmitting(true)

    try {
      const { customerId } = await ensureWebCustomer({
        existingCustomerId: handoffCustomerId,
        name: cleanName,
        phone: cleanPhone,
      })

      setHandoffCustomerId(customerId)
      try {
        window.localStorage.setItem('motoai.customerId', customerId)
      } catch {
        // Ignore storage errors
      }

      const chosenSlot = `${tdDate} · ${tdTimeSlot}`
      const res = await fetch('/api/modules/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          conversationId: handoffConversationId,
          dealerId: price?.dealerId ?? null,
          stage: 'test_drive',
          shortlistedVariantIds: [selectedVariant.id],
          testDriveSlot: chosenSlot,
          notes:
            tdNotes.trim() ||
            `Test drive request for ${brand.name} ${model.name} ${selectedVariant.name} (${cleanName}, ${cleanPhone})`,
        }),
      })

      const data = (await res.json()) as { lead?: { id: string }; error?: string }
      if (!res.ok || !data.lead) {
        throw new Error(data.error || 'Unable to book test drive')
      }

      setTdSuccess({ leadId: data.lead.id, slot: chosenSlot })
    } catch (err) {
      setTdError(err instanceof Error ? err.message : 'Failed to submit booking')
    } finally {
      setTdSubmitting(false)
    }
  }

  const breakupRows: Array<{ label: string; amount: number; bold?: boolean }> = price
    ? [
        { label: 'Ex-Showroom Price', amount: price.exShowroom },
        ...(price.tcs > 0 ? [{ label: 'TCS (1%)', amount: price.tcs }] : [{ label: 'TCS (1%)', amount: 0 }]),
        { label: 'Life Tax + Registration + FASTag', amount: price.taxReg },
        {
          label:
            insurancePlan === '1p3'
              ? 'Insurance (1+3 Year Comprehensive)'
              : 'Insurance (3+3 Year Comprehensive)',
          amount: activeInsurance,
        },
        { label: 'Extended Warranty (EW)', amount: price.ew },
        { label: 'Service Pack', amount: price.servicePack },
        { label: 'Showroom Accessories Kit', amount: price.accessories },
        ...(price.ceramic > 0 ? [{ label: 'Ceramic Coating', amount: price.ceramic }] : []),
        ...(price.underbody > 0
          ? [{ label: 'Underbody Anti-Rust Coating', amount: price.underbody }]
          : []),
        ...Object.entries(price.extras ?? {})
          .filter(([, val]) => typeof val === 'number' && val > 0)
          .map(([key, val]) => ({ label: key, amount: val })),
        {
          label: `Total On-Road (${insurancePlan === '1p3' ? '1+3' : '3+3'})`,
          amount: activeOnRoad,
          bold: true,
        },
      ]
    : []

  return (
    <div className="moto-container moto-section">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        style={{
          fontSize: '0.86rem',
          color: 'var(--moto-ink-muted)',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <Link href="/" style={{ color: 'var(--moto-teal)', fontWeight: 600 }}>
          Cars
        </Link>
        <span>/</span>
        <span>{brand.name}</span>
        <span>/</span>
        <span style={{ color: 'var(--moto-ink)', fontWeight: 700 }}>{model.name}</span>
      </nav>

      {/* Handoff Continuity Notice */}
      {handoffNotice && (
        <div
          role="status"
          style={{
            marginBottom: 18,
            padding: '12px 16px',
            borderRadius: 12,
            border:
              handoffNotice.tone === 'warning'
                ? '1px solid rgba(242, 165, 22, 0.5)'
                : '1px solid rgba(11, 110, 110, 0.3)',
            background:
              handoffNotice.tone === 'warning'
                ? 'var(--moto-amber-soft)'
                : 'var(--moto-teal-soft)',
            color: handoffNotice.tone === 'warning' ? '#8a5700' : 'var(--moto-teal-dark)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            fontSize: '0.9rem',
            fontWeight: 600,
          }}
        >
          <span>
            {handoffNotice.tone === 'warning' ? '⚠️ ' : '🔗 '}
            {handoffNotice.text}
          </span>
          <button
            type="button"
            onClick={() => setHandoffNotice(null)}
            aria-label="Dismiss notice"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.1rem',
              color: 'inherit',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Hero Summary Card */}
      <section className="moto-card" style={{ marginBottom: 22 }}>
        <div className="car-detail-hero-grid">
          <div className="car-detail-gallery">
            <CarImage slug={model.slug} alt={`${brand.name} ${model.name}`} />
            <span className="car-detail-verified-badge">
              ✓ Chennai Exact On-Road · Zero Hidden Charges
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <div>
              <div className="moto-badges" style={{ marginTop: 0, marginBottom: 10 }}>
                <span className="moto-badge">
                  {brand.name} · {model.bodyType}
                </span>
                <span
                  className="moto-badge"
                  style={{
                    background:
                      model.segment === 'taxi'
                        ? 'var(--moto-amber-soft)'
                        : 'var(--moto-teal-soft)',
                    color: model.segment === 'taxi' ? '#8a5700' : 'var(--moto-teal)',
                  }}
                >
                  {model.seatsDisplay}
                </span>
                {selectedVariant && (
                  <span className="moto-badge moto-badge-off">
                    {selectedVariant.fuel} · {selectedVariant.transmission}
                  </span>
                )}
              </div>

              <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)' }}>
                {brand.name} {model.name}
              </h1>
              {selectedVariant && (
                <p style={{ margin: 0, color: 'var(--moto-ink-muted)', fontSize: '0.96rem' }}>
                  Variant: <strong>{selectedVariant.name}</strong>
                  {selectedVariant.suffix ? ` · Code ${selectedVariant.suffix}` : ''}
                  {price ? ` · ${price.dealerName} (${price.dealerCity})` : ''}
                </p>
              )}
            </div>

            <div className="car-price-block" style={{ marginBottom: 0 }}>
              <div className="car-price-label">
                On-Road Price ({insurancePlan === '1p3' ? '1+3 Year' : '3+3 Year'} Insurance)
              </div>
              <div className="car-price-row">
                <span
                  className="num"
                  style={{
                    fontSize: 'clamp(1.7rem, 3vw, 2.25rem)',
                    fontWeight: 800,
                    color: 'var(--moto-teal)',
                    lineHeight: 1.15,
                  }}
                >
                  {price ? formatInr(activeOnRoad) : 'Price on request'}
                </span>
                {price && (
                  <span className="car-emi num">
                    EMI {formatInr(emiSummary.emi)}/mo
                  </span>
                )}
              </div>
              {price && (
                <div className="car-ex num">
                  {formatLakhs(activeOnRoad)} · Ex-Showroom {formatInr(price.exShowroom)} · Effective{' '}
                  {price.effectiveDate}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Variant Selector (Pills + Dropdown) */}
        <div
          style={{
            marginTop: 20,
            paddingTop: 18,
            borderTop: '1px solid var(--moto-border)',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div style={{ flex: '1 1 360px' }}>
            <label
              htmlFor="variant-select"
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--moto-ink-muted)',
                marginBottom: 8,
              }}
            >
              Select Variant ({variants.length})
            </label>
            <select
              id="variant-select"
              value={selectedVariant?.id ?? ''}
              onChange={(e) => setSelectedVariantId(e.target.value)}
              style={{
                width: '100%',
                maxWidth: 440,
                padding: '9px 12px',
                borderRadius: 10,
                border: '1px solid var(--moto-border)',
                background: '#ffffff',
                fontSize: '0.94rem',
                fontWeight: 600,
                color: 'var(--moto-ink)',
                marginBottom: 10,
              }}
            >
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.fuel} · {v.transmission}
                  {v.suffix ? ` (${v.suffix})` : ''}
                  {v.price
                    ? ` — ${formatInr(
                        insurancePlan === '1p3' ? v.price.onroad1p3 : v.price.onroad3p3
                      )}`
                    : ''}
                </option>
              ))}
            </select>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {variants.map((v) => {
                const active = v.id === selectedVariant?.id
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVariantId(v.id)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 10,
                      border: active
                        ? '1.5px solid var(--moto-teal)'
                        : '1px solid var(--moto-border)',
                      background: active ? 'var(--moto-teal-soft)' : '#ffffff',
                      color: active ? 'var(--moto-teal-dark)' : 'var(--moto-ink)',
                      fontSize: '0.82rem',
                      fontWeight: active ? 700 : 600,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span>{v.name}</span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: '0.74rem',
                        color: 'var(--moto-ink-muted)',
                        fontWeight: 500,
                      }}
                    >
                      {v.fuel} · {v.transmission}
                      {v.suffix ? ` · ${v.suffix}` : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Primary Actions */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              onClick={handleToggleCompare}
              className={isCompared ? 'moto-btn-accent' : 'moto-btn-secondary'}
              style={{ cursor: 'pointer' }}
            >
              {isCompared ? '✓ Added to Compare' : '+ Compare'}
            </button>

            {compareItems.length > 0 && (
              <Link href="/compare" className="moto-btn-secondary">
                View Compare ({compareItems.length})
              </Link>
            )}

            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent('motoai:open-chat', {
                    detail: {
                      initialMessage: selectedVariant
                        ? `Explain the ${brand.name} ${model.name} ${selectedVariant.name} Chennai on-road price breakup and mileage.`
                        : `Tell me about ${brand.name} ${model.name} Chennai on-road price and variants.`,
                    },
                  })
                )
              }}
              className="btn btn-soft"
            >
              💬 Ask MotoAI
            </button>

            <button
              type="button"
              onClick={() => {
                setTdSuccess(null)
                setTdError(null)
                setIsModalOpen(true)
              }}
              className="moto-btn-primary"
            >
              Book Test Drive
            </button>
          </div>
        </div>

        {compareNotice && (
          <p
            style={{
              marginTop: 10,
              fontSize: '0.84rem',
              color: '#8a5700',
              fontWeight: 600,
            }}
          >
            {compareNotice}{' '}
            <Link href="/compare" style={{ textDecoration: 'underline' }}>
              Open Compare →
            </Link>
          </p>
        )}
      </section>

      {/* Main Content Grid: Price Breakup + Specs & EMI */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 20,
          alignItems: 'start',
        }}
      >
        {/* Left: Itemised On-Road Price Breakup */}
        <section className="moto-card">
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <div>
              <h2 style={{ margin: '0 0 2px', fontSize: '1.15rem' }}>
                On-Road Price Breakup
              </h2>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--moto-ink-muted)' }}>
                {price
                  ? `${price.dealerName} · ${price.rtoJurisdiction ?? price.dealerCity}`
                  : 'No published dealer price row for this variant'}
              </p>
            </div>

            {/* Insurance Toggle: 1+3 Year vs 3+3 Year */}
            <div
              role="group"
              aria-label="Insurance plan toggle"
              style={{
                display: 'inline-flex',
                borderRadius: 10,
                border: '1px solid var(--moto-border)',
                padding: 3,
                background: '#f4f7fa',
              }}
            >
              <button
                type="button"
                onClick={() => setInsurancePlan('1p3')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: insurancePlan === '1p3' ? 'var(--moto-teal)' : 'transparent',
                  color: insurancePlan === '1p3' ? '#ffffff' : 'var(--moto-ink-muted)',
                }}
              >
                1+3 Year
              </button>
              <button
                type="button"
                onClick={() => setInsurancePlan('3p3')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: insurancePlan === '3p3' ? 'var(--moto-teal)' : 'transparent',
                  color: insurancePlan === '3p3' ? '#ffffff' : 'var(--moto-ink-muted)',
                }}
              >
                3+3 Year
              </button>
            </div>
          </div>

          {price ? (
            <>
              <div className="moto-table-wrap">
                <table className="moto-table">
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th style={{ textAlign: 'right' }}>Amount (INR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakupRows.map((row) => (
                      <tr
                        key={row.label}
                        style={
                          row.bold
                            ? {
                                background: 'var(--moto-teal-soft)',
                                fontWeight: 800,
                                fontSize: '0.98rem',
                              }
                            : undefined
                        }
                      >
                        <td
                          style={
                            row.bold
                              ? { color: 'var(--moto-teal-dark)', borderBottom: 'none' }
                              : undefined
                          }
                        >
                          {row.label}
                        </td>
                        <td
                          style={{
                            textAlign: 'right',
                            fontVariantNumeric: 'tabular-nums',
                            color: row.bold ? 'var(--moto-teal-dark)' : 'var(--moto-ink)',
                            borderBottom: row.bold ? 'none' : undefined,
                          }}
                        >
                          {formatInr(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  marginTop: 14,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: '#f8fafc',
                  border: '1px solid var(--moto-border)',
                  fontSize: '0.8rem',
                  color: 'var(--moto-ink-muted)',
                }}
              >
                Price prevailing at delivery applies. Always pay only at the showroom.
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--moto-ink-muted)' }}>
              Pricing for this variant has not been published yet. Ask MotoAI or contact the
              showroom for the latest quote.
            </p>
          )}
        </section>

        {/* Right Column: Key Specs + EMI Calculator */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Key Specs Panel */}
          <section className="moto-card">
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                marginBottom: 14,
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Key Specifications</h2>
              {selectedVariant?.specs?.verified ? (
                <span className="moto-badge moto-badge-on">Verified · Brochure</span>
              ) : (
                <span
                  className="moto-badge"
                  style={{
                    background: 'var(--moto-amber-soft)',
                    color: '#8a5700',
                    border: '1px solid rgba(242, 165, 22, 0.45)',
                  }}
                >
                  Unverified · Web-sourced
                </span>
              )}
            </div>

            {selectedVariant?.specs ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: 12,
                }}
              >
                {[
                  { label: 'Engine', value: selectedVariant.specs.engine ?? '—' },
                  { label: 'Mileage', value: selectedVariant.specs.mileage ?? '—' },
                  {
                    label: 'Safety Rating',
                    value: selectedVariant.specs.safetyRating ?? '—',
                  },
                  {
                    label: 'Airbags',
                    value:
                      selectedVariant.specs.airbags !== null
                        ? `${selectedVariant.specs.airbags} Airbags`
                        : '—',
                  },
                  { label: 'Seating', value: model.seatsDisplay },
                  {
                    label: 'Powertrain',
                    value: `${selectedVariant.fuel} · ${selectedVariant.transmission}`,
                  },
                  ...(selectedVariant.specs.power
                    ? [{ label: 'Power', value: selectedVariant.specs.power }]
                    : []),
                  ...(selectedVariant.specs.bootSpace
                    ? [{ label: 'Boot Space', value: selectedVariant.specs.bootSpace }]
                    : []),
                ].map((spec) => (
                  <div
                    key={spec.label}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--moto-border)',
                      background: '#fafcfe',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.74rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: 'var(--moto-ink-muted)',
                        fontWeight: 700,
                      }}
                    >
                      {spec.label}
                    </div>
                    <div
                      style={{
                        fontSize: '0.92rem',
                        fontWeight: 700,
                        color: 'var(--moto-ink)',
                        marginTop: 2,
                      }}
                    >
                      {spec.value}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--moto-ink-muted)' }}>
                Specifications are not available for this variant yet.
              </p>
            )}
          </section>

          {/* Live Interactive EMI Calculator */}
          <section className="moto-card">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div>
                <h2 style={{ margin: '0 0 2px', fontSize: '1.15rem' }}>EMI Calculator</h2>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--moto-ink-muted)' }}>
                  Based on {formatInr(activeOnRoad)} on-road ({insurancePlan === '1p3' ? '1+3' : '3+3'})
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--moto-ink-muted)' }}>
                  Monthly EMI
                </div>
                <div
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 800,
                    color: 'var(--moto-teal)',
                  }}
                >
                  {price ? `${formatInr(emiSummary.emi)}/mo` : '—'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  <label htmlFor="emi-downpayment">Down Payment ({downPaymentPct}%)</label>
                  <span>{formatInr(downPaymentAmount)}</span>
                </div>
                <input
                  id="emi-downpayment"
                  type="range"
                  min={10}
                  max={80}
                  step={5}
                  value={downPaymentPct}
                  onChange={(e) => setDownPaymentPct(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--moto-teal)' }}
                />
              </div>

              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  <label htmlFor="emi-tenure">Loan Tenure</label>
                  <span>
                    {tenureYears} {tenureYears === 1 ? 'Year' : 'Years'} ({tenureYears * 12}{' '}
                    mos)
                  </span>
                </div>
                <input
                  id="emi-tenure"
                  type="range"
                  min={1}
                  max={7}
                  step={1}
                  value={tenureYears}
                  onChange={(e) => setTenureYears(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--moto-teal)' }}
                />
              </div>

              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  <label htmlFor="emi-rate">Interest Rate (p.a.)</label>
                  <span>{interestRate.toFixed(2)}%</span>
                </div>
                <input
                  id="emi-rate"
                  type="range"
                  min={7}
                  max={13}
                  step={0.25}
                  value={interestRate}
                  onChange={(e) => setInterestRate(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--moto-teal)' }}
                />
              </div>

              {price && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 10,
                    paddingTop: 12,
                    borderTop: '1px solid var(--moto-border)',
                    fontSize: '0.82rem',
                  }}
                >
                  <div>
                    <div style={{ color: 'var(--moto-ink-muted)' }}>Loan Amount</div>
                    <div style={{ fontWeight: 700 }}>{formatInr(loanAmount)}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--moto-ink-muted)' }}>Total Interest</div>
                    <div style={{ fontWeight: 700 }}>
                      {formatInr(emiSummary.totalInterest)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--moto-ink-muted)' }}>Total Payable</div>
                    <div style={{ fontWeight: 700 }}>
                      {formatInr(emiSummary.totalPayable)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Book Test Drive Modal */}
      {isModalOpen && selectedVariant && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="td-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'rgba(15, 27, 45, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            className="moto-card"
            style={{
              width: 'min(480px, 100%)',
              boxShadow: '0 24px 56px rgba(15, 27, 45, 0.25)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <h2 id="td-modal-title" style={{ margin: 0, fontSize: '1.2rem' }}>
                Book Test Drive
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Close modal"
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.3rem',
                  cursor: 'pointer',
                  color: 'var(--moto-ink-muted)',
                }}
              >
                ×
              </button>
            </div>

            <p style={{ margin: '0 0 14px', fontSize: '0.88rem', color: 'var(--moto-ink-muted)' }}>
              {brand.name} {model.name} — <strong>{selectedVariant.name}</strong>
              {price ? ` · ${price.dealerName}` : ''}
            </p>

            {tdSuccess ? (
              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: '#e5f6ec',
                  color: '#166534',
                  border: '1px solid #bbf7d0',
                }}
              >
                <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6 }}>
                  ✓ Test Drive Confirmed!
                </div>
                <p style={{ margin: '0 0 8px', fontSize: '0.9rem', color: '#166534' }}>
                  Slot reserved for <strong>{tdSuccess.slot}</strong>. Our showroom advisor will
                  confirm shortly.
                </p>
                <div style={{ fontSize: '0.78rem', opacity: 0.85 }}>
                  Booking Ref: {tdSuccess.leadId}
                </div>
                <div style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="moto-btn-primary"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleBookTestDrive}
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <div>
                  <label
                    htmlFor="td-name"
                    style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 4 }}
                  >
                    Full Name
                  </label>
                  <input
                    id="td-name"
                    type="text"
                    required
                    value={tdName}
                    onChange={(e) => setTdName(e.target.value)}
                    placeholder="e.g. Karthik Sundaram"
                    className="moto-chat-input"
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label
                    htmlFor="td-phone"
                    style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 4 }}
                  >
                    Mobile Number
                  </label>
                  <input
                    id="td-phone"
                    type="tel"
                    required
                    value={tdPhone}
                    onChange={(e) => setTdPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="moto-chat-input"
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label
                      htmlFor="td-date"
                      style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 4 }}
                    >
                      Preferred Date
                    </label>
                    <input
                      id="td-date"
                      type="date"
                      required
                      value={tdDate}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setTdDate(e.target.value)}
                      className="moto-chat-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="td-slot"
                      style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 4 }}
                    >
                      Time Slot
                    </label>
                    <select
                      id="td-slot"
                      value={tdTimeSlot}
                      onChange={(e) => setTdTimeSlot(e.target.value)}
                      className="moto-chat-input"
                      style={{ width: '100%', background: '#ffffff' }}
                    >
                      {TEST_DRIVE_SLOTS.map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="td-notes"
                    style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 4 }}
                  >
                    Notes (Optional)
                  </label>
                  <input
                    id="td-notes"
                    type="text"
                    value={tdNotes}
                    onChange={(e) => setTdNotes(e.target.value)}
                    placeholder="Home pickup or showroom visit"
                    className="moto-chat-input"
                    style={{ width: '100%' }}
                  />
                </div>

                {tdError && (
                  <div style={{ color: '#b91c1c', fontSize: '0.84rem', fontWeight: 600 }}>
                    {tdError}
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 10,
                    marginTop: 4,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="moto-btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={tdSubmitting}
                    className="moto-btn-primary"
                  >
                    {tdSubmitting ? 'Booking…' : 'Confirm Test Drive'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
