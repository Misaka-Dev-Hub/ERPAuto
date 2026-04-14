# ERPAuto Test Improvement Plan

**Generated:** 2026-04-04  
**Framework:** Vitest 4.0.18 + Playwright 1.58.2  
**Current Status:** 44 test files, ~200 passing tests, 48 failures (20 suites + 28 tests)

---

## Executive Summary

| Metric           | Current | Target (3mo) | Target (6mo) |
| ---------------- | ------- | ------------ | ------------ |
| Test Files       | 44      | 60           | 80           |
| Passing Tests    | ~200    | 350          | 500+         |
| Failed Suites    | 20      | 0            | 0            |
| Failed Tests     | 28      | <10          | <5           |
| Empty Test Files | ~17     | 0            | 0            |
| E2E Coverage     | 4 files | 12 files     | 20+ files    |
| Code Coverage    | ~35%    | 60%          | 80%          |

---

## Issue Analysis

### Critical Issues Identified

1. **Electron Mock Incomplete (P0)** - Missing `app.getVersion()` and other APIs
2. **Winston Mock Broken (P0)** - `format().printf()` not a function
3. **Environment Credentials Missing (P1)** - No `.env` file for ERP credentials
4. **Empty Test Files (P1)** - 17 test files with 0-2 tests
5. **E2E Coverage Gap (P2)** - Only 4 E2E tests for entire Electron app

---

## Phase 1: Immediate Fixes (Week 1-2)

### P0 - Critical Infrastructure

#### Task 1.1: Complete Electron Mock in setup.ts

**Priority:** P0 - Blocks 20 test suites  
**Estimated Effort:** 2 hours  
**Dependencies:** None  
**Owner:** Development Team

**Problem:**
Current mock missing critical Electron APIs causing import failures:

- `app.getVersion()` - Used by update services
- `app.getName()` - Used by logging
- `dialog.showErrorBox()` - Used by bootstrap
- `BrowserWindow.getAllWindows()` - Used by renderer

**Solution:**

```typescript
// tests/setup.ts - Enhanced Electron Mock
vi.mock('electron', () => {
  const mockApp = {
    isPackaged: false,
    isReady: vi.fn().mockReturnValue(true),
    getPath: vi.fn((name: string) => {
      const paths: Record<string, string> = {
        userData: path.join(process.cwd(), 'test-user-data'),
        logs: path.join(process.cwd(), 'test-logs'),
        temp: path.join(process.cwd(), 'test-temp')
      }
      return paths[name] || process.cwd()
    }),
    getVersion: vi.fn(() => '1.9.0-test'),
    getName: vi.fn(() => 'ERPAuto'),
    on: vi.fn(),
    off: vi.fn()
  }

  return {
    app: mockApp,
    ipcMain: {
      handle: vi.fn(),
      on: vi.fn(),
      removeHandler: vi.fn()
    },
    dialog: {
      showErrorBox: vi.fn(),
      showMessageBox: vi.fn()
    },
    BrowserWindow: {
      getAllWindows: vi.fn(() => []),
      fromWebContents: vi.fn()
    },
    shell: {
      openPath: vi.fn(),
      openExternal: vi.fn()
    }
  }
})
```

**Success Criteria:**

- [ ] All 20 failing test suites pass
- [ ] Zero Electron import errors in test output
- [ ] `bootstrap-runtime.test.ts` passes all 3 tests

**Verification Steps:**

```bash
# Run bootstrap tests specifically
npm run test:run tests/unit/bootstrap-runtime.test.ts

# Run all unit tests
npm run test:run tests/unit/

# Expected: Zero suite failures from Electron mocks
```

---

#### Task 1.2: Fix Winston Logger Mock

**Priority:** P0 - Blocks 11 logger tests  
**Estimated Effort:** 1.5 hours  
**Dependencies:** None

**Problem:**
Current winston mock doesn't properly implement `format.printf()`:

```typescript
formatFn = vi.fn((fn: any) => fn && fn()) // Returns undefined
formatFn.printf = vi.fn((fn: any) => fn) // Should return formatter
```

**Solution:**

