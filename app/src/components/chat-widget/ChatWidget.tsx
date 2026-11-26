'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'

function renderFormattedText(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*\n]+\*\*|_[^_\n]+_)/g)
  return tokens.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('_') && part.endsWith('_')) {
      return <em key={i} style={{ opacity: 0.85 }}>{part.slice(1, -1)}</em>
    }
    return <span key={i}>{part}</span>
  })
}
import { CarImage } from '@/components/car/CarImage'
import {
  extractCarPreviews,
  extractInteractiveActions,
  type ChatUiMessage,
  type ToolCallRecord,
} from './chat-helpers'

const STORAGE_CONVERSATION_KEY = 'motoai.conversationId'
const STORAGE_CUSTOMER_KEY = 'motoai.customerId'
const STORAGE_HANDOFF_BANNER_KEY = 'motoai.handoffBanner'

interface ChatApiResponse {
  reply?: string
  conversationId?: string
  buttons?: unknown
  quickReplies?: unknown
  ctaUrl?: unknown
  ctaButton?: unknown
  toolCalls?: ToolCallRecord[]
  error?: string
}

interface ConversationMessagesResponse {
  messages?: Array<{
    id?: string
    role?: string
    content?: string
    channel?: string
    toolCalls?: ToolCallRecord[] | null
    createdAt?: string
  }>
}

export interface MotoAiOpenChatDetail {
  conversationId?: string
  customerId?: string
  handoffBanner?: string
  initialMessage?: string
}

