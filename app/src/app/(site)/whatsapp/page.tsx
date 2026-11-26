'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { CarImage } from '@/components/car/CarImage'
import {
  extractCarPreviews,
  extractInteractiveActions,
  type ChatCtaButton,
  type ChatQuickReply,
  type ChatUiMessage,
  type ToolCallRecord,
} from '@/components/chat-widget/chat-helpers'
import { ensureWhatsAppHandoffCta } from './actions'

interface WhatsAppMessage extends ChatUiMessage {
  timestamp: string
}

interface ChatApiResponse {
  reply?: string
  conversationId?: string
  language?: string
  buttons?: unknown
  quickReplies?: unknown
  ctaUrl?: unknown
  ctaButton?: unknown
  toolCalls?: ToolCallRecord[]
  error?: string
}

const QUICK_START_PROMPTS = [
  '5 people, ₹20L budget, Hybrid',
  'Hyryder on-road price',
  '7 seater SUV under ₹30L',
  'வணக்கம், best family car எது?',
  'Compare Hyryder and Hycross',
]

function formatTimeNow(): string {
  return new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

const INITIAL_WA_MESSAGE: WhatsAppMessage = {
  role: 'assistant',
  content:
    'Vanakkam! 🙏 Welcome to MotoAI WhatsApp Advisor.\nAsk me for car recommendations, exact Chennai on-road breakups, or Tamil/Tanglish help — then tap any car card or CTA button to continue seamlessly on our website!',
  timestamp: 'Just now',
  quickReplies: [
    { id: 'wa-init-1', title: 'Hyryder on-road price' },
    { id: 'wa-init-2', title: '5 people, ₹20L budget, Hybrid' },
  ],
}

export default function WhatsAppSimulatorPage() {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([INITIAL_WA_MESSAGE])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)
  const [customerId, setCustomerId] = useState<string | undefined>(undefined)
  const [lastLanguage, setLastLanguage] = useState<string>('en')
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isLoading) return

      const userBubble: WhatsAppMessage = {
        role: 'user',
        content: trimmed,
        timestamp: formatTimeNow(),
      }

      const historyToSend = messages
        .filter((m) => m !== INITIAL_WA_MESSAGE)
        .map((m) => ({ role: m.role, content: m.content }))

      setMessages((prev) => [...prev, userBubble])
      setInput('')
      setIsLoading(true)

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            channel: 'whatsapp',
            conversationId,
            senderId: customerId,
            history: historyToSend,
          }),
        })

        const data = (await res.json()) as ChatApiResponse
        if (!res.ok) {
          throw new Error(data.error || 'Failed to get WhatsApp reply')
        }

        const replyText = data.reply || 'Sorry, I did not receive a response.'
        const activeConvId = data.conversationId || conversationId || crypto.randomUUID()
        setConversationId(activeConvId)
        if (data.language) setLastLanguage(data.language)

        const extracted = extractInteractiveActions({
          buttons: data.buttons,
          quickReplies: data.quickReplies,
          ctaUrl: data.ctaUrl,
          ctaButton: data.ctaButton,
          toolCalls: data.toolCalls,
        })

        let finalCtas: ChatCtaButton[] = extracted.ctaButtons
        let finalQuickReplies: ChatQuickReply[] = extracted.quickReplies

        if (finalCtas.length === 0) {
          try {
            const synced = await ensureWhatsAppHandoffCta({
              conversationId: activeConvId,
              customerId,
              userMessage: trimmed,
              assistantReply: replyText,
            })
            if (synced.customerId) setCustomerId(synced.customerId)
            setConversationId(synced.conversationId)

            if (synced.ctaButtons.length > 0) {
              finalCtas = synced.ctaButtons
            }
          } catch {
            // Keep UI responsive even if Postgres handoff sync is unavailable
          }
        }

        if (finalQuickReplies.length === 0) {
          finalQuickReplies = [
            { id: 'qr-emi', title: 'Calculate EMI' },
            { id: 'qr-td', title: 'Book test drive' },
          ]
        }

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: replyText,
            timestamp: formatTimeNow(),
            quickReplies: finalQuickReplies,
            ctaButtons: finalCtas,
          },
        ])
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Network error'
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Unable to reach MotoAI (${msg}).`,
            timestamp: formatTimeNow(),
          },
        ])
      } finally {
        setIsLoading(false)
      }
    },
    [conversationId, customerId, isLoading, messages]
  )

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    void sendMessage(input)
  }

  function handleReset() {
    setConversationId(undefined)
    setCustomerId(undefined)
    setLastLanguage('en')
    setMessages([INITIAL_WA_MESSAGE])
  }

  return (
    <div className="wa-mode-wrap">
      {/* Left Column: Demo Guide & Quick-Start Prompts */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="wa-explainer">
          <span className="hero-eyebrow" style={{ marginBottom: 12 }}>
            💬 Live WhatsApp ↔ Website Continuity
          </span>
          <h1
            style={{
              margin: '0 0 10px',
              fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1.15,
            }}
          >
            Experience MotoAI on WhatsApp
          </h1>
          <p style={{ margin: '0 0 18px', color: 'var(--muted)', fontSize: 15 }}>
            Wired directly to <code>POST /api/chat</code> with{' '}
            <code>channel: &apos;whatsapp&apos;</code>. Every conversation is saved in
            PostgreSQL with a signed 7-day handoff token — tap any rich car preview card or
            WhatsApp CTA button inside the chat to jump straight to the car detail page with
            your exact WhatsApp history intact!
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 10,
              paddingTop: 14,
              borderTop: '1px dashed var(--border)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--ink-2)',
            }}
          >
            <span>✓ Exact SQL ₹ Breakups</span>
            <span>✓ Signed 7-Day Handoff</span>
            <span>✓ EN · தமிழ் · Tanglish</span>
          </div>
        </div>

        <div className="wa-explainer" style={{ padding: 20 }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700 }}>
            Quick-Start Prompt Chips
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {QUICK_START_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={isLoading}
                onClick={() => void sendMessage(prompt)}
                className="prompt-chip"
                style={{
                  background: 'var(--brand-soft)',
                  borderColor: 'rgba(11, 110, 110, 0.28)',
                  color: 'var(--brand)',
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div className="wa-explainer" style={{ padding: 20 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>
            Session Telemetry
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 12,
              fontSize: 13,
            }}
          >
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>
                Channel
              </div>
              <div style={{ fontWeight: 700, marginTop: 2 }}>whatsapp</div>
            </div>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>
                Detected Language
              </div>
              <div style={{ fontWeight: 700, marginTop: 2 }}>{lastLanguage.toUpperCase()}</div>
            </div>
            <div
              style={{
                gridColumn: '1 / -1',
                padding: '10px 12px',
                borderRadius: 10,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>
                Conversation ID
              </div>
              <div
                style={{
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  wordBreak: 'break-all',
                  marginTop: 2,
                }}
              >
                {conversationId ?? 'New session (send a message to start)'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Mobile WhatsApp Phone Frame */}
      <div className="wa-phone">
        <div className="wa-screen">
          <header className="wa-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="wa-avatar">M</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>
                  MotoAI Showroom
                </div>
                <div style={{ fontSize: 11.5, opacity: 0.88 }}>
                  {isLoading ? 'typing…' : 'online · Verified Business'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleReset}
              style={{
                background: 'rgba(255,255,255,0.14)',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 8,
                padding: '5px 10px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              New Chat
            </button>
          </header>

          <div className="wa-thread">
            <div
              style={{
                alignSelf: 'center',
                background: '#e1f3fb',
                color: '#3b4a54',
                fontSize: 11.5,
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 8,
                boxShadow: '0 1px 1px rgba(0,0,0,0.06)',
              }}
            >
              Messages are powered live by MotoAI Agent
            </div>

            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user'
              const carPreviews =
                !isUser && idx > 0
                  ? extractCarPreviews({
                      content: msg.content,
                      ctaButtons: msg.ctaButtons,
                    })
                  : []

              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                    gap: 6,
                  }}
                >
                  <div className={`wa-msg ${isUser ? 'out' : 'in'}`}>
                    <div>{msg.content}</div>
                    <span className="wa-time">
                      {msg.timestamp} {isUser ? '✓✓' : ''}
                    </span>
                  </div>

                  {/* Rich Car Preview Strip inside WhatsApp */}
                  {carPreviews.length > 0 && (
                    <div className="chat-car-strip" aria-label="Matched showroom cars">
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
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                              {car.subtitle}
                            </div>
                            <Link
                              href={car.href}
                              className="btn btn-wa btn-sm"
                              style={{ marginTop: 4, width: '100%', fontSize: 11.5 }}
                            >
                              View Breakup →
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* WhatsApp CTA URL Handoff Buttons */}
                  {!isUser && msg.ctaButtons && msg.ctaButtons.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 5,
                        width: '88%',
                      }}
                    >
                      {msg.ctaButtons.map((cta) => (
                        <Link
                          key={cta.url}
                          href={cta.url}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            padding: '9px 12px',
                            borderRadius: 10,
                            background: '#ffffff',
                            color: '#027eb5',
                            border: '1px solid rgba(2, 126, 181, 0.28)',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                            fontSize: 12.5,
                            fontWeight: 700,
                            textAlign: 'center',
                          }}
                        >
                          <span>🔗</span>
                          <span>{cta.displayText}</span>
                        </Link>
                      ))}
                    </div>
                  )}

                  {/* WhatsApp Interactive Quick-Reply Buttons */}
                  {!isUser &&
                    idx === messages.length - 1 &&
                    !isLoading &&
                    msg.quickReplies &&
                    msg.quickReplies.length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 6,
                          maxWidth: '90%',
                        }}
                      >
                        {msg.quickReplies.map((qr) => (
                          <button
                            key={qr.id}
                            type="button"
                            onClick={() => void sendMessage(qr.title)}
                            style={{
                              padding: '7px 11px',
                              borderRadius: 10,
                              background: '#ffffff',
                              color: '#075e54',
                              border: '1px solid rgba(7, 94, 84, 0.28)',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
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
              <div className="wa-msg in" style={{ color: '#667781' }}>
                MotoAI is typing…
              </div>
            )}

            <div ref={endRef} />
          </div>

          <form className="wa-composer" onSubmit={handleSubmit}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a WhatsApp message…"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              aria-label="Send WhatsApp message"
              className="wa-send"
            >
              ➤
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