```typescript
// tests/setup.ts - Enhanced Winston Mock
vi.mock('winston', () => {
  const createLoggerInstance = {
    level: 'info',
    add: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    child: vi.fn(function (this: any, metadata: Record<string, unknown>) {
      return {
        ...this,
        info: vi.fn((message: string, meta?: Record<string, unknown>) => {
          winstonCalls.push({ level: 'info', message, meta: { ...metadata, ...meta } })
        }),
        error: vi.fn((message: string, meta?: Record<string, unknown>) => {
          winstonCalls.push({ level: 'error', message, meta: { ...metadata, ...meta } })
        }),
        warn: vi.fn((message: string, meta?: Record<string, unknown>) => {
          winstonCalls.push({ level: 'warn', message, meta: { ...metadata, ...meta } })
        }),
        debug: vi.fn((message: string, meta?: Record<string, unknown>) => {
          winstonCalls.push({ level: 'debug', message, meta: { ...metadata, ...meta } })
        })
      }
    }),
    info: vi.fn((message, meta) => {
      winstonCalls.push({ level: 'info', message, meta })
    }),
    error: vi.fn((message, meta) => {
      winstonCalls.push({ level: 'error', message, meta })
    }),
    warn: vi.fn((message, meta) => {
      winstonCalls.push({ level: 'warn', message, meta })
    }),
    debug: vi.fn((message, meta) => {
      winstonCalls.push({ level: 'debug', message, meta })
    })
  }

  // Properly implemented format functions
  const formatFn = Object.assign(
    vi.fn((callback: Function) => {
      return { transform: callback }
    }),
    {
      combine: vi.fn((...formats: any[]) => ({ type: 'combine', formats })),
      timestamp: vi.fn((options?: any) => ({ type: 'timestamp', options })),
      colorize: vi.fn(() => ({ type: 'colorize' })),
      printf: vi.fn((callback: Function) => {
        return { transform: callback }
      }),
      json: vi.fn(() => ({ type: 'json' })),
      simple: vi.fn(() => ({ type: 'simple' })),
      pretty: vi.fn(() => ({ type: 'pretty' })),
      label: vi.fn((options?: any) => ({ type: 'label', options }))
    }
  ) as any

  return {
    default: {
      createLogger: vi.fn(() => createLoggerInstance),
      format: formatFn,
      transports: {
        Console: vi.fn(function Console(this: any, options?: any) {
          this.level = options?.level || 'info'
        }),
        DailyRotateFile: vi.fn(function DailyRotateFile(this: any, options?: any) {
          this.options = options
        }),
        File: vi.fn()
      },
      addColors: vi.fn()
    }
  }
})
```

**Success Criteria:**

- [ ] All 11 logger tests in `logger.test.ts` pass
- [ ] `format.printf()` returns callable formatter
- [ ] Child logger work with metadata

**Verification Steps:**

```bash
npm run test:run tests/unit/logger.test.ts
# Expected: 18/18 tests passing
```

---

#### Task 1.3: Create Test Environment Configuration

**Priority:** P0 - Blocks environment tests  
**Estimated Effort:** 0.5 hours  
**Dependencies:** None

**Problem:**
`tests/debug/env.test.ts` fails because no `.env` file exists with ERP credentials.

**Solution:**

Create `tests/.env.test` file:

```env
# Test Environment Configuration
# DO NOT COMMIT REAL CREDENTIALS

# Test ERP Instance (use sandbox/test environment)
ERP_URL=https://test-erp.example.com
ERP_USERNAME=test_automation_user
ERP_PASSWORD=test_password_placeholder

# Test Database (use isolated test DB)
TEST_DB_HOST=localhost
TEST_DB_PORT=3306
TEST_DB_NAME=erpauto_test
TEST_DB_USERNAME=test_user
TEST_DB_PASSWORD=test_password

# Test Settings
TEST_ENV=true
CI=true
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
```

Update `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'
import dotenv from 'dotenv'

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, 'tests/.env.test') })

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
```

**Success Criteria:**

- [ ] `env.test.ts` can access environment variables
- [ ] Tests run with `NODE_ENV=test`
- [ ] No hardcoded credentials in source

**Verification Steps:**

```bash
npm run test:run tests/debug/env.test.ts
# Check: Test shows loaded credentials (may skip if placeholder values)
```

---

## Phase 2: Short-Term Improvements (Week 3-6)

### P1 - Empty Test File Completion

#### Task 2.1: Populate Empty Unit Tests

**Priority:** P1  
**Estimated Effort:** 16 hours (2 hours per file × 8 files)  
**Dependencies:** Task 1.1, Task 1.2 complete

**Files to Populate:**

