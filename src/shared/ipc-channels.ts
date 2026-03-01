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

  // Extractor service
  EXTRACTOR_RUN: 'extractor:run',

  // Cleaner service
  CLEANER_RUN: 'cleaner:run',

  // Database service - MySQL
  DATABASE_MYSQL_CONNECT: 'database:mysql:connect',
  DATABASE_MYSQL_DISCONNECT: 'database:mysql:disconnect',
  DATABASE_MYSQL_IS_CONNECTED: 'database:mysql:isConnected',
  DATABASE_MYSQL_QUERY: 'database:mysql:query'
} as const
