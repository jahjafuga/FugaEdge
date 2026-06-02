import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // react() gives the .test.tsx lane the automatic JSX runtime (components use
  // no `import React`). It only transforms JSX/TSX; plain .ts is untouched.
  plugins: [react()],
  test: {
    // Default env stays node — the existing .test.ts suites run exactly as
    // before. Only .test.tsx is routed to jsdom for component rendering.
    environment: 'node',
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],
    setupFiles: ['src/test/setup-jsdom.ts'],
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'src/**/__tests__/**/*.{test,spec}.{ts,tsx}',
      'electron/**/__tests__/**/*.{test,spec}.ts',
    ],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'shared'),
    },
  },
})
