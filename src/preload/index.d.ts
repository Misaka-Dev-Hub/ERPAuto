import type { FileAPI, ExtractorAPI, CleanerAPI, DatabaseAPI } from '../main/types/ipc-api.types'
import type { ResolverInput, ResolverResponse } from '../main/ipc/resolver-handler'
import type { UserInfo } from '../main/types/user.types'
import type {
  LoginRequest,
  LoginResponse,
  SilentLoginResponse,
  UserSelectionResponse,
  CurrentUserResponse
} from '../main/ipc/auth-handler'
import type { ValidationRequest, ValidationResponse } from '../main/types/validation.types'

/**
 * Order number resolver API
 */
export interface ResolverAPI {
  /**
   * Resolve productionIDs and 生产订单号 to production order numbers
   * @param input - Resolver input with list of inputs
   */
  resolve: (input: ResolverInput) => Promise<ResolverResponse>
  /**
   * Validate input format only (without database lookup)
   * @param inputs - List of inputs to validate
   */
  validateFormat: (inputs: string[]) => Promise<{
    success: boolean
    results?: Array<{ input: string; type: 'productionId' | 'orderNumber' | 'unknown' }>
    error?: string
  }>
}

/**
 * Authentication API
 */
export interface AuthAPI {
  /**
   * Get computer name
   */
  getComputerName: () => Promise<string>
  /**
   * Silent login by computer name
   */
  silentLogin: () => Promise<SilentLoginResponse>
  /**
   * Login with username and password
   * @param request - Login request with username and password
   */
  login: (request: LoginRequest) => Promise<LoginResponse>
  /**
   * Logout
   */
  logout: () => Promise<void>
  /**
   * Get current user
   */
  getCurrentUser: () => Promise<CurrentUserResponse>
  /**
   * Get all users (for admin user selection)
   */
  getAllUsers: () => Promise<UserInfo[]>
  /**
   * Switch user (admin only)
   * @param userInfo - User info to switch to
   */
  switchUser: (userInfo: UserInfo) => Promise<UserSelectionResponse>
  /**
   * Check if current user is admin
   */
  isAdmin: () => Promise<boolean>
}

/**
 * Validation API
 */
export interface ValidationAPI {
  /**
   * Run material validation
   * @param request - Validation request
   */
  validate: (request: ValidationRequest) => Promise<ValidationResponse>
  /**
   * Set shared Production IDs from extractor page
   * @param productionIds - List of Production IDs
   */
  setSharedProductionIds: (productionIds: string[]) => Promise<void>
  /**
   * Get shared Production IDs
   */
  getSharedProductionIds: () => Promise<{ productionIds: string[] }>
}

/**
 * Materials API
 */
export interface MaterialsAPI {
  /**
   * Upsert batch materials to MaterialsToBeDeleted
   * @param materials - List of materials with materialCode and managerName
   */
  upsertBatch: (materials: { materialCode: string; managerName: string }[]) => Promise<{
    success: boolean
    stats?: { total: number; success: number; failed: number }
    error?: string
  }>
  /**
   * Delete materials by material codes
   * @param materialCodes - List of material codes to delete
   */
  delete: (materialCodes: string[]) => Promise<{
    success: boolean
    count?: number
    error?: string
  }>
  /**
   * Get unique manager names
   */
  getManagers: () => Promise<{ managers: string[] }>
  /**
   * Get materials by manager
   * @param managerName - Manager name
   */
  getByManager: (managerName: string) => Promise<{ materials: unknown[] }>
  /**
   * Get all material records
   */
  getAll: () => Promise<{ materials: unknown[] }>
  /**
   * Get statistics
   */
  getStatistics: () => Promise<{ stats: unknown }>
}

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        send: (channel: string, ...args: unknown[]) => void
        on: (channel: string, func: (...args: unknown[]) => void) => void
        once: (channel: string, func: (...args: unknown[]) => void) => void
        removeListener: (channel: string, func: (...args: unknown[]) => void) => void
        removeAllListeners: (channel: string) => void
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      }
      process: {
        versions: {
          electron: string
          chrome: string
          node: string
        }
      }
      file: FileAPI
      extractor: ExtractorAPI
      cleaner: CleanerAPI
      database: DatabaseAPI
      resolver: ResolverAPI
      auth: AuthAPI
      validation: ValidationAPI
      materials: MaterialsAPI
    }
    api: unknown
  }
}
