/**
 * ERPAuto Mock Library
 *
 * Central export point for all mock types and factory functions.
 * Use this module to import mock types for unit testing.
 *
 * @module mocks
 */

import { vi } from 'vitest'

// ============================================================================
// Type Exports
// ============================================================================

// Config-compatible types
export type {
  LogLevel,
  DatabaseType,
  MySqlConfig,
  SqlServerConfig,
  DatabaseConfig,
  ErpConfig,
  PathsConfig,
  ExtractionConfig,
  ValidationConfig,
  CleanerConfig,
  OrderResolutionConfig,
  LoggingConfig,
  SeqConfig,
  RustFSConfig,
  UpdateConfig,
  FullConfig
} from './types'

// Mock interfaces
export type {
  // Logger mocks
  MockLogger,

  // ConfigManager mocks
  MockConfigManager,

  // ERP Auth mocks
  MockErpAuthService,
  MockErpSession,

  // Playwright mocks
  MockBrowser,
  MockBrowserContext,
  MockPage,
  MockFrame,
  MockLocator,

  // Electron mocks
  MockElectronApp,
  MockIpcMain,
  MockDialog,
  MockShell,
  MockBrowserWindowConstructor,
  MockBrowserWindow
} from './types'

// Factory function types
export type {
  MockLoggerOptions,
  MockConfigManagerOptions,
  MockErpAuthOptions,
  MockLoggerFactory,
  MockConfigManagerFactory,
  MockErpAuthFactory
} from './types'

// ============================================================================
// Factory Function Skeletons (to be implemented)
// ============================================================================

/**
 * Create a mock logger instance with vi.fn() implementations
 *
 * @param overrides - Optional overrides for specific methods
 * @returns Mock logger matching winston.Logger API
 *
 * @example
 * ```typescript
 * const logger = createMockLogger({
 *   info: vi.fn()
 * })
 * ```
 */
export function createMockLogger(
  overrides?: Partial<import('./types').MockLogger>
): import('./types').MockLogger {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    child: vi.fn().mockImplementation((context: string) => createMockLogger(overrides)),
    ...overrides
  }
}

/**
 * Create a mock ConfigManager instance
 *
 * @param config - Optional partial config to use as initial state
 * @returns Mock config manager
 *
 * @example
 * ```typescript
 * const configManager = createMockConfigManager({
 *   logging: { level: 'debug', auditRetention: 30, appRetention: 14 }
 * })
 * ```
 */
export function createMockConfigManager(
  config?: Partial<import('./types').FullConfig>
): import('./types').MockConfigManager {
  const defaultConfig: import('./types').FullConfig = {
    erp: { url: 'https://test-erp.local' },
    database: {
      activeType: 'mysql',
      mysql: {
        host: 'localhost',
        port: 3306,
        database: 'test_db',
        username: 'test',
        password: 'test',
        charset: 'utf8mb4'
      },
      sqlserver: {
        server: 'localhost',
        port: 1433,
        database: 'test_db',
        username: 'test',
        password: 'test',
        driver: 'ODBC Driver 18 for SQL Server',
        trustServerCertificate: true
      }
    },
    paths: {
      dataDir: './test-data/',
      defaultOutput: 'test-output.xlsx',
      validationOutput: 'test-validation.xlsx'
    },
    extraction: {
      batchSize: 100,
      verbose: false,
      autoConvert: true,
      mergeBatches: true,
      enableDbPersistence: false,
      headless: true
    },
    validation: {
      dataSource: 'test',
      batchSize: 1000,
      matchMode: 'exact',
      enableCrud: false,
      defaultManager: ''
    },
    cleaner: {
      queryBatchSize: 100,
      processConcurrency: 1
    },
    orderResolution: {
      tableName: '',
      productionIdField: '',
      orderNumberField: ''
    },
    logging: {
      level: 'info',
      auditRetention: 30,
      appRetention: 14
    },
    seq: {
      enabled: false,
      serverUrl: '',
      apiKey: '',
      batchPostingLimit: 50,
      period: 2000,
      queueLimit: 10000,
      maxRetries: 3
    },
    rustfs: {
      enabled: false,
      endpoint: '',
      accessKey: '',
      secretKey: '',
      bucket: 'test',
      region: 'us-east-1'
    },
    update: {
      enabled: false,
      allowDevMode: false,
      endpoint: '',
      accessKey: '',
      secretKey: '',
      bucket: '',
      region: '',
      basePrefix: 'test',
      checkIntervalMinutes: 30,
      maxAdminHistoryPerChannel: 10
    }
  }

  const mergedConfig = { ...defaultConfig, ...config }

  return {
    getConfig: vi.fn().mockReturnValue(mergedConfig),
    getActiveDatabaseConfig: vi.fn().mockReturnValue(mergedConfig.database.mysql),
    getDatabaseType: vi.fn().mockReturnValue(mergedConfig.database.activeType),
    getLoggingConfig: vi.fn().mockReturnValue(mergedConfig.logging),
    updateConfig: vi.fn().mockResolvedValue({ success: true }),
    resetToDefaults: vi.fn().mockResolvedValue(true),
    getDefaultConfig: vi.fn().mockReturnValue(defaultConfig),
    exportToYaml: vi.fn().mockReturnValue(''),
    ...config
  } as import('./types').MockConfigManager
}

