/**
 * TypeORM Data Source Configuration
 *
 * Provides a centralized database connection for TypeORM entities.
 * Supports both MySQL and SQL Server based on configuration.
 *
 * Note: Configuration is now loaded from config.yaml via ConfigManager,
 * not from environment variables.
 */

import 'reflect-metadata'
import { DataSource, DataSourceOptions } from 'typeorm'
import { ConfigManager } from '../config/config-manager'
import { createLogger } from '../logger'

const log = createLogger('DataSource')

/**
 * Get database type from config manager
 */
function getDatabaseType(): 'mysql' | 'mssql' {
  const configManager = ConfigManager.getInstance()
  const dbType = configManager.getDatabaseType()
  return dbType === 'sqlserver' ? 'mssql' : 'mysql'
}

/**
 * Build DataSourceOptions based on database type
 */
function buildDataSourceOptions(): DataSourceOptions {
  const type = getDatabaseType()
  log.debug('Building DataSource options', { type })
  const configManager = ConfigManager.getInstance()
  const config = configManager.getConfig()

  const commonOptions: Partial<DataSourceOptions> = {
    entities: [__dirname + '/entities/*.{ts,js}'],
    synchronize: false, // Never auto-sync in production
    logging: false
  }

  if (type === 'mssql') {
    const dbConfig = config.database.sqlserver
    return {
      type: 'mssql',
      host: dbConfig.server,
      port: dbConfig.port,
      username: dbConfig.username,
      password: dbConfig.password,
      database: dbConfig.database,
      options: {
        encrypt: false,
        trustServerCertificate: dbConfig.trustServerCertificate
      },
      ...commonOptions
    } as DataSourceOptions
  }

  const dbConfig = config.database.mysql
  return {
    type: 'mysql',
    host: dbConfig.host,
    port: dbConfig.port,
    username: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database,
    ...commonOptions
  } as DataSourceOptions
}

/**
 * TypeORM DataSource singleton
 */
let dataSource: DataSource | null = null

/**
 * Get or create the DataSource
 */
export function getDataSource(): DataSource {
  if (!dataSource) {
    const type = getDatabaseType()
    log.info('Creating new TypeORM DataSource', { type })
    dataSource = new DataSource(buildDataSourceOptions())
  } else {
    log.debug('Reusing existing DataSource')
  }
  return dataSource
}

/**
 * Initialize the DataSource
 */
export async function initializeDataSource(): Promise<DataSource> {
  const ds = getDataSource()
  if (!ds.isInitialized) {
    try {
      await ds.initialize()
      const type = getDatabaseType()
      log.info('TypeORM DataSource initialized', { type })
    } catch (error) {
      log.error('Failed to initialize DataSource', { error })
      throw error
    }
  }
  return ds
}

/**
 * Destroy the DataSource
 */
export async function destroyDataSource(): Promise<void> {
  if (dataSource && dataSource.isInitialized) {
    try {
      await dataSource.destroy()
      dataSource = null
      log.info('TypeORM DataSource destroyed')
    } catch (error) {
      log.error('Failed to destroy DataSource', { error })
    }
  }
}

export default getDataSource
