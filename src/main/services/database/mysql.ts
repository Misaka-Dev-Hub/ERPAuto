import mysql from 'mysql2/promise'
import type {
  IDatabaseService,
  DatabaseType,
  QueryResult,
  MySqlConfig
} from '../../types/database.types'

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
    } catch (error) {
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
    } catch (error) {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async query(sql: string, params?: any[]): Promise<QueryResult> {
    if (!this.connection) {
      throw new Error('Not connected to MySQL. Call connect() first.')
    }

    try {
      const [result, fields] = await this.connection.execute(sql, params)

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const okPacket = result as any
        rowCount = okPacket.affectedRows || okPacket.changedRows || 0
      }

      return {
        rows,
        columns,
        rowCount
      }
    } catch (error) {
      throw new Error(`MySQL query failed: ${(error as Error).message}`)
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async transaction(queries: { sql: string; params?: any[] }[]): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to MySQL. Call connect() first.')
    }

    try {
      await this.connection.beginTransaction()

      for (const { sql, params } of queries) {
        await this.connection.execute(sql, params)
      }

      await this.connection.commit()
    } catch (error) {
      if (this.connection) {
        await this.connection.rollback()
      }
      throw new Error(`MySQL transaction failed: ${(error as Error).message}`)
    }
  }
}
