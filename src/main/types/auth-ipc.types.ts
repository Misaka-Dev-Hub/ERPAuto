import type { UserInfo } from './user.types'

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  success: boolean
  userInfo?: UserInfo
  error?: string
}

export interface SilentLoginResponse {
  success: boolean
  userInfo?: UserInfo
  requiresUserSelection?: boolean
  error?: string
}

export interface UserSelectionResponse {
  success: boolean
  userInfo?: UserInfo
  error?: string
}

export interface CurrentUserResponse {
  isAuthenticated: boolean
  userInfo?: UserInfo
}
