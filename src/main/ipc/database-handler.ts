import { ipcMain } from 'electron'
import { MySqlService } from '../services/database/mysql'
import { SqlServerService } from '../services/database/sql-server'
import { createLogger } from '../services/logger'
import { ValidationError } from '../types/errors'
import type {
  MySqlConfig,
  MySqlQueryResult,
  SqlServerConfig,
  SqlServerQueryResult
} from '../types/ipc-api.types'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { withErrorHandling, type IpcResult } from './index'

const log = createLogger('DatabaseHandler')

// Store MySQL service instances per window/connection
const mysqlServices = new Map<string, MySqlService>()

// Store SQL Server service instances per window/connection
const sqlServerServices = new Map<string, SqlServerService>()
const cleanupBoundWindows = new Set<string>()

function bindWindowCleanup(windowId: string, sender: { once: (event: string, listener: () => void) => void }): void {
  if (cleanupBoundWindows.has(windowId)) {
    return
  }

  sender.once('destroyed', () => {
    const mysql = getMySqlService(windowId)
    const sqlServer = getSqlServerService(windowId)

    if (mysql) {
      mysql.disconnect().catch((error) => log.warn('MySQL disconnect on window destroy failed', { error }))
      deleteMySqlService(windowId)
    }

    if (sqlServer) {
      sqlServer
        .disconnect()
        .catch((error) => log.warn('SQL Server disconnect on window destroy failed', { error }))
      deleteSqlServerService(windowId)
    }

    cleanupBoundWindows.delete(windowId)
  })

  cleanupBoundWindows.add(windowId)
}

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
  ipcMain.handle(
    IPC_CHANNELS.DATABASE_MYSQL_CONNECT,
    async (event, config: MySqlConfig): Promise<IpcResult<void>> => {
      return withErrorHandling(async () => {
      // Use window ID as connection identifier
      const windowId = (event.sender as { id: number }).id.toString()
      bindWindowCleanup(windowId, event.sender as { once: (event: string, listener: () => void) => void })
      log.info('Connecting to MySQL', { windowId })
      const service = new MySqlService(config)
      await service.connect()
      setMySqlService(windowId, service)
      log.info('MySQL connected', { windowId })
      }, 'database:mysql:connect')
    }
  )

  // Disconnect from MySQL
  ipcMain.handle(IPC_CHANNELS.DATABASE_MYSQL_DISCONNECT, async (event): Promise<IpcResult<void>> => {
    return withErrorHandling(async () => {
      const windowId = (event.sender as { id: number }).id.toString()
      const service = getMySqlService(windowId)
      if (service) {
        await service.disconnect()
        deleteMySqlService(windowId)
        log.info('MySQL disconnected', { windowId })
      }
    }, 'database:mysql:disconnect')
  })

  // Check if MySQL is connected
  ipcMain.handle(IPC_CHANNELS.DATABASE_MYSQL_IS_CONNECTED, async (event): Promise<IpcResult<boolean>> => {
    return withErrorHandling(async () => {
      const windowId = (event.sender as { id: number }).id.toString()
      const service = getMySqlService(windowId)
      return service ? service.isConnected() : false
    }, 'database:mysql:isConnected')
  })

  // Execute MySQL query
  ipcMain.handle(
    IPC_CHANNELS.DATABASE_MYSQL_QUERY,
    async (event, sql: string, params?: unknown[]): Promise<IpcResult<MySqlQueryResult>> => {
      return withErrorHandling(async () => {
        const windowId = (event.sender as { id: number }).id.toString()
        const service = getMySqlService(windowId)

        if (!service) {
          throw new ValidationError(
            'Not connected to MySQL. Call connect() first.',
            'VAL_INVALID_INPUT'
          )
        }

        log.debug('Executing MySQL query', { windowId, sql: sql.substring(0, 100) })
        return await service.query(sql, params)
      }, 'database:mysql:query')
    }
  )

  // Connect to SQL Server
  ipcMain.handle(
    IPC_CHANNELS.DATABASE_SQLSERVER_CONNECT,
    async (event, config: SqlServerConfig): Promise<IpcResult<void>> => {
      return withErrorHandling(async () => {
        const windowId = (event.sender as { id: number }).id.toString()
        bindWindowCleanup(windowId, event.sender as { once: (event: string, listener: () => void) => void })
        log.info('Connecting to SQL Server', { windowId })
        const service = new SqlServerService(config)
        await service.connect()
        setSqlServerService(windowId, service)
        log.info('SQL Server connected', { windowId })
      }, 'database:sqlserver:connect')
    }
  )

  // Disconnect from SQL Server
  ipcMain.handle(IPC_CHANNELS.DATABASE_SQLSERVER_DISCONNECT, async (event): Promise<IpcResult<void>> => {
    return withErrorHandling(async () => {
      const windowId = (event.sender as { id: number }).id.toString()
      const service = getSqlServerService(windowId)
      if (service) {
        await service.disconnect()
        deleteSqlServerService(windowId)
        log.info('SQL Server disconnected', { windowId })
      }
    }, 'database:sqlserver:disconnect')
  })

  // Check if SQL Server is connected
  ipcMain.handle(IPC_CHANNELS.DATABASE_SQLSERVER_IS_CONNECTED, async (event): Promise<IpcResult<boolean>> => {
    return withErrorHandling(async () => {
      const windowId = (event.sender as { id: number }).id.toString()
      const service = getSqlServerService(windowId)
      return service ? service.isConnected() : false
    }, 'database:sqlserver:isConnected')
  })

  // Execute SQL Server query
  ipcMain.handle(
    IPC_CHANNELS.DATABASE_SQLSERVER_QUERY,
    async (
      event,
      sqlString: string,
      params?: Record<string, unknown>
    ): Promise<IpcResult<SqlServerQueryResult>> => {
      return withErrorHandling(async () => {
        const windowId = (event.sender as { id: number }).id.toString()
        const service = getSqlServerService(windowId)

        if (!service) {
          throw new ValidationError(
            'Not connected to SQL Server. Call connect() first.',
            'VAL_INVALID_INPUT'
          )
        }

        log.debug('Executing SQL Server query', { windowId, sql: sqlString.substring(0, 100) })

        // Use queryWithParams for named parameters, or query for no params
        if (params && Object.keys(params).length > 0) {
          // Convert to the format expected by queryWithParams
          const typedParams: Record<string, { value: unknown }> = {}
          for (const [key, value] of Object.entries(params)) {
            typedParams[key] = { value }
          }
          return await service.queryWithParams(sqlString, typedParams)
        } else {
          return await service.query(sqlString)
        }
      }, 'database:sqlserver:query')
    }
  )
}
