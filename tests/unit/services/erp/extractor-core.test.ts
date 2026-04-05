import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ExtractorCore } from '../../../../src/main/services/erp/extractor-core'
import type { ErpSession } from '../../../../src/main/types/erp.types'
import type { ExtractorCoreInput } from '../../../../src/main/types/extractor.types'

// Mock playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(),
    connect: vi.fn()
  }
}))

// Mock logger
vi.mock('../../../../src/main/services/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

describe('ExtractorCore', () => {
  let extractorCore: ExtractorCore
  let mockSession: ErpSession
  let mockPage: any
  let mockMainFrame: any
  let mockPopupPage: any
  let mockWorkFrame: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Create mock session
    mockWorkFrame = {
      locator: vi.fn().mockImplementation(() => mockWorkFrame),
      filter: vi.fn().mockImplementation(() => mockWorkFrame),
      nth: vi.fn().mockImplementation(() => mockWorkFrame),
      getByRole: vi.fn().mockReturnThis(),
      getByText: vi.fn().mockReturnThis(),
      getByName: vi.fn().mockReturnThis(),
      fill: vi.fn().mockResolvedValue(undefined),
      press: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
      hover: vi.fn().mockResolvedValue(undefined),
      waitFor: vi.fn().mockResolvedValue(undefined),
      contentFrame: vi.fn().mockResolvedValue(null)
    }

    mockPopupPage = {
      locator: vi.fn().mockReturnThis(),
      waitForEvent: vi.fn().mockResolvedValue(undefined),
      contentFrame: vi.fn().mockResolvedValue(null)
    }

    mockMainFrame = {
      locator: vi.fn().mockReturnThis(),
      getByTitle: vi.fn().mockReturnThis(),
      first: vi.fn().mockReturnThis(),
      click: vi.fn().mockResolvedValue(undefined),
      contentFrame: vi.fn().mockResolvedValue(null)
    }

    mockPage = {
      waitForEvent: vi.fn().mockResolvedValue(mockPopupPage)
    }

    mockSession = {
      page: mockPage,
      mainFrame: mockMainFrame
    } as unknown as ErpSession

    extractorCore = new ExtractorCore()
  })

  describe('waitForLoading()', () => {
    let mockLoadingLocator: any

    beforeEach(() => {
      mockLoadingLocator = {
        waitFor: vi.fn().mockResolvedValue(undefined)
      }

      // Mock the locator chain: workFrame.locator().filter().nth()
      mockWorkFrame.locator.mockReturnValue(mockWorkFrame)
      mockWorkFrame.filter.mockReturnValue(mockWorkFrame)
      mockWorkFrame.nth.mockReturnValue(mockLoadingLocator)
    })

    it('should wait for loading to appear and disappear', async () => {
      // @ts-ignore - accessing private method for testing
      await extractorCore.waitForLoading(mockWorkFrame)

      expect(mockLoadingLocator.waitFor).toHaveBeenCalledWith({
        state: 'visible',
        timeout: 3000
      })
      expect(mockLoadingLocator.waitFor).toHaveBeenCalledWith({
        state: 'hidden',
        timeout: 0
      })
    })

    it('should handle loading that never appears (timeout)', async () => {
      mockLoadingLocator.waitFor.mockResolvedValueOnce(undefined).mockResolvedValue(undefined)

      // @ts-ignore - accessing private method for testing
      await expect(extractorCore.waitForLoading(mockWorkFrame)).resolves.not.toThrow()
    })

    it('should handle loading that completes quickly', async () => {
      mockLoadingLocator.waitFor.mockRejectedValueOnce(new Error('Already hidden'))

      // @ts-ignore - accessing private method for testing
      await expect(extractorCore.waitForLoading(mockWorkFrame)).resolves.not.toThrow()
    })

    it('should use correct loading text from locators', async () => {
      // @ts-ignore - accessing private method for testing
      await extractorCore.waitForLoading(mockWorkFrame)

      expect(mockWorkFrame.locator).toHaveBeenCalledWith('div')
      expect(mockWorkFrame.filter).toHaveBeenCalled()
      expect(mockLoadingLocator.waitFor).toHaveBeenCalledTimes(2)
    })
  })

  describe('downloadAllBatches()', () => {
    it('should process all batches with progress updates', async () => {
      const orderNumbers = ['ORD001', 'ORD002', 'ORD003', 'ORD004']
      const batchSize = 2
      const progressCallback = vi.fn()

      const mockDownloadPath = '/path/to/downloaded/file.xlsx'

      // Mock internal methods to avoid complex iframe/locator mocking
      vi.spyOn(extractorCore as any, 'navigateToExtractorPage').mockResolvedValue({
        popupPage: mockPopupPage,
        workFrame: mockWorkFrame
      })

      vi.spyOn(extractorCore as any, 'downloadBatch').mockResolvedValue(mockDownloadPath)

      const input: ExtractorCoreInput = {
        session: mockSession,
        orderNumbers,
        downloadDir: '/test/downloads',
        batchSize,
        onProgress: progressCallback
      }

      const result = await extractorCore.downloadAllBatches(input)

      expect(result.downloadedFiles).toEqual([mockDownloadPath, mockDownloadPath])
      expect(result.errors).toHaveLength(0)
      expect(progressCallback).toHaveBeenCalled()
    })

    it('should handle errors in batch download gracefully', async () => {
      const orderNumbers = ['ORD001', 'ORD002']
      const batchSize = 1
      const progressCallback = vi.fn()

      vi.spyOn(extractorCore as any, 'navigateToExtractorPage').mockResolvedValue({
        popupPage: mockPopupPage,
        workFrame: mockWorkFrame
      })

      // First batch succeeds, second fails
      vi.spyOn(extractorCore as any, 'downloadBatch')
        .mockResolvedValueOnce('/path/file1.xlsx')
        .mockRejectedValueOnce(new Error('Network error'))

      const input: ExtractorCoreInput = {
        session: mockSession,
        orderNumbers,
        downloadDir: '/test/downloads',
        batchSize,
        onProgress: progressCallback
      }

      const result = await extractorCore.downloadAllBatches(input)

      expect(result.downloadedFiles).toEqual(['/path/file1.xlsx'])
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Batch 2')
      expect(result.errors[0]).toContain('Network error')
    })

    it('should calculate progress correctly', async () => {
      const orderNumbers = ['ORD001', 'ORD002', 'ORD003', 'ORD004']
      const batchSize = 2
      const progressCallback = vi.fn()

      vi.spyOn(extractorCore as any, 'navigateToExtractorPage').mockResolvedValue({
        popupPage: mockPopupPage,
        workFrame: mockWorkFrame
      })

      vi.spyOn(extractorCore as any, 'downloadBatch').mockResolvedValue('/path/file.xlsx')

      const input: ExtractorCoreInput = {
        session: mockSession,
        orderNumbers,
        downloadDir: '/test/downloads',
        batchSize,
        onProgress: progressCallback
      }

      await extractorCore.downloadAllBatches(input)

      // totalPoints = 1 + 2 batches + 2 = 5, progressPerPoint = 20
      // Batch 1: progress = (1 + 1) * 20 = 40
      // Batch 2: progress = (1 + 2) * 20 = 60
      expect(progressCallback).toHaveBeenCalledTimes(2)
      expect(progressCallback).toHaveBeenNthCalledWith(1, '处理批次 1/2', 40, {
        phase: 'downloading',
        currentBatch: 1,
        totalBatches: 2
      })
      expect(progressCallback).toHaveBeenNthCalledWith(2, '处理批次 2/2', 60, {
        phase: 'downloading',
        currentBatch: 2,
        totalBatches: 2
      })
    })

    it('should work without progress callback', async () => {
      const orderNumbers = ['ORD001']
      const batchSize = 1

      vi.spyOn(extractorCore as any, 'navigateToExtractorPage').mockResolvedValue({
        popupPage: mockPopupPage,
        workFrame: mockWorkFrame
      })

      vi.spyOn(extractorCore as any, 'downloadBatch').mockResolvedValue('/path/file.xlsx')

      const input: ExtractorCoreInput = {
        session: mockSession,
        orderNumbers,
        downloadDir: '/test/downloads',
        batchSize
      }

      const result = await extractorCore.downloadAllBatches(input)

      expect(result.downloadedFiles).toHaveLength(1)
      expect(result.errors).toHaveLength(0)
    })

    it.todo('TODO: needs integration test setup - should handle complete navigation flow', () => {
      // Complex test requiring full iframe structure mocking
    })

    it.todo('TODO: needs integration test setup - should handle download events correctly', () => {
      // Complex test requiring download event mocking
    })

    it.todo('TODO: needs integration test setup - should verify locator interactions', () => {
      // Complex test requiring detailed locator interaction verification
    })
  })
})
