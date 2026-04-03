import type {
  FileAPI,
  ExtractorAPI,
  CleanerAPI,
  DatabaseAPI,
  ReportAPI
} from '../main/types/ipc-api.types'
import type { ResolverInput, ResolverResponse } from '../main/types/resolver-ipc.types'
import type { UserInfo } from '../main/types/user.types'
import type {
  CurrentUserResponse,
  LoginRequest,
  LoginResponse,
  SilentLoginResponse,
  UserSelectionResponse
} from '../main/types/auth-ipc.types'
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
import type { IpcResult } from '../main/types/ipc.types'
import type { LogLevel } from '../shared/ipc-channels'
import type { CleanerConfig } from '../main/types/config.schema'
import type {
  DownloadReleaseRequest,
  UpdateDialogCatalog,
  UpdateStatus
} from '../main/types/update.types'

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
  fetchLevel: () => Promise<void>
  cleanup: () => void
}

export interface UpdateAPI {
  getStatus: () => Promise<IpcResult<UpdateStatus>>
  checkNow: () => Promise<IpcResult<UpdateStatus>>
  getCatalog: () => Promise<IpcResult<UpdateDialogCatalog>>
  getChangelog: (release: DownloadReleaseRequest) => Promise<IpcResult<string>>
  downloadRelease: (release: DownloadReleaseRequest) => Promise<IpcResult<UpdateStatus>>
  installDownloaded: () => Promise<IpcResult<void>>
  onStatusChanged: (callback: (data: UpdateStatus) => void) => () => void
}

export interface DownloadProgress {
  percent: number // 0-100
  downloadedBytes: number
  totalBytes: number
  currentFile: string
  speed: number // bytes/s
  eta?: number // seconds
}

export interface PlaywrightBrowserAPI {
  check: () => Promise<IpcResult<boolean>>
  download: () => Promise<IpcResult<void>>
  cancel: () => Promise<IpcResult<void>>
  onProgress: (callback: (data: DownloadProgress) => void) => () => void
}

export interface OperationHistoryAPI {
  getBatches: (options?: { limit?: number; offset?: number }) => Promise<IpcResult<BatchStats[]>>
  getBatchDetails: (batchId: string) => Promise<IpcResult<OperationHistoryRecord[]>>
  deleteBatch: (batchId: string) => Promise<IpcResult<{ deleted: boolean }>>
}

export interface BatchStats {
  batchId: string
  userId: number
  username: string
  operationTime: string
  status: string
  totalOrders: number
  totalRecords: number
  successCount: number
  failedCount: number
}

export interface OperationHistoryRecord {
  id?: number
  batchId: string
  userId: number
  username: string
  productionId: string | null
  orderNumber: string
  operationTime: Date
  status: string
  recordCount: number | null
  errorMessage: string | null
}

export interface ProcessAPI {
  versions: {
    electron: string
    chrome: string
    node: string
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
      update: UpdateAPI
      playwrightBrowser: PlaywrightBrowserAPI
      operationHistory: OperationHistoryAPI
    }
    api: unknown
  }
}
