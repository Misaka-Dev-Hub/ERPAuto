/**
 * User ERP Configuration Service
 *
 * Manages ERP credentials (username, password) stored in the BIPUsers table.
 * Each user can have their own ERP credentials.
 * ERP URL is fixed and stored in config.yaml.
 *
 * Features:
 * - Get current user's ERP credentials
 * - Update current user's ERP credentials
 * - Get ERP credentials for any user (admin only)
 */

import { BIPUsersDAO } from './bip-users-dao'
import { SessionManager } from './session-manager'
import { createLogger } from '../logger'

const log = createLogger('UserErpConfigService')

/**
 * ERP Credentials object (username and password only)
 */
export interface ErpCredentials {
  username: string
  password: string
}

/**
 * User ERP Configuration Service Class
 */
export class UserErpConfigService {
  private static instance: UserErpConfigService | null = null
  private dao: BIPUsersDAO

  private constructor() {
    this.dao = new BIPUsersDAO()
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): UserErpConfigService {
    if (UserErpConfigService.instance === null) {
      UserErpConfigService.instance = new UserErpConfigService()
    }
    return UserErpConfigService.instance
  }

  /**
   * Get ERP configuration for the current authenticated user
   * @returns ERP credentials or null if not found
   */
  async getCurrentUserErpConfig(): Promise<ErpCredentials | null> {
    try {
      const sessionManager = SessionManager.getInstance()
      const currentUser = sessionManager.getUserInfo()

      if (!currentUser) {
        log.warn('No authenticated user found')
        return null
      }

      log.info('Fetching ERP credentials for user', { username: currentUser.username })
      const config = await this.dao.getUserErpCredentials(currentUser.username)

      if (!config) {
        log.warn('No ERP credentials found for user', { username: currentUser.username })
        return null
      }

      log.info('ERP credentials retrieved successfully', {
        username: currentUser.username,
        hasUsername: !!config.username,
        hasPassword: !!config.password
      })

      return config
    } catch (error) {
      log.error('Error getting current user ERP credentials', { error })
      return null
    }
  }

  /**
   * Get ERP credentials for a specific user (admin only)
   * @param username - The username to get ERP credentials for
   * @returns ERP credentials or null if not found
   */
  async getUserErpConfig(username: string): Promise<ErpCredentials | null> {
    try {
      log.info('Fetching ERP credentials for user', { username })
      const config = await this.dao.getUserErpCredentials(username)

      if (!config) {
        log.warn('No ERP credentials found for user', { username })
        return null
      }

      return config
    } catch (error) {
      log.error('Error getting user ERP credentials', { error })
      return null
    }
  }

  /**
   * Update ERP credentials for the current authenticated user
   * @param credentials - ERP credentials to save
   * @returns True if successful
   */
  async updateCurrentUserErpConfig(credentials: ErpCredentials): Promise<boolean> {
    try {
      const sessionManager = SessionManager.getInstance()
      const currentUser = sessionManager.getUserInfo()

      if (!currentUser) {
        log.warn('No authenticated user found')
        return false
      }

      log.info('Updating ERP credentials for user', { username: currentUser.username })
      const success = await this.dao.updateUserErpCredentials(
        currentUser.username,
        credentials.username,
        credentials.password
      )

      if (success) {
        log.info('ERP credentials updated successfully', { username: currentUser.username })
      } else {
        log.error('Failed to update ERP credentials', { username: currentUser.username })
      }

      return success
    } catch (error) {
      log.error('Error updating current user ERP credentials', { error })
      return false
    }
  }

  /**
   * Update ERP credentials for a specific user (admin only)
   * @param username - The username to update ERP credentials for
   * @param credentials - ERP credentials to save
   * @returns True if successful
   */
  async updateUserErpConfig(username: string, credentials: ErpCredentials): Promise<boolean> {
    try {
      log.info('Updating ERP credentials for user', { username })
      const success = await this.dao.updateUserErpCredentials(
        username,
        credentials.username,
        credentials.password
      )

      if (success) {
        log.info('ERP credentials updated successfully', { username })
      } else {
        log.error('Failed to update ERP credentials', { username })
      }

      return success
    } catch (error) {
      log.error('Error updating user ERP credentials', { error })
      return false
    }
  }

  /**
   * Get ERP configuration for all users (admin only, for migration/audit)
   * @returns List of users with their ERP configurations
   */
  async getAllUsersErpConfig(): Promise<
    Array<{
      username: string
      erpUrl: string
      erpUsername: string
    }>
  > {
    try {
      log.info('Fetching ERP config for all users')
      const configs = await this.dao.getAllUsersErpConfig()
      log.info('Retrieved ERP configs for all users', { count: configs.length })
      return configs
    } catch (error) {
      log.error('Error getting all users ERP config', { error })
      return []
    }
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    await this.dao.disconnect()
  }
}
