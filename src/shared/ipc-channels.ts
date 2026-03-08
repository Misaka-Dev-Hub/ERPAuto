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
  USER_ERP_CONFIG_GET_ALL: 'user-erp-config:getAll'
} as const
