/**
 * Mock Type Definitions for ERPAuto Unit Tests
 *
 * This module provides strongly-typed Mock interfaces and factory function signatures
 * for all core services that need to be mocked in unit tests.
 *
 * Design Principles:
 * - Zero any types - all mocks are fully typed
 * - Use vi.fn() mocks for all methods
 * - Factory functions accept Partial<T> overrides for customization
 * - JSDoc comments on all types and functions
 *
 * Usage:
 * - Import types from this file in test files
 * - Use vi.fn() to create mock implementations
 * - Factory functions provide sensible defaults
 *
 * Note: This file defines standalone mock types compatible with src/main interfaces.
 * Import actual Config/Logger/Erp types from src/main in test files when needed.
 */

import { vi } from 'vitest'
import type { Browser, BrowserContext, Page, Frame } from 'playwright'

// ============================================================================
// Re-exported/Compatible Types from src/main (for mock compatibility)
// ============================================================================

/**
 * Logging level type - must match src/main/services/logger/index.ts
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose'

/**
 * Database type enum - must match src/main/types/config.schema.ts
 */
export type DatabaseType = 'mysql' | 'sqlserver'

/**
 * MySQL configuration - compatible with src/main/types/config.schema.ts
 */
export interface MySqlConfig {
  host: string
  port: number
  database: string
  username: string
  password: string
  charset: string
}

/**
 * SQL Server configuration - compatible with src/main/types/config.schema.ts
 */
export interface SqlServerConfig {
  server: string
  port: number
  database: string
  username: string
  password: string
  driver: string
  trustServerCertificate: boolean
}

/**
 * Database configuration section - compatible with src/main/types/config.schema.ts
 */
export interface DatabaseConfig {
  activeType: DatabaseType
  mysql: MySqlConfig
  sqlserver: SqlServerConfig
}

/**
 * ERP configuration - compatible with src/main/types/config.schema.ts
 */
export interface ErpConfig {
  url: string
}

/**
 * Paths configuration - compatible with src/main/types/config.schema.ts
 */
export interface PathsConfig {
  dataDir: string
  defaultOutput: string
  validationOutput: string
}

/**
 * Extraction configuration - compatible with src/main/types/config.schema.ts
 */
export interface ExtractionConfig {
  batchSize: number
  verbose: boolean
  autoConvert: boolean
  mergeBatches: boolean
  enableDbPersistence: boolean
  headless: boolean
}

/**
 * Validation configuration - compatible with src/main/types/config.schema.ts
 */
export interface ValidationConfig {
  dataSource: string
  batchSize: number
  matchMode: string
  enableCrud: boolean
  defaultManager: string
}

/**
 * Cleaner configuration - compatible with src/main/types/config.schema.ts
 */
export interface CleanerConfig {
  queryBatchSize: number
  processConcurrency: number
}

/**
 * Order resolution configuration - compatible with src/main/types/config.schema.ts
 */
export interface OrderResolutionConfig {
  tableName: string
  productionIdField: string
  orderNumberField: string
}

/**
 * Logging configuration - compatible with src/main/types/config.schema.ts
 */
export interface LoggingConfig {
  level: LogLevel
  auditRetention: number
  appRetention: number
}

/**
 * Seq configuration - compatible with src/main/types/config.schema.ts
 */
export interface SeqConfig {
  enabled: boolean
  serverUrl: string
  apiKey: string
  batchPostingLimit: number
  period: number
  queueLimit: number
  maxRetries: number
}

/**
 * RustFS configuration - compatible with src/main/types/config.schema.ts
 */
export interface RustFSConfig {
  enabled: boolean
  endpoint: string
  accessKey: string
  secretKey: string
  bucket: string
  region: string
}

/**
 * Update configuration - compatible with src/main/types/config.schema.ts
 */
export interface UpdateConfig {
  enabled: boolean
  allowDevMode: boolean
  endpoint: string
  accessKey: string
  secretKey: string
  bucket: string
  region: string
  basePrefix: string
  checkIntervalMinutes: number
  maxAdminHistoryPerChannel: number
}

/**
 * Full application configuration - compatible with src/main/types/config.schema.ts
 */
