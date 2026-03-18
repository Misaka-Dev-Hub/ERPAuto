import sql from 'mssql'
import type {
  IDatabaseService,
  DatabaseType,
  QueryResult,
  SqlServerConfig
} from '../../types/database.types'

export type { SqlServerConfig } from '../../types/database.types'

export class SqlServerService implements IDatabaseService {
  /** Database type identifier */
  readonly type: DatabaseType = 'sqlserver'

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
          encrypt: this.config.options?.encrypt ?? false,
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
   * @param sqlString - SQL query string with @p0, @p1, ... placeholders
   * @param params - Query parameters as an array (converted to @p0, @p1, ...)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async query(sqlString: string, params?: any[]): Promise<QueryResult> {
    if (!this.pool) {
      throw new Error('Not connected to SQL Server. Call connect() first.')
    }

    try {
      const request = this.pool.request()

      // Add parameters if provided - convert array to @p0, @p1, ... format
      if (params && params.length > 0) {
        params.forEach((value, index) => {
          request.input(`p${index}`, value)
        })
      }

      const result = await request.query(sqlString)

      // Convert recordset to array of objects (may be undefined for DELETE/INSERT/UPDATE)
      const rows = (result.recordset as Record<string, unknown>[]) || []
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
   * Execute a prepared statement with named parameters
   * @param sqlString - SQL query string with @paramName placeholders
   * @param params - Parameters as an object with { value, type? } structure
   */
  async queryWithParams(
    sqlString: string,
    params: Record<
      string,
      {
        value: unknown
        type?: sql.ISqlType | sql.ISqlTypeFactoryWithLength | sql.ISqlTypeWithLength
      }
    >
  ): Promise<QueryResult> {
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
   * @param queries - Array of queries with array-based parameters
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async transaction(queries: { sql: string; params?: any[] }[]): Promise<void> {
    if (!this.pool) {
      throw new Error('Not connected to SQL Server. Call connect() first.')
    }

    const transaction = new sql.Transaction(this.pool)

    try {
      await transaction.begin()

      for (const { sql: sqlString, params } of queries) {
        const request = new sql.Request(transaction)

        // Add parameters if provided - convert array to @p0, @p1, ... format
        if (params && params.length > 0) {
          params.forEach((value, index) => {
            request.input(`p${index}`, value)
          })
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
