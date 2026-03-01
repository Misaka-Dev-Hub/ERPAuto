import mysql from 'mysql2/promise'

export interface MySqlConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

export interface MySqlQueryResult {
  rows: Record<string, unknown>[]
  columns: string[]
  rowCount: number
}

export class MySqlService {
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
  async query(sql: string, params?: any[]): Promise<MySqlQueryResult> {
    if (!this.connection) {
      throw new Error('Not connected to MySQL. Call connect() first.')
    }

    try {
      const [rows, fields] = await this.connection.execute(sql, params)

      // Convert rows to plain objects and extract column names
      const columns = fields.map((field) => field.name)
      const rowCount = Array.isArray(rows) ? rows.length : 0

      // Type assertion for rows - mysql2 returns different types based on query
      const typedRows = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []

      return {
        rows: typedRows,
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
