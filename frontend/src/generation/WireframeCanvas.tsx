import type { ReactElement, MouseEvent, TouchEvent } from 'react'
import { useRef, useEffect, useState } from 'react'

interface WireframeCanvasProps {
  onDone: (dataUrl: string) => void
  onCancel: () => void
}

export function WireframeCanvas({ onDone, onCancel }: WireframeCanvasProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const [penSize, setPenSize] = useState(2)
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [hasStrokes, setHasStrokes] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }, [])

  function getPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  function startDraw(e: MouseEvent | TouchEvent) {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    isDrawing.current = true
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function draw(e: MouseEvent | TouchEvent) {
    e.preventDefault()
    if (!isDrawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.lineWidth = tool === 'eraser' ? penSize * 6 : penSize
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : '#1a1a1a'
    ctx.lineTo(x, y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x, y)
    setHasStrokes(true)
  }

  function stopDraw() {
    isDrawing.current = false
  }

  function handleClear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasStrokes(false)
  }

  function handleDone() {
    const canvas = canvasRef.current
    if (!canvas) return
    onDone(canvas.toDataURL('image/png'))
  }

  const btnBase: React.CSSProperties = {
    height: 30, padding: '0 12px', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)', background: 'var(--bg-subtle)',
    color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'var(--font-ui)',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        padding: 16,
        boxShadow: 'var(--shadow-xl)',
        maxWidth: '90vw', maxHeight: '90vh',
      }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginRight: 4 }}>Wireframe</span>

          {/* Pen */}
          <button
            onClick={() => setTool('pen')}
            title="Pen"
            style={{ ...btnBase, background: tool === 'pen' ? 'var(--primary)' : 'var(--bg-subtle)', color: tool === 'pen' ? 'var(--text-inverse)' : 'var(--text-secondary)', border: 'none' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>

          {/* Eraser */}
          <button
            onClick={() => setTool('eraser')}
            title="Eraser"
            style={{ ...btnBase, background: tool === 'eraser' ? 'var(--primary)' : 'var(--bg-subtle)', color: tool === 'eraser' ? 'var(--text-inverse)' : 'var(--text-secondary)', border: 'none' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 20H7L3 16l10-10 7 7-2.5 2.5"/><path d="M6.0001 20L18 8"/>
            </svg>
          </button>

          {/* Pen size */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {[1, 2, 4].map((s) => (
              <button key={s} onClick={() => setPenSize(s)} title={`Size ${s}`} style={{
                width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                border: penSize === s ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: 'var(--bg-subtle)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: s * 2 + 2, height: s * 2 + 2, borderRadius: '50%', background: 'var(--text)' }} />
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* Clear */}
          <button onClick={handleClear} style={btnBase}>Clear</button>

          {/* Cancel */}
          <button onClick={onCancel} style={btnBase}>Cancel</button>

          {/* Done */}
          <button
            onClick={handleDone}
            disabled={!hasStrokes}
            style={{
              ...btnBase,
              background: hasStrokes ? 'var(--primary)' : 'var(--bg-subtle)',
              color: hasStrokes ? 'var(--text-inverse)' : 'var(--text-muted)',
              border: 'none',
              opacity: hasStrokes ? 1 : 0.5,
              cursor: hasStrokes ? 'pointer' : 'not-allowed',
            }}
          >
            Use drawing
          </button>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          width={900}
          height={600}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
          style={{
            display: 'block',
            width: '100%',
            maxWidth: 900,
            aspectRatio: '3/2',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            cursor: tool === 'eraser' ? 'cell' : 'crosshair',
            touchAction: 'none',
            background: '#fff',
          }}
        />
      </div>
    </div>
  )
}