| File                                  | Current | Target Tests | Domain         |
| ------------------------------------- | ------- | ------------ | -------------- |
| `unit/cleaner.test.ts`                | 0       | 8            | ERP Cleaner    |
| `unit/extractor.test.ts`              | 2       | 10           | ERP Extractor  |
| `unit/data-importer.test.ts`          | 0       | 6            | Database       |
| `unit/erp-auth.unit.test.ts`          | 0       | 8            | Authentication |
| `unit/update-catalog-service.test.ts` | 0       | 6            | Update System  |
| `unit/update-installer.test.ts`       | 2       | 6            | Update System  |
| `unit/mysql.test.ts`                  | 0       | 5            | Database       |
| `unit/sql-server.test.ts`             | 0       | 5            | Database       |

**Template for Unit Tests:**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ServiceClass } from '../../../src/main/services/domain/service'

// Mock dependencies
vi.mock('../../../src/main/services/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

describe('ServiceClass', () => {
  let service: ServiceClass

  beforeEach(() => {
    vi.clearAllMocks()
    // Initialize service with test config
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Constructor', () => {
    it('should create instance with valid config', () => {
      const config = {
        /* test config */
      }
      service = new ServiceClass(config)
      expect(service).toBeDefined()
    })

    it('should throw on invalid config', () => {
      expect(() => new ServiceClass(null as any)).toThrow()
    })
  })

  describe('Public Method A', () => {
    it('should return expected result', async () => {
      const result = await service.methodA('input')
      expect(result).toEqual('expected')
    })

    it('should handle edge case', async () => {
      const result = await service.methodA('')
      expect(result).toBeNull()
    })

    it('should log errors appropriately', async () => {
      await expect(service.methodA('error-case')).rejects.toThrow()
    })
  })
})
```

**Success Criteria:**

- [ ] All 8 files have 5-10 meaningful tests each
- [ ] Total 50+ new unit tests added
- [ ] All new tests pass
- [ ] Code coverage increases by 15%

**Verification Steps:**

```bash
npm run test:run tests/unit/ -- --reporter=verbose
# Check: All previously empty files now have passing tests
```

---

#### Task 2.2: Complete Integration Tests

**Priority:** P1  
**Estimated Effort:** 12 hours  
**Dependencies:** Task 2.1 complete

**Files to Populate:**

| File                              | Current | Target Tests | Domain               |
| --------------------------------- | ------- | ------------ | -------------------- |
| `integration/cleaner.test.ts`     | 0       | 6            | ERP Integration      |
| `integration/extractor.test.ts`   | 0       | 6            | ERP Integration      |
| `integration/mysql.test.ts`       | 0       | 5            | Database Integration |
| `integration/sql-server.test.ts`  | 0       | 5            | Database Integration |
| `integration/erp-auth.test.ts`    | 0       | 4            | Auth Integration     |
| `integration/ipc-logging.test.ts` | 0       | 4            | IPC Integration      |

**Integration Test Template:**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ServiceClass } from '../../../src/main/services/domain/service'

describe('ServiceClass Integration', () => {
  const testConfig = {
    // Use test environment config
    useTestDatabase: true
  }

  beforeAll(async () => {
    // Setup test database or external service
  })

  afterAll(async () => {
    // Cleanup test data
  })

  it('should perform end-to-end operation', async () => {
    const service = new ServiceClass(testConfig)
    const result = await service.execute()

    expect(result).toBeDefined()
    expect(result.status).toBe('success')
  })
})
```

**Success Criteria:**

- [ ] All 6 integration test files have 4-6 tests each
- [ ] Tests use isolated test data (no production impact)
- [ ] All tests pass in CI environment
- [ ] Integration test suite runs in <5 minutes

---

#### Task 2.3: Fix Existing Test Issues

**Priority:** P1  
**Estimated Effort:** 4 hours  
**Dependencies:** Task 1.1, 1.2 complete

**Known Issues to Fix:**

1. **`getErrorMessage should handle unknown types`** (errors.test.ts)

   ```typescript
   // Fix: Add proper type guard handling
   it('should handle unknown types', () => {
     const unknown = { message: 'test' }
     expect(getErrorMessage(unknown as any)).toBe('test')
   })
   ```

2. **Repository tests** (repositories.test.ts)

   ```typescript
   // Fix: Proper TypeORM mocking
   vi.mock('typeorm', () => ({
     DataSource: vi.fn().mockImplementation(() => ({
       initialize: vi.fn(),
       destroy: vi.fn(),
       getRepository: vi.fn()
     }))
   }))
   ```

3. **Audit logger tests** (audit-logger.test.ts)
   ```typescript
   // Fix: Winston transport mocking
   vi.mock('winston', async (importOriginal) => {
     const actual = await importOriginal()
     return {
       ...actual,
       createLogger: vi.fn(() => ({
         // ... proper mock
       }))
     }
   })
   ```

**Success Criteria:**

- [ ] All 28 previously failing tests now pass
- [ ] No test skipped or marked as todo
- [ ] Test output is clean (no warnings)

**Verification:**

```bash
npm run test:run 2>&1 | Select-String -Pattern "failed|FAIL" -Context 2
# Expected: Zero failures
```

---

## Phase 3: Medium-Term Goals (Month 2-3)

### P2 - E2E Coverage Expansion

#### Task 3.1: Map Critical User Journeys

**Priority:** P2  
**Estimated Effort:** 4 hours  
**Dependencies:** None

**User Journeys to Cover:**

1. **Authentication & User Management**
   - Silent login with saved credentials
   - Manual login with username/password
   - Password recovery flow
   - User role switching (Admin/User/Guest)
   - Session timeout and re-authentication

2. **Data Extraction Workflow**
   - Navigate to extractor page
   - Enter order numbers (single/multiple)
   - Configure batch size
   - Start extraction
   - Monitor progress
   - View/download results
   - Handle extraction errors

3. **Material Cleaning Workflow**
   - Navigate to cleaner page
   - Enter order numbers and material codes
   - Toggle dry-run mode
   - Execute cleaning
   - Review deletion statistics
   - Handle errors

4. **Configuration Management**
   - Open settings dialog
   - Update ERP credentials
   - Configure database settings
   - Adjust application preferences
   - Save and validate configuration

5. **Update System**
   - Check for updates
   - View update catalog
   - Download update
   - Install update
   - Handle update failures

**Success Criteria:**

- [ ] Document all critical user journeys
- [ ] Prioritize journeys by business impact
- [ ] Create E2E test specification document

---

#### Task 3.2: Implement E2E Test Framework Enhancements

**Priority:** P2  
**Estimated Effort:** 8 hours  
**Dependencies:** Task 3.1 complete

**Enhancements Needed:**

1. **Test Fixtures & Page Objects**

```typescript
// tests/e2e/fixtures/login-fixture.ts
export class LoginFixture {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/')
  }

  async login(username: string, password: string) {
    await this.page.fill('[data-testid="username"]', username)
    await this.page.fill('[data-testid="password"]', password)
    await this.page.click('[data-testid="login-button"]')
    await this.page.waitForSelector('[data-testid="main-content"]')
  }

  async logout() {
    await this.page.click('[data-testid="user-menu"]')
    await this.page.click('[data-testid="logout-button"]')
  }
}

// tests/e2e/pages/extractor-page.ts
export class ExtractorPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.click('[data-testid="extractor-nav"]')
  }

  async enterOrders(orders: string[]) {
    await this.page.fill('[data-testid="order-input"]', orders.join('\n'))
  }

  async setBatchSize(size: number) {
    await this.page.fill('[data-testid="batch-size"]', size.toString())
  }

  async startExtraction() {
    await this.page.click('[data-testid="start-extraction"]')
  }
}
```

2. **Test Utilities**

```typescript
// tests/e2e/utils/test-helpers.ts
export async function waitForStableUI(page: Page, timeout = 5000) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500) // Allow animations to complete
}

export async function captureState(page: Page, name: string) {
  await page.screenshot({
    path: `test-results/screenshots/${name}.png`,
    fullPage: true
  })
}
```

3. **Shared Test Data**

```typescript
// tests/e2e/fixtures/test-data.ts
export const TEST_DATA = {
  validUser: {
    username: 'test_user',
    password: 'test_password',
    role: 'User'
  },
  adminUser: {
    username: 'admin',
    password: 'admin_password',
    role: 'Admin'
  },
  testOrders: ['SC12345678901234', 'SC12345678901235'],
  testMaterials: ['MAT001', 'MAT002', 'MAT003']
}
```

**Success Criteria:**

- [ ] Page object models created for all major views
- [ ] Test utilities reduce code duplication
- [ ] Test data centralized and maintainable

---

#### Task 3.3: Write E2E Tests for Core Features

**Priority:** P2  
**Estimated Effort:** 24 hours (3 hours per test file × 8 new files)  
**Dependencies:** Task 3.2 complete

**New E2E Test Files:**

| File                          | Tests | Priority | Description                   |
| ----------------------------- | ----- | -------- | ----------------------------- |
| `login-flow.test.ts`          | 6     | High     | Complete authentication flows |
| `extractor-workflow.test.ts`  | 8     | High     | Data extraction E2E           |
| `cleaner-workflow.test.ts`    | 8     | High     | Material cleaning E2E         |
| `settings-management.test.ts` | 6     | Medium   | Configuration management      |
| `error-handling.test.ts`      | 5     | Medium   | Error states & recovery       |
| `navigation.test.ts`          | 4     | Medium   | App navigation & routing      |
| `update-workflow.test.ts`     | 5     | Low      | Update download/install       |
| `accessibility.test.ts`       | 4     | Low      | Basic accessibility checks    |

**Example E2E Test Structure:**

```typescript
// tests/e2e/login-flow.test.ts
import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'
import { LoginFixture } from './fixtures/login-fixture'
import { TEST_DATA } from './fixtures/test-data'

test.describe('Login Flow', () => {
  let electronApp: ElectronApplication
  let page: Page
  let login: LoginFixture

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../out/main/index.js')],
      env: { NODE_ENV: 'test' }
    })
    page = await electronApp.firstWindow()
    login = new LoginFixture(page)
  })

  test.afterAll(async () => {
    await electronApp?.close()
  })

  test('should login with valid credentials', async () => {
    await login.goto()
    await login.login(TEST_DATA.validUser.username, TEST_DATA.validUser.password)

    await expect(page.locator('[data-testid="main-content"]')).toBeVisible()
    await expect(page.locator('[data-testid="user-greeting"]')).toContainText(
      TEST_DATA.validUser.username
    )
  })

  test('should show error on invalid credentials', async () => {
    await login.goto()
    await login.login('invalid', 'wrong')

    await expect(page.locator('[data-testid="error-message"]')).toBeVisible()
    await expect(page.locator('[data-testid="error-message"]')).toContainText('Invalid credentials')
  })

  test('should handle silent login', async () => {
    // Assume previous session exists
    await login.goto()
    await page.waitForLoadState('networkidle')

    // Should auto-navigate to main content
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible({ timeout: 10000 })
  })

  test('should logout successfully', async () => {
    await login.goto()
    await login.login(TEST_DATA.validUser.username, TEST_DATA.validUser.password)
    await login.logout()

    await expect(page.locator('[data-testid="login-form"]')).toBeVisible()
  })
})
```

**Success Criteria:**

- [ ] 8 new E2E test files created
- [ ] 50+ E2E tests total
- [ ] All critical user journeys covered
- [ ] E2E tests run reliably in CI
- [ ] Test flakiness < 5%

**Verification:**

```bash
npm run test:e2e -- --reporter=list
# Expected: All E2E tests pass consistently
```

---

### P2 - Test Data Management

#### Task 3.4: Create Test Data Factory

**Priority:** P2  
**Estimated Effort:** 6 hours  
**Dependencies:** None

**Purpose:** Centralized test data generation for consistent, isolated tests.

**Implementation:**

```typescript
// tests/fixtures/factory.ts
export class TestFactory {
  static createOrder(overrides?: Partial<Order>): Order {
    return {
      id: `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      number: `SC${Date.now().toString().substr(-8)}`,
      status: 'pending',
      ...overrides
    }
  }

  static createMaterial(overrides?: Partial<Material>): Material {
    return {
      id: `MAT-${Date.now()}`,
      code: `TEST_MAT_${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      description: 'Test Material',
      ...overrides
    }
  }

  static createUser(role: 'admin' | 'user' | 'guest' = 'user'): User {
    return {
      id: `USR-${Date.now()}`,
      username: `test_${role}_${Date.now()}`,
      password: 'test_password',
      role,
      permissions: this.getPermissionsForRole(role)
    }
  }

  private static getPermissionsForRole(role: string): string[] {
    const permissions: Record<string, string[]> = {
      admin: ['read', 'write', 'delete', 'admin'],
      user: ['read', 'write'],
      guest: ['read']
    }
    return permissions[role] || []
  }
}
```

**Success Criteria:**

- [ ] Factory provides methods for all domain entities
- [ ] Tests use factory instead of hardcoded data
- [ ] Each test gets unique, isolated data
- [ ] No test pollution from shared state

---

## Phase 4: Long-Term Strategy (Month 4-6)

### P3 - CI/CD Integration

#### Task 4.1: Configure GitHub Actions CI

**Priority:** P3  
**Estimated Effort:** 8 hours  
**Dependencies:** Phase 1-3 complete

**Workflow: `.github/workflows/test.yml`**

```yaml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: windows-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run type check
        run: npm run typecheck

      - name: Run unit tests
        run: npm run test:run -- --coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/coverage-final.json
          flags: unit-tests

  integration-tests:
    runs-on: windows-latest
    timeout-minutes: 20
    needs: unit-tests

    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: test_password
          MYSQL_DATABASE: erpauto_test
        options: >-
          --health-cmd="mysqladmin ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5
        ports:
          - 3306:3306

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Setup test database
        run: |
          npm run db:migrate:test

      - name: Run integration tests
        run: npm run test:run tests/integration/

  e2e-tests:
    runs-on: windows-latest
    timeout-minutes: 30
    needs: integration-tests

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run build

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7

      - name: Upload screenshots
        uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: test-screenshots
          path: test-results/
          retention-days: 7
```

**Success Criteria:**

- [ ] CI pipeline runs on every PR
- [ ] Unit tests complete in <10 minutes
- [ ] Integration tests complete in <15 minutes
- [ ] E2E tests complete in <20 minutes
- [ ] Coverage reports uploaded automatically
- [ ] Failed tests create artifacts for debugging

---

#### Task 4.2: Add Coverage Thresholds

**Priority:** P3  
**Estimated Effort:** 2 hours  
**Dependencies:** Task 4.1 complete

**Configuration (`vitest.config.ts`):**

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules',
        'src/tests',
        '**/*.d.ts',
        '**/*.config.*',
        '**/types/**',
        'out',
        'dist'
      ],
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
          branches: 75,
          functions: 85,
          lines: 85,
          statements: 85
        }
      }
    }
  }
})
```

**CI Enforcement (`.github/workflows/test.yml`):**

```yaml
- name: Check coverage thresholds
  run: |
    $coverage = Get-Content coverage/coverage-final.json | ConvertFrom-Json
    $lines = $coverage.total.lines.pct

    if ($lines -lt 70) {
      Write-Error "Coverage $lines% is below threshold of 70%"
      exit 1
    }
