'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

interface StageBreakdownItem {
  stage: string
  count: number
}

interface TopModelItem {
  brandName: string
  modelName: string
  count: number
  label: string
}

interface AnalyticsSummary {
  totalCustomers: number
  totalConversations: number
  totalLeads: number
  conversionRate: string
  whatsappCount: number
  webCount: number
  leadsByStage: StageBreakdownItem[]
  topModels: TopModelItem[]
  flags: Array<{ name: string; enabled: boolean }>
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeConversionRate(raw: unknown, leads: number, customers: number): string {
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.includes('%') ? raw : `${raw}%`
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return `${raw.toFixed(1).replace(/\.0$/, '')}%`
  }
  if (customers > 0) {
    return `${((leads / customers) * 100).toFixed(1).replace(/\.0$/, '')}%`
  }
  return '0%'
}

function normalizeChannelSplit(data: Record<string, unknown>): {
  whatsapp: number
  web: number
} {
  const split = (data.channelSplit ?? data.channels ?? data.messagesByChannel) as unknown
  if (Array.isArray(split)) {
    let whatsapp = 0
    let web = 0
    for (const entry of split) {
      if (!entry || typeof entry !== 'object') continue
      const row = entry as Record<string, unknown>
      const ch = String(row.channel ?? '').toLowerCase()
      const cnt = asNumber(row.count ?? row.total)
      if (ch === 'whatsapp') whatsapp += cnt
      else if (ch === 'web') web += cnt
    }
    return { whatsapp, web }
  }

  if (split && typeof split === 'object') {
    const obj = split as Record<string, unknown>
    return {
      whatsapp: asNumber(obj.whatsapp),
      web: asNumber(obj.web),
    }
  }

  return {
    whatsapp: asNumber(data.whatsappMessages ?? data.whatsappCount),
    web: asNumber(data.webMessages ?? data.webCount),
  }
}

function normalizeLeadsByStage(raw: unknown): StageBreakdownItem[] {
  const orderedStages = ['new', 'qualified', 'test_drive', 'negotiation', 'won', 'lost']
  const map = new Map<string, number>()
  for (const s of orderedStages) map.set(s, 0)

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const stage = String(row.stage ?? '')
      if (stage) map.set(stage, asNumber(row.count ?? row.total))
    }
  } else if (raw && typeof raw === 'object') {
    for (const [stage, count] of Object.entries(raw as Record<string, unknown>)) {
      map.set(stage, asNumber(count))
    }
  }

  return Array.from(map.entries()).map(([stage, count]) => ({ stage, count }))
}

function normalizeTopModels(raw: unknown): TopModelItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry, idx) => {
    if (typeof entry === 'string') {
      return { brandName: '', modelName: entry, count: 0, label: entry }
    }
    const row = (entry ?? {}) as Record<string, unknown>
    const brandName =
      typeof row.brandName === 'string'
        ? row.brandName
        : typeof row.brand === 'string'
          ? row.brand
          : ''
    const modelName =
      typeof row.modelName === 'string'
        ? row.modelName
        : typeof row.model === 'string'
          ? row.model
          : typeof row.name === 'string'
            ? row.name
            : `Model ${idx + 1}`
    const count = asNumber(row.count ?? row.variantCount ?? row.variants ?? row.leads ?? row.total)
    return {
      brandName,
      modelName,
      count,
      label: brandName ? `${brandName} ${modelName}` : modelName,
    }
  })
}

function normalizeFlags(raw: unknown): Array<{ name: string; enabled: boolean }> {
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => ({
        name: String(item.name ?? item.flag ?? ''),
        enabled: Boolean(item.enabled ?? item.value),
      }))
      .filter((f) => f.name.length > 0)
  }

  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>).map(([name, enabled]) => ({
      name,
      enabled: Boolean(enabled),
    }))
  }

  return []
}

