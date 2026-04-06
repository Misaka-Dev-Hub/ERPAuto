import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UserFactory } from '../../../fixtures/factory'
import { AuthApplicationService } from '../../../../src/main/services/auth/auth-application-service'

// Mock logger to prevent real winston initialization and console noise
vi.mock('../../../../src/main/services/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }),
  setLogLevel: vi.fn(),
  applyLoggingConfig: vi.fn(),
  run: (_fn: () => Promise<any>, _ctx?: any) => _fn(),
  getRequestId: () => undefined,
  getContext: () => undefined
}))

vi.mock('../../../../src/main/services/logger/request-context', () => ({
  run: (_fn: () => Promise<any>, _ctx?: any) => _fn(),
  getRequestId: () => undefined,
  getContext: () => undefined,
  withContext: (_fn: () => Promise<any>, _overrides?: any) => _fn()
}))

vi.mock('../../../../src/main/services/logger/audit-logger', () => ({
  logAudit: vi.fn()
}))

describe('AuthApplicationService', () => {
  let service: AuthApplicationService
  let mockSessionManager: any
  let mockUpdateService: any

  beforeEach(() => {
    mockSessionManager = {
      login: vi.fn(),
      loginByComputerName: vi.fn(),
      getUserInfo: vi.fn(),
      isAuthenticated: vi.fn(),
      logout: vi.fn(),
      getAllUsers: vi.fn(),
      switchUser: vi.fn(),
      isAdmin: vi.fn()
    }
    mockUpdateService = {
      setUserContext: vi.fn()
    }
    service = new AuthApplicationService(mockSessionManager, mockUpdateService)
  })

  describe('login', () => {
    it('should throw ValidationError when username is empty', async () => {
      await expect(service.login('', 'password')).rejects.toThrow('请输入用户名和密码')
    })

    it('should throw ValidationError when password is empty', async () => {
      await expect(service.login('admin', '')).rejects.toThrow('请输入用户名和密码')
    })

    it('should log in admin user and set update context', async () => {
      const user = UserFactory.createAdmin()
      mockSessionManager.login.mockResolvedValue(true)
      mockSessionManager.getUserInfo.mockReturnValue({
        id: user.id,
        username: user.username,
        userType: user.userType
      })
      mockSessionManager.isAuthenticated.mockReturnValue(true)

      await service.login(user.username, 'password')

      expect(mockSessionManager.login).toHaveBeenCalledWith(user.username, 'password')
      expect(mockUpdateService.setUserContext).toHaveBeenCalledWith(user.userType)
      const current = service.getCurrentUser()
      expect(current.isAuthenticated).toBe(true)
      expect(current.userInfo?.username).toBe(user.username)
    })

    it('should log in regular user and set update context', async () => {
      const user = UserFactory.createUserDefault()
      mockSessionManager.login.mockResolvedValue(true)
      mockSessionManager.getUserInfo.mockReturnValue({
        id: user.id,
        username: user.username,
        userType: user.userType
      })
      mockSessionManager.isAuthenticated.mockReturnValue(true)

      await service.login(user.username, 'password')

      expect(mockSessionManager.login).toHaveBeenCalledWith(user.username, 'password')
      expect(mockUpdateService.setUserContext).toHaveBeenCalledWith(user.userType)
    })

    it('should reject with ValidationError when credentials are invalid', async () => {
      const user = UserFactory.createAdmin()
      mockSessionManager.login.mockResolvedValue(false)
      mockSessionManager.getUserInfo.mockReturnValue(null)

      await expect(service.login(user.username, 'wrong')).rejects.toThrow('用户名或密码错误')
      expect(mockUpdateService.setUserContext).toHaveBeenCalledWith(null)
    })

    it('should reject on network error', async () => {
      const user = UserFactory.createUserDefault()
      mockSessionManager.login.mockRejectedValue(new Error('Network error'))
      await expect(service.login(user.username, 'password')).rejects.toThrow('Network error')
    })
  })

  describe('silentLogin', () => {
    it('should succeed when computer name matches a user', async () => {
      const user = UserFactory.createAdmin()
      mockSessionManager.loginByComputerName.mockResolvedValue(true)
      mockSessionManager.getUserInfo.mockReturnValue({
        id: user.id,
        username: user.username,
        userType: user.userType
      })

      const result = await service.silentLogin()

      expect(result.success).toBe(true)
      expect(result.userInfo?.username).toBe(user.username)
      expect(mockUpdateService.setUserContext).toHaveBeenCalledWith(user.userType)
    })

    it('should throw ValidationError when no matching user found', async () => {
      mockSessionManager.loginByComputerName.mockResolvedValue(false)
      mockSessionManager.getUserInfo.mockReturnValue(null)

      await expect(service.silentLogin()).rejects.toThrow('无感登录失败')
      expect(mockUpdateService.setUserContext).toHaveBeenCalledWith(null)
    })

    it('should deduplicate concurrent silentLogin calls', async () => {
      const user = UserFactory.createUserDefault()
      let resolveLogin: (value: boolean) => void
      mockSessionManager.loginByComputerName.mockImplementation(
        () =>
          new Promise<boolean>((resolve) => {
            resolveLogin = resolve
          })
      )
      mockSessionManager.getUserInfo.mockReturnValue({
        id: user.id,
        username: user.username,
        userType: user.userType
      })

      const promise1 = service.silentLogin()
      const promise2 = service.silentLogin()

      resolveLogin!(true)

      const [result1, result2] = await Promise.all([promise1, promise2])
      expect(result1).toBe(result2)
      expect(mockSessionManager.loginByComputerName).toHaveBeenCalledTimes(1)
    })
  })

  describe('logout', () => {
    it('should log out and clear session', async () => {
      const user = UserFactory.createAdmin()
      mockSessionManager.login.mockResolvedValue(true)
      mockSessionManager.getUserInfo.mockReturnValue({
        id: user.id,
        username: user.username,
        userType: user.userType
      })
      mockSessionManager.isAuthenticated.mockReturnValue(true)

      await service.login(user.username, 'password')
      await service.logout()

      expect(mockSessionManager.logout).toHaveBeenCalled()
      expect(mockUpdateService.setUserContext).toHaveBeenCalledWith(null)
    })

    it('should handle logout gracefully when not logged in', async () => {
      mockSessionManager.isAuthenticated.mockReturnValue(false)
      mockSessionManager.getUserInfo.mockReturnValue(null)
      await service.logout()
      expect(mockSessionManager.logout).toHaveBeenCalled()
      expect(mockUpdateService.setUserContext).toHaveBeenCalledWith(null)
    })
  })

  describe('getCurrentUser', () => {
    it('should return unauthenticated state before login', () => {
      mockSessionManager.isAuthenticated.mockReturnValue(false)
      mockSessionManager.getUserInfo.mockReturnValue(null)
      const current = service.getCurrentUser()
      expect(current.isAuthenticated).toBe(false)
      expect(current.userInfo).toBeUndefined()
    })

    it('should return authenticated state after login', async () => {
      const user = UserFactory.createAdmin()
      mockSessionManager.login.mockResolvedValue(true)
      mockSessionManager.getUserInfo.mockReturnValue({
        id: user.id,
        username: user.username,
        userType: user.userType
      })
      mockSessionManager.isAuthenticated.mockReturnValue(true)

      await service.login(user.username, 'password')
      const current = service.getCurrentUser()
      expect(current.isAuthenticated).toBe(true)
      expect(current.userInfo?.username).toBe(user.username)
    })
  })

  describe('getAllUsers', () => {
    it('should delegate to session manager', async () => {
      const users = [UserFactory.createAdmin(), UserFactory.createUserDefault()]
      mockSessionManager.getAllUsers.mockResolvedValue(users)

      const result = await service.getAllUsers()

      expect(mockSessionManager.getAllUsers).toHaveBeenCalled()
      expect(result).toEqual(users)
    })
  })

  describe('switchUser', () => {
    it('should switch user and update context', async () => {
      const admin = UserFactory.createAdmin()
      const targetUser = UserFactory.createUserDefault()
      mockSessionManager.switchUser.mockReturnValue(true)
      mockSessionManager.getUserInfo.mockReturnValue({
        id: targetUser.id,
        username: targetUser.username,
        userType: targetUser.userType
      })

      const result = await service.switchUser(targetUser)

      expect(result.success).toBe(true)
      expect(result.userInfo?.username).toBe(targetUser.username)
      expect(mockSessionManager.switchUser).toHaveBeenCalledWith(targetUser)
      expect(mockUpdateService.setUserContext).toHaveBeenCalledWith(targetUser.userType)
    })

    it('should throw ValidationError when switch fails', async () => {
      const targetUser = UserFactory.createUserDefault()
      mockSessionManager.switchUser.mockReturnValue(false)

      await expect(service.switchUser(targetUser)).rejects.toThrow('用户切换失败')
    })
  })

  describe('isAdmin', () => {
    it('should delegate to session manager', () => {
      mockSessionManager.isAdmin.mockReturnValue(true)
      expect(service.isAdmin()).toBe(true)

      mockSessionManager.isAdmin.mockReturnValue(false)
      expect(service.isAdmin()).toBe(false)
    })
  })

  describe('authentication state transitions', () => {
    it('should reflect full lifecycle: unauthenticated → authenticated → expired', async () => {
      const user = UserFactory.createAdmin()
      mockSessionManager.isAuthenticated.mockReturnValue(false)
      mockSessionManager.getUserInfo.mockReturnValue(null)
      expect(service.getCurrentUser().isAuthenticated).toBe(false)

      mockSessionManager.login.mockResolvedValue(true)
      mockSessionManager.getUserInfo.mockReturnValue({
        id: user.id,
        username: user.username,
        userType: user.userType
      })
      mockSessionManager.isAuthenticated.mockReturnValue(true)
      await service.login(user.username, 'password')
      expect(service.getCurrentUser().isAuthenticated).toBe(true)

      // Simulate token expiry
      mockSessionManager.isAuthenticated.mockReturnValue(false)
      const current = service.getCurrentUser()
      expect(current.isAuthenticated).toBe(false)
      expect(current.userInfo).toBeDefined()
    })
  })
})
