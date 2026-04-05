/**
 * PostgreSQL Dialect Implementation
 *
 * Encapsulates PostgreSQL-specific SQL syntax for:
 * - Table name quoting (double-quoted "schema"."table")
 * - Positional parameter placeholders ($1, $2, ...) — 1-based
 * - INSERT ... ON CONFLICT ... DO UPDATE SET upsert
 * - LIMIT/OFFSET pagination
 */

import type { SqlDialect } from '../../../types/sql-dialect.types'

export class PostgreSqlDialect implements SqlDialect {
  readonly dbType = 'postgresql' as const

  quoteTableName(schema: string, table: string): string {
    return `"${schema}"."${table}"`
  }

  param(index: number): string {
    return `$${index + 1}`
  }

  params(count: number): string {
    return Array.from({ length: count }, (_, i) => `$${i + 1}`).join(',')
  }

  currentTimestamp(): string {
    return 'CURRENT_TIMESTAMP'
  }

  upsert(params: {
    table: string
    keyColumns: string[]
    allColumns: string[]
    startParamIndex: number
  }): { sql: string; nextParamIndex: number } {
    const { table, keyColumns, allColumns, startParamIndex } = params

    const columns = allColumns.join(', ')
    const placeholders = allColumns.map((_, i) => `$${startParamIndex + i + 1}`).join(', ')

    const conflictKeys = keyColumns.map((col) => `"${col}"`).join(', ')

    const nonKeyColumns = allColumns.filter((col) => !keyColumns.includes(col))
    const updateSet = nonKeyColumns.map((col) => `"${col}" = EXCLUDED."${col}"`).join(', ')

    const sql = [
      `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`,
      `ON CONFLICT (${conflictKeys})`,
      `DO UPDATE SET ${updateSet}`
    ].join(' ')

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
