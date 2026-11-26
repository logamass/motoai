'use client'

import { useCallback, useEffect, useState } from 'react'
import { useOps } from '../ops-context'

interface HealthPayload {
  status?: string
  service?: string
  modules?: string[]
  toolsCount?: number
  flags?: Record<string, boolean>
  timestamp?: string
}

type GuardrailKey = 'sqlOnly' | 'blockBankUpi' | 'deliveryDisclaimer' | 'zeroPhoneWall'

interface GuardrailSetting {
  key: GuardrailKey
  title: string
  description: string
}

const GUARDRAIL_DEFINITIONS: GuardrailSetting[] = [
  {
    key: 'sqlOnly',
    title: 'Prices from SQL Only',
    description:
      'Prevent the AI advisor from inventing, rounding, or quoting prices outside Postgres SQL tools.',
  },
  {
    key: 'blockBankUpi',
    title: 'Block Bank / UPI Info',
    description:
      'Refuse any buyer request for UPI IDs, bank account numbers, IFSC codes, or payment links.',
  },
  {
    key: 'deliveryDisclaimer',
    title: 'Always Append Delivery Disclaimer',
    description:
      'Attach showroom delivery wait-time and variant availability notes when quoting on-road prices.',
  },
  {
    key: 'zeroPhoneWall',
    title: 'Zero Phone Wall on Prices',
    description:
      'Guarantee anonymous price browsing on Web without OTP or mandatory phone-number gates.',
  },
]

const STORAGE_SETTINGS_KEY = 'motoai_ops_ai_settings_v1'

interface StoredAiSettings {
  llmMode: 'claude_api' | 'db_smart_advisor'
  langAutoDetect: boolean
  guardrails: Record<GuardrailKey, boolean>
}

const DEFAULT_AI_SETTINGS: StoredAiSettings = {
  llmMode: 'claude_api',
  langAutoDetect: true,
  guardrails: {
    sqlOnly: true,
    blockBankUpi: true,
    deliveryDisclaimer: true,
    zeroPhoneWall: true,
  },
}

