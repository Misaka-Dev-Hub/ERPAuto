/**
 * Order and Material Factory Unit Tests
 *
 * Tests for OrderFactory and MaterialFactory fixture generation.
 */

import { describe, it, expect } from 'vitest'
import { OrderFactory, MaterialFactory } from './factory'
import type { Order, Material } from './types'

describe('OrderFactory', () => {
  describe('createOrder', () => {
    it('should create an order with auto-generated order number in SC format', () => {
      const order = OrderFactory.createOrder()

      expect(order.orderNumber).toMatch(/^SC\d{8}$/)
    })

    it('should support overrides to customize order properties', () => {
      const customOrder: Partial<Order> = {
        orderNumber: 'SC202501001',
        productName: 'Custom Product',
        plannedQuantity: 500
      }

      const order = OrderFactory.createOrder(customOrder)

      expect(order.orderNumber).toBe('SC202501001')
      expect(order.productName).toBe('Custom Product')
      expect(order.plannedQuantity).toBe(500)
    })
  })
})

describe('MaterialFactory', () => {
  describe('createMaterial', () => {
    it('should create a material with auto-generated code in TEST_MAT_XXXXXX format', () => {
      const material = MaterialFactory.createMaterial()

      expect(material.code).toMatch(/^TEST_MAT_[A-Z0-9]{6}$/)
    })

    it('should support overrides to customize material properties', () => {
      const customMaterial: Partial<Material> = {
        code: 'M001',
        description: 'Custom Material',
        quantity: 250
      }

      const material = MaterialFactory.createMaterial(customMaterial)

      expect(material.code).toBe('M001')
      expect(material.description).toBe('Custom Material')
      expect(material.quantity).toBe(250)
    })
  })
})
