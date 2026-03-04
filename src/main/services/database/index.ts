/**
 * Database Factory
 *
 * Creates and manages database service instances based on configuration.
 * Supports both MySQL and SQL Server databases.
 */

import { MySqlService } from './mysql'
import { SqlServerService } from './sql-server'
import type {
  IDatabaseService,
  DatabaseType,
  MySqlConfig,
  SqlServerConfig
} from '../../types/database.types'
import { createLogger } from '../logger'

const log = createLogger('DatabaseFactory')

/**
 * Cached database service instances
 */
const instances: Map<DatabaseType, IDatabaseService> = new Map()

/**
 * Get the current database type from environment
 */
export function getDatabaseType(): DatabaseType {
  const dbType = process.env.DB_TYPE?.toLowerCase()
  if (dbType === 'sqlserver' || dbType === 'mssql') {
    return 'sqlserver'
  }
  return 'mysql'
}

/**
 * Create MySQL configuration from environment variables
 */
export function createMySqlConfig(): MySqlConfig {
  return {
    host: process.env.DB_MYSQL_HOST || 'localhost',
    port: parseInt(process.env.DB_MYSQL_PORT || '3306', 10),
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || ''
  }
}

/**
 * Create SQL Server configuration from environment variables
 */
export function createSqlServerConfig(): SqlServerConfig {
  return {
    server: process.env.DB_SERVER || 'localhost',
    port: parseInt(process.env.DB_SQLSERVER_PORT || '1433', 10),
    user: process.env.DB_USERNAME || 'sa',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || '',
    options: {
      encrypt: false,
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'yes'
    }
  }
}

/**
 * Create a database service instance
 *
 * Uses singleton pattern - returns cached instance if available.
 *
 * @param type - Optional database type override (defaults to DB_TYPE env var)
 * @returns Database service instance
 */
export async function create(type?: DatabaseType): Promise<IDatabaseService> {
  const dbType = type || getDatabaseType()

  // Return cached instance if available and connected
  const cached = instances.get(dbType)
  if (cached && cached.isConnected()) {
    log.debug('Returning cached database instance', { type: dbType })
    return cached
  }

  // Create new instance
  let service: IDatabaseService

  if (dbType === 'sqlserver') {
    log.info('Creating SQL Server database service')
    service = new SqlServerService(createSqlServerConfig())
  } else {
    log.info('Creating MySQL database service')
    service = new MySqlService(createMySqlConfig())
  }

  // Connect to database
  await service.connect()
  log.info('Database connected', { type: dbType })

  // Cache the instance
  instances.set(dbType, service)

  return service
}

/**
 * Get existing database service without creating new one
 *
 * @param type - Optional database type (defaults to DB_TYPE env var)
 * @returns Database service instance or undefined
 */
export function get(type?: DatabaseType): IDatabaseService | undefined {
  const dbType = type || getDatabaseType()
  return instances.get(dbType)
}

/**
 * Disconnect and remove a specific database service
 *
 * @param type - Optional database type (defaults to DB_TYPE env var)
 */
export async function disconnect(type?: DatabaseType): Promise<void> {
  const dbType = type || getDatabaseType()
  const service = instances.get(dbType)

  if (service) {
    try {
      await service.disconnect()
      log.info('Database disconnected', { type: dbType })
    } catch (error) {
      log.warn('Error disconnecting database', {
        type: dbType,
        error: error instanceof Error ? error.message : String(error)
      })
    }
    instances.delete(dbType)
  }
}

/**
 * Disconnect all database services
 */
export async function disconnectAll(): Promise<void> {
  log.info('Disconnecting all database services')

  const disconnectPromises = Array.from(instances.entries()).map(async ([type, service]) => {
    try {
      await service.disconnect()
      log.debug('Database disconnected', { type })
    } catch (error) {
      log.warn('Error disconnecting database', {
        type,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })

  await Promise.all(disconnectPromises)
  instances.clear()
  log.info('All database services disconnected')
}

/**
 * Check if a database service is connected
 *
 * @param type - Optional database type (defaults to DB_TYPE env var)
 */
export function isConnected(type?: DatabaseType): boolean {
  const dbType = type || getDatabaseType()
  const service = instances.get(dbType)
  return service?.isConnected() ?? false
}

// Re-export types and services
export { MySqlService } from './mysql'
export { SqlServerService } from './sql-server'
export type {
  IDatabaseService,
  DatabaseType,
  QueryResult,
  MySqlConfig,
  SqlServerConfig
} from '../../types/database.types'
