# Manual Testing Notes - Database Integration

## Overview

This document describes the manual testing requirements for the TypeORM-based database refactoring. The unit tests that require actual database connections are skipped in CI/CD and must be tested manually with real database instances.

## MySQL Configuration

### Prerequisites

1. MySQL 5.7+ or MySQL 8.0+ installed and running
2. Database created with the required table structure
3. User account with appropriate permissions

### Configuration

Update `.env` file with MySQL connection settings:

```bash
# Database Type (required)
DB_TYPE=mysql

# MySQL Connection (required)
DB_MYSQL_HOST=localhost
DB_MYSQL_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_password
DB_NAME=your_database

# Optional: If using a different database for testing
# DB_TEST_NAME=your_test_database
```

### Table Structure

The application expects these tables to exist:

#### Production Contract Table
```sql
CREATE TABLE `productionContractData_26年压力表合同数据` (
  `总排号` VARCHAR(50) PRIMARY KEY,
  `生产订单号` VARCHAR(50) NOT NULL,
  INDEX `idx_production_id` (`总排号`),
  INDEX `idx_order_number` (`生产订单号`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### Discrete Material Plan Table
```sql
CREATE TABLE `DiscreteMaterialPlanData` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `Factory` NVARCHAR(100),
  `MaterialStatus` NVARCHAR(50),
  `PlanNumber` NVARCHAR(100),
  `SourceNumber` NVARCHAR(100),
  `MaterialType` NVARCHAR(100),
  `ProductCode` NVARCHAR(100),
  `ProductName` NVARCHAR(255),
  `ProductUnit` NVARCHAR(50),
  `ProductPlanQuantity` DECIMAL(18,4),
  `UseDepartment` NVARCHAR(100),
  `Remark` NVARCHAR(500),
  `Creator` NVARCHAR(100),
  `CreateDate` DATETIME,
  `Approver` NVARCHAR(100),
  `ApproveDate` DATETIME,
  `SequenceNumber` INT,
  `MaterialCode` NVARCHAR(100),
  `MaterialName` NVARCHAR(255),
  `Specification` NVARCHAR(255),
  `Model` NVARCHAR(255),
  `DrawingNumber` NVARCHAR(100),
  `MaterialQuality` NVARCHAR(100),
  `PlanQuantity` DECIMAL(18,4),
  `Unit` NVARCHAR(50),
  `RequiredDate` DATETIME,
  `Warehouse` NVARCHAR(100),
  `UnitUsage` DECIMAL(18,6),
  `CumulativeOutputQuantity` DECIMAL(18,4),
  `BOMVersion` NVARCHAR(50),
  INDEX `idx_PlanNumber` (`PlanNumber`),
  INDEX `idx_SourceNumber` (`SourceNumber`),
  INDEX `idx_MaterialCode` (`MaterialCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### Materials To Be Deleted Table
```sql
CREATE TABLE `MaterialsToBeDeleted` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `MaterialCode` NVARCHAR(255) NOT NULL,
  `ManagerName` NVARCHAR(255),
  UNIQUE KEY `MaterialCode` (`MaterialCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Test Steps

1. **Start Application**
   ```bash
   npm run dev
   ```

2. **Navigate to Extractor Page**
   - Login as an admin user
   - Click on "Extractor" in the sidebar

3. **Test Production ID Resolution**
   - Enter production IDs: `22A1`, `22A2`, `22A3`
   - Click "开始提取" (Start Extraction)
   - Verify that production IDs are resolved to order numbers
   - Check console/logs for MySQL query syntax (should use backticks and `?` placeholders)

4. **Verify Database Queries**
   - Check application logs for query execution
   - Verify syntax: `SELECT * FROM \`table_name\` WHERE ...`
   - Verify parameterized queries with `?` placeholders

5. **Test Data Insertion**
   - Run a full extraction cycle
   - Verify data is inserted into `DiscreteMaterialPlanData` table
   - Check that Chinese column names are preserved in backticks

### Expected Results

- Application connects to MySQL successfully
- Production IDs are resolved to order numbers via database lookup
- Extracted data is saved to database with correct encoding
- Query logs show proper MySQL syntax (backticks, `?` placeholders)
- No encoding issues with Chinese characters

### Troubleshooting

**Connection Refused**
- Verify MySQL is running: `mysql.server status` (Mac) or `services.msc` (Windows)
- Check host and port in `.env` file
- Verify firewall allows connection on port 3306

**Authentication Failed**
- Verify username and password in `.env`
- Check user has permissions: `GRANT ALL PRIVILEGES ON your_database.* TO 'user'@'host';`
- Flush privileges: `FLUSH PRIVILEGES;`

**Encoding Issues**
- Verify database charset: `SHOW VARIABLES LIKE 'character_set%';`
- Should show `utf8mb4` for maximum compatibility
- Re-create tables with `DEFAULT CHARSET=utf8mb4` if needed

## SQL Server Configuration

### Prerequisites

1. SQL Server 2017+ or SQL Server Express installed and running
2. Database created with the required table structure
3. SQL Server Authentication enabled
4. TCP/IP protocol enabled in SQL Server Configuration Manager

### Configuration

Update `.env` file with SQL Server connection settings:

```bash
# Database Type (required)
DB_TYPE=sqlserver

# SQL Server Connection (required)
DB_SQLSERVER_HOST=localhost
DB_SQLSERVER_PORT=1433
DB_USERNAME=sa
DB_PASSWORD=your_password
DB_NAME=your_database

# Optional: Windows Authentication
# DB_WINDOWS_AUTH=true
```

### Table Structure

SQL Server uses similar table structure with T-SQL syntax:

```sql
CREATE TABLE [productionContractData_26年压力表合同数据] (
  [总排号] VARCHAR(50) PRIMARY KEY,
  [生产订单号] VARCHAR(50) NOT NULL
);
CREATE INDEX idx_production_id ON [productionContractData_26年压力表合同数据]([总排号]);
CREATE INDEX idx_order_number ON [productionContractData_26年压力表合同数据]([生产订单号]);

CREATE TABLE [DiscreteMaterialPlanData] (
  [id] INT IDENTITY(1,1) PRIMARY KEY,
  [Factory] NVARCHAR(100),
  [MaterialStatus] NVARCHAR(50),
  [PlanNumber] NVARCHAR(100),
  [SourceNumber] NVARCHAR(100),
  -- ... (other columns similar to MySQL)
  [BOMVersion] NVARCHAR(50)
);
```

### Test Steps

1. **Start Application**
   ```bash
   npm run dev
   ```

2. **Navigate to Extractor Page**
   - Login as an admin user
   - Click on "Extractor" in the sidebar

3. **Test Production ID Resolution**
   - Enter production IDs: `22A1`, `22A2`, `22A3`
   - Click "开始提取" (Start Extraction)
   - Verify that production IDs are resolved to order numbers
   - Check console/logs for SQL Server query syntax (should use `@p1`, `@p2` parameters)

4. **Verify Database Queries**
   - Check application logs for query execution
   - Verify syntax: `SELECT * FROM [table_name] WHERE ...`
   - Verify parameterized queries with `@p1`, `@p2` placeholders

5. **Test Data Insertion**
   - Run a full extraction cycle
   - Verify data is inserted into `DiscreteMaterialPlanData` table
   - Check that Chinese column names are preserved in square brackets

### Expected Results

- Application connects to SQL Server successfully
- Production IDs are resolved to order numbers via database lookup
- Extracted data is saved to database with correct encoding
- Query logs show proper SQL Server syntax (square brackets, `@p` parameters)
- No encoding issues with Chinese characters

### Troubleshooting

**Connection Refused**
- Verify SQL Server is running: Check SQL Server Configuration Manager
- Enable TCP/IP protocol in SQL Server Network Configuration
- Restart SQL Server service after changing protocols
- Verify port 1433 is not blocked by firewall

**Authentication Failed**
- Verify SQL Server Authentication is enabled (not just Windows Authentication)
- Check username and password in `.env`
- For `sa` account, verify it's enabled: `ALTER LOGIN sa ENABLE;`
- Check password complexity requirements

**Named Pipes Error**
- Enable Named Pipes protocol in SQL Server Configuration Manager
- Or use TCP/IP only (recommended)
- Add `encrypt=false` to connection string if using self-signed certificates

## Unit Tests Requiring Database

The following unit tests require actual database connections and are skipped when database is unavailable:

- `tests/unit/ProductionContractRepository.test.ts` - All 7 tests
- `tests/unit/repositories.test.ts` - TypeORM entity tests

These tests should be run manually after setting up the database:

```bash
# Run with MySQL
npm test -- tests/unit/ProductionContractRepository.test.ts

# Run with SQL Server (change DB_TYPE in .env first)
npm test -- tests/unit/ProductionContractRepository.test.ts
```

## Status

- [x] Code implementation complete
- [x] TypeScript compilation successful (with pre-existing warnings)
- [x] Unit tests passing (excluding database-dependent tests)
- [ ] Manual MySQL testing - awaiting database setup
- [ ] Manual SQL Server testing - awaiting database setup

## Next Steps

1. Set up MySQL test environment
2. Run manual tests per this document
3. Set up SQL Server test environment
4. Run manual tests per this document
5. Report any issues found
6. Update this document with actual test results
