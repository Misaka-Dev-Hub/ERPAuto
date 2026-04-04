import { describe, it, expect } from 'vitest'
import { CleanerService } from '../../src/main/services/erp/cleaner'
import { ErpAuthService } from '../../src/main/services/erp/erp-auth'
import type { ErpConfig } from '../../src/main/types/erp.types'
import fs from 'fs/promises'
import path from 'path'

describe('Cleaner Service (Integration)', () => {
  // For integration tests, use fixed test credentials or configure via config.yaml
  const config: ErpConfig = {
    url: '',
    username: '',
    password: ''
  }

  // Test data paths
  const productionIdFile = path.join(process.cwd(), '../references/demo/productionID.txt')
  const materialCodeFile = path.join(process.cwd(), '../references/demo/materialCode.txt')

  // Check if we have ERP credentials
  const hasCredentials = !!(config.url && config.username && config.password)

  describe('Dry-run mode', () => {
    it.skipIf(!hasCredentials)('should initialize with dry-run mode', async () => {
      const authService = new ErpAuthService(config)
      await authService.login()

      const cleaner = new CleanerService(authService, { dryRun: true })

      expect(cleaner.isDryRun()).toBe(true)

      await authService.close()
    }, 30000)

    it.skipIf(!hasCredentials)(
      'should track materials to delete without actually deleting (dry-run)',
      async () => {
        const authService = new ErpAuthService(config)
        await authService.login()

        // Read test data
        const orderContent = await fs.readFile(productionIdFile, 'utf-8')
        const orderNumbers = orderContent
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .slice(0, 2) // Test first 2 orders

        const materialContent = await fs.readFile(materialCodeFile, 'utf-8')
        const materialCodes = materialContent
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)

        console.log(
          `Testing dry-run with ${orderNumbers.length} orders and ${materialCodes.length} material codes`
        )

        const cleaner = new CleanerService(authService, { dryRun: true })

        const result = await cleaner.clean({
          orderNumbers,
          materialCodes,
          dryRun: true
        })

        // In dry-run mode, materialsDeleted should be tracked but not actually deleted
        console.log(`Dry-run result:`, {
          ordersProcessed: result.ordersProcessed,
          materialsDeleted: result.materialsDeleted,
          materialsSkipped: result.materialsSkipped,
          errors: result.errors.length
        })

        expect(result.ordersProcessed).toBeGreaterThan(0)
        // In dry-run, no actual deletions should happen
        expect(result.errors).toHaveLength(0)

        await authService.close()
      },
      120000
    )
  })

  describe('Order processing', () => {
    it.skipIf(!hasCredentials)('should process single order and return details', async () => {
      const authService = new ErpAuthService(config)
      await authService.login()

      const orderContent = await fs.readFile(productionIdFile, 'utf-8')
      const orderNumbers = orderContent
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, 1) // Test single order

      const cleaner = new CleanerService(authService, { dryRun: true })

      const result = await cleaner.clean({
        orderNumbers,
        materialCodes: [], // Empty list - nothing to delete
        dryRun: true
      })

      expect(result.ordersProcessed).toBe(1)
      expect(result.details).toHaveLength(1)
      expect(result.details[0].orderNumber).toBe(orderNumbers[0])

      await authService.close()
    }, 60000)

    it.skipIf(!hasCredentials)('should handle order with "审批通过" status', async () => {
      const authService = new ErpAuthService(config)
      await authService.login()

      const orderContent = await fs.readFile(productionIdFile, 'utf-8')
      const orderNumbers = orderContent
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, 1)

      const cleaner = new CleanerService(authService, { dryRun: true })

      const result = await cleaner.clean({
        orderNumbers,
        materialCodes: [],
        dryRun: true
      })

      // Order details should include status information
      const detail = result.details[0]
      console.log(
        `Order ${detail.orderNumber} - Materials deleted: ${detail.materialsDeleted}, Skipped: ${detail.materialsSkipped}`
      )

      expect(detail).toBeDefined()

      await authService.close()
    }, 60000)

    it.skipIf(!hasCredentials)('should handle multiple orders with progress callback', async () => {
      const authService = new ErpAuthService(config)
      await authService.login()

      const orderContent = await fs.readFile(productionIdFile, 'utf-8')
      const orderNumbers = orderContent
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, 3) // Test 3 orders

      const progressMessages: string[] = []

      const cleaner = new CleanerService(authService, { dryRun: true })

      const result = await cleaner.clean({
        orderNumbers,
        materialCodes: [],
        dryRun: true,
        onProgress: (message, progress) => {
          progressMessages.push(`${progress?.toFixed(0)}%: ${message}`)
        }
      })

      expect(result.ordersProcessed).toBe(3)
      expect(progressMessages.length).toBeGreaterThan(0)

      console.log('Progress messages:', progressMessages.slice(0, 5))

      await authService.close()
    }, 180000)
  })

  describe('Error handling', () => {
    it.skipIf(!hasCredentials)('should continue processing after order error', async () => {
      const authService = new ErpAuthService(config)
      await authService.login()

      const orderNumbers = ['INVALID_ORDER_12345', 'INVALID_ORDER_67890']

      const cleaner = new CleanerService(authService, { dryRun: true })

      const result = await cleaner.clean({
        orderNumbers,
        materialCodes: [],
        dryRun: true
      })

      // Should still process (even if with errors)
      expect(result.details.length).toBeGreaterThan(0)

      await authService.close()
    }, 120000)
  })

  describe('Navigation', () => {
    it.skipIf(!hasCredentials)(
      'should navigate to discrete production order maintenance page',
      async () => {
        const authService = new ErpAuthService(config)
        await authService.login()

        const cleaner = new CleanerService(authService, { dryRun: true })

        // This tests the internal navigation method
        const session = authService.getSession()
        const { popupPage, workFrame } = await cleaner.navigateToCleanerPage(session)

        expect(popupPage).toBeDefined()
        expect(workFrame).toBeDefined()

        // Cleanup
        await popupPage.close()
        await authService.close()
      },
      60000
    )
  })
})
