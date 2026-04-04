import type { ReactElement, MouseEvent as RMouseEvent } from 'react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { html } from '@codemirror/lang-html'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { screensApi } from '../lib/api'
import type { Screen } from '../lib/api'
import { useProjectStore } from '../store/project'
import { useCanvasStore } from '../store/canvas'
import { useGenerationStore } from '../store/generation'
import { IterationChat } from '../generation/IterationChat'
import { FRAMEWORK_MAP } from '../lib/frameworks'

// FileId convention:
//   'design'         → DESIGN.md (streamed from generation store)
//   'plan'           → plan.json (streamed from generation store)
//   'screen:{name}'  → screen file (pending / streaming / saved)

type FileId = string
type StoreKey = 'designMd' | 'planJson' | 'streamingScreenCode'

const CM_THEME = EditorView.theme({
  '&': { height: '100%', fontSize: '11px' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono)' },
  '.cm-content': { padding: '8px 0' },
})

// ── Read-only streaming editor ────────────────────────────────────────────────

function ReadOnlyStreamingEditor({ storeKey, language }: { storeKey: StoreKey; language: 'html' | 'json' | 'markdown' }): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const langExt =
      language === 'html' ? html() :
      language === 'json' ? json() :
      markdown()
    const initial = useGenerationStore.getState()[storeKey]
    const view = new EditorView({
      doc: initial,
      extensions: [
        basicSetup, langExt, oneDark, EditorView.lineWrapping,
        EditorView.editable.of(false),
        CM_THEME,
      ],
      parent: containerRef.current,
    })

    let prevLen = initial.length
    const unsub = useGenerationStore.subscribe((state) => {
      const content = state[storeKey]
      if (content.length === prevLen) return
      const growing = content.length > prevLen
      prevLen = content.length
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } })
      if (growing) view.dispatch({ selection: { anchor: content.length }, scrollIntoView: true })
    })

    return () => { view.destroy(); unsub() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey, language])

  return <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', background: 'var(--bg-app)' }} />
}

// ── Inline screen editor (Code + Iterate) ────────────────────────────────────