export interface FullConfig {
  erp: ErpConfig
  database: DatabaseConfig
  paths: PathsConfig
  extraction: ExtractionConfig
  validation: ValidationConfig
  cleaner: CleanerConfig
  orderResolution: OrderResolutionConfig
  logging: LoggingConfig
  seq: SeqConfig
  rustfs: RustFSConfig
  update: UpdateConfig
}

// ============================================================================
// Logger Mock Types
// ============================================================================

/**
 * Mock Logger interface matching winston.Logger API
 * Used for testing services that depend on logging without writing to actual log files
 */
export interface MockLogger {
  /** Log at 'error' level with error serialization */
  error: (message: string, meta?: Record<string, unknown>) => void

  /** Log at 'warn' level */
  warn: (message: string, meta?: Record<string, unknown>) => void

  /** Log at 'info' level - most common for business logic */
  info: (message: string, meta?: Record<string, unknown>) => void

  /** Log at 'debug' level for detailed diagnostic info */
  debug: (message: string, meta?: Record<string, unknown>) => void

  /** Log at 'verbose' level - most detailed tracing */
  verbose: (message: string, meta?: Record<string, unknown>) => void

  /** Create a child logger with specific context */
  child: (context: string) => MockLogger
}

// ============================================================================
// ConfigManager Mock Types
// ============================================================================

/**
 * Mock ConfigManager interface matching the production ConfigManager class
 * Used for testing services that depend on configuration without file I/O
 */
export interface MockConfigManager {
  /** Get full configuration object */
  getConfig: () => FullConfig

  /** Get currently active database config (MySQL or SQL Server) */
  getActiveDatabaseConfig: () => MySqlConfig | SqlServerConfig

  /** Get database type enum */
  getDatabaseType: () => DatabaseType

  /** Get logging configuration section */
  getLoggingConfig: () => LoggingConfig

  /** Update configuration with deep merge */
  updateConfig: (updates: Partial<FullConfig>) => Promise<{ success: boolean; error?: string }>

  /** Reset to default configuration */
  resetToDefaults: () => Promise<boolean>

  /** Get default configuration template */
  getDefaultConfig: () => FullConfig

  /** Export config as YAML string */
  exportToYaml: () => string
}

// ============================================================================
// ErpAuthService Mock Types
// ============================================================================

/**
 * Mock ErpAuthService interface matching the production ERP authentication service
 * Used for testing services that interact with ERP without actual browser automation
 *
 * Key methods:
 * - login: Establish mock ERP session
 * - close: Cleanup mock session
 * - getSession: Return mock session (must be logged in)
 * - isActive: Check if mock session is active
 */
export interface MockErpAuthService {
  /** Login to ERP system and establish mock session */
  login: () => Promise<MockErpSession>

  /** Close mock browser session and cleanup */
  close: () => Promise<void>

  /** Get current mock session (throws if not logged in) */
  getSession: () => MockErpSession

  /** Check if mock session is active */
  isActive: () => boolean
}

/**
 * Mock ERP Session interface
 * Simplified version of ErpSession for testing - uses vi.fn() mocks for Playwright objects
 */
export interface MockErpSession {
  /** Mock Playwright Browser instance */
  browser: MockBrowser

  /** Mock Playwright BrowserContext instance */
  context: MockBrowserContext

  /** Mock Playwright Page instance */
  page: MockPage

  /** Mock Playwright Frame instance (forwardFrame content) */
  mainFrame: MockFrame

  /** Whether the session is logged in */
  isLoggedIn: boolean
}

// ============================================================================
// Playwright Mock Types
// ============================================================================

/**
 * Mock Browser interface - simplified for unit testing
 * Focus on methods used in ERPAuto codebase
 */
export interface MockBrowser {
  /** Close the browser */
  close: () => Promise<void>

  /** Check if browser is connected */
  isConnected: () => boolean
}

/**
 * Mock BrowserContext interface - simplified for unit testing
 */
export interface MockBrowserContext {
  /** Close the context */
  close: () => Promise<void>

  /** Create a new page in this context */
  newPage: () => Promise<MockPage>
}

/**
 * Mock Page interface - simplified for unit testing
 * Includes commonly used Playwright Page methods
 */
export interface MockPage {
  /** Navigate to URL */
  goto: (url: string, options?: { waitUntil?: string }) => Promise<void>

