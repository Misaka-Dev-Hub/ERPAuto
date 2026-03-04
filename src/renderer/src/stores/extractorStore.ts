import { create } from 'zustand'

export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'system'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
}

export interface ExtractorProgress {
  message: string
  progress: number
}

export interface ExtractorState {
  isRunning: boolean
  progress: ExtractorProgress | null
  error: string | null
  logs: LogEntry[]
}

export interface ExtractorActions {
  setRunning: (isRunning: boolean) => void
  setProgress: (progress: ExtractorProgress | null) => void
  setError: (error: string | null) => void
  addLog: (level: LogLevel, message: string) => void
  clearLogs: () => void
  resetState: () => void
}

const initialState: ExtractorState = {
  isRunning: false,
  progress: null,
  error: null,
  logs: []
}

export const useExtractorStore = create<ExtractorState & ExtractorActions>((set) => ({
  ...initialState,

  setRunning: (isRunning: boolean) => set({ isRunning }),

  setProgress: (progress: ExtractorProgress | null) => set({ progress }),

  setError: (error: string | null) => set({ error }),

  addLog: (level: LogLevel, message: string) =>
    set((state) => {
      const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      return {
        logs: [...state.logs, { timestamp, level, message }]
      }
    }),

  clearLogs: () => set({ logs: [] }),

  resetState: () => set(initialState)
}))
