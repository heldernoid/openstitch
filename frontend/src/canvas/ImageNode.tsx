import type { ReactElement } from 'react'
import { memo, useState } from 'react'
import { NodeResizer } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import { useGenerationStore } from '../store/generation'

export interface ImageNodeData extends Record<string, unknown> {
  dataUrl: string
  originalName: string
}

export type ImageNodeType = Node<ImageNodeData, 'image'>

function ImageNodeComponent({ data, selected }: NodeProps<ImageNodeType>): ReactElement {
  const [hovered, setHovered] = useState(false)
  const setPendingImage = useGenerationStore((s) => s.setPendingImage)

  function handleGenerateUI(e: React.MouseEvent) {
    e.stopPropagation()
    setPendingImage(data.dataUrl as string)
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        border: selected ? '2px solid var(--primary)' : '1px solid var(--border)',
        boxShadow: selected ? '0 0 0 1px var(--primary)' : 'var(--shadow-md)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <NodeResizer
        minWidth={120}
        minHeight={80}
        isVisible={selected}
        lineStyle={{ borderColor: 'var(--primary)' }}
        handleStyle={{ background: 'var(--primary)', border: 'none', borderRadius: 2, width: 8, height: 8 }}
      />

      <img
        src={data.dataUrl as string}
        alt={(data.originalName as string | undefined) ?? 'Uploaded image'}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
          background: 'var(--bg-canvas)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
        draggable={false}
      />

      {/* Hover overlay: Generate UI button */}
      {(hovered || selected) && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '12px 8px 8px',
            background: 'linear-gradient(transparent, rgba(0,0,0,0.72))',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <button
            onClick={handleGenerateUI}
            style={{
              height: 28,
              padding: '0 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary)',
              border: 'none',
              color: 'var(--text-inverse)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontFamily: 'var(--font-ui)',
            }}
          >
            <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor">
              <polygon points="2,2 14,8 2,14" />
            </svg>
            Generate UI from image
          </button>
        </div>
      )}

      {/* Image label */}
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 6,
          height: 20,
          padding: '0 7px',
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(0,0,0,0.55)',
          display: 'flex',
          alignItems: 'center',
          fontSize: 10,
          fontWeight: 600,
          color: '#fff',
          letterSpacing: '0.04em',
          backdropFilter: 'blur(4px)',
          pointerEvents: 'none',
        }}
      >
        IMG
      </div>
    </div>
  )
}

export const ImageNode = memo(ImageNodeComponent)
