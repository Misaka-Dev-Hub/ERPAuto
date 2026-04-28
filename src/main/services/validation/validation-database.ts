import { ConfigManager } from '../config/config-manager'
import { MySqlService } from '../database/mysql'
import { SqlServerService } from '../database/sql-server'
import { PostgreSqlService } from '../database/postgresql'

export type ValidationDatabaseService = MySqlService | SqlServerService | PostgreSqlService

export async function createValidationDatabaseService(): Promise<ValidationDatabaseService> {
  const configManager = ConfigManager.getInstance()
  const config = configManager.getConfig()
  const dbType = configManager.getDatabaseType()

  if (dbType === 'sqlserver') {
    const dbConfig = config.database.sqlserver
    const sqlServerService = new SqlServerService({
      server: dbConfig.server,
      port: dbConfig.port,
      user: dbConfig.username,
      password: dbConfig.password,
      database: dbConfig.database,
      options: {
        encrypt: false,
        trustServerCertificate: dbConfig.trustServerCertificate
      }
    })
    await sqlServerService.connect()
    return sqlServerService
  }

  if (dbType === 'postgresql') {
    const dbConfig = config.database.postgresql
    const pgService = new PostgreSqlService({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.username,
      password: dbConfig.password,
      database: dbConfig.database
    })
    await pgService.connect()
    return pgService
  }

  const dbConfig = config.database.mysql
  const mysqlService = new MySqlService({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database
  })
  await mysqlService.connect()
  return mysqlService
}

export function getValidationTableName(dottedTableName: string): string {
  const configManager = ConfigManager.getInstance()
  const dbType = configManager.getDatabaseType()

  const dotIndex = dottedTableName.indexOf('.')
  if (dotIndex > 0) {
    const schema = dottedTableName.substring(0, dotIndex)
    const tableName = dottedTableName.substring(dotIndex + 1)
    if (dbType === 'sqlserver') {
      return `[${schema}].[${tableName}]`
    }
    return `"${schema}"."${tableName}"`
  }
  // No dot found — use default schema
  if (dbType === 'sqlserver') {
    return `[dbo].[${dottedTableName}]`
  }
  return `"public"."${dottedTableName}"`
}
