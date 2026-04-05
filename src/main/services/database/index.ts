/**
 * Database Factory
 *
 * Creates and manages database service instances based on configuration.
 * Supports MySQL, SQL Server, and PostgreSQL databases.
 */

import { ConfigManager } from '../config/config-manager'
import { MySqlService } from './mysql'
import { SqlServerService } from './sql-server'
import { PostgreSqlService } from './postgresql'
import type {
  IDatabaseService,
  DatabaseType,
  MySqlConfig,
  SqlServerConfig,
  PostgreSqlConfig
} from '../../types/database.types'
import { createLogger } from '../logger'

const log = createLogger('DatabaseFactory')

/**
 * Cached database service instances
 */
const instances: Map<DatabaseType, IDatabaseService> = new Map()

/**
 * Get the current database type from config manager
 */
export function getDatabaseType(): DatabaseType {
  const configManager = ConfigManager.getInstance()
  return configManager.getDatabaseType()
}

/**
 * Create MySQL configuration from config manager
 */
export function createMySqlConfig(): MySqlConfig {
  const configManager = ConfigManager.getInstance()
  const dbConfig = configManager.getConfig().database.mysql
  return {
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database
  }
}

/**
 * Create SQL Server configuration from config manager
 */
export function createSqlServerConfig(): SqlServerConfig {
  const configManager = ConfigManager.getInstance()
  const dbConfig = configManager.getConfig().database.sqlserver
  return {
    server: dbConfig.server,
    port: dbConfig.port,
    user: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database,
    options: {
      encrypt: false,
      trustServerCertificate: dbConfig.trustServerCertificate
    }
  }
}

/**
 * Create PostgreSQL configuration from config manager
 */
export function createPostgreSqlConfig(): PostgreSqlConfig {
  const configManager = ConfigManager.getInstance()
  const dbConfig = configManager.getConfig().database.postgresql
  return {
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database,
    maxPoolSize: dbConfig.maxPoolSize
  }
}

/**
 * Create a database service instance
 *
 * Uses singleton pattern - returns cached instance if available.
 *
 * @param type - Optional database type override (defaults to config)
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

  if (dbType === 'postgresql') {
    log.info('Creating PostgreSQL database service')
    service = new PostgreSqlService(createPostgreSqlConfig())
  } else if (dbType === 'sqlserver') {
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
 * @param type - Optional database type (defaults to config)
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
export { PostgreSqlService } from './postgresql'
export type {
  IDatabaseService,
  DatabaseType,
  QueryResult,
  MySqlConfig,
  SqlServerConfig,
  PostgreSqlConfig
} from '../../types/database.types'
