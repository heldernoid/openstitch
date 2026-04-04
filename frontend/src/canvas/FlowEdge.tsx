import type { ReactElement } from 'react'
import { memo, useState, useRef, useEffect } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import { useCanvasStore } from '../store/canvas'
import type { FlowEdgeData } from '../lib/flow-resolver'

function FlowEdgeComponent({
  id,
  source,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps): ReactElement {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  })

  const edgeData = data as FlowEdgeData | undefined
  const [editing, setEditing] = useState(false)
  const [picking, setPicking] = useState(false)
  const [inputValue, setInputValue] = useState(edgeData?.triggerSelector ?? '')
  const inputRef = useRef<HTMLInputElement>(null)
  const updateEdgeData = useCanvasStore((s) => s.updateEdgeData)
  const startTriggerPick = useCanvasStore((s) => s.startTriggerPick)
  const clearTriggerPick = useCanvasStore((s) => s.clearTriggerPick)
  const triggerPickEdgeId = useCanvasStore((s) => s.triggerPickEdgeId)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  // If another edge started a pick, clear our picking state
  useEffect(() => {
    if (picking && triggerPickEdgeId !== id) {
      setPicking(false)
    }
  }, [triggerPickEdgeId, id, picking])

  function commitEdit() {
    setEditing(false)
    updateEdgeData(id, { triggerSelector: inputValue })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') { setEditing(false); setInputValue(edgeData?.triggerSelector ?? '') }
  }

  function handlePick() {
    // onMouseDown prevents blur, so we handle everything here
    setEditing(false)
    setPicking(true)
    startTriggerPick(id, source, (selector) => {
      setInputValue(selector)
      setPicking(false)
      updateEdgeData(id, { triggerSelector: selector })
    })
  }

  function handleCancelPick() {
    setPicking(false)
    clearTriggerPick()
  }

  const hasLabel = (edgeData?.triggerSelector ?? '').trim().length > 0

  return (
    <>
      <BaseEdge
        path={edgePath}
        style={{
          stroke: picking ? '#f59e0b' : selected ? 'var(--primary)' : 'rgba(245,158,11,0.5)',
          strokeWidth: picking ? 2 : selected ? 2 : 1.5,
          strokeDasharray: picking ? '6 3' : undefined,
        }}
        markerEnd={`url(#arrow-${selected || picking ? 'active' : 'dim'})`}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          {editing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleKeyDown}
                placeholder="button text or id"
                style={{
                  height: 22,
                  padding: '0 8px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--primary)',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text)',
                  outline: 'none',
                  width: 120,
                }}
              />
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={handlePick}
                title="Click an element on the source screen to auto-fill the trigger"
                style={{
                  height: 22,
                  padding: '0 8px',
                  background: 'rgba(245,158,11,0.15)',
                  border: '1px solid rgba(245,158,11,0.6)',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#f59e0b',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Pick
              </button>
            </div>
          ) : picking ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: 22,
                padding: '0 10px',
                background: 'rgba(245,158,11,0.15)',
                border: '1px solid rgba(245,158,11,0.6)',
                borderRadius: 'var(--radius-full)',
                fontSize: 10,
                fontWeight: 600,
                color: '#f59e0b',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#f59e0b',
                  animation: 'pickerPulse 1s ease infinite',
                  flexShrink: 0,
                }}
              />
              Picking…
              <button
                onClick={handleCancelPick}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 12,
                  color: '#f59e0b',
                  lineHeight: 1,
                  fontWeight: 700,
                }}
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              title="Click to set trigger selector"
              style={{
                height: 20,
                padding: '0 8px',
                background: hasLabel ? 'var(--bg-surface-raised)' : 'var(--bg-surface)',
                border: `1px solid ${selected || hasLabel ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-full)',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: hasLabel ? 'var(--primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                opacity: hasLabel ? 1 : 0.7,
              }}
            >
              {hasLabel ? edgeData?.triggerSelector : '+  set trigger'}
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
      <style>{`@keyframes pickerPulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </>
  )
}

export const FlowEdge = memo(FlowEdgeComponent)