function normalizeSummary(payload: unknown): AnalyticsSummary {
  const root = (payload ?? {}) as Record<string, unknown>
  const kpis = (root.kpis ?? root.counts ?? root.totals ?? {}) as Record<string, unknown>

  const totalCustomers = asNumber(
    root.totalCustomers ?? kpis.totalCustomers ?? kpis.customers ?? root.customers
  )
  const totalConversations = asNumber(
    root.totalConversations ??
      kpis.totalConversations ??
      kpis.conversations ??
      root.conversations
  )
  const totalLeads = asNumber(
    root.totalLeads ?? kpis.totalLeads ?? kpis.leads ?? root.leads
  )
  const conversionRate = normalizeConversionRate(
    root.conversionRate ?? kpis.conversionRate,
    totalLeads,
    totalCustomers
  )
  const { whatsapp, web } = normalizeChannelSplit(root)

  return {
    totalCustomers,
    totalConversations,
    totalLeads,
    conversionRate,
    whatsappCount: whatsapp,
    webCount: web,
    leadsByStage: normalizeLeadsByStage(root.leadsByStage),
    topModels: normalizeTopModels(root.topCatalogModels ?? root.topModels),
    flags: normalizeFlags(root.featureFlags ?? root.flags),
  }
}

export default function AdminAnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadAnalytics = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const res = await fetch('/api/modules/analytics/summary')
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        const msg =
          typeof data.error === 'string'
            ? data.error
            : `Analytics endpoint returned ${res.status}`
        throw new Error(msg)
      }
      setSummary(normalizeSummary(data))
    } catch (err) {
      setSummary(null)
      setErrorMessage(err instanceof Error ? err.message : 'Unable to load analytics summary')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAnalytics()
  }, [loadAnalytics])

  const totalChannelMessages = (summary?.whatsappCount ?? 0) + (summary?.webCount ?? 0)
  const whatsappPct =
    totalChannelMessages > 0
      ? Math.round(((summary?.whatsappCount ?? 0) / totalChannelMessages) * 100)
      : 50
  const webPct = totalChannelMessages > 0 ? 100 - whatsappPct : 50
  const maxStageCount = Math.max(
    1,
    ...(summary?.leadsByStage.map((s) => s.count) ?? [1])
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
          <span className="moto-pill" style={{ marginBottom: 8 }}>
            Live Dealership Telemetry
          </span>
          <h1 style={{ margin: '6px 0 6px', fontSize: '1.75rem' }}>
            Analytics Dashboard
          </h1>
          <p style={{ margin: 0, color: 'var(--moto-ink-muted)' }}>
            Customer funnel metrics, channel split, catalog demand, and active feature flags.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="moto-btn-secondary"
            onClick={() => void loadAnalytics()}
            style={{ cursor: 'pointer' }}
          >
            Refresh
          </button>
          <Link href="/admin" className="moto-btn-secondary">
            ← Admin Dashboard
          </Link>
        </div>
      </div>

      {errorMessage && (
        <div
          className="moto-card"
          role="alert"
          style={{
            marginBottom: 20,
            borderColor: '#fecaca',
            background: '#fef2f2',
            color: '#991b1b',
            padding: '14px 18px',
          }}
        >
          <strong>Unable to load analytics:</strong> {errorMessage}
        </div>
      )}

      {isLoading ? (
        <div className="moto-card">Loading analytics summary…</div>
      ) : summary ? (
        <>
          {/* KPI Cards */}
          <div className="moto-grid" style={{ marginBottom: 22 }}>
            <div className="moto-card">
              <div className="moto-stat">{summary.totalCustomers}</div>
              <h3>Total Customers</h3>
              <p>Unique profiles across channels</p>
            </div>
            <div className="moto-card">
              <div className="moto-stat">{summary.totalConversations}</div>
              <h3>Conversations</h3>
              <p>Active &amp; completed AI sessions</p>
            </div>
            <div className="moto-card">
              <div className="moto-stat">{summary.totalLeads}</div>
              <h3>Leads</h3>
              <p>Shortlists &amp; test-drive inquiries</p>
            </div>
            <div className="moto-card">
              <div className="moto-stat" style={{ color: '#166534' }}>
                {summary.conversionRate}
              </div>
              <h3>Conversion Rate</h3>
              <p>Leads-to-won / customer ratio</p>
            </div>
          </div>

          {/* Channel Split Bar */}
          <section className="moto-card" style={{ marginBottom: 22 }}>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                marginBottom: 12,
              }}
            >
              <h2 style={{ margin: 0 }}>Channel Split (WhatsApp vs Web)</h2>
              <span style={{ fontSize: '0.85rem', color: 'var(--moto-ink-muted)' }}>
                {totalChannelMessages} total messages
              </span>
            </div>

            <div
              style={{
                height: 22,
                borderRadius: 999,
                overflow: 'hidden',
                display: 'flex',
                background: '#eef2f6',
                border: '1px solid var(--moto-border)',
                marginBottom: 12,
              }}
              aria-label={`WhatsApp ${whatsappPct}%, Web ${webPct}%`}
            >
              <div
                style={{
                  width: `${whatsappPct}%`,
                  background: '#16a34a',
                  transition: 'width 0.3s ease',
                }}
              />
              <div
                style={{
                  width: `${webPct}%`,
                  background: 'var(--moto-teal)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 4,
                    background: '#16a34a',
                    display: 'inline-block',
                  }}
                />
                <strong>WhatsApp:</strong> {summary.whatsappCount} ({whatsappPct}%)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 4,
                    background: 'var(--moto-teal)',
                    display: 'inline-block',
                  }}
                />
                <strong>Web Widget:</strong> {summary.webCount} ({webPct}%)
              </div>
            </div>
          </section>

          {/* Leads by Stage + Top Catalog Models */}
          <div className="moto-grid" style={{ marginBottom: 22 }}>
            <section className="moto-card">
              <h2 style={{ marginBottom: 14 }}>Leads by Stage</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {summary.leadsByStage.map((item) => {
                  const pct = Math.round((item.count / maxStageCount) * 100)
                  return (
                    <div key={item.stage}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.88rem',
                          marginBottom: 4,
                        }}
                      >
                        <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                          {item.stage.replace('_', ' ')}
                        </span>
                        <span style={{ fontWeight: 700 }}>{item.count}</span>
                      </div>
                      <div
                        style={{
                          height: 10,
                          borderRadius: 999,
                          background: '#eef2f6',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${item.count > 0 ? Math.max(pct, 6) : 0}%`,
                            height: '100%',
                            background: 'var(--moto-teal)',
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="moto-card">
              <h2 style={{ marginBottom: 14 }}>Top Catalog Models</h2>
              {summary.topModels.length === 0 ? (
                <p>No catalog models recorded yet.</p>
              ) : (
                <div className="moto-table-wrap">
                  <table className="moto-table">
                    <thead>
                      <tr>
                        <th>Model</th>
                        <th>Count / Variants</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.topModels.map((model, idx) => (
                        <tr key={`${model.label}-${idx}`}>
                          <td style={{ fontWeight: 600 }}>{model.label}</td>
                          <td>{model.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          {/* Active Feature Flags */}
          <section className="moto-card">
            <h2 style={{ marginBottom: 12 }}>Active Feature Flags</h2>
            {summary.flags.length === 0 ? (
              <p>No feature flag metadata returned by analytics summary.</p>
            ) : (
              <div className="moto-table-wrap">
                <table className="moto-table">
                  <thead>
                    <tr>
                      <th>Flag</th>
                      <th>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.flags.map((flag) => (
                      <tr key={flag.name}>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                          {flag.name}
                        </td>
                        <td>
                          <span
                            className={`moto-badge ${
                              flag.enabled ? 'moto-badge-on' : 'moto-badge-off'
                            }`}
                          >
                            {flag.enabled ? 'ON' : 'OFF'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
