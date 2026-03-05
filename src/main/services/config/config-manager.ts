/**
 * Configuration Manager
 *
 * Manages application configuration stored in .env file
 * Provides methods for reading, writing, and saving configuration values
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { createLogger } from '../logger'
import type {
  SettingsData,
  DatabaseType,
  MatchMode,
  ValidationDataSource
} from '../../types/settings.types'

const log = createLogger('ConfigManager')

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Default settings values
 */
const DEFAULT_SETTINGS: SettingsData = {
  erp: {
    url: 'https://68.11.34.30:8082/',
    username: '',
    password: '',
    headless: true,
    ignoreHttpsErrors: true,
    autoCloseBrowser: true
  },
  database: {
    dbType: 'mysql',
    server: '',
    mysqlHost: '192.168.31.83',
    mysqlPort: 3306,
    database: 'BLD_DB',
    username: 'remote_user',
    password: ''
  },
  paths: {
    dataDir: 'D:/python/playwrite/data/',
    defaultOutput: '离散备料计划维护_合并.xlsx',
    validationOutput: '物料状态校验结果.xlsx'
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
  }
}

/**
 * Check if value is a plain object
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Deep merge two objects, only updating fields present in target
 * Preserves all fields from source that are not in target
 */
function deepMerge<T>(source: T, target: Partial<T>): T {
  const result = { ...source }

  for (const key in target) {
    if (key in target) {
      const targetValue = target[key]
      const sourceValue = result[key]

      if (isObject(targetValue) && isObject(sourceValue)) {
        result[key] = deepMerge(
          sourceValue as T[Extract<keyof T, string>],
          targetValue as Partial<T[Extract<keyof T, string>]>
        )
      } else if (targetValue !== undefined) {
        result[key] = targetValue as T[Extract<keyof T, string>]
      }
    }
  }

  return result
}

/**
 * UI editable field whitelist
 * Fields that can be modified through the settings UI
 * Note: ERP fields are no longer editable here - they are managed per-user in the database
 */
const UI_EDITABLE_FIELDS: string[] = [
  // ERP fields removed - ERP config is now stored in dbo_BIPUsers table per user
  // 'erp.url',
  // 'erp.username',
  // 'erp.password'
  // Add more fields as UI expands
]

/**
 * Validate that settings only contain editable fields
 */
function validateEditableFields(settings: Partial<SettingsData>): {
  valid: boolean
  invalidFields: string[]
} {
  const invalidFields: string[] = []

  for (const [section, values] of Object.entries(settings)) {
    if (values && typeof values === 'object') {
      for (const field of Object.keys(values)) {
        const fieldPath = `${section}.${field}`
        if (!UI_EDITABLE_FIELDS.includes(fieldPath)) {
          invalidFields.push(fieldPath)
        }
      }
    }
  }

  return {
    valid: invalidFields.length === 0,
    invalidFields
  }
}

/**
 * Configuration Manager Class
 */
export class ConfigManager {
  private static instance: ConfigManager | null = null
  private envPath!: string
  private backupPath!: string
  private configCache: Map<string, string> = new Map()
  private initialized: boolean = false

  private constructor() {
    if (this.initialized) {
      return
    }
    this.envPath = path.resolve(__dirname, '../../.env')
    this.backupPath = path.resolve(__dirname, '../../.env.backup')
    this.initialized = true
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): ConfigManager {
    if (ConfigManager.instance === null) {
      ConfigManager.instance = new ConfigManager()
    }
    return ConfigManager.instance
  }

  /**
   * Initialize configuration from .env file
   */
  public async initialize(): Promise<void> {
    await this.loadEnvFile()
  }

