/**
 * Configuration Schema Definitions
 *
 * Zod schemas for runtime validation of application configuration
 *
 * Note: ERP configuration is stored in database (dbo_BIPUsers table)
 * and managed per-user, not in this config file.
 */

import { z } from 'zod'

/**
 * 数据库类型枚举
 */
export const databaseTypeSchema = z.enum(['mysql', 'sqlserver'])
export type DatabaseType = z.infer<typeof databaseTypeSchema>

/**
 * 验证匹配模式枚举
 */
export const matchModeSchema = z.enum(['substring', 'exact'])
export type MatchMode = z.infer<typeof matchModeSchema>

/**
 * 验证数据源枚举
 */
export const validationDataSourceSchema = z.enum([
  'database_full',
  'database_filtered',
  'excel_existing',
  'excel_full'
])
export type ValidationDataSource = z.infer<typeof validationDataSourceSchema>

/**
 * MySQL 配置 Schema
 */
export const mysqlConfigSchema = z.object({
  host: z.string().min(1, 'MySQL host is required'),
  port: z.number().int().min(1).max(65535).default(3306),
  database: z.string().min(1, 'MySQL database is required'),
  username: z.string().min(1, 'MySQL username is required'),
  password: z.string(),
  charset: z.string().default('utf8mb4')
})

/**
 * SQL Server 配置 Schema
 */
export const sqlServerConfigSchema = z.object({
  server: z.string().min(1, 'SQL Server is required'),
  port: z.number().int().min(1).max(65535).default(1433),
  database: z.string().min(1, 'SQL Server database is required'),
  username: z.string().min(1, 'SQL Server username is required'),
  password: z.string(),
  driver: z.string().default('ODBC Driver 18 for SQL Server'),
  trustServerCertificate: z.boolean().default(true)
})

/**
 * 数据库配置（包含两种数据库的完整配置）
 */
export const databaseConfigSchema = z.object({
  activeType: databaseTypeSchema.default('mysql'),
  mysql: mysqlConfigSchema,
  sqlserver: sqlServerConfigSchema
})

/**
 * 路径配置 Schema
 */
export const pathsConfigSchema = z.object({
  dataDir: z.string().min(1, 'Data directory is required'),
  defaultOutput: z.string().default('离散备料计划维护_合并.xlsx'),
  validationOutput: z.string().default('物料状态校验结果.xlsx')
})

/**
 * 数据提取配置 Schema
 */
export const extractionConfigSchema = z.object({
  batchSize: z.number().int().min(1).max(1000).default(100),
  verbose: z.boolean().default(true),
  autoConvert: z.boolean().default(true),
  mergeBatches: z.boolean().default(true),
  enableDbPersistence: z.boolean().default(true)
})

/**
 * 物料校验配置 Schema
 */
export const validationConfigSchema = z.object({
  dataSource: validationDataSourceSchema.default('database_full'),
  batchSize: z.number().int().min(1).max(10000).default(2000),
  matchMode: matchModeSchema.default('substring'),
  enableCrud: z.boolean().default(false),
  defaultManager: z.string().default('')
})

/**
 * 订单号解析配置 Schema
 */
export const orderResolutionSchema = z.object({
  tableName: z.string(),
  productionIdField: z.string(),
  orderNumberField: z.string()
})

/**
 * ERP 系统配置 Schema（固定基础设施）
 */
export const erpSystemConfigSchema = z.object({
  url: z.string().url('ERP URL must be a valid URL')
})

/**
 * 日志配置 Schema
 */
export const loggingConfigSchema = z.object({
  level: z.enum(['error', 'warn', 'info', 'debug', 'verbose']).default('info'),
  auditRetention: z.number().int().min(1).max(365).default(30),
  appRetention: z.number().int().min(1).max(365).default(14)
})

/**
 * 完整应用配置 Schema
 */
export const fullConfigSchema = z.object({
  erp: erpSystemConfigSchema,
  database: databaseConfigSchema,
  paths: pathsConfigSchema,
  extraction: extractionConfigSchema,
  validation: validationConfigSchema,
  orderResolution: orderResolutionSchema,
  logging: loggingConfigSchema
})

/**
 * 类型导出
 */
export type FullConfig = z.infer<typeof fullConfigSchema>
export type DatabaseConfig = z.infer<typeof databaseConfigSchema>
export type MySqlConfig = z.infer<typeof mysqlConfigSchema>
export type SqlServerConfig = z.infer<typeof sqlServerConfigSchema>
export type ErpSystemConfig = z.infer<typeof erpSystemConfigSchema>
export type LoggingConfig = z.infer<typeof loggingConfigSchema>

/**
 * 验证并解析配置
 */
export function validateConfig(input: unknown): {
  success: boolean
  data?: FullConfig
  error?: string
} {
  const result = fullConfigSchema.safeParse(input)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return {
    success: false,
    error: result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
  }
}
