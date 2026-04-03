/**
 * Configuration Manager (YAML Version)
 *
 * Manages application configuration using YAML format
 * Provides type-safe access with Zod validation
 *
 * Note: ERP configuration is stored in database (dbo_BIPUsers table)
 * and managed per-user, not in this config file.
 *
 * Configuration File Location:
 * - Development: Project root directory (config.yaml)
 * - Production (Installed & Portable): User data directory (AppData)
 *   This ensures config persists across app updates and is not exposed
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { app } from 'electron'
import yaml from 'js-yaml'
import { z } from 'zod'
import { createLogger, applyLoggingConfig } from '../logger'
import { applyAuditConfig } from '../logger/audit-logger'
import {
  fullConfigSchema,
  type FullConfig,
  type DatabaseType,
  type MySqlConfig,
  type SqlServerConfig,
  type LoggingConfig
} from '../../types/config.schema'

const log = createLogger('ConfigManager')
type DeepPartialRecord = Record<string, unknown>

function formatZodIssue(issue: { path: PropertyKey[]; message: string }): string {
  return `${issue.path.map((segment) => String(segment)).join('.')}: ${issue.message}`
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * 默认配置
 */
const DEFAULT_CONFIG: FullConfig = {
  erp: {
    url: 'https://68.11.34.30:8082'
  },
  database: {
    activeType: 'mysql',
    mysql: {
      host: 'localhost',
      port: 3306,
      database: 'erp_db',
      username: 'root',
      password: '',
      charset: 'utf8mb4'
    },
    sqlserver: {
      server: 'localhost',
      port: 1433,
      database: 'erp_db',
      username: 'sa',
      password: '',
      driver: 'ODBC Driver 18 for SQL Server',
      trustServerCertificate: true
    }
  },
  paths: {
    dataDir: './data/',
    defaultOutput: 'output.xlsx',
    validationOutput: 'validation-result.xlsx'
  },
  extraction: {
    batchSize: 100,
    verbose: true,
    autoConvert: true,
    mergeBatches: true,
    enableDbPersistence: true
  },
  validation: {
    dataSource: 'database_full',
    batchSize: 2000,
    matchMode: 'substring',
    enableCrud: false,
    defaultManager: ''
  },
  cleaner: {
    queryBatchSize: 100,
    processConcurrency: 1
  },
  orderResolution: {
    tableName: '',
    productionIdField: '',
    orderNumberField: ''
  },
  logging: {
    level: 'info',
    auditRetention: 30,
    appRetention: 14
  },
  rustfs: {
    enabled: false,
    endpoint: '',
    accessKey: '',
    secretKey: '',
    bucket: 'erpauto',
    region: 'us-east-1'
  },
  update: {
    enabled: false,
    allowDevMode: false,
    endpoint: '',
    accessKey: '',
    secretKey: '',
    bucket: '',
    region: 'us-east-1',
    basePrefix: 'updates/win-portable',
    checkIntervalMinutes: 30,
    maxAdminHistoryPerChannel: 10
  }
}

export class ConfigManager {
  private static instance: ConfigManager | null = null
  private configPath!: string
  private backupPath!: string
  private config: FullConfig | null = null
  private initialized: boolean = false

  private constructor() {
    if (this.initialized) return

    // 检测是否为开发环境
    const isDev = process.env.NODE_ENV === 'development' || !(app?.isPackaged ?? false)

    if (isDev) {
      // 开发环境：配置文件放在项目根目录，方便编辑和调试
      this.configPath = path.resolve(__dirname, '../../config.yaml')
      this.backupPath = path.resolve(__dirname, '../../config.yaml.backup')
      log.info('Running in development mode', { configPath: this.configPath })
    } else {
      // 生产环境（包括安装版和便携版）：配置文件放在用户数据目录
      // Windows: C:\Users\<user>\AppData\Roaming\erpauto\config.yaml
      // 这样配置会在应用升级时保留，且不会暴露在应用目录中
      this.configPath = path.join(app.getPath('userData'), 'config.yaml')
      this.backupPath = path.join(app.getPath('userData'), 'config.yaml.backup')
      log.info('Running in production mode', { configPath: this.configPath })
    }

    this.initialized = true
  }

  public static getInstance(): ConfigManager {
    if (ConfigManager.instance === null) {
      ConfigManager.instance = new ConfigManager()
    }
    return ConfigManager.instance
  }

  /**
   * 初始化配置
   * - 如果 config.yaml 不存在，创建默认配置
   * - 加载并验证配置
   */
  public async initialize(): Promise<void> {
    if (!fs.existsSync(this.configPath)) {
      log.info('Config file not found, creating default config.yaml')
      await this.saveConfig(DEFAULT_CONFIG)
      this.config = DEFAULT_CONFIG
      // Apply logging configuration from default config
      applyLoggingConfig(DEFAULT_CONFIG.logging)
      applyAuditConfig(DEFAULT_CONFIG.logging.auditRetention)
      return
    }

    await this.loadConfig()
  }

