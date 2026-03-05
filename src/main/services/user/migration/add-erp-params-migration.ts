/**
 * Migration Script: Add ERP parameters to BIPUsers table
 *
 * This script adds ERP_URL, ERP_Username, and ERP_Password columns
 * to the dbo_BIPUsers table and initializes all existing users
 * with the same ERP credentials from the current .env configuration.
 *
 * Usage:
 *   npx tsx src/main/services/user/migration/add-erp-params-migration.ts
 */

import * as fs from 'fs'
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
  },
  columns: ['ERP_URL', 'ERP_Username', 'ERP_Password']
}

/**
 * Check if column exists in MySQL table
 */
async function checkColumnExistsMySQL(
  mysqlService: MySqlService,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const sql = `
    SELECT COUNT(*) as count 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = ? 
      AND COLUMN_NAME = ?
  `
  const result = await mysqlService.query(sql, [tableName, columnName])
  return result.rows.length > 0 && (result.rows[0].count as number) > 0
}

/**
 * Check if column exists in SQL Server table
 */
async function checkColumnExistsSqlServer(
  sqlServerService: SqlServerService,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const sql = `
    SELECT COUNT(*) as count 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(${tableName}) 
      AND name = @columnName
  `
  const result = await sqlServerService.queryWithParams(sql, {
    columnName: { value: columnName.replace('ERP_', ''), type: require('mssql').NVarChar(128) }
  })
  return result.rows.length > 0 && (result.rows[0].count as number) > 0
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
  const sql = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType} NULL`
  await mysqlService.query(sql)
  console.log(`  ✓ Added column ${columnName} to ${tableName}`)
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
  const sql = `ALTER TABLE ${tableName} ADD ${columnName} ${columnType} NULL`
  await sqlServerService.query(sql)
  console.log(`  ✓ Added column ${columnName} to ${tableName}`)
}

/**
 * Update all users with ERP credentials from .env
 */
async function initializeErpCredentialsMySQL(
  mysqlService: MySqlService,
  erpUrl: string,
  erpUsername: string,
  erpPassword: string
): Promise<number> {
  const sql = `
    UPDATE ${MIGRATION_CONFIG.tableName.mysql}
    SET ERP_URL = ?, ERP_Username = ?, ERP_Password = ?
    WHERE ERP_URL IS NULL OR ERP_URL = ''
  `
  const result = await mysqlService.query(sql, [erpUrl, erpUsername, erpPassword])
  return result.rowCount
}

/**
 * Update all users with ERP credentials from .env (SQL Server)
 */
async function initializeErpCredentialsSqlServer(
  sqlServerService: SqlServerService,
  erpUrl: string,
  erpUsername: string,
  erpPassword: string
): Promise<number> {
  const sql = `
    UPDATE ${MIGRATION_CONFIG.tableName.sqlserver}
    SET ERP_URL = @erpUrl, ERP_Username = @erpUsername, ERP_Password = @erpPassword
    WHERE ERP_URL IS NULL OR ERP_URL = ''
  `
  const result = await sqlServerService.queryWithParams(sql, {
    erpUrl: { value: erpUrl, type: require('mssql').NVarChar(500) },
    erpUsername: { value: erpUsername, type: require('mssql').NVarChar(255) },
    erpPassword: { value: erpPassword, type: require('mssql').NVarChar(255) }
  })
  return result.rowCount
}

/**
 * Run migration for MySQL
 */
async function runMySQLMigration(configManager: ConfigManager): Promise<void> {
  console.log('\n📦 Running MySQL Migration...')

  // Read database config from .env file with correct key names
  const mysqlHost = configManager.get('DB_MYSQL_HOST', 'localhost')
  const mysqlPort = configManager.getNumber('DB_MYSQL_PORT', 3306)
  const mysqlUser = configManager.get('DB_USERNAME', 'root')
  const mysqlPassword = configManager.get('DB_PASSWORD', '')
  const mysqlDatabase = configManager.get('DB_NAME', '')

  console.log(`Connecting to MySQL: ${mysqlHost}:${mysqlPort}/${mysqlDatabase}`)

  const mysqlService = new MySqlService({
    host: mysqlHost,
    port: mysqlPort,
    user: mysqlUser,
    password: mysqlPassword,
    database: mysqlDatabase
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

    // Initialize ERP credentials from .env
    const erpUrl = configManager.get('ERP_URL', '')
    const erpUsername = configManager.get('ERP_USERNAME', '')
    const erpPassword = configManager.get('ERP_PASSWORD', '')

    if (erpUrl && erpUsername && erpPassword) {
      const updatedCount = await initializeErpCredentialsMySQL(
        mysqlService,
        erpUrl,
        erpUsername,
        erpPassword
      )
      console.log(`  ✓ Updated ${updatedCount} users with ERP credentials`)
    } else {
      console.log('  ⚠ Skipping ERP credential initialization (missing .env values)')
    }

    console.log('✅ MySQL Migration completed successfully!\n')
  } catch (error) {
    console.error('❌ MySQL Migration failed:', error)
    throw error
  } finally {
    await mysqlService.disconnect()
  }
}

/**
 * Run migration for SQL Server
 */
async function runSqlServerMigration(configManager: ConfigManager): Promise<void> {
  console.log('\n📦 Running SQL Server Migration...')

  const mssql = await import('mssql')
  const sqlServerService = new SqlServerService({
    server: configManager.get('DB_SERVER', 'localhost'),
    port: configManager.getNumber('DB_SQLSERVER_PORT', 1433),
    user: configManager.get('DB_USERNAME', 'sa'),
    password: configManager.get('DB_PASSWORD', ''),
    database: configManager.get('DB_NAME', ''),
    options: {
      encrypt: false,
      trustServerCertificate: configManager.get('DB_TRUST_SERVER_CERTIFICATE') === 'yes'
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

    // Initialize ERP credentials from .env
    const erpUrl = configManager.get('ERP_URL', '')
    const erpUsername = configManager.get('ERP_USERNAME', '')
    const erpPassword = configManager.get('ERP_PASSWORD', '')

    if (erpUrl && erpUsername && erpPassword) {
      const updatedCount = await initializeErpCredentialsSqlServer(
        sqlServerService,
        erpUrl,
        erpUsername,
        erpPassword
      )
      console.log(`  ✓ Updated ${updatedCount} users with ERP credentials`)
    } else {
      console.log('  ⚠ Skipping ERP credential initialization (missing .env values)')
    }

    console.log('✅ SQL Server Migration completed successfully!\n')
  } catch (error) {
    console.error('❌ SQL Server Migration failed:', error)
    throw error
  } finally {
    await sqlServerService.disconnect()
  }
}

/**
 * Main migration runner
 */
async function runMigration(): Promise<void> {
  console.log('==============================================')
  console.log('BIPUsers Table Migration: Add ERP Parameters')
  console.log('==============================================\n')

  const configManager = ConfigManager.getInstance()
  await configManager.initialize()

  const dbType = configManager.get('DB_TYPE', 'mysql').toLowerCase()
  const isSqlServer = dbType === 'sqlserver' || dbType === 'mssql'

  try {
    if (isSqlServer) {
      await runSqlServerMigration(configManager)
    } else {
      await runMySQLMigration(configManager)
    }

    console.log('==============================================')
    console.log('Migration Summary:')
    console.log('==============================================')
    console.log(`Database Type: ${isSqlServer ? 'SQL Server' : 'MySQL'}`)
    console.log('Columns Added/Verified:')
    console.log('  - ERP_URL (VARCHAR/NVARCHAR 500)')
    console.log('  - ERP_Username (VARCHAR/NVARCHAR 255)')
    console.log('  - ERP_Password (VARCHAR/NVARCHAR 255)')
    console.log('==============================================\n')
  } catch (error) {
    console.error('\n❌ Migration failed with error:', error)
    process.exit(1)
  }
}

// Run migration
runMigration().catch((error) => {
  console.error('Unexpected error:', error)
  process.exit(1)
})
