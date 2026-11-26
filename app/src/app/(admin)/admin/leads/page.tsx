'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOps } from '../ops-context'

const LEAD_STAGES = [
  'new',
  'qualified',
  'test_drive',
  'negotiation',
  'won',
  'lost',
] as const

type LeadStage = (typeof LEAD_STAGES)[number]

const KANBAN_STAGES: readonly { stage: LeadStage; title: string; nextStage: LeadStage | null }[] = [
  { stage: 'new', title: 'New', nextStage: 'qualified' },
  { stage: 'qualified', title: 'Qualified', nextStage: 'test_drive' },
  { stage: 'test_drive', title: 'Test Drive', nextStage: 'won' },
  { stage: 'won', title: 'Won', nextStage: null },
]

const STAGE_LABELS: Record<LeadStage, string> = {
  new: 'New',
  qualified: 'Qualified',
  test_drive: 'Test Drive Booked',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
}

interface LeadCustomerInfo {
  id?: string
  name?: string | null
  phone?: string | null
  city?: string | null
}

interface LeadRow {
  id: string
  customerId: string
  conversationId: string | null
  dealerId: string | null
  stage: LeadStage
  shortlistedVariantIds: string[]
  testDriveSlot: string | null
  assignedHuman: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  customer?: LeadCustomerInfo | null
  customerName?: string | null
  customerPhone?: string | null
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getStageBadgeClass(stage: LeadStage): string {
  switch (stage) {
    case 'won':
      return 'ops-badge ops-badge-ok'
    case 'lost':
      return 'ops-badge ops-badge-danger'
    case 'test_drive':
      return 'ops-badge ops-badge-accent'
    case 'negotiation':
    case 'qualified':
    case 'new':
    default:
      return 'ops-badge ops-badge-brand'
  }
}

export default function AdminLeadsPage() {
  const { activePermissions, activeRole, showToast } = useOps()
  const canDispatch = activePermissions.dispatchLeads
  const canViewPii = activePermissions.viewPii

  const [leads, setLeads] = useState<LeadRow[]>([])
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [stageFilter, setStageFilter] = useState<'ALL' | LeadStage>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null)