```

**Success Criteria:**

- [ ] Coverage thresholds enforced in CI
- [ ] PRs fail if coverage drops below threshold
- [ ] Critical modules have higher thresholds
- [ ] Coverage reports accessible via CI artifacts

---

#### Task 4.3: Implement Test Health Monitoring

**Priority:** P3  
**Estimated Effort:** 4 hours  
**Dependencies:** Task 4.1 complete

**Metrics to Track:**

1. **Test Duration Trends**
   - Track test execution time over builds
   - Alert on tests exceeding time thresholds
   - Identify slow tests for optimization

2. **Flakiness Detection**
   - Track tests that fail intermittently
   - Auto-retry flaky tests once
   - Generate flakiness reports

3. **Coverage Trends**
   - Track coverage changes per PR
   - Alert on coverage regression
   - Identify untested critical paths

**Dashboard Integration:**

```yaml
# .github/workflows/test-metrics.yml
- name: Upload test metrics
  run: |
    npm run test:metrics

- name: Publish to dashboard
  uses: ./actions/publish-metrics
  with:
    token: ${{ secrets.DASHBOARD_TOKEN }}
```

**Success Criteria:**

- [ ] Test metrics collected every build
- [ ] Dashboard shows test health trends
- [ ] Flaky tests automatically identified
- [ ] Coverage trends visible over time

---

### P3 - Test Quality Improvements

#### Task 4.4: Add Mutation Testing

**Priority:** P3  
**Estimated Effort:** 6 hours  
**Dependencies:** Phase 1-3 complete

**Tool:** Stryker Mutator (when available for Vitest)

**Configuration (`stryker.conf.json`):**

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "_comment": "Stryker configuration for mutation testing",
  "packageManager": "npm",
  "reporters": ["html", "clear-text", "progress"],
  "testRunner": "vitest",
  "testRunner_comment": "Vitest support via community plugin",
  "coverageAnalysis": "perTest",
  "thresholds": {
    "high": 80,
    "low": 60,
    "break": 60
  },
  "mutate": [
    "src/main/services/**/*.ts",
    "!src/main/services/**/*.test.ts",
    "!src/main/services/**/*.spec.ts"
  ]
}
```

