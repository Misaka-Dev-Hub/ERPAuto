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
import { fileURLToPath } from 'url'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { dirname } from 'path'
import yaml from 'js-yaml'
import { z } from 'zod'

const __filename = fileURLToPath(import.meta.url)

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  console.log(`  ✓ Added column ${columnName} to ${tableName}`)
}

/**
 * Main migration function
 */
async function runMigration(): Promise<void> {
  console.log('==============================================')
  console.log('BIPUsers Table Migration: Add ERP Parameters')
  console.log('==============================================\n')

  // Load config.yaml from project root or user data directory
  const isDev = !process.execPath.includes('Resources\\app')
  const configPath = isDev
    ? path.resolve(process.cwd(), 'config.yaml')
    : path.join(process.env.APPDATA || '', 'erpauto', 'config.yaml')

  console.log(`Loading config from: ${configPath}`)

  let dbConfig: { host: string; port: number; database: string; username: string; password: string }

  try {
    dbConfig = loadConfig(configPath)
  } catch (error) {
    console.error('Failed to load config.yaml:', error instanceof Error ? error.message : error)
    console.error('Please ensure config.yaml exists and contains valid MySQL configuration.')
    process.exit(1)
  }

  const dbHost = dbConfig.host || 'localhost'
  const dbPort = dbConfig.port || 3306
  const dbUser = dbConfig.username || 'root'
  const dbPassword = dbConfig.password || ''
  const dbName = dbConfig.database || ''

  console.log(`Database: ${dbHost}:${dbPort}/${dbName}`)
  console.log(`Username: ${dbUser}`)
  console.log('')

  let connection: mysql.Connection | null = null

  try {
    // Connect to MySQL
    console.log('Connecting to MySQL...')
    connection = await mysql.createConnection({
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword,
      database: dbName
    })
    console.log('✓ Connected to MySQL\n')

    const tableName = 'dbo_BIPUsers'

    // Check and add columns
    console.log('Checking columns...')
    for (const [columnName, columnType] of [
      ['ERP_URL', 'VARCHAR(500)'],
      ['ERP_Username', 'VARCHAR(255)'],
      ['ERP_Password', 'VARCHAR(255)']
    ] as const) {
      const exists = await checkColumnExists(connection, tableName, columnName)
      if (exists) {
        console.log(`  ✓ Column ${columnName} already exists`)
      } else {
        await addColumn(connection, tableName, columnName, columnType)
      }
    }

    console.log('\n==============================================')
    console.log('Migration Summary:')
    console.log('==============================================')
    console.log('Database Type: MySQL')
    console.log('Database: ' + dbName)
    console.log('Columns Added/Verified:')
    console.log('  - ERP_URL (VARCHAR 500)')
    console.log('  - ERP_Username (VARCHAR 255)')
    console.log('  - ERP_Password (VARCHAR 255)')
    console.log('==============================================')
    console.log('\n✅ Migration completed successfully!\n')
    console.log('Next steps:')
    console.log('1. Update ERP credentials for users in dbo_BIPUsers table')
    console.log('2. Example SQL:')
    console.log(`   UPDATE ${tableName}`)
    console.log(`   SET ERP_URL = 'https://your-erp.com',`)
    console.log(`       ERP_Username = 'your_username',`)
    console.log(`       ERP_Password = 'your_password'`)
    console.log(`   WHERE ERP_URL IS NULL;\n`)
  } catch (error) {
    console.error('\n❌ Migration failed with error:')
    console.error(error)
    console.error('\nTroubleshooting:')
    console.error('1. Check if MySQL server is running')
    console.error('2. Verify database credentials in config.yaml file')
    console.error('3. Ensure database "' + dbName + '" exists')
    console.error('4. Check network connectivity to ' + dbHost + ':' + dbPort)
    process.exit(1)
  } finally {
    // Disconnect
    if (connection) {
      try {
        await connection.end()
        console.log('Disconnected from MySQL')
      } catch {
        // Ignore disconnect errors
      }
    }
  }
}

// Run migration
runMigration().catch((error) => {
  console.error('Unexpected error:', error)
  process.exit(1)
})
