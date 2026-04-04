/**
 * ERPAuto Mock Library
 *
 * Central export point for all mock types and factory functions.
 * Use this module to import mock types for unit testing.
 *
 * @module mocks
 */

import { vi } from 'vitest'
import path from 'path'

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
  MockBrowserWindow,
  MockIpcRenderer,
  MockElectron,

  // TypeORM mocks
  MockDataSource,
  MockRepository,
  MockQueryBuilder,

  // DatabaseService mocks
  MockDatabaseService,
  QueryResult
} from './types'

// Factory function types
export type {
  MockLoggerOptions,
  MockConfigManagerOptions,
  MockErpAuthOptions,
  MockLoggerFactory,
  MockConfigManagerFactory,
  MockErpAuthFactory,
  MockElectronFactory,
  MockIpcRendererFactory,
  MockTypeormOptions,
  MockTypeormFactory,
  MockDatabaseServiceOptions,
  MockDatabaseServiceFactory
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
 * @param options.isLoggedIn - Whether the session should start as logged in
 * @param options.loginFails - Whether login() should throw an error
 * @param options.config - ERP config to use
 * @param options.overrides - Override specific methods
 * @returns Mock ERP auth service
 *
 * @example
 * ```typescript
 * const erpAuth = createMockErpAuthService({
 *   isLoggedIn: true,
 *   loginFails: false
 * })
 * ```
 */
export function createMockErpAuthService(
  options?: import('./types').MockErpAuthOptions
): import('./types').MockErpAuthService {
  const isLoggedIn = options?.isLoggedIn ?? false
  const shouldFail = options?.loginFails ?? false

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
    login: vi.fn().mockImplementation(async () => {
      if (shouldFail) {
        throw new Error('Login failed')
      }
      return mockSession
    }),
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
// Additional Mock Factories
// ============================================================================

/**
 * Create a mock fs (file system) module
 *
 * @returns Mock fs module with vi.fn() implementations
 *
 * @example
 * ```typescript
 * const fs = createMockFs()
 * fs.readFileSync.mockReturnValue('file content')
 * ```
 */
export function createMockFs() {
  return {
    readFile: vi.fn().mockResolvedValue('content'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    readFileSync: vi.fn(() => 'content'),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn()
  }
}

/**
 * Create a mock path module
 *
 * @returns Mock path module with vi.fn() implementations
 *
 * @example
 * ```typescript
 * const path = createMockPath()
 * path.join.mockReturnValue('/test/path')
 * ```
 */
export function createMockPath() {
  return {
    join: vi.fn((...args) => args.join('/')),
    resolve: vi.fn((...args) => args.join('/')),
    basename: vi.fn((p) => p.split('/').pop() || ''),
    dirname: vi.fn((p) => p.split('/').slice(0, -1).join('/')),
    extname: vi.fn((p) => (p.includes('.') ? '.' + p.split('.').pop() : '')),
    isAbsolute: vi.fn((p) => p.startsWith('/'))
  }
}

/**
 * Create a mock ExcelJS workbook
 *
 * @returns Mock ExcelJS workbook with vi.fn() implementations
 *
 * @example
 * ```typescript
 * const workbook = createMockExcelJS()
 * workbook.xlsx.readFile.mockResolvedValue(undefined)
 * ```
 */
export function createMockExcelJS() {
  return {
    xlsx: {
      readFile: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      writeBuffer: vi.fn().mockResolvedValue(Buffer.from([])),
      readBuffer: vi.fn().mockResolvedValue(undefined)
    },
    creator: 'test',
    lastModifiedBy: 'test',
    created: new Date(),
    modified: new Date(),
    addWorksheet: vi.fn().mockReturnValue({}),
    getWorksheet: vi.fn().mockReturnValue({}),
    eachSheet: vi.fn()
  }
}

/**
 * Create a mock axios instance
 *
 * @returns Mock axios instance with vi.fn() implementations
 *
 * @example
 * ```typescript
 * const axios = createMockAxios()
 * axios.get.mockResolvedValue({ data: { result: 'ok' } })
 * ```
 */
export function createMockAxios() {
  return {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    request: vi.fn().mockResolvedValue({ data: {} })
  }
}

/**
 * Create a mock child_process module
 *
 * @returns Mock child_process module with vi.fn() implementations
 *
 * @example
 * ```typescript
 * const cp = createMockChildProcess()
 * cp.execSync.mockReturnValue('output')
 * ```
 */
export function createMockChildProcess() {
  return {
    exec: vi.fn().mockReturnValue({ stdout: '', stderr: '', code: 0 }),
    execSync: vi.fn(() => 'output'),
    spawn: vi.fn().mockReturnValue({
      stdin: { write: vi.fn(), end: vi.fn() },
      stdout: { on: vi.fn(), data: '' },
      stderr: { on: vi.fn(), data: '' },
      on: vi.fn(),
      pid: 12345
    }),
    spawnSync: vi.fn(() => ({ stdout: 'output', stderr: '', status: 0 }))
  }
}

/**
 * Create a mock crypto module
 *
 * @returns Mock crypto module with vi.fn() implementations
 *
 * @example
 * ```typescript
 * const crypto = createMockCrypto()
 * crypto.randomBytes.mockReturnValue(Buffer.from([1, 2, 3]))
 * ```
 */
export function createMockCrypto() {
  return {
    randomBytes: vi.fn().mockReturnValue(Buffer.from([1, 2, 3, 4, 5])),
    createHash: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn(() => 'hash-value')
    }),
    randomUUID: vi.fn(() => '12345678-1234-1234-1234-123456789012'),
    pbkdf2Sync: vi.fn(() => Buffer.from('derived-key')),
    scryptSync: vi.fn(() => Buffer.from('derived-key')),
    createCipheriv: vi.fn().mockReturnValue({
      update: vi.fn(() => Buffer.from('')),
      final: vi.fn(() => Buffer.from(''))
    }),
    createDecipheriv: vi.fn().mockReturnValue({
      update: vi.fn(() => Buffer.from('')),
      final: vi.fn(() => Buffer.from(''))
    })
  }
}

// ============================================================================
// Electron & IPC Renderer Mock Factories
// ============================================================================

/**
 * Create a mock IPC Renderer instance
 *
 * Provides vi.fn() mocks for all IPC Renderer methods used in the application.
 * Suitable for testing preload scripts and renderer components that use IPC.
 *
 * @param overrides - Optional overrides for specific methods
 * @returns Mock IPC Renderer matching Electron.IpcRenderer API
 *
 * @example
 * ```typescript
 * const ipcRenderer = createMockIpcRenderer({
 *   invoke: vi.fn().mockResolvedValue({ success: true, data: 'test' })
 * })
 *
 * // Use in tests
 * await ipcRenderer.invoke('user:login', 'admin', 'password')
 * expect(ipcRenderer.invoke).toHaveBeenCalledWith('user:login', 'admin', 'password')
 * ```
 */
export function createMockIpcRenderer(
  overrides?: Partial<import('./types').MockIpcRenderer>
): import('./types').MockIpcRenderer {
  return {
    invoke: vi.fn().mockResolvedValue(null),
    send: vi.fn(),
    on: vi.fn().mockReturnThis(),
    once: vi.fn().mockReturnThis(),
    removeListener: vi.fn().mockReturnThis(),
    removeAllListeners: vi.fn().mockReturnThis(),
    ...overrides
  }
}

/**
 * Create a mock Electron API instance
 *
 * Combines app, ipcMain, ipcRenderer, dialog, shell, and BrowserWindow mocks
 * into a single object compatible with src/preload/api.ts return type.
 *
 * Use this for testing IPC handlers, preload scripts, or renderer components
 * that need access to Electron APIs.
 *
 * @param overrides - Optional overrides for specific modules (app, ipcRenderer, etc.)
 * @returns Mock Electron API matching src/preload/api structure
 *
 * @example
 * ```typescript
 * const electron = createMockElectron({
 *   ipcRenderer: {
 *     invoke: vi.fn().mockResolvedValue({ success: true, user: { id: 1 } })
 *   },
 *   app: {
 *     getVersion: vi.fn(() => '2.0.0-test')
 *   }
 * })
 *
 * // Use in tests
 * const result = await electron.ipcRenderer?.invoke('user:getCurrent')
 * expect(result).toEqual({ success: true, user: { id: 1 } })
 * ```
 */
export function createMockElectron(
  overrides?: Partial<import('./types').MockElectron>
): import('./types').MockElectron {
  // Import the electron mock from setup.ts for consistency
  const electronMock = vi.mocked(import('electron'))

  return {
    app: {
      isPackaged: false,
      isReady: vi.fn().mockReturnValue(true),
      getPath: vi.fn((name: string) => {
        const paths: Record<string, string> = {
          userData: path.join(process.cwd(), 'test-user-data'),
          logs: path.join(process.cwd(), 'test-logs'),
          temp: path.join(process.cwd(), 'test-temp'),
          appData: path.join(process.cwd(), 'test-app-data'),
          desktop: path.join(process.cwd(), 'test-desktop'),
          documents: path.join(process.cwd(), 'test-documents'),
          downloads: path.join(process.cwd(), 'test-downloads')
        }
        return paths[name] || process.cwd()
      }),
      getVersion: vi.fn(() => '1.9.0-test'),
      getName: vi.fn(() => 'ERPAuto'),
      getAppPath: vi.fn(() => path.join(process.cwd(), 'test-app-path')),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      emit: vi.fn(),
      isDefaultProtocolClient: vi.fn(() => true),
      quit: vi.fn(),
      relaunch: vi.fn(),
      exit: vi.fn(),
      focus: vi.fn(),
      blur: vi.fn(),
      isQuitting: vi.fn(() => false),
      isAccessibilityEnabled: vi.fn(() => true),
      getApplicationNameForProtocol: vi.fn(() => null)
    },
    ipcMain: {
      handle: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      removeHandler: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn()
    },
    dialog: {
      showErrorBox: vi.fn(),
      showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: true }),
      showSaveDialog: vi.fn().mockResolvedValue({ canceled: true })
    },
    shell: {
      openPath: vi.fn().mockResolvedValue(''),
      openExternal: vi.fn().mockResolvedValue(undefined),
      showItemInFolder: vi.fn(),
      trashItem: vi.fn()
    },
    BrowserWindow: {
      getAllWindows: vi.fn(() => []),
      fromWebContents: vi.fn(() => null),
      fromId: vi.fn(() => null),
      getFocusedWindow: vi.fn(() => null)
    },
    // Override with custom ipcRenderer if not using default
    ipcRenderer: createMockIpcRenderer(),
    ...overrides
  }
}

