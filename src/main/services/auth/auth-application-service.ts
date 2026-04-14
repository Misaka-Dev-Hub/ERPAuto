import { hostname } from 'os'
import { SessionManager } from '../user/session-manager'
import { UpdateService } from '../update/update-service'
import { createLogger, run, getRequestId, getContext } from '../logger'
import { logAudit } from '../logger/audit-logger'
import { AuditAction, AuditStatus } from '../../types/audit.types'
import { ValidationError } from '../../types/errors'
import type { UserInfo } from '../../types/user.types'
import type {
  CurrentUserResponse,
  LoginResponse,
  SilentLoginResponse,
  UserSelectionResponse
} from '../../types/auth-ipc.types'

const log = createLogger('AuthApplicationService')

export class AuthApplicationService {
  private silentLoginPromise: Promise<SilentLoginResponse> | null = null

  constructor(
    private readonly sessionManager: SessionManager = SessionManager.getInstance(),
    private readonly updateService: UpdateService = UpdateService.getInstance()
  ) {}

  async getComputerName(): Promise<string> {
    const requestId = getRequestId()
    if (requestId) {
      log.debug('Get computer name', { requestId })
    }
    return hostname()
  }

  async silentLogin(): Promise<SilentLoginResponse> {
    if (this.silentLoginPromise) {
      log.debug('Reusing in-flight silent login request', { requestId: getRequestId() })
      return this.silentLoginPromise
    }

    this.silentLoginPromise = run(
      async (): Promise<SilentLoginResponse> => {
        const requestId = getRequestId()
        const context = getContext()
        const startTime = performance.now()

        try {
          log.info('Attempting silent login', { requestId, operation: context?.operation })
          const success = await this.sessionManager.loginByComputerName()
          const userInfo = this.sessionManager.getUserInfo()

          if (!success || !userInfo) {
            await this.updateService.setUserContext(null)
            const error = new ValidationError('无感登录失败：未找到匹配用户', 'VAL_INVALID_INPUT')
            log.error('Silent login failed - user not found', {
              operation: 'silentLogin',
              requestId,
              userId: userInfo?.id,
              username: userInfo?.username,
              computerName: hostname(),
              error
            })
            throw error
          }

          await this.updateService.setUserContext(userInfo.userType)

          const requiresUserSelection = userInfo.userType === 'Admin'
          log.info('Silent login successful', {
            requestId,
            operation: context?.operation,
            username: userInfo.username,
            userType: userInfo.userType,
            requiresUserSelection,
            userId: userInfo.id
          })

          this.writeAuditLog(AuditAction.LOGIN, String(userInfo.id), {
            username: userInfo.username,
            computerName: hostname(),
            resource: 'ERP_SYSTEM',
            status: AuditStatus.SUCCESS,
            metadata: { loginType: 'silent', userType: userInfo.userType }
          })

          return {
            success: true,
            userInfo,
            requiresUserSelection
          }
        } finally {
          const durationMs = performance.now() - startTime
          if (durationMs > 1000) {
            log.warn(`Silent login took ${durationMs.toFixed(2)}ms (SLOW)`, {
              operation: 'silentLogin',
              requestId,
              durationMs
            })
          } else {
            log.debug(`Silent login completed in ${durationMs.toFixed(2)}ms`, {
              operation: 'silentLogin',
              requestId,
              durationMs
            })
          }
        }
      },
      { operation: 'silentLogin' }
    )
    return this.silentLoginPromise
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    if (!username || !password) {
      log.warn('Login attempt with missing credentials', { requestId: getRequestId() })
      throw new ValidationError('请输入用户名和密码', 'VAL_MISSING_REQUIRED')
    }

    return run(
      async (): Promise<LoginResponse> => {
        const requestId = getRequestId()
        const context = getContext()

        const startTime = performance.now()

        try {
          log.info('Login attempt', { username, requestId, operation: context?.operation })
          const success = await this.sessionManager.login(username, password)
          const userInfo = this.sessionManager.getUserInfo()

          if (!success || !userInfo) {
            this.writeAuditLog(AuditAction.LOGIN, '0', {
              username,
              computerName: hostname(),
              resource: 'ERP_SYSTEM',
              status: AuditStatus.FAILURE,
              metadata: { loginType: 'credentials', reason: 'invalid_credentials' }
            })

            const error = new ValidationError('用户名或密码错误', 'VAL_INVALID_INPUT')
            log.warn('Login failed - invalid credentials', {
              username,
              requestId,
              operation: context?.operation,
              error
            })
            await this.updateService.setUserContext(null)
            throw error
          }

          log.info('Login successful', {
            requestId,
            operation: context?.operation,
            username,
            userType: userInfo.userType,
            userId: userInfo.id
          })
          await this.updateService.setUserContext(userInfo.userType)

          this.writeAuditLog(AuditAction.LOGIN, String(userInfo.id), {
            username: userInfo.username,
            computerName: hostname(),
            resource: 'ERP_SYSTEM',
            status: AuditStatus.SUCCESS,
            metadata: { loginType: 'credentials', userType: userInfo.userType }
          })

          return {
            success: true,
            userInfo
          }
        } finally {
          const durationMs = performance.now() - startTime
          if (durationMs > 1000) {
            log.warn(`Login took ${durationMs.toFixed(2)}ms (SLOW)`, {
              operation: 'login',
              requestId,
              durationMs,
              username
            })
          } else {
            log.debug(`Login completed in ${durationMs.toFixed(2)}ms`, {
              operation: 'login',
              requestId,
              durationMs
            })
          }
        }
      },
      { operation: 'login' }
    )
  }

