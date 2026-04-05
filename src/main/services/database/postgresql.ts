import { Pool } from 'pg'
import type {
  IDatabaseService,
  DatabaseType,
  QueryResult,
  PostgreSqlConfig
} from '../../types/database.types'
import { createLogger, trackDuration } from '../logger'

const log = createLogger('PostgreSqlService')

export type { PostgreSqlConfig } from '../../types/database.types'

/**
 * SQL keywords that should NOT be double-quoted during identifier preprocessing.
 * PostgreSQL lowercases unquoted identifiers, but SSMA-migrated databases
 * have uppercase column names that require double-quoting to preserve case.
 */
const SQL_KEYWORDS = new Set([
  // DML
  'SELECT',
  'FROM',
  'WHERE',
  'AND',
  'OR',
  'NOT',
  'IN',
  'IS',
  'NULL',
  'INSERT',
  'INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE',
  // Ordering & limiting
  'ORDER',
  'BY',
  'ASC',
  'DESC',
  'LIMIT',
  'OFFSET',
  'FETCH',
  'NEXT',
  'ROWS',
  'ONLY',
  // Joins
  'JOIN',
  'LEFT',
  'RIGHT',
  'INNER',
  'OUTER',
  'CROSS',
  'FULL',
  'ON',
  // Set operations
  'UNION',
  'ALL',
  'INTERSECT',
  'EXCEPT',
  // Grouping
  'GROUP',
  'HAVING',
  'DISTINCT',
  // DDL
  'CREATE',
  'ALTER',
  'DROP',
  'TABLE',
  'INDEX',
  'COLUMN',
  'ADD',
  'MODIFY',
  'RENAME',
  'TO',
  // PostgreSQL specific
  'CONFLICT',
  'DO',
  'NOTHING',
  'EXCLUDED',
  'RETURNING',
  'MERGE',
  'USING',
  'MATCHED',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'TARGET',
  'SOURCE',
  // Functions
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'EXISTS',
  'CURRENT_TIMESTAMP',
  'NOW',
  'GETDATE',
  'COALESCE',
  'NULLIF',
  'CAST',
  'AS',
  // Transaction
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
  'SAVEPOINT',
  // Types & values
  'TRUE',
  'FALSE',
  'DEFAULT',
  'PRIMARY',
  'KEY',
  'REFERENCES',
  'FOREIGN',
  'CONSTRAINT',
  'UNIQUE',
  'CHECK',
  'CASE',
  'BETWEEN',
  'LIKE',
  'ILIKE',
  'ANY',
  'SOME',
  // Common
  'IF',
  'WITH',
  'RECURSIVE',
  'OVER',
  'PARTITION',
  'WINDOW',
  'ROW',
  'FIRST',
  'AFTER',
  'BEFORE'
])

/**
 * Prepare SQL for PostgreSQL execution by quoting unquoted identifiers.
 *
 * PostgreSQL lowercases unquoted identifiers, but SSMA-migrated tables
 * have uppercase column names (e.g., "UserName", "ID") that require
 * double-quoting to preserve case.
 *
 * This function:
 * - Preserves string literals ('...')
 * - Preserves already-quoted identifiers ("...")
 * - Preserves parameter placeholders ($1, $2, ...)
 * - Preserves SQL keywords
 * - Double-quotes remaining identifiers
 */
export function prepareSql(sql: string): string {
  const result: string[] = []
  let i = 0
  const len = sql.length

  while (i < len) {
    const ch = sql[i]

    // Skip whitespace
    if (/\s/.test(ch)) {
      result.push(ch)
      i++
      continue
    }

    // Skip single-line comments (--)
    if (ch === '-' && i + 1 < len && sql[i + 1] === '-') {
      while (i < len && sql[i] !== '\n') {
        result.push(sql[i++])
      }
      continue
    }

    // Preserve string literals ('...')
    if (ch === "'") {
      result.push(ch)
      i++
      while (i < len) {
        if (sql[i] === "'") {
          result.push(sql[i++])
          // Handle escaped quotes ('')
          if (i < len && sql[i] === "'") {
            result.push(sql[i++])
          } else {
            break
          }
        } else {
          result.push(sql[i++])
        }
      }
      continue
    }

    // Preserve already-quoted identifiers ("...")
    if (ch === '"') {
      result.push(ch)
      i++
      while (i < len && sql[i] !== '"') {
        result.push(sql[i++])
      }
      if (i < len) {
        result.push(sql[i++])
      }
      continue
    }

    // Preserve parameter placeholders ($N)
    if (ch === '$') {
      result.push(ch)
      i++
      while (i < len && /\d/.test(sql[i])) {
        result.push(sql[i++])
      }
      continue
    }

    // Preserve @param placeholders
    if (ch === '@') {
      result.push(ch)
      i++
      while (i < len && /\w/.test(sql[i])) {
        result.push(sql[i++])
      }
      continue
    }

    // Preserve ? placeholders
    if (ch === '?') {
      result.push(ch)
      i++
      continue
    }

    // Collect word tokens (identifiers and keywords)
    if (/[a-zA-Z_]/.test(ch)) {
      let word = ''
      while (i < len && /\w/.test(sql[i])) {
        word += sql[i++]
      }

      // Check if it's a SQL keyword (case-insensitive)
      if (SQL_KEYWORDS.has(word.toUpperCase())) {
        result.push(word)
      } else {
        // Quote the identifier to preserve case
        result.push(`"${word}"`)
      }
      continue
    }

    // Everything else (operators, punctuation, numbers): pass through
    result.push(ch)
    i++
  }

  return result.join('')
}

