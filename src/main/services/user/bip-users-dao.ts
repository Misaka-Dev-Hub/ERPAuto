/**
 * BIPUsers DAO - Data access object for user authentication and management
 *
 * Mirrors the Python BIPUsersDAO functionality:
 * - Authenticate users by username and password
 * - Authenticate by computer name (silent login)
 * - Get all users for admin user selection
 * - Create, update, delete users
 */

import { create, type IDatabaseService } from '../database/index'
import { createDialect, type SqlDialect } from '../database/dialects'
import type { UserInfo } from '../../types/user.types'
import { createLogger, logError } from '../logger'

const log = createLogger('BipUsersDao')

/**
 * Database configuration for BIPUsers table
 */
export const BIP_USERS_CONFIG = {
  /** Column names */
  COLUMNS: {
    ID: 'ID',
    USERNAME: 'UserName',
    USER_TYPE: 'UserType',
    PASSWORD: 'Password',
    COMPUTER_NAME: 'ComputerName',
    CREATE_TIME: 'CreateTime',
    // ERP Configuration columns
    ERP_URL: 'ERP_URL',
    ERP_USERNAME: 'ERP_Username',
    ERP_PASSWORD: 'ERP_Password'
  }
} as const

/**
 * BIPUsers DAO Class
 */
export class BIPUsersDAO {
  private dbService: IDatabaseService | null = null
  private dialect: SqlDialect | null = null

  /**
   * Get the appropriate table name based on database type
   */
  private getTableName(): string {
    return this.getDialect().quoteTableName('dbo', 'BIPUsers')
  }

  /**
   * Get dialect instance
   */
  private getDialect(): SqlDialect {
    if (!this.dialect) {
      this.dialect = createDialect(this.dbService!.type)
    }
    return this.dialect
  }

  /**
   * Get database service instance via DatabaseFactory
   */
  private async getDatabaseService(): Promise<IDatabaseService> {
    if (this.dbService && this.dbService.isConnected()) {
      return this.dbService
    }

    this.dbService = await create()
    this.dialect = null // Reset dialect when service changes
    return this.dbService
  }

  /**
   * Authenticate a user with username and password
   * @param username - The username to authenticate
   * @param password - The password to verify
   * @returns User info if authentication successful, null otherwise
   */
  async authenticate(username: string, password: string): Promise<UserInfo | null> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      const sqlString = `
        SELECT ID, UserName, UserType
        FROM ${tableName}
        WHERE UserName = ${dialect.param(0)} AND Password = ${dialect.param(1)}
      `

      const result = await dbService.query(sqlString, [username, password])

