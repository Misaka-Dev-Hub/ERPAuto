import { ipcMain } from 'electron'
import { MySqlService } from '../services/database/mysql'
import { SqlServerService } from '../services/database/sql-server'
import type {
  MySqlConfig,
  MySqlQueryResult,
  SqlServerConfig,
  SqlServerQueryResult
} from '../types/ipc-api.types'

// Store MySQL service instances per window/connection
const mysqlServices = new Map<string, MySqlService>()

// Store SQL Server service instances per window/connection
const sqlServerServices = new Map<string, SqlServerService>()

/**
 * Get or create MySQL service for a connection ID
 */
function getMySqlService(connectionId: string): MySqlService | undefined {
  return mysqlServices.get(connectionId)
}

/**
 * Set MySQL service for a connection ID
 */
function setMySqlService(connectionId: string, service: MySqlService): void {
  mysqlServices.set(connectionId, service)
}

/**
 * Delete MySQL service for a connection ID
 */
function deleteMySqlService(connectionId: string): void {
  mysqlServices.delete(connectionId)
}

/**
 * Get or create SQL Server service for a connection ID
 */
function getSqlServerService(connectionId: string): SqlServerService | undefined {
  return sqlServerServices.get(connectionId)
}

/**
 * Set SQL Server service for a connection ID
 */
function setSqlServerService(connectionId: string, service: SqlServerService): void {
  sqlServerServices.set(connectionId, service)
}

/**
 * Delete SQL Server service for a connection ID
 */
function deleteSqlServerService(connectionId: string): void {
  sqlServerServices.delete(connectionId)
}

/**
 * Register IPC handlers for database operations
 */
export function registerDatabaseHandlers(): void {
  // Connect to MySQL
  ipcMain.handle('database:mysql:connect', async (event, config: MySqlConfig): Promise<void> => {
    try {
      // Use window ID as connection identifier
      const windowId = (event.sender as any).id.toString()
      const service = new MySqlService(config)
      await service.connect()
      setMySqlService(windowId, service)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect to MySQL'
      throw new Error(message)
    }
  })

  // Disconnect from MySQL
  ipcMain.handle('database:mysql:disconnect', async (event): Promise<void> => {
    try {
      const windowId = (event.sender as any).id.toString()
      const service = getMySqlService(windowId)
      if (service) {
        await service.disconnect()
        deleteMySqlService(windowId)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to disconnect from MySQL'
      throw new Error(message)
    }
  })

  // Check if MySQL is connected
  ipcMain.handle('database:mysql:isConnected', async (event): Promise<boolean> => {
    const windowId = (event.sender as any).id.toString()
    const service = getMySqlService(windowId)
    return service ? service.isConnected() : false
  })

  // Execute MySQL query
  ipcMain.handle(
    'database:mysql:query',
    async (event, sql: string, params?: any[]): Promise<MySqlQueryResult> => {
      try {
        const windowId = (event.sender as any).id.toString()
        const service = getMySqlService(windowId)

        if (!service) {
          throw new Error('Not connected to MySQL. Call connect() first.')
        }

        return await service.query(sql, params)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'MySQL query failed'
        throw new Error(message)
      }
    }
  )

  // Connect to SQL Server
  ipcMain.handle(
    'database:sqlserver:connect',
    async (event, config: SqlServerConfig): Promise<void> => {
      try {
        const windowId = (event.sender as any).id.toString()
        const service = new SqlServerService(config)
        await service.connect()
        setSqlServerService(windowId, service)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to connect to SQL Server'
        throw new Error(message)
      }
    }
  )

  // Disconnect from SQL Server
  ipcMain.handle('database:sqlserver:disconnect', async (event): Promise<void> => {
    try {
      const windowId = (event.sender as any).id.toString()
      const service = getSqlServerService(windowId)
      if (service) {
        await service.disconnect()
        deleteSqlServerService(windowId)
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to disconnect from SQL Server'
      throw new Error(message)
    }
  })

  // Check if SQL Server is connected
  ipcMain.handle('database:sqlserver:isConnected', async (event): Promise<boolean> => {
    const windowId = (event.sender as any).id.toString()
    const service = getSqlServerService(windowId)
    return service ? service.isConnected() : false
  })

  // Execute SQL Server query
  ipcMain.handle(
    'database:sqlserver:query',
    async (
      event,
      sqlString: string,
      params?: Record<string, unknown>
    ): Promise<SqlServerQueryResult> => {
      try {
        const windowId = (event.sender as any).id.toString()
        const service = getSqlServerService(windowId)

        if (!service) {
          throw new Error('Not connected to SQL Server. Call connect() first.')
        }

        return await service.query(sqlString, params)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'SQL Server query failed'
        throw new Error(message)
      }
    }
  )
}
