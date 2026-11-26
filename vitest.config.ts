import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@motoai/core/boot': resolve(__dirname, 'packages/core/src/boot.ts'),
      '@motoai/core/config': resolve(__dirname, 'packages/core/src/config/index.ts'),
      '@motoai/core/db': resolve(__dirname, 'packages/core/src/db/index.ts'),
      '@motoai/core/events': resolve(__dirname, 'packages/core/src/events/index.ts'),
      '@motoai/core/queue': resolve(__dirname, 'packages/core/src/queue/index.ts'),
      '@motoai/core/storage': resolve(__dirname, 'packages/core/src/storage/index.ts'),
      '@motoai/core/auth': resolve(__dirname, 'packages/core/src/auth/index.ts'),
      '@motoai/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@motoai/agent/tools': resolve(__dirname, 'packages/agent/src/tool-registry.ts'),
      '@motoai/agent': resolve(__dirname, 'packages/agent/src/index.ts'),
      '@motoai/channel': resolve(__dirname, 'packages/channel/src/index.ts'),
      '@motoai/mod-catalog/schema': resolve(__dirname, 'modules/catalog/src/schema.ts'),
      '@motoai/mod-catalog': resolve(__dirname, 'modules/catalog/src/index.ts'),
      '@motoai/mod-pricing/schema': resolve(__dirname, 'modules/pricing/src/schema.ts'),
      '@motoai/mod-pricing/validators': resolve(__dirname, 'modules/pricing/src/validators.ts'),
      '@motoai/mod-pricing': resolve(__dirname, 'modules/pricing/src/index.ts'),
      '@motoai/mod-ingestion/schema': resolve(__dirname, 'modules/ingestion/src/schema.ts'),
      '@motoai/mod-ingestion': resolve(__dirname, 'modules/ingestion/src/index.ts'),
      '@motoai/mod-customers/schema': resolve(__dirname, 'modules/customers/src/schema.ts'),
      '@motoai/mod-customers': resolve(__dirname, 'modules/customers/src/index.ts'),
      '@motoai/mod-leads/schema': resolve(__dirname, 'modules/leads/src/schema.ts'),
      '@motoai/mod-leads': resolve(__dirname, 'modules/leads/src/index.ts'),
      '@motoai/mod-handoff/schema': resolve(__dirname, 'modules/handoff/src/schema.ts'),
      '@motoai/mod-handoff': resolve(__dirname, 'modules/handoff/src/index.ts'),
      '@motoai/mod-analytics/schema': resolve(__dirname, 'modules/analytics/src/schema.ts'),
      '@motoai/mod-analytics': resolve(__dirname, 'modules/analytics/src/index.ts'),
    },
  },
})
