/**
 * Migration Script: Add ProductionId column to CleanerOrderHistory table
 *
 * This script adds the ProductionId column to the ERPAuto.CleanerOrderHistory
 * table for tracking the original production ID (总排号) input.
 *
 * Usage:
 *   npx tsx src/main/services/user/migration/add-productionid-to-cleaner-order.ts
 */

import { ConfigManager } from '../../config/config-manager'
import { MySqlService } from '../../database/mysql'
import { SqlServerService } from '../../database/sql-server'
import { PostgreSqlService } from '../../database/postgresql'
import { createLogger } from '../../logger'
import { createCliLogger } from '../../../utils/cli-log'

const log = createLogger('Migration')
const cli = createCliLogger('AddProductionIdMigration')

async function runMySQLMigration(): Promise<void> {
  const configManager = ConfigManager.getInstance()
  await configManager.initialize()
  const dbConfig = configManager.getConfig().database.mysql

  const service = new MySqlService({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database
  })

  try {
    await service.connect()
    cli.success('Connected to MySQL')

    // Check if column already exists
    const check = await service.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CleanerOrderHistory' AND COLUMN_NAME = 'ProductionId'`
    )
    if ((check.rows[0]?.cnt as number) > 0) {
      cli.line('Column ProductionId already exists, skipping.')
      return
    }

    await service.query(`ALTER TABLE CleanerOrderHistory ADD COLUMN ProductionId VARCHAR(50) NULL`)
    cli.success('Added ProductionId column to CleanerOrderHistory.')
  } finally {
    if (service.isConnected()) await service.disconnect()
  }
}

async function runSqlServerMigration(): Promise<void> {
  const configManager = ConfigManager.getInstance()
  await configManager.initialize()
  const dbConfig = configManager.getConfig().database.sqlserver

  const service = new SqlServerService({
    server: dbConfig.server,
    port: dbConfig.port,
    user: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database,
    options: { trustServerCertificate: dbConfig.trustServerCertificate }
  })

  try {
    await service.connect()
    cli.success('Connected to SQL Server')

    // Check if column already exists
    const check = await service.query(
      `SELECT COUNT(*) as cnt FROM sys.columns WHERE OBJECT_ID = OBJECT_ID('ERPAuto.CleanerOrderHistory') AND name = 'ProductionId'`
    )
    if ((check.rows[0]?.cnt as number) > 0) {
      cli.line('Column ProductionId already exists, skipping.')
      return
    }

    await service.query(
      `ALTER TABLE [ERPAuto].[CleanerOrderHistory] ADD ProductionId NVARCHAR(50) NULL`
    )
    cli.success('Added ProductionId column to CleanerOrderHistory.')
  } finally {
    if (service.isConnected()) await service.disconnect()
  }
}

async function runPostgreSqlMigration(): Promise<void> {
  const configManager = ConfigManager.getInstance()
  await configManager.initialize()
  const dbConfig = configManager.getConfig().database.postgresql

  const service = new PostgreSqlService({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database
  })

  try {
    await service.connect()
    cli.success('Connected to PostgreSQL')

    await service.query(
      `ALTER TABLE "ERPAuto"."CleanerOrderHistory" ADD COLUMN IF NOT EXISTS "ProductionId" VARCHAR(50) NULL`
    )
    cli.success('Added ProductionId column to CleanerOrderHistory.')
  } finally {
    if (service.isConnected()) await service.disconnect()
  }
}

async function main(): Promise<void> {
  cli.line('Migration: Add ProductionId to CleanerOrderHistory')

  const configManager = ConfigManager.getInstance()
  await configManager.initialize()
  const dbType = configManager.getDatabaseType()

  cli.line(`Database type: ${dbType}`)

  if (dbType === 'mysql') {
    await runMySQLMigration()
  } else if (dbType === 'sqlserver') {
    await runSqlServerMigration()
  } else if (dbType === 'postgresql') {
    await runPostgreSqlMigration()
  } else {
    cli.error(`Unsupported database type: ${dbType}`)
    process.exit(1)
  }

  cli.success('Done.')
}

main().catch((err) => {
  cli.error('Migration failed', err instanceof Error ? { error: err.message, stack: err.stack } : err)
  process.exit(1)
})
