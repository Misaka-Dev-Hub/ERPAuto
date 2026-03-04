/**
 * Fix MaterialsTypeToBeDeleted Table - Add AUTO_INCREMENT to ID
 *
 * This script modifies the ID column to be AUTO_INCREMENT while preserving data
 */

const mysql = require('mysql2/promise')

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

    // Step 1: Check current table structure
    console.log('=== Step 1: Current table structure ===')
    const [columns] = await connection.execute(`
      SELECT
        COLUMN_NAME,
        COLUMN_TYPE,
        IS_NULLABLE,
        COLUMN_KEY,
        COLUMN_DEFAULT,
        EXTRA
      FROM
        INFORMATION_SCHEMA.COLUMNS
      WHERE
        TABLE_NAME = 'dbo_MaterialsTypeToBeDeleted'
        AND TABLE_SCHEMA = DATABASE()
      ORDER BY
        ORDINAL_POSITION
    `)
    console.table(columns)

    // Step 2: Count records before modification
    console.log('\n=== Step 2: Record count before modification ===')
    const [countBefore] = await connection.execute(
      'SELECT COUNT(*) AS total FROM dbo_MaterialsTypeToBeDeleted'
    )
    console.log(`Total records: ${countBefore[0].total}`)

    // Step 3: Show sample data
    console.log('\n=== Step 3: Sample data ===')
    const [sample] = await connection.execute('SELECT * FROM dbo_MaterialsTypeToBeDeleted LIMIT 5')
    console.table(sample)

    // Step 4: Check if ID is already AUTO_INCREMENT
    const idColumn = columns.find((col) => col.COLUMN_NAME === 'ID')
    if (idColumn && idColumn.EXTRA.includes('auto_increment')) {
      console.log('\n=== ID is already AUTO_INCREMENT! No modification needed. ===')
      return
    }

    // Step 5: Modify the ID column
    console.log('\n=== Step 4: Modifying ID column to AUTO_INCREMENT ===')
    await connection.execute(`
      ALTER TABLE dbo_MaterialsTypeToBeDeleted
      MODIFY COLUMN ID INT NOT NULL AUTO_INCREMENT
    `)
    console.log('Modification completed successfully!\n')

    // Step 6: Verify the change
    console.log('=== Step 5: Verify modification ===')
    const [columnsAfter] = await connection.execute(`
      SELECT
        COLUMN_NAME,
        COLUMN_TYPE,
        IS_NULLABLE,
        COLUMN_KEY,
        EXTRA
      FROM
        INFORMATION_SCHEMA.COLUMNS
      WHERE
        TABLE_NAME = 'dbo_MaterialsTypeToBeDeleted'
        AND TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME = 'ID'
    `)
    console.table(columnsAfter)

    // Step 7: Verify data is still intact
    console.log('\n=== Step 6: Verify data integrity ===')
    const [countAfter] = await connection.execute(
      'SELECT COUNT(*) AS total FROM dbo_MaterialsTypeToBeDeleted'
    )
    console.log(`Total records after modification: ${countAfter[0].total}`)

    if (countBefore[0].total === countAfter[0].total) {
      console.log('\n✅ SUCCESS: All data preserved, AUTO_INCREMENT added to ID column!')
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
