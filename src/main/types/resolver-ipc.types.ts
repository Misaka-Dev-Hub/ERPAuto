import type { OrderMapping, ResolutionStats } from './order-resolver.types'

export interface ResolverInput {
  inputs: string[]
}

export interface ResolverResponse {
  success: boolean
  mappings?: OrderMapping[]
  validOrderNumbers?: string[]
  warnings?: string[]
  stats?: ResolutionStats
  error?: string
}
