import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { buildSrcdoc } from './sandbox-utils'
import { resolveNavigation } from '../lib/flow-resolver'
import { useCanvasStore } from '../store/canvas'
import { useProjectStore } from '../store/project'
import type { Screen } from '../lib/api'

interface PlayModeRunnerProps {
  initialScreen: Screen
  onExit: () => void
}

export function PlayModeRunner({ initialScreen, onExit }: PlayModeRunnerProps): ReactElement {
  const [currentScreen, setCurrentScreen] = useState<Screen>(initialScreen)
  const [history, setHistory] = useState<Screen[]>([initialScreen])
  const [fading, setFading] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const edges = useCanvasStore((s) => s.edges)
  const screens = useProjectStore((s) => s.screens)
  const activeProject = useProjectStore((s) => s.activeProject)

  const navigate = useCallback(
    (targetId: string) => {
      const target = screens.find((s) => s.id === targetId)
      if (!target) return
      setFading(true)
      setTimeout(() => {
        setCurrentScreen(target)
        setHistory((h) => [...h, target])
        setFading(false)
      }, 180)
    },
    [screens],
  )

  // Listen for postMessage navigate events from the iframe
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!event.data || event.data.type !== 'navigate') return
      const targetId = resolveNavigation(edges, currentScreen.id, {
        selector:  event.data.selector  as string,
        htmlId:    event.data.htmlId    as string | undefined,
        text:      event.data.text      as string | undefined,
        className: event.data.className as string | undefined,
        tagName:   event.data.tagName   as string | undefined,
        path:      event.data.path      as import('../lib/flow-resolver').PathElement[] | undefined,
      })
      if (targetId) navigate(targetId)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [edges, currentScreen.id, navigate])

  // Esc to exit
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  const srcdoc = buildSrcdoc(currentScreen.framework, currentScreen.code)

  // Outgoing edges from the current screen → show as quick-nav chips
  const linkedScreens = edges
    .filter((e) => e.source === currentScreen.id)
    .map((e) => {
      const screen = screens.find((s) => s.id === e.target)
      if (!screen) return null
      const trigger = (e.data as { triggerSelector?: string } | undefined)?.triggerSelector ?? ''
      return { screen, trigger }
    })
    .filter((x): x is { screen: Screen; trigger: string } => x !== null)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-app)',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          height: 48,
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: 14,
          flexShrink: 0,
        }}
      >
        <button
          onClick={onExit}
          title="Exit Play Mode (Esc)"
          style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--radius-md)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
          }}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 16 16">
            <path d="M10 3L4 8l6 5"/>
          </svg>
        </button>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
            {activeProject?.name ?? 'Play Mode'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Play Mode</div>
        </div>

        {/* Breadcrumb */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            overflowX: 'auto',
          }}
        >
          {history.map((screen, idx) => {
            const isCurrent = idx === history.length - 1
            return (
              <div key={`${screen.id}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {idx > 0 && (
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>›</span>
                )}
                <button
                  onClick={() => {
                    if (isCurrent) return
                    setFading(true)
                    setTimeout(() => {
                      setCurrentScreen(screen)
                      setHistory((h) => h.slice(0, idx + 1))
                      setFading(false)
                    }, 180)
                  }}
                  style={{
                    height: 24,
                    padding: '0 10px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 11,
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    background: isCurrent ? 'rgba(245,158,11,0.15)' : 'var(--bg-subtle)',
                    color: isCurrent ? 'var(--primary)' : 'var(--text-secondary)',
                    border: `1px solid ${isCurrent ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
                    cursor: isCurrent ? 'default' : 'pointer',
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: isCurrent ? 'var(--primary)' : 'var(--status-green)',
                    }}
                  />
                  {screen.name}
                </button>
              </div>
            )
          })}
        </div>

        <span
          style={{
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '3px 8px',
          }}
        >
          Esc to exit
        </span>
      </div>

      {/* Preview area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          background: 'var(--bg-app)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            maxWidth: 1280,
            borderRadius: 'var(--radius-xl)',
            overflow: 'hidden',
            border: '1px solid var(--border-strong)',
            boxShadow: 'var(--shadow-xl)',
            opacity: fading ? 0 : 1,
            transition: 'opacity 0.18s ease',
          }}
        >
          <iframe
            ref={iframeRef}
            key={currentScreen.id}
            srcDoc={srcdoc}
            sandbox="allow-scripts allow-same-origin"
            title={currentScreen.name}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: 'block',
            }}
          />
        </div>

        {/* Navigation strip */}
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            maxWidth: 'calc(100% - 48px)',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {linkedScreens.length > 0 ? (
            <>
              <span style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.4)',
                backdropFilter: 'blur(8px)',
                background: 'rgba(28,28,28,0.7)',
                padding: '4px 8px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid rgba(255,255,255,0.08)',
                whiteSpace: 'nowrap',
              }}>
                Go to →
              </span>
              {linkedScreens.map(({ screen, trigger }) => (
                <button
                  key={screen.id}
                  onClick={() => navigate(screen.id)}
                  title={trigger ? `Trigger: ${trigger}` : undefined}
                  style={{
                    height: 30,
                    padding: '0 12px',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(28,28,28,0.85)',
                    border: '1px solid rgba(245,158,11,0.35)',
                    color: 'var(--primary)',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(245,158,11,0.15)'
                    ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(245,158,11,0.7)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(28,28,28,0.85)'
                    ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(245,158,11,0.35)'
                  }}
                >
                  <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="3,2 14,8 3,14" fill="currentColor" stroke="none"/>
                  </svg>
                  {screen.name}
                </button>
              ))}
            </>
          ) : (
            <div style={{
              height: 30,
              padding: '0 14px',
              background: 'rgba(28,28,28,0.85)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 'var(--radius-full)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 11,
              color: 'rgba(255,255,255,0.4)',
              backdropFilter: 'blur(8px)',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--primary)', animation: 'pulse 1.5s ease infinite' }} />
              Click linked elements to navigate
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.8)}}`}</style>
    </div>
  )
}
