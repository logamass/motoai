'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useOps } from '../ops-context'

type MessageChannel = 'whatsapp' | 'web' | 'telegram'
type MessageRole = 'user' | 'assistant' | 'system'
type TriageFilter = 'all' | 'takeover' | 'whatsapp' | 'web'

interface CustomerSummary {
  id: string
  name: string | null
  phone: string | null
  waId: string | null
  city: string
  preferredLang: string
}

interface ConversationSummary {
  id: string
  customerId: string
  stage: string
  humanTakeover: boolean
  channel?: MessageChannel
  lastChannel?: MessageChannel
  focusVariantId: string | null
  createdAt: string
  updatedAt: string
  customer: CustomerSummary | null
}

interface ThreadMessage {
  id: string
  conversationId: string
  channel: MessageChannel
  role: MessageRole
  content: string
  createdAt: string
}

function formatTime(iso: string | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getCustomerLabel(conv: ConversationSummary): string {
  if (conv.customer?.name) return conv.customer.name
  if (conv.customer?.phone) return conv.customer.phone
  if (conv.customer?.waId) return `+${conv.customer.waId}`
  return `Customer ${conv.customerId.slice(0, 8)}`
}

function getCustomerSubLabel(conv: ConversationSummary, canViewPii: boolean): string {
  const parts: string[] = []
  if (canViewPii) {
    if (conv.customer?.phone) parts.push(conv.customer.phone)
    else if (conv.customer?.waId) parts.push(`WA: ${conv.customer.waId}`)
  } else if (conv.customer?.phone || conv.customer?.waId) {
    parts.push('Phone hidden (role)')
  }
  if (conv.customer?.city) parts.push(conv.customer.city)
  return parts.join(' · ') || `ID: ${conv.customerId.slice(0, 8)}`
}

function inferChannel(
  conv: ConversationSummary,
  threadMessages?: ThreadMessage[]
): MessageChannel {
  if (threadMessages && threadMessages.length > 0) {
    return threadMessages[threadMessages.length - 1].channel
  }
  if (conv.channel) return conv.channel
  if (conv.lastChannel) return conv.lastChannel
  if (conv.customer?.waId) return 'whatsapp'
  return 'web'
}

function ChannelBadge({ channel }: { channel: MessageChannel }) {
  const isWhatsApp = channel === 'whatsapp'
  const label = isWhatsApp ? 'WhatsApp' : channel === 'telegram' ? 'Telegram' : 'Web'

  return (
    <span
      className={`ops-badge ${isWhatsApp ? 'ops-badge-ok' : 'ops-badge-brand'}`}
      style={{ fontSize: 11, padding: '2px 8px' }}
    >
      {label}
    </span>
  )
}

export default function AdminInboxPage() {
  const { activePermissions, activeRole, showToast } = useOps()
  const canTakeover = activePermissions.liveTakeover
  const canViewPii = activePermissions.viewPii
  const canDispatch = activePermissions.dispatchLeads

  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [triageFilter, setTriageFilter] = useState<TriageFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [replyText, setReplyText] = useState('')

  const [isLoadingList, setIsLoadingList] = useState(true)
  const [isLoadingThread, setIsLoadingThread] = useState(false)
  const [isTogglingTakeover, setIsTogglingTakeover] = useState(false)
  const [isSendingReply, setIsSendingReply] = useState(false)
  const [handoffSentIds, setHandoffSentIds] = useState<Record<string, boolean>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  const threadEndRef = useRef<HTMLDivElement | null>(null)

  const loadConversations = useCallback(async () => {
    setIsLoadingList(true)
    setErrorMessage(null)
    try {
      const res = await fetch('/api/modules/customers/conversations')
      if (!res.ok) {
        throw new Error(`Failed to load conversations (${res.status})`)
      }
      const data = (await res.json()) as { conversations?: ConversationSummary[] }
      const list = Array.isArray(data.conversations) ? data.conversations : []
      setConversations(list)
      setSelectedId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev
        return list[0]?.id ?? null
      })
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to load conversations')
    } finally {
      setIsLoadingList(false)
    }
  }, [])

  const loadThread = useCallback(async (conversationId: string) => {
    setIsLoadingThread(true)
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/modules/customers/conversations/${conversationId}/messages`)
      if (!res.ok) {
        throw new Error(`Failed to load message thread (${res.status})`)
      }
      const data = (await res.json()) as {
        conversation?: Partial<ConversationSummary>
        messages?: ThreadMessage[]
      }
      const thread = Array.isArray(data.messages) ? data.messages : []
      setMessages(thread)

      if (data.conversation) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  stage: data.conversation?.stage ?? c.stage,
                  humanTakeover:
                    typeof data.conversation?.humanTakeover === 'boolean'
                      ? data.conversation.humanTakeover
                      : c.humanTakeover,
                }
              : c
          )
        )
      }
    } catch (err) {
      setMessages([])
      setErrorMessage(err instanceof Error ? err.message : 'Unable to load message thread')
    } finally {
      setIsLoadingThread(false)
    }
  }, [])

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (selectedId) {
      void loadThread(selectedId)
    } else {
      setMessages([])
    }
  }, [selectedId, loadThread])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const triageCounts = useMemo(() => {
    let takeover = 0
    let whatsapp = 0
    let web = 0
    for (const c of conversations) {
      if (c.humanTakeover) takeover += 1
      const ch = inferChannel(c)
      if (ch === 'whatsapp') whatsapp += 1
      else if (ch === 'web') web += 1
    }
    return {
      all: conversations.length,
      takeover,
      whatsapp,
      web,
    }
  }, [conversations])

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return conversations.filter((conv) => {
      const channel = inferChannel(conv)
      if (triageFilter === 'takeover' && !conv.humanTakeover) return false
      if (triageFilter === 'whatsapp' && channel !== 'whatsapp') return false
      if (triageFilter === 'web' && channel !== 'web') return false

      if (!q) return true
      const label = getCustomerLabel(conv).toLowerCase()
      const sub = getCustomerSubLabel(conv, canViewPii).toLowerCase()
      return (
        label.includes(q) ||
        sub.includes(q) ||
        conv.stage.toLowerCase().includes(q)
      )
    })
  }, [conversations, triageFilter, searchQuery, canViewPii])

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId]
  )

  async function handleToggleTakeover() {
    if (!selectedConversation || isTogglingTakeover || !canTakeover) return
    const nextTakeover = !selectedConversation.humanTakeover
    setIsTogglingTakeover(true)
    setErrorMessage(null)
    setActionNotice(null)

    try {
      const res = await fetch(
        `/api/modules/customers/conversations/${selectedConversation.id}/takeover`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ humanTakeover: nextTakeover }),
        }
      )
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        humanTakeover?: boolean
        conversation?: { humanTakeover?: boolean }
      }

      if (!res.ok) {
        throw new Error(data.error || `Takeover request failed (${res.status})`)
      }

      const confirmedState =
        typeof data.humanTakeover === 'boolean'
          ? data.humanTakeover
          : typeof data.conversation?.humanTakeover === 'boolean'
            ? data.conversation.humanTakeover
            : nextTakeover

      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedConversation.id ? { ...c, humanTakeover: confirmedState } : c
        )
      )
      const notice = confirmedState
        ? 'Human takeover enabled — AI auto-replies paused.'
        : 'AI bot resumed for this conversation.'
      setActionNotice(notice)
      showToast(notice)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to toggle human takeover')
    } finally {
      setIsTogglingTakeover(false)
    }
  }

  async function handleSendReply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedConversation || isSendingReply || !canTakeover) return
    const trimmed = replyText.trim()
    if (!trimmed) return

    setIsSendingReply(true)
    setErrorMessage(null)
    setActionNotice(null)

    const channel = inferChannel(selectedConversation, messages)

    try {
      const res = await fetch(
        `/api/modules/customers/conversations/${selectedConversation.id}/reply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: trimmed,
            message: trimmed,
            channel,
          }),
        }
      )
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        message?: ThreadMessage
      }

      if (!res.ok) {
        throw new Error(data.error || `Reply failed (${res.status})`)
      }

      setReplyText('')
      setActionNotice('Reply sent.')
      showToast('Live reply delivered to customer thread')
      if (data.message && data.message.id) {
        setMessages((prev) => [...prev, data.message as ThreadMessage])
      } else {
        await loadThread(selectedConversation.id)
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to send reply')
    } finally {
      setIsSendingReply(false)
    }
  }

  function handleSendShowroomHandoff() {
    if (!selectedConversation || !canDispatch) return
    const buyerName = getCustomerLabel(selectedConversation)
    setHandoffSentIds((prev) => ({ ...prev, [selectedConversation.id]: true }))
    showToast(`Showroom handoff card queued for ${buyerName} (${selectedConversation.customer?.city || 'Chennai'})`)
  }

  return (
    <div>
      {/* Header */}
      <div className="ops-page-head">
        <div>
          <h2 className="ops-page-title">Live Advisor Inbox</h2>
          <p className="ops-page-sub">
            Triage omnichannel WhatsApp &amp; Web threads, take over from AI, and dispatch showroom
            handoff cards.
          </p>
        </div>
        <button
          type="button"
          className="ops-btn ops-btn-outline ops-btn-sm"
          onClick={() => {
            void loadConversations()
            if (selectedId) void loadThread(selectedId)
          }}
        >
          Refresh Inbox
        </button>
      </div>

      {errorMessage && (
        <div
          className="ops-card"
          role="alert"
          style={{
            marginBottom: 14,
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

      {actionNotice && (
        <div
          className="ops-card"
          role="status"
          style={{
            marginBottom: 14,
            borderColor: '#BBF7D0',
            background: '#F0FDF4',
            color: '#166534',
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {actionNotice}
        </div>
      )}

      {/* 3-Pane Ops Inbox */}
      <div className="ops-inbox-grid">
        {/* Left Pane: Triage Pills + Conversation List */}
        <aside className="ops-inbox-list">
          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <input
              type="search"
              className="ops-input"
              placeholder="Search name, phone, stage…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {(
                [
                  { key: 'all', label: `All (${triageCounts.all})` },
                  { key: 'takeover', label: `Human Takeover (${triageCounts.takeover})` },
                  { key: 'whatsapp', label: `WhatsApp (${triageCounts.whatsapp})` },
                  { key: 'web', label: `Web (${triageCounts.web})` },
                ] as const
              ).map((pill) => (
                <button
                  key={pill.key}
                  type="button"
                  onClick={() => setTriageFilter(pill.key)}
                  className={`ops-btn ops-btn-sm ${
                    triageFilter === pill.key ? 'ops-btn-primary' : 'ops-btn-outline'
                  }`}
                  style={{ fontSize: 11.5, padding: '4px 9px' }}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {isLoadingList ? (
              <div style={{ padding: 16, color: '#64748B', fontSize: 13 }}>
                Loading conversations…
              </div>
            ) : filteredConversations.length === 0 ? (
              <div style={{ padding: 16, color: '#64748B', fontSize: 13 }}>
                No conversations match this filter.
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = conv.id === selectedId
                const channel = inferChannel(conv)
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(conv.id)
                      setActionNotice(null)
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '12px 14px',
                      border: 'none',
                      borderLeft: isSelected ? '3px solid #0B6E6E' : '3px solid transparent',
                      borderBottom: '1px solid #F1F5F9',
                      background: isSelected ? '#E6F4F4' : '#FFFFFF',
                      cursor: 'pointer',
                      display: 'block',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 3,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 13.5,
                          color: '#0F172A',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {getCustomerLabel(conv)}
                      </span>
                      <span style={{ fontSize: 11, color: '#64748B', flexShrink: 0 }}>
                        {formatTime(conv.updatedAt)}
                      </span>
                    </div>

                    <div style={{ fontSize: 12, color: '#64748B', marginBottom: 7 }}>
                      {getCustomerSubLabel(conv, canViewPii)}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      <ChannelBadge channel={channel} />
                      <span
                        className="ops-badge ops-badge-slate"
                        style={{ fontSize: 11, padding: '2px 7px' }}
                      >
                        {conv.stage}
                      </span>
                      {conv.humanTakeover && (
                        <span
                          className="ops-badge ops-badge-accent"
                          style={{ fontSize: 11, padding: '2px 7px' }}
                        >
                          Human Takeover
                        </span>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        {/* Center Pane: Thread & Composer */}
        <section className="ops-inbox-chat">
          {!selectedConversation ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748B',
                padding: 24,
                fontSize: 13.5,
              }}
            >
              Select a conversation from the left pane to inspect messages.
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
                      {getCustomerLabel(selectedConversation)}
                    </h3>
                    <ChannelBadge
                      channel={inferChannel(selectedConversation, messages)}
                    />
                    {selectedConversation.humanTakeover && (
                      <span className="ops-badge ops-badge-accent">Human Takeover</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    {selectedConversation.humanTakeover
                      ? 'Human advisor active (AI auto-replies paused)'
                      : 'MotoAI Bot auto-replying'}{' '}
                    · Stage: <strong>{selectedConversation.stage}</strong>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleToggleTakeover()}
                  disabled={isTogglingTakeover || !canTakeover}
                  title={
                    canTakeover
                      ? undefined
                      : `Live Chat Human Takeover is disabled for ${activeRole}`
                  }
                  className={`ops-btn ops-btn-sm ${
                    selectedConversation.humanTakeover ? 'ops-btn-soft' : 'ops-btn-primary'
                  }`}
                >
                  {isTogglingTakeover
                    ? 'Updating…'
                    : selectedConversation.humanTakeover
                      ? 'Resume AI Bot'
                      : 'Take Over Chat'}
                </button>
              </div>

              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 11,
                }}
              >
                {isLoadingThread ? (
                  <div style={{ color: '#64748B', fontSize: 13 }}>Loading messages…</div>
                ) : messages.length === 0 ? (
                  <div style={{ color: '#64748B', fontSize: 13 }}>
                    No messages recorded in this conversation yet.
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isCustomer = msg.role === 'user'
                    const isSystem = msg.role === 'system'

                    return (
                      <div
                        key={msg.id}
                        style={{
                          alignSelf: isSystem
                            ? 'center'
                            : isCustomer
                              ? 'flex-start'
                              : 'flex-end',
                          maxWidth: isSystem ? '90%' : '80%',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isSystem
                            ? 'center'
                            : isCustomer
                              ? 'flex-start'
                              : 'flex-end',
                          gap: 4,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 11.5,
                            color: '#64748B',
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>
                            {isCustomer ? 'Customer' : isSystem ? 'System' : 'Advisor / AI'}
                          </span>
                          <ChannelBadge channel={msg.channel} />
                          <span>{formatTime(msg.createdAt)}</span>
                        </div>

                        <div
                          style={{
                            padding: '9px 13px',
                            borderRadius: 12,
                            fontSize: 13.5,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            background: isSystem
                              ? '#EEF2F6'
                              : isCustomer
                                ? '#FFFFFF'
                                : '#0B6E6E',
                            color: isCustomer || isSystem ? '#0F172A' : '#FFFFFF',
                            border:
                              isCustomer || isSystem ? '1px solid #E2E8F0' : 'none',
                          }}
                        >
                          {msg.content}
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={threadEndRef} />
              </div>

              <form
                onSubmit={handleSendReply}
                style={{
                  display: 'flex',
                  gap: 8,
                  padding: '10px 14px',
                  borderTop: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                }}
              >
                <input
                  type="text"
                  className="ops-input"
                  style={{ flex: 1 }}
                  placeholder={
                    canTakeover
                      ? 'Type a live reply to customer…'
                      : `Reply disabled for ${activeRole}`
                  }
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  disabled={isSendingReply || !canTakeover}
                />
                <button
                  type="submit"
                  className="ops-btn ops-btn-primary"
                  disabled={isSendingReply || !canTakeover || !replyText.trim()}
                >
                  {isSendingReply ? 'Sending…' : 'Send Reply'}
                </button>
              </form>
            </>
          )}
        </section>

        {/* Right Pane: Buyer Context Drawer */}
        <aside className="ops-inbox-drawer">
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#64748B',
              marginBottom: 10,
            }}
          >
            Buyer Context Drawer
          </div>

          {!selectedConversation ? (
            <div style={{ fontSize: 12.5, color: '#64748B' }}>
              Select a thread to inspect buyer profile &amp; dispatch showroom handoff.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>
                  {getCustomerLabel(selectedConversation)}
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0B6E6E', marginTop: 2 }}>
                  {canViewPii
                    ? selectedConversation.customer?.phone ||
                      (selectedConversation.customer?.waId
                        ? `+${selectedConversation.customer.waId}`
                        : 'No phone recorded')
                    : '🔒 Phone PII Restricted'}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: 8,
                  fontSize: 12.5,
                  padding: 12,
                  borderRadius: 10,
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                }}
              >
                <div>
                  <span style={{ color: '#64748B' }}>Channel: </span>
                  <strong>{inferChannel(selectedConversation, messages)}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>City: </span>
                  <strong>{selectedConversation.customer?.city || 'Chennai'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Preferred Lang: </span>
                  <strong>
                    {(selectedConversation.customer?.preferredLang || 'en').toUpperCase()}
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Stage: </span>
                  <strong>{selectedConversation.stage}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Focus Variant: </span>
                  <strong style={{ fontFamily: 'monospace', fontSize: 11.5 }}>
                    {selectedConversation.focusVariantId
                      ? selectedConversation.focusVariantId.slice(0, 12)
                      : 'Not locked yet'}
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Updated: </span>
                  <strong>{formatTime(selectedConversation.updatedAt)}</strong>
                </div>
              </div>

              <button
                type="button"
                className="ops-btn ops-btn-primary"
                style={{ width: '100%' }}
                disabled={!canDispatch}
                title={
                  canDispatch
                    ? undefined
                    : `Dispatch Leads is disabled for ${activeRole}`
                }
                onClick={handleSendShowroomHandoff}
              >
                {handoffSentIds[selectedConversation.id]
                  ? '✓ Handoff Card Sent'
                  : '📤 Send Showroom Handoff Card'}
              </button>

              {handoffSentIds[selectedConversation.id] && (
                <div
                  className="ops-badge ops-badge-ok"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Dispatched for {selectedConversation.customer?.city || 'Chennai'} Showroom
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
