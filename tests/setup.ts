import { beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

beforeAll(async () => {
  // Global test setup
  console.log('Test suite starting...');
});

afterAll(async () => {
  // Global test teardown
  console.log('Test suite completed.');
});