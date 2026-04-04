import { create } from 'zustand'
import type { Framework } from '../lib/frameworks'

type Theme = 'dark' | 'light'

export interface EnabledModel {
  slug: string
  name: string
  provider: string
}

interface SettingsState {
  selectedModel: string
  selectedFramework: Framework
  theme: Theme
  apiKeys: Record<string, string>
  enabledModels: EnabledModel[]

  setSelectedModel: (model: string) => void
  setSelectedFramework: (framework: Framework) => void
  setTheme: (theme: Theme) => void
  setApiKey: (provider: string, key: string) => void
  setEnabledModels: (models: EnabledModel[]) => void
}

function loadSettings(): Partial<SettingsState> {
  try {
    const raw = localStorage.getItem('openstitch:settings')
    if (raw) return JSON.parse(raw) as Partial<SettingsState>
  } catch {
    // ignore
  }
  return {}
}

function saveSettings(state: SettingsState) {
  try {
    localStorage.setItem('openstitch:settings', JSON.stringify({
      selectedModel: state.selectedModel,
      selectedFramework: state.selectedFramework,
      theme: state.theme,
      apiKeys: state.apiKeys,
      enabledModels: state.enabledModels,
    }))
  } catch {
    // ignore
  }
}

const saved = loadSettings()

export const useSettingsStore = create<SettingsState>((set, get) => ({
  selectedModel: saved.selectedModel ?? 'ollama:qwen2.5-coder:7b',
  selectedFramework: (saved.selectedFramework as Framework | undefined) ?? 'html_tailwind',
  theme: (saved.theme as Theme | undefined) ?? 'light',
  apiKeys: (saved.apiKeys as Record<string, string> | undefined) ?? {},
  enabledModels: (saved.enabledModels as EnabledModel[] | undefined) ?? [],

  setSelectedModel: (model) => {
    set({ selectedModel: model })
    saveSettings(get())
  },
  setSelectedFramework: (framework) => {
    set({ selectedFramework: framework })
    saveSettings(get())
  },
  setTheme: (theme) => {
    set({ theme })
    document.documentElement.dataset['theme'] = theme
    saveSettings(get())
  },
  setApiKey: (provider, key) => {
    set((s) => ({ apiKeys: { ...s.apiKeys, [provider]: key } }))
    saveSettings(get())
  },
  setEnabledModels: (models) => {
    set({ enabledModels: models })
    saveSettings(get())
  },
}))
