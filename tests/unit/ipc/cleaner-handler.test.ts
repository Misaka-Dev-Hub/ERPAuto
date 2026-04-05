import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IPC_CHANNELS } from '../../../src/shared/ipc-channels'

// Mock logger to prevent real winston initialization and console noise
vi.mock('../../../src/main/services/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }),
  logError: vi.fn()
}))

vi.mock('../../../src/main/services/logger/error-utils', () => ({
  serializeError: (err: any) => err,
  sanitizeError: (err: any) => err
}))

// In-memory storage for registered IPC handlers
const registeredHandlers: Map<string, Function> = new Map()

// Mock Electron's ipcMain to capture registered handlers
vi.mock('electron', () => {
  return {
    app: {
      isPackaged: false,
      getVersion: () => '1.0.0-test'
    },
    ipcMain: {
      handle: (channel: string, listener: any) => {
        registeredHandlers.set(channel, listener)
      }
    }
  }
})

// Mock CleanerApplicationService to isolate IPC layer
vi.doMock('../../../src/main/services/cleaner/cleaner-application-service', () => {
  return {
    CleanerApplicationService: class {
      async runCleaner(_eventSender: any, input: any) {
        const count = input?.orderNumbers?.length ?? 0
        return {
          ordersProcessed: count,
          materialsDeleted: count,
          materialsSkipped: 0,
          errors: [],
          details: [],
          retriedOrders: 0,
          successfulRetries: 0
        } as any
      }
      async exportResults(_input: any) {
        return { success: true, filePath: '/tmp/results.txt' } as any
      }
    }
  }
})

// Load IPC handler module after mocks are in place
describe('Cleaner IPC Handler', () => {
  beforeEach(() => {
    registeredHandlers.clear()
  })

  it('should register and handle cleaner:execute (CLEANER_RUN) IPC call', async () => {
    const mod = await import('../../../src/main/ipc/cleaner-handler')
    mod.registerCleanerHandlers()

    const handler = registeredHandlers.get(IPC_CHANNELS.CLEANER_RUN)
    expect(handler).toBeDefined()
    expect(typeof handler).toBe('function')

    const event: any = { sender: { id: 'renderer-1' } }
    const input: any = {
      orderNumbers: ['SC1', 'SC2'],
      materialCodes: [],
      dryRun: false,
      queryBatchSize: 100,
      processConcurrency: 1,
      onProgress: vi.fn()
    }

    const result = await (handler as any)(event, input)
    expect(result.success).toBe(true)
    expect(result.data.ordersProcessed).toBe(2)
  })

  it('should handle cleaner:run with dryRun true', async () => {
    const mod = await import('../../../src/main/ipc/cleaner-handler')
    mod.registerCleanerHandlers()

    const handler = registeredHandlers.get(IPC_CHANNELS.CLEANER_RUN)
    expect(handler).toBeDefined()

    const event: any = { sender: { id: 'renderer-2' } }
    const input: any = {
      orderNumbers: ['SC1'],
      materialCodes: [],
      dryRun: true,
      queryBatchSize: 50,
      processConcurrency: 1,
      onProgress: vi.fn()
    }
    const result = await (handler as any)(event, input)
    expect(result.success).toBe(true)
    expect(result.data.ordersProcessed).toBe(1)
  })

  it('should return { success: false } when runCleaner throws', async () => {
    vi.resetModules()
    vi.doMock('../../../src/main/services/cleaner/cleaner-application-service', () => {
      return {
        CleanerApplicationService: class {
          async runCleaner() {
            throw new Error('boom')
          }
        }
      }
    })
    const mod = await import('../../../src/main/ipc/cleaner-handler')
    mod.registerCleanerHandlers()

    const handler = registeredHandlers.get(IPC_CHANNELS.CLEANER_RUN)
    expect(handler).toBeDefined()

    const event: any = { sender: { id: 'renderer-3' } }
    const input: any = {
      orderNumbers: ['SC1'],
      materialCodes: [],
      dryRun: false,
      queryBatchSize: 20,
      processConcurrency: 1,
      onProgress: vi.fn()
    }
    const result = await (handler as any)(event, input)
    expect(result.success).toBe(false)
    expect(result.error).toBe('boom')
  })

  it('should register and handle cleaner:exportResults (CLEANER_EXPORT_RESULTS) IPC call', async () => {
    vi.resetModules()
    vi.doMock('../../../src/main/services/cleaner/cleaner-application-service', () => {
      return {
        CleanerApplicationService: class {
          async exportResults(items: any[]) {
            return {
              success: true,
              filePath: '/tmp/exported.xlsx',
              recordCount: items.length
            } as any
          }
        }
      }
    })
    const mod = await import('../../../src/main/ipc/cleaner-handler')
    mod.registerCleanerHandlers()

    const handler = registeredHandlers.get(IPC_CHANNELS.CLEANER_EXPORT_RESULTS)
    expect(handler).toBeDefined()
    expect(typeof handler).toBe('function')

    const event: any = { sender: { id: 'renderer-4' } }
    const items = [
      { materialCode: 'M1', materialName: 'Mat A' },
      { materialCode: 'M2', materialName: 'Mat B' }
    ]

    const result = await (handler as any)(event, items)
    expect(result.success).toBe(true)
    expect(result.data.recordCount).toBe(2)
  })

  it('should return { success: false } when exportResults throws', async () => {
    vi.resetModules()
    vi.doMock('../../../src/main/services/cleaner/cleaner-application-service', () => {
      return {
        CleanerApplicationService: class {
          async exportResults() {
            throw new Error('export failed')
          }
        }
      }
    })
    const mod = await import('../../../src/main/ipc/cleaner-handler')
    mod.registerCleanerHandlers()

    const handler = registeredHandlers.get(IPC_CHANNELS.CLEANER_EXPORT_RESULTS)
    const event: any = { sender: { id: 'renderer-5' } }
    const result = await (handler as any)(event, [])
    expect(result.success).toBe(false)
    expect(result.error).toBe('export failed')
  })
})