  /**
   * Load .env file into cache
   */
  private async loadEnvFile(): Promise<void> {
    try {
      // Clear cache before loading
      this.configCache.clear()

      if (fs.existsSync(this.envPath)) {
        const content = fs.readFileSync(this.envPath, 'utf-8')
        const lines = content.split('\n')

        for (const line of lines) {
          const trimmedLine = line.trim()
          // Skip empty lines and comments
          if (!trimmedLine || trimmedLine.startsWith('#')) {
            continue
          }

          const [key, ...valueParts] = trimmedLine.split('=')
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').trim()
            this.configCache.set(key.trim(), value)
          }
        }
      }
    } catch (error) {
      console.error('[ConfigManager] Failed to load .env file:', error)
    }
  }

  /**
   * Get a configuration value
   * @param key - Configuration key
   * @param defaultValue - Default value if key doesn't exist
   */
  public get(key: string): string | undefined
  public get(key: string, defaultValue: string): string
  public get(key: string, defaultValue?: string): string | undefined {
    return this.configCache.get(key) ?? defaultValue
  }

  /**
   * Get a boolean configuration value
   */
  public getBoolean(key: string, defaultValue: boolean = false): boolean {
    const value = this.get(key)
    if (value === undefined) return defaultValue
    return value.toLowerCase() === 'true'
  }

  /**
   * Get a number configuration value
   */
  public getNumber(key: string, defaultValue: number = 0): number {
    const value = this.get(key)
    if (value === undefined) return defaultValue
    const parsed = parseInt(value, 10)
    return isNaN(parsed) ? defaultValue : parsed
  }

  /**
   * Set a configuration value in cache
   */
  public set(key: string, value: string | number | boolean): void {
    this.configCache.set(key, String(value))
  }

  /**
   * Save configuration to .env file
   */
  public async save(): Promise<boolean> {
    try {
      // Build .env content from cache
      const lines: string[] = []

      // ERP Configuration - REMOVED
      // ERP parameters are now stored in the database (dbo_BIPUsers table)
      // This section is kept for backward compatibility but values are not used
      lines.push('# ===========================')
      lines.push('# ERP 系统配置（已迁移到数据库）')
      lines.push('# ===========================')
      lines.push('# ERP_URL, ERP_USERNAME, ERP_PASSWORD 已从 .env 移除')
      lines.push('# 这些参数现在存储在 dbo_BIPUsers 表中，每个用户可以有自己的 ERP 配置')
      lines.push('')

      // Database Configuration - SQL Server
      lines.push('# ===========================')
      lines.push('# 数据库配置 - SQL Server')
      lines.push('# ===========================')
      lines.push(`# DB_TYPE=sqlserver`)
      lines.push(`# DB_SERVER=${this.configCache.get('DB_SERVER') || ''}`)
      lines.push(`# DB_NAME=${this.configCache.get('DB_NAME') || ''}`)
      lines.push(`# DB_USERNAME=${this.configCache.get('DB_USERNAME') || ''}`)
      lines.push(`# DB_PASSWORD=${this.configCache.get('DB_PASSWORD') || ''}`)
      lines.push(`DB_SQLSERVER_DRIVER=ODBC Driver 18 for SQL Server`)
      lines.push(`DB_TRUST_SERVER_CERTIFICATE=yes`)
      lines.push('')

      // Database Configuration - MySQL
      lines.push('# ===========================')
      lines.push('# 数据库配置 - MySQL (切换时使用)')
      lines.push('# ===========================')
      lines.push(`DB_TYPE=${this.configCache.get('DB_TYPE') || DEFAULT_SETTINGS.database.dbType}`)
      lines.push(`DB_NAME=${this.configCache.get('DB_NAME') || DEFAULT_SETTINGS.database.database}`)
      lines.push(
        `DB_USERNAME=${this.configCache.get('DB_USERNAME') || DEFAULT_SETTINGS.database.username}`
      )
      lines.push(
        `DB_PASSWORD=${this.configCache.get('DB_PASSWORD') || DEFAULT_SETTINGS.database.password}`
      )
      lines.push(
        `DB_MYSQL_HOST=${this.configCache.get('DB_MYSQL_HOST') || DEFAULT_SETTINGS.database.mysqlHost}`
      )
      lines.push(
        `DB_MYSQL_PORT=${this.configCache.get('DB_MYSQL_PORT') || DEFAULT_SETTINGS.database.mysqlPort}`
      )
      lines.push(`DB_MYSQL_CHARSET=utf8mb4`)
      lines.push('')

      // Order number parsing table configuration
      lines.push('# 订单号解析表配置')
      lines.push('# 表名：包含 productionID 和 生产订单号 映射关系的表')
      lines.push(`DB_TABLE_NAME=productionContractData_26年压力表合同数据`)
      lines.push('# 字段名：总排号 (对应 productionID)')
      lines.push(`DB_FIELD_PRODUCTION_ID=总排号`)
      lines.push('# 字段名：生产订单号 (对应生产订单号)')
      lines.push(`DB_FIELD_ORDER_NUMBER=生产订单号`)
      lines.push('')

      // Path Configuration
      lines.push('# ===========================')
      lines.push('# 路径配置')
      lines.push('# ===========================')
      lines.push(
        `PATH_DATA_DIR=${this.configCache.get('PATH_DATA_DIR') || DEFAULT_SETTINGS.paths.dataDir}`
      )
      lines.push(`PATH_PRODUCTION_ID_FILE=ProductionID.txt`)
      lines.push(
        `PATH_DEFAULT_OUTPUT=${this.configCache.get('PATH_DEFAULT_OUTPUT') || DEFAULT_SETTINGS.paths.defaultOutput}`
      )
      lines.push(
        `PATH_VALIDATION_OUTPUT=${this.configCache.get('PATH_VALIDATION_OUTPUT') || DEFAULT_SETTINGS.paths.validationOutput}`
      )
      lines.push('')

      // Data Extraction Configuration
      lines.push('# ===========================')
      lines.push('# 数据提取配置')
      lines.push('# ===========================')
      lines.push(
        `EXTRACTION_BATCH_SIZE=${this.configCache.get('EXTRACTION_BATCH_SIZE') || DEFAULT_SETTINGS.extraction.batchSize}`
      )
      lines.push(
        `EXTRACTION_VERBOSE=${this.configCache.get('EXTRACTION_VERBOSE') || DEFAULT_SETTINGS.extraction.verbose}`
      )
      lines.push(
        `EXTRACTION_AUTO_CONVERT=${this.configCache.get('EXTRACTION_AUTO_CONVERT') || DEFAULT_SETTINGS.extraction.autoConvert}`
      )
      lines.push(
        `EXTRACTION_MERGE_BATCHES=${this.configCache.get('EXTRACTION_MERGE_BATCHES') || DEFAULT_SETTINGS.extraction.mergeBatches}`
      )
      lines.push(
        `EXTRACTION_ENABLE_DB_PERSISTENCE=${this.configCache.get('EXTRACTION_ENABLE_DB_PERSISTENCE') || DEFAULT_SETTINGS.extraction.enableDbPersistence}`
      )
      lines.push('')

      // Validation Configuration
      lines.push('# ===========================')
      lines.push('# 校验配置')
      lines.push('# ===========================')
      lines.push(
        `VALIDATION_DATA_SOURCE=${this.configCache.get('VALIDATION_DATA_SOURCE') || DEFAULT_SETTINGS.validation.dataSource}`
      )
      lines.push(
        `VALIDATION_USE_DATABASE=${this.configCache.get('VALIDATION_USE_DATABASE') || true}`
      )
      lines.push(
        `VALIDATION_BATCH_SIZE=${this.configCache.get('VALIDATION_BATCH_SIZE') || DEFAULT_SETTINGS.validation.batchSize}`
      )
      lines.push(
        `VALIDATION_ENABLE_CRUD=${this.configCache.get('VALIDATION_ENABLE_CRUD') || DEFAULT_SETTINGS.validation.enableCrud}`
      )
      lines.push(
        `VALIDATION_DEFAULT_MANAGER=${this.configCache.get('VALIDATION_DEFAULT_MANAGER') || DEFAULT_SETTINGS.validation.defaultManager}`
      )
      lines.push(
        `VALIDATION_MATCH_MODE=${this.configCache.get('VALIDATION_MATCH_MODE') || DEFAULT_SETTINGS.validation.matchMode}`
      )
      lines.push('')

      const content = lines.join('\n')
      fs.writeFileSync(this.envPath, content, 'utf-8')
      return true
    } catch (error) {
      console.error('[ConfigManager] Failed to save .env file:', error)
      return false
    }
  }

  /**
   * Get all settings as SettingsData object
   * Note: ERP configuration is now stored in database, not .env
   * The ERP values here are for UI display only and will not be used for actual ERP operations
   */
  public getAllSettings(): SettingsData {
    return {
      erp: {
        // ERP config is now from database, these are placeholder defaults for UI
        url: DEFAULT_SETTINGS.erp.url,
        username: DEFAULT_SETTINGS.erp.username,
        password: DEFAULT_SETTINGS.erp.password,
        headless: true,
        ignoreHttpsErrors: true,
        autoCloseBrowser: true
      },
      database: {
        dbType:
          (this.get('DB_TYPE', DEFAULT_SETTINGS.database.dbType) as DatabaseType) ||
          DEFAULT_SETTINGS.database.dbType,
        server: this.get('DB_SERVER', DEFAULT_SETTINGS.database.server),
        mysqlHost: this.get('DB_MYSQL_HOST', DEFAULT_SETTINGS.database.mysqlHost),
        mysqlPort: this.getNumber('DB_MYSQL_PORT', DEFAULT_SETTINGS.database.mysqlPort),
        database: this.get('DB_NAME', DEFAULT_SETTINGS.database.database),
        username: this.get('DB_USERNAME', DEFAULT_SETTINGS.database.username),
        password: this.get('DB_PASSWORD', DEFAULT_SETTINGS.database.password)
      },
      paths: {
        dataDir: this.get('PATH_DATA_DIR', DEFAULT_SETTINGS.paths.dataDir),
        defaultOutput: this.get('PATH_DEFAULT_OUTPUT', DEFAULT_SETTINGS.paths.defaultOutput),
        validationOutput: this.get(
          'PATH_VALIDATION_OUTPUT',
          DEFAULT_SETTINGS.paths.validationOutput
        )
      },
      extraction: {
        batchSize: this.getNumber('EXTRACTION_BATCH_SIZE', DEFAULT_SETTINGS.extraction.batchSize),
        verbose: this.getBoolean('EXTRACTION_VERBOSE', DEFAULT_SETTINGS.extraction.verbose),
        autoConvert: this.getBoolean(
          'EXTRACTION_AUTO_CONVERT',
          DEFAULT_SETTINGS.extraction.autoConvert
        ),
        mergeBatches: this.getBoolean(
          'EXTRACTION_MERGE_BATCHES',
          DEFAULT_SETTINGS.extraction.mergeBatches
        ),
        enableDbPersistence: this.getBoolean(
          'EXTRACTION_ENABLE_DB_PERSISTENCE',
          DEFAULT_SETTINGS.extraction.enableDbPersistence
        )
      },
      validation: {
        dataSource:
          (this.get(
            'VALIDATION_DATA_SOURCE',
            DEFAULT_SETTINGS.validation.dataSource
          ) as ValidationDataSource) || DEFAULT_SETTINGS.validation.dataSource,
        batchSize: this.getNumber('VALIDATION_BATCH_SIZE', DEFAULT_SETTINGS.validation.batchSize),
        matchMode:
          (this.get('VALIDATION_MATCH_MODE', DEFAULT_SETTINGS.validation.matchMode) as MatchMode) ||
          DEFAULT_SETTINGS.validation.matchMode,
        enableCrud: this.getBoolean(
          'VALIDATION_ENABLE_CRUD',
          DEFAULT_SETTINGS.validation.enableCrud
        ),
        defaultManager: this.get(
          'VALIDATION_DEFAULT_MANAGER',
          DEFAULT_SETTINGS.validation.defaultManager
        )
      }
    }
  }

  /**
   * Save settings from SettingsData object
   * Note: ERP settings are NOT saved to .env anymore - they are stored in the database
   */
  public async saveAllSettings(settings: SettingsData): Promise<boolean> {
    // ERP settings are now stored in the database (dbo_BIPUsers table)
    // They are NOT saved to .env file anymore

    // Database settings
    this.set('DB_TYPE', settings.database.dbType)
    this.set('DB_SERVER', settings.database.server)
    this.set('DB_MYSQL_HOST', settings.database.mysqlHost)
    this.set('DB_MYSQL_PORT', settings.database.mysqlPort)
    this.set('DB_NAME', settings.database.database)
    this.set('DB_USERNAME', settings.database.username)
    this.set('DB_PASSWORD', settings.database.password)

    // Path settings
    this.set('PATH_DATA_DIR', settings.paths.dataDir)
    this.set('PATH_DEFAULT_OUTPUT', settings.paths.defaultOutput)
    this.set('PATH_VALIDATION_OUTPUT', settings.paths.validationOutput)

    // Extraction settings
    this.set('EXTRACTION_BATCH_SIZE', settings.extraction.batchSize)
    this.set('EXTRACTION_VERBOSE', settings.extraction.verbose)
    this.set('EXTRACTION_AUTO_CONVERT', settings.extraction.autoConvert)
    this.set('EXTRACTION_MERGE_BATCHES', settings.extraction.mergeBatches)
    this.set('EXTRACTION_ENABLE_DB_PERSISTENCE', settings.extraction.enableDbPersistence)

    // Validation settings
    this.set('VALIDATION_DATA_SOURCE', settings.validation.dataSource)
    this.set('VALIDATION_BATCH_SIZE', settings.validation.batchSize)
    this.set('VALIDATION_MATCH_MODE', settings.validation.matchMode)
    this.set('VALIDATION_ENABLE_CRUD', settings.validation.enableCrud)
    this.set('VALIDATION_DEFAULT_MANAGER', settings.validation.defaultManager)

    return this.save()
  }

  /**
   * Save partial settings (only update provided fields)
   * Preserves all existing fields not included in the update
   */
  public async savePartialSettings(
    settings: Partial<SettingsData>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Step 1: Validate field whitelist
      const validation = validateEditableFields(settings)
      if (!validation.valid) {
        log.warn('Attempted to save non-editable fields', {
          invalidFields: validation.invalidFields
        })
        return {
          success: false,
          error: `包含不允许修改的字段：${validation.invalidFields.join(', ')}`
        }
      }

      // Step 2: Read current settings from .env file directly
      // This avoids the cache key mismatch issue (ERP_URL vs erp.url)
      await this.loadEnvFile()
      const currentSettings = this.getAllSettings()

      log.info('Current settings before merge', {
        erpUrl: currentSettings.erp.url,
        dbType: currentSettings.database.dbType,
        dbName: currentSettings.database.database
      })

      // Step 3: Deep merge - only update provided fields
      const mergedSettings = deepMerge(currentSettings, settings)

      log.info('Settings after merge', {
        erpUrl: mergedSettings.erp.url,
        dbType: mergedSettings.database.dbType,
        dbName: mergedSettings.database.database
      })

      // Step 4: Backup and save
      const backupSuccess = await this.backupEnvFile()
      if (!backupSuccess) {
        log.warn('Failed to backup .env file, proceeding with caution')
      }

      const saveSuccess = await this.saveAllSettings(mergedSettings)

      if (!saveSuccess) {
        // Save failed, attempt restore
        await this.restoreBackup()
        return {
          success: false,
          error: '保存配置失败，已恢复原配置'
        }
      }

      // Step 5: Reload from disk to populate cache with correct keys (ERP_URL instead of erp.url)
      await this.loadEnvFile()

      log.info('Settings saved successfully', {
        updatedFields: Object.keys(settings)
      })

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      log.error('Error in savePartialSettings', { error: message })
      await this.restoreBackup()
      return {
        success: false,
        error: `保存配置时发生错误：${message}`
      }
    }
  }

  /**
   * Reset to default settings
   */
  public resetToDefaults(): SettingsData {
    // Clear cache and reload from defaults
    this.configCache.clear()

    // Set all defaults using underscore uppercase keys
    this.set('ERP_URL', DEFAULT_SETTINGS.erp.url)
    this.set('ERP_USERNAME', DEFAULT_SETTINGS.erp.username)
    this.set('ERP_PASSWORD', DEFAULT_SETTINGS.erp.password)

    this.set('DB_TYPE', DEFAULT_SETTINGS.database.dbType)
    this.set('DB_SERVER', DEFAULT_SETTINGS.database.server)
    this.set('DB_MYSQL_HOST', DEFAULT_SETTINGS.database.mysqlHost)
    this.set('DB_MYSQL_PORT', DEFAULT_SETTINGS.database.mysqlPort)
    this.set('DB_NAME', DEFAULT_SETTINGS.database.database)
    this.set('DB_USERNAME', DEFAULT_SETTINGS.database.username)
    this.set('DB_PASSWORD', DEFAULT_SETTINGS.database.password)

    this.set('PATH_DATA_DIR', DEFAULT_SETTINGS.paths.dataDir)
    this.set('PATH_DEFAULT_OUTPUT', DEFAULT_SETTINGS.paths.defaultOutput)
    this.set('PATH_VALIDATION_OUTPUT', DEFAULT_SETTINGS.paths.validationOutput)

    this.set('EXTRACTION_BATCH_SIZE', DEFAULT_SETTINGS.extraction.batchSize)
    this.set('EXTRACTION_VERBOSE', DEFAULT_SETTINGS.extraction.verbose)
    this.set('EXTRACTION_AUTO_CONVERT', DEFAULT_SETTINGS.extraction.autoConvert)
    this.set('EXTRACTION_MERGE_BATCHES', DEFAULT_SETTINGS.extraction.mergeBatches)
    this.set('EXTRACTION_ENABLE_DB_PERSISTENCE', DEFAULT_SETTINGS.extraction.enableDbPersistence)

    this.set('VALIDATION_DATA_SOURCE', DEFAULT_SETTINGS.validation.dataSource)
    this.set('VALIDATION_BATCH_SIZE', DEFAULT_SETTINGS.validation.batchSize)
    this.set('VALIDATION_MATCH_MODE', DEFAULT_SETTINGS.validation.matchMode)
    this.set('VALIDATION_ENABLE_CRUD', DEFAULT_SETTINGS.validation.enableCrud)
    this.set('VALIDATION_DEFAULT_MANAGER', DEFAULT_SETTINGS.validation.defaultManager)

    return DEFAULT_SETTINGS
  }

  /**
   * Get default settings
   */
  public getDefaultSettings(): SettingsData {
    return DEFAULT_SETTINGS
  }

  /**
   * Backup current .env file
   */
  private async backupEnvFile(): Promise<boolean> {
    try {
      if (fs.existsSync(this.envPath)) {
        fs.copyFileSync(this.envPath, this.backupPath)
        log.debug('Backup created', { path: this.backupPath })
        return true
      }
      return false
    } catch (error) {
      log.error('Failed to backup .env file', { error })
      return false
    }
  }

  /**
   * Restore .env file from backup
   */
  private async restoreBackup(): Promise<boolean> {
    try {
      if (fs.existsSync(this.backupPath)) {
        fs.copyFileSync(this.backupPath, this.envPath)
        await this.loadEnvFile()
        log.debug('Restored from backup')
        return true
      }
      return false
    } catch (error) {
      log.error('Failed to restore backup', { error })
      return false
    }
  }
}
