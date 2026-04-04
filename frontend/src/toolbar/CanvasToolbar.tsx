import type { ReactElement } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useCanvasStore } from '../store/canvas'

interface CanvasToolbarProps {
  onSketch?: () => void
}

export function CanvasToolbar({ onSketch }: CanvasToolbarProps): ReactElement {
  const { zoomIn, zoomOut, fitView, screenToFlowPosition } = useReactFlow()
  const gridVisible = useCanvasStore((s) => s.gridVisible)
  const toggleGrid = useCanvasStore((s) => s.toggleGrid)
  const addAnnotationNode = useCanvasStore((s) => s.addAnnotationNode)

  const btnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: 14,
    transition: 'var(--transition-fast)',
  }

  function handleAddNote() {
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    })
    addAnnotationNode({ x: center.x - 100, y: center.y - 60 })
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        zIndex: 5,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)',
        padding: 4,
      }}
    >
      <button style={btnStyle} onClick={() => zoomIn()} title="Zoom in">
        +
      </button>
      <button style={btnStyle} onClick={() => zoomOut()} title="Zoom out">
        −
      </button>
      <button style={btnStyle} onClick={() => fitView({ padding: 0.2 })} title="Fit to screen">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3" />
        </svg>
      </button>
      <button
        style={{ ...btnStyle, color: gridVisible ? 'var(--primary)' : 'var(--text-muted)' }}
        onClick={toggleGrid}
        title={gridVisible ? 'Hide grid' : 'Show grid'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      </button>
      <button
        style={btnStyle}
        onClick={handleAddNote}
        title="Add sticky note"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="9" y1="13" x2="15" y2="13"/>
          <line x1="9" y1="17" x2="12" y2="17"/>
        </svg>
      </button>
      {onSketch && (
        <button
          style={btnStyle}
          onClick={onSketch}
          title="Sketch wireframe"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
          </svg>
        </button>
      )}
    </div>
  )
}
