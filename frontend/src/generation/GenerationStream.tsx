import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useGenerationStore } from '../store/generation'

interface GenerationStreamProps {
  /** Whether the panel is visible */
  visible: boolean
  onClose: () => void
}

function formatElapsed(ms: number): string {
  if (ms <= 0) return '0.0s'
  const s = ms / 1000
  return s < 10 ? s.toFixed(1) + 's' : Math.round(s) + 's'
}

export function GenerationStream({ visible, onClose }: GenerationStreamProps): ReactElement | null {
  const accumulatedCode = useGenerationStore((s) => s.accumulatedCode)
  const tokenCount = useGenerationStore((s) => s.tokenCount)
  const isGenerating = useGenerationStore((s) => s.isGenerating)
  const error = useGenerationStore((s) => s.error)
  const abort = useGenerationStore((s) => s.abort)
  const startedAt = useGenerationStore((s) => s.startedAt)
  const tokensPerSec = useGenerationStore((s) => s.tokensPerSec)
  const lastDone = useGenerationStore((s) => s.lastDone)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Elapsed display: tick every 200ms while generating, freeze when done
  const [tick, setTick] = useState(0)
  const finalElapsedRef = useRef(0)

  useEffect(() => {
    if (!isGenerating || !startedAt) return
    finalElapsedRef.current = 0
    const id = setInterval(() => {
      finalElapsedRef.current = Date.now() - startedAt
      setTick((n) => n + 1)
    }, 200)
    return () => clearInterval(id)
  }, [isGenerating, startedAt])

  // Snapshot elapsed when generation finishes
  useEffect(() => {
    if (!isGenerating && startedAt && finalElapsedRef.current === 0) {
      finalElapsedRef.current = Date.now() - startedAt
    }
  }, [isGenerating, startedAt])

  // Auto-scroll to bottom as tokens arrive
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [accumulatedCode])

  void tick // consume to avoid lint warning

  if (!visible) return null

  const elapsedMs = isGenerating && startedAt
    ? Date.now() - startedAt
    : finalElapsedRef.current

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 360,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border)',
        zIndex: 25,
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 40,
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flex: 1 }}>
          {isGenerating ? 'Generating…' : error ? 'Error' : 'Generated code'}
        </span>
        {isGenerating && (
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {tokenCount}
            {tokensPerSec > 0 ? ` · ${tokensPerSec}/s` : ''}
            {' · '}{formatElapsed(elapsedMs)}
          </span>
        )}
        {isGenerating ? (
          <button
            onClick={abort}
            style={{
              height: 24,
              padding: '0 10px',
              background: 'transparent',
              border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--status-red)',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Stop
          </button>
        ) : (
          <button
            onClick={onClose}
            style={{
              width: 24,
              height: 24,
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              borderRadius: 'var(--radius-sm)',
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div
          style={{
            padding: '12px 14px',
            background: 'var(--status-red-bg)',
            borderBottom: '1px solid rgba(239,68,68,0.2)',
            fontSize: 12,
            color: 'var(--status-red)',
            flexShrink: 0,
          }}
        >
          {error}
        </div>
      )}

      {/* Code scroll area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          background: 'var(--bg-app)',
        }}
      >
        <pre
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            lineHeight: 1.7,
            color: 'var(--text-mono)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            margin: 0,
          }}
        >
          {accumulatedCode}
          {isGenerating && (
            <span
              style={{
                display: 'inline-block',
                width: 7,
                height: 13,
                background: 'var(--primary)',
                verticalAlign: 'middle',
                marginLeft: 2,
                animation: 'blink 0.7s ease infinite',
              }}
            />
          )}
        </pre>
      </div>

      {/* Footer - completion summary */}
      {!isGenerating && !error && accumulatedCode && (
        <div
          style={{
            height: 36,
            padding: '0 12px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
          }}
        >
          {lastDone?.model && (
            <span
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              {lastDone.model}
            </span>
          )}
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', flexShrink: 0 }}>
            {tokenCount} tokens · {formatElapsed(finalElapsedRef.current)}
          </span>
        </div>
      )}

      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
    </div>
  )
}
