import { describe, expect, it, vi } from 'vitest'

const mockSend = vi.fn()
const mockGetAllWindows = vi.fn(() => [
  { webContents: { send: mockSend } },
  { webContents: { send: mockSend } }
])

vi.mock('electron', async () => {
  const actual = await vi.importActual<typeof import('electron')>('electron')
  return {
    ...actual,
    BrowserWindow: {
      getAllWindows: mockGetAllWindows
    }
  }
})

describe('update-status-publisher', () => {
  it('broadcasts status to all renderer windows', async () => {
    const { publishUpdateStatus } =
      await import('../../src/main/services/update/update-status-publisher')

    publishUpdateStatus({
      enabled: true,
      supported: true,
      phase: 'checking',
      currentVersion: '1.0.0',
      currentChannel: 'stable',
      currentUserType: 'Admin'
    })

    expect(mockGetAllWindows).toHaveBeenCalledTimes(1)
    expect(mockSend).toHaveBeenCalledTimes(2)
  })
})