// ============================================================================
// TypeORM Mock Factory Functions
// ============================================================================

/**
 * Create a mock TypeORM QueryBuilder instance
 *
 * @param options - Options including query results
 * @returns Mock QueryBuilder with vi.fn() implementations
 *
 * @example
 * ```typescript
 * const qb = createMockQueryBuilder({ result: [{ id: 1 }] })
 * ```
 */
export function createMockQueryBuilder(options?: {
  result?: Record<string, unknown>[]
}): import('./types').MockQueryBuilder {
  const mockResult = options?.result ?? []
  return {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue(mockResult),
    getOne: vi.fn().mockResolvedValue(mockResult[0] ?? null),
    getRawMany: vi.fn().mockResolvedValue(mockResult),
    getRawOne: vi.fn().mockResolvedValue(mockResult[0] ?? null),
    delete: vi.fn().mockResolvedValue({ affected: mockResult.length }),
    count: vi.fn().mockResolvedValue(mockResult.length),
    setParameter: vi.fn().mockReturnThis(),
    setParameters: vi.fn().mockReturnThis()
  }
}

/**
 * Create a mock TypeORM Repository instance
 *
 * @param options - Options including find results
 * @returns Mock Repository with vi.fn() implementations
 *
 * @example
 * ```typescript
 * const repo = createMockRepository({ findResult: [{ id: 1, name: 'Test' }] })
 * ```
 */
