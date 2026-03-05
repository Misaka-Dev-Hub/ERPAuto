-- ============================================
-- BIPUsers Table Migration: Add ERP Parameters
-- Database: MySQL
-- ============================================
-- This script adds three new columns to store ERP connection parameters:
-- - ERP_URL: The ERP system URL
-- - ERP_Username: The ERP username  
-- - ERP_Password: The ERP password
--
-- Usage: Run this script in your MySQL client
-- Example: mysql -u root -p BLD_DB < add-erp-params-to-bipusers-mysql.sql
-- ============================================

USE BLD_DB;

-- Add ERP_URL column if not exists
SET @dbname = DATABASE();
SET @tablename = 'dbo_BIPUsers';
SET @columnname = 'ERP_URL';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(500) NULL')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add ERP_Username column if not exists
SET @columnname = 'ERP_Username';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(255) NULL')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add ERP_Password column if not exists
SET @columnname = 'ERP_Password';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(255) NULL')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Verify columns were added
SELECT 
  COLUMN_NAME, 
  DATA_TYPE, 
  CHARACTER_MAXIMUM_LENGTH,
  IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'dbo_BIPUsers'
  AND COLUMN_NAME IN ('ERP_URL', 'ERP_Username', 'ERP_Password');

-- Optional: Update all existing users with the same ERP credentials
-- Replace the values below with your actual ERP credentials
-- Example:
-- UPDATE dbo_BIPUsers 
-- SET ERP_URL = 'https://68.11.34.30:8082/',
--     ERP_Username = 'your_username',
--     ERP_Password = 'your_password'
-- WHERE ERP_URL IS NULL;

SELECT 'Migration completed successfully!' AS status;
