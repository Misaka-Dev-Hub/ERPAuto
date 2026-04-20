/**
 * Simple Migration Script: Add ERP parameters to BIPUsers table
 *
 * This script adds ERP_URL, ERP_Username, and ERP_Password columns
 * to the dbo_BIPUsers table.
 *
 * Usage:
 *   npx tsx src/main/services/user/migration/run-migration.ts
 */

import * as mysql from 'mysql2/promise'
import * as fs from 'fs'
import * as path from 'path'
import yaml from 'js-yaml'
import { z } from 'zod'
import { createLogger } from '../../logger'
import { createCliLogger } from '../../../utils/cli-log'

const log = createLogger('MigrationRunner')
const cli = createCliLogger('MigrationRunner')

/**
 * MySQL configuration schema
 */
const mysqlConfigSchema = z.object({
  host: z.string(),
  port: z.number(),
  database: z.string(),
  username: z.string(),
  password: z.string()
})

/**
 * Load config.yaml file
 */
function loadConfig(filePath: string): {
  host: string
  port: number
  database: string
  username: string
  password: string
} {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`)
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const parsed = yaml.load(content) as Record<string, unknown>

  // Safely extract database.mysql config
  const database = parsed?.database as Record<string, unknown> | undefined
  const mysql = database?.mysql as Record<string, unknown> | undefined

  const result = mysqlConfigSchema.parse(mysql)
  return result
}

/**
 * Check if column exists in MySQL table
 */
async function checkColumnExists(
  connection: mysql.Connection,
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
  const [rows] = await connection.query(sql, [tableName, columnName])
  const result = rows as any[]
  return result.length > 0 && result[0].count > 0
}

/**
 * Add column to MySQL table
 */
async function addColumn(
  connection: mysql.Connection,
  tableName: string,
  columnName: string,
  columnType: string
): Promise<void> {
  const sql = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType} NULL`
  await connection.query(sql)
  cli.success(`Added column ${columnName} to ${tableName}`)
}

/**
 * Main migration function
 */
async function runMigration(): Promise<void> {
  cli.line('==============================================')
  cli.line('BIPUsers Table Migration: Add ERP Parameters')
  cli.line('==============================================')
  cli.line()

  // Load config.yaml from project root or user data directory
  const isDev = !process.execPath.includes('Resources\\app')
  const configPath = isDev
    ? path.resolve(process.cwd(), 'config.yaml')
    : path.join(process.env.APPDATA || '', 'erpauto', 'config.yaml')

  cli.line(`Loading config from: ${configPath}`)

  let dbConfig: { host: string; port: number; database: string; username: string; password: string }

  try {
    dbConfig = loadConfig(configPath)
  } catch (error) {
    log.error('Failed to load config', {
      error: error instanceof Error ? error.message : String(error),
      configPath
    })
    process.exit(1)
  }

  const dbHost = dbConfig.host || 'localhost'
  const dbPort = dbConfig.port || 3306
  const dbUser = dbConfig.username || 'root'
  const dbPassword = dbConfig.password || ''
  const dbName = dbConfig.database || ''

  cli.line(`Database: ${dbHost}:${dbPort}/${dbName}`)
  cli.line(`Username: ${dbUser}`)
  cli.line()

  let connection: mysql.Connection | null = null

  try {
    // Connect to MySQL
    cli.line('Connecting to MySQL...')
    connection = await mysql.createConnection({
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword,
      database: dbName
    })
    cli.success('Connected to MySQL')
    cli.line()

    const tableName = 'dbo_BIPUsers'

    // Check and add columns
    cli.line('Checking columns...')
    for (const [columnName, columnType] of [
      ['ERP_URL', 'VARCHAR(500)'],
      ['ERP_Username', 'VARCHAR(255)'],
      ['ERP_Password', 'VARCHAR(255)']
    ] as const) {
      const exists = await checkColumnExists(connection, tableName, columnName)
      if (exists) {
        cli.success(`Column ${columnName} already exists`)
      } else {
        await addColumn(connection, tableName, columnName, columnType)
      }
    }

    cli.line()
    cli.line('==============================================')
    cli.line('Migration Summary:')
    cli.line('==============================================')
    cli.line('Database Type: MySQL')
    cli.line('Database: ' + dbName)
    cli.line('Columns Added/Verified:')
    cli.line('  - ERP_URL (VARCHAR 500)')
    cli.line('  - ERP_Username (VARCHAR 255)')
    cli.line('  - ERP_Password (VARCHAR 255)')
    cli.line('==============================================')
    cli.line()
    cli.success('Migration completed successfully!')
    cli.line()
    cli.line('Next steps:')
    cli.line('1. Update ERP credentials for users in dbo_BIPUsers table')
    cli.line('2. Example SQL:')
    cli.line(`   UPDATE ${tableName}`)
    cli.line(`   SET ERP_URL = 'https://your-erp.com',`)
    cli.line(`       ERP_Username = 'your_username',`)
    cli.line(`       ERP_Password = 'your_password'`)
    cli.line(`   WHERE ERP_URL IS NULL;`)
    cli.line()
  } catch (error) {
    log.error('Migration failed', { error })
    cli.errorLine()
    cli.errorLine('Troubleshooting:')
    cli.errorLine('1. Check if MySQL server is running')
    cli.errorLine('2. Verify database credentials in config.yaml file')
    cli.errorLine(`3. Ensure database "${dbName}" exists`)
    cli.errorLine(`4. Check network connectivity to ${dbHost}:${dbPort}`)
    process.exit(1)
  } finally {
    // Disconnect
    if (connection) {
      try {
        await connection.end()
        cli.line('Disconnected from MySQL')
      } catch {
        // Ignore disconnect errors
      }
    }
  }
}

// Run migration
runMigration().catch((error) => {
  log.error('Unexpected error', { error })
  process.exit(1)
})
