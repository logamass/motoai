'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useOps } from '../ops-context'

interface HealthResponse {
  status?: string
  service?: string
  modules?: string[]
  toolsCount?: number
  flags?: Record<string, boolean>
  timestamp?: string
}

interface ChatTestResponse {
  reply?: string
  conversationId?: string
  language?: string
  buttons?: Array<{ id: string; title: string }>
  ctaUrl?: { displayText: string; url: string } | null
  toolCallsCount?: number
  error?: string
}

const META_TEMPLATES = [
  {
    name: 'price_update_notification',
    category: 'UTILITY',
    languages: 'en, ta',
    status: 'APPROVED',
    sample: 'Chennai {{1}} On-Road price updated to {{2}} (1+3 Ins.) effective {{3}}.',
  },
  {
    name: 'test_drive_reminder',
    category: 'UTILITY',
    languages: 'en, ta',
    status: 'APPROVED',
    sample: 'Reminder: Your {{1}} test drive is confirmed for {{2}} at {{3}}.',
  },
  {
    name: 'shortlist_handoff',
    category: 'UTILITY',
    languages: 'en',
    status: 'PENDING',
    sample: 'Vanakkam {{1}}, your shortlisted {{2}} breakup card is ready for {{3}}.',
  },
] as const

export default function AdminWhatsAppPage() {
  const { activePermissions, activeRole, showToast } = useOps()
  const canEditWaba = activePermissions.wabaSetup

  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)

  const [wabaMode, setWabaMode] = useState<'live' | 'sandbox'>('live')
  const [phoneNumberId, setPhoneNumberId] = useState('428910447291820')
  const [wabaId, setWabaId] = useState('109384726155091')
  const [accessToken, setAccessToken] = useState('EAAGm0PX4ZCpsBAJ9k2MotoAITokenLive9912')
  const [showToken, setShowToken] = useState(false)
  const [verifyToken, setVerifyToken] = useState('motoai_chennai_waba_verify_2026')
  const [callbackUrl, setCallbackUrl] = useState('https://<your-domain>/api/whatsapp')

  const [isVerifying, setIsVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{
    ok: boolean
    status: number
    body: string
  } | null>(null)

  const [testSender, setTestSender] = useState('919840144210')
  const [testPrompt, setTestPrompt] = useState(
    'Hyryder S Hybrid Chennai on-road price 1+3 vs 3+3?'
  )
  const [isTestingBot, setIsTestingBot] = useState(false)
  const [botResult, setBotResult] = useState<ChatTestResponse | null>(null)

  const loadHealth = useCallback(async () => {
    setHealthError(null)
    try {
      const res = await fetch('/api/health')
      const data = (await res.json()) as HealthResponse
      if (!res.ok) {
        throw new Error(`Health check returned ${res.status}`)
      }
      setHealth(data)
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : 'Unable to reach /api/health')
    }
  }, [])

  useEffect(() => {
    void loadHealth()
    if (typeof window !== 'undefined' && window.location?.origin) {
      setCallbackUrl(`${window.location.origin}/api/whatsapp`)
    }
  }, [loadHealth])

  async function handleCopyCallback() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(callbackUrl)
      }
      showToast(`Copied Webhook URL: ${callbackUrl}`)
    } catch {
      showToast(`Webhook URL: ${callbackUrl}`)
    }
  }

  async function handleVerifyChallenge() {
    setIsVerifying(true)
    setVerifyResult(null)
    try {
      const params = new URLSearchParams({
        'hub.mode': 'subscribe',
        'hub.verify_token': verifyToken.trim(),
        'hub.challenge': 'motoai_ok',
      })
      const res = await fetch(`/api/whatsapp?${params.toString()}`)
      const text = await res.text()
      const ok = res.ok && text.trim() === 'motoai_ok'
      setVerifyResult({ ok, status: res.status, body: text })
      showToast(
        ok
          ? 'Webhook challenge verified (200 OK · motoai_ok)'
          : `Webhook returned ${res.status} (${text || 'Forbidden'})`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed'
      setVerifyResult({ ok: false, status: 0, body: msg })
      showToast('Webhook verification request failed')
    } finally {
      setIsVerifying(false)
    }
  }

  async function handleTestBotLive(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = testPrompt.trim()
    if (!trimmed || isTestingBot) return

    setIsTestingBot(true)
    setBotResult(null)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'whatsapp',
          senderId: testSender.trim() || '919840144210',
          conversationId: `wa-ops-test-${testSender.trim() || '919840144210'}`,
          message: trimmed,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as ChatTestResponse
      if (!res.ok) {
        setBotResult({ error: data.error || `Chat endpoint returned ${res.status}` })
        return
      }
      setBotResult(data)
      showToast('Live WhatsApp bot response received')
    } catch (err) {
      setBotResult({
        error: err instanceof Error ? err.message : 'Failed to call /api/chat',
      })
    } finally {
      setIsTestingBot(false)
    }
  }

  const serviceOnline = health?.status === 'ok'

  return (
    <div>
      <div className="ops-page-head">
        <div>
          <h2 className="ops-page-title">WhatsApp Business Setup (Meta Cloud API)</h2>
          <p className="ops-page-sub">
            Configure Graph v21.0 credentials, verify webhook challenge live, and test the
            WhatsApp AI advisor end-to-end.
          </p>
        </div>
        <button
          type="button"
          className="ops-btn ops-btn-outline ops-btn-sm"
          onClick={() => void loadHealth()}
        >
          Refresh Health
        </button>
      </div>

      {/* Meta Cloud API Status Banner */}
      <div
        className="ops-card"
        style={{
          marginBottom: 16,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          background:
            wabaMode === 'live' && serviceOnline
              ? '#DCFCE7'
              : wabaMode === 'sandbox'
                ? '#FEF3C7'
                : '#F1F5F9',
          borderColor:
            wabaMode === 'live' && serviceOnline
              ? '#86EFAC'
              : wabaMode === 'sandbox'
                ? '#FDE68A'
                : '#CBD5E1',
        }}
      >
        <div>
          <div
            style={{
              fontWeight: 800,
              fontSize: 14,
              color: wabaMode === 'sandbox' ? '#92400E' : '#166534',
            }}
          >
            {serviceOnline
              ? wabaMode === 'live'
                ? '✓ Meta Cloud API Webhook Online · Graph v21.0 Ready'
                : '🧪 Meta Cloud API · Sandbox Test Mode'
              : '⚠ Runtime Health Unavailable — Check /api/health'}
          </div>
          <div style={{ fontSize: 12, color: '#334155', marginTop: 2 }}>
            {healthError
              ? healthError
              : health
                ? `Service: ${health.service ?? 'motoai'} · ${health.toolsCount ?? 0} SQL agent tools · Env vars: WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID`
                : 'Checking /api/health…'}
          </div>
        </div>

        <button
          type="button"
          className="ops-btn ops-btn-outline ops-btn-sm"
          disabled={!canEditWaba}
          onClick={() => {
            const next = wabaMode === 'live' ? 'sandbox' : 'live'
            setWabaMode(next)
            showToast(`Switched WABA banner preview to ${next.toUpperCase()}`)
          }}
        >
          Switch to {wabaMode === 'live' ? 'Sandbox' : 'Live'}
        </button>
      </div>

      {!canEditWaba && (
        <div
          className="ops-card"
          style={{
            marginBottom: 16,
            background: '#FEF3C7',
            borderColor: '#FDE68A',
            color: '#92400E',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Role Preview ({activeRole}) has read-only access to Meta Cloud API credentials. Switch to
          Platform Admin in the topbar or grant &ldquo;WhatsApp Meta API Setup&rdquo; in Team &amp;
          Roles to edit.
        </div>
      )}

      <div className="ops-overview-grid">
        {/* Left: Meta Cloud API Config Form & Live Challenge Verification */}
        <section className="ops-card">
          <h3 className="ops-panel-title">Meta Cloud API Configuration</h3>
          <p className="ops-panel-sub" style={{ marginBottom: 14 }}>
            Production values are loaded on the server from environment variables; use this panel to
            validate your webhook and callback URL.
          </p>

          <div style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 5, fontSize: 12.5, fontWeight: 700 }}>
              <span>Phone Number ID</span>
              <input
                className="ops-input"
                value={phoneNumberId}
                disabled={!canEditWaba}
                onChange={(e) => setPhoneNumberId(e.target.value)}
              />
            </label>

            <label style={{ display: 'grid', gap: 5, fontSize: 12.5, fontWeight: 700 }}>
              <span>WhatsApp Business Account (WABA) ID</span>
              <input
                className="ops-input"
                value={wabaId}
                disabled={!canEditWaba}
                onChange={(e) => setWabaId(e.target.value)}
              />
            </label>

            <div style={{ display: 'grid', gap: 5, fontSize: 12.5, fontWeight: 700 }}>
              <span>Permanent Access Token</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="ops-input"
                  style={{ flex: 1, fontFamily: 'monospace' }}
                  type={showToken ? 'text' : 'password'}
                  value={accessToken}
                  disabled={!canEditWaba}
                  onChange={(e) => setAccessToken(e.target.value)}
                />
                <button
                  type="button"
                  className="ops-btn ops-btn-outline ops-btn-sm"
                  onClick={() => setShowToken((prev) => !prev)}
                >
                  {showToken ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <label style={{ display: 'grid', gap: 5, fontSize: 12.5, fontWeight: 700 }}>
              <span>Webhook Verify Token (WHATSAPP_VERIFY_TOKEN)</span>
              <input
                className="ops-input"
                style={{ fontFamily: 'monospace' }}
                value={verifyToken}
                disabled={!canEditWaba}
                onChange={(e) => setVerifyToken(e.target.value)}
              />
            </label>

            <div style={{ display: 'grid', gap: 5, fontSize: 12.5, fontWeight: 700 }}>
              <span>Webhook Callback URL</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="ops-input"
                  style={{ flex: 1, background: '#F8FAFC', fontFamily: 'monospace' }}
                  readOnly
                  value={callbackUrl}
                />
                <button
                  type="button"
                  className="ops-btn ops-btn-outline ops-btn-sm"
                  onClick={() => void handleCopyCallback()}
                >
                  Copy
                </button>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 10,
                paddingTop: 6,
              }}
            >
              <button
                type="button"
                className="ops-btn ops-btn-primary"
                disabled={isVerifying}
                onClick={() => void handleVerifyChallenge()}
              >
                {isVerifying ? 'Verifying…' : 'Verify Webhook Challenge'}
              </button>
              <span style={{ fontSize: 12, color: '#64748B' }}>
                Calls <code>GET /api/whatsapp?hub.mode=subscribe&amp;hub.challenge=motoai_ok</code>
              </span>
            </div>

            {verifyResult && (
              <div
                role="status"
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1px solid ${verifyResult.ok ? '#86EFAC' : '#FECACA'}`,
                  background: verifyResult.ok ? '#F0FDF4' : '#FEF2F2',
                  color: verifyResult.ok ? '#166534' : '#991B1B',
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                {verifyResult.ok
                  ? `✓ Challenge Verified (HTTP ${verifyResult.status}) — Echoed "${verifyResult.body}"`
                  : `✕ HTTP ${verifyResult.status || 'ERR'} — Response: "${verifyResult.body}". Ensure Webhook Verify Token matches server WHATSAPP_VERIFY_TOKEN.`}
              </div>
            )}
          </div>
        </section>

        {/* Right: Test WhatsApp Bot Live + Approved Meta Templates */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="ops-card">
            <h3 className="ops-panel-title">Test WhatsApp Bot Live</h3>
            <p className="ops-panel-sub" style={{ marginBottom: 12 }}>
              Dispatches a real message to <code>POST /api/chat</code> with{' '}
              <code>channel: &apos;whatsapp&apos;</code> and displays the SQL-grounded agent reply.
            </p>

            <form onSubmit={handleTestBotLive} style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700 }}>
                <span>Simulated WhatsApp Sender ID</span>
                <input
                  className="ops-input"
                  value={testSender}
                  onChange={(e) => setTestSender(e.target.value)}
                  placeholder="919840144210"
                />
              </label>

              <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700 }}>
                <span>Inbound WhatsApp Message</span>
                <textarea
                  className="ops-input"
                  rows={3}
                  value={testPrompt}
                  onChange={(e) => setTestPrompt(e.target.value)}
                  placeholder="Ask about Hyryder on-road price, mileage, or test drive…"
                  style={{ resize: 'vertical' }}
                />
              </label>

              <button
                type="submit"
                className="ops-btn ops-btn-wa"
                disabled={isTestingBot || !testPrompt.trim()}
              >
                {isTestingBot ? 'Sending to MotoAI Agent…' : 'Send Test WhatsApp Message'}
              </button>
            </form>

            {botResult && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 10,
                  border: `1px solid ${botResult.error ? '#FECACA' : '#CBD5E1'}`,
                  background: botResult.error ? '#FEF2F2' : '#F8FAFC',
                }}
              >
                {botResult.error ? (
                  <div style={{ color: '#991B1B', fontSize: 12.5, fontWeight: 600 }}>
                    Error: {botResult.error}
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        marginBottom: 8,
                      }}
                    >
                      <span className="ops-badge ops-badge-ok">Live Agent Reply</span>
                      {botResult.language && (
                        <span className="ops-badge ops-badge-slate">
                          Lang: {botResult.language}
                        </span>
                      )}
                      {typeof botResult.toolCallsCount === 'number' && (
                        <span className="ops-badge ops-badge-brand">
                          {botResult.toolCallsCount} SQL tool call(s)
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: '#0F172A',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {botResult.reply || 'Empty response'}
                    </div>
                    {botResult.buttons && botResult.buttons.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {botResult.buttons.map((btn) => (
                          <span key={btn.id} className="ops-badge ops-badge-brand">
                            {btn.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </section>

          <section className="ops-card">
            <h3 className="ops-panel-title">Approved Meta Templates</h3>
            <p className="ops-panel-sub" style={{ marginBottom: 10 }}>
              Pre-registered templates for outbound updates outside the 24-hour customer window.
            </p>
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Template</th>
                    <th>Lang</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {META_TEMPLATES.map((tpl) => (
                    <tr key={tpl.name}>
                      <td>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12.5 }}>
                          {tpl.name}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#64748B' }}>{tpl.sample}</div>
                      </td>
                      <td>{tpl.languages}</td>
                      <td>
                        <span
                          className={`ops-badge ${
                            tpl.status === 'APPROVED' ? 'ops-badge-ok' : 'ops-badge-accent'
                          }`}
                        >
                          {tpl.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
