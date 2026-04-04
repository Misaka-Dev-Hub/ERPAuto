import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'out', 'tests/e2e'],
    setupFiles: ['tests/setup.ts'],
    env: {
      NODE_ENV: 'test'
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  },
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, './src/main'),
      '@services': path.resolve(__dirname, './src/main/services'),
      '@types': path.resolve(__dirname, './src/main/types'),
      '@': path.resolve(__dirname, './src')
    }
  }
})
