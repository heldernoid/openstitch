import type { ReactElement, KeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { screensApi } from '../lib/api'
import type { Screen, ScreenVersion } from '../lib/api'
import { useGenerationStore } from '../store/generation'
import { useSettingsStore } from '../store/settings'
import { useCanvasStore } from '../store/canvas'
import { useProjectStore } from '../store/project'
import { DiffView } from '../editor/DiffView'

interface IterationChatProps {
  screen: Screen
  onCodeUpdate: (newCode: string) => void
}

export function IterationChat({ screen, onCodeUpdate }: IterationChatProps): ReactElement {
  const [versions, setVersions] = useState<ScreenVersion[]>([])
  const [prompt, setPrompt] = useState('')
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)
  const [expandedDiff, setExpandedDiff] = useState<string | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  const generate = useGenerationStore((s) => s.generate)
  const isGenerating = useGenerationStore((s) => s.isGenerating)
  const lastDone = useGenerationStore((s) => s.lastDone)
  const selectedModel = useSettingsStore((s) => s.selectedModel)
  const updateScreenNode = useCanvasStore((s) => s.updateScreenNode)
  const updateScreenLocally = useProjectStore((s) => s.updateScreenLocally)
  const activeProject = useProjectStore((s) => s.activeProject)

  useEffect(() => {
    screensApi.versions(screen.id).then(setVersions).catch(() => undefined)
  }, [screen.id])

  // Refresh versions when a generation targeting this screen completes
  useEffect(() => {
    if (lastDone?.screen_id === screen.id) {
      setPendingPrompt(null)
      screensApi.versions(screen.id).then(setVersions).catch(() => undefined)
      screensApi.get(screen.id).then((updated) => {
        onCodeUpdate(updated.code)
        updateScreenLocally(updated)
        updateScreenNode(updated.id, { code: updated.code, hasCode: true })
      }).catch(() => undefined)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastDone])

  // Scroll to bottom when versions load/update or pending prompt appears
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [versions, pendingPrompt])

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleSubmit() {
    if (!prompt.trim() || isGenerating || !activeProject) return
    const trimmed = prompt.trim()
    setPendingPrompt(trimmed)
    setPrompt('')
    generate(
      {
        project_id: activeProject.id,
        prompt: trimmed,
        framework: screen.framework,
        model: selectedModel,
        screen_id: screen.id,
        current_code: screen.code,
        iteration_context: versions.map((v) => v.prompt).filter(Boolean),
        edit_mode: true,
      },
      () => undefined,
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Thread */}
      <div
        ref={threadRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {versions.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 12,
              padding: '24px 0',
            }}
          >
            No iterations yet. Type a follow-up prompt below.
          </div>
        )}

        {versions.map((version, idx) => {
          const prevCode = idx > 0 ? versions[idx - 1].code : ''
          const isDiffExpanded = expandedDiff === version.id

          return (
            <div key={version.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Version marker */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span
                  style={{
                    height: 18,
                    padding: '0 8px',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border)',
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  v{idx + 1}
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>

              {/* User prompt bubble */}
              {version.prompt && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                  <div
                    style={{
                      maxWidth: '88%',
                      padding: '8px 11px',
                      background: 'rgba(245,158,11,0.12)',
                      border: '1px solid rgba(245,158,11,0.2)',
                      borderRadius: 'var(--radius-lg) var(--radius-sm) var(--radius-lg) var(--radius-lg)',
                      fontSize: 12,
                      lineHeight: 1.55,
                      color: 'var(--text)',
                    }}
                  >
                    {version.prompt}
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {new Date(version.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}

              {/* System response bubble */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
                <div
                  style={{
                    maxWidth: '88%',
                    padding: '8px 11px',
                    background: 'var(--bg-surface-raised)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm) var(--radius-lg) var(--radius-lg) var(--radius-lg)',
                    fontSize: 12,
                    lineHeight: 1.55,
                    color: 'var(--text-secondary)',
                  }}
                >
                  Generated by <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{version.model}</span>
                </div>

                {/* Diff toggle */}
                {prevCode && (
                  <button
                    onClick={() => setExpandedDiff(isDiffExpanded ? null : version.id)}
                    style={{
                      height: 20,
                      padding: '0 7px',
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 10,
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-ui)',
                    }}
                  >
                    {isDiffExpanded ? 'Hide diff' : 'View diff'}
                  </button>
                )}
              </div>

              {/* Inline diff */}
              {isDiffExpanded && prevCode && (
                <DiffView
                  before={prevCode}
                  after={version.code}
                  prompt={version.prompt}
                />
              )}
            </div>
          )
        })}

        {/* Pending user bubble - appears immediately on submit */}
        {pendingPrompt && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <div
              style={{
                maxWidth: '88%',
                padding: '8px 11px',
                background: 'rgba(245,158,11,0.12)',
                border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: 'var(--radius-lg) var(--radius-sm) var(--radius-lg) var(--radius-lg)',
                fontSize: 12,
                lineHeight: 1.55,
                color: 'var(--text)',
              }}
            >
              {pendingPrompt}
            </div>
          </div>
        )}

        {/* Generating indicator - shown after the pending prompt */}
        {isGenerating && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div
              style={{
                padding: '8px 11px',
                background: 'var(--bg-surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm) var(--radius-lg) var(--radius-lg) var(--radius-lg)',
                fontSize: 12,
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ display: 'flex', gap: 3 }}>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      background: 'var(--primary)',
                      display: 'inline-block',
                      animation: `itdot 0.6s ease ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </span>
              Generating…
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <style>{`@keyframes itdot{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}`}</style>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe what to change…"
          rows={2}
          style={{
            width: '100%',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '8px 10px',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text)',
            resize: 'none',
            outline: 'none',
            lineHeight: 1.5,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ flex: 1, fontSize: 10, color: 'var(--text-muted)' }}>
            <kbd style={{ background: 'var(--bg-surface-raised)', border: '1px solid var(--border-strong)', borderRadius: 2, padding: '1px 4px', fontSize: 9, fontFamily: 'var(--font-mono)' }}>⌘</kbd>
            {' '}<kbd style={{ background: 'var(--bg-surface-raised)', border: '1px solid var(--border-strong)', borderRadius: 2, padding: '1px 4px', fontSize: 9, fontFamily: 'var(--font-mono)' }}>↵</kbd>
            {' '}to send
          </span>
          <button
            onClick={handleSubmit}
            disabled={!prompt.trim() || isGenerating}
            style={{
              height: 28,
              padding: '0 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary)',
              color: 'var(--text-inverse)',
              fontSize: 11,
              fontWeight: 600,
              cursor: !prompt.trim() || isGenerating ? 'not-allowed' : 'pointer',
              opacity: !prompt.trim() || isGenerating ? 0.5 : 1,
              border: 'none',
              fontFamily: 'var(--font-ui)',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <polygon points="2,2 14,8 2,14" />
            </svg>
            Iterate
          </button>
        </div>
      </div>
    </div>
  )
}
