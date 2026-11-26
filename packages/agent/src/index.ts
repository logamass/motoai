/**
 * @motoai/agent — AI Agent framework.
 *
 * Provides the agent loop, tool execution, playbook loading,
 * guardrails, and language detection.
 */

export { defineTool } from './tool-registry.js'
export { runAgent, type AgentContext, type AgentMessage } from './loop.js'
export { detectLanguage, type Language } from './language.js'
export { checkGuardrails, type GuardrailResult } from './guardrails.js'
export { loadPlaybook, listPlaybooks } from './playbook-loader.js'
