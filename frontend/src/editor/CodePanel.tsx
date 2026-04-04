import type { ReactElement, MouseEvent as RMouseEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { screensApi } from '../lib/api'
import type { Screen } from '../lib/api'
import { useProjectStore } from '../store/project'
import { useCanvasStore } from '../store/canvas'
import { useGenerationStore } from '../store/generation'
import { FRAMEWORK_MAP } from '../lib/frameworks'
import { IterationChat } from '../generation/IterationChat'

function getLanguageExtension(framework: string) {
  if (framework === 'react_tailwind') return javascript({ jsx: true, typescript: false })
  return html()
}

interface CodePanelProps {
  screen: Screen
  onClose: () => void
  width?: number
  onWidthChange?: (w: number) => void
}

type Tab = 'code' | 'iterate'

export function CodePanel({ screen, onClose, width = 320, onWidthChange }: CodePanelProps): ReactElement {
  const [tab, setTab] = useState<Tab>('code')
  const [code, setCode] = useState(screen.code)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const dragStartXRef = useRef<number | null>(null)
  const dragStartWidthRef = useRef(width)

  const editorContainerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const isStreamingRef = useRef(false)

  const updateScreenLocally = useProjectStore((s) => s.updateScreenLocally)
  const updateScreenNode = useCanvasStore((s) => s.updateScreenNode)

  const isGenerating = useGenerationStore((s) => s.isGenerating)
  const generatingScreenId = useGenerationStore((s) => s.generatingScreenId)
  const isStreamingThis = isGenerating && generatingScreenId === screen.id

  // Keep ref in sync for use inside CodeMirror listener closure
  useEffect(() => {
    isStreamingRef.current = isStreamingThis
  }, [isStreamingThis])

  // Subscribe directly to accumulatedCode (no React re-render on every token)
  useEffect(() => {
    if (!isStreamingThis) return
    let last = ''
    return useGenerationStore.subscribe((state) => {
      const accumulated = state.accumulatedCode
      if (!isStreamingRef.current || accumulated === last) return
      last = accumulated
      const view = viewRef.current
      if (!view || !accumulated) return
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: accumulated } })
      view.dispatch({ selection: { anchor: accumulated.length }, scrollIntoView: true })
    })
  }, [isStreamingThis])

  const fw = FRAMEWORK_MAP[screen.framework as keyof typeof FRAMEWORK_MAP]

  const saveCode = useCallback(
    async (newCode: string) => {
      if (newCode === screen.code || saving) return
      setSaving(true)
      try {
        const updated = await screensApi.patch(screen.id, { code: newCode, prompt: 'Manual edit', model: '' })
        updateScreenLocally(updated)
        updateScreenNode(updated.id, { code: updated.code })
        setDirty(false)
      } catch {
        // ignore save errors silently
      } finally {
        setSaving(false)
      }
    },
    [screen.id, screen.code, saving, updateScreenLocally, updateScreenNode],
  )

  // Mount CodeMirror
  useEffect(() => {
    if (!editorContainerRef.current || tab !== 'code') return

    const view = new EditorView({
      doc: code,
      extensions: [
        basicSetup,
        getLanguageExtension(screen.framework),
        oneDark,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (isStreamingRef.current) return
          if (update.docChanged) {
            setDirty(true)
          }
          // Save on blur
          if (update.focusChanged && !update.view.hasFocus) {
            const current = update.state.doc.toString()
            setCode(current)
            saveCode(current).catch(() => undefined)
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '11px' },
          '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono)' },
          '.cm-content': { padding: '8px 0' },
        }),
      ],
      parent: editorContainerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, screen.framework])

  // Sync code when screen.code changes externally (e.g. from iteration)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== screen.code) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: screen.code },
      })
      setCode(screen.code)
      setDirty(false)
    }
  }, [screen.code])

  function handleCodeUpdate(newCode: string) {
    setCode(newCode)
  }

  function handleCopy() {
    const current = viewRef.current?.state.doc.toString() ?? code
    navigator.clipboard.writeText(current).catch(() => undefined)
  }

  function handleResizeMouseDown(e: RMouseEvent) {
    e.preventDefault()
    dragStartXRef.current = e.clientX
    dragStartWidthRef.current = width

    function onMouseMove(ev: MouseEvent) {
      if (dragStartXRef.current === null) return
      const dx = dragStartXRef.current - ev.clientX
      const newWidth = Math.max(240, Math.min(900, dragStartWidthRef.current + dx))
      onWidthChange?.(newWidth)
    }
    function onMouseUp() {
      dragStartXRef.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border)',
        zIndex: 20,
      }}
    >
      {/* Drag resize handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          cursor: 'ew-resize',
          zIndex: 1,
        }}
      />
      {/* Header */}
      <div
        style={{
          height: 40,
          padding: '0 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {fw && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '1px 5px',
              borderRadius: 'var(--radius-sm)',
              background: fw.bg,
              color: fw.color,
            }}
          >
            {fw.shortLabel}
          </span>
        )}
        <span
          style={{
            flex: 1,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {screen.name}
        </span>
        {saving && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Saving…</span>
        )}
        {dirty && !saving && (
          <span style={{ fontSize: 10, color: 'var(--status-amber)', fontFamily: 'var(--font-mono)' }}>
            unsaved
          </span>
        )}
        <button
          onClick={onClose}
          style={{
            width: 22,
            height: 22,
            borderRadius: 'var(--radius-sm)',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {(['code', 'iterate'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              height: 34,
              padding: '0 14px',
              fontSize: 12,
              fontWeight: 500,
              color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${tab === t ? 'var(--primary)' : 'transparent'}`,
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Code tab */}
      {tab === 'code' && (
        <>
          <div
            ref={editorContainerRef}
            style={{
              flex: 1,
              overflow: 'hidden',
              background: 'var(--bg-app)',
            }}
          />
          <div
            style={{
              height: 40,
              padding: '0 12px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}
          >
            {isStreamingThis ? (
              <span
                style={{
                  flex: 1,
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <span style={{ display: 'flex', gap: 3 }}>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      style={{
                        width: 3,
                        height: 3,
                        borderRadius: '50%',
                        background: 'var(--primary)',
                        display: 'inline-block',
                        animation: `itdot 0.6s ease ${i * 0.2}s infinite`,
                      }}
                    />
                  ))}
                </span>
                streaming…
                <style>{`@keyframes itdot{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}`}</style>
              </span>
            ) : (
              <span
                style={{
                  flex: 1,
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                }}
              >
                {code.split('\n').length} lines
              </span>
            )}
            <button
              onClick={handleCopy}
              style={{
                height: 26,
                padding: '0 10px',
                borderRadius: 'var(--radius-md)',
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
              }}
            >
              Copy
            </button>
            <button
              onClick={() => saveCode(viewRef.current?.state.doc.toString() ?? code)}
              disabled={!dirty || saving}
              style={{
                height: 26,
                padding: '0 10px',
                borderRadius: 'var(--radius-md)',
                background: dirty ? 'var(--primary)' : 'var(--bg-subtle)',
                border: 'none',
                color: dirty ? 'var(--text-inverse)' : 'var(--text-muted)',
                fontSize: 11,
                fontWeight: 600,
                cursor: dirty && !saving ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-ui)',
              }}
            >
              Save
            </button>
          </div>
        </>
      )}

      {/* Iterate tab */}
      {tab === 'iterate' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <IterationChat screen={screen} onCodeUpdate={handleCodeUpdate} />
        </div>
      )}
    </div>
  )
}
