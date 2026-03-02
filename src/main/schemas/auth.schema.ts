/**
 * Zod schemas for Authentication module validation
 */

import { z } from 'zod'

/**
 * Schema for login request validation
 */
export const LoginRequestSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required')
})

export type LoginRequestZod = z.infer<typeof LoginRequestSchema>

/**
 * Schema for user info validation
 */
export const UserInfoSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1),
  userType: z.enum(['Admin', 'User', 'Guest']),
  computerName: z.string().optional()
})

export type UserInfoZod = z.infer<typeof UserInfoSchema>

/**
 * Validate login request
 */
export function validateLoginRequest(input: unknown): {
  success: boolean
  data?: LoginRequestZod
  error?: string
} {
  const result = LoginRequestSchema.safeParse(input)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return {
    success: false,
    error: result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
  }
}
