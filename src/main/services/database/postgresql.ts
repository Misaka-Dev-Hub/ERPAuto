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

    const sqlPreview = sql.substring(0, 100)
    const paramCount = params?.length ?? 0

    try {
      const { result: queryResult } = await trackDuration(
        async () => {
          const result = await this.pool!.query(sql, params)

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
        await client.query(sql, params)
        log.debug('Transaction query executed', {
          index: i,
          sqlPreview: sql.substring(0, 100)
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
