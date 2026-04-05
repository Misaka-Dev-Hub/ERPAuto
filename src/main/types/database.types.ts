/**
 * Database Type Definitions
 *
 * Provides abstract interfaces for database operations,
 * supporting both MySQL and SQL Server databases.
 */

/**
 * Supported database types
 */
export type DatabaseType = 'mysql' | 'sqlserver' | 'postgresql'

/**
 * Standard query result interface
 */
export interface QueryResult {
  /** Query result rows */
  rows: Record<string, unknown>[]
  /** Column names from the query */
  columns: string[]
  /** Number of rows affected or returned */
  rowCount: number
}

/**
 * Database service interface
 *
 * Defines the common interface that all database services must implement.
 * This allows for database-agnostic operations throughout the application.
 */
export interface IDatabaseService {
  /** Database type identifier */
  readonly type: DatabaseType

  /**
   * Connect to the database
   */
  connect(): Promise<void>

  /**
   * Disconnect from the database
   */
  disconnect(): Promise<void>

  /**
   * Check if connected to the database
   */
  isConnected(): boolean

  /**
   * Execute a query and return results
   * @param sql - SQL query string
   * @param params - Query parameters as an array
   */
  query(sql: string, params?: any[]): Promise<QueryResult>

  /**
   * Execute multiple queries in a transaction
   * @param queries - Array of queries with optional parameters
   */
  transaction(queries: { sql: string; params?: any[] }[]): Promise<void>
}

/**
 * Base database configuration interface
 */
export interface DatabaseConfig {
  /** Database server host */
  host?: string
  /** Database server port */
  port?: number
  /** Database username */
  user?: string
  /** Database password */
  password?: string
  /** Database name */
  database?: string
}

/**
 * MySQL-specific configuration
 */
export interface MySqlConfig extends DatabaseConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

/**
 * SQL Server-specific configuration
 */
export interface SqlServerConfig extends DatabaseConfig {
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
 * PostgreSQL-specific configuration
 */
export interface PostgreSqlConfig extends DatabaseConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
  maxPoolSize?: number
}
