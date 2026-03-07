import { beforeAll, afterAll, vi } from 'vitest'
import dotenv from 'dotenv'
import path from 'path'

// Mock electron app module for unit tests
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    isReady: vi.fn().mockReturnValue(false),
    getPath: vi.fn().mockReturnValue(path.join(process.cwd(), 'logs')),
    on: vi.fn()
  }
}))

// Load environment variables from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

beforeAll(async () => {
  // Global test setup
  console.log('Test suite starting...')
})

afterAll(async () => {
  // Global test teardown
  console.log('Test suite completed.')
})