const INITIAL_MESSAGE: ChatUiMessage = {
  role: 'assistant',
  content:
    'Vanakkam! 🙏 I am MotoAI, your Chennai AI car advisor. Ask me for exact on-road breakups, Hybrid vs Petrol mileage, or EMI options in English, தமிழ், or Tanglish.',
  quickReplies: [
    { id: 'init-1', title: '5 seater Hybrid under ₹22L' },
    { id: 'init-2', title: 'Hyryder exact breakup' },
    { id: 'init-3', title: '7 seater family MPV' },
  ],
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatUiMessage[]>([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncingHistory, setIsSyncingHistory] = useState(false)
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)
  const [customerId, setCustomerId] = useState<string | undefined>(undefined)
  const [handoffBanner, setHandoffBanner] = useState<string | null>(null)
  const [queuedPrompt, setQueuedPrompt] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  const loadConversationHistory = useCallback(async (convId: string) => {
    setIsSyncingHistory(true)
    try {
      const res = await fetch(
        `/api/modules/customers/conversations/${encodeURIComponent(convId)}/messages`,
        { cache: 'no-store' }
      )
      if (!res.ok) return
      const data = (await res.json()) as ConversationMessagesResponse
      if (!Array.isArray(data.messages) || data.messages.length === 0) return

      const loaded: ChatUiMessage[] = []
      for (const item of data.messages) {
        if (item.role !== 'user' && item.role !== 'assistant') continue
        if (typeof item.content !== 'string' || !item.content.trim()) continue

        const actions =
          item.role === 'assistant'
            ? extractInteractiveActions({
                toolCalls: Array.isArray(item.toolCalls) ? item.toolCalls : undefined,
              })
            : { quickReplies: [], ctaButtons: [] }

        loaded.push({
          id: item.id,
          role: item.role,
          content: item.content,
          createdAt: item.createdAt,
          quickReplies: actions.quickReplies,
          ctaButtons: actions.ctaButtons,
        })
      }

      if (loaded.length > 0) {
        setMessages(loaded)
      }
    } catch {
      // Ignore network errors when checking persisted history
    } finally {
      setIsSyncingHistory(false)
    }
  }, [])

  useEffect(() => {
    try {
      const savedConvId = window.localStorage.getItem(STORAGE_CONVERSATION_KEY) || undefined
      const savedCustId = window.localStorage.getItem(STORAGE_CUSTOMER_KEY) || undefined
      const savedBanner = window.localStorage.getItem(STORAGE_HANDOFF_BANNER_KEY)

      if (savedConvId) {
        setConversationId(savedConvId)
        void loadConversationHistory(savedConvId)
      }
      if (savedCustId) {
        setCustomerId(savedCustId)
      }
      if (savedBanner) {
        setHandoffBanner(savedBanner)
      }
    } catch {
      // Ignore localStorage access errors
    }
  }, [loadConversationHistory])

  useEffect(() => {
    function handleOpenChat(event: Event) {
      const customEvent = event as CustomEvent<MotoAiOpenChatDetail | undefined>
      const detail = customEvent.detail ?? {}

      setIsOpen(true)

      if (detail.handoffBanner) {
        setHandoffBanner(detail.handoffBanner)
        try {
          window.localStorage.setItem(STORAGE_HANDOFF_BANNER_KEY, detail.handoffBanner)
        } catch {
          // Ignore storage error
        }
      }

      if (detail.customerId) {
        setCustomerId(detail.customerId)
        try {
          window.localStorage.setItem(STORAGE_CUSTOMER_KEY, detail.customerId)
        } catch {
          // Ignore storage error
        }
      }

      if (detail.conversationId) {
        setConversationId(detail.conversationId)
        try {
          window.localStorage.setItem(STORAGE_CONVERSATION_KEY, detail.conversationId)
        } catch {
          // Ignore storage error
        }
        void loadConversationHistory(detail.conversationId)
      }

      if (typeof detail.initialMessage === 'string' && detail.initialMessage.trim()) {
        setQueuedPrompt(detail.initialMessage.trim())
      }
    }

    window.addEventListener('motoai:open-chat', handleOpenChat)
    return () => window.removeEventListener('motoai:open-chat', handleOpenChat)
  }, [loadConversationHistory])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isLoading) return

      const userMsg: ChatUiMessage = { role: 'user', content: trimmed }
      const historyToSend = messages
        .filter((m) => m !== INITIAL_MESSAGE)
        .map((m) => ({ role: m.role, content: m.content }))

      setMessages((prev) => [...prev, userMsg])
      setInput('')
      setIsLoading(true)

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            conversationId,
            senderId: customerId,
            history: historyToSend,
          }),
        })

        const data = (await res.json()) as ChatApiResponse
        if (!res.ok) {
          throw new Error(data.error || 'Unable to get a response')
        }

        if (data.conversationId) {
          setConversationId(data.conversationId)
          try {
            window.localStorage.setItem(STORAGE_CONVERSATION_KEY, data.conversationId)
          } catch {
            // Ignore storage error
          }
        }

        const actions = extractInteractiveActions({
          buttons: data.buttons,
          quickReplies: data.quickReplies,
          ctaUrl: data.ctaUrl,
          ctaButton: data.ctaButton,
          toolCalls: data.toolCalls,
        })

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.reply || 'Sorry, I did not receive a response.',
            quickReplies: actions.quickReplies,
            ctaButtons: actions.ctaButtons,
          },
        ])
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Something went wrong'
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Could not reach MotoAI right now (${errMsg}).`,
          },
        ])
      } finally {
        setIsLoading(false)
      }
    },
    [conversationId, customerId, isLoading, messages]
  )

  useEffect(() => {
    if (!queuedPrompt || isLoading) return
    const nextPrompt = queuedPrompt
    setQueuedPrompt(null)
    void sendMessage(nextPrompt)
  }, [queuedPrompt, isLoading, sendMessage])

  useEffect(() => {
    if (isOpen) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isLoading, isSyncingHistory, isOpen])

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    void sendMessage(input)
  }

  function handleResetConversation() {
    setConversationId(undefined)
    setHandoffBanner(null)
    setQueuedPrompt(null)
    setMessages([INITIAL_MESSAGE])
    try {
      window.localStorage.removeItem(STORAGE_CONVERSATION_KEY)
      window.localStorage.removeItem(STORAGE_HANDOFF_BANNER_KEY)
    } catch {
      // Ignore storage error
    }
  }

  return (
    <>
      {isOpen && (
        <section className="chat-drawer" aria-label="MotoAI chat assistant">
          <div className="drawer-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: 'rgba(255, 255, 255, 0.16)',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 800,
                  fontSize: 14,
                }}
              >
                M
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>MotoAI Chennai Advisor</div>
                <div style={{ fontSize: 11.5, opacity: 0.88 }}>
                  Instant ₹ On-Road · English · தமிழ் · Tanglish
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={handleResetConversation}
                title="Reset conversation"
                style={{
                  background: 'rgba(255,255,255,0.14)',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.24)',
                  borderRadius: 8,
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '4px 9px',
                }}
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close chat"
                style={{
                  background: 'rgba(255,255,255,0.16)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  width: 28,
                  height: 28,
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {handoffBanner && (
            <div className="wa-sync-banner">
              <span>🔗 {handoffBanner}</span>
              <button
                type="button"
                onClick={() => setHandoffBanner(null)}
                aria-label="Dismiss banner"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#92400e',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 14,
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
          )}

          <div className="drawer-msgs">
            {isSyncingHistory && (
              <div
                style={{
                  textAlign: 'center',
                  fontSize: 12,
                  color: 'var(--muted)',
                  padding: '4px 0',
                }}
              >
                Syncing conversation history…
              </div>
            )}

            {messages.map((msg, idx) => {
              const carPreviews =
                msg.role === 'assistant' && idx > 0
                  ? extractCarPreviews({
                      content: msg.content,
                      ctaButtons: msg.ctaButtons,
                    })
                  : []

              return (
                <div
                  key={msg.id ?? idx}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    gap: 6,
                  }}
                >
                  <div
                    className={`msg-bubble ${msg.role === 'user' ? 'msg-user' : 'msg-ai'}`}
                  >
                    {renderFormattedText(msg.content)}
                  </div>

                  {carPreviews.length > 0 && (
                    <div className="chat-car-strip" aria-label="Recommended cars">
                      {carPreviews.map((car) => (
                        <div key={car.slug} className="chat-car-card">
                          <div className="chat-car-thumb">
                            <CarImage slug={car.slug} alt={car.title} />
                          </div>
                          <div className="chat-car-info">
                            <div
                              style={{
                                fontSize: 12.5,
                                fontWeight: 800,
                                color: 'var(--ink)',
                                lineHeight: 1.25,
                              }}
                            >
                              {car.title}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: 'var(--muted)',
                                lineHeight: 1.3,
                              }}
                            >
                              {car.subtitle}
                            </div>
                            <Link
                              href={car.href}
                              className="btn btn-soft btn-sm"
                              style={{ marginTop: 4, width: '100%', fontSize: 11.5 }}
                            >
                              View Breakup →
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.role === 'assistant' &&
                    msg.ctaButtons &&
                    msg.ctaButtons.length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 6,
                          maxWidth: '90%',
                        }}
                      >
                        {msg.ctaButtons.map((cta) => (
                          <Link
                            key={cta.url}
                            href={cta.url}
                            className="btn btn-wa btn-sm"
                            style={{ fontSize: 12 }}
                          >
                            <span>💬</span>
                            <span>{cta.displayText}</span>
                          </Link>
                        ))}
                      </div>
                    )}

                  {msg.role === 'assistant' &&
                    idx === messages.length - 1 &&
                    !isLoading &&
                    msg.quickReplies &&
                    msg.quickReplies.length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 6,
                          maxWidth: '94%',
                        }}
                      >
                        {msg.quickReplies.map((qr) => (
                          <button
                            key={qr.id}
                            type="button"
                            onClick={() => void sendMessage(qr.title)}
                            className="prompt-chip"
                            style={{ fontSize: 11.5, padding: '5px 10px' }}
                          >
                            {qr.title}
                          </button>
                        ))}
                      </div>
                    )}
                </div>
              )
            })}

            {isLoading && (
              <div className="msg-bubble msg-ai" aria-live="polite" style={{ color: 'var(--muted)' }}>
                Checking Chennai dealer prices…
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form className="drawer-input-row" onSubmit={handleSubmit}>
            <input
              type="text"
              className="moto-chat-input"
              placeholder="Ask about Hyryder, EMI, RTO…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={isLoading || !input.trim()}
            >
              Send
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        className="fab-chat"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: '#f59e0b',
            display: 'inline-block',
          }}
        />
        <span>{isOpen ? 'Close MotoAI' : 'Ask MotoAI'}</span>
      </button>
    </>
  )
}
