/**
 * Database Migration Script
 * Add ERP configuration fields to dbo_BIPUsers table
 * 
 * This script adds three new columns to store ERP connection parameters:
 * - ERP_URL: The ERP system URL
 * - ERP_USERNAME: The ERP username
 * - ERP_PASSWORD: The ERP password (encrypted in production)
 * 
 * IMPORTANT: 
 * - For SQL Server: Run this script on the SQL Server database
 * - For MySQL: Run this script on the MySQL database (syntax is auto-detected)
 * - All existing users will have the same ERP credentials (to be configured individually later)
 */

-- ===========================================
-- SQL Server Version
-- ===========================================
-- Uncomment and run this section for SQL Server
/*
IF NOT EXISTS (SELECT * FROM sys.columns 
               WHERE object_id = OBJECT_ID(N'[dbo].[BIPUsers]') 
               AND name = 'ERP_URL')
BEGIN
    ALTER TABLE [dbo].[BIPUsers] 
    ADD ERP_URL NVARCHAR(500) NULL;
    
    ALTER TABLE [dbo].[BIPUsers] 
    ADD ERP_Username NVARCHAR(255) NULL;
    
    ALTER TABLE [dbo].[BIPUsers] 
    ADD ERP_Password NVARCHAR(255) NULL;
    
    PRINT 'ERP columns added successfully to [dbo].[BIPUsers]';
END
ELSE
BEGIN
    PRINT 'ERP columns already exist in [dbo].[BIPUsers]';
END

-- Optional: Update all existing users with the same ERP credentials
-- Replace the values below with your actual ERP credentials
-- UPDATE [dbo].[BIPUsers] 
-- SET ERP_URL = 'https://your-erp-system.com',
--     ERP_Username = 'your_username',
--     ERP_Password = 'your_password'
-- WHERE ERP_URL IS NULL;
*/

-- ===========================================
-- MySQL Version
-- ===========================================
-- Run this section for MySQL

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

-- Optional: Update all existing users with the same ERP credentials
-- Replace the values below with your actual ERP credentials
-- UPDATE dbo_BIPUsers 
-- SET ERP_URL = 'https://your-erp-system.com',
--     ERP_Username = 'your_username',
--     ERP_Password = 'your_password'
-- WHERE ERP_URL IS NULL;
