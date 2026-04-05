/**
 * SQL Server Dialect Implementation
 *
 * Encapsulates SQL Server-specific SQL syntax for:
 * - Table name quoting (bracket notation [schema].[table])
 * - Named parameter placeholders (@p0, @p1, ...)
 * - MERGE ... USING upsert
 * - OFFSET/FETCH pagination
 */

import type { SqlDialect } from '../../../types/sql-dialect.types'

export class SqlServerDialect implements SqlDialect {
  readonly dbType = 'sqlserver' as const

  quoteTableName(schema: string, table: string): string {
    return `[${schema}].[${table}]`
  }

  param(index: number): string {
    return `@p${index}`
  }

  params(count: number): string {
    return Array.from({ length: count }, (_, i) => `@p${i}`).join(',')
  }

  currentTimestamp(): string {
    return 'GETDATE()'
  }

  upsert(params: {
    table: string
    keyColumns: string[]
    allColumns: string[]
    startParamIndex: number
  }): { sql: string; nextParamIndex: number } {
    const { table, keyColumns, allColumns, startParamIndex } = params

    const valueParams = allColumns.map((_, i) => `@p${startParamIndex + i}`).join(', ')
    const sourceColumns = allColumns.join(', ')

    const joinCondition = keyColumns.map((col) => `target.${col} = source.${col}`).join(' AND ')

    const nonKeyColumns = allColumns.filter((col) => !keyColumns.includes(col))
    const updateSet = nonKeyColumns.map((col) => `target.${col} = source.${col}`).join(', ')

    const insertColumns = allColumns.join(', ')
    const insertValues = allColumns.map((col) => `source.${col}`).join(', ')

    const sql = [
      `MERGE ${table} AS target`,
      `USING (VALUES (${valueParams})) AS source (${sourceColumns})`,
      `ON ${joinCondition}`,
      `WHEN MATCHED THEN UPDATE SET ${updateSet}`,
      `WHEN NOT MATCHED THEN INSERT (${insertColumns}) VALUES (${insertValues});`
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

    if (offset !== undefined) {
      return {
        sql: `${sql} OFFSET @p${paramIndex} ROWS FETCH NEXT @p${paramIndex + 1} ROWS ONLY`,
        nextParamIndex: paramIndex + 2
      }
    }

    return {
      sql: `${sql} OFFSET 0 ROWS FETCH NEXT @p${paramIndex} ROWS ONLY`,
      nextParamIndex: paramIndex + 1
    }
  }

  maxBatchRows(columnsPerRow: number): number {
    return Math.floor(2000 / columnsPerRow)
  }
}
