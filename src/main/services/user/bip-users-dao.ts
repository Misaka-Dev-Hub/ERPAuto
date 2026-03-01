/**
 * BIPUsers DAO - Data access object for user authentication and management
 *
 * Mirrors the Python BIPUsersDAO functionality:
 * - Authenticate users by username and password
 * - Authenticate by computer name (silent login)
 * - Get all users for admin user selection
 * - Create, update, delete users
 */

import { MySqlService } from '../database/mysql'
import type { UserInfo } from '../../types/user.types'

/**
 * Database configuration for BIPUsers table
 */
export const BIP_USERS_CONFIG = {
  /** Table name in SQL Server: [dbo].[BIPUsers] */
  TABLE_NAME_SQLSERVER: '[dbo].[BIPUsers]',
  /** Table name in MySQL: dbo_BIPUsers */
  TABLE_NAME_MYSQL: 'dbo_BIPUsers',
  /** Column names */
  COLUMNS: {
    ID: 'ID',
    USERNAME: 'UserName',
    USER_TYPE: 'UserType',
    PASSWORD: 'Password',
    COMPUTER_NAME: 'ComputerNmae', // Note: typo in database schema
    CREATE_TIME: 'CreateTime'
  }
} as const

/**
 * BIPUsers DAO Class
 */
export class BIPUsersDAO {
  private mysqlService: MySqlService | null = null

  /**
   * Get MySQL service instance
   */
  private async getMySqlService(): Promise<MySqlService> {
    if (this.mysqlService && this.mysqlService.isConnected()) {
      return this.mysqlService
    }

    this.mysqlService = new MySqlService({
      host: process.env.DB_MYSQL_HOST || 'localhost',
      port: parseInt(process.env.DB_MYSQL_PORT || '3306', 10),
      user: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || ''
    })

    await this.mysqlService.connect()
    return this.mysqlService
  }

  /**
   * Authenticate a user with username and password
   * @param username - The username to authenticate
   * @param password - The password to verify
   * @returns User info if authentication successful, null otherwise
   */
  async authenticate(username: string, password: string): Promise<UserInfo | null> {
    try {
      const mysqlService = await this.getMySqlService()

      const sql = `
        SELECT ID, UserName, UserType
        FROM ${BIP_USERS_CONFIG.TABLE_NAME_MYSQL}
        WHERE UserName = ? AND Password = ?
      `

      const result = await mysqlService.query(sql, [username, password])

      if (result.rows.length > 0) {
        const row = result.rows[0]
        return {
          id: row.ID as number,
          username: row.UserName as string,
          userType: row.UserType as 'Admin' | 'User' | 'Guest'
        }
      }
      return null
    } catch (error) {
      console.error('[BIPUsersDAO] Authenticate error:', error)
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
      const mysqlService = await this.getMySqlService()

      const sql = `
        SELECT ID, UserName, UserType
        FROM ${BIP_USERS_CONFIG.TABLE_NAME_MYSQL}
        WHERE ComputerNmae = ?
      `

      const result = await mysqlService.query(sql, [computerName])

      if (result.rows.length > 0) {
        const row = result.rows[0]
        return {
          id: row.ID as number,
          username: row.UserName as string,
          userType: row.UserType as 'Admin' | 'User' | 'Guest'
        }
      }
      return null
    } catch (error) {
      console.error('[BIPUsersDAO] Authenticate by computer name error:', error)
      return null
    }
  }

  /**
   * Get all users from the database
   * @returns List of user information
   */
  async getAllUsers(): Promise<UserInfo[]> {
    try {
      const mysqlService = await this.getMySqlService()

      const sql = `
        SELECT ID, UserName, UserType, CreateTime
        FROM ${BIP_USERS_CONFIG.TABLE_NAME_MYSQL}
        ORDER BY UserName
      `

      const result = await mysqlService.query(sql)

      return result.rows.map(row => ({
        id: row.ID as number,
        username: row.UserName as string,
        userType: row.UserType as 'Admin' | 'User' | 'Guest',
        createTime: row.CreateTime as Date | undefined
      }))
    } catch (error) {
      console.error('[BIPUsersDAO] Get all users error:', error)
      return []
    }
  }

  /**
   * Create a new user
   * @param username - The username (must be unique)
   * @param password - The password
   * @param userType - User type ('Admin', 'User', or 'Guest')
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
      const mysqlService = await this.getMySqlService()

      let sql: string
      let params: any[]

      if (computerName) {
        sql = `
          INSERT INTO ${BIP_USERS_CONFIG.TABLE_NAME_MYSQL}
          (UserName, Password, UserType, ComputerNmae)
          VALUES (?, ?, ?, ?)
        `
        params = [username, password, userType, computerName]
      } else {
        sql = `
          INSERT INTO ${BIP_USERS_CONFIG.TABLE_NAME_MYSQL}
          (UserName, Password, UserType)
          VALUES (?, ?, ?)
        `
        params = [username, password, userType]
      }

      await mysqlService.query(sql, params)
      return true
    } catch (error) {
      console.error('[BIPUsersDAO] Create user error:', error)
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
      const mysqlService = await this.getMySqlService()

      const sql = `
        UPDATE ${BIP_USERS_CONFIG.TABLE_NAME_MYSQL}
        SET UserType = ?
        WHERE UserName = ?
      `

      await mysqlService.query(sql, [userType, username])
      return true
    } catch (error) {
      console.error('[BIPUsersDAO] Update user type error:', error)
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
      const mysqlService = await this.getMySqlService()

      const sql = `
        UPDATE ${BIP_USERS_CONFIG.TABLE_NAME_MYSQL}
        SET Password = ?
        WHERE UserName = ?
      `

      await mysqlService.query(sql, [newPassword, username])
      return true
    } catch (error) {
      console.error('[BIPUsersDAO] Update password error:', error)
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
      const mysqlService = await this.getMySqlService()

      const sql = `
        DELETE FROM ${BIP_USERS_CONFIG.TABLE_NAME_MYSQL}
        WHERE UserName = ?
      `

      await mysqlService.query(sql, [username])
      return true
    } catch (error) {
      console.error('[BIPUsersDAO] Delete user error:', error)
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
      const mysqlService = await this.getMySqlService()

      const sql = `
        SELECT COUNT(*) as count
        FROM ${BIP_USERS_CONFIG.TABLE_NAME_MYSQL}
        WHERE UserName = ?
      `

      const result = await mysqlService.query(sql, [username])
      return result.rows.length > 0 && (result.rows[0].count as number) > 0
    } catch (error) {
      console.error('[BIPUsersDAO] User exists error:', error)
      return false
    }
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (this.mysqlService) {
      await this.mysqlService.disconnect()
      this.mysqlService = null
    }
  }
}
