/**
 * Fix ComputerNmae Typo in dbo_BIPUsers Table
 *
 * This script renames the column from 'ComputerNmae' to 'ComputerName'
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mysql = require('mysql2/promise')

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function main() {
  const config = {
    host: '192.168.31.83',
    port: 3306,
    user: 'remote_user',
    password: '3.1415926Beeke',
    database: 'BLD_DB'
  }

  let connection

  try {
    console.log('Connecting to MySQL...')
    connection = await mysql.createConnection(config)
    console.log('Connected successfully!\n')

    // Step 1: Check current column name
    console.log('=== Step 1: Check current column name ===')
    const [columns] = await connection.execute(`
      SELECT
        COLUMN_NAME,
        COLUMN_TYPE,
        IS_NULLABLE,
        CHARACTER_MAXIMUM_LENGTH,
        COLUMN_KEY,
        COLUMN_DEFAULT,
        EXTRA
      FROM
        INFORMATION_SCHEMA.COLUMNS
      WHERE
        TABLE_NAME = 'dbo_BIPUsers'
        AND TABLE_SCHEMA = DATABASE()
        AND (COLUMN_NAME = 'ComputerNmae' OR COLUMN_NAME = 'ComputerName')
      ORDER BY
        ORDINAL_POSITION
    `)

    if (columns.length === 0) {
      console.log('No ComputerNmae or ComputerName column found!')
      return
    }

    console.table(columns)

    const currentColumn = columns.find((col) => col.COLUMN_NAME === 'ComputerNmae')
    const newColumn = columns.find((col) => col.COLUMN_NAME === 'ComputerName')

    if (newColumn) {
      console.log('\n=== Column is already named "ComputerName"! No modification needed. ===')
      return
    }

    if (!currentColumn) {
      console.log('\n=== ERROR: ComputerNmae column not found! ===')
      return
    }

    // Step 2: Count records before modification
    console.log('\n=== Step 2: Record count before modification ===')
    const [countBefore] = await connection.execute('SELECT COUNT(*) AS total FROM dbo_BIPUsers')
    console.log(`Total records: ${countBefore[0].total}`)

    // Step 3: Show sample data with the column
    console.log('\n=== Step 3: Sample data (showing ComputerNmae column) ===')
    const [sample] = await connection.execute(`
      SELECT ID, UserName, UserType, ComputerNmae, CreateTime
      FROM dbo_BIPUsers
      LIMIT 5
    `)
    console.table(sample)

    // Step 4: Rename the column
    console.log('\n=== Step 4: Renaming column ComputerNmae -> ComputerName ===')
    await connection.execute(`
      ALTER TABLE dbo_BIPUsers
      CHANGE COLUMN ComputerNmae ComputerName VARCHAR(255) NULL
    `)
    console.log('Column renamed successfully!\n')

    // Step 5: Verify the change
    console.log('=== Step 5: Verify modification ===')
    const [columnsAfter] = await connection.execute(`
      SELECT
        COLUMN_NAME,
        COLUMN_TYPE,
        IS_NULLABLE,
        CHARACTER_MAXIMUM_LENGTH,
        COLUMN_KEY,
        COLUMN_DEFAULT,
        EXTRA
      FROM
        INFORMATION_SCHEMA.COLUMNS
      WHERE
        TABLE_NAME = 'dbo_BIPUsers'
        AND TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME = 'ComputerName'
    `)
    console.table(columnsAfter)

    // Step 6: Verify data is still intact
    console.log('\n=== Step 6: Verify data integrity ===')
    const [countAfter] = await connection.execute('SELECT COUNT(*) AS total FROM dbo_BIPUsers')
    console.log(`Total records after modification: ${countAfter[0].total}`)

    // Step 7: Show sample data with new column name
    console.log('\n=== Step 7: Sample data (showing ComputerName column) ===')
    const [sampleAfter] = await connection.execute(`
      SELECT ID, UserName, UserType, ComputerName, CreateTime
      FROM dbo_BIPUsers
      LIMIT 5
    `)
    console.table(sampleAfter)

    if (countBefore[0].total === countAfter[0].total) {
      console.log(
        '\n✅ SUCCESS: All data preserved, column renamed from ComputerNmae to ComputerName!'
      )
    } else {
      console.log('\n⚠️ WARNING: Record count changed! Please check data.')
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message)
    if (error.code) {
      console.error('Error code:', error.code)
    }
  } finally {
    if (connection) {
      await connection.end()
      console.log('\nConnection closed.')
    }
  }
}

main()
