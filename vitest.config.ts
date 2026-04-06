import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'out', 'tests/e2e', 'tests/integration'],
    setupFiles: ['tests/setup.ts'],
    env: {
      NODE_ENV: 'test'
    },
    // CI 环境启用隔离以捕获跨文件状态污染；本地开发禁用以提升速度
    isolate: !!process.env.CI,
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
