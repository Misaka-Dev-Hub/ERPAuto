/**
 * User ERP Configuration Service
 *
 * Manages ERP configuration (URL, username, password) stored in the BIPUsers table.
 * Each user can have their own ERP credentials.
 *
 * Features:
 * - Get current user's ERP config
 * - Update current user's ERP config
 * - Get ERP config for any user (admin only)
 */

import { BIPUsersDAO } from './bip-users-dao'
import { SessionManager } from './session-manager'
import { createLogger } from '../logger'

const log = createLogger('UserErpConfigService')

/**
 * ERP Configuration object
 */
export interface ErpConfig {
  url: string
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
   * @returns ERP configuration or null if not found
   */
  async getCurrentUserErpConfig(): Promise<ErpConfig | null> {
    try {
      const sessionManager = SessionManager.getInstance()
      const currentUser = sessionManager.getUserInfo()

      if (!currentUser) {
        log.warn('No authenticated user found')
        return null
      }

      log.info('Fetching ERP config for user', { username: currentUser.username })
      const config = await this.dao.getUserErpConfig(currentUser.username)

      if (!config) {
        log.warn('No ERP config found for user', { username: currentUser.username })
        return null
      }

      log.info('ERP config retrieved successfully', {
        username: currentUser.username,
        hasUrl: !!config.url,
        hasUsername: !!config.username,
        hasPassword: !!config.password
      })

      return config
    } catch (error) {
      log.error('Error getting current user ERP config', { error })
      return null
    }
  }

  /**
   * Get ERP configuration for a specific user (admin only)
   * @param username - The username to get ERP config for
   * @returns ERP configuration or null if not found
   */
  async getUserErpConfig(username: string): Promise<ErpConfig | null> {
    try {
      log.info('Fetching ERP config for user', { username })
      const config = await this.dao.getUserErpConfig(username)

      if (!config) {
        log.warn('No ERP config found for user', { username })
        return null
      }

      return config
    } catch (error) {
      log.error('Error getting user ERP config', { error })
      return null
    }
  }

  /**
   * Update ERP configuration for the current authenticated user
   * @param config - ERP configuration to save
   * @returns True if successful
   */
  async updateCurrentUserErpConfig(config: ErpConfig): Promise<boolean> {
    try {
      const sessionManager = SessionManager.getInstance()
      const currentUser = sessionManager.getUserInfo()

      if (!currentUser) {
        log.warn('No authenticated user found')
        return false
      }

      log.info('Updating ERP config for user', { username: currentUser.username })
      const success = await this.dao.updateUserErpConfig(
        currentUser.username,
        config.url,
        config.username,
        config.password
      )

      if (success) {
        log.info('ERP config updated successfully', { username: currentUser.username })
      } else {
        log.error('Failed to update ERP config', { username: currentUser.username })
      }

      return success
    } catch (error) {
      log.error('Error updating current user ERP config', { error })
      return false
    }
  }

  /**
   * Update ERP configuration for a specific user (admin only)
   * @param username - The username to update ERP config for
   * @param config - ERP configuration to save
   * @returns True if successful
   */
  async updateUserErpConfig(username: string, config: ErpConfig): Promise<boolean> {
    try {
      log.info('Updating ERP config for user', { username })
      const success = await this.dao.updateUserErpConfig(
        username,
        config.url,
        config.username,
        config.password
      )

      if (success) {
        log.info('ERP config updated successfully', { username })
      } else {
        log.error('Failed to update ERP config', { username })
      }

      return success
    } catch (error) {
      log.error('Error updating user ERP config', { error })
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
