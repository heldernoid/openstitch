import type { ReactElement } from 'react'

interface DiffLine {
  type: 'add' | 'remove' | 'context'
  content: string
  lineNo: number
}

interface Hunk {
  lines: DiffLine[]
}

/** Compute a line-by-line diff between two code strings. */
function computeDiff(before: string, after: string): Hunk[] {
  const bLines = before.split('\n')
  const aLines = after.split('\n')

  // Build LCS table (space-optimised: only track edit types)
  const m = bLines.length
  const n = aLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (bLines[i - 1] === aLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Trace back to build diff lines
  const raw: DiffLine[] = []
  let i = m, j = n, lineNo = 0

  function walk(ci: number, cj: number): void {
    if (ci === 0 && cj === 0) return
    if (ci > 0 && cj > 0 && bLines[ci - 1] === aLines[cj - 1]) {
      walk(ci - 1, cj - 1)
      raw.push({ type: 'context', content: bLines[ci - 1], lineNo: ++lineNo })
    } else if (cj > 0 && (ci === 0 || dp[ci][cj - 1] >= dp[ci - 1][cj])) {
      walk(ci, cj - 1)
      raw.push({ type: 'add', content: aLines[cj - 1], lineNo: ++lineNo })
    } else {
      walk(ci - 1, cj)
      raw.push({ type: 'remove', content: bLines[ci - 1], lineNo: ++lineNo })
    }
  }

  walk(i, j)

  // Split into hunks (groups of changed lines + up to 3 context lines each side)
  const CONTEXT = 3
  const hunks: Hunk[] = []
  let hunkLines: DiffLine[] = []
  let lastChanged = -1

  for (let k = 0; k < raw.length; k++) {
    if (raw[k].type !== 'context') {
      // Include up to CONTEXT lines before
      const start = Math.max(0, k - CONTEXT)
      if (hunkLines.length === 0 && start > 0) {
        for (let s = start; s < k; s++) hunkLines.push(raw[s])
      }
      hunkLines.push(raw[k])
      lastChanged = k
    } else if (lastChanged >= 0 && k - lastChanged <= CONTEXT) {
      hunkLines.push(raw[k])
    } else if (hunkLines.length > 0) {
      hunks.push({ lines: hunkLines })
      hunkLines = []
      lastChanged = -1
    }
  }
  if (hunkLines.length > 0) hunks.push({ lines: hunkLines })

  return hunks
}

interface DiffViewProps {
  before: string
  after: string
  /** If provided, shown above the diff */
  prompt?: string
  onAccept?: () => void
  onRevert?: () => void
}

export function DiffView({ before, after, prompt, onAccept, onRevert }: DiffViewProps): ReactElement {
  const hunks = computeDiff(before, after)
  const added = hunks.flatMap((h) => h.lines).filter((l) => l.type === 'add').length
  const removed = hunks.flatMap((h) => h.lines).filter((l) => l.type === 'remove').length

  return (
    <div
      style={{
        background: 'var(--bg-app)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
      }}
    >
      {/* Banner */}
      <div
        style={{
          padding: '8px 12px',
          background: 'rgba(245,158,11,0.06)',
          borderBottom: '1px solid rgba(245,158,11,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {prompt && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginBottom: 2,
              }}
            >
              "{prompt}"
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ color: 'var(--status-green)' }}>+{added}</span>
            <span style={{ color: 'var(--status-red)' }}>−{removed}</span>
          </div>
        </div>
        {onAccept && (
          <button
            onClick={onAccept}
            style={{
              height: 22,
              padding: '0 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.3)',
              color: 'var(--status-green)',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
          >
            Accept
          </button>
        )}
        {onRevert && (
          <button
            onClick={onRevert}
            style={{
              height: 22,
              padding: '0 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              fontSize: 10,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
          >
            Revert
          </button>
        )}
      </div>

      {/* Diff lines */}
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {hunks.length === 0 ? (
          <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 11 }}>
            No changes
          </div>
        ) : (
          hunks.map((hunk, hi) => (
            <div key={hi}>
              <div
                style={{
                  padding: '2px 12px',
                  background: 'rgba(59,130,246,0.05)',
                  borderTop: hi > 0 ? '1px solid var(--border)' : undefined,
                  borderBottom: '1px solid var(--border)',
                  color: '#7b9ef0',
                  fontSize: 10,
                }}
              >
                @@ hunk {hi + 1}
              </div>
              {hunk.lines.map((line, li) => (
                <div
                  key={li}
                  style={{
                    padding: '0 12px',
                    lineHeight: '1.65',
                    background:
                      line.type === 'add'
                        ? 'rgba(34,197,94,0.07)'
                        : line.type === 'remove'
                          ? 'rgba(239,68,68,0.07)'
                          : 'transparent',
                    color:
                      line.type === 'add'
                        ? '#4ade80'
                        : line.type === 'remove'
                          ? '#f87171'
                          : 'var(--text-muted)',
                    textDecoration: line.type === 'remove' ? 'line-through' : undefined,
                    whiteSpace: 'pre',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                  {line.content}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
