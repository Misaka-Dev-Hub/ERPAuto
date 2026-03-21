import type { MySqlConfig, SqlServerConfig } from '../../main/types/ipc-api.types'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { invokeIpc } from '../lib/ipc'

export const databaseApi = {
  connectMySql: (config: MySqlConfig) => invokeIpc(IPC_CHANNELS.DATABASE_MYSQL_CONNECT, config),
  disconnectMySql: () => invokeIpc(IPC_CHANNELS.DATABASE_MYSQL_DISCONNECT),
  isMySqlConnected: () => invokeIpc(IPC_CHANNELS.DATABASE_MYSQL_IS_CONNECTED),
  queryMySql: (sql: string, params?: unknown[]) =>
    invokeIpc(IPC_CHANNELS.DATABASE_MYSQL_QUERY, sql, params),
  connectSqlServer: (config: SqlServerConfig) =>
    invokeIpc(IPC_CHANNELS.DATABASE_SQLSERVER_CONNECT, config),
  disconnectSqlServer: () => invokeIpc(IPC_CHANNELS.DATABASE_SQLSERVER_DISCONNECT),
  isSqlServerConnected: () => invokeIpc(IPC_CHANNELS.DATABASE_SQLSERVER_IS_CONNECTED),
  querySqlServer: (sql: string, params?: Record<string, unknown>) =>
    invokeIpc(IPC_CHANNELS.DATABASE_SQLSERVER_QUERY, sql, params)
} as const