      if (result.rows.length > 0) {
        const row = result.rows[0]
        return {
          id: row.ID as number,
          username: row.UserName as string,
          userType: row.UserType as 'Admin' | 'User'
        }
      }
      return null
    } catch (error) {
      logError(log, error, {
        message: 'Authenticate failed',
        operation: 'authenticate',
        context: { username, dbType: this.dbService?.type }
      })
      return null
    }
  }

  /**
   * Authenticate a user using computer name (silent login)
   * @param computerName - The computer name to authenticate
   * @returns User info if authentication successful, null otherwise
   */
  async authenticateByComputerName(computerName: string): Promise<UserInfo | null> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      const sqlString = `
        SELECT ID, UserName, UserType
        FROM ${tableName}
        WHERE ComputerName = ${dialect.param(0)}
      `

      const result = await dbService.query(sqlString, [computerName])

      if (result.rows.length > 0) {
        const row = result.rows[0]
        return {
          id: row.ID as number,
          username: row.UserName as string,
          userType: row.UserType as 'Admin' | 'User'
        }
      }
      return null
    } catch (error) {
      logError(log, error, {
        message: 'Silent login failed',
        operation: 'authenticateByComputerName',
        context: { computerName, dbType: this.dbService?.type }
      })
      return null
    }
  }

  /**
   * Get all users from the database
   * @returns List of user information
   */
  async getAllUsers(): Promise<UserInfo[]> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      const sqlString = `
        SELECT ID, UserName, UserType, CreateTime
        FROM ${tableName}
        ORDER BY UserName
      `

      const result = await dbService.query(sqlString)

      return result.rows.map((row) => ({
        id: row.ID as number,
        username: row.UserName as string,
        userType: row.UserType as 'Admin' | 'User',
        createTime: row.CreateTime as Date | undefined
      }))
    } catch (error) {
      logError(log, error, {
        message: 'Get all users failed',
        operation: 'getAllUsers',
        context: { dbType: this.dbService?.type }
      })
      return []
    }
  }

  /**
   * Create a new user
   * @param username - The username (must be unique)
   * @param password - The password
   * @param userType - User type ('Admin' or 'User')
   * @param computerName - Optional computer name for silent login
   * @returns True if successful
   */
  async createUser(
    username: string,
    password: string,
    userType: string,
    computerName: string = ''
  ): Promise<boolean> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      let sqlString: string
      let params: string[]

      if (computerName) {
        sqlString = `
          INSERT INTO ${tableName}
          (UserName, Password, UserType, ComputerName)
          VALUES (${dialect.param(0)}, ${dialect.param(1)}, ${dialect.param(2)}, ${dialect.param(3)})
        `
        params = [username, password, userType, computerName]
      } else {
        sqlString = `
          INSERT INTO ${tableName}
          (UserName, Password, UserType)
          VALUES (${dialect.param(0)}, ${dialect.param(1)}, ${dialect.param(2)})
        `
        params = [username, password, userType]
      }

      await dbService.query(sqlString, params)
      return true
    } catch (error) {
      logError(log, error, {
        message: 'Create user failed',
        operation: 'createUser',
        context: { username, userType, dbType: this.dbService?.type }
      })
      return false
    }
  }

  /**
   * Update a user's type
   * @param username - The username to update
   * @param userType - New user type
   * @returns True if successful
   */
  async updateUserType(username: string, userType: string): Promise<boolean> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      const sqlString = `
        UPDATE ${tableName}
        SET UserType = ${dialect.param(0)}
        WHERE UserName = ${dialect.param(1)}
      `

      await dbService.query(sqlString, [userType, username])
      return true
    } catch (error) {
      logError(log, error, {
        message: 'Update user type failed',
        operation: 'updateUserType',
        context: { username, userType, dbType: this.dbService?.type }
      })
      return false
    }
  }

  /**
   * Update a user's password
   * @param username - The username to update
   * @param newPassword - The new password
   * @returns True if successful
   */
  async updatePassword(username: string, newPassword: string): Promise<boolean> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      const sqlString = `
        UPDATE ${tableName}
        SET Password = ${dialect.param(0)}
        WHERE UserName = ${dialect.param(1)}
      `

      await dbService.query(sqlString, [newPassword, username])
      return true
    } catch (error) {
      logError(log, error, {
        message: 'Update password failed',
        operation: 'updatePassword',
        context: { username, dbType: this.dbService?.type }
      })
      return false
    }
  }

  /**
   * Delete a user
   * @param username - The username to delete
   * @returns True if successful
   */
  async deleteUser(username: string): Promise<boolean> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      const sqlString = `
        DELETE FROM ${tableName}
        WHERE UserName = ${dialect.param(0)}
      `

      await dbService.query(sqlString, [username])
      return true
    } catch (error) {
      logError(log, error, {
        message: 'Delete user failed',
        operation: 'deleteUser',
        context: { username, dbType: this.dbService?.type }
      })
      return false
    }
  }

  /**
   * Check if a username already exists
   * @param username - The username to check
   * @returns True if username exists
   */
  async userExists(username: string): Promise<boolean> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()

      const sqlString = `
        SELECT COUNT(*) as count
        FROM ${tableName}
        WHERE UserName = ${dialect.param(0)}
      `

      const result = await dbService.query(sqlString, [username])
      return result.rows.length > 0 && (result.rows[0].count as number) > 0
    } catch (error) {
      logError(log, error, {
        message: 'Check user exists failed',
        operation: 'userExists',
        context: { username, dbType: this.dbService?.type }
      })
      return false
    }
  }

  /**
   * Get ERP credentials for a user (username and password only, URL is from config.yaml)
   * @param username - The username to get ERP credentials for
   * @returns ERP credentials object or null if not found
   */
  async getUserErpCredentials(username: string): Promise<{
    username: string
    password: string
  } | null> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()
      const cols = BIP_USERS_CONFIG.COLUMNS

      const sqlString = `
        SELECT ${cols.ERP_USERNAME}, ${cols.ERP_PASSWORD}
        FROM ${tableName}
        WHERE UserName = ${dialect.param(0)}
      `

      const result = await dbService.query(sqlString, [username])

      if (result.rows.length > 0) {
        const row = result.rows[0]
        return {
          username: (row[cols.ERP_USERNAME] as string) || '',
          password: (row[cols.ERP_PASSWORD] as string) || ''
        }
      }
      return null
    } catch (error) {
      logError(log, error, {
        message: 'Get user ERP credentials failed',
        operation: 'getUserErpCredentials',
        context: { username, dbType: this.dbService?.type }
      })
      return null
    }
  }

  /**
   * Update ERP credentials for a user (username and password only, URL is from config.yaml)
   * @param username - The username to update ERP credentials for
   * @param erpUsername - The ERP username
   * @param erpPassword - The ERP password
   * @returns True if successful
   */
  async updateUserErpCredentials(
    username: string,
    erpUsername: string,
    erpPassword: string
  ): Promise<boolean> {
    try {
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const dialect = this.getDialect()
      const cols = BIP_USERS_CONFIG.COLUMNS

      const sqlString = `
        UPDATE ${tableName}
        SET ${cols.ERP_USERNAME} = ${dialect.param(0)},
            ${cols.ERP_PASSWORD} = ${dialect.param(1)}
        WHERE UserName = ${dialect.param(2)}
      `

      await dbService.query(sqlString, [erpUsername, erpPassword, username])
      return true
    } catch (error) {
      logError(log, error, {
        message: 'Update user ERP credentials failed',
        operation: 'updateUserErpCredentials',
        context: { username, dbType: this.dbService?.type }
      })
      return false
    }
  }

  /**
   * Get ERP configuration for all users (for migration/audit purposes)
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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()
      const cols = BIP_USERS_CONFIG.COLUMNS

      const sqlString = `
        SELECT ${cols.USERNAME}, ${cols.ERP_URL}, ${cols.ERP_USERNAME}
        FROM ${tableName}
        ORDER BY ${cols.USERNAME}
      `

      const result = await dbService.query(sqlString)

      return result.rows.map((row) => ({
        username: row[cols.USERNAME] as string,
        erpUrl: (row[cols.ERP_URL] as string) || '',
        erpUsername: (row[cols.ERP_USERNAME] as string) || ''
      }))
    } catch (error) {
      logError(log, error, {
        message: 'Get all users ERP config failed',
        operation: 'getAllUsersErpConfig',
        context: { dbType: this.dbService?.type }
      })
      return []
    }
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (this.dbService) {
      await this.dbService.disconnect()
      this.dbService = null
      this.dialect = null
    }
  }
}
