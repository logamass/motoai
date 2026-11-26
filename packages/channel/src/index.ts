/**
 * @motoai/channel — Messaging channel adapters and inbound router.
 */

export type {
  ChannelType,
  QuickReplyButton,
  CtaUrlButton,
  InboundMessage,
  OutboundMessage,
  ChannelAdapter,
} from './types.js'

export { routeInboundMessage } from './router.js'

export {
  whatsappAdapter,
  verifyChallenge,
  verifySignature,
  parseWhatsAppInbound,
  sendWhatsAppOutbound,
  isWithin24HourWindow,
  buildTemplatePayload,
  chunkLongMessage,
  type WhatsAppSendResult,
  type WhatsAppSendOptions,
  type WhatsAppTemplateName,
  type WhatsAppTemplatePayload,
  type ChallengeInput,
} from './adapters/whatsapp.js'

export {
  webWidgetAdapter,
  parseWebWidgetInbound,
  sendWebWidgetOutbound,
  formatSseEvent,
  type WebWidgetPayload,
} from './adapters/web-widget.js'
