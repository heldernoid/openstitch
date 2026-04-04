import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useReactFlow,
} from '@xyflow/react'
import type { NodeTypes, EdgeTypes, Connection } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ScreenNode } from './ScreenNode'
import { AnnotationNode } from './AnnotationNode'
import { ImageNode } from './ImageNode'
import { FlowEdge } from './FlowEdge'
import { SketchPad } from './SketchPad'
import { useCanvasStore } from '../store/canvas'
import { useProjectStore } from '../store/project'
import { useGenerationStore } from '../store/generation'
import { projectsApi, flowEdgesApi, screensApi } from '../lib/api'
import { log } from '../store/log'
import { CanvasToolbar } from '../toolbar/CanvasToolbar'

const NODE_TYPES: NodeTypes = {
  screen: ScreenNode as NodeTypes[string],
  annotation: AnnotationNode as NodeTypes[string],
  image: ImageNode as NodeTypes[string],
}

const EDGE_TYPES: EdgeTypes = {
  flowEdge: FlowEdge as EdgeTypes[string],
}

function CanvasInner(): ReactElement {
  const nodes = useCanvasStore((s) => s.nodes)
  const edges = useCanvasStore((s) => s.edges)
  const gridVisible = useCanvasStore((s) => s.gridVisible)
  const onNodesChange = useCanvasStore((s) => s.onNodesChange)
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange)
  const addEdge = useCanvasStore((s) => s.addEdge)
  const removeEdge = useCanvasStore((s) => s.removeEdge)
  const pushHistory = useCanvasStore((s) => s.pushHistory)
  const addImageNode = useCanvasStore((s) => s.addImageNode)
  const toSnapshot = useCanvasStore((s) => s.toSnapshot)
  const activeProject = useProjectStore((s) => s.activeProject)
  const setActiveScreen = useProjectStore((s) => s.setActiveScreen)
  const removeScreenLocally = useProjectStore((s) => s.removeScreenLocally)
  const screens = useProjectStore((s) => s.screens)
  const setPendingImage = useGenerationStore((s) => s.setPendingImage)

  const { screenToFlowPosition, fitView, setCenter } = useReactFlow()
  const focusNodeId = useCanvasStore((s) => s.focusNodeId)
  const clearFocusNode = useCanvasStore((s) => s.clearFocusNode)
  const [sketchOpen, setSketchOpen] = useState(false)

  // Fit the canvas view whenever the active project changes.
  // We set a flag on project change and clear it once nodes become non-empty,
  // so the fit runs after Effect B in App.tsx has populated the canvas.
  const needsFitRef = useRef(false)
  const activeProjectId = useProjectStore((s) => s.activeProject?.id)

  useEffect(() => {
    needsFitRef.current = true
  }, [activeProjectId])

  useEffect(() => {
    if (needsFitRef.current && nodes.length > 0) {
      needsFitRef.current = false
      // Small delay lets ReactFlow measure node dimensions before fitting
      const t = setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 80)
      return () => clearTimeout(t)
    }
  }, [nodes.length, fitView])

  // Centre viewport on node when selected from sidebar
  useEffect(() => {
    if (!focusNodeId) return
    const node = useCanvasStore.getState().nodes.find((n) => n.id === focusNodeId)
    clearFocusNode()
    if (!node) return
    const w = (node.measured?.width ?? (node.style?.width as number | undefined) ?? 320)
    const h = (node.measured?.height ?? (node.style?.height as number | undefined) ?? 240)
    setCenter(node.position.x + w / 2, node.position.y + h / 2, { duration: 350 })
  }, [focusNodeId, setCenter, clearFocusNode])

  const saveCanvasDebounced = useMemo(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    return (projectId: string, snapshot: string) => {
      // Update in-memory snapshot immediately so switching back to this project
      // loads correct positions (DB save is debounced below)
      useProjectStore.getState().updateProjectCanvas(projectId, snapshot)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        projectsApi.saveCanvas(projectId, snapshot).catch(() => undefined)
      }, 500)
    }
  }, [])

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      // Push history for destructive changes (delete) or drag end
      const hasDestructive = changes.some((c) => c.type === 'remove')
      const hasDragEnd = changes.some(
        (c) => c.type === 'position' && (c as { dragging?: boolean }).dragging === false,
      )
      if (hasDestructive || hasDragEnd) pushHistory()

      // When a screen node is removed, delete it from the DB too so it
      // doesn't resurface on next page load via loadScreens.
      for (const change of changes) {
        if (change.type === 'remove') {
          const node = useCanvasStore.getState().nodes.find((n) => n.id === change.id)
          if (node?.type === 'screen') {
            const screenId = (node.data as { screenId?: string }).screenId ?? change.id
            removeScreenLocally(screenId)
            screensApi.delete(screenId).catch(() => undefined)
            log.info(`Screen deleted: ${screenId.slice(0, 8)}`)
          }
        }
      }

      onNodesChange(changes)
      if (activeProject) {
        saveCanvasDebounced(activeProject.id, toSnapshot())
      }
    },
    [onNodesChange, pushHistory, removeScreenLocally, activeProject, saveCanvasDebounced, toSnapshot],
  )

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      const hasRemove = changes.some((c) => c.type === 'remove')
      if (hasRemove) pushHistory()
      for (const change of changes) {
        if (change.type === 'remove' && activeProject) {
          flowEdgesApi.delete(activeProject.id, change.id).catch(() => undefined)
        }
      }
      onEdgesChange(changes)
      if (activeProject) {
        saveCanvasDebounced(activeProject.id, toSnapshot())
      }
    },
    [onEdgesChange, pushHistory, activeProject, saveCanvasDebounced, toSnapshot],
  )

  const handleConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target || !activeProject) return
      pushHistory()
      flowEdgesApi
        .create(activeProject.id, {
          source_screen_id: params.source,
          target_screen_id: params.target,
          trigger_selector: '',
          label: '',
        })
        .then(({ id }) => {
          addEdge({
            id,
            source: params.source!,
            target: params.target!,
            type: 'flowEdge',
            data: { triggerSelector: '', projectId: activeProject.id },
          })
          saveCanvasDebounced(activeProject.id, toSnapshot())
        })
        .catch(() => undefined)
    },
    [activeProject, addEdge, removeEdge, saveCanvasDebounced, toSnapshot],
  )

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      const screen = screens.find((s) => s.id === node.id)
      if (screen) setActiveScreen(screen)
    },
    [screens, setActiveScreen],
  )

  const handlePaneClick = useCallback(() => {
    setActiveScreen(null)
  }, [setActiveScreen])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (!file || !file.type.startsWith('image/')) return
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const reader = new FileReader()
      reader.onload = () => {
        addImageNode(reader.result as string, file.name, pos)
        if (activeProject) {
          saveCanvasDebounced(activeProject.id, toSnapshot())
        }
      }
      reader.readAsDataURL(file)
    },
    [screenToFlowPosition, addImageNode, activeProject, saveCanvasDebounced, toSnapshot],
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  function handleSketchSubmit(dataUrl: string) {
    setSketchOpen(false)
    setPendingImage(dataUrl)
    log.info('Sketch submitted - image attached to next generation')
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'var(--bg-canvas)' }}
      >
        {gridVisible && (
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="var(--border)"
          />
        )}
        {/* Arrow markers for flow edges */}
        <svg style={{ position: 'absolute', width: 0, height: 0 }}>
          <defs>
            <marker id="arrow-active" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary)" />
            </marker>
            <marker id="arrow-dim" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(245,158,11,0.5)" />
            </marker>
          </defs>
        </svg>
      </ReactFlow>
      <CanvasToolbar onSketch={() => setSketchOpen(true)} />

      {sketchOpen && (
        <SketchPad
          onClose={() => setSketchOpen(false)}
          onSubmit={handleSketchSubmit}
        />
      )}
    </div>
  )
}

export function CanvasRoot(): ReactElement {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  )
}
