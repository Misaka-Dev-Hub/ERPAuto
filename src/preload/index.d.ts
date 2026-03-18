import type {
  FileAPI,
  ExtractorAPI,
  CleanerAPI,
  DatabaseAPI,
  ReportAPI
} from '../main/types/ipc-api.types'
import type { ResolverInput, ResolverResponse } from '../main/ipc/resolver-handler'
import type { UserInfo } from '../main/types/user.types'
import type {
  LoginRequest,
  LoginResponse,
  SilentLoginResponse,
  UserSelectionResponse,
  CurrentUserResponse
} from '../main/ipc/auth-handler'
import type {
  ValidationRequest,
  ValidationResponse,
  MaterialTypeRecord,
  MaterialTypeBatchRequest
} from '../main/types/validation.types'
import type {
  UserType,
  ConnectionTestResult,
  SaveSettingsResult
} from '../main/types/settings.types'
import type { IpcResult } from '../main/ipc'
import type { LogLevel } from '../shared/ipc-channels'
import type { CleanerConfig } from '../main/types/config.schema'

export interface ResolverAPI {
  resolve: (input: ResolverInput) => Promise<IpcResult<ResolverResponse>>
  validateFormat: (
    inputs: string[]
  ) => Promise<
    IpcResult<Array<{ input: string; type: 'productionId' | 'orderNumber' | 'unknown' }>>
  >
}

export interface AuthAPI {
  getComputerName: () => Promise<IpcResult<string>>
  silentLogin: () => Promise<IpcResult<SilentLoginResponse>>
  login: (request: LoginRequest) => Promise<IpcResult<LoginResponse>>
  logout: () => Promise<IpcResult<void>>
  getCurrentUser: () => Promise<IpcResult<CurrentUserResponse>>
  getAllUsers: () => Promise<IpcResult<UserInfo[]>>
  switchUser: (userInfo: UserInfo) => Promise<IpcResult<UserSelectionResponse>>
  isAdmin: () => Promise<IpcResult<boolean>>
}

export interface ValidationAPI {
  validate: (request: ValidationRequest) => Promise<IpcResult<ValidationResponse>>
  setSharedProductionIds: (productionIds: string[]) => Promise<IpcResult<void>>
  getSharedProductionIds: () => Promise<IpcResult<{ productionIds: string[] }>>
  clearSharedProductionIds: () => Promise<IpcResult<void>>
  getCleanerData: () => Promise<
    IpcResult<{
      orderNumbers: string[]
      materialCodes: string[]
    }>
  >
}

export interface MaterialsAPI {
  upsertBatch: (
    materials: { materialCode: string; managerName: string }[]
  ) => Promise<IpcResult<{ stats: { total: number; success: number; failed: number } }>>
  delete: (materialCodes: string[]) => Promise<IpcResult<{ count: number }>>
  getManagers: () => Promise<IpcResult<{ managers: string[] }>>
  getByManager: (managerName: string) => Promise<IpcResult<{ materials: unknown[] }>>
  getAll: () => Promise<IpcResult<{ materials: unknown[] }>>
  getStatistics: () => Promise<IpcResult<{ stats: unknown }>>
  updateManager: (
    materialCode: string,
    managerName: string
  ) => Promise<IpcResult<{ updated: boolean }>>
}

export interface SettingsAPI {
  getUserType: () => Promise<IpcResult<UserType>>
  getSettings: () => Promise<IpcResult<{ erp: { username: string; password: string } }>>
  saveSettings: (settings: {
    erp?: { username?: string; password?: string }
  }) => Promise<IpcResult<SaveSettingsResult>>
  resetDefaults: () => Promise<IpcResult<SaveSettingsResult>>
  testDbConnection: () => Promise<IpcResult<ConnectionTestResult>>
}

export interface MaterialTypeAPI {
  getAll: () => Promise<IpcResult<MaterialTypeRecord[]>>
  getByManager: (managerName: string) => Promise<IpcResult<MaterialTypeRecord[]>>
  getManagers: () => Promise<IpcResult<string[]>>
  upsert: (materialName: string, managerName: string) => Promise<IpcResult<{ updated: boolean }>>
  delete: (materialName: string, managerName: string) => Promise<IpcResult<{ deleted: boolean }>>
  upsertBatch: (
    request: MaterialTypeBatchRequest
  ) => Promise<IpcResult<{ stats: { total: number; success: number; failed: number } }>>
}

export interface UserErpConfigAPI {
  getCurrent: () => Promise<
    IpcResult<{
      config: { url: string; username: string; password: string }
    }>
  >
  update: (config: { url: string; username: string; password: string }) => Promise<
    IpcResult<{
      config: { url: string; username: string; password: string }
    }>
  >
  testConnection: (config: {
    url: string
    username: string
    password: string
  }) => Promise<IpcResult<{ message: string }>>
  getAll: () => Promise<IpcResult<Array<{ username: string; erpUrl: string; erpUsername: string }>>>
}

export interface ConfigAPI {
  getCleaner: () => Promise<IpcResult<CleanerConfig>>
  updateCleaner: (updates: Partial<CleanerConfig>) => Promise<IpcResult<CleanerConfig>>
}

export interface LoggerAPI {
  log: (level: LogLevel, message: string, context?: Record<string, unknown>) => void
}

export interface UpdaterAPI {
  check: () => Promise<IpcResult>
  getStatus: () => Promise<
    IpcResult<{ status: string; version?: string; progress?: any; channel: string }>
  >
  getChannelInfo: () => Promise<IpcResult<{ channel: string; available: string[] }>>
  setChannel: (channel: 'stable' | 'beta') => Promise<IpcResult>
  download: () => Promise<IpcResult>
  install: () => Promise<IpcResult>
  cancel: () => Promise<IpcResult>
  onChecking: (callback: (data: { channel: string }) => void) => () => void
  onAvailable: (
    callback: (data: { version: string; releaseNotes: string; channel: string }) => void
  ) => () => void
  onNotAvailable: (callback: (data: { message: string }) => void) => () => void
  onProgress: (callback: (data: any) => void) => () => void
  onDownloaded: (callback: (data: { version: string }) => void) => () => void
  onError: (callback: (data: { error: string }) => void) => () => void
  onChannelChanged: (callback: (data: { channel: string }) => void) => () => void
}

export interface ProcessAPI {
  versions: {
    electron: string
    chrome: string
    node: string
    app: string
  }
}

declare global {
  interface Window {
    electron: {
      process: ProcessAPI
      file: FileAPI
      extractor: ExtractorAPI
      cleaner: CleanerAPI
      database: DatabaseAPI
      resolver: ResolverAPI
      auth: AuthAPI
      validation: ValidationAPI
      materials: MaterialsAPI
      settings: SettingsAPI
      materialType: MaterialTypeAPI
      userErpConfig: UserErpConfigAPI
      config: ConfigAPI
      logger: LoggerAPI
      report: ReportAPI
      updater: UpdaterAPI
    }
    api: unknown
  }
}
