import sql from 'mssql'

export interface SqlServerConfig {
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

export interface SqlServerQueryResult {
  rows: Record<string, unknown>[]
  columns: string[]
  rowCount: number
}

export class SqlServerService {
  private pool: sql.ConnectionPool | null = null
  private config: SqlServerConfig

  constructor(config: SqlServerConfig) {
    this.config = config
  }

  /**
   * Connect to SQL Server database
   */
  async connect(): Promise<void> {
    if (this.pool) {
      throw new Error('Already connected to SQL Server')
    }

    try {
      const poolConfig: sql.config = {
        server: this.config.server,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        options: {
          encrypt: this.config.options?.encrypt ?? true,
          trustServerCertificate: this.config.options?.trustServerCertificate ?? false
        }
      }

      this.pool = new sql.ConnectionPool(poolConfig)
      await this.pool.connect()
    } catch (error) {
      throw new Error(`Failed to connect to SQL Server: ${(error as Error).message}`)
    }
  }

  /**
   * Disconnect from SQL Server database
   */
  async disconnect(): Promise<void> {
    if (!this.pool) {
      return
    }

    try {
      await this.pool.close()
      this.pool = null
    } catch (error) {
      throw new Error(`Failed to disconnect from SQL Server: ${(error as Error).message}`)
    }
  }

  /**
   * Check if connected to SQL Server database
   */
  isConnected(): boolean {
    return this.pool !== null && this.pool.connected
  }

  /**
   * Execute a query and return results
   */
  async query(sqlString: string, params?: Record<string, unknown>): Promise<SqlServerQueryResult> {
    if (!this.pool) {
      throw new Error('Not connected to SQL Server. Call connect() first.')
    }

    try {
      const request = this.pool.request()

      // Add parameters if provided
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          request.input(key, value)
        }
      }

      const result = await request.query(sqlString)

      // Convert recordset to array of objects
      const rows = result.recordset as Record<string, unknown>[]
      // Extract column names from the first row if available
      const columns = rows.length > 0 ? Object.keys(rows[0]) : []

      return {
        rows,
        columns,
        rowCount: result.rowsAffected?.[0] || rows.length
      }
    } catch (error) {
      throw new Error(`SQL Server query failed: ${(error as Error).message}`)
    }
  }

  /**
   * Execute a prepared statement with parameters
   */
  async queryWithParams(
    sqlString: string,
    params: Record<string, { value: unknown; type?: sql.ISqlType }>
  ): Promise<SqlServerQueryResult> {
    if (!this.pool) {
      throw new Error('Not connected to SQL Server. Call connect() first.')
    }

    try {
      const request = this.pool.request()

      // Add parameters with explicit types
      for (const [key, { value, type }] of Object.entries(params)) {
        if (type) {
          request.input(key, type, value)
        } else {
          request.input(key, value)
        }
      }

      const result = await request.query(sqlString)

      // Convert recordset to array of objects
      const rows = result.recordset as Record<string, unknown>[]
      // Extract column names from the first row if available
      const columns = rows.length > 0 ? Object.keys(rows[0]) : []

      return {
        rows,
        columns,
        rowCount: result.rowsAffected?.[0] || rows.length
      }
    } catch (error) {
      throw new Error(`SQL Server query failed: ${(error as Error).message}`)
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction(queries: { sql: string; params?: Record<string, unknown> }[]): Promise<void> {
    if (!this.pool) {
      throw new Error('Not connected to SQL Server. Call connect() first.')
    }

    const transaction = new sql.Transaction(this.pool)

    try {
      await transaction.begin()

      for (const { sql: sqlString, params } of queries) {
        const request = new sql.Request(transaction)

        if (params) {
          for (const [key, value] of Object.entries(params)) {
            request.input(key, value)
          }
        }

        await request.query(sqlString)
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw new Error(`SQL Server transaction failed: ${(error as Error).message}`)
    }
  }
}
