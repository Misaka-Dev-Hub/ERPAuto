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
import type { IpcResult } from '../ipc'

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
  readFile: (filePath: string) => Promise<IpcResult<string>>
  writeFile: (filePath: string, content: string) => Promise<IpcResult<void>>
  fileExists: (filePath: string) => Promise<IpcResult<boolean>>
  listFiles: (dirPath: string) => Promise<IpcResult<string[]>>
  openPath: (filePath: string) => Promise<IpcResult<void>>
}

/**
 * Extractor service APIs
 */
export interface ExtractorAPI {
  /**
   * Run ERP data extractor
   * @param input - Extractor input parameters
   */
  runExtractor: (input: ExtractorInput) => Promise<IpcResult<ExtractorResult>>
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
  runCleaner: (input: CleanerInput) => Promise<IpcResult<CleanerResult>>

  /**
   * Export validation results to Excel
   * @param items - Validation result items to export
   */
  exportResults: (items: ExportResultItem[]) => Promise<IpcResult<ExportResultResponse>>

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
  connectMySql: (config: MySqlConfig) => Promise<IpcResult<void>>

  /**
   * Disconnect from MySQL database
   */
  disconnectMySql: () => Promise<IpcResult<void>>

  /**
   * Check if MySQL is connected
   */
  isMySqlConnected: () => Promise<IpcResult<boolean>>

  /**
   * Execute MySQL query
   * @param sql - SQL query
   * @param params - Query parameters
   */
  queryMySql: (sql: string, params?: unknown[]) => Promise<IpcResult<MySqlQueryResult>>

  /**
   * Connect to SQL Server database
   * @param config - SQL Server connection config
   */
  connectSqlServer: (config: SqlServerConfig) => Promise<IpcResult<void>>

  /**
   * Disconnect from SQL Server database
   */
  disconnectSqlServer: () => Promise<IpcResult<void>>

  /**
   * Check if SQL Server is connected
   */
  isSqlServerConnected: () => Promise<IpcResult<boolean>>

  /**
   * Execute SQL Server query
   * @param sql - SQL query
   * @param params - Query parameters
   */
  querySqlServer: (
    sql: string,
    params?: Record<string, unknown>
  ) => Promise<IpcResult<SqlServerQueryResult>>
}

/**
 * Report service APIs
 */
export interface ReportAPI {
  /**
   * List all reports across all users (Admin only typically)
   */
  listAll: () => Promise<
    IpcResult<
      { key: string; filename: string; username: string; lastModified?: Date; size?: number }[]
    >
  >

  /**
   * List reports for a specific user
   * @param username - Username to list reports for
   */
  listByUser: (
    username: string
  ) => Promise<
    IpcResult<
      { key: string; filename: string; username: string; lastModified?: Date; size?: number }[]
    >
  >

  /**
   * Download a specific report by key
   * @param key - Report object key in RustFS
   */
  download: (key: string) => Promise<IpcResult<string>>
}
