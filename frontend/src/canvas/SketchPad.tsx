import type { ReactElement } from 'react'
import { useRef, useEffect, useState } from 'react'

type Tool = 'pen' | 'eraser' | 'line' | 'rect' | 'ellipse' | 'arrow' | 'text'

interface SketchPadProps {
  onClose: () => void
  onSubmit: (dataUrl: string) => void
}

const SWATCHES = ['#1c1c1c', '#6b7280', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6']

const TOOLS: { id: Tool; label: string; title: string }[] = [
  { id: 'pen',     label: '✏',  title: 'Pen'      },
  { id: 'eraser',  label: '⌫',  title: 'Eraser'   },
  { id: 'line',    label: '╱',  title: 'Line'      },
  { id: 'rect',    label: '□',  title: 'Rectangle' },
  { id: 'ellipse', label: '○',  title: 'Ellipse'   },
  { id: 'arrow',   label: '→',  title: 'Arrow'     },
  { id: 'text',    label: 'T',  title: 'Text'      },
]

export function SketchPad({ onClose, onSubmit }: SketchPadProps): ReactElement {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const isDrawing    = useRef(false)
  const lastPos      = useRef<{ x: number; y: number } | null>(null)
  const startPos     = useRef<{ x: number; y: number } | null>(null)
  const snapshotRef  = useRef<ImageData | null>(null)

  const [tool,       setTool]       = useState<Tool>('pen')
  const [strokeSize, setStrokeSize] = useState(3)
  const [color,      setColor]      = useState('#1c1c1c')
  const [fillShape,  setFillShape]  = useState(false)
  const [textInput,  setTextInput]  = useState('')
  const [textPos,    setTextPos]    = useState<{ cx: number; cy: number; sx: number; sy: number } | null>(null)
  const textInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }, [])

  function getPos(e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top)  * (canvas.height / rect.height),
    }
  }

  function drawShape(
    ctx: CanvasRenderingContext2D,
    start: { x: number; y: number },
    end:   { x: number; y: number },
  ) {
    ctx.strokeStyle = color
    ctx.lineWidth   = strokeSize
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'

    if (tool === 'line') {
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()

    } else if (tool === 'rect') {
      ctx.beginPath()
      ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y)
      if (fillShape) { ctx.fillStyle = color; ctx.globalAlpha = 0.15; ctx.fill(); ctx.globalAlpha = 1 }
      ctx.stroke()

    } else if (tool === 'ellipse') {
      const rx = Math.abs(end.x - start.x) / 2
      const ry = Math.abs(end.y - start.y) / 2
      const cx = (start.x + end.x) / 2
      const cy = (start.y + end.y) / 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2)
      if (fillShape) { ctx.fillStyle = color; ctx.globalAlpha = 0.15; ctx.fill(); ctx.globalAlpha = 1 }
      ctx.stroke()

    } else if (tool === 'arrow') {
      const dx = end.x - start.x
      const dy = end.y - start.y
      const len = Math.hypot(dx, dy)
      if (len < 2) return
      const headLen = Math.min(20, len / 3)
      const angle = Math.atan2(dy, dx)
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(end.x, end.y)
      ctx.lineTo(
        end.x - headLen * Math.cos(angle - Math.PI / 6),
        end.y - headLen * Math.sin(angle - Math.PI / 6),
      )
      ctx.moveTo(end.x, end.y)
      ctx.lineTo(
        end.x - headLen * Math.cos(angle + Math.PI / 6),
        end.y - headLen * Math.sin(angle + Math.PI / 6),
      )
      ctx.stroke()
    }
  }

  function getFontSize() {
    return strokeSize === 2 ? 16 : strokeSize === 4 ? 22 : 32
  }

  function commitText() {
    if (!textPos) return
    if (textInput.trim()) {
      const canvas = canvasRef.current!
      const ctx = canvas.getContext('2d')!
      const fs = getFontSize()
      ctx.font = `${fs}px sans-serif`
      ctx.fillStyle = color
      ctx.fillText(textInput, textPos.cx, textPos.cy)
    }
    setTextPos(null)
    setTextInput('')
  }

  function cancelText() {
    setTextPos(null)
    setTextInput('')
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (tool === 'text') {
      commitText()
      const canvas = canvasRef.current!
      const rect = canvas.getBoundingClientRect()
      const cp = getPos(e)
      setTextPos({ cx: cp.x, cy: cp.y, sx: e.clientX - rect.left, sy: e.clientY - rect.top })
      setTextInput('')
      setTimeout(() => textInputRef.current?.focus(), 0)
      return
    }
    isDrawing.current = true
    const pos = getPos(e)
    lastPos.current  = pos
    startPos.current = pos
    if (tool !== 'pen' && tool !== 'eraser') {
      const ctx = canvasRef.current!.getContext('2d')!
      snapshotRef.current = ctx.getImageData(0, 0, canvasRef.current!.width, canvasRef.current!.height)
    }
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pos = getPos(e)

    if (tool === 'pen') {
      if (!lastPos.current) return
      ctx.beginPath()
      ctx.moveTo(lastPos.current.x, lastPos.current.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.strokeStyle = color
      ctx.lineWidth   = strokeSize
      ctx.lineCap     = 'round'
      ctx.lineJoin    = 'round'
      ctx.stroke()
      lastPos.current = pos
    } else if (tool === 'eraser') {
      if (!lastPos.current) return
      ctx.beginPath()
      ctx.moveTo(lastPos.current.x, lastPos.current.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth   = strokeSize * 5
      ctx.lineCap     = 'round'
      ctx.lineJoin    = 'round'
      ctx.stroke()
      lastPos.current = pos
    } else {
      if (snapshotRef.current) ctx.putImageData(snapshotRef.current, 0, 0)
      if (startPos.current)    drawShape(ctx, startPos.current, pos)
    }
  }

  function onMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isDrawing.current && tool !== 'pen' && tool !== 'eraser') {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (ctx && snapshotRef.current && startPos.current) {
        ctx.putImageData(snapshotRef.current, 0, 0)
        drawShape(ctx, startPos.current, getPos(e))
      }
    }
    isDrawing.current  = false
    lastPos.current    = null
    startPos.current   = null
    snapshotRef.current = null
  }

  function onMouseLeave() {
    if (isDrawing.current && tool !== 'pen' && tool !== 'eraser' && snapshotRef.current) {
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) ctx.putImageData(snapshotRef.current, 0, 0)
    }
    isDrawing.current  = false
    lastPos.current    = null
    startPos.current   = null
    snapshotRef.current = null
  }

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  function handleSubmit() {
    const dataUrl = canvasRef.current?.toDataURL('image/png') ?? ''
    onSubmit(dataUrl)
  }

  const toolBtn = (active: boolean): React.CSSProperties => ({
    width: 32,
    height: 32,
    borderRadius: 'var(--radius-md)',
    border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
    background: active ? 'var(--bg-subtle)' : 'transparent',
    color: active ? 'var(--primary)' : 'var(--text-secondary)',
    fontSize: 14,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  })

  const shapeFill = fillShape && (tool === 'rect' || tool === 'ellipse')

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column' }}
      >
        {/* Row 1 - title + clear/cancel */}
        <div style={{ height: 48, padding: '0 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', flex: 1 }}>Sketch wireframe</span>
          <button
            onClick={clear}
            style={{ height: 28, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
          >Clear</button>
          <button
            onClick={onClose}
            style={{ height: 28, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
          >Cancel</button>
        </div>

        {/* Row 2 - tools + size + colors + fill */}
        <div style={{ height: 44, padding: '0 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Tool buttons */}
          {TOOLS.map((t) => (
            <button key={t.id} title={t.title} style={toolBtn(tool === t.id)} onClick={() => setTool(t.id)}>
              {t.label}
            </button>
          ))}

          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

          {/* Stroke size */}
          <select
            value={strokeSize}
            onChange={(e) => setStrokeSize(Number(e.target.value))}
            style={{ height: 28, padding: '0 6px', fontSize: 11, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text)', cursor: 'pointer' }}
          >
            <option value={2}>Thin</option>
            <option value={4}>Medium</option>
            <option value={7}>Thick</option>
          </select>

          {/* Fill toggle (only relevant for rect/ellipse) */}
          {(tool === 'rect' || tool === 'ellipse') && (
            <button
              title="Fill shape"
              onClick={() => setFillShape((f) => !f)}
              style={{ ...toolBtn(shapeFill), width: 'auto', padding: '0 8px', fontSize: 11, gap: 4 }}
            >
              Fill
            </button>
          )}

          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

          {/* Color swatches */}
          {SWATCHES.map((c) => (
            <button
              key={c}
              title={c}
              onClick={() => setColor(c)}
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: c,
                border: color === c ? '2px solid var(--primary)' : '2px solid transparent',
                outline: color === c ? '1px solid var(--bg-surface)' : 'none',
                outlineOffset: -3,
                cursor: 'pointer',
                flexShrink: 0,
                padding: 0,
              }}
            />
          ))}

          {/* Custom color picker */}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            title="Custom color"
            style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid var(--border)', cursor: 'pointer', padding: 0, background: 'none' }}
          />
        </div>

        {/* Canvas */}
        <div style={{ position: 'relative', lineHeight: 0 }}>
          <canvas
            ref={canvasRef}
            width={800}
            height={540}
            style={{
              display: 'block',
              background: '#ffffff',
              maxWidth: '80vw',
              maxHeight: '60vh',
              cursor: tool === 'eraser' ? 'cell' : tool === 'text' ? 'text' : 'crosshair',
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
          />
          {textPos && (
            <input
              ref={textInputRef}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitText() }
                if (e.key === 'Escape') cancelText()
              }}
              onBlur={commitText}
              style={{
                position: 'absolute',
                left: textPos.sx,
                top: textPos.sy - getFontSize(),
                background: 'transparent',
                border: 'none',
                borderBottom: `1px dashed ${color}`,
                outline: 'none',
                color: color,
                fontSize: getFontSize(),
                fontFamily: 'sans-serif',
                minWidth: 40,
                padding: 0,
                lineHeight: 1,
                caretColor: color,
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)' }}>
            Draw your wireframe, then type a description and generate UI from it
          </span>
          <button
            onClick={handleSubmit}
            style={{ height: 34, padding: '0 16px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', border: 'none', color: 'var(--text-inverse)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-ui)' }}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><polygon points="2,2 14,8 2,14" /></svg>
            Attach sketch
          </button>
        </div>
      </div>
    </div>
  )
}
