import { create } from 'zustand'
import type { Node, Edge, NodeChange, EdgeChange, XYPosition } from '@xyflow/react'

export interface ScreenNodeData extends Record<string, unknown> {
  screenId: string
  name: string
  framework: string
  code: string
  thumbnailDataUrl: string | null
  hasCode: boolean
  loading?: boolean
}

// CanvasNode uses the base Node type to support screen, image, and annotation nodes
type CanvasNode = Node

const MAX_HISTORY = 50

interface CanvasState {
  nodes: CanvasNode[]
  edges: Edge[]
  gridVisible: boolean
  _history: string[]
  _future: string[]

  setNodes: (nodes: CanvasNode[]) => void
  setEdges: (edges: Edge[]) => void
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void

  addScreenNode: (screenId: string, name: string, framework: string, position?: XYPosition, code?: string, loading?: boolean) => void
  updateScreenNode: (screenId: string, patch: Partial<ScreenNodeData>) => void
  removeScreenNode: (screenId: string) => void
  addImageNode: (dataUrl: string, name: string, position: XYPosition) => void
  addAnnotationNode: (position: XYPosition) => void
  updateNodeData: (nodeId: string, patch: Record<string, unknown>) => void
  addEdge: (edge: Edge) => void
  removeEdge: (edgeId: string) => void
  updateEdgeData: (edgeId: string, patch: Record<string, unknown>) => void

  loadFromSnapshot: (json: string | null) => void
  toSnapshot: () => string
  pushHistory: () => void
  undo: () => void
  redo: () => void

  toggleGrid: () => void

  selectNode: (id: string) => void
  focusNodeId: string | null
  clearFocusNode: () => void

  screenOverrides: Record<string, Record<string, Record<string, string>>>
  setElementOverride: (screenId: string, dataOsId: string, styles: Record<string, string>) => void
  clearElementOverride: (screenId: string, dataOsId: string) => void
  clearAllOverrides: (screenId: string) => void
  screenTextOverrides: Record<string, Record<string, { original: string; current: string }>>
  setTextOverride: (screenId: string, dataOsId: string, text: string, originalText: string) => void
  clearTextOverride: (screenId: string, dataOsId: string) => void
  clearAllTextOverrides: (screenId: string) => void

  triggerPickEdgeId: string | null
  triggerPickScreenId: string | null
  _onTriggerPicked: ((selector: string) => void) | null
  startTriggerPick: (edgeId: string, screenId: string, onPicked: (selector: string) => void) => void
  completeTriggerPick: (selector: string) => void
  clearTriggerPick: () => void
}

