import { hostname } from 'os'
import { SessionManager } from '../user/session-manager'
import { UpdateService } from '../update/update-service'
import { createLogger } from '../logger'
import { logAudit } from '../logger/audit-logger'
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
    return hostname()
  }

  async silentLogin(): Promise<SilentLoginResponse> {
    if (this.silentLoginPromise) {
      log.debug('Reusing in-flight silent login request')
      return this.silentLoginPromise
    }

    this.silentLoginPromise = this.performSilentLogin()
    try {
      return await this.silentLoginPromise
    } finally {
      this.silentLoginPromise = null
    }
  }

  private async performSilentLogin(): Promise<SilentLoginResponse> {
    log.info('Attempting silent login')
    const success = await this.sessionManager.loginByComputerName()
    const userInfo = this.sessionManager.getUserInfo()

    if (!success || !userInfo) {
      await this.updateService.setUserContext(null)
      throw new ValidationError('无感登录失败：未找到匹配用户', 'VAL_INVALID_INPUT')
    }

    await this.updateService.setUserContext(userInfo.userType)

    const requiresUserSelection = userInfo.userType === 'Admin'
    log.info('Silent login successful', {
      username: userInfo.username,
      userType: userInfo.userType,
      requiresUserSelection
    })

    this.writeAuditLog('LOGIN', String(userInfo.id), {
      username: userInfo.username,
      computerName: hostname(),
      resource: 'ERP_SYSTEM',
      status: 'success',
      metadata: { loginType: 'silent', userType: userInfo.userType }
    })

    return {
      success: true,
      userInfo,
      requiresUserSelection
    }
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    if (!username || !password) {
      log.warn('Login attempt with missing credentials')
      throw new ValidationError('请输入用户名和密码', 'VAL_MISSING_REQUIRED')
    }

    log.info('Login attempt', { username })
    const success = await this.sessionManager.login(username, password)
    const userInfo = this.sessionManager.getUserInfo()

    if (!success || !userInfo) {
      this.writeAuditLog('LOGIN', '0', {
        username,
        computerName: hostname(),
        resource: 'ERP_SYSTEM',
        status: 'failure',
        metadata: { loginType: 'credentials', reason: 'invalid_credentials' }
      })

      log.warn('Login failed - invalid credentials', { username })
      await this.updateService.setUserContext(null)
      throw new ValidationError('用户名或密码错误', 'VAL_INVALID_INPUT')
    }

    log.info('Login successful', { username, userType: userInfo.userType })
    await this.updateService.setUserContext(userInfo.userType)

    this.writeAuditLog('LOGIN', String(userInfo.id), {
      username: userInfo.username,
      computerName: hostname(),
      resource: 'ERP_SYSTEM',
      status: 'success',
      metadata: { loginType: 'credentials', userType: userInfo.userType }
    })

    return {
      success: true,
      userInfo
    }
  }

  async logout(): Promise<void> {
    const userInfo = this.sessionManager.getUserInfo()
    log.info('User logout', { username: userInfo?.username })

    if (userInfo) {
      this.writeAuditLog('LOGOUT', String(userInfo.id), {
        username: userInfo.username,
        computerName: hostname(),
        resource: 'ERP_SYSTEM',
        status: 'success',
        metadata: { userType: userInfo.userType }
      })
    }

    this.sessionManager.logout()
    await this.updateService.setUserContext(null)
  }

  getCurrentUser(): CurrentUserResponse {
    const isAuthenticated = this.sessionManager.isAuthenticated()
    const userInfo = this.sessionManager.getUserInfo()

    return {
      isAuthenticated,
      userInfo: userInfo ?? undefined
    }
  }

  async getAllUsers(): Promise<UserInfo[]> {
    log.debug('Fetching all users for admin selection')
    return this.sessionManager.getAllUsers()
  }

  async switchUser(userInfo: UserInfo): Promise<UserSelectionResponse> {
    log.info('User switch attempt', { targetUser: userInfo.username })
    const success = this.sessionManager.switchUser(userInfo)

    if (!success) {
      log.warn('User switch failed')
      throw new ValidationError('用户切换失败', 'VAL_INVALID_INPUT')
    }

    const newUser = this.sessionManager.getUserInfo()
    log.info('User switch successful', { newUsername: newUser?.username })
    await this.updateService.setUserContext(newUser?.userType ?? null)

    return {
      success: true,
      userInfo: newUser ?? undefined
    }
  }

  isAdmin(): boolean {
    return this.sessionManager.isAdmin()
  }

  private writeAuditLog(
    action: 'LOGIN' | 'LOGOUT',
    actorId: string,
    payload: Parameters<typeof logAudit>[2]
  ): void {
    logAudit(action, actorId, payload).catch((err) =>
      log.warn('Failed to write audit log', { err })
    )
  }
}