  /** Wait for selector */
  waitForSelector: (
    selector: string,
    options?: { state?: string; timeout?: number }
  ) => Promise<void>

  /** Wait for load state */
  waitForLoadState: (state: string, options?: { timeout?: number }) => Promise<void>

  /** Take screenshot (mock - no actual file) */
  screenshot: (options?: { path?: string }) => Promise<Buffer>

  /** Get page content */
  content: () => Promise<string>

  /** Close the page */
  close: () => Promise<void>

  /** Mock locator */
  locator: (selector: string) => MockLocator

  /** Mock getByRole */
  getByRole: (role: string, options?: { name?: string }) => MockLocator
}

/**
 * Mock Frame interface - simplified for unit testing
 */
export interface MockFrame {
  /** Get frame content */
  content: () => Promise<string>

  /** Mock locator within frame */
  locator: (selector: string) => MockLocator

  /** Mock getByRole within frame */
  getByRole: (role: string, options?: { name?: string }) => MockLocator

  /** Wait for selector in frame */
  waitForSelector: (
    selector: string,
    options?: { state?: string; timeout?: number }
  ) => Promise<void>
}

/**
 * Mock Locator interface - simplified for unit testing
 */
export interface MockLocator {
  /** Fill input with value */
  fill: (value: string) => Promise<void>

  /** Click the element */
  click: () => Promise<void>

  /** Wait for element */
  waitFor: (options?: { state?: string; timeout?: number }) => Promise<void>

  /** Check if element is visible */
  isVisible: () => Promise<boolean>

  /** Get element text content */
  textContent: () => Promise<string | null>

  /** Get element attribute */
  getAttribute: (name: string) => Promise<string | null>
}

// ============================================================================
// Electron Mock Types (from setup.ts)
// ============================================================================

/**
 * Mock Electron app interface - matches existing setup.ts implementation
 */
export interface MockElectronApp {
  isPackaged: boolean
  isReady: () => boolean
  getPath: (name: string) => string
  getVersion: () => string
  getName: () => string
  getAppPath: () => string
  on: (event: string, listener: () => void) => void
  off: (event: string, listener: () => void) => void
  once: (event: string, listener: () => void) => void
  emit: (event: string, ...args: unknown[]) => void
  isDefaultProtocolClient: (protocol: string) => boolean
  quit: () => void
  relaunch: (options?: { args?: string[] }) => void
  exit: (code?: number) => void
  focus: () => void
  blur: () => void
  isQuitting: () => boolean
  isAccessibilityEnabled: () => boolean
  getApplicationNameForProtocol: (protocol: string) => string | null
}

/**
 * Mock IPC Main interface - matches existing setup.ts implementation
 */
export interface MockIpcMain {
  handle: (channel: string, listener: (...args: unknown[]) => void | Promise<unknown>) => void
  on: (channel: string, listener: (...args: unknown[]) => void) => void
  once: (channel: string, listener: (...args: unknown[]) => void) => void
  removeHandler: (channel: string) => void
  removeListener: (channel: string, listener: (...args: unknown[]) => void) => void
  removeAllListeners: (channel: string) => void
}

/**
 * Mock Electron Dialog interface - matches existing setup.ts implementation
 */
export interface MockDialog {
  showErrorBox: (title: string, content: string) => void
  showMessageBox: (options: unknown) => Promise<{ response: number }>
  showOpenDialog: (options: unknown) => Promise<{ canceled: boolean; filePaths?: string[] }>
  showSaveDialog: (options: unknown) => Promise<{ canceled: boolean; filePath?: string }>
}

/**
 * Mock Electron Shell interface - matches existing setup.ts implementation
 */
export interface MockShell {
  openPath: (path: string) => Promise<string>
  openExternal: (url: string) => Promise<void>
  showItemInFolder: (fullPath: string) => void
  trashItem: (fullPath: string) => void
}

/**
 * Mock Electron BrowserWindow interface - matches existing setup.ts implementation
 */
export interface MockBrowserWindowConstructor {
  getAllWindows: () => MockBrowserWindow[]
  fromWebContents: (webContents: unknown) => MockBrowserWindow | null
  fromId: (id: number) => MockBrowserWindow | null
  getFocusedWindow: () => MockBrowserWindow | null
}

/**
 * Mock BrowserWindow instance interface
 */
