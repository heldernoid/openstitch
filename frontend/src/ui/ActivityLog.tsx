import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useLogStore } from '../store/log'
import type { LogLevel } from '../store/log'

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

const BADGE: Record<LogLevel, string> = {
  info:    '[INFO]',
  success: '[DONE]',
  error:   '[ERR!]',
  warn:    '[WARN]',
  dim:     '[····]',
  ws:      '[ WS ]',
  http:    '[HTTP]',
}

const BADGE_COLOR: Record<LogLevel, string> = {
  info:    '#7c9fdc',
  success: '#4ade80',
  error:   '#f87171',
  warn:    '#fbbf24',
  dim:     '#555e6e',
  ws:      '#a78bfa',
  http:    '#34d399',
}

const TEXT_COLOR: Record<LogLevel, string> = {
  info:    '#c9d1d9',
  success: '#4ade80',
  error:   '#f87171',
  warn:    '#fbbf24',
  dim:     '#555e6e',
  ws:      '#d2c4fa',
  http:    '#a7f3d0',
}

export function ActivityLog(): ReactElement {
  const entries = useLogStore((s) => s.entries)
  const streamingLine = useLogStore((s) => s.streamingLine)
  const clear = useLogStore((s) => s.clear)
  const [open, setOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)

  // Track whether the user manually scrolled away from the bottom
  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    userScrolledUp.current = !atBottom
  }

  // Auto-scroll to bottom only when user hasn't scrolled up
  useEffect(() => {
    if (open && scrollRef.current && !userScrolledUp.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, streamingLine, open])

  // Reset "scrolled up" flag when the panel is opened
  useEffect(() => {
    if (open) userScrolledUp.current = false
  }, [open])

  const latest = entries[entries.length - 1]
  const pillLabel = streamingLine ?? latest?.message

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: 64,
        zIndex: 14,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        pointerEvents: 'auto',
      }}
    >
      {/* Terminal panel */}
      {open && (
        <div
          style={{
            width: 520,
            height: 280,
            display: 'flex',
            flexDirection: 'column',
            background: '#0d1117',
            border: '1px solid #30363d',
            borderRadius: 8,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            marginBottom: 6,
            overflow: 'hidden',
            fontFamily: 'var(--font-mono, "SF Mono", "Fira Code", Consolas, monospace)',
          }}
        >
          {/* Title bar */}
          <div
            style={{
              height: 30,
              padding: '0 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#161b22',
              borderBottom: '1px solid #30363d',
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => setOpen(false)}
              style={{
                width: 16, height: 16,
                borderRadius: '50%',
                background: '#30363d',
                border: 'none',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#8b949e',
                fontSize: 11,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >×</button>
            <span style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#8b949e', letterSpacing: '0.05em' }}>
              openstitch - activity log
            </span>
            {entries.length > 0 && (
              <button
                onClick={clear}
                style={{
                  height: 18,
                  padding: '0 6px',
                  borderRadius: 4,
                  background: 'transparent',
                  border: '1px solid #30363d',
                  color: '#8b949e',
                  fontSize: 10,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                clear
              </button>
            )}
          </div>

          {/* Log content */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '6px 0 4px',
              scrollbarWidth: 'thin',
              scrollbarColor: '#30363d #0d1117',
            }}
          >
            {entries.length === 0 && !streamingLine ? (
              <div style={{ padding: '12px 12px', fontSize: 11, color: '#555e6e', textAlign: 'center' }}>
                Waiting for activity…
              </div>
            ) : (
              <>
                {entries.map((e) => (
                  <div
                    key={e.id}
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 0,
                      padding: '1px 10px',
                      lineHeight: 1.55,
                    }}
                  >
                    {/* Timestamp */}
                    <span style={{ fontSize: 10, color: '#444c56', flexShrink: 0, marginRight: 8 }}>
                      {fmtTime(e.timestamp)}
                    </span>
                    {/* Badge */}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: BADGE_COLOR[e.level],
                        flexShrink: 0,
                        marginRight: 8,
                        letterSpacing: '0.01em',
                      }}
                    >
                      {BADGE[e.level]}
                    </span>
                    {/* Message */}
                    <span
                      style={{
                        fontSize: 11,
                        color: TEXT_COLOR[e.level],
                        wordBreak: 'break-all',
                        flex: 1,
                      }}
                    >
                      {e.message}
                    </span>
                  </div>
                ))}

                {/* Live streaming line */}
                {streamingLine && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 0,
                      padding: '1px 10px',
                      lineHeight: 1.55,
                    }}
                  >
                    <span style={{ fontSize: 10, color: '#444c56', flexShrink: 0, marginRight: 8 }}>
                      {fmtTime(Date.now())}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', flexShrink: 0, marginRight: 8 }}>
                      [ WS ]
                    </span>
                    <span style={{ fontSize: 11, color: '#d2c4fa', flex: 1, wordBreak: 'break-all' }}>
                      {streamingLine}
                      <span style={{ animation: 'termBlink 1s step-end infinite', marginLeft: 1 }}>▋</span>
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Toggle pill */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          height: 26,
          padding: '0 10px',
          borderRadius: 13,
          background: open ? '#161b22' : 'var(--bg-surface)',
          border: open ? '1px solid #30363d' : '1px solid var(--border)',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          fontSize: 11,
          color: open ? '#8b949e' : 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
          transition: 'var(--transition-fast)',
        }}
      >
        {/* Status dot */}
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: streamingLine
              ? '#a78bfa'
              : latest
              ? BADGE_COLOR[latest.level]
              : '#444c56',
            flexShrink: 0,
            animation: streamingLine ? 'termBlink 1s step-end infinite' : undefined,
          }}
        />
        <span>{open ? 'hide log' : 'log'}</span>
        {!open && pillLabel && (
          <span
            style={{
              fontSize: 10,
              color: streamingLine ? '#a78bfa' : '#8b949e',
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {pillLabel}
          </span>
        )}
        {!open && (
          <span
            style={{
              fontSize: 10,
              color: '#555e6e',
              background: '#161b22',
              border: '1px solid #30363d',
              borderRadius: 3,
              padding: '0 4px',
            }}
          >
            {entries.length}
          </span>
        )}
      </button>

      <style>{`
        @keyframes termBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