function InlineScreenEditor({ screen, tab, onTabChange }: { screen: Screen; tab: 'code' | 'iterate'; onTabChange: (t: 'code' | 'iterate') => void }): ReactElement {
  const [code, setCode] = useState(screen.code)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const isStreamingRef = useRef(false)

  const updateScreenLocally = useProjectStore((s) => s.updateScreenLocally)
  const updateScreenNode = useCanvasStore((s) => s.updateScreenNode)
  const isGenerating = useGenerationStore((s) => s.isGenerating)
  const generatingScreenId = useGenerationStore((s) => s.generatingScreenId)
  const isStreamingThis = isGenerating && generatingScreenId === screen.id

  useEffect(() => { isStreamingRef.current = isStreamingThis }, [isStreamingThis])

  // Subscribe to accumulatedCode for single-screen generation on this screen
  useEffect(() => {
    if (!isStreamingThis) return
    let last = ''
    return useGenerationStore.subscribe((state) => {
      const accumulated = state.accumulatedCode
      if (!isStreamingRef.current || accumulated === last) return
      last = accumulated
      const v = viewRef.current
      if (!v || !accumulated) return
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: accumulated } })
      v.dispatch({ selection: { anchor: accumulated.length }, scrollIntoView: true })
    })
  }, [isStreamingThis])

  const saveCode = useCallback(async (newCode: string) => {
    if (newCode === screen.code || saving) return
    setSaving(true)
    try {
      const updated = await screensApi.patch(screen.id, { code: newCode, prompt: 'Manual edit', model: '' })
      updateScreenLocally(updated)
      updateScreenNode(updated.id, { code: updated.code })
      setDirty(false)
    } catch { /* ignore */ } finally { setSaving(false) }
  }, [screen.id, screen.code, saving, updateScreenLocally, updateScreenNode])

  // Mount CodeMirror
  useEffect(() => {
    if (!containerRef.current || tab !== 'code') return
    const langExt = screen.framework === 'react_tailwind' ? javascript({ jsx: true }) : html()
    const view = new EditorView({
      doc: code,
      extensions: [
        basicSetup, langExt, oneDark, EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (isStreamingRef.current) return
          if (update.docChanged) setDirty(true)
          if (update.focusChanged && !update.view.hasFocus) {
            const current = update.state.doc.toString()
            setCode(current)
            saveCode(current).catch(() => undefined)
          }
        }),
        CM_THEME,
      ],
      parent: containerRef.current,
    })
    viewRef.current = view
    return () => { view.destroy(); viewRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, screen.framework])

  // Sync when screen.code changes externally
  useEffect(() => {
    const v = viewRef.current
    if (!v) return
    const current = v.state.doc.toString()
    if (current !== screen.code) {
      v.dispatch({ changes: { from: 0, to: current.length, insert: screen.code } })
      setCode(screen.code)
      setDirty(false)
    }
  }, [screen.code])

  const fw = FRAMEWORK_MAP[screen.framework as keyof typeof FRAMEWORK_MAP]

  return (
    <>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, alignItems: 'center' }}>
        {(['code', 'iterate'] as const).map((t) => (
          <button key={t} onClick={() => onTabChange(t)} style={{
            height: 34, padding: '0 14px', fontSize: 12, fontWeight: 500,
            color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
            cursor: 'pointer', background: 'none', border: 'none',
            borderBottom: `2px solid ${tab === t ? 'var(--primary)' : 'transparent'}`,
            textTransform: 'capitalize',
          }}>
            {t}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {fw && (
          <span style={{ marginRight: 12, fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 'var(--radius-sm)', background: fw.bg, color: fw.color }}>
            {fw.shortLabel}
          </span>
        )}
      </div>

      {tab === 'code' && (
        <>
          <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', background: 'var(--bg-app)' }} />
          <div style={{ height: 40, padding: '0 12px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {isStreamingThis ? (
              <span style={{ flex: 1, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <StreamingDots /> streaming…
                <style>{`@keyframes wsdot{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}`}</style>
              </span>
            ) : (
              <span style={{ flex: 1, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {code.split('\n').length} lines
              </span>
            )}
            {dirty && !saving && <span style={{ fontSize: 10, color: 'var(--status-amber)', fontFamily: 'var(--font-mono)' }}>unsaved</span>}
            {saving && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Saving…</span>}
            <button onClick={() => navigator.clipboard.writeText(viewRef.current?.state.doc.toString() ?? code).catch(() => {})}
              style={{ height: 26, padding: '0 10px', borderRadius: 'var(--radius-md)', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
              Copy
            </button>
            <button onClick={() => saveCode(viewRef.current?.state.doc.toString() ?? code)} disabled={!dirty || saving}
              style={{ height: 26, padding: '0 10px', borderRadius: 'var(--radius-md)', background: dirty ? 'var(--primary)' : 'var(--bg-subtle)', border: 'none', color: dirty ? 'var(--text-inverse)' : 'var(--text-muted)', fontSize: 11, fontWeight: 600, cursor: dirty && !saving ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-ui)' }}>
              Save
            </button>
          </div>
        </>
      )}

      {tab === 'iterate' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <IterationChat screen={screen} onCodeUpdate={setCode} />
        </div>
      )}
    </>
  )
}

// ── File tree item ────────────────────────────────────────────────────────────

function FileTreeItem({ label, icon, isActive, isStreaming, isPending, isFailed, onClick }: {
  label: string; icon: ReactElement; isActive: boolean; isStreaming?: boolean;
  isPending?: boolean; isFailed?: boolean; onClick: () => void
}): ReactElement {
  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left',
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '4px 8px 4px 10px',
      background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
      border: 'none',
      borderLeft: `2px solid ${isActive ? 'var(--primary)' : 'transparent'}`,
      cursor: 'pointer',
      color: isFailed ? 'var(--status-red)' : 'var(--text-secondary)',
      opacity: isPending ? 0.45 : 1,
    }}>
      <span style={{ flexShrink: 0, width: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </span>
      <span style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
        {label}
      </span>
      {isStreaming && <StreamingDots />}
    </button>
  )
}

function StreamingDots(): ReactElement {
  return (
    <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--primary)', display: 'inline-block', animation: `wsdot 0.6s ease ${i * 0.2}s infinite` }} />
      ))}
    </span>
  )
}

function HtmlIcon(): ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
    </svg>
  )
}