**Success Criteria:**

- [ ] Mutation score > 60%
- [ ] Mutation report generated per build
- [ ] Critical mutations identified and tested

---

#### Task 4.5: Implement Visual Regression Testing (Optional)

**Priority:** P3  
**Estimated Effort:** 8 hours  
**Dependencies:** Task 3.2 complete

**Purpose:** Catch unintended UI changes

**Implementation:**

```typescript
// tests/e2e/visual-regression.test.ts
import { test, expect } from '@playwright/test'

test.describe('Visual Regression', () => {
  test('main dashboard should match baseline', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page).toHaveScreenshot('main-dashboard.png', {
      fullPage: true,
      maxDiffPixels: 100 // Allow small dynamic differences
    })
  })

  test('login dialog should match baseline', async ({ page }) => {
    await page.goto('/')

    const loginDialog = page.locator('[data-testid="login-dialog"]')
    await expect(loginDialog).toHaveScreenshot('login-dialog.png')
  })
})
```

**Success Criteria:**

- [ ] Baseline screenshots captured
- [ ] Visual diffs on each PR
- [ ] False positive rate < 10%

---

## Success Metrics & QA Verification

### Phase Completion Criteria

| Phase       | Success Metrics                          | QA Verification               |
| ----------- | ---------------------------------------- | ----------------------------- |
| **Phase 1** | Zero suite failures, all mocks working   | `npm run test:run` exits 0    |
| **Phase 2** | All empty files populated, 50+ new tests | Coverage report shows +15%    |
| **Phase 3** | 50+ E2E tests, all journeys covered      | `npm run test:e2e` runs clean |
| **Phase 4** | CI pipeline green, coverage > 70%        | PR requires passing CI        |

