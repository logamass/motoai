/**
 * Tool registry — modules register tools here.
 *
 * Usage in a module:
 *   import { defineTool } from '@motoai/agent/tools'
 *
 *   export const searchCars = defineTool({
 *     name: 'search_cars',
 *     description: 'Search for cars matching criteria',
 *     parameters: { ... },
 *     handler: async (params, ctx) => { ... },
 *   })
 */

import type { ToolDefinition } from '@motoai/core'

/**
 * Define a tool for the AI agent.
 * Type-safe wrapper — validates the definition at compile time.
 */
export function defineTool<TParams = any>(def: ToolDefinition): ToolDefinition {
  if (!def.name || !def.handler) {
    throw new Error(`Tool definition must have 'name' and 'handler'`)
  }
  return def
}

/**
 * Convert our tool definitions to Anthropic API format.
 */
export function toAnthropicTools(tools: ToolDefinition[]): any[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: 'object',
      properties: t.parameters,
      required: Object.entries(t.parameters)
        .filter(([_, v]: [string, any]) => v.required)
        .map(([k]) => k),
    },
  }))
}
