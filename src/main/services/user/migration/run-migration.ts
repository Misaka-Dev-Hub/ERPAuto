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
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Load .env file manually
 */
function loadEnv(filePath: string): Map<string, string> {
  const envMap = new Map<string, string>()

  if (!fs.existsSync(filePath)) {
    console.warn(`.env file not found: ${filePath}`)
    return envMap
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue
    }

    const [key, ...valueParts] = trimmedLine.split('=')
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim()
      envMap.set(key.trim(), value)
    }
  }

  return envMap
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
  console.log(`  ✓ Added column ${columnName} to ${tableName}`)
}

/**
 * Main migration function
 */
async function runMigration(): Promise<void> {
  console.log('==============================================')
  console.log('BIPUsers Table Migration: Add ERP Parameters')
  console.log('==============================================\n')

  // Load .env file from project root
  const envPath = path.resolve(process.cwd(), '.env')
  console.log(`Loading .env from: ${envPath}`)
  const env = loadEnv(envPath)

  // Get database configuration
  const dbHost = env.get('DB_MYSQL_HOST') || 'localhost'
  const dbPort = parseInt(env.get('DB_MYSQL_PORT') || '3306', 10)
  const dbUser = env.get('DB_USERNAME') || 'root'
  const dbPassword = env.get('DB_PASSWORD') || ''
  const dbName = env.get('DB_NAME') || ''

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
    console.error('2. Verify database credentials in .env file')
    console.error('3. Ensure database "' + dbName + '" exists')
    console.error('4. Check network connectivity to ' + dbHost + ':' + dbPort)
    process.exit(1)
  } finally {
    // Disconnect
    if (connection) {
      try {
        await connection.end()
        console.log('Disconnected from MySQL')
      } catch (e) {
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
