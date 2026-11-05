import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = path.dirname(fileURLToPath(import.meta.url))

// Tests never read .env, so they cannot reach the development database by accident.
const testDatabaseURL = process.env.TEST_POSTGRES_URL ?? 'postgres:///multi_tenant_test'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(root, 'src'),
      '@payload-config': path.join(root, 'src/payload.config.ts'),
    },
  },
  test: {
    env: {
      AI_GATEWAY_API_KEY: '',
      AI_MOCK: 'true',
      PAYLOAD_SECRET: 'test-secret',
      POSTGRES_URL: testDatabaseURL,
      SEED_DB: '',
    },
    // Integration tests share one database.
    fileParallelism: false,
    globalSetup: ['./tests/helpers/globalSetup.ts'],
    hookTimeout: 120_000,
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
  },
})
