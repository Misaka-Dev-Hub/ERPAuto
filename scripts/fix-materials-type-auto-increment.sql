-- ============================================================================
-- Script: Fix MaterialsTypeToBeDeleted Table - Add AUTO_INCREMENT to ID
-- Description: Modify the ID column to be AUTO_INCREMENT while preserving data
-- Database: MySQL
-- ============================================================================

-- Step 1: Check current table structure
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
    ORDINAL_POSITION;

-- Step 2: View current data before modification
SELECT COUNT(*) AS total_records FROM dbo_MaterialsTypeToBeDeleted;
SELECT * FROM dbo_MaterialsTypeToBeDeleted LIMIT 10;

-- Step 3: Check if ID is already AUTO_INCREMENT
SELECT
    COLUMN_NAME,
    EXTRA
FROM
    INFORMATION_SCHEMA.COLUMNS
WHERE
    TABLE_NAME = 'dbo_MaterialsTypeToBeDeleted'
    AND TABLE_SCHEMA = DATABASE()
    AND COLUMN_NAME = 'ID';

-- ============================================================================
-- Step 4: Modify the ID column to AUTO_INCREMENT
-- Note: This assumes ID is already the PRIMARY KEY
-- If not, you may need to add PRIMARY KEY constraint first
-- ============================================================================

-- Option A: If ID is already PRIMARY KEY (most likely case)
ALTER TABLE dbo_MaterialsTypeToBeDeleted
MODIFY COLUMN ID INT NOT NULL AUTO_INCREMENT;

-- Option B: If ID is NOT PRIMARY KEY (uncomment if needed)
-- First check if there's an existing primary key
-- SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
-- WHERE TABLE_NAME = 'dbo_MaterialsTypeToBeDeleted'
-- AND TABLE_SCHEMA = DATABASE() AND COLUMN_KEY = 'PRI';
--
-- If no primary key exists:
-- ALTER TABLE dbo_MaterialsTypeToBeDeleted
-- MODIFY COLUMN ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY;

-- Step 5: Verify the change
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
    AND COLUMN_NAME = 'ID';

-- Step 6: Verify data is still intact
SELECT COUNT(*) AS total_records_after FROM dbo_MaterialsTypeToBeDeleted;

-- ============================================================================
-- Expected Results:
-- After running this script, the ID column should show:
-- EXTRA: 'auto_increment'
--
-- This will allow INSERT statements to omit the ID field, and MySQL will
-- automatically generate the next sequential ID value.
-- ============================================================================