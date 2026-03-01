/**
 * User types and interfaces
 */

/**
 * User type enumeration
 */
export type UserType = 'Admin' | 'User' | 'Guest'

/**
 * User information interface
 */
export interface UserInfo {
  /** User ID */
  id: number
  /** Username */
  username: string
  /** User type */
  userType: UserType
  /** Create time */
  createTime?: Date
}

/**
 * User session interface
 */
export interface UserSession {
  /** Current authenticated user */
  user: UserInfo | null
  /** Session token (optional for future use) */
  token?: string
  /** Login timestamp */
  loginTime: Date
  /** Whether session is active */
  isActive: boolean
}
