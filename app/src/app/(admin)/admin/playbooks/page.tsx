'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

interface PlaybookItem {
  id: string
  module: string
  name: string
  content: string
}

export default function AdminPlaybooksPage() {
  const [playbooks, setPlaybooks] = useState<PlaybookItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftContent, setDraftContent] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const loadPlaybooks = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const res = await fetch('/api/playbooks')
      if (!res.ok) {
        throw new Error(`Failed to fetch playbooks (${res.status})`)
      }
      const data = (await res.json()) as { playbooks?: PlaybookItem[] }
      const list = Array.isArray(data.playbooks) ? data.playbooks : []
      setPlaybooks(list)

      if (list.length > 0) {
        setSelectedId((prev) => {
          const matched = list.find((p) => p.id === prev) ?? list[0]
          setDraftContent(matched.content)
          return matched.id
        })
      } else {
        setSelectedId(null)
        setDraftContent('')
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to load playbooks')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPlaybooks()
  }, [loadPlaybooks])

  useEffect(() => {
    if (!toastMessage) return
    const timer = setTimeout(() => setToastMessage(null), 3500)
    return () => clearTimeout(timer)
  }, [toastMessage])

  const selectedPlaybook = useMemo(
    () => playbooks.find((p) => p.id === selectedId) ?? null,
    [playbooks, selectedId]
  )

  const isDirty = Boolean(selectedPlaybook && draftContent !== selectedPlaybook.content)

  const groupedByModule = useMemo(() => {
    const groups = new Map<string, PlaybookItem[]>()
    for (const pb of playbooks) {
      const existing = groups.get(pb.module) ?? []
      existing.push(pb)
      groups.set(pb.module, existing)
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [playbooks])

  function handleSelectPlaybook(pb: PlaybookItem) {
    setSelectedId(pb.id)
    setDraftContent(pb.content)
    setErrorMessage(null)
  }

  async function handleSave() {
    if (!selectedPlaybook || isSaving) return
    setIsSaving(true)
    setErrorMessage(null)
    setToastMessage(null)

    try {
      const res = await fetch('/api/playbooks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module: selectedPlaybook.module,
          name: selectedPlaybook.name,
          content: draftContent,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Save failed (${res.status})`)
      }

      setPlaybooks((prev) =>
        prev.map((p) =>
          p.id === selectedPlaybook.id ? { ...p, content: draftContent } : p
        )
      )
      setToastMessage(`Saved ${selectedPlaybook.module}/${selectedPlaybook.name}.md`)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to save playbook')
    } finally {
      setIsSaving(false)
    }
  }

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
          marginBottom: 20,
        }}
      >
        <div>
          <span className="moto-pill" style={{ marginBottom: 8 }}>
            Agent Conversation Skills
          </span>
          <h1 style={{ margin: '6px 0 4px', fontSize: '1.75rem' }}>
            AI Playbooks Editor
          </h1>
          <p style={{ margin: 0, color: 'var(--moto-ink-muted)' }}>
            Edit markdown playbooks loaded by MotoAI during discovery, recommendation, and pricing.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="moto-btn-secondary"
            onClick={() => void loadPlaybooks()}
            style={{ cursor: 'pointer' }}
          >
            Reload
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
            marginBottom: 16,
            borderColor: '#fecaca',
            background: '#fef2f2',
            color: '#991b1b',
            padding: '12px 16px',
          }}
        >
          {errorMessage}
        </div>
      )}

      {toastMessage && (
        <div
          role="status"
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            zIndex: 60,
            background: '#166534',
            color: '#ffffff',
            padding: '12px 18px',
            borderRadius: 12,
            fontWeight: 600,
            boxShadow: 'var(--moto-shadow)',
          }}
        >
          ✓ {toastMessage}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(230px, 280px) minmax(0, 1fr)',
          gap: 18,
          alignItems: 'start',
        }}
      >
        {/* Left Sidebar: Grouped by Module */}
        <aside className="moto-card" style={{ padding: 14 }}>
          <h2 style={{ fontSize: '0.96rem', marginBottom: 12 }}>Module Playbooks</h2>

          {isLoading ? (
            <p style={{ fontSize: '0.88rem' }}>Loading playbooks…</p>
          ) : groupedByModule.length === 0 ? (
            <p style={{ fontSize: '0.88rem' }}>No playbooks found under modules/*/playbooks.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {groupedByModule.map(([moduleName, items]) => (
                <div key={moduleName}>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--moto-ink-muted)',
                      marginBottom: 6,
                      paddingLeft: 6,
                    }}
                  >
                    {moduleName}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {items.map((pb) => {
                      const isSelected = pb.id === selectedId
                      return (
                        <button
                          key={pb.id}
                          type="button"
                          onClick={() => handleSelectPlaybook(pb)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '9px 12px',
                            borderRadius: 8,
                            border: isSelected
                              ? '1px solid var(--moto-teal)'
                              : '1px solid transparent',
                            background: isSelected ? 'var(--moto-teal-soft)' : 'transparent',
                            color: isSelected ? 'var(--moto-teal)' : 'var(--moto-ink)',
                            fontWeight: isSelected ? 700 : 500,
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <span>{pb.name}.md</span>
                          {isSelected && isDirty && (
                            <span style={{ fontSize: '0.72rem', color: '#b45309' }}>•</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Right Editor */}
        <section className="moto-card">
          {!selectedPlaybook ? (
            <p>Select a playbook from the left sidebar to begin editing.</p>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h2 style={{ margin: 0, fontFamily: 'monospace', fontSize: '1.05rem' }}>
                      modules/{selectedPlaybook.module}/playbooks/{selectedPlaybook.name}.md
                    </h2>
                    {isDirty && (
                      <span
                        className="moto-badge"
                        style={{
                          background: 'var(--moto-amber-soft)',
                          color: '#8a5700',
                        }}
                      >
                        Unsaved changes
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--moto-ink-muted)', marginTop: 3 }}>
                    {draftContent.split('\n').length} lines · {draftContent.length} characters
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  {isDirty && (
                    <button
                      type="button"
                      className="moto-btn-secondary"
                      onClick={() => setDraftContent(selectedPlaybook.content)}
                      disabled={isSaving}
                      style={{ padding: '9px 14px', fontSize: '0.86rem', cursor: 'pointer' }}
                    >
                      Discard
                    </button>
                  )}
                  <button
                    type="button"
                    className="moto-btn-primary"
                    onClick={() => void handleSave()}
                    disabled={isSaving}
                    style={{ padding: '9px 18px', fontSize: '0.9rem' }}
                  >
                    {isSaving ? 'Saving…' : 'Save Playbook'}
                  </button>
                </div>
              </div>

              <textarea
                aria-label={`Markdown editor for ${selectedPlaybook.id}`}
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                spellCheck={false}
                style={{
                  width: '100%',
                  minHeight: 460,
                  padding: 14,
                  borderRadius: 10,
                  border: '1px solid var(--moto-border)',
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  fontSize: '0.88rem',
                  lineHeight: 1.55,
                  color: 'var(--moto-ink)',
                  background: '#fcfdfe',
                  resize: 'vertical',
                  outline: 'none',
                }}
              />
            </>
          )}
        </section>
      </div>
    </div>
  )
}