### Verification Commands

```bash
# Full test suite
npm run test:run
npm run test:e2e

# Coverage report
npm run test:coverage

# Type checking
npm run typecheck

# Build verification
npm run build

# Combined quality gate
npm run typecheck && npm run test:run && npm run build
```

### Quality Gates

Before marking any phase complete:

1. **All tests pass** - No failures, no skips
2. **No new lint errors** - `npm run lint` clean
3. **TypeScript compiles** - `npm run typecheck` exits 0
4. **Application builds** - `npm run build` exits 0
5. **Coverage maintained** - No regression in critical areas

---

## Risk Mitigation

### Identified Risks

| Risk                                  | Impact | Mitigation                                           |
| ------------------------------------- | ------ | ---------------------------------------------------- |
| ERP credentials unavailable for tests | High   | Use mocked ERP service, sandbox environment          |
| Database tests pollute production     | High   | Use isolated test database, transaction rollback     |
| E2E tests flaky                       | Medium | Retry logic, better selectors, wait utilities        |
| Test execution too slow               | Medium | Parallel execution, test splitting, caching          |
| Coverage thresholds block PRs         | Low    | Gradual threshold increase, exclude legitimate cases |

### Rollback Plan

If test improvements cause issues:

1. Revert test changes via git
2. Restore previous `vitest.config.ts`
3. Disable failing tests temporarily with `describe.skip`
4. Fix root cause before re-enabling

