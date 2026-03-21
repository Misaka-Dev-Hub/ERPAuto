/**
 * User Session Manager - Singleton pattern for managing authenticated user session
 *
 * Mimics the Python SessionManager functionality:
 * - Singleton pattern to maintain user state throughout application lifecycle
 * - Support for username/password authentication
 * - Support for silent login by computer name
 * - Admin user can switch to other users
 */

import type { UserInfo } from '../../types/user.types'

/**
 * Session Manager Class
 */
export class SessionManager {
  private static instance: SessionManager | null = null
  private currentUser: UserInfo | null = null
  private originalAdminUser: UserInfo | null = null
  private initialized: boolean = false

  private constructor() {
    if (this.initialized) {
      return
    }
    this.initialized = true
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): SessionManager {
    if (SessionManager.instance === null) {
      SessionManager.instance = new SessionManager()
    }
    return SessionManager.instance
  }

  /**
   * Authenticate and login a user
   * @param username - The username to authenticate
   * @param password - The password to verify
   * @returns True if login successful, false otherwise
   */
  public async login(username: string, password: string): Promise<boolean> {
    let dao: InstanceType<(typeof import('./bip-users-dao'))['BIPUsersDAO']> | null = null
    try {
      const { BIPUsersDAO } = await import('./bip-users-dao')
      dao = new BIPUsersDAO()
      const userInfo = await dao.authenticate(username, password)

      if (userInfo) {
        this.currentUser = {
          id: userInfo.id,
          username: userInfo.username,
          userType: userInfo.userType
        }
        return true
      }
      return false
    } catch (error) {
      console.error('[SessionManager] Login error:', error)
      return false
    } finally {
      if (dao) {
        await dao.disconnect().catch((error) => {
          console.error('[SessionManager] Login disconnect error:', error)
        })
      }
    }
  }

  /**
   * Attempt silent login using computer name
   * @returns True if login successful, false otherwise
   */
  public async loginByComputerName(): Promise<boolean> {
    let dao: InstanceType<(typeof import('./bip-users-dao'))['BIPUsersDAO']> | null = null
    try {
      const { BIPUsersDAO } = await import('./bip-users-dao')
      const { hostname } = await import('os')
      dao = new BIPUsersDAO()
      const computerName = hostname()
      const userInfo = await dao.authenticateByComputerName(computerName)

      if (userInfo) {
        this.currentUser = {
          id: userInfo.id,
          username: userInfo.username,
          userType: userInfo.userType
        }
        return true
      }
      return false
    } catch (error) {
      console.error('[SessionManager] Silent login error:', error)
      return false
    } finally {
      if (dao) {
        await dao.disconnect().catch((error) => {
          console.error('[SessionManager] Silent login disconnect error:', error)
        })
      }
    }
  }

  /**
   * Logout the current user and clear session
   */
  public logout(): void {
    this.currentUser = null
    this.originalAdminUser = null
  }

  /**
   * Check if a user is currently authenticated
   */
  public isAuthenticated(): boolean {
    return this.currentUser !== null
  }

  /**
   * Check if the current user is an admin
   */
  public isAdmin(): boolean {
    return this.currentUser?.userType === 'Admin'
  }

  /**
   * Check if the current user is a guest
   */
  public isGuest(): boolean {
    return this.currentUser?.userType === 'Guest'
  }

  /**
   * Get the current username
   */
  public getUsername(): string | null {
    return this.currentUser?.username ?? null
  }

  /**
   * Get the current user type
   */
  public getUserType(): string | null {
    return this.currentUser?.userType ?? null
  }

  /**
   * Get all current user information
   */
  public getUserInfo(): UserInfo | null {
    return this.currentUser
  }

  /**
   * Switch to a different user (Admin only feature)
   * @param userInfo - User info to switch to
   * @returns True if switch successful
   */
  public switchUser(userInfo: UserInfo): boolean {
    if (!this.currentUser) {
      return false
    }

    // Store original admin user for reference
    if (!this.originalAdminUser) {
      this.originalAdminUser = { ...this.currentUser }
    }

    this.currentUser = {
      id: userInfo.id,
      username: userInfo.username,
      userType: userInfo.userType
    }
    return true
  }

  /**
   * Get the original Admin user before any user switch
   */
  public getOriginalAdmin(): UserInfo | null {
    return this.originalAdminUser
  }

  /**
   * Get all users from database (for Admin user selection)
   */
  public async getAllUsers(): Promise<UserInfo[]> {
    let dao: InstanceType<(typeof import('./bip-users-dao'))['BIPUsersDAO']> | null = null
    try {
      const { BIPUsersDAO } = await import('./bip-users-dao')
      dao = new BIPUsersDAO()
      return await dao.getAllUsers()
    } catch (error) {
      console.error('[SessionManager] Get all users error:', error)
      return []
    } finally {
      if (dao) {
        await dao.disconnect().catch((error) => {
          console.error('[SessionManager] Get all users disconnect error:', error)
        })
      }
    }
  }
}
