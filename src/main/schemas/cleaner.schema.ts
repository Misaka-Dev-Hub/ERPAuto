/**
 * Zod schemas for Cleaner module validation
 */

import { z } from 'zod'

/**
 * Schema for cleaner input validation
 */
export const CleanerInputSchema = z.object({
  orderNumbers: z
    .array(z.string().min(1, 'Order number cannot be empty'))
    .min(1, 'At least one order number is required'),
  materialCodes: z.array(z.string().min(1, 'Material code cannot be empty')),
  dryRun: z.boolean()
  // Note: onProgress is a function, not validated via Zod
})

export type CleanerInputZod = z.infer<typeof CleanerInputSchema>

/**
 * Schema for cleaner result validation
 */
export const CleanerResultSchema = z.object({
  processedCount: z.number().int().nonnegative(),
  errors: z.array(z.string())
})

export type CleanerResultZod = z.infer<typeof CleanerResultSchema>

/**
 * Validate cleaner input
 */
export function validateCleanerInput(input: unknown): {
  success: boolean
  data?: CleanerInputZod
  error?: string
} {
  const result = CleanerInputSchema.safeParse(input)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return {
    success: false,
    error: result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
  }
}
