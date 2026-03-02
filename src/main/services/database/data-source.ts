/**
 * TypeORM Data Source Configuration
 *
 * Provides a centralized database connection for TypeORM entities.
 * Supports both MySQL and SQL Server based on DB_TYPE environment variable.
 */

import 'reflect-metadata'
import { DataSource, DataSourceOptions } from 'typeorm'

/**
 * Get database type from environment
 */
function getDatabaseType(): 'mysql' | 'mssql' {
  const dbType = process.env.DB_TYPE?.toLowerCase()
  if (dbType === 'sqlserver' || dbType === 'mssql') {
    return 'mssql'
  }
  return 'mysql'
}

/**
 * Build DataSourceOptions based on database type
 */
function buildDataSourceOptions(): DataSourceOptions {
  const type = getDatabaseType()

  const commonOptions: Partial<DataSourceOptions> = {
    entities: [__dirname + '/entities/*.{ts,js}'],
    synchronize: false, // Never auto-sync in production
    logging: process.env.NODE_ENV !== 'production'
  }

  if (type === 'mssql') {
    return {
      type: 'mssql',
      host: process.env.DB_SERVER || 'localhost',
      port: parseInt(process.env.DB_SQLSERVER_PORT || '1433', 10),
      username: process.env.DB_USERNAME || 'sa',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || '',
      options: {
        encrypt: process.env.DB_TRUST_SERVER_CERTIFICATE === 'yes',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'yes'
      },
      ...commonOptions
    } as DataSourceOptions
  }

  return {
    type: 'mysql',
    host: process.env.DB_MYSQL_HOST || 'localhost',
    port: parseInt(process.env.DB_MYSQL_PORT || '3306', 10),
    username: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || '',
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
