export interface OrderMapping {
  input: string
  productionId?: string
  orderNumber?: string
  resolved: boolean
  error?: string
}

export type OrderNumberType = 'productionId' | 'orderNumber' | 'unknown'

export interface ResolutionStats {
  totalInputs: number
  validOrderNumbers: number
  validProductionIds: number
  resolvedCount: number
  failedCount: number
  unknownFormat: number
}
