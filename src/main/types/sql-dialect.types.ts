/**
 * SQL Dialect Abstraction
 *
 * Provides a unified interface for database-specific SQL syntax differences.
 * Each database type implements this interface to encapsulate:
 * - Parameter placeholder format
 * - Table name quoting
 * - UPSERT syntax
 * - Pagination syntax
 * - Current timestamp function
 * - Batch size limits
 */

import type { DatabaseType } from './database.types'

export interface SqlDialect {
  /** Database type identifier */
  readonly dbType: DatabaseType

  /**
   * Quote a table name with schema prefix
   * MySQL: dbo_TableName
   * SQL Server: [dbo].[TableName]
   * PostgreSQL: "dbo"."TableName"
   */
  quoteTableName(schema: string, table: string): string

  /**
   * Get placeholder for parameter at given index (0-based)
   * MySQL: ?
   * SQL Server: @p0
   * PostgreSQL: $1
   */
  param(index: number): string

  /**
   * Get comma-separated placeholders for count parameters
   */
  params(count: number): string

  /**
   * Get current timestamp SQL function
   * MySQL: NOW()
   * SQL Server: GETDATE()
   * PostgreSQL: CURRENT_TIMESTAMP
   */
  currentTimestamp(): string

  /**
   * Generate UPSERT SQL for a single row
   * MySQL: INSERT ... ON DUPLICATE KEY UPDATE
   * SQL Server: MERGE ... USING ...
   * PostgreSQL: INSERT ... ON CONFLICT ... DO UPDATE SET
   */
  upsert(params: {
    table: string
    keyColumns: string[]
    allColumns: string[]
    startParamIndex: number
  }): { sql: string; nextParamIndex: number }

  /**
   * Append pagination clause to SQL
   * MySQL/PostgreSQL: LIMIT x OFFSET y
   * SQL Server: OFFSET x ROWS FETCH NEXT y ROWS ONLY
   */
  paginate(params: {
    sql: string
    limit: number
    offset?: number
    paramIndex: number
  }): { sql: string; nextParamIndex: number }

  /**
   * Maximum rows per batch given columns per row
   * SQL Server: ~71 (due to 2100 param limit)
   * MySQL/PostgreSQL: 1000
   */
  maxBatchRows(columnsPerRow: number): number
}
