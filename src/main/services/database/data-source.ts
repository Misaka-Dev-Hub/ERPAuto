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
    dataSource = new DataSource(buildDataSourceOptions())
  }
  return dataSource
}

/**
 * Initialize the DataSource
 */
export async function initializeDataSource(): Promise<DataSource> {
  const ds = getDataSource()
  if (!ds.isInitialized) {
    await ds.initialize()
  }
  return ds
}

/**
 * Destroy the DataSource
 */
export async function destroyDataSource(): Promise<void> {
  if (dataSource && dataSource.isInitialized) {
    await dataSource.destroy()
    dataSource = null
  }
}

export default getDataSource