export default function AdminSettingsPage() {
  const { showToast } = useOps()

  const [settings, setSettings] = useState<StoredAiSettings>(DEFAULT_AI_SETTINGS)
  const [health, setHealth] = useState<HealthPayload | null>(null)
  const [isLoadingHealth, setIsLoadingHealth] = useState(true)
  const [healthError, setHealthError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_SETTINGS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredAiSettings>
        setSettings((prev) => ({
          llmMode:
            parsed.llmMode === 'db_smart_advisor' || parsed.llmMode === 'claude_api'
              ? parsed.llmMode
              : prev.llmMode,
          langAutoDetect:
            typeof parsed.langAutoDetect === 'boolean'
              ? parsed.langAutoDetect
              : prev.langAutoDetect,
          guardrails: {
            ...prev.guardrails,
            ...(parsed.guardrails ?? {}),
          },
        }))
      }
    } catch {
      // Ignore malformed storage
    }
  }, [])

  const saveSettings = useCallback((next: StoredAiSettings) => {
    setSettings(next)
    try {
      window.localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(next))
    } catch {
      // Ignore storage errors
    }
  }, [])

  const loadHealth = useCallback(async () => {
    setIsLoadingHealth(true)
    setHealthError(null)
    try {
      const res = await fetch('/api/health')
      const data = (await res.json()) as HealthPayload
      if (!res.ok) {
        throw new Error(`Health endpoint returned ${res.status}`)
      }
      setHealth(data)
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : 'Unable to fetch /api/health')
      setHealth(null)
    } finally {
      setIsLoadingHealth(false)
    }
  }, [])

  useEffect(() => {
    void loadHealth()
  }, [loadHealth])

  const flagEntries = Object.entries(health?.flags ?? {})

  return (
    <div>
      <div className="ops-page-head">
        <div>
          <h2 className="ops-page-title">AI Guardrails &amp; Settings</h2>
          <p className="ops-page-sub">
            Configure LLM routing, multilingual detection, strict pricing guardrails, and inspect
            live environment feature flags.
          </p>
        </div>
        <button
          type="button"
          className="ops-btn ops-btn-outline ops-btn-sm"
          onClick={() => void loadHealth()}
        >
          Refresh Live Flags
        </button>
      </div>

      <div className="ops-overview-grid">
        {/* Left: Active LLM Mode & Language Routing */}
        <section className="ops-card">
          <h3 className="ops-panel-title">Active LLM Engine &amp; Language Routing</h3>
          <p className="ops-panel-sub" style={{ marginBottom: 14 }}>
            Runtime automatically uses Anthropic Claude when <code>ANTHROPIC_API_KEY</code> is
            configured, or falls back cleanly to the DB Smart Advisor engine.
          </p>

          <div style={{ display: 'grid', gap: 14 }}>
            <div
              style={{
                padding: 14,
                borderRadius: 12,
                border: '1px solid #E2E8F0',
                background: '#F8FAFC',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
                  Active Advisor Mode
                </span>
                <span
                  className={`ops-badge ${
                    settings.llmMode === 'claude_api' ? 'ops-badge-brand' : 'ops-badge-accent'
                  }`}
                >
                  {settings.llmMode === 'claude_api'
                    ? 'Claude API (Tool-Use)'
                    : 'DB Smart Advisor Fallback'}
                </span>
              </div>

              <select
                aria-label="Active LLM Mode"
                className="ops-select"
                style={{ width: '100%' }}
                value={settings.llmMode}
                onChange={(e) => {
                  const nextMode = e.target.value as StoredAiSettings['llmMode']
                  saveSettings({ ...settings, llmMode: nextMode })
                  showToast(
                    nextMode === 'claude_api'
                      ? 'Active LLM mode set to Claude API'
                      : 'Active LLM mode set to DB Smart Advisor Fallback'
                  )
                }}
              >
                <option value="claude_api">
                  Claude API (Anthropic Tool-Use Loop when ANTHROPIC_API_KEY is set)
                </option>
                <option value="db_smart_advisor">
                  DB Smart Advisor Fallback (Deterministic SQL tool router)
                </option>
              </select>

              <div style={{ fontSize: 12, color: '#64748B', marginTop: 8 }}>
                {health
                  ? `Live runtime: ${health.toolsCount ?? 0} SQL tools registered across ${health.modules?.length ?? 0} modules.`
                  : 'Checking live runtime status…'}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: 14,
                borderRadius: 12,
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0F172A' }}>
                  Language Auto-Detect (EN / தமிழ் / Tanglish)
                </div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  Detect buyer script automatically and reply in the matching language across
                  WhatsApp and Web.
                </div>
              </div>
              <label className="ops-switch" aria-label="Language Auto-Detect">
                <input
                  type="checkbox"
                  checked={settings.langAutoDetect}
                  onChange={(e) => {
                    const checked = e.target.checked
                    saveSettings({ ...settings, langAutoDetect: checked })
                    showToast(`Language Auto-Detect ${checked ? 'enabled' : 'disabled'}`)
                  }}
                />
                <span className="ops-switch-slider" />
              </label>
            </div>
          </div>
        </section>

        {/* Right: Strict AI Safety Guardrails */}
        <section className="ops-card">
          <h3 className="ops-panel-title">Strict AI Safety Guardrails</h3>
          <p className="ops-panel-sub" style={{ marginBottom: 14 }}>
            Policy controls enforced on every outbound customer reply before delivery.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {GUARDRAIL_DEFINITIONS.map((item) => {
              const checked = settings.guardrails[item.key]
              return (
                <div
                  key={item.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '11px 13px',
                    borderRadius: 11,
                    border: '1px solid #E2E8F0',
                    background: '#F8FAFC',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0F172A' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                      {item.description}
                    </div>
                  </div>
                  <label className="ops-switch" aria-label={item.title}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const nextVal = e.target.checked
                        saveSettings({
                          ...settings,
                          guardrails: {
                            ...settings.guardrails,
                            [item.key]: nextVal,
                          },
                        })
                        showToast(`${item.title} ${nextVal ? 'enabled' : 'disabled'}`)
                      }}
                    />
                    <span className="ops-switch-slider" />
                  </label>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      {/* Live Feature Flags Table from /api/health */}
      <section className="ops-card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div>
            <h3 className="ops-panel-title">Live Feature Flags (from /api/health)</h3>
            <div className="ops-panel-sub">
              Controlled server-side via <code>FLAG_*</code> environment variables
            </div>
          </div>
          {health?.timestamp && (
            <span className="ops-badge ops-badge-slate">
              Checked {new Date(health.timestamp).toLocaleTimeString('en-IN')}
            </span>
          )}
        </div>

        {healthError && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#991B1B',
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            {healthError}
          </div>
        )}

        {isLoadingHealth ? (
          <div style={{ fontSize: 13, color: '#64748B' }}>Loading live feature flags…</div>
        ) : flagEntries.length === 0 ? (
          <div style={{ fontSize: 13, color: '#64748B' }}>
            No feature flags returned by /api/health.
          </div>
        ) : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Flag Name</th>
                  <th>Source</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {flagEntries.map(([flagName, enabled]) => (
                  <tr key={flagName}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>
                      {flagName}
                    </td>
                    <td style={{ color: '#64748B', fontSize: 12 }}>env.FLAG_{flagName.toUpperCase()}</td>
                    <td>
                      <span
                        className={`ops-badge ${enabled ? 'ops-badge-ok' : 'ops-badge-slate'}`}
                      >
                        {enabled ? 'ON' : 'OFF'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
