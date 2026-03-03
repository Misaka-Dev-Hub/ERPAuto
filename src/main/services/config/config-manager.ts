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
import type {
  SettingsData,
  DatabaseType,
  MatchMode,
  ValidationDataSource
} from '../../types/settings.types'

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
  },
  ui: {
    fontFamily: 'Microsoft YaHei UI',
    fontSize: 10,
    productionIdInputWidth: 20
  },
  execution: {
    dryRun: false
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
 */
const UI_EDITABLE_FIELDS: string[] = [
  'erp.url',
  'erp.username',
  'erp.password'
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
  private envPath: string
  private configCache: Map<string, string> = new Map()
  private initialized: boolean = false

  private constructor() {
    if (this.initialized) {
      return
    }
    this.envPath = path.resolve(__dirname, '../../.env')
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

      // ERP Configuration
      lines.push('# ===========================')
      lines.push('# ERP 系统配置')
      lines.push('# ===========================')
      lines.push(`ERP_URL=${this.configCache.get('erp.url') || DEFAULT_SETTINGS.erp.url}`)
      lines.push(
        `ERP_USERNAME=${this.configCache.get('erp.username') || DEFAULT_SETTINGS.erp.username}`
      )
      lines.push(
        `ERP_PASSWORD=${this.configCache.get('erp.password') || DEFAULT_SETTINGS.erp.password}`
      )
      lines.push(
        `ERP_HEADLESS=${this.configCache.get('erp.headless') || DEFAULT_SETTINGS.erp.headless}`
      )
      lines.push(
        `ERP_IGNORE_HTTPS_ERRORS=${this.configCache.get('erp.ignoreHttpsErrors') || DEFAULT_SETTINGS.erp.ignoreHttpsErrors}`
      )
      lines.push(
        `ERP_AUTO_CLOSE_BROWSER=${this.configCache.get('erp.autoCloseBrowser') || DEFAULT_SETTINGS.erp.autoCloseBrowser}`
      )
      lines.push('')

      // Database Configuration - SQL Server
      lines.push('# ===========================')
      lines.push('# 数据库配置 - SQL Server')
      lines.push('# ===========================')
      lines.push(`# DB_TYPE=sqlserver`)
      lines.push(`# DB_SERVER=${this.configCache.get('database.server') || ''}`)
      lines.push(`# DB_NAME=${this.configCache.get('database.database') || ''}`)
      lines.push(`# DB_USERNAME=${this.configCache.get('database.username') || ''}`)
      lines.push(`# DB_PASSWORD=${this.configCache.get('database.password') || ''}`)
      lines.push(`DB_SQLSERVER_DRIVER=ODBC Driver 18 for SQL Server`)
      lines.push(`DB_TRUST_SERVER_CERTIFICATE=yes`)
      lines.push('')

      // Database Configuration - MySQL
      lines.push('# ===========================')
      lines.push('# 数据库配置 - MySQL (切换时使用)')
      lines.push('# ===========================')
      lines.push(
        `DB_TYPE=${this.configCache.get('database.dbType') || DEFAULT_SETTINGS.database.dbType}`
      )
      lines.push(
        `DB_NAME=${this.configCache.get('database.database') || DEFAULT_SETTINGS.database.database}`
      )
      lines.push(
        `DB_USERNAME=${this.configCache.get('database.username') || DEFAULT_SETTINGS.database.username}`
      )
      lines.push(
        `DB_PASSWORD=${this.configCache.get('database.password') || DEFAULT_SETTINGS.database.password}`
      )
      lines.push(
        `DB_MYSQL_HOST=${this.configCache.get('database.mysqlHost') || DEFAULT_SETTINGS.database.mysqlHost}`
      )
      lines.push(
        `DB_MYSQL_PORT=${this.configCache.get('database.mysqlPort') || DEFAULT_SETTINGS.database.mysqlPort}`
      )
      lines.push(`DB_MYSQL_CHARSET=utf8mb4`)
      lines.push('')

      // Order number parsing table configuration
      lines.push('# 订单号解析表配置')
      lines.push('# 表名：包含 productionID 和 生产订单号 映射关系的表')
      lines.push(`DB_TABLE_NAME=productionContractData_26 年压力表合同数据`)
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
        `PATH_DATA_DIR=${this.configCache.get('paths.dataDir') || DEFAULT_SETTINGS.paths.dataDir}`
      )
      lines.push(`PATH_PRODUCTION_ID_FILE=ProductionID.txt`)
      lines.push(
        `PATH_DEFAULT_OUTPUT=${this.configCache.get('paths.defaultOutput') || DEFAULT_SETTINGS.paths.defaultOutput}`
      )
      lines.push(
        `PATH_VALIDATION_OUTPUT=${this.configCache.get('paths.validationOutput') || DEFAULT_SETTINGS.paths.validationOutput}`
      )
      lines.push('')

      // Data Extraction Configuration
      lines.push('# ===========================')
      lines.push('# 数据提取配置')
      lines.push('# ===========================')
      lines.push(
        `EXTRACTION_BATCH_SIZE=${this.configCache.get('extraction.batchSize') || DEFAULT_SETTINGS.extraction.batchSize}`
      )
      lines.push(
        `EXTRACTION_VERBOSE=${this.configCache.get('extraction.verbose') || DEFAULT_SETTINGS.extraction.verbose}`
      )
      lines.push(
        `EXTRACTION_AUTO_CONVERT=${this.configCache.get('extraction.autoConvert') || DEFAULT_SETTINGS.extraction.autoConvert}`
      )
      lines.push(
        `EXTRACTION_MERGE_BATCHES=${this.configCache.get('extraction.mergeBatches') || DEFAULT_SETTINGS.extraction.mergeBatches}`
      )
      lines.push(
        `EXTRACTION_ENABLE_DB_PERSISTENCE=${this.configCache.get('extraction.enableDbPersistence') || DEFAULT_SETTINGS.extraction.enableDbPersistence}`
      )
      lines.push('')

      // Validation Configuration
      lines.push('# ===========================')
      lines.push('# 校验配置')
      lines.push('# ===========================')
      lines.push(
        `VALIDATION_DATA_SOURCE=${this.configCache.get('validation.dataSource') || DEFAULT_SETTINGS.validation.dataSource}`
      )
      lines.push(
        `VALIDATION_USE_DATABASE=${this.configCache.get('validation.useDatabase') || true}`
      )
      lines.push(
        `VALIDATION_BATCH_SIZE=${this.configCache.get('validation.batchSize') || DEFAULT_SETTINGS.validation.batchSize}`
      )
      lines.push(
        `VALIDATION_ENABLE_CRUD=${this.configCache.get('validation.enableCrud') || DEFAULT_SETTINGS.validation.enableCrud}`
      )
      lines.push(
        `VALIDATION_DEFAULT_MANAGER=${this.configCache.get('validation.defaultManager') || DEFAULT_SETTINGS.validation.defaultManager}`
      )
      lines.push(
        `VALIDATION_MATCH_MODE=${this.configCache.get('validation.matchMode') || DEFAULT_SETTINGS.validation.matchMode}`
      )
      lines.push('')

      // UI Configuration
      lines.push('# ===========================')
      lines.push('# UI 配置')
      lines.push('# ===========================')
      lines.push(
        `UI_FONT_FAMILY=${this.configCache.get('ui.fontFamily') || DEFAULT_SETTINGS.ui.fontFamily}`
      )
      lines.push(
        `UI_FONT_SIZE=${this.configCache.get('ui.fontSize') || DEFAULT_SETTINGS.ui.fontSize}`
      )
      lines.push(
        `UI_PRODUCTION_ID_INPUT_WIDTH=${this.configCache.get('ui.productionIdInputWidth') || DEFAULT_SETTINGS.ui.productionIdInputWidth}`
      )
      lines.push('')

      // Execution Configuration
      lines.push('# ===========================')
      lines.push('# 执行配置')
      lines.push('# ===========================')
      lines.push(
        `EXECUTION_DRYRUN=${this.configCache.get('execution.dryRun') || DEFAULT_SETTINGS.execution.dryRun}`
      )

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
   */
  public getAllSettings(): SettingsData {
    return {
      erp: {
        url: this.get('ERP_URL', DEFAULT_SETTINGS.erp.url),
        username: this.get('ERP_USERNAME', DEFAULT_SETTINGS.erp.username),
        password: this.get('ERP_PASSWORD', DEFAULT_SETTINGS.erp.password),
        headless: this.getBoolean('ERP_HEADLESS', DEFAULT_SETTINGS.erp.headless),
        ignoreHttpsErrors: this.getBoolean(
          'ERP_IGNORE_HTTPS_ERRORS',
          DEFAULT_SETTINGS.erp.ignoreHttpsErrors
        ),
        autoCloseBrowser: this.getBoolean(
          'ERP_AUTO_CLOSE_BROWSER',
          DEFAULT_SETTINGS.erp.autoCloseBrowser
        )
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
      },
      ui: {
        fontFamily: this.get('UI_FONT_FAMILY', DEFAULT_SETTINGS.ui.fontFamily),
        fontSize: this.getNumber('UI_FONT_SIZE', DEFAULT_SETTINGS.ui.fontSize),
        productionIdInputWidth: this.getNumber(
          'UI_PRODUCTION_ID_INPUT_WIDTH',
          DEFAULT_SETTINGS.ui.productionIdInputWidth
        )
      },
      execution: {
        dryRun: this.getBoolean('EXECUTION_DRYRUN', DEFAULT_SETTINGS.execution.dryRun)
      }
    }
  }

  /**
   * Save settings from SettingsData object
   */
  public async saveAllSettings(settings: SettingsData): Promise<boolean> {
    // ERP settings
    this.set('erp.url', settings.erp.url)
    this.set('erp.username', settings.erp.username)
    this.set('erp.password', settings.erp.password)
    this.set('erp.headless', settings.erp.headless)
    this.set('erp.ignoreHttpsErrors', settings.erp.ignoreHttpsErrors)
    this.set('erp.autoCloseBrowser', settings.erp.autoCloseBrowser)

    // Database settings
    this.set('database.dbType', settings.database.dbType)
    this.set('database.server', settings.database.server)
    this.set('database.mysqlHost', settings.database.mysqlHost)
    this.set('database.mysqlPort', settings.database.mysqlPort)
    this.set('database.database', settings.database.database)
    this.set('database.username', settings.database.username)
    this.set('database.password', settings.database.password)

    // Path settings
    this.set('paths.dataDir', settings.paths.dataDir)
    this.set('paths.defaultOutput', settings.paths.defaultOutput)
    this.set('paths.validationOutput', settings.paths.validationOutput)

    // Extraction settings
    this.set('extraction.batchSize', settings.extraction.batchSize)
    this.set('extraction.verbose', settings.extraction.verbose)
    this.set('extraction.autoConvert', settings.extraction.autoConvert)
    this.set('extraction.mergeBatches', settings.extraction.mergeBatches)
    this.set('extraction.enableDbPersistence', settings.extraction.enableDbPersistence)

    // Validation settings
    this.set('validation.dataSource', settings.validation.dataSource)
    this.set('validation.batchSize', settings.validation.batchSize)
    this.set('validation.matchMode', settings.validation.matchMode)
    this.set('validation.enableCrud', settings.validation.enableCrud)
    this.set('validation.defaultManager', settings.validation.defaultManager)

    // UI settings
    this.set('ui.fontFamily', settings.ui.fontFamily)
    this.set('ui.fontSize', settings.ui.fontSize)
    this.set('ui.productionIdInputWidth', settings.ui.productionIdInputWidth)

    // Execution settings
    this.set('execution.dryRun', settings.execution.dryRun)

    return this.save()
  }

  /**
   * Reset to default settings
   */
  public resetToDefaults(): SettingsData {
    // Clear cache and reload from defaults
    this.configCache.clear()

    // Set all defaults
    this.set('erp.url', DEFAULT_SETTINGS.erp.url)
    this.set('erp.username', DEFAULT_SETTINGS.erp.username)
    this.set('erp.password', DEFAULT_SETTINGS.erp.password)
    this.set('erp.headless', DEFAULT_SETTINGS.erp.headless)
    this.set('erp.ignoreHttpsErrors', DEFAULT_SETTINGS.erp.ignoreHttpsErrors)
    this.set('erp.autoCloseBrowser', DEFAULT_SETTINGS.erp.autoCloseBrowser)

    this.set('database.dbType', DEFAULT_SETTINGS.database.dbType)
    this.set('database.server', DEFAULT_SETTINGS.database.server)
    this.set('database.mysqlHost', DEFAULT_SETTINGS.database.mysqlHost)
    this.set('database.mysqlPort', DEFAULT_SETTINGS.database.mysqlPort)
    this.set('database.database', DEFAULT_SETTINGS.database.database)
    this.set('database.username', DEFAULT_SETTINGS.database.username)
    this.set('database.password', DEFAULT_SETTINGS.database.password)

    this.set('paths.dataDir', DEFAULT_SETTINGS.paths.dataDir)
    this.set('paths.defaultOutput', DEFAULT_SETTINGS.paths.defaultOutput)
    this.set('paths.validationOutput', DEFAULT_SETTINGS.paths.validationOutput)

    this.set('extraction.batchSize', DEFAULT_SETTINGS.extraction.batchSize)
    this.set('extraction.verbose', DEFAULT_SETTINGS.extraction.verbose)
    this.set('extraction.autoConvert', DEFAULT_SETTINGS.extraction.autoConvert)
    this.set('extraction.mergeBatches', DEFAULT_SETTINGS.extraction.mergeBatches)
    this.set('extraction.enableDbPersistence', DEFAULT_SETTINGS.extraction.enableDbPersistence)

    this.set('validation.dataSource', DEFAULT_SETTINGS.validation.dataSource)
    this.set('validation.batchSize', DEFAULT_SETTINGS.validation.batchSize)
    this.set('validation.matchMode', DEFAULT_SETTINGS.validation.matchMode)
    this.set('validation.enableCrud', DEFAULT_SETTINGS.validation.enableCrud)
    this.set('validation.defaultManager', DEFAULT_SETTINGS.validation.defaultManager)

    this.set('ui.fontFamily', DEFAULT_SETTINGS.ui.fontFamily)
    this.set('ui.fontSize', DEFAULT_SETTINGS.ui.fontSize)
    this.set('ui.productionIdInputWidth', DEFAULT_SETTINGS.ui.productionIdInputWidth)

    this.set('execution.dryRun', DEFAULT_SETTINGS.execution.dryRun)

    return DEFAULT_SETTINGS
  }

  /**
   * Get default settings
   */
  public getDefaultSettings(): SettingsData {
    return DEFAULT_SETTINGS
  }
}
