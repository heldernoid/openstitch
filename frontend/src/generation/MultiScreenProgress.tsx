import type { ReactElement } from 'react'
import { useGenerationStore } from '../store/generation'
import type { AppScreenProgress } from '../store/generation'

interface MultiScreenProgressProps {
  visible: boolean
  onClose: () => void
  onRetryScreen?: (name: string, prompt: string, index: number) => void
}

function StatusIcon({ status }: { status: AppScreenProgress['status'] }): ReactElement {
  if (status === 'done') {
    return <span style={{ color: '#22c55e', fontSize: 13, fontWeight: 700, width: 16, textAlign: 'center' }}>✓</span>
  }
  if (status === 'failed') {
    return <span style={{ color: 'var(--status-red)', fontSize: 13, fontWeight: 700, width: 16, textAlign: 'center' }}>✕</span>
  }
  if (status === 'generating') {
    return (
      <span style={{ display: 'flex', gap: 2, alignItems: 'center', width: 16, justifyContent: 'center' }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 3,
              height: 3,
              borderRadius: '50%',
              background: 'var(--primary)',
              display: 'inline-block',
              animation: `msdot 0.6s ease ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </span>
    )
  }
  return <span style={{ color: 'var(--border-strong)', fontSize: 11, width: 16, textAlign: 'center' }}>○</span>
}

export function MultiScreenProgress({ visible, onClose, onRetryScreen }: MultiScreenProgressProps): ReactElement | null {
  const isGeneratingApp = useGenerationStore((s) => s.isGeneratingApp)
  const appPlan = useGenerationStore((s) => s.appPlan)
  const appError = useGenerationStore((s) => s.appError)
  const abortApp = useGenerationStore((s) => s.abortApp)
  const lastAppRequest = useGenerationStore((s) => s.lastAppRequest)

  if (!visible) return null

  const doneCount = appPlan.filter((p) => p.status === 'done').length
  const failedCount = appPlan.filter((p) => p.status === 'failed').length
  const totalCount = appPlan.length

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 420,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-xl)',
        overflow: 'hidden',
        zIndex: 16,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Grid icon */}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--primary)" strokeWidth="1.5">
            <rect x="1" y="1" width="6" height="6" rx="1"/>
            <rect x="9" y="1" width="6" height="6" rx="1"/>
            <rect x="1" y="9" width="6" height="6" rx="1"/>
            <rect x="9" y="9" width="6" height="6" rx="1"/>
          </svg>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            {isGeneratingApp
              ? totalCount > 0
                ? `Generating app… (${doneCount}/${totalCount})`
                : 'Planning screens…'
              : appError
              ? 'Generation failed'
              : failedCount > 0
              ? `${doneCount}/${totalCount} screens · ${failedCount} failed`
              : `App generated · ${totalCount} screens`}
          </span>
          <button
            onClick={() => { if (isGeneratingApp) abortApp(); onClose() }}
            style={{
              width: 22,
              height: 22,
              borderRadius: 'var(--radius-sm)',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* Original prompt */}
        {lastAppRequest?.prompt && (
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            lineHeight: 1.4,
            paddingLeft: 24,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}>
            "{lastAppRequest.prompt}"
          </div>
        )}
      </div>

      {/* Progress list */}
      <div style={{ padding: '10px 0' }}>
        {appPlan.length === 0 && isGeneratingApp && (
          <div
            style={{
              padding: '16px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 12,
              color: 'var(--text-muted)',
            }}
          >
            <span style={{ display: 'flex', gap: 3 }}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: 'var(--primary)',
                    display: 'inline-block',
                    animation: `msdot 0.6s ease ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </span>
            Asking model to plan the screens…
          </div>
        )}

        {appPlan.map((p) => (
          <div
            key={p.index}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '7px 14px',
              background: p.status === 'generating'
                ? 'var(--bg-subtle)'
                : p.status === 'failed'
                ? 'rgba(239,68,68,0.05)'
                : 'transparent',
              borderLeft: `2px solid ${
                p.status === 'done' ? '#22c55e'
                : p.status === 'generating' ? 'var(--primary)'
                : p.status === 'failed' ? 'var(--status-red)'
                : 'transparent'
              }`,
            }}
          >
            <StatusIcon status={p.status} />
            <span
              style={{
                flex: 1,
                fontSize: 12,
                fontWeight: p.status === 'generating' ? 600 : 400,
                color: p.status === 'pending' ? 'var(--text-muted)'
                  : p.status === 'failed' ? 'var(--status-red)'
                  : 'var(--text)',
              }}
            >
              {p.name}
            </span>
            {p.status === 'failed' && onRetryScreen && p.failedPrompt && (
              <button
                onClick={() => onRetryScreen(p.name, p.failedPrompt!, p.index)}
                style={{
                  height: 22,
                  padding: '0 8px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--status-red)',
                  background: 'transparent',
                  color: 'var(--status-red)',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Retry
              </button>
            )}
            {p.status === 'done' && (
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {p.tokenCount} tokens
              </span>
            )}
            {p.status === 'generating' && (
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {p.tokenCount}…
              </span>
            )}
          </div>
        ))}

        {appError && (
          <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--status-red)' }}>
            {appError}
          </div>
        )}
      </div>

      {/* Footer: progress bar when generating */}
      {isGeneratingApp && totalCount > 0 && (
        <div
          style={{
            height: 3,
            background: 'var(--bg-subtle)',
          }}
        >
          <div
            style={{
              height: '100%',
              background: 'var(--primary)',
              width: `${(doneCount / totalCount) * 100}%`,
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes msdot {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