/**
 * Create a mock ErpAuthService instance
 *
 * @param options - Options including initial login state and config
 * @returns Mock ERP auth service
 *
 * @example
 * ```typescript
 * const erpAuth = createMockErpAuthService({
 *   isLoggedIn: true,
 *   config: { url: 'https://test-erp.local' }
 * })
 * ```
 */
export function createMockErpAuthService(
  options?: import('./types').MockErpAuthOptions
): import('./types').MockErpAuthService {
  const isLoggedIn = options?.isLoggedIn ?? false

  const mockSession: import('./types').MockErpSession = {
    browser: {
      close: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true)
    },
    context: {
      close: vi.fn().mockResolvedValue(undefined),
      newPage: vi.fn().mockResolvedValue(createMockPage())
    },
    page: createMockPage(),
    mainFrame: createMockFrame(),
    isLoggedIn
  }

  return {
    login: vi.fn().mockResolvedValue(mockSession),
    close: vi.fn().mockResolvedValue(undefined),
    getSession: vi.fn().mockReturnValue(mockSession),
    isActive: vi.fn().mockReturnValue(isLoggedIn),
    ...options?.overrides
  }
}

/**
 * Create a mock Playwright Page instance
 *
 * @returns Mock page with vi.fn() implementations
 */
function createMockPage(): import('./types').MockPage {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
    content: vi.fn().mockResolvedValue(''),
    close: vi.fn().mockResolvedValue(undefined),
    locator: vi.fn().mockImplementation((selector: string) => createMockLocator()),
    getByRole: vi.fn().mockImplementation((role: string) => createMockLocator())
  }
}

/**
 * Create a mock Playwright Frame instance
 *
 * @returns Mock frame with vi.fn() implementations
 */
function createMockFrame(): import('./types').MockFrame {
  return {
    content: vi.fn().mockResolvedValue(''),
    locator: vi.fn().mockImplementation((selector: string) => createMockLocator()),
    getByRole: vi.fn().mockImplementation((role: string) => createMockLocator()),
    waitForSelector: vi.fn().mockResolvedValue(undefined)
  }
}

/**
 * Create a mock Playwright Locator instance
 *
 * @returns Mock locator with vi.fn() implementations
 */
function createMockLocator(): import('./types').MockLocator {
  return {
    fill: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    isVisible: vi.fn().mockResolvedValue(false),
    textContent: vi.fn().mockResolvedValue(null),
    getAttribute: vi.fn().mockResolvedValue(null)
  }
}

// ============================================================================
// Re-export existing Electron mocks from setup.ts (for convenience)
// ============================================================================
// Note: The actual mock implementations are in tests/setup.ts
// This file provides type definitions and factory function signatures
