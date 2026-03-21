import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../src/shared/ipc-channels'

const handleMock = vi.fn()
const withErrorHandlingMock = vi.fn(async (handler: () => Promise<unknown>) => {
  const data = await handler()
  return { success: true, data }
})

const serviceMethods = {
  runCleaner: vi.fn(async (_sender: unknown, input: unknown) => ({ success: true, input })),
  exportResults: vi.fn(async (items: unknown[]) => ({ success: true, total: items.length }))
}

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock
  }
}))

vi.mock('../../src/main/ipc/index', () => ({
  withErrorHandling: withErrorHandlingMock
}))

vi.mock('../../src/main/services/cleaner/cleaner-application-service', () => ({
  CleanerApplicationService: class {
    runCleaner = serviceMethods.runCleaner
    exportResults = serviceMethods.exportResults
  }
}))

describe('registerCleanerHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers cleaner IPC handlers and forwards the sender to the application service', async () => {
    const { registerCleanerHandlers } = await import('../../src/main/ipc/cleaner-handler')
    const sender = { id: 99 }
    const event = { sender }
    const input = { orderNumbers: ['MO-001'] }

    registerCleanerHandlers()

    expect(handleMock).toHaveBeenCalledTimes(2)
    expect(handleMock).toHaveBeenCalledWith(IPC_CHANNELS.CLEANER_RUN, expect.any(Function))

    const runHandler = handleMock.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.CLEANER_RUN
    )?.[1]

    const result = await runHandler?.(event, input)

    expect(serviceMethods.runCleaner).toHaveBeenCalledWith(sender, input)
    expect(result).toEqual({
      success: true,
      data: { success: true, input }
    })
  })

  it('forwards export requests to the cleaner application service', async () => {
    const { registerCleanerHandlers } = await import('../../src/main/ipc/cleaner-handler')
    const items = [{ id: '1' }, { id: '2' }]

    registerCleanerHandlers()

    const exportHandler = handleMock.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.CLEANER_EXPORT_RESULTS
    )?.[1]

    await exportHandler?.({}, items)

    expect(serviceMethods.exportResults).toHaveBeenCalledWith(items)
  })
})
