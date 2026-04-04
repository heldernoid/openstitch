import { create } from 'zustand'
import { startGeneration, startAppGeneration } from '../lib/stream'
import type { GenerateRequest, DoneFrame, AppGenerateRequest, AppScreenDoneFrame } from '../lib/stream'
import { useProjectStore } from './project'
import { log } from './log'

export interface AppScreenProgress {
  name: string
  index: number
  status: 'pending' | 'generating' | 'done' | 'failed'
  tokenCount: number
  prompt: string       // original per-screen prompt from the plan
  failedPrompt?: string
}

export interface AppGenerateCallbacks {
  onPlan: (screenNames: string[]) => void
  onScreenDone: (frame: AppScreenDoneFrame) => void
  onAllDone: () => void
  onError?: () => void
}

interface GenerationState {
  isGenerating: boolean
  accumulatedCode: string
  tokenCount: number
  error: string | null
  lastDone: DoneFrame | null
  pendingImage: string | null // base64 data URL (e.g. from drop or sketch)
  startedAt: number | null
  tokensPerSec: number
  generatingScreenId: string | null
  generatingProjectId: string | null   // project that owns the active single-screen generation

  generate: (req: GenerateRequest, onDone: (frame: DoneFrame) => void) => void
  abort: () => void
  clear: () => void
  setPendingImage: (dataUrl: string | null) => void

  // App (multi-screen) generation
  isGeneratingApp: boolean
  appPlan: AppScreenProgress[]
  appError: string | null
  lastAppRequest: AppGenerateRequest | null
  appGeneratingProjectId: string | null  // project that owns the active app generation
  generateApp: (req: AppGenerateRequest, callbacks: AppGenerateCallbacks) => void
  abortApp: () => void

  // Workspace streaming content (visible in WorkspacePanel)
  designMd: string
  planJson: string
  isGeneratingDesign: boolean
  isGeneratingPlan: boolean
  streamingScreenCode: string       // live tokens for current app-gen screen
  streamingScreenName: string | null

  _abort: (() => void) | null
  _abortApp: (() => void) | null
  _recentTokenTimes: number[]
}


