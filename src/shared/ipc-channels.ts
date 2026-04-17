/**
 * IPC Channel definitions
 * Centralized channel names for main-renderer communication
 */

export const IPC_CHANNELS = {
  // File operations
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  FILE_EXISTS: 'file:exists',
  FILE_LIST: 'file:list',
  FILE_OPEN_PATH: 'file:openPath',

  // Extractor service
  EXTRACTOR_RUN: 'extractor:run',
  EXTRACTOR_PROGRESS: 'extractor:progress',
  EXTRACTOR_LOG: 'extractor:log',

  // Cleaner service
  CLEANER_RUN: 'cleaner:run',
  CLEANER_EXPORT_RESULTS: 'cleaner:exportResults',
  CLEANER_PROGRESS: 'cleaner:progress',

  // Cleaner operation history
  CLEANER_HISTORY_GET_BATCHES: 'cleanerHistory:getBatches',
  CLEANER_HISTORY_GET_BATCH_DETAILS: 'cleanerHistory:getBatchDetails',
  CLEANER_HISTORY_GET_MATERIAL_DETAILS: 'cleanerHistory:getMaterialDetails',
  CLEANER_HISTORY_DELETE_BATCH: 'cleanerHistory:deleteBatch',
  CLEANER_HISTORY_SEARCH: 'cleanerHistory:search',

  // Database service - MySQL
  DATABASE_MYSQL_CONNECT: 'database:mysql:connect',
  DATABASE_MYSQL_DISCONNECT: 'database:mysql:disconnect',
  DATABASE_MYSQL_IS_CONNECTED: 'database:mysql:isConnected',
  DATABASE_MYSQL_QUERY: 'database:mysql:query',

  // Database service - SQL Server
  DATABASE_SQLSERVER_CONNECT: 'database:sqlserver:connect',
  DATABASE_SQLSERVER_DISCONNECT: 'database:sqlserver:disconnect',
  DATABASE_SQLSERVER_IS_CONNECTED: 'database:sqlserver:isConnected',
  DATABASE_SQLSERVER_QUERY: 'database:sqlserver:query',

  // Resolver
  RESOLVER_RESOLVE: 'resolver:resolve',
  RESOLVER_VALIDATE_FORMAT: 'resolver:validateFormat',

  // Auth
  AUTH_GET_COMPUTER_NAME: 'auth:getComputerName',
  AUTH_SILENT_LOGIN: 'auth:silentLogin',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_GET_CURRENT_USER: 'auth:getCurrentUser',
  AUTH_GET_ALL_USERS: 'auth:getAllUsers',
  AUTH_SWITCH_USER: 'auth:switchUser',
  AUTH_IS_ADMIN: 'auth:isAdmin',

  // Validation
  VALIDATION_VALIDATE: 'validation:validate',
  VALIDATION_SET_SHARED_PRODUCTION_IDS: 'validation:setSharedProductionIds',
  VALIDATION_GET_SHARED_PRODUCTION_IDS: 'validation:getSharedProductionIds',
  VALIDATION_CLEAR_SHARED_PRODUCTION_IDS: 'validation:clearSharedProductionIds',
  VALIDATION_GET_CLEANER_DATA: 'validation:getCleanerData',

  // Materials
  MATERIALS_UPSERT_BATCH: 'materials:upsertBatch',
  MATERIALS_DELETE: 'materials:delete',
  MATERIALS_GET_MANAGERS: 'materials:getManagers',
  MATERIALS_GET_BY_MANAGER: 'materials:getByManager',
  MATERIALS_GET_ALL: 'materials:getAll',
  MATERIALS_GET_STATISTICS: 'materials:getStatistics',
  MATERIALS_UPDATE_MANAGER: 'materials:updateManager',

  // Settings
  SETTINGS_GET_USER_TYPE: 'settings:getUserType',
  SETTINGS_GET_SETTINGS: 'settings:getSettings',
  SETTINGS_SAVE_SETTINGS: 'settings:saveSettings',
  SETTINGS_RESET_DEFAULTS: 'settings:resetDefaults',
  SETTINGS_TEST_DB_CONNECTION: 'settings:testDbConnection',

  // Material type
  MATERIAL_TYPE_GET_ALL: 'materialType:getAll',
  MATERIAL_TYPE_GET_BY_MANAGER: 'materialType:getByManager',
  MATERIAL_TYPE_GET_MANAGERS: 'materialType:getManagers',
  MATERIAL_TYPE_UPSERT: 'materialType:upsert',
  MATERIAL_TYPE_DELETE: 'materialType:delete',
  MATERIAL_TYPE_UPSERT_BATCH: 'materialType:upsertBatch',

  // User ERP config
  USER_ERP_CONFIG_GET_CURRENT: 'user-erp-config:getCurrent',
  USER_ERP_CONFIG_UPDATE: 'user-erp-config:update',
  USER_ERP_CONFIG_TEST_CONNECTION: 'user-erp-config:testConnection',
  USER_ERP_CONFIG_GET_ALL: 'user-erp-config:getAll',

  // Config
  CONFIG_GET: 'config:get',
  CONFIG_UPDATE: 'config:update',
  CONFIG_GET_CLEANER: 'config:getCleaner',
  CONFIG_UPDATE_CLEANER: 'config:updateCleaner',

  // Logger
  LOGGER_FORWARD: 'logger:forward',
  LOGGER_GET_LEVEL: 'logger:getLevel',
  LOGGER_LEVEL_CHANGED: 'logger:levelChanged',

  // Report
  REPORT_LIST_ALL: 'report:listAll',
  REPORT_LIST_BY_USER: 'report:listByUser',
  REPORT_DOWNLOAD: 'report:download',

  // Update
  UPDATE_GET_STATUS: 'update:getStatus',
  UPDATE_CHECK_NOW: 'update:checkNow',
  UPDATE_GET_CATALOG: 'update:getCatalog',
  UPDATE_GET_CHANGELOG: 'update:getChangelog',
  UPDATE_DOWNLOAD_RELEASE: 'update:downloadRelease',
  UPDATE_INSTALL_DOWNLOADED: 'update:installDownloaded',
  UPDATE_STATUS_CHANGED: 'update:onStatusChanged',

  // Playwright Browser
  PLAYWRIGHT_BROWSER_DOWNLOAD: 'playwright-browser:download',
  PLAYWRIGHT_BROWSER_CANCEL: 'playwright-browser:cancel',
  PLAYWRIGHT_BROWSER_PROGRESS: 'playwright-browser:progress',
  PLAYWRIGHT_BROWSER_CHECK: 'playwright-browser:check',

  // Operation History
  OPERATION_HISTORY_GET_BATCHES: 'operationHistory:getBatches',
  OPERATION_HISTORY_GET_BATCH_DETAILS: 'operationHistory:getBatchDetails',
  OPERATION_HISTORY_DELETE_BATCH: 'operationHistory:deleteBatch'
} as const

/**
 * Log level for logger service
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose'
