/**
 * MySQL SQL Dialect Implementation
 *
 * Encapsulates MySQL-specific SQL syntax for:
 * - Table name quoting (underscore-separated)
 * - Positional parameter placeholders (?)
 * - INSERT ... ON DUPLICATE KEY UPDATE upsert
 * - LIMIT/OFFSET pagination
 */

import type { SqlDialect } from '../../../types/sql-dialect.types'

export class MySqlDialect implements SqlDialect {
  readonly dbType = 'mysql' as const

  quoteTableName(schema: string, table: string): string {
    return `${schema}_${table}`
  }

  param(_index: number): string {
    return '?'
  }

  params(count: number): string {
    return Array.from({ length: count }, () => '?').join(',')
  }

  currentTimestamp(): string {
    return 'NOW()'
  }

  upsert(params: {
    table: string
    keyColumns: string[]
    allColumns: string[]
    startParamIndex: number
  }): { sql: string; nextParamIndex: number } {
    const { table, keyColumns, allColumns, startParamIndex } = params

    const columns = allColumns.join(', ')
    const placeholders = allColumns.map(() => '?').join(', ')

    const nonKeyColumns = allColumns.filter((col) => !keyColumns.includes(col))
    const updateClause = nonKeyColumns.map((col) => `${col} = VALUES(${col})`).join(', ')

    const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`

    return {
      sql,
      nextParamIndex: startParamIndex + allColumns.length
    }
  }

  paginate(params: { sql: string; limit: number; offset?: number; paramIndex: number }): {
    sql: string
    nextParamIndex: number
  } {
    const { sql, limit, offset, paramIndex } = params

    return {
      sql: `${sql} LIMIT ${limit} OFFSET ${offset ?? 0}`,
      nextParamIndex: paramIndex
    }
  }

  maxBatchRows(_columnsPerRow: number): number {
    return 1000
  }
}
