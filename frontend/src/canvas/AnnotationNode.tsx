import type { ReactElement } from 'react'
import { memo, useState, useCallback } from 'react'
import { NodeResizer } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import { useCanvasStore } from '../store/canvas'

export interface AnnotationNodeData extends Record<string, unknown> {
  text: string
  color: string
}

export type AnnotationNodeType = Node<AnnotationNodeData, 'annotation'>

const PALETTE = [
  { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  swatch: '#f59e0b' },
  { bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.25)',   swatch: '#22c55e' },
  { bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.25)',  swatch: '#3b82f6' },
  { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)',   swatch: '#ef4444' },
  { bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.25)', swatch: '#a855f7' },
]

function AnnotationNodeComponent({ id, data, selected }: NodeProps<AnnotationNodeType>): ReactElement {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const updateNodeData = useCanvasStore((s) => s.updateNodeData)

  const startEdit = useCallback(() => {
    setDraft((data.text as string | undefined) ?? '')
    setEditing(true)
  }, [data.text])

  const commitEdit = useCallback(() => {
    setEditing(false)
    updateNodeData(id, { text: draft })
  }, [id, draft, updateNodeData])

  function handleTextareaKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') setEditing(false)
    e.stopPropagation()
  }

  const storedColor = (data.color as string | undefined) ?? PALETTE[0].bg
  const palette = PALETTE.find((p) => p.bg === storedColor) ?? PALETTE[0]

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: '28px 10px 10px',
        background: palette.bg,
        borderRadius: 'var(--radius-md)',
        boxShadow: selected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        position: 'relative',
        border: selected ? `1.5px solid var(--primary)` : `1px solid ${palette.border}`,
        boxSizing: 'border-box',
      }}
    >
      <NodeResizer
        minWidth={140}
        minHeight={80}
        isVisible={selected}
        lineStyle={{ borderColor: 'var(--primary)' }}
        handleStyle={{ background: 'var(--primary)', border: 'none', borderRadius: 2, width: 8, height: 8 }}
      />

      {/* Color swatches */}
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {PALETTE.map((p) => (
          <button
            key={p.bg}
            onClick={(e) => {
              e.stopPropagation()
              updateNodeData(id, { color: p.bg })
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: p.swatch,
              border: p.bg === palette.bg ? `2px solid ${p.swatch}` : `1px solid ${p.border}`,
              cursor: 'pointer',
              flexShrink: 0,
              padding: 0,
              opacity: p.bg === palette.bg ? 1 : 0.5,
            }}
          />
        ))}
      </div>

      {/* Text area */}
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            e.stopPropagation()
          }}
          onBlur={commitEdit}
          onKeyDown={handleTextareaKey}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            height: 'calc(100% - 18px)',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontFamily: 'var(--font-ui)',
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            padding: 0,
          }}
        />
      ) : (
        <div
          onDoubleClick={startEdit}
          style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: 1.5,
            minHeight: 40,
            cursor: 'text',
            userSelect: 'none',
            height: 'calc(100% - 18px)',
            overflow: 'hidden',
          }}
        >
          {(data.text as string | undefined) || (
            <span style={{ opacity: 0.4, fontStyle: 'italic' }}>Double-click to edit…</span>
          )}
        </div>
      )}
    </div>
  )
}

export const AnnotationNode = memo(AnnotationNodeComponent)