export interface MockBrowserWindow {
  isDestroyed: () => boolean
  close: () => void
  destroy: () => void
  webContents: {
    send: (channel: string, ...args: unknown[]) => void
    isDestroyed: () => boolean
  }
}

/**
 * Mock IPC Renderer interface - matches renderer-side IPC API
 * Used for testing preload/renderer IPC communication
 */
export interface MockIpcRenderer {
  /** Send message and wait for response */
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>

  /** Send fire-and-forget message to main process */
  send: (channel: string, ...args: unknown[]) => void

  /** Subscribe to channel events */
  on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => MockIpcRenderer

  /** Subscribe to single-use channel events */
  once: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => MockIpcRenderer

  /** Remove event listener */
  removeListener: (
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => void
  ) => MockIpcRenderer

  /** Remove all listeners for a channel */
  removeAllListeners: (channel?: string) => MockIpcRenderer
}

/**
 * Mock Electron API interface - combines app and IPC renderer for renderer tests
 * Compatible with src/preload/api.ts return type
 */
export interface MockElectron {
  /** Electron app module mock */
  app?: MockElectronApp

  /** IPC Main module mock (for main process tests) */
  ipcMain?: MockIpcMain

  /** IPC Renderer mock (for renderer process tests) */
  ipcRenderer?: MockIpcRenderer

  /** Dialog module mock */
  dialog?: MockDialog

  /** Shell module mock */
  shell?: MockShell

  /** BrowserWindow constructor mock */
  BrowserWindow?: MockBrowserWindowConstructor
}

// ============================================================================
// Factory Function Type Signatures
// ============================================================================

/**
 * Options for creating a mock logger
 */
export interface MockLoggerOptions {
  /** Custom log level filters */
  level?: LogLevel
  /** Override specific methods */
  overrides?: Partial<MockLogger>
}

/**
 * Options for creating a mock config manager
 */
export interface MockConfigManagerOptions {
  /** Initial config values to merge with defaults */
  config?: Partial<FullConfig>
  /** Override specific methods */
  overrides?: Partial<MockConfigManager>
}

/**
 * Options for creating a mock ERP auth service
 */
export interface MockErpAuthOptions {
  /** Whether the session should start as logged in */
  isLoggedIn?: boolean
  /** Whether login() should throw an error (simulate login failure) */
  loginFails?: boolean
  /** ERP config to use */
  config?: Partial<ErpConfig>
  /** Override specific methods */
  overrides?: Partial<MockErpAuthService>
}

/**
 * Create a mock logger instance
 * @param overrides - Optional overrides for specific methods or properties
 * @returns Mock logger matching winston.Logger API
 */
export type MockLoggerFactory = (overrides?: Partial<MockLogger>) => MockLogger

/**
 * Create a mock config manager instance
 * @param config - Optional partial config to use as initial state
 * @returns Mock config manager
 */
export type MockConfigManagerFactory = (config?: Partial<FullConfig>) => MockConfigManager

/**
 * Create a mock ERP auth service instance
 * @param options - Options including initial login state and config
 * @returns Mock ERP auth service
 */
export type MockErpAuthFactory = (options?: MockErpAuthOptions) => MockErpAuthService

/**
 * Create a mock Electron API instance
 * @param options - Optional overrides for specific modules (app, ipcRenderer, etc.)
 * @returns Mock Electron API matching src/preload/api structure
 *
 * @example
 * ```typescript
 * const electron = createMockElectron({
 *   ipcRenderer: {
 *     invoke: vi.fn().mockResolvedValue({ success: true })
 *   }
 * })
 * ```
 */
export type MockElectronFactory = (options?: Partial<MockElectron>) => MockElectron

/**
 * Create a mock IPC Renderer instance
 * @param options - Optional overrides for specific methods
 * @returns Mock IPC Renderer matching Electron.IpcRenderer API
 *
 * @example
 * ```typescript
 * const ipcRenderer = createMockIpcRenderer({
 *   invoke: vi.fn().mockResolvedValue({ success: true })
 * })
 * ```
 */
export type MockIpcRendererFactory = (options?: Partial<MockIpcRenderer>) => MockIpcRenderer

// ============================================================================
// TypeORM Mock Types
// ============================================================================

