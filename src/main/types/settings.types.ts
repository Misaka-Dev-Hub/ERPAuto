/**
 * Settings types and interfaces
 *
 * Defines configuration structures for ERPAuto settings management
 */

/**
 * User type for settings permission control
 */
export type UserType = 'Admin' | 'User' | 'Guest'

/**
 * Database type selection
 */
export type DatabaseType = 'sqlserver' | 'mysql'

/**
 * Validation match mode
 */
export type MatchMode = 'substring' | 'exact'

/**
 * Validation data source options
 */
export type ValidationDataSource =
  | 'database_full'
  | 'database_filtered'
  | 'excel_existing'
  | 'excel_full'

/**
 * ERP configuration
 */
export interface ErpConfig {
  /** ERP system URL */
  url: string
  /** ERP username */
  username: string
  /** ERP password */
  password: string
  /** Headless browser mode */
  headless: boolean
  /** Ignore HTTPS certificate errors */
  ignoreHttpsErrors: boolean
  /** Auto close browser after operations */
  autoCloseBrowser: boolean
}

/**
 * Database configuration
 */
export interface DatabaseConfig {
  /** Database type */
  dbType: DatabaseType
  /** SQL Server server address */
  server: string
  /** MySQL host */
  mysqlHost: string
  /** MySQL port */
  mysqlPort: number
  /** Database name */
  database: string
  /** Database username */
  username: string
  /** Database password */
  password: string
}

/**
 * Path configuration
 */
export interface PathsConfig {
  /** Data directory */
  dataDir: string
  /** Default output file */
  defaultOutput: string
  /** Validation output file */
  validationOutput: string
}

/**
 * Data extraction configuration
 */
export interface ExtractionConfig {
  /** Batch size for data extraction */
  batchSize: number
  /** Enable verbose logging */
  verbose: boolean
  /** Auto convert to Excel */
  autoConvert: boolean
  /** Merge batches */
  mergeBatches: boolean
  /** Enable database persistence */
  enableDbPersistence: boolean
}

/**
 * Material validation configuration
 */
export interface ValidationConfig {
  /** Data source type */
  dataSource: ValidationDataSource
  /** Batch size for validation */
  batchSize: number
  /** Match mode */
  matchMode: MatchMode
  /** Enable CRUD operations */
  enableCrud: boolean
  /** Default manager name */
  defaultManager: string
}

/**
 * UI configuration
 */
export interface UiConfig {
  /** Font family */
  fontFamily: string
  /** Font size */
  fontSize: number
  /** Production ID input width */
  productionIdInputWidth: number
}

/**
 * Execution configuration (User-only)
 */
export interface ExecutionConfig {
  /** Dry run mode */
  dryRun: boolean
}

/**
 * Complete settings data structure
 */
export interface SettingsData {
  /** ERP configuration */
  erp: ErpConfig
  /** Database configuration */
  database: DatabaseConfig
  /** Path configuration */
  paths: PathsConfig
  /** Extraction configuration */
  extraction: ExtractionConfig
  /** Validation configuration */
  validation: ValidationConfig
  /** UI configuration */
  ui: UiConfig
  /** Execution configuration */
  execution: ExecutionConfig
}

/**
 * Connection test result
 */
export interface ConnectionTestResult {
  /** Whether connection was successful */
  success: boolean
  /** Status message */
  message?: string
}

/**
 * Save settings result
 */
export interface SaveSettingsResult {
  /** Whether save was successful */
  success: boolean
  /** Error message if failed */
  error?: string
}

/**
 * Settings API interface for preload
 */
export interface SettingsAPI {
  /** Get current user type */
  getUserType: () => Promise<UserType>
  /** Get settings (filtered by user type) */
  getSettings: () => Promise<SettingsData>
  /** Save settings */
  saveSettings: (settings: SettingsData) => Promise<SaveSettingsResult>
  /** Reset to defaults (Admin only) */
  resetDefaults: () => Promise<SaveSettingsResult>
  /** Test ERP connection */
  testErpConnection: () => Promise<ConnectionTestResult>
  /** Test database connection */
  testDbConnection: () => Promise<ConnectionTestResult>
}
