/**
 * Migration Script: Add ERP parameters to BIPUsers table
 *
 * This script adds ERP_URL, ERP_Username, and ERP_Password columns
 * to the dbo_BIPUsers table and initializes all existing users.
 *
 * Note: ERP credentials are now stored per-user in the database.
 * This migration is for backward compatibility only.
 *
 * Usage:
 *   npx tsx src/main/services/user/migration/add-erp-params-migration.ts
 */

import * as path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { ConfigManager } from '../../config/config-manager'
import { MySqlService } from '../../database/mysql'
import { SqlServerService } from '../../database/sql-server'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Migration configuration
 */
const MIGRATION_CONFIG = {
  sqlFile: path.join(__dirname, 'add-erp-params-to-bipusers.sql'),
  tableName: {
    mysql: 'dbo_BIPUsers',
    sqlserver: '[dbo].[BIPUsers]'
  }
}

/**
 * Check if column exists in MySQL table
 */
async function checkColumnExistsMySQL(
  mysqlService: MySqlService,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const result = await mysqlService.query(
    `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  )
  return (result.rows[0]?.count as number) > 0
}

/**
 * Check if column exists in SQL Server table
 */
async function checkColumnExistsSqlServer(
  sqlServerService: SqlServerService,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const result = await sqlServerService.query(
    `SELECT COUNT(*) as count FROM sys.columns 
     WHERE OBJECT_ID = OBJECT_ID(?) AND name = ?`,
    [tableName, columnName]
  )
  return (result.rows[0]?.count as number) > 0
}

/**
 * Add column to MySQL table
 */
async function addColumnMySQL(
  mysqlService: MySqlService,
  tableName: string,
  columnName: string,
  columnType: string
): Promise<void> {
  await mysqlService.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`)
  console.log(`  ✓ Added column ${columnName} (${columnType})`)
}

/**
 * Add column to SQL Server table
 */
async function addColumnSqlServer(
  sqlServerService: SqlServerService,
  tableName: string,
  columnName: string,
  columnType: string
): Promise<void> {
  await sqlServerService.query(`ALTER TABLE ${tableName} ADD ${columnName} ${columnType}`)
  console.log(`  ✓ Added column ${columnName} (${columnType})`)
}

/**
 * Run migration for MySQL
 */
async function runMySQLMigration(configManager: ConfigManager): Promise<void> {
  console.log('\n📦 Running MySQL Migration...')

  const config = configManager.getConfig()
  const dbConfig = config.database.mysql

  console.log(`Connecting to MySQL: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`)

  const mysqlService = new MySqlService({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database
  })

  try {
    await mysqlService.connect()
    console.log('✓ Connected to MySQL')

    const tableName = MIGRATION_CONFIG.tableName.mysql

    // Check and add columns
    for (const [columnName, columnType] of [
      ['ERP_URL', 'VARCHAR(500)'],
      ['ERP_Username', 'VARCHAR(255)'],
      ['ERP_Password', 'VARCHAR(255)']
    ] as const) {
      const exists = await checkColumnExistsMySQL(mysqlService, tableName, columnName)
      if (exists) {
        console.log(`  ✓ Column ${columnName} already exists`)
      } else {
        await addColumnMySQL(mysqlService, tableName, columnName, columnType)
      }
    }

    // Note: ERP credentials are now managed per-user via settings UI
    // This migration no longer initializes them from config
    console.log('\n✓ MySQL Migration completed')
    console.log('  Note: ERP credentials should be configured per-user via the Settings UI')

    await mysqlService.disconnect()
  } catch (error) {
    console.error('✗ MySQL Migration failed:', error instanceof Error ? error.message : error)
    if (mysqlService.isConnected()) {
      await mysqlService.disconnect()
    }
    throw error
  }
}

/**
 * Run migration for SQL Server
 */
async function runSqlServerMigration(configManager: ConfigManager): Promise<void> {
  console.log('\n📦 Running SQL Server Migration...')

  const config = configManager.getConfig()
  const dbConfig = config.database.sqlserver

  console.log(`Connecting to SQL Server: ${dbConfig.server}:${dbConfig.port}/${dbConfig.database}`)

  const sqlServerService = new SqlServerService({
    server: dbConfig.server,
    port: dbConfig.port,
    user: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database,
    options: {
      trustServerCertificate: dbConfig.trustServerCertificate
    }
  })

  try {
    await sqlServerService.connect()
    console.log('✓ Connected to SQL Server')

    const tableName = MIGRATION_CONFIG.tableName.sqlserver

    // Check and add columns
    for (const [columnName, columnType] of [
      ['ERP_URL', 'NVARCHAR(500)'],
      ['ERP_Username', 'NVARCHAR(255)'],
      ['ERP_Password', 'NVARCHAR(255)']
    ] as const) {
      const exists = await checkColumnExistsSqlServer(sqlServerService, tableName, columnName)
      if (exists) {
        console.log(`  ✓ Column ${columnName} already exists`)
      } else {
        await addColumnSqlServer(sqlServerService, tableName, columnName, columnType)
      }
    }

    // Note: ERP credentials are now managed per-user via settings UI
    console.log('\n✓ SQL Server Migration completed')
    console.log('  Note: ERP credentials should be configured per-user via the Settings UI')

    await sqlServerService.disconnect()
  } catch (error) {
    console.error('✗ SQL Server Migration failed:', error instanceof Error ? error.message : error)
    if (sqlServerService.isConnected()) {
      await sqlServerService.disconnect()
    }
    throw error
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════════╗')
  console.log('║   Migration: Add ERP Parameters to BIPUsers Table        ║')
  console.log('╚═══════════════════════════════════════════════════════════╝')

  try {
    const configManager = ConfigManager.getInstance()
    await configManager.initialize()

    const dbType = configManager.getDatabaseType()
    console.log(`\nCurrent database type: ${dbType}`)

    if (dbType === 'mysql') {
      await runMySQLMigration(configManager)
    } else {
      await runSqlServerMigration(configManager)
    }

    console.log('\n✅ Migration completed successfully!\n')
  } catch (error) {
    console.error('\n❌ Migration failed:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