export function createMockRepository(options?: {
  findResult?: Record<string, unknown>[]
}): import('./types').MockRepository {
  const mockFindResult = options?.findResult ?? []
  return {
    find: vi.fn().mockResolvedValue(mockFindResult),
    findOne: vi.fn().mockResolvedValue(mockFindResult[0] ?? null),
    create: vi.fn((plainObject?: Record<string, unknown>) => plainObject ?? ({})),
    save: vi.fn().mockImplementation((entity: Record<string, unknown>) => Promise.resolve(entity)),
    delete: vi.fn().mockResolvedValue({ affected: 1 }),
    count: vi.fn().mockResolvedValue(mockFindResult.length),
    createQueryBuilder: vi      .fn()
      .mockImplementation(() => createMockQueryBuilder({ result: mockFindResult }))
  }
}

/**
 * Create a mock TypeORM DataSource instance
 *
 * @param options - Options including initialization state and query results
 * @returns Mock DataSource with vi.fn() implementations
 *
 * @example
 * ```typescript
 * const ds = createMockDataSource({
 *   isInitialized: true,
 *   queryResult: [{ id: 1 }]
 * })
 * ```
 */
export function createMockDataSource(
  options?: import('./types').MockTypeormOptions
): import('./types').MockDataSource {
  const isInitialized = options?.isInitialized ?? false
  const queryResult = options?.queryResult ?? []
  const mockRepo = createMockRepository({ findResult: queryResult })

  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    isInitialized,
    getRepository: vi.fn().mockReturnValue(mockRepo),
    create: vi.fn().mockImplementation(
      (_entityClass: unknown, plainObject?: Record<string, unknown>) => plainObject ?? ({} as Record<string, unknown>)
    ),
    save: vi.fn().mockImplementation((entity: Record<string, unknown>) => Promise.resolve(entity)),
    createQueryBuilder: vi
      .fn()
      .mockImplementation(() => createMockQueryBuilder({ result: queryResult })),
    ...options?.overrides
  }
}