  /**
   * 加载并验证 YAML 配置
   */
  private async loadConfig(): Promise<void> {
    try {
      const content = fs.readFileSync(this.configPath, 'utf-8')
      const parsed = yaml.load(content) as Record<string, unknown>

      // Zod 验证
      const validated = fullConfigSchema.parse(parsed)
      this.config = validated

      // Apply logging configuration
      applyLoggingConfig(validated.logging)
      applyAuditConfig(validated.logging.auditRetention)

      log.info('Configuration loaded and validated successfully')
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.issues.map(formatZodIssue)
        log.error('Configuration validation failed', { errors: messages })
        throw new Error(`配置文件验证失败:\n${messages.join('\n')}`)
      }
      log.error('Failed to load configuration', { error })
      throw error
    }
  }

  /**
   * 保存配置到 YAML 文件
   */
  private async saveConfig(config: FullConfig): Promise<boolean> {
    try {
      // 备份现有配置
      if (fs.existsSync(this.configPath)) {
        fs.copyFileSync(this.configPath, this.backupPath)
      }

      // 转换为 YAML
      const content = yaml.dump(config, {
        indent: 2,
        lineWidth: -1, // 不自动换行
        noRefs: true, // 不使用引用
        quotingType: '"',
        forceQuotes: false
      })

      fs.writeFileSync(this.configPath, content, 'utf-8')

      this.config = config
      log.info('Configuration saved successfully')
      return true
    } catch (error) {
      log.error('Failed to save configuration', { error })
      // 恢复备份
      if (fs.existsSync(this.backupPath)) {
        fs.copyFileSync(this.backupPath, this.configPath)
      }
      return false
    }
  }

  /**
   * 获取完整配置
   */
  public getConfig(): FullConfig {
    if (!this.config) {
      throw new Error('Configuration not initialized. Call initialize() first.')
    }
    return this.config
  }

  /**
   * 获取当前激活的数据库配置
   */
  public getActiveDatabaseConfig(): MySqlConfig | SqlServerConfig {
    if (!this.config) {
      throw new Error('Configuration not initialized')
    }

    const { activeType, mysql, sqlserver } = this.config.database
    return activeType === 'mysql' ? mysql : sqlserver
  }

  /**
   * 获取数据库类型
   */
  public getDatabaseType(): DatabaseType {
    if (!this.config) {
      throw new Error('Configuration not initialized')
    }
    return this.config.database.activeType
  }

  /**
   * 获取日志配置
   */
  public getLoggingConfig(): LoggingConfig {
    if (!this.config) {
      throw new Error('Configuration not initialized')
    }
    return this.config.logging
  }

  /**
   * 更新部分配置（深合并）
   */
  public async updateConfig(
    updates: Partial<FullConfig>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.config) {
        await this.loadConfig()
      }

      // 深合并
      const merged = this.deepMerge(this.config!, updates)

      // 验证合并后的配置
      const validated = fullConfigSchema.parse(merged)

      const success = await this.saveConfig(validated)
      if (!success) {
        return { success: false, error: '保存配置失败' }
      }

      return { success: true }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.issues.map(formatZodIssue)
        return { success: false, error: `配置验证失败:\n${messages.join('\n')}` }
      }
      return { success: false, error: error instanceof Error ? error.message : '未知错误' }
    }
  }

  /**
   * 深合并工具函数
   */
  private deepMerge<T extends DeepPartialRecord>(source: T, target: Partial<T>): T {
    const result: T = { ...source }
    for (const key in target) {
      const sourceValue = result[key]
      const targetValue = target[key]

      if (targetValue !== undefined) {
        if (
          typeof sourceValue === 'object' &&
          sourceValue !== null &&
          !Array.isArray(sourceValue) &&
          typeof targetValue === 'object' &&
          targetValue !== null &&
          !Array.isArray(targetValue)
        ) {
          result[key] = this.deepMerge(
            sourceValue as DeepPartialRecord,
            targetValue as Partial<DeepPartialRecord>
          ) as T[Extract<keyof T, string>]
        } else {
          result[key] = targetValue as T[Extract<keyof T, string>]
        }
      }
    }
    return result
  }

  /**
   * 重置为默认配置
   */
  public async resetToDefaults(): Promise<boolean> {
    return this.saveConfig(DEFAULT_CONFIG)
  }

  /**
   * 获取默认配置
   */
  public getDefaultConfig(): FullConfig {
    return DEFAULT_CONFIG
  }

  /**
   * 导出配置为 YAML 字符串（用于 UI 显示或导出）
   */
  public exportToYaml(): string {
    if (!this.config) {
      throw new Error('Configuration not initialized')
    }
    return yaml.dump(this.config, {
      indent: 2,
      lineWidth: -1,
      noRefs: true
    })
  }
}
