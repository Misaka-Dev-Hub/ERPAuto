import { beforeAll, afterAll } from 'vitest'
import dotenv from 'dotenv'
import path from 'path'

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