// ── Main WorkspacePanel ───────────────────────────────────────────────────────

interface WorkspacePanelProps {
  width: number
  onWidthChange: (w: number) => void
  onClose: () => void
}

export function WorkspacePanel({ width, onWidthChange, onClose }: WorkspacePanelProps): ReactElement {
  const [activeFile, setActiveFile] = useState<FileId>('design')
  const [screenTab, setScreenTab] = useState<'code' | 'iterate'>('code')
  const dragStartXRef = useRef<number | null>(null)
  const dragStartWidthRef = useRef(width)

  const screens = useProjectStore((s) => s.screens)
  const activeScreen = useProjectStore((s) => s.activeScreen)
  const setActiveScreen = useProjectStore((s) => s.setActiveScreen)
  const activeProject = useProjectStore((s) => s.activeProject)

  const designMd = useGenerationStore((s) => s.designMd)
  const planJson = useGenerationStore((s) => s.planJson)
  const isGeneratingDesign = useGenerationStore((s) => s.isGeneratingDesign)
  const isGeneratingPlan = useGenerationStore((s) => s.isGeneratingPlan)
  const streamingScreenName = useGenerationStore((s) => s.streamingScreenName)
  const appPlan = useGenerationStore((s) => s.appPlan)

  // Reset editor when project changes
  useEffect(() => { setActiveFile('design') }, [activeProject?.id])

  // Auto-select file based on what's generating
  useEffect(() => { if (isGeneratingDesign) setActiveFile('design') }, [isGeneratingDesign])
  useEffect(() => { if (isGeneratingPlan) setActiveFile('plan') }, [isGeneratingPlan])
  useEffect(() => {
    if (streamingScreenName) setActiveFile(`screen:${streamingScreenName}`)
  }, [streamingScreenName])

  // Sync with activeScreen set from sidebar
  useEffect(() => {
    if (activeScreen) setActiveFile(`screen:${activeScreen.name}`)
  }, [activeScreen?.id])

  // Default to first screen when no streaming content
  useEffect(() => {
    if (!designMd && !planJson && !isGeneratingDesign && !isGeneratingPlan && screens.length > 0 && (activeFile === 'design' || activeFile === 'plan')) {
      setActiveFile(`screen:${screens[0].name}`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screens.length])

  function selectFile(fileId: FileId) {
    setActiveFile(fileId)
    if (fileId.startsWith('screen:')) {
      const name = fileId.slice(7)
      const screen = screens.find((s) => s.name === name)
      if (screen && screen.id !== activeScreen?.id) setActiveScreen(screen)
    }
  }

  function handleResizeMouseDown(e: RMouseEvent) {
    e.preventDefault()
    dragStartXRef.current = e.clientX
    dragStartWidthRef.current = width
    function onMouseMove(ev: MouseEvent) {
      if (dragStartXRef.current === null) return
      const dx = dragStartXRef.current - ev.clientX
      onWidthChange(Math.max(200, dragStartWidthRef.current + dx))
    }
    function onMouseUp() {
      dragStartXRef.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  // Resolve active file content
  const activeName = activeFile.startsWith('screen:') ? activeFile.slice(7) : null
  const activeScreenObj = activeName ? (screens.find((s) => s.name === activeName) ?? null) : null
  const activePlanEntry = activeName ? (appPlan.find((p) => p.name === activeName) ?? null) : null

  const hasDesign = designMd.length > 0 || isGeneratingDesign
  const hasPlan = planJson.length > 0 || isGeneratingPlan
  const pendingScreens = appPlan.filter(
    (p) => (p.status === 'pending' || p.status === 'generating' || p.status === 'failed') &&
      !screens.find((s) => s.name === p.name)
  )

  // Active file label for header
  const activeLabel =
    activeFile === 'design' ? 'DESIGN.md' :
    activeFile === 'plan' ? 'plan.json' :
    activeName ? `${activeName}.html` : ''

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, width, height: '100%',
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)', zIndex: 20,
    }}>
      {/* Resize handle */}
      <div onMouseDown={handleResizeMouseDown} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, cursor: 'ew-resize', zIndex: 1 }} />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ── File tree (150px) ── */}
        <div style={{
          width: 150, flexShrink: 0,
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--bg-app)',
        }}>
          {/* Project name */}
          <div style={{ padding: '8px 10px 5px', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
            {activeProject?.name ?? 'Project'}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', paddingTop: 4 }}>
            {/* DESIGN.md */}
            {hasDesign && (
              <FileTreeItem
                label="DESIGN.md"
                icon={<span style={{ fontSize: 9, color: 'var(--accent)' }}>✦</span>}
                isActive={activeFile === 'design'}
                isStreaming={isGeneratingDesign}
                onClick={() => selectFile('design')}
              />
            )}
            {/* plan.json */}
            {hasPlan && (
              <FileTreeItem
                label="plan.json"
                icon={<span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{'{}'}</span>}
                isActive={activeFile === 'plan'}
                isStreaming={isGeneratingPlan}
                onClick={() => selectFile('plan')}
              />
            )}

            {/* Screens section */}
            {(screens.length > 0 || pendingScreens.length > 0) && (
              <>
                <div style={{ padding: '8px 10px 3px', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', borderTop: (hasDesign || hasPlan) ? '1px solid var(--border)' : 'none', marginTop: (hasDesign || hasPlan) ? 4 : 0 }}>
                  Screens
                </div>

                {/* Saved screens */}
                {screens.map((s) => (
                  <FileTreeItem
                    key={s.id}
                    label={`${s.name}.html`}
                    icon={<HtmlIcon />}
                    isActive={activeFile === `screen:${s.name}`}
                    isStreaming={streamingScreenName === s.name}
                    onClick={() => selectFile(`screen:${s.name}`)}
                  />
                ))}

                {/* Pending/generating screens not yet saved */}
                {pendingScreens.map((p) => (
                  <FileTreeItem
                    key={`pending-${p.index}`}
                    label={`${p.name}.html`}
                    icon={<HtmlIcon />}
                    isActive={activeFile === `screen:${p.name}`}
                    isStreaming={p.status === 'generating'}
                    isPending={p.status === 'pending'}
                    isFailed={p.status === 'failed'}
                    onClick={() => selectFile(`screen:${p.name}`)}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        {/* ── Editor area ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {/* Header */}
          <div style={{ height: 40, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
              {activeLabel}
            </span>
            <button onClick={onClose} style={{ width: 22, height: 22, borderRadius: 'var(--radius-sm)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ×
            </button>
          </div>

          {/* DESIGN.md viewer */}
          {activeFile === 'design' && (
            <ReadOnlyStreamingEditor key="design" storeKey="designMd" language="markdown" />
          )}

          {/* plan.json viewer */}
          {activeFile === 'plan' && (
            <ReadOnlyStreamingEditor key="plan" storeKey="planJson" language="json" />
          )}

          {/* Saved screen editor */}
          {activeFile.startsWith('screen:') && activeScreenObj && (
            <InlineScreenEditor
              key={activeScreenObj.id}
              screen={activeScreenObj}
              tab={screenTab}
              onTabChange={setScreenTab}
            />
          )}

          {/* Streaming screen (not yet saved to DB) */}
          {activeFile.startsWith('screen:') && !activeScreenObj && activePlanEntry?.status === 'generating' && (
            <ReadOnlyStreamingEditor key={`streaming-${activeName}`} storeKey="streamingScreenCode" language="html" />
          )}

          {/* Pending screen */}
          {activeFile.startsWith('screen:') && !activeScreenObj && activePlanEntry && activePlanEntry.status === 'pending' && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              Waiting to generate…
            </div>
          )}

          {/* Failed screen */}
          {activeFile.startsWith('screen:') && !activeScreenObj && activePlanEntry?.status === 'failed' && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--status-red)', fontSize: 12 }}>
              Generation failed
            </div>
          )}

          {/* Empty state */}
          {!activeFile && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              Select a file
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
