/**
 * Channel types — shared message and adapter contracts for messaging channels.
 */

export type ChannelType = 'whatsapp' | 'web' | 'telegram'

export interface QuickReplyButton {
  id: string
  title: string
}

export interface CtaUrlButton {
  displayText: string
  url: string
  headerText?: string
  footerText?: string
}

export interface InboundMessage {
  channel: ChannelType
  messageId: string
  conversationId: string
  senderId: string
  senderName?: string
  text: string
  timestamp: Date
  metadata?: Record<string, unknown>
}

export interface OutboundMessage {
  channel: ChannelType
  recipientId: string
  conversationId: string
  text: string
  quickReplies?: QuickReplyButton[]
  buttons?: QuickReplyButton[]
  ctaButton?: CtaUrlButton
  ctaUrl?: CtaUrlButton | string
  language?: string
  humanTakeover?: boolean
  toolCalls?: Array<{ name: string; input: unknown; result: unknown }>
  metadata?: Record<string, unknown>
}

export interface ChannelAdapter<TSendResult = void> {
  readonly name: ChannelType
  parseInbound(payload: unknown): InboundMessage[]
  sendOutbound(message: OutboundMessage): Promise<TSendResult>
  verifyWebhook?(req: Request, rawBody?: string): Promise<boolean> | boolean
}