---

## Appendix A: Test File Inventory

### Current Unit Tests (28 files)

```
tests/unit/
├── auth-handler.test.ts              ✓ Passing
├── audit-logger.test.ts              ⚠ Partial failures
├── bootstrap-runtime.test.ts         ⚠ All failing
├── cleaner-handler.test.ts           ✓ Passing
├── cleaner-helpers.test.ts           ✓ Passing
├── cleaner.test.ts                   ✗ Empty
├── data-importer.test.ts             ✗ Empty
├── errors.test.ts                    ⚠ Partial failures
├── excel-parser.test.ts              ✓ Passing
├── extractor.test.ts                 ✗ Minimal tests
├── file-ipc-paths.test.ts            ✓ Passing (minimal)
├── ipc-index.test.ts                 ✓ Passing (minimal)
├── logger-integration.test.ts        ⚠ Partial failures
├── logger.test.ts                    ⚠ All failing
├── locators.test.ts                  ✓ Passing
├── mysql.test.ts                     ✗ Empty
├── preload-surface.test.ts           ✓ Passing (minimal)
├── production-input-service.test.ts  ✓ Passing (minimal)
├── repositories.test.ts              ⚠ All failing
├── request-context.test.ts           ✓ Passing
├── schemas.test.ts                   ✓ Passing
├── shared-production-ids-store.test.ts ✓ Passing
├── sql-server.test.ts                ✗ Empty
├── update-catalog-service.test.ts    ✗ Empty
├── update-installer.test.ts          ✗ Minimal tests
├── update-service.test.ts            ⚠ Partial failures
├── update-status-publisher.test.ts   ✓ Passing
├── update-utils.test.ts              ✓ Passing
└── services/
    ├── erp/
    │   ├── erp-error-context.test.ts ✓ Passing
    │   └── page-diagnostics.test.ts  ✓ Passing
    └── logger/
        └── error-utils.test.ts       ✓ Passing
```

### Current Integration Tests (8 files)

