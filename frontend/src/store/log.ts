import { create } from 'zustand'

export type LogLevel = 'info' | 'success' | 'error' | 'warn' | 'dim' | 'ws' | 'http'

export interface LogEntry {
  id: string
  timestamp: number
  level: LogLevel
  message: string
}

const MAX_ENTRIES = 200

interface LogState {
  entries: LogEntry[]
  /** Live-updating line shown during token streaming - not added to entries */
  streamingLine: string | null

  push: (level: LogLevel, message: string) => void
  setStreaming: (line: string | null) => void
  clear: () => void
}

export const useLogStore = create<LogState>((set) => ({
  entries: [],
  streamingLine: null,

  push: (level, message) => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      level,
      message,
    }
    set((s) => ({
      entries: [...s.entries.slice(-(MAX_ENTRIES - 1)), entry],
    }))
  },

  setStreaming: (line) => set({ streamingLine: line }),

  clear: () => set({ entries: [], streamingLine: null }),
}))

/** Convenience shorthand - call anywhere without importing the hook */
export const log = {
  info:    (msg: string) => useLogStore.getState().push('info',    msg),
  success: (msg: string) => useLogStore.getState().push('success', msg),
  error:   (msg: string) => useLogStore.getState().push('error',   msg),
  warn:    (msg: string) => useLogStore.getState().push('warn',    msg),
  dim:     (msg: string) => useLogStore.getState().push('dim',     msg),
  ws:      (msg: string) => useLogStore.getState().push('ws',      msg),
  http:    (msg: string) => useLogStore.getState().push('http',    msg),
  streaming: (line: string | null) => useLogStore.getState().setStreaming(line),
}
