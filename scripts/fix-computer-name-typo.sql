-- Migration script to fix ComputerNmae typo in dbo_BIPUsers table
-- Changes column name from 'ComputerNmae' to 'ComputerName'
-- Date: 2026-03-05

-- Rename the column (MySQL syntax)
ALTER TABLE dbo_BIPUsers 
CHANGE COLUMN ComputerNmae ComputerName VARCHAR(255) NULL;

-- Verify the change
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'dbo_BIPUsers' 
  AND COLUMN_NAME = 'ComputerName';
