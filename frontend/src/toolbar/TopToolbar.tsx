import type { ReactElement, ChangeEvent } from 'react'
import { useEffect, useState } from 'react'
import { useProjectStore } from '../store/project'
import { useSettingsStore } from '../store/settings'
import { modelsApi } from '../lib/api'
import type { ModelInfo } from '../lib/api'

const PROVIDER_LABELS: Record<string, string> = {
  ollama: 'Ollama',
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
}

interface TopToolbarProps {
  onPlayClick?: () => void
  onExportClick?: () => void
  onSettingsClick?: () => void
  onHomeClick?: () => void
  onNewProject?: () => void
  onDeleteProject?: () => void
  modelRefreshKey?: number
  hideModel?: boolean
}

export function TopToolbar({ onPlayClick, onExportClick, onSettingsClick, onHomeClick, onNewProject, onDeleteProject, modelRefreshKey, hideModel }: TopToolbarProps): ReactElement {
  const activeProject = useProjectStore((s) => s.activeProject)
  const renameProject = useProjectStore((s) => s.renameProject)
  const selectedModel = useSettingsStore((s) => s.selectedModel)
  const setSelectedModel = useSettingsStore((s) => s.setSelectedModel)
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const enabledModels = useSettingsStore((s) => s.enabledModels)
  const activeProjectLastPrompt = useProjectStore((s) => s.activeProjectLastPrompt)

  const [models, setModels] = useState<ModelInfo[]>([])
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')

  useEffect(() => {
    modelsApi.list().then(setModels).catch(() => undefined)
  }, [modelRefreshKey])

  function startRename() {
    setNameValue(activeProject?.name ?? '')
    setEditingName(true)
  }

  function commitRename() {
    setEditingName(false)
    if (activeProject && nameValue.trim() && nameValue.trim() !== activeProject.name) {
      renameProject(activeProject.id, nameValue.trim()).catch(() => undefined)
    }
  }

  function handleNameKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') setEditingName(false)
  }

  function handleModelChange(e: ChangeEvent<HTMLSelectElement>) {
    setSelectedModel(e.target.value)
  }

  // Build display list from enabledModels (slug+name always present),
  // enriched with vision/size from the API list where available.
  // Falls back to the full API list when nothing is pinned.
  const displayModels: ModelInfo[] = enabledModels.length > 0
    ? enabledModels.map((em) => {
        const found = models.find((m) => m.slug === em.slug)
        return {
          slug: em.slug,
          name: em.name,
          provider: em.provider,
          supports_vision: found?.supports_vision ?? false,
          size_bytes: found?.size_bytes ?? null,
        }
      })
    : models

  // Group by provider, preserving insertion order
  const grouped: Record<string, ModelInfo[]> = {}
  for (const m of displayModels) {
    if (!grouped[m.provider]) grouped[m.provider] = []
    grouped[m.provider].push(m)
  }

  const hasGroups = Object.keys(grouped).length > 1

  return (
    <header
      style={{
        height: 44,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 12px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {/* Logo — click to go home */}
      <button
        onClick={onHomeClick}
        title="Home"
        style={{
          fontWeight: 700,
          fontSize: 14,
          letterSpacing: '-0.02em',
          marginRight: 4,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <span style={{ color: 'var(--text)' }}>Open</span>
        <span style={{ color: 'var(--primary)' }}>Stitch</span>
      </button>

      {/* New project button */}
      {onNewProject && (
        <button
          onClick={onNewProject}
          title="New project"
          style={{
            width: 26, height: 26,
            borderRadius: 'var(--radius-sm)',
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, lineHeight: 1,
          }}
        >
          +
        </button>
      )}

      {/* Project name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {editingName ? (
          <input
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleNameKey}
            autoFocus
            style={{
              fontSize: 13,
              fontWeight: 500,
              background: 'var(--bg-input)',
              border: '1px solid var(--border-focus)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 6px',
              color: 'var(--text)',
              outline: 'none',
              width: 160,
            }}
          />
        ) : (
          <button
            onClick={activeProject ? startRename : undefined}
            title="Click to rename"
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: activeProject ? 'var(--text)' : 'var(--text-muted)',
              background: 'none',
              border: 'none',
              cursor: activeProject ? 'pointer' : 'default',
              padding: '2px 6px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {activeProject?.name ?? 'No project'}
          </button>
        )}
      </div>

      {/* Last app prompt for this project - always visible in center */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '0 12px' }}>
        {activeProjectLastPrompt && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('openstitch:focus-prompt'))}
            title={activeProjectLastPrompt}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              maxWidth: 420,
              height: 26,
              padding: '0 10px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              fontSize: 11,
              cursor: 'pointer',
              overflow: 'hidden',
              fontFamily: 'var(--font-ui)',
            }}
          >
            <span style={{ color: 'var(--primary)', flexShrink: 0, fontSize: 10 }}>✦</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeProjectLastPrompt}
            </span>
          </button>
        )}
      </div>

      {/* Model selector - grouped by provider */}
      {!hideModel && <select
        value={selectedModel}
        onChange={handleModelChange}
        style={{
          fontSize: 12,
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text)',
          padding: '4px 8px',
          cursor: 'pointer',
          outline: 'none',
          maxWidth: 240,
        }}
      >
        {displayModels.length === 0 && (
          <option value={selectedModel}>{selectedModel}</option>
        )}
        {hasGroups
          ? Object.entries(grouped).map(([provider, ms]) => (
              <optgroup key={provider} label={PROVIDER_LABELS[provider] ?? provider}>
                {ms.map((m) => (
                  <option key={m.slug} value={m.slug}>
                    {m.supports_vision ? '👁 ' : ''}{m.name}
                  </option>
                ))}
              </optgroup>
            ))
          : displayModels.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.supports_vision ? '👁 ' : ''}{m.name}
              </option>
            ))
        }
      </select>}

      {/* Play button */}
      {onPlayClick && (
        <button
          onClick={onPlayClick}
          style={{
            height: 30,
            padding: '0 12px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--primary)',
            border: 'none',
            color: 'var(--text-inverse)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'var(--font-ui)',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <polygon points="3,2 14,8 3,14" />
          </svg>
          Play
        </button>
      )}

      {/* Export button */}
      {onExportClick && (
        <button
          onClick={onExportClick}
          style={{
            height: 30,
            padding: '0 12px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
          }}
        >
          Export
        </button>
      )}

      {/* Delete project button */}
      {onDeleteProject && (
        <button
          onClick={onDeleteProject}
          title="Delete project"
          style={{
            height: 30, padding: '0 10px',
            borderRadius: 'var(--radius-md)',
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            fontSize: 12, fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3,4 4,4 13,4"/>
            <path d="M5 4V2h6v2M5 7v6M8 7v6M11 7v6"/>
            <path d="M13 4l-1 10H4L3 4"/>
          </svg>
        </button>
      )}

      {/* Settings button */}
      {onSettingsClick && (
        <button
          onClick={onSettingsClick}
          title="Settings"
          style={{
            height: 30, padding: '0 10px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            fontSize: 12, fontWeight: 500,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: 'var(--font-ui)',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
          Settings
        </button>
      )}

      {/* Theme toggle */}
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        style={{
          background: 'none',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-secondary)',
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: 13,
          lineHeight: 1,
        }}
      >
        {theme === 'dark' ? '☀' : '◑'}
      </button>
    </header>
  )
}