// ============================================================================
// DatabaseService Mock Factory Functions
// ============================================================================

/**
 * Create a mock DatabaseService instance
 *
 * @param options - Options including connection state and query results
 * @returns Mock DatabaseService with vi.fn() implementations
 *
 * @example
 * ```typescript
 * const db = createMockDatabaseService({
 *   type: 'mysql',
 *   isConnected: true,
 *   queryResult: [{ id: 1, name: 'Test' }]
 * })
 * ```
 */
export function createMockDatabaseService(
  options?: import('./types').MockDatabaseServiceOptions
): import('./types').MockDatabaseService {
  const type = options?.type ?? 'mysql'
  const connected = options?.isConnected ?? false
  const queryResult = options?.queryResult ?? []

  return {
    type,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(connected),
    query: vi.fn().mockResolvedValue({
      rows: queryResult,
      columns: queryResult.length > 0 ? Object.keys(queryResult[0]) : [],
      rowCount: queryResult.length
    }),
    transaction: vi.fn().mockImplementation(async (fn) => fn()),
    ...options?.overrides
  }
}

// ============================================================================
// Re-export existing Electron mocks from setup.ts (for convenience)
// ============================================================================
// Note: The actual mock implementations are in tests/setup.ts
// This file provides type definitions and factory function signatures
