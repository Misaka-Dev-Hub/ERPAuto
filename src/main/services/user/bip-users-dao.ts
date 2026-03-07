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
import { SqlServerService } from '../database/sql-server'
import { ConfigManager } from '../config/config-manager'
import sql from 'mssql'
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
  private mysqlService: MySqlService | null = null
  private sqlServerService: SqlServerService | null = null
  private dbType: 'mysql' | 'sqlserver' = 'mysql'
  private configManager: ConfigManager

  /**
   * Constructor - get database type from ConfigManager
   */
  constructor() {
    this.configManager = ConfigManager.getInstance()
    this.dbType = this.configManager.getDatabaseType()
  }

  /**
   * Get the appropriate table name based on database type
   */
  private getTableName(): string {
    return this.dbType === 'sqlserver'
      ? BIP_USERS_CONFIG.TABLE_NAME_SQLSERVER
      : BIP_USERS_CONFIG.TABLE_NAME_MYSQL
  }

  /**
   * Get database service instance (MySQL or SQL Server)
   */
  private async getDatabaseService(): Promise<MySqlService | SqlServerService> {
    const config = this.configManager.getConfig()

    if (this.dbType === 'sqlserver') {
      if (this.sqlServerService && this.sqlServerService.isConnected()) {
        return this.sqlServerService
      }

      const dbConfig = config.database.sqlserver
      this.sqlServerService = new SqlServerService({
        server: dbConfig.server,
        port: dbConfig.port,
        user: dbConfig.username,
        password: dbConfig.password,
        database: dbConfig.database,
        options: {
          encrypt: false,
          trustServerCertificate: dbConfig.trustServerCertificate
        }
      })

      await this.sqlServerService.connect()
      return this.sqlServerService
    } else {
      if (this.mysqlService && this.mysqlService.isConnected()) {
        return this.mysqlService
      }

      const dbConfig = config.database.mysql
      this.mysqlService = new MySqlService({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.username,
        password: dbConfig.password,
        database: dbConfig.database
      })

      await this.mysqlService.connect()
      return this.mysqlService
    }
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

      if (this.dbType === 'sqlserver') {
        const sqlString = `
          SELECT ID, UserName, UserType
          FROM ${tableName}
          WHERE UserName = @username AND Password = @password
        `

        const result = await (dbService as SqlServerService).queryWithParams(sqlString, {
          username: { value: username, type: sql.NVarChar(255) },
          password: { value: password, type: sql.NVarChar(255) }
        })

        if (result.rows.length > 0) {
          const row = result.rows[0]
          return {
            id: row.ID as number,
            username: row.UserName as string,
            userType: row.UserType as 'Admin' | 'User' | 'Guest'
          }
        }
        return null
      } else {
        const sqlString = `
          SELECT ID, UserName, UserType
          FROM ${tableName}
          WHERE UserName = ? AND Password = ?
        `

        const result = await (dbService as MySqlService).query(sqlString, [username, password])

        if (result.rows.length > 0) {
          const row = result.rows[0]
          return {
            id: row.ID as number,
            username: row.UserName as string,
            userType: row.UserType as 'Admin' | 'User' | 'Guest'
          }
        }
        return null
      }
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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      if (this.dbType === 'sqlserver') {
        const sqlString = `
          SELECT ID, UserName, UserType
          FROM ${tableName}
          WHERE ComputerName = @computerName
        `

        const result = await (dbService as SqlServerService).queryWithParams(sqlString, {
          computerName: { value: computerName, type: sql.NVarChar(255) }
        })

        if (result.rows.length > 0) {
          const row = result.rows[0]
          return {
            id: row.ID as number,
            username: row.UserName as string,
            userType: row.UserType as 'Admin' | 'User' | 'Guest'
          }
        }
        return null
      } else {
        const sqlString = `
          SELECT ID, UserName, UserType
          FROM ${tableName}
          WHERE ComputerName = ?
        `

        const result = await (dbService as MySqlService).query(sqlString, [computerName])

        if (result.rows.length > 0) {
          const row = result.rows[0]
          return {
            id: row.ID as number,
            username: row.UserName as string,
            userType: row.UserType as 'Admin' | 'User' | 'Guest'
          }
        }
        return null
      }
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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      const sqlString = `
        SELECT ID, UserName, UserType, CreateTime
        FROM ${tableName}
        ORDER BY UserName
      `

      const result =
        this.dbType === 'sqlserver'
          ? await (dbService as SqlServerService).query(sqlString)
          : await (dbService as MySqlService).query(sqlString)

      return result.rows.map((row) => ({
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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      if (this.dbType === 'sqlserver') {
        let sqlString: string
        let params: Record<
          string,
          {
            value: unknown
            type?: sql.ISqlType | sql.ISqlTypeFactoryWithLength | sql.ISqlTypeWithLength
          }
        >

        if (computerName) {
          sqlString = `
            INSERT INTO ${tableName}
            (UserName, Password, UserType, ComputerName)
            VALUES (@username, @password, @userType, @computerName)
          `
          params = {
            username: { value: username, type: sql.NVarChar(255) },
            password: { value: password, type: sql.NVarChar(255) },
            userType: { value: userType, type: sql.NVarChar(255) },
            computerName: { value: computerName, type: sql.NVarChar(255) }
          }
        } else {
          sqlString = `
            INSERT INTO ${tableName}
            (UserName, Password, UserType)
            VALUES (@username, @password, @userType)
          `
          params = {
            username: { value: username, type: sql.NVarChar(255) },
            password: { value: password, type: sql.NVarChar(255) },
            userType: { value: userType, type: sql.NVarChar(255) }
          }
        }

        await (dbService as SqlServerService).queryWithParams(sqlString, params)
        return true
      } else {
        let sqlString: string
        let params: unknown[]

        if (computerName) {
          sqlString = `
            INSERT INTO ${tableName}
            (UserName, Password, UserType, ComputerName)
            VALUES (?, ?, ?, ?)
          `
          params = [username, password, userType, computerName]
        } else {
          sqlString = `
            INSERT INTO ${tableName}
            (UserName, Password, UserType)
            VALUES (?, ?, ?)
          `
          params = [username, password, userType]
        }

        await (dbService as MySqlService).query(sqlString, params)
        return true
      }
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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      if (this.dbType === 'sqlserver') {
        const sqlString = `
          UPDATE ${tableName}
          SET UserType = @userType
          WHERE UserName = @username
        `

        await (dbService as SqlServerService).queryWithParams(sqlString, {
          username: { value: username, type: sql.NVarChar(255) },
          userType: { value: userType, type: sql.NVarChar(255) }
        })
        return true
      } else {
        const sqlString = `
          UPDATE ${tableName}
          SET UserType = ?
          WHERE UserName = ?
        `

        await (dbService as MySqlService).query(sqlString, [userType, username])
        return true
      }
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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      if (this.dbType === 'sqlserver') {
        const sqlString = `
          UPDATE ${tableName}
          SET Password = @newPassword
          WHERE UserName = @username
        `

        await (dbService as SqlServerService).queryWithParams(sqlString, {
          username: { value: username, type: sql.NVarChar(255) },
          newPassword: { value: newPassword, type: sql.NVarChar(255) }
        })
        return true
      } else {
        const sqlString = `
          UPDATE ${tableName}
          SET Password = ?
          WHERE UserName = ?
        `

        await (dbService as MySqlService).query(sqlString, [newPassword, username])
        return true
      }
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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      if (this.dbType === 'sqlserver') {
        const sqlString = `
          DELETE FROM ${tableName}
          WHERE UserName = @username
        `

        await (dbService as SqlServerService).queryWithParams(sqlString, {
          username: { value: username, type: sql.NVarChar(255) }
        })
        return true
      } else {
        const sqlString = `
          DELETE FROM ${tableName}
          WHERE UserName = ?
        `

        await (dbService as MySqlService).query(sqlString, [username])
        return true
      }
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
      const dbService = await this.getDatabaseService()
      const tableName = this.getTableName()

      if (this.dbType === 'sqlserver') {
        const sqlString = `
          SELECT COUNT(*) as count
          FROM ${tableName}
          WHERE UserName = @username
        `

        const result = await (dbService as SqlServerService).queryWithParams(sqlString, {
          username: { value: username, type: sql.NVarChar(255) }
        })
        return result.rows.length > 0 && (result.rows[0].count as number) > 0
      } else {
        const sqlString = `
          SELECT COUNT(*) as count
          FROM ${tableName}
          WHERE UserName = ?
        `

        const result = await (dbService as MySqlService).query(sqlString, [username])
        return result.rows.length > 0 && (result.rows[0].count as number) > 0
      }
    } catch (error) {
      console.error('[BIPUsersDAO] User exists error:', error)
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
      const cols = BIP_USERS_CONFIG.COLUMNS

      if (this.dbType === 'sqlserver') {
        const sqlString = `
          SELECT ${cols.ERP_USERNAME}, ${cols.ERP_PASSWORD}
          FROM ${tableName}
          WHERE UserName = @username
        `

        const result = await (dbService as SqlServerService).queryWithParams(sqlString, {
          username: { value: username, type: sql.NVarChar(255) }
        })

        if (result.rows.length > 0) {
          const row = result.rows[0]
          return {
            username: (row[cols.ERP_USERNAME] as string) || '',
            password: (row[cols.ERP_PASSWORD] as string) || ''
          }
        }
        return null
      } else {
        const sqlString = `
          SELECT ${cols.ERP_USERNAME}, ${cols.ERP_PASSWORD}
          FROM ${tableName}
          WHERE UserName = ?
        `

        const result = await (dbService as MySqlService).query(sqlString, [username])

        if (result.rows.length > 0) {
          const row = result.rows[0]
          return {
            username: (row[cols.ERP_USERNAME] as string) || '',
            password: (row[cols.ERP_PASSWORD] as string) || ''
          }
        }
        return null
      }
    } catch (error) {
      console.error('[BIPUsersDAO] Get user ERP credentials error:', error)
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
      const cols = BIP_USERS_CONFIG.COLUMNS

      if (this.dbType === 'sqlserver') {
        const sqlString = `
          UPDATE ${tableName}
          SET ${cols.ERP_USERNAME} = @erpUsername,
              ${cols.ERP_PASSWORD} = @erpPassword
          WHERE UserName = @username
        `

        await (dbService as SqlServerService).queryWithParams(sqlString, {
          username: { value: username, type: sql.NVarChar(255) },
          erpUsername: { value: erpUsername, type: sql.NVarChar(255) },
          erpPassword: { value: erpPassword, type: sql.NVarChar(255) }
        })
        return true
      } else {
        const sqlString = `
          UPDATE ${tableName}
          SET ${cols.ERP_USERNAME} = ?,
              ${cols.ERP_PASSWORD} = ?
          WHERE UserName = ?
        `

        await (dbService as MySqlService).query(sqlString, [erpUsername, erpPassword, username])
        return true
      }
    } catch (error) {
      console.error('[BIPUsersDAO] Update user ERP credentials error:', error)
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

      const result =
        this.dbType === 'sqlserver'
          ? await (dbService as SqlServerService).query(sqlString)
          : await (dbService as MySqlService).query(sqlString)

      return result.rows.map((row) => ({
        username: row[cols.USERNAME] as string,
        erpUrl: (row[cols.ERP_URL] as string) || '',
        erpUsername: (row[cols.ERP_USERNAME] as string) || ''
      }))
    } catch (error) {
      console.error('[BIPUsersDAO] Get all users ERP config error:', error)
      return []
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
    if (this.sqlServerService) {
      await this.sqlServerService.disconnect()
      this.sqlServerService = null
    }
  }
}
