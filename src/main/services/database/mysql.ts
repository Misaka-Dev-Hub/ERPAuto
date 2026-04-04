import mysql from 'mysql2/promise'
import type {
  IDatabaseService,
  DatabaseType,
  QueryResult,
  MySqlConfig
} from '../../types/database.types'
import { createLogger, trackDuration } from '../logger'

const log = createLogger('MySqlService')

export type { MySqlConfig } from '../../types/database.types'

export class MySqlService implements IDatabaseService {
  /** Database type identifier */
  readonly type: DatabaseType = 'mysql'

  private connection: mysql.Connection | null = null
  private config: MySqlConfig

  constructor(config: MySqlConfig) {
    this.config = config
  }

  /**
   * Connect to MySQL database
   */
  async connect(): Promise<void> {
    if (this.connection) {
      log.warn('Already connected to MySQL')
      throw new Error('Already connected to MySQL')
    }

    try {
      this.connection = await mysql.createConnection({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database
      })

      // Test connection
      await this.connection.ping()
      log.info('Connected to MySQL', {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database
      })
    } catch (error) {
      log.error('Failed to connect to MySQL', {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        error
      })
      throw new Error(`Failed to connect to MySQL: ${(error as Error).message}`)
    }
  }

  /**
   * Disconnect from MySQL database
   */
  async disconnect(): Promise<void> {
    if (!this.connection) {
      return
    }

    try {
      await this.connection.end()
      this.connection = null
      log.info('Disconnected from MySQL')
    } catch (error) {
      log.error('Failed to disconnect from MySQL', { error })
      throw new Error(`Failed to disconnect from MySQL: ${(error as Error).message}`)
    }
  }

  /**
   * Check if connected to MySQL database
   */
  isConnected(): boolean {
    return this.connection !== null
  }

  /**
   * Execute a query and return results
   */
  async query(sql: string, params?: any[]): Promise<QueryResult> {
    if (!this.connection) {
      throw new Error('Not connected to MySQL. Call connect() first.')
    }

    const sqlPreview = sql.substring(0, 100)
    const paramCount = params?.length ?? 0

    try {
      const { result: queryResult } = await trackDuration(
        async () => {
          const [result, fields] = await this.connection!.execute(sql, params)

          // Convert to plain objects and extract column names
          const columns = Array.isArray(fields) ? fields.map((field) => field.name) : []

          // Handle different result types
          let rows: Record<string, unknown>[] = []
          let rowCount = 0

          if (Array.isArray(result)) {
            // SELECT query - result is an array of rows
            rows = result as Record<string, unknown>[]
            rowCount = rows.length
          } else if (typeof result === 'object' && result !== null) {
            // INSERT/UPDATE/DELETE query - result is OkPacket
            const okPacket = result as any
            rowCount = okPacket.affectedRows || okPacket.changedRows || 0
          }

          return { rows, columns, rowCount }
        },
        { operationName: 'MySqlService.query' }
      )

      log.debug('Query executed', { sqlPreview, rowCount: queryResult.rowCount, paramCount })
      return queryResult
    } catch (error) {
      log.error('MySQL query failed', { sqlPreview, paramCount, error })
      throw new Error(`MySQL query failed: ${(error as Error).message}`)
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction(queries: { sql: string; params?: any[] }[]): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to MySQL. Call connect() first.')
    }

    const queryCount = queries.length
    log.info('Transaction started', { queryCount })

    try {
      await this.connection.beginTransaction()

      for (let i = 0; i < queries.length; i++) {
        const { sql, params } = queries[i]
        await this.connection.execute(sql, params)
        log.debug('Transaction query executed', { index: i, sqlPreview: sql.substring(0, 100) })
      }

      await this.connection.commit()
      log.info('Transaction committed', { queryCount })
    } catch (error) {
      if (this.connection) {
        await this.connection.rollback()
        log.warn('Transaction rolled back', { queryCount, error })
      }
      throw new Error(`MySQL transaction failed: ${(error as Error).message}`)
    }
  }
}