function nextAutoPosition(existingNodes: CanvasNode[]): XYPosition {
  const OFFSET = 360
  const col = existingNodes.length % 4
  const row = Math.floor(existingNodes.length / 4)
  return { x: 40 + col * OFFSET, y: 40 + row * OFFSET }
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  gridVisible: true,
  _history: [],
  _future: [],
  focusNodeId: null,
  screenOverrides: {},
  screenTextOverrides: {},
  triggerPickEdgeId: null,
  triggerPickScreenId: null,
  _onTriggerPicked: null,

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  onNodesChange: (changes) => {
    set((s) => {
      let nodes = [...s.nodes]
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          nodes = nodes.map((n) =>
            n.id === change.id ? { ...n, position: change.position! } : n,
          )
        } else if (change.type === 'dimensions' && change.dimensions) {
          nodes = nodes.map((n) => {
            if (n.id !== change.id) return n
            const updated = { ...n, measured: { width: change.dimensions!.width, height: change.dimensions!.height } }
            // When NodeResizer is actively resizing, persist the new size to node.style
            if ((change as { resizing?: boolean }).resizing) {
              updated.style = { ...n.style, width: change.dimensions!.width, height: change.dimensions!.height }
            }
            return updated
          })
        } else if (change.type === 'select') {
          nodes = nodes.map((n) =>
            n.id === change.id ? { ...n, selected: change.selected } : n,
          )
        } else if (change.type === 'remove') {
          nodes = nodes.filter((n) => n.id !== change.id)
        }
      }
      return { nodes }
    })
  },

  onEdgesChange: (changes) => {
    set((s) => {
      let edges = [...s.edges]
      for (const change of changes) {
        if (change.type === 'select') {
          edges = edges.map((e) =>
            e.id === change.id ? { ...e, selected: change.selected } : e,
          )
        } else if (change.type === 'remove') {
          edges = edges.filter((e) => e.id !== change.id)
        }
      }
      return { edges }
    })
  },

  addScreenNode: (screenId, name, framework, position, code, loading) => {
    const pos = position ?? nextAutoPosition(get().nodes)
    const node: CanvasNode = {
      id: screenId,
      type: 'screen',
      position: pos,
      data: { screenId, name, framework, code: code ?? '', thumbnailDataUrl: null, hasCode: !!code, loading },
      style: { width: 320, height: 240 },
    }
    set((s) => ({ nodes: [...s.nodes, node] }))
  },

  updateScreenNode: (screenId, patch) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === screenId ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    }))
  },

  removeScreenNode: (screenId) => {
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== screenId),
      edges: s.edges.filter((e) => e.source !== screenId && e.target !== screenId),
    }))
  },

  addImageNode: (dataUrl, name, position) => {
    const id = crypto.randomUUID()
    const node: CanvasNode = {
      id,
      type: 'image',
      position,
      data: { dataUrl, originalName: name },
      style: { width: 320, height: 240 },
    }
    set((s) => ({ nodes: [...s.nodes, node] }))
  },

  addAnnotationNode: (position) => {
    const id = crypto.randomUUID()
    const node: CanvasNode = {
      id,
      type: 'annotation',
      position,
      data: { text: '', color: 'rgba(245,158,11,0.08)' },
      style: { width: 200, height: 120 },
    }
    set((s) => ({ nodes: [...s.nodes, node] }))
  },

  updateNodeData: (nodeId, patch) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    }))
  },

  addEdge: (edge) => set((s) => ({ edges: [...s.edges, edge] })),

  removeEdge: (edgeId) => set((s) => ({ edges: s.edges.filter((e) => e.id !== edgeId) })),

  updateEdgeData: (edgeId, patch) => {
    set((s) => ({
      edges: s.edges.map((e) =>
        e.id === edgeId ? { ...e, data: { ...(e.data ?? {}), ...patch } } : e,
      ),
    }))
  },

  loadFromSnapshot: (json) => {
    if (!json) {
      set({ nodes: [], edges: [], _history: [], _future: [] })
      return
    }
    try {
      const snap = JSON.parse(json) as { nodes?: CanvasNode[]; edges?: Edge[] }
      set({ nodes: snap.nodes ?? [], edges: snap.edges ?? [], _history: [], _future: [] })
    } catch {
      // corrupt snapshot - ignore
    }
  },

  toSnapshot: () => {
    const { nodes, edges } = get()
    return JSON.stringify({ nodes, edges })
  },

  pushHistory: () => {
    const snapshot = get().toSnapshot()
    set((s) => ({
      _history: [...s._history.slice(-MAX_HISTORY + 1), snapshot],
      _future: [],
    }))
  },

  undo: () => {
    const { _history, toSnapshot } = get()
    if (_history.length === 0) return
    const current = toSnapshot()
    const prev = _history[_history.length - 1]
    try {
      const snap = JSON.parse(prev) as { nodes?: CanvasNode[]; edges?: Edge[] }
      set((s) => ({
        nodes: snap.nodes ?? [],
        edges: snap.edges ?? [],
        _history: s._history.slice(0, -1),
        _future: [current, ...s._future.slice(0, MAX_HISTORY - 1)],
      }))
    } catch {
      // corrupt - just clear
      set((s) => ({ _history: s._history.slice(0, -1) }))
    }
  },

  redo: () => {
    const { _future, toSnapshot } = get()
    if (_future.length === 0) return
    const current = toSnapshot()
    const next = _future[0]
    try {
      const snap = JSON.parse(next) as { nodes?: CanvasNode[]; edges?: Edge[] }
      set((s) => ({
        nodes: snap.nodes ?? [],
        edges: snap.edges ?? [],
        _history: [...s._history.slice(-MAX_HISTORY + 1), current],
        _future: s._future.slice(1),
      }))
    } catch {
      set((s) => ({ _future: s._future.slice(1) }))
    }
  },

  toggleGrid: () => set((s) => ({ gridVisible: !s.gridVisible })),

  selectNode: (id) => {
    set((s) => ({
      nodes: s.nodes.map((n) => ({ ...n, selected: n.id === id })),
      focusNodeId: id,
    }))
  },
  clearFocusNode: () => set({ focusNodeId: null }),

  setElementOverride: (screenId, dataOsId, styles) => {
    set((s) => ({
      screenOverrides: {
        ...s.screenOverrides,
        [screenId]: { ...(s.screenOverrides[screenId] ?? {}), [dataOsId]: styles },
      },
    }))
  },

  clearElementOverride: (screenId, dataOsId) => {
    set((s) => {
      const existing = { ...(s.screenOverrides[screenId] ?? {}) }
      delete existing[dataOsId]
      return { screenOverrides: { ...s.screenOverrides, [screenId]: existing } }
    })
  },

  clearAllOverrides: (screenId) => {
    set((s) => {
      const updated = { ...s.screenOverrides }
      delete updated[screenId]
      return { screenOverrides: updated }
    })
  },

  setTextOverride: (screenId, dataOsId, text, originalText) => {
    set((s) => {
      const existing = s.screenTextOverrides[screenId]?.[dataOsId]
      return {
        screenTextOverrides: {
          ...s.screenTextOverrides,
          [screenId]: {
            ...(s.screenTextOverrides[screenId] ?? {}),
            [dataOsId]: { original: existing?.original ?? originalText, current: text },
          },
        },
      }
    })
  },

  clearTextOverride: (screenId, dataOsId) => {
    set((s) => {
      const existing = { ...(s.screenTextOverrides[screenId] ?? {}) }
      delete existing[dataOsId]
      return { screenTextOverrides: { ...s.screenTextOverrides, [screenId]: existing } }
    })
  },

  clearAllTextOverrides: (screenId) => {
    set((s) => {
      const updated = { ...s.screenTextOverrides }
      delete updated[screenId]
      return { screenTextOverrides: updated }
    })
  },

  startTriggerPick: (edgeId, screenId, onPicked) => {
    set({ triggerPickEdgeId: edgeId, triggerPickScreenId: screenId, _onTriggerPicked: onPicked })
  },
  completeTriggerPick: (selector) => {
    const { _onTriggerPicked } = get()
    _onTriggerPicked?.(selector)
    set({ triggerPickEdgeId: null, triggerPickScreenId: null, _onTriggerPicked: null })
  },
  clearTriggerPick: () => {
    set({ triggerPickEdgeId: null, triggerPickScreenId: null, _onTriggerPicked: null })
  },
}))
