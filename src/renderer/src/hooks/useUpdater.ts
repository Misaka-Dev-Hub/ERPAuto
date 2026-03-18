import { useState, useEffect, useCallback } from 'react'

export interface ProgressInfo {
  total: number
  delta: number
  transferred: number
  percent: number
  bytesPerSecond: number
}

export interface UpdaterState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'
  available: boolean
  version: string | null
  progress: ProgressInfo | null
  channel: 'stable' | 'beta'
  availableChannels: string[]
  isAdmin: boolean
  error: string | null
}

export function useUpdater(): UpdaterState & {
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  cancelDownload: () => Promise<void>
  switchChannel: (channel: 'stable' | 'beta') => Promise<void>
  postponeInstall: () => void
} {
  const [state, setState] = useState<UpdaterState>({
    status: 'idle',
    available: false,
    version: null,
    progress: null,
    channel: 'stable',
    availableChannels: ['stable'],
    isAdmin: false,
    error: null
  })

  // Load initial status
  useEffect(() => {
    const loadStatus = async (): Promise<void> => {
      try {
        const [statusResult, channelResult, adminResult] = await Promise.all([
          window.electron.updater.getStatus(),
          window.electron.updater.getChannelInfo(),
          window.electron.auth.isAdmin()
        ])

        const isAdmin = adminResult.success ? !!adminResult.data : false

        setState((prev) => ({
          ...prev,
          status:
            statusResult.success && statusResult.data
              ? (statusResult.data.status as
                  | 'idle'
                  | 'checking'
                  | 'available'
                  | 'downloading'
                  | 'downloaded'
                  | 'error')
              : 'idle',
          version:
            statusResult.success && statusResult.data ? statusResult.data.version || null : null,
          progress:
            statusResult.success && statusResult.data ? statusResult.data.progress || null : null,
          channel:
            channelResult.success && channelResult.data
              ? (channelResult.data.channel as 'stable' | 'beta')
              : 'stable',
          availableChannels:
            channelResult.success && channelResult.data ? channelResult.data.available : ['stable'],
          isAdmin
        }))
      } catch (error) {
        console.error('Failed to load updater status', error)
      }
    }

    loadStatus()
  }, [])

  // Listen for IPC events
  useEffect(() => {
    const unsubChecking = window.electron.updater.onChecking(({ channel }) => {
      setState((prev) => ({
        ...prev,
        status: 'checking',
        channel: channel as 'stable' | 'beta',
        error: null
      }))
    })

    const unsubAvailable = window.electron.updater.onAvailable(({ version, channel }) => {
      setState((prev) => ({
        ...prev,
        status: 'available',
        available: true,
        version,
        channel: channel as 'stable' | 'beta',
        error: null
      }))
    })

    const unsubNotAvailable = window.electron.updater.onNotAvailable(() => {
      setState((prev) => ({ ...prev, status: 'idle', available: false, error: null }))
    })

    const unsubProgress = window.electron.updater.onProgress((progress) => {
      setState((prev) => ({ ...prev, status: 'downloading', progress, error: null }))
    })

    const unsubDownloaded = window.electron.updater.onDownloaded(({ version }) => {
      setState((prev) => ({ ...prev, status: 'downloaded', version, progress: null, error: null }))
    })

    const unsubError = window.electron.updater.onError(({ error }) => {
      setState((prev) => ({ ...prev, status: 'error', error }))
    })

    const unsubChannelChanged = window.electron.updater.onChannelChanged(({ channel }) => {
      setState((prev) => ({ ...prev, channel: channel as 'stable' | 'beta' }))
    })

    return () => {
      unsubChecking()
      unsubAvailable()
      unsubNotAvailable()
      unsubProgress()
      unsubDownloaded()
      unsubError()
      unsubChannelChanged()
    }
  }, [])

  const checkForUpdates = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'checking', error: null }))
    await window.electron.updater.check()
  }, [])

  const downloadUpdate = useCallback(async () => {
    await window.electron.updater.download()
  }, [])

  const installUpdate = useCallback(async () => {
    await window.electron.updater.install()
  }, [])

  const cancelDownload = useCallback(async () => {
    await window.electron.updater.cancel()
    setState((prev) => ({ ...prev, status: 'idle', progress: null }))
  }, [])

  const switchChannel = useCallback(async (channel: 'stable' | 'beta') => {
    setState((prev) => ({ ...prev, status: 'checking', error: null }))
    const result = await window.electron.updater.setChannel(channel)
    if (result.success) {
      setState((prev) => ({ ...prev, channel }))
    } else {
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: result.error || 'Failed to switch channel'
      }))
    }
  }, [])

  const postponeInstall = useCallback(() => {
    // Just keep downloaded status but hide notification by not triggering install
    // App component handles modal visibility
  }, [])

  return {
    ...state,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    cancelDownload,
    switchChannel,
    postponeInstall
  }
}