export const useGenerationStore = create<GenerationState>((set, get) => ({
  isGenerating: false,
  accumulatedCode: '',
  tokenCount: 0,
  error: null,
  lastDone: null,
  pendingImage: null,
  startedAt: null,
  tokensPerSec: 0,
  generatingScreenId: null,
  generatingProjectId: null,
  isGeneratingApp: false,
  appPlan: [],
  appError: null,
  lastAppRequest: null,
  appGeneratingProjectId: null,
  designMd: '',
  planJson: '',
  isGeneratingDesign: false,
  isGeneratingPlan: false,
  streamingScreenCode: '',
  streamingScreenName: null,
  _abort: null,
  _abortApp: null,
  _recentTokenTimes: [],

  generate: (req, onDone) => {
    get()._abort?.()
    const now = Date.now()
    set({
      isGenerating: true,
      accumulatedCode: '',
      tokenCount: 0,
      error: null,
      lastDone: null,
      startedAt: now,
      tokensPerSec: 0,
      generatingScreenId: req.screen_id ?? null,
      generatingProjectId: req.project_id,
      _recentTokenTimes: [],
    })

    const label = req.screen_id ? `Iterating on screen` : `Generating new screen`
    const imgNote = req.image_b64 ? ' (with image)' : ''
    log.info(`${label} · ${req.framework} · ${req.model}${imgNote}`)
    log.dim(`Prompt: "${req.prompt.slice(0, 80)}${req.prompt.length > 80 ? '…' : ''}"`)

    const abort = startGeneration(req, {
      onToken: (token) => {
        const t = Date.now()
        set((s) => {
          const recent = [...s._recentTokenTimes, t].filter((ts) => t - ts <= 3000)
          const tokensPerSec =
            recent.length >= 2
              ? Math.round((recent.length - 1) / ((t - recent[0]) / 1000))
              : 0
          return {
            accumulatedCode: s.accumulatedCode + token,
            tokenCount: s.tokenCount + 1,
            _recentTokenTimes: recent,
            tokensPerSec,
          }
        })
      },
      onDone: (frame) => {
        const elapsed = get().startedAt ? ((Date.now() - get().startedAt!) / 1000).toFixed(1) : '?'
        const tc = get().tokenCount
        log.success(`Done · ${tc} tokens · ${elapsed}s · screen ${frame.screen_id.slice(0, 8)}`)
        set({ isGenerating: false, lastDone: frame, generatingScreenId: null, _abort: null })
        onDone(frame)
      },
      onError: (message) => {
        log.error(`Generation failed: ${message}`)
        set({ isGenerating: false, error: message, generatingScreenId: null, _abort: null })
      },
    })

    set({ _abort: abort })
  },

  abort: () => {
    get()._abort?.()
    log.info('Generation stopped by user')
    set({ isGenerating: false, generatingScreenId: null, _abort: null })
  },

  clear: () => {
    get()._abort?.()
    set({
      isGenerating: false,
      accumulatedCode: '',
      tokenCount: 0,
      error: null,
      lastDone: null,
      startedAt: null,
      tokensPerSec: 0,
      generatingScreenId: null,
      _abort: null,
      _recentTokenTimes: [],
    })
  },

  setPendingImage: (dataUrl) => set({ pendingImage: dataUrl }),

  generateApp: (req, callbacks) => {
    get()._abortApp?.()
    log.info(`Generating app · ${req.framework} · ${req.model}`)
    log.dim(`Prompt: "${req.prompt.slice(0, 80)}${req.prompt.length > 80 ? '…' : ''}"`)
    useProjectStore.getState().setLastPrompt(req.project_id, req.prompt)
    set({
      isGeneratingApp: true, appPlan: [], appError: null, lastAppRequest: req,
      appGeneratingProjectId: req.project_id,
      designMd: '', planJson: '', isGeneratingDesign: false, isGeneratingPlan: false,
      streamingScreenCode: '', streamingScreenName: null,
    })

    const abort = startAppGeneration(req, {
      onDesignStart: () => set({ isGeneratingDesign: true }),
      onDesignToken: (token) => set((s) => ({ designMd: s.designMd + token })),
      onDesignDone: () => set({ isGeneratingDesign: false }),
      onPlanningStart: () => set({ isGeneratingPlan: true }),
      onPlanToken: (token) => set((s) => ({ planJson: s.planJson + token })),

      onPlan: (screenNames, _total, prompts) => {
        set({ isGeneratingPlan: false })
        const plan: AppScreenProgress[] = screenNames.map((name, index) => ({
          name, index, status: 'pending', tokenCount: 0, prompt: prompts[index] ?? name,
        }))
        set({ appPlan: plan })
        log.info(`App plan: ${screenNames.join(', ')}`)
        callbacks.onPlan(screenNames)
      },
      onScreenStart: (name, index) => {
        set((s) => ({
          streamingScreenCode: '',
          streamingScreenName: name,
          appPlan: s.appPlan.map((p) =>
            p.index === index ? { ...p, status: 'generating' } : p,
          ),
        }))
      },
      onToken: (token) => {
        set((s) => ({
          streamingScreenCode: s.streamingScreenCode + token,
          appPlan: s.appPlan.map((p) =>
            p.status === 'generating' ? { ...p, tokenCount: p.tokenCount + 1 } : p,
          ),
        }))
      },
      onScreenDone: (frame) => {
        set((s) => ({
          streamingScreenName: null,
          appPlan: s.appPlan.map((p) =>
            p.index === frame.index ? { ...p, status: 'done', tokenCount: frame.completion_tokens } : p,
          ),
        }))
        callbacks.onScreenDone(frame)
      },
      onScreenFailed: (name, index, prompt) => {
        log.warn(`Screen "${name}" failed - retry available`)
        set((s) => ({
          appPlan: s.appPlan.map((p) =>
            p.index === index ? { ...p, status: 'failed', failedPrompt: prompt } : p,
          ),
        }))
      },
      onAllDone: (total) => {
        set({ isGeneratingApp: false, _abortApp: null })
        log.success(`App generated · ${total} screens`)
        callbacks.onAllDone()
      },
      onError: (message) => {
        log.error(`App generation failed: ${message}`)
        set((s) => ({
          isGeneratingApp: false,
          appError: message,
          _abortApp: null,
          // Mark any in-flight screen as failed so the retry button appears
          appPlan: s.appPlan.map((p) =>
            p.status === 'generating'
              ? { ...p, status: 'failed', failedPrompt: p.prompt }
              : p
          ),
        }))
        callbacks.onError?.()
      },
    })
    set({ _abortApp: abort })
  },

  abortApp: () => {
    get()._abortApp?.()
    log.info('App generation stopped by user')
    set({ isGeneratingApp: false, _abortApp: null })
  },
}))