  async logout(): Promise<void> {
    return run(
      async () => {
        const requestId = getRequestId()
        const context = getContext()
        const userInfo = this.sessionManager.getUserInfo()

        log.info('User logout', {
          requestId,
          operation: context?.operation,
          username: userInfo?.username,
          userId: userInfo?.id
        })

        if (userInfo) {
          this.writeAuditLog(AuditAction.LOGOUT, String(userInfo.id), {
            username: userInfo.username,
            computerName: hostname(),
            resource: 'ERP_SYSTEM',
            status: AuditStatus.SUCCESS,
            metadata: { userType: userInfo.userType }
          })
        }

        this.sessionManager.logout()
        this.silentLoginPromise = null
        await this.updateService.setUserContext(null)
      },
      { operation: 'logout' }
    )
  }

  getCurrentUser(): CurrentUserResponse {
    const requestId = getRequestId()
    const isAuthenticated = this.sessionManager.isAuthenticated()
    const userInfo = this.sessionManager.getUserInfo()

    if (requestId) {
      log.debug('Get current user', { requestId, isAuthenticated, userId: userInfo?.id })
    }

    return {
      isAuthenticated,
      userInfo: userInfo ?? undefined
    }
  }

  async getAllUsers(): Promise<UserInfo[]> {
    const requestId = getRequestId()
    log.debug('Fetching all users for admin selection', { requestId })
    return this.sessionManager.getAllUsers()
  }

  async switchUser(userInfo: UserInfo): Promise<UserSelectionResponse> {
    return run(
      async (): Promise<UserSelectionResponse> => {
        const requestId = getRequestId()
        const context = getContext()
        const startTime = performance.now()

        try {
          log.info('User switch attempt', {
            requestId,
            operation: context?.operation,
            targetUser: userInfo.username,
            targetUserId: userInfo.id
          })
          const success = this.sessionManager.switchUser(userInfo)

          if (!success) {
            const error = new ValidationError('用户切换失败', 'VAL_INVALID_INPUT')
            log.warn('User switch failed', {
              requestId,
              operation: context?.operation,
              targetUser: userInfo.username,
              targetUserId: userInfo.id,
              error
            })
            throw error
          }

          const newUser = this.sessionManager.getUserInfo()
          log.info('User switch successful', {
            requestId,
            operation: context?.operation,
            newUsername: newUser?.username,
            newUserId: newUser?.id,
            newUserType: newUser?.userType
          })
          await this.updateService.setUserContext(newUser?.userType ?? null)

          return {
            success: true,
            userInfo: newUser ?? undefined
          }
        } finally {
          const durationMs = performance.now() - startTime
          if (durationMs > 1000) {
            log.warn(`User switch took ${durationMs.toFixed(2)}ms (SLOW)`, {
              operation: 'switchUser',
              requestId,
              durationMs,
              targetUser: userInfo.username
            })
          } else {
            log.debug(`User switch completed in ${durationMs.toFixed(2)}ms`, {
              operation: 'switchUser',
              requestId,
              durationMs
            })
          }
        }
      },
      { operation: 'switchUser', userId: String(userInfo.id) }
    )
  }

  isAdmin(): boolean {
    return this.sessionManager.isAdmin()
  }

  private writeAuditLog(
    action: AuditAction.LOGIN | AuditAction.LOGOUT,
    actorId: string,
    payload: Parameters<typeof logAudit>[2]
  ): void {
    logAudit(action, actorId, payload)
  }
}
