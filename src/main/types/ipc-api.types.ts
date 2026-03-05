/**
 * IPC API type definitions for renderer process
 * These types define the API exposed to the renderer process via contextBridge
 */

import type { ExtractorInput, ExtractorResult, ExtractionProgress } from './extractor.types'
import type {
  CleanerInput,
  CleanerResult,
  CleanerProgress,
  ExportResultItem,
  ExportResultResponse
} from './cleaner.types'

/**
 * MySQL connection configuration
 */
export interface MySqlConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

/**
 * MySQL query result
 */
export interface MySqlQueryResult {
  rows: Record<string, unknown>[]
  columns: string[]
  rowCount: number
}

/**
 * SQL Server connection configuration
 */
export interface SqlServerConfig {
  server: string
  port: number
  user: string
  password: string
  database: string
  options?: {
    encrypt?: boolean
    trustServerCertificate?: boolean
  }
}

/**
 * SQL Server query result
 */
export interface SqlServerQueryResult {
  rows: Record<string, unknown>[]
  columns: string[]
  rowCount: number
}

/**
 * File operation APIs
 */
export interface FileAPI {
  readFile: (filePath: string) => Promise<string>
  writeFile: (filePath: string, content: string) => Promise<void>
  fileExists: (filePath: string) => Promise<boolean>
  listFiles: (dirPath: string) => Promise<string[]>
  openPath: (filePath: string) => Promise<void>
}

/**
 * Extractor service APIs
 */
export interface ExtractorAPI {
  /**
   * Run ERP data extractor
   * @param input - Extractor input parameters
   */
  runExtractor: (
    input: ExtractorInput
  ) => Promise<{ success: boolean; data?: ExtractorResult; error?: string }>
  /**
   * Subscribe to progress updates
   * @param callback - Callback function receiving progress data
   * @returns Unsubscribe function
   */
  onProgress: (callback: (data: ExtractionProgress) => void) => () => void
  /**
   * Subscribe to log messages
   * @param callback - Callback function receiving log data
   * @returns Unsubscribe function
   */
  onLog: (callback: (data: { level: string; message: string }) => void) => () => void
}

/**
 * Cleaner service APIs
 */
export interface CleanerAPI {
  /**
   * Run ERP cleaner service
   * @param input - Cleaner input parameters
   */
  runCleaner: (
    input: CleanerInput
  ) => Promise<{ success: boolean; data?: CleanerResult; error?: string }>

  /**
   * Export validation results to Excel
   * @param items - Validation result items to export
   */
  exportResults: (items: ExportResultItem[]) => Promise<ExportResultResponse>

  /**
   * Subscribe to progress updates
   * @param callback - Callback function receiving progress data
   * @returns Unsubscribe function
   */
  onProgress: (callback: (data: CleanerProgress) => void) => () => void
}

/**
 * Database service APIs
 */
export interface DatabaseAPI {
  /**
   * Connect to MySQL database
   * @param config - MySQL connection config
   */
  connectMySql: (config: MySqlConfig) => Promise<void>

  /**
   * Disconnect from MySQL database
   */
  disconnectMySql: () => Promise<void>

  /**
   * Check if MySQL is connected
   */
  isMySqlConnected: () => Promise<boolean>

  /**
   * Execute MySQL query
   * @param sql - SQL query
   * @param params - Query parameters
   */
  queryMySql: (sql: string, params?: unknown[]) => Promise<MySqlQueryResult>

  /**
   * Connect to SQL Server database
   * @param config - SQL Server connection config
   */
  connectSqlServer: (config: SqlServerConfig) => Promise<void>

  /**
   * Disconnect from SQL Server database
   */
  disconnectSqlServer: () => Promise<void>

  /**
   * Check if SQL Server is connected
   */
  isSqlServerConnected: () => Promise<boolean>

  /**
   * Execute SQL Server query
   * @param sql - SQL query
   * @param params - Query parameters
   */
  querySqlServer: (sql: string, params?: Record<string, unknown>) => Promise<SqlServerQueryResult>
}