```
tests/integration/
├── cleaner.test.ts                   ✗ Empty
├── erp-auth.test.ts                  ✗ Empty
├── extractor.test.ts                 ✗ Empty
├── ipc-logging.test.ts               ✗ Empty
├── logger-performance.test.ts        ✓ Passing
├── mysql.test.ts                     ✗ Empty
├── sql-server.test.ts                ✗ Empty
└── test-merge.test.ts                ⚠ Skipped
```

### Current E2E Tests (4 files)

```
tests/e2e/
├── auth-flow.test.ts                 ⚠ Basic tests
├── dialog-focus.test.ts              ✓ Passing
├── extractor-workflow.test.ts        ✓ Passing
└── login-flow.test.ts                ⚠ Needs expansion
```

### Debug & Manual Tests (4 files)

```
tests/debug/
└── env.test.ts                       ⚠ Fails (no .env)

tests/manual/
├── cleaner-slow-motion.test.ts       ✗ Manual test
└── test-merge.test.ts                ⚠ Skipped
```

---

## Appendix B: Recommended Project Structure

```
tests/
├── setup.ts                          # Global test setup
├── .env.test                         # Test environment variables
├── fixtures/
│   ├── factory.ts                    # Test data factory
│   ├── test-data.ts                  # Shared test data
│   └── index.ts                      # Fixture exports
├── e2e/
│   ├── fixtures/
│   │   ├── login-fixture.ts
│   │   └── test-data.ts
│   ├── pages/
│   │   ├── login-page.ts
│   │   ├── extractor-page.ts
│   │   └── cleaner-page.ts
│   ├── utils/
│   │   └── test-helpers.ts
│   ├── *.test.ts                     # E2E test files
│   └── playwright.config.ts          # E2E config
├── integration/
│   ├── *.test.ts                     # Integration test files
│   └── helpers/
│       └── database-helpers.ts       # DB test utilities
├── unit/
│   ├── *.test.ts                     # Unit test files
│   └── mocks/
│       ├── electron.ts               # Electron mock
│       ├── winston.ts                # Winston mock
│       └── typeorm.ts                # TypeORM mock
└── debug/
    └── *.test.ts                     # Debug tests
```

---

## Appendix C: Test Writing Guidelines

### Best Practices

1. **Test Naming**

   ```typescript
   // Good: Descriptive
   it('should return null when order number is invalid', () => {})

   // Bad: Vague
   it('should work', () => {})
   ```

2. **Arrange-Act-Assert Pattern**

   ```typescript
   it('should create order', async () => {
     // Arrange
     const orderData = { id: '123', status: 'pending' }

     // Act
     const result = await service.createOrder(orderData)

     // Assert
     expect(result.status).toBe('pending')
   })
   ```

3. **Test Isolation**
   - Each test should be independent
   - Use `beforeEach` for setup, `afterEach` for cleanup
   - Never share state between tests

4. **Mock External Dependencies**

   ```typescript
   vi.mock('external-lib', () => ({
     functionName: vi.fn().mockResolvedValue('mocked')
   }))
   ```

5. **Test Edge Cases**
   - Empty inputs
   - Maximum values
   - Invalid formats
   - Network failures
   - Race conditions

### Anti-Patterns to Avoid

1. **Testing Implementation Details**

   ```typescript
   // Bad: Tests internal state
   expect(service.internalCounter).toBe(5)

   // Good: Tests behavior
   expect(await service.process()).toEqual(expected)
   ```

2. **Over-Mocking**

   ```typescript
   // Bad: Mocking everything
   vi.mock('all', 'the', 'dependencies')

   // Good: Mock only external services
   vi.mock('database')
   vi.mock('external-api')
   ```

3. **Magic Numbers**

   ```typescript
   // Bad
   await page.waitForTimeout(3000)

   // Good
   const ANIMATION_DURATION = 300
   await page.waitForTimeout(ANIMATION_DURATION)
   ```

---

## Next Steps

1. **Week 1:** Implement Phase 1 (P0 fixes)
2. **Week 2-3:** Implement Phase 2 (populate empty tests)
3. **Month 2-3:** Implement Phase 3 (E2E expansion)
4. **Month 4-6:** Implement Phase 4 (CI/CD integration)

**Review Cadence:**

- Daily: Check test execution results
- Weekly: Review test coverage trends
- Monthly: Assess progress against milestones

**Success Celebration:**

- Phase 1 complete: Team demo of passing tests
- Phase 2 complete: Coverage report presentation
- Phase 3 complete: E2E demo to stakeholders
- Phase 4 complete: CI/CD pipeline showcase

---

**Document Owner:** Development Team  
**Last Updated:** 2026-04-04  
**Review Schedule:** Monthly