  const loadLeads = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const res = await fetch('/api/modules/leads')
      if (!res.ok) {
        throw new Error(`Leads endpoint returned ${res.status}`)
      }
      const data = (await res.json()) as { leads?: LeadRow[] }
      setLeads(Array.isArray(data.leads) ? data.leads : [])
    } catch (err) {
      setLeads([])
      setErrorMessage(err instanceof Error ? err.message : 'Unable to load leads')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLeads()
  }, [loadLeads])

  const kpis = useMemo(() => {
    return {
      total: leads.length,
      newCount: leads.filter((l) => l.stage === 'new').length,
      testDriveCount: leads.filter((l) => l.stage === 'test_drive').length,
      wonCount: leads.filter((l) => l.stage === 'won').length,
    }
  }, [leads])

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return leads.filter((lead) => {
      if (stageFilter !== 'ALL' && lead.stage !== stageFilter) {
        return false
      }
      if (!q) return true
      const customerLabel = (
        lead.customer?.name ||
        lead.customerName ||
        (canViewPii ? lead.customer?.phone || lead.customerPhone : '') ||
        lead.customerId
      ).toLowerCase()
      return (
        customerLabel.includes(q) ||
        (lead.notes?.toLowerCase().includes(q) ?? false) ||
        (lead.testDriveSlot?.toLowerCase().includes(q) ?? false) ||
        (lead.assignedHuman?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [leads, stageFilter, searchQuery, canViewPii])

  const secondaryStageLeads = useMemo(
    () =>
      filteredLeads.filter(
        (lead) => lead.stage === 'negotiation' || lead.stage === 'lost'
      ),
    [filteredLeads]
  )

  async function handleStageChange(leadId: string, nextStage: LeadStage) {
    const existing = leads.find((l) => l.id === leadId)
    if (!existing || existing.stage === nextStage) return

    const previousStage = existing.stage
    setUpdatingLeadId(leadId)
    setErrorMessage(null)

    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, stage: nextStage } : l))
    )

    try {
      const res = await fetch(`/api/modules/leads/${leadId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: nextStage }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        lead?: LeadRow
      }

      if (!res.ok) {
        throw new Error(data.error || `Failed to update stage (${res.status})`)
      }

      if (data.lead) {
        setLeads((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, ...data.lead } : l))
        )
      }
      showToast(`Moved lead to ${STAGE_LABELS[nextStage]}`)
    } catch (err) {
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, stage: previousStage } : l))
      )
      setErrorMessage(err instanceof Error ? err.message : 'Unable to update lead stage')
    } finally {
      setUpdatingLeadId(null)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="ops-page-head">
        <div>
          <h2 className="ops-page-title">Lead &amp; Showroom Router</h2>
          <p className="ops-page-sub">
            Track buyer shortlists, test-drive slots, and advance pipeline stages live in Postgres.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              background: '#E2E8F0',
              padding: 3,
              borderRadius: 10,
            }}
          >
            <button
              type="button"
              className={`ops-btn ops-btn-sm ${
                viewMode === 'kanban' ? 'ops-btn-primary' : 'ops-btn-outline'
              }`}
              style={
                viewMode === 'kanban'
                  ? undefined
                  : { background: 'transparent', borderColor: 'transparent' }
              }
              onClick={() => setViewMode('kanban')}
            >
              Kanban Pipeline
            </button>
            <button
              type="button"
              className={`ops-btn ops-btn-sm ${
                viewMode === 'table' ? 'ops-btn-primary' : 'ops-btn-outline'
              }`}
              style={
                viewMode === 'table'
                  ? undefined
                  : { background: 'transparent', borderColor: 'transparent' }
              }
              onClick={() => setViewMode('table')}
            >
              Table View
            </button>
          </div>

          <button
            type="button"
            className="ops-btn ops-btn-outline ops-btn-sm"
            onClick={() => void loadLeads()}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="ops-kpi-grid">
        <div className="ops-card">
          <div className="ops-kpi-label">Total Leads</div>
          <div className="ops-kpi-val">{kpis.total}</div>
          <span className="ops-badge ops-badge-slate">All captured inquiries</span>
        </div>
        <div className="ops-card">
          <div className="ops-kpi-label">New</div>
          <div className="ops-kpi-val">{kpis.newCount}</div>
          <span className="ops-badge ops-badge-brand">Awaiting qualification</span>
        </div>
        <div className="ops-card">
          <div className="ops-kpi-label">Test Drive Booked</div>
          <div className="ops-kpi-val" style={{ color: '#B45309' }}>
            {kpis.testDriveCount}
          </div>
          <span className="ops-badge ops-badge-accent">Scheduled visits</span>
        </div>
        <div className="ops-card">
          <div className="ops-kpi-label">Won</div>
          <div className="ops-kpi-val" style={{ color: '#166534' }}>
            {kpis.wonCount}
          </div>
          <span className="ops-badge ops-badge-ok">Converted bookings</span>
        </div>
      </div>

      {errorMessage && (
        <div
          className="ops-card"
          role="alert"
          style={{
            marginBottom: 16,
            borderColor: '#FECACA',
            background: '#FEF2F2',
            color: '#991B1B',
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Search & Stage Filter Bar */}
      <div
        className="ops-card"
        style={{
          marginBottom: 16,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <input
          type="search"
          className="ops-input"
          placeholder="Search customer, notes, test drive slot…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ minWidth: 230, flex: '1 1 250px' }}
        />

        {viewMode === 'table' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button
              type="button"
              onClick={() => setStageFilter('ALL')}
              className={`ops-btn ops-btn-sm ${
                stageFilter === 'ALL' ? 'ops-btn-primary' : 'ops-btn-outline'
              }`}
            >
              All ({leads.length})
            </button>
            {LEAD_STAGES.map((stage) => (
              <button
                key={stage}
                type="button"
                onClick={() => setStageFilter(stage)}
                className={`ops-btn ops-btn-sm ${
                  stageFilter === stage ? 'ops-btn-primary' : 'ops-btn-outline'
                }`}
              >
                {STAGE_LABELS[stage]}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="ops-card" style={{ fontSize: 13.5, color: '#64748B' }}>
          Loading leads pipeline…
        </div>
      ) : viewMode === 'kanban' ? (
        <>
          {/* Kanban Pipeline View */}
          <div className="ops-kanban-grid">
            {KANBAN_STAGES.map((col) => {
              const colItems = filteredLeads.filter((l) => l.stage === col.stage)

              return (
                <div key={col.stage} className="ops-kanban-col">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingBottom: 4,
                    }}
                  >
                    <strong style={{ fontSize: 13.5, color: '#0F172A' }}>{col.title}</strong>
                    <span className="ops-badge ops-badge-slate">{colItems.length}</span>
                  </div>

                  {colItems.length === 0 ? (
                    <div
                      style={{
                        padding: 14,
                        borderRadius: 10,
                        border: '1px dashed #CBD5E1',
                        color: '#64748B',
                        fontSize: 12,
                        textAlign: 'center',
                      }}
                    >
                      No leads in {col.title}
                    </div>
                  ) : (
                    colItems.map((lead) => {
                      const displayName =
                        lead.customer?.name ||
                        lead.customerName ||
                        `Customer ${lead.customerId.slice(0, 8)}`
                      const displayPhone = canViewPii
                        ? lead.customer?.phone || lead.customerPhone
                        : 'Phone restricted'
                      const isUpdating = updatingLeadId === lead.id

                      return (
                        <div key={lead.id} className="ops-kanban-card">
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start',
                              gap: 6,
                            }}
                          >
                            <strong style={{ fontSize: 13.5, color: '#0F172A' }}>
                              {displayName}
                            </strong>
                            <span style={{ fontSize: 11, color: '#64748B' }}>
                              {formatDate(lead.createdAt)}
                            </span>
                          </div>

                          <div style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>
                            {displayPhone || `ID: ${lead.customerId.slice(0, 8)}`}
                            {lead.customer?.city ? ` · ${lead.customer.city}` : ''}
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 5,
                              marginTop: 8,
                            }}
                          >
                            {lead.shortlistedVariantIds.length > 0 && (
                              <span className="ops-badge ops-badge-brand">
                                {lead.shortlistedVariantIds.length} shortlisted
                              </span>
                            )}
                            {lead.testDriveSlot && (
                              <span className="ops-badge ops-badge-accent">
                                🚗 {lead.testDriveSlot}
                              </span>
                            )}
                          </div>

                          {lead.notes && (
                            <div
                              style={{
                                marginTop: 8,
                                fontSize: 12,
                                color: '#334155',
                                background: '#F8FAFC',
                                padding: '6px 8px',
                                borderRadius: 8,
                                border: '1px solid #F1F5F9',
                              }}
                            >
                              {lead.notes}
                            </div>
                          )}

                          {col.nextStage ? (
                            <button
                              type="button"
                              className="ops-btn ops-btn-outline ops-btn-sm"
                              style={{ width: '100%', marginTop: 10 }}
                              disabled={isUpdating || !canDispatch}
                              title={
                                canDispatch
                                  ? undefined
                                  : `Dispatch Leads is disabled for ${activeRole}`
                              }
                              onClick={() =>
                                void handleStageChange(lead.id, col.nextStage as LeadStage)
                              }
                            >
                              {isUpdating
                                ? 'Moving…'
                                : `Move → ${STAGE_LABELS[col.nextStage]}`}
                            </button>
                          ) : (
                            <div
                              className="ops-badge ops-badge-ok"
                              style={{
                                width: '100%',
                                justifyContent: 'center',
                                marginTop: 10,
                              }}
                            >
                              ✓ Deal Closed
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )
            })}
          </div>

          {secondaryStageLeads.length > 0 && (
            <section className="ops-card" style={{ marginTop: 16 }}>
              <h3 className="ops-panel-title">Negotiation &amp; Lost Leads</h3>
              <div className="ops-table-wrap" style={{ marginTop: 10 }}>
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Stage</th>
                      <th>Update Stage</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {secondaryStageLeads.map((lead) => {
                      const displayName =
                        lead.customer?.name ||
                        lead.customerName ||
                        `Customer ${lead.customerId.slice(0, 8)}`
                      return (
                        <tr key={lead.id}>
                          <td style={{ fontWeight: 700 }}>{displayName}</td>
                          <td>
                            <span className={getStageBadgeClass(lead.stage)}>
                              {STAGE_LABELS[lead.stage]}
                            </span>
                          </td>
                          <td>
                            <select
                              aria-label={`Stage for ${displayName}`}
                              className="ops-select"
                              value={lead.stage}
                              disabled={updatingLeadId === lead.id || !canDispatch}
                              onChange={(e) =>
                                void handleStageChange(lead.id, e.target.value as LeadStage)
                              }
                            >
                              {LEAD_STAGES.map((s) => (
                                <option key={s} value={s}>
                                  {STAGE_LABELS[s]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>{lead.notes || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : (
        /* Table View */
        <section className="ops-card">
          {filteredLeads.length === 0 ? (
            <div style={{ padding: '24px 8px', textAlign: 'center' }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>No leads match this filter</h3>
              <p style={{ margin: 0, color: '#64748B', fontSize: 13 }}>
                {leads.length === 0
                  ? 'When customers shortlist vehicles or book test drives via MotoAI, leads will appear here.'
                  : 'Try clearing your search or selecting "All" stages.'}
              </p>
            </div>
          ) : (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Stage</th>
                    <th>Update Stage</th>
                    <th>Test Drive Slot</th>
                    <th>Notes</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((lead) => {
                    const displayName =
                      lead.customer?.name ||
                      lead.customerName ||
                      `Customer ${lead.customerId.slice(0, 8)}`
                    const displayPhone = canViewPii
                      ? lead.customer?.phone || lead.customerPhone
                      : 'Phone restricted'
                    const isUpdating = updatingLeadId === lead.id

                    return (
                      <tr key={lead.id}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{displayName}</div>
                          <div style={{ fontSize: 12, color: '#64748B' }}>
                            {displayPhone || `ID: ${lead.customerId.slice(0, 8)}`}
                            {lead.shortlistedVariantIds.length > 0
                              ? ` · ${lead.shortlistedVariantIds.length} shortlisted`
                              : ''}
                          </div>
                        </td>
                        <td>
                          <span className={getStageBadgeClass(lead.stage)}>
                            {STAGE_LABELS[lead.stage]}
                          </span>
                        </td>
                        <td>
                          <select
                            aria-label={`Stage for ${displayName}`}
                            value={lead.stage}
                            disabled={isUpdating || !canDispatch}
                            onChange={(e) =>
                              void handleStageChange(lead.id, e.target.value as LeadStage)
                            }
                            className="ops-select"
                            style={{ padding: '5px 9px', fontSize: 12.5 }}
                          >
                            {LEAD_STAGES.map((stage) => (
                              <option key={stage} value={stage}>
                                {STAGE_LABELS[stage]}
                              </option>
                            ))}
                          </select>
                          {isUpdating && (
                            <span style={{ marginLeft: 8, fontSize: 12, color: '#64748B' }}>
                              Saving…
                            </span>
                          )}
                        </td>
                        <td>{lead.testDriveSlot || '—'}</td>
                        <td style={{ maxWidth: 280 }}>
                          {lead.notes ? (
                            <span>{lead.notes}</span>
                          ) : (
                            <span style={{ color: '#64748B' }}>—</span>
                          )}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDate(lead.createdAt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
