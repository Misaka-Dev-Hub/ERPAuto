/**
 * Zod schemas for Extractor module validation
 */

import { z } from 'zod'

/**
 * Schema for extractor input validation
 */
export const ExtractorInputSchema = z.object({
  orderNumbers: z
    .array(z.string().min(1, 'Order number cannot be empty'))
    .min(1, 'At least one order number is required'),
  batchSize: z.number().int().positive().optional().default(10)
  // Note: onProgress is a function, not validated via Zod
})

export type ExtractorInputZod = z.infer<typeof ExtractorInputSchema>

/**
 * Schema for extractor result validation
 */
export const ExtractorResultSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())),
  errors: z.array(z.string())
})

export type ExtractorResultZod = z.infer<typeof ExtractorResultSchema>

/**
 * Validate extractor input
 */
export function validateExtractorInput(input: unknown): {
  success: boolean
  data?: ExtractorInputZod
  error?: string
} {
  const result = ExtractorInputSchema.safeParse(input)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return {
    success: false,
    error: result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
  }
}
