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
    // 性能优化配置
    isolate: false, // 禁用隔离（提升 30-50% 速度）
    pool: 'threads', // 使用线程池
    maxWorkers: 4,
    bail: process.env.CI ? 1 : undefined,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      thresholds: {
        global: {
          branches: 60,
          functions: 70,
          lines: 70,
          statements: 70
        },
        'src/main/services/erp/**': {
          branches: 70,
          functions: 80,
          lines: 80,
          statements: 80
        },
        'src/main/services/update/**': {
          branches: 70,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
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