export class PostgreSqlService implements IDatabaseService {
  /** Database type identifier */
  readonly type: DatabaseType = 'postgresql'

  private pool: Pool | null = null
  private config: PostgreSqlConfig

  constructor(config: PostgreSqlConfig) {
    this.config = config
  }

  /**
   * Connect to PostgreSQL database
   */
  async connect(): Promise<void> {
    if (this.pool) {
      log.warn('Already connected to PostgreSQL')
      throw new Error('Already connected to PostgreSQL')
    }

    try {
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        max: this.config.maxPoolSize ?? 10
      })

      // Test connection
      const client = await this.pool.connect()
      client.release()

      log.info('Connected to PostgreSQL', {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database
      })
    } catch (error) {
      this.pool = null
      log.error('Failed to connect to PostgreSQL', {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        error
      })
      throw new Error(`Failed to connect to PostgreSQL: ${(error as Error).message}`)
    }
  }

  /**
   * Disconnect from PostgreSQL database
   */
  async disconnect(): Promise<void> {
    if (!this.pool) {
      return
    }

    try {
      await this.pool.end()
      this.pool = null
      log.info('Disconnected from PostgreSQL')
    } catch (error) {
      log.error('Failed to disconnect from PostgreSQL', { error })
      throw new Error(`Failed to disconnect from PostgreSQL: ${(error as Error).message}`)
    }
  }

  /**
   * Check if connected to PostgreSQL database
   */
  isConnected(): boolean {
    return this.pool !== null
  }

  /**
   * Execute a query and return results
   */
  async query(sql: string, params?: any[]): Promise<QueryResult> {
    if (!this.pool) {
      throw new Error('Not connected to PostgreSQL. Call connect() first.')
    }

    // Quote unquoted identifiers to preserve case for SSMA-migrated columns
    const preparedSql = prepareSql(sql)
    const sqlPreview = preparedSql.substring(0, 100)
    const paramCount = params?.length ?? 0

    try {
      const { result: queryResult } = await trackDuration(
        async () => {
          const result = await this.pool!.query(preparedSql, params)

          // Extract column names from fields
          const columns = result.fields ? result.fields.map((field) => field.name) : []

          // Result rows
          const rows = (result.rows as Record<string, unknown>[]) || []
          const rowCount = result.rowCount ?? rows.length

          return { rows, columns, rowCount }
        },
        { operationName: 'PostgreSqlService.query' }
      )

      log.debug('Query executed', { sqlPreview, rowCount: queryResult.rowCount, paramCount })
      return queryResult
    } catch (error) {
      log.error('PostgreSQL query failed', { sqlPreview, paramCount, error })
      throw new Error(`PostgreSQL query failed: ${(error as Error).message}`)
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction(queries: { sql: string; params?: any[] }[]): Promise<void> {
    if (!this.pool) {
      throw new Error('Not connected to PostgreSQL. Call connect() first.')
    }

    const queryCount = queries.length
    log.info('Transaction started', { queryCount })

    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      for (let i = 0; i < queries.length; i++) {
        const { sql, params } = queries[i]
        const preparedSql = prepareSql(sql)
        await client.query(preparedSql, params)
        log.debug('Transaction query executed', {
          index: i,
          sqlPreview: preparedSql.substring(0, 100)
        })
      }

      await client.query('COMMIT')
      log.info('Transaction committed', { queryCount })
    } catch (error) {
      await client.query('ROLLBACK')
      log.warn('Transaction rolled back', { queryCount, error })
      throw new Error(`PostgreSQL transaction failed: ${(error as Error).message}`)
    } finally {
      client.release()
    }
  }
}
