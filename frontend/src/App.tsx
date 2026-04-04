import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { TopToolbar } from './toolbar/TopToolbar'
import { ProjectSidebar } from './sidebar/ProjectSidebar'
import { CanvasRoot } from './canvas/CanvasRoot'
import { PromptPanel } from './generation/PromptPanel'
import { GenerationStream } from './generation/GenerationStream'
import { WorkspacePanel } from './editor/WorkspacePanel'
import { PlayModeRunner } from './preview/PlayModeRunner'
import { ExportModal } from './modals/ExportModal'
import { ModelSettingsModal } from './modals/ModelSettingsModal'
import { ProjectModal } from './modals/ProjectModal'
import { MultiScreenProgress } from './generation/MultiScreenProgress'
import { LandingView } from './generation/LandingView'
import { useProjectStore } from './store/project'
import { useCanvasStore } from './store/canvas'
import { useSettingsStore } from './store/settings'
import { useGenerationStore } from './store/generation'
import type { AppScreenDoneFrame } from './lib/stream'
import { ActivityLog } from './ui/ActivityLog'
import { log } from './store/log'

interface ToastState {
  message: string
  key: number
}

export default function App(): ReactElement {
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const activeProject = useProjectStore((s) => s.activeProject)
  const activeScreen = useProjectStore((s) => s.activeScreen)
  const setActiveScreen = useProjectStore((s) => s.setActiveScreen)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const screens = useProjectStore((s) => s.screens)
  const addScreenNode = useCanvasStore((s) => s.addScreenNode)
  const removeScreenNode = useCanvasStore((s) => s.removeScreenNode)
  const loadFromSnapshot = useCanvasStore((s) => s.loadFromSnapshot)
  const nodes = useCanvasStore((s) => s.nodes)
  const theme = useSettingsStore((s) => s.theme)
  const undo = useCanvasStore((s) => s.undo)
  const redo = useCanvasStore((s) => s.redo)
  const lastDone = useGenerationStore((s) => s.lastDone)
  const isGenerating = useGenerationStore((s) => s.isGenerating)
  const generatingProjectId = useGenerationStore((s) => s.generatingProjectId)
  const generatingScreenId = useGenerationStore((s) => s.generatingScreenId)
  const appGeneratingProjectId = useGenerationStore((s) => s.appGeneratingProjectId)
  const isGeneratingApp = useGenerationStore((s) => s.isGeneratingApp)
  const designMd = useGenerationStore((s) => s.designMd)

  const [modelRefreshKey, setModelRefreshKey] = useState(0)
  const [streamOpen, setStreamOpen] = useState(false)
  const [appProgressOpen, setAppProgressOpen] = useState(false)
  const [playMode, setPlayMode] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [projectModalMode, setProjectModalMode] = useState<'create' | 'delete' | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [codePanelVisible, setCodePanelVisible] = useState(true)
  const [codePanelWidth, setCodePanelWidth] = useState(480)

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme
  }, [theme])

  useEffect(() => {
    loadProjects().catch((e) => console.error('[app] loadProjects failed:', e))
  }, [loadProjects])

  useEffect(() => {
    if (activeProject) {
      loadFromSnapshot(activeProject.canvas_snapshot_json)
    }
  // Only re-run when the project ID changes (switch or initial load),
  // NOT when canvas_snapshot_json updates mid-session via updateProjectCanvas.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id])

  // Hide stream/progress overlays when switching to a different project
  useEffect(() => {
    if (!activeProject) return
    if (streamOpen && generatingProjectId && generatingProjectId !== activeProject.id) {
      setStreamOpen(false)
    }
    if (appProgressOpen && appGeneratingProjectId && appGeneratingProjectId !== activeProject.id) {
      setAppProgressOpen(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject])

  useEffect(() => {
    for (const screen of screens) {
      if (!nodes.find((n) => n.id === screen.id)) {
        addScreenNode(screen.id, screen.name, screen.framework, undefined, screen.code)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screens])

  // Show completion toast on every generation done
  useEffect(() => {
    if (!lastDone) return
    const { tokenCount, startedAt } = useGenerationStore.getState()
    const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0
    const elapsedStr = elapsed > 0.5 ? ` · ${elapsed.toFixed(1)}s` : ''
    const msg = `Screen generated · ${tokenCount} tokens${elapsedStr}`
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message: msg, key: Date.now() })
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }, [lastDone])

  // Global keyboard shortcuts
  useEffect(() => {
    function isTyping(): boolean {
      const el = document.activeElement
      if (!el) return false
      const tag = (el as HTMLElement).tagName
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (el as HTMLElement).isContentEditable
      )
    }

    function onKeyDown(e: KeyboardEvent) {
      // Cmd/Ctrl+Z - undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      // Cmd/Ctrl+Shift+Z - redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        redo()
        return
      }

      // Single-key shortcuts - ignore when typing
      if (isTyping()) return

      // G - focus prompt panel
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('openstitch:focus-prompt'))
      }

      // P - toggle play mode
      if ((e.key === 'p' || e.key === 'P') && screens.length > 0) {
        e.preventDefault()
        setPlayMode((v) => !v)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo, screens.length])

  function handleNewScreen(screenId: string) {
    // Auto-open CodePanel for the freshly generated screen and close stream
    const screen = useProjectStore.getState().screens.find((s) => s.id === screenId)
    if (screen) {
      log.info(`Screen "${screen.name}" ready - opening code panel`)
      setActiveScreen(screen)
      setStreamOpen(false)
      setCodePanelVisible(true)
    }
  }

  function appGridPosition(index: number) {
    const COLS = 3
    const NODE_W = 320
    const NODE_H = 240
    const GAP_X = 60
    const GAP_Y = 60
    const col = index % COLS
    const row = Math.floor(index / COLS)
    return { x: col * (NODE_W + GAP_X), y: row * (NODE_H + GAP_Y) }
  }

  function handleAppPlan(screenNames: string[]) {
    // Only add placeholders if we're still on the generating project
    const { appGeneratingProjectId } = useGenerationStore.getState()
    if (useProjectStore.getState().activeProject?.id !== appGeneratingProjectId) return
    screenNames.forEach((name, index) => {
      addScreenNode(
        `plan-pending-${index}`,
        name,
        'html_tailwind',
        appGridPosition(index),
        undefined,
        true,
      )
    })
  }

  function handleRetryScreen(name: string, prompt: string, index: number) {
    const { lastAppRequest, generate } = useGenerationStore.getState()
    if (!lastAppRequest || !activeProject) return

    // Replace the failed placeholder with a fresh loading node
    removeScreenNode(`plan-pending-${index}`)
    addScreenNode(`plan-pending-${index}`, name, lastAppRequest.framework, appGridPosition(index), undefined, true)

    generate(
      {
        project_id: activeProject.id,
        prompt,
        framework: lastAppRequest.framework,
        model: lastAppRequest.model,
      },
      (frame) => {
        removeScreenNode(`plan-pending-${index}`)
        const { addScreenLocally } = useProjectStore.getState()
        const screen = {
          id: frame.screen_id,
          project_id: activeProject.id,
          name,
          framework: frame.framework,
          code: frame.full_code,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          thumbnail_data_url: null,
        }
        addScreenLocally(screen)
        addScreenNode(screen.id, screen.name, screen.framework, appGridPosition(index), screen.code)
      },
    )
  }

  function handleAppScreenDone(frame: AppScreenDoneFrame) {
    const { appGeneratingProjectId } = useGenerationStore.getState()
    const { activeProject: current, addScreenLocally } = useProjectStore.getState()

    const screen = {
      id: frame.screen_id,
      project_id: appGeneratingProjectId ?? '',
      name: frame.name,
      framework: frame.framework,
      code: frame.full_code,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      thumbnail_data_url: null,
    }

    // Only update canvas/local store if still viewing the generating project
    if (current?.id === appGeneratingProjectId) {
      removeScreenNode(`plan-pending-${frame.index}`)
      addScreenLocally(screen)
      addScreenNode(screen.id, screen.name, screen.framework, appGridPosition(frame.index), screen.code)
    }
  }

  // Screen corresponding to the currently selected canvas node (if any)
  const selectedCanvasScreen = (() => {
    const selectedNode = nodes.find((n) => n.selected && n.type === 'screen')
    if (!selectedNode) return null
    const screenId = (selectedNode.data as { screenId?: string }).screenId
    return screens.find((s) => s.id === screenId) ?? null
  })()

  function handlePlay() {
    const screen = activeScreen ?? selectedCanvasScreen ?? screens[0]
    if (screen) setPlayMode(true)
  }

  const playScreen = activeScreen ?? selectedCanvasScreen ?? screens[0] ?? null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--bg-app)',
      }}
    >
      <TopToolbar
        onPlayClick={screens.length > 0 ? handlePlay : undefined}
        onExportClick={screens.length > 0 ? () => setExportOpen(true) : undefined}
        onSettingsClick={() => setSettingsOpen(true)}
        onHomeClick={() => { setActiveScreen(null); setActiveProject(null) }}
        onNewProject={() => setProjectModalMode('create')}
        onDeleteProject={activeProject ? () => setProjectModalMode('delete') : undefined}
        modelRefreshKey={modelRefreshKey}
        hideModel={!activeProject}
      />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {sidebarVisible && <ProjectSidebar onNewProject={() => setProjectModalMode('create')} />}
        {/* Sidebar toggle tab */}
        <button
          onClick={() => setSidebarVisible((v) => !v)}
          title={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
          style={{
            position: 'absolute',
            left: sidebarVisible ? 220 : 0,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 30,
            width: 14,
            height: 40,
            borderRadius: sidebarVisible ? '0 4px 4px 0' : '0 4px 4px 0',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderLeft: sidebarVisible ? 'none' : '1px solid var(--border)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 9,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          {sidebarVisible ? '‹' : '›'}
        </button>
        <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <ActivityLog />
          {(activeProject && screens.length > 0) ? (
            <>
              <CanvasRoot />
              <PromptPanel
                onStreamOpen={() => setCodePanelVisible(false)}
                onNewScreen={handleNewScreen}
                onAppStreamOpen={() => setAppProgressOpen(true)}
                onAppPlan={handleAppPlan}
                onAppScreenDone={handleAppScreenDone}
              />
            </>
          ) : (
            <LandingView
              onNewScreen={handleNewScreen}
              onAppStreamOpen={() => setAppProgressOpen(true)}
              onAppPlan={handleAppPlan}
              onAppScreenDone={handleAppScreenDone}
            />
          )}

          <GenerationStream
            visible={isGenerating && !generatingScreenId && generatingProjectId === activeProject?.id}
            onClose={() => { useGenerationStore.getState().abort(); setCodePanelVisible(true) }}
          />

          <MultiScreenProgress
            visible={(appProgressOpen || isGeneratingApp) && appGeneratingProjectId === activeProject?.id}
            onClose={() => setAppProgressOpen(false)}
            onRetryScreen={handleRetryScreen}
          />

          {/* Workspace panel toggle tab */}
          {activeProject && (screens.length > 0 || isGeneratingApp || designMd.length > 0) && (
            <button
              onClick={() => setCodePanelVisible((v) => !v)}
              title={codePanelVisible ? 'Hide workspace' : 'Show workspace'}
              style={{
                position: 'absolute',
                right: codePanelVisible ? codePanelWidth : 0,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 30,
                width: 14,
                height: 40,
                borderRadius: '4px 0 0 4px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRight: codePanelVisible ? 'none' : '1px solid var(--border)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 9,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              {codePanelVisible ? '›' : '‹'}
            </button>
          )}

          {activeProject && (screens.length > 0 || isGeneratingApp || designMd.length > 0) && codePanelVisible && (
            <WorkspacePanel
              width={codePanelWidth}
              onWidthChange={setCodePanelWidth}
              onClose={() => setCodePanelVisible(false)}
            />
          )}
        </main>
      </div>

      {/* Completion toast */}
      {toast && (
        <div
          key={toast.key}
          style={{
            position: 'fixed',
            top: 52,
            right: 16,
            zIndex: 200,
            padding: '8px 14px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            fontSize: 12,
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            animation: 'toastIn 0.2s ease',
            pointerEvents: 'none',
          }}
        >
          <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 13 }}>✓</span>
          {toast.message}
        </div>
      )}

      {/* Play Mode full-screen overlay */}
      {playMode && playScreen && (
        <PlayModeRunner
          initialScreen={playScreen}
          onExit={() => setPlayMode(false)}
        />
      )}

      {/* Export modal */}
      {exportOpen && (
        <ExportModal
          screens={screens}
          activeScreen={activeScreen}
          project={activeProject}
          onClose={() => setExportOpen(false)}
        />
      )}

      {/* Model settings modal */}
      {settingsOpen && (
        <ModelSettingsModal
          onClose={() => setSettingsOpen(false)}
          onModelsReloaded={() => setModelRefreshKey((k) => k + 1)}
        />
      )}

      {/* Project create/delete modal */}
      {projectModalMode && (
        <ProjectModal
          mode={projectModalMode}
          onClose={() => setProjectModalMode(null)}
        />
      )}

      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  )
}