/**
 * Mock TypeORM DataSource interface
 * Used for testing repositories without actual database connections
 */
export interface MockDataSource {
  /** Initialize the datasource */
  initialize: () => Promise<void>

  /** Destroy the datasource */
  destroy: () => Promise<void>

  /** Check if datasource is initialized */
  isInitialized: boolean

  /** Get repository for entity */
  getRepository: (entity: any) => MockRepository

  /** Create a new entity instance */
  create: (entityClass: any, plainObject?: any) => any

  /** Save entities */
  save: (entity: any) => Promise<any>

  /** Create a query builder */
  createQueryBuilder: () => MockQueryBuilder
}

/**
 * Mock TypeORM Repository interface
 */
export interface MockRepository {
  /** Find entities matching criteria */
  find: (options?: any) => Promise<any[]>

  /** Find single entity */
  findOne: (options: any) => Promise<any | null>

  /** Create new entity instance */
  create: (plainObject?: any) => any

  /** Save entity */
  save: (entity: any) => Promise<any>

  /** Delete entities */
  delete: (criteria: any) => Promise<{ affected?: number }>

  /** Count entities */
  count: (options?: any) => Promise<number>

  /** Create query builder */
  createQueryBuilder: () => MockQueryBuilder
}

/**
 * Mock TypeORM QueryBuilder interface
 */
export interface MockQueryBuilder {
  select: (selection?: string, alias?: string) => MockQueryBuilder
  where: (where: string, parameters?: any) => MockQueryBuilder
  andWhere: (where: string, parameters?: any) => MockQueryBuilder
  orWhere: (where: string, parameters?: any) => MockQueryBuilder
  orderBy: (orderBy: string, order?: 'ASC' | 'DESC') => MockQueryBuilder
  addOrderBy: (orderBy: string, order?: 'ASC' | 'DESC') => MockQueryBuilder
  getMany: () => Promise<any[]>
  getOne: () => Promise<any | null>
  getRawMany: () => Promise<any[]>
  getRawOne: () => Promise<any | null>
  delete: () => Promise<{ affected?: number }>
  count: () => Promise<number>
  setParameter: (key: string, value: any) => MockQueryBuilder
  setParameters: (parameters: any) => MockQueryBuilder
}

// ============================================================================
// DatabaseService Mock Types
// ============================================================================

/**
 * Mock DatabaseService interface matching IDatabaseService
 * Used for testing services that depend on database without actual connections
 */
export interface MockDatabaseService {
  /** Database type identifier */
  readonly type: DatabaseType

  /** Connect to database */
  connect: () => Promise<void>

  /** Disconnect from database */
  disconnect: () => Promise<void>

  /** Check if connected */
  isConnected: () => boolean

  /** Execute query and return results */
  query: (sql: string, params?: any[]) => Promise<QueryResult>

  /** Execute multiple queries in transaction */
  transaction: (queries: { sql: string; params?: any[] }[]) => Promise<void>
}

/**
 * Query result type for mock database service
 */
export interface QueryResult {
  rows: Record<string, unknown>[]
  columns: string[]
  rowCount: number
}

// ============================================================================
// TypeORM/Database Factory Function Type Signatures
// ============================================================================

/**
 * Options for creating a mock TypeORM DataSource
 */
export interface MockTypeormOptions {
  /** Initial isInitialized state */
  isInitialized?: boolean
  /** Query results to return */
  queryResult?: any[]
  /** Override specific methods */
  overrides?: Partial<MockDataSource>
}

/**
 * Options for creating a mock DatabaseService
 */
export interface MockDatabaseServiceOptions {
  /** Database type */
  type?: DatabaseType
  /** Whether database is connected */
  isConnected?: boolean
  /** Default query results to return */
  queryResult?: any[]
  /** Override specific methods */
  overrides?: Partial<MockDatabaseService>
}

/**
 * Create a mock TypeORM DataSource instance
 * @param options - Options including initialization state and query results
 * @returns Mock DataSource
 */
export type MockTypeormFactory = (options?: MockTypeormOptions) => MockDataSource

/**
 * Create a mock DatabaseService instance
 * @param options - Options including connection state and query results
 * @returns Mock DatabaseService
 */
export type MockDatabaseServiceFactory = (
  options?: MockDatabaseServiceOptions
) => MockDatabaseService
