import type { ReactElement } from 'react'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { buildSrcdoc, captureThumbnail, injectDesignModeScript } from './sandbox-utils'

export interface SelectedElement {
  id: string
  tagName: string
  htmlId: string
  className: string
  rect: { left: number; top: number; width: number; height: number }
  computedStyles: Record<string, string>
  textContent: string
  isLeaf: boolean
  /** Nearest button/a ancestor - the element play mode will actually match against */
  navAncestor?: { tagName: string; htmlId: string; className: string } | null
}

export interface ScreenPreviewHandle {
  applyOverride(id: string, styles: Record<string, string>): void
  applyText(id: string, text: string): void
}

interface ScreenPreviewProps {
  framework: string
  code: string
  onThumbnail?: (dataUrl: string) => void
  interactive?: boolean
  designMode?: boolean
  onElementSelect?: (el: SelectedElement) => void
  overrides?: Record<string, Record<string, string>>
  textOverrides?: Record<string, { original: string; current: string }>
}

export const ScreenPreview = forwardRef<ScreenPreviewHandle, ScreenPreviewProps>(
  function ScreenPreview(
    { framework, code, onThumbnail, interactive = false, designMode = false, onElementSelect, overrides, textOverrides },
    ref,
  ): ReactElement {
    const containerRef = useRef<HTMLDivElement>(null)
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const [scale, setScale] = useState(1)
    const [hoverRect, setHoverRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

    const baseSrcdoc = buildSrcdoc(framework, code)
    const srcdoc = designMode ? injectDesignModeScript(baseSrcdoc) : baseSrcdoc

    useImperativeHandle(ref, () => ({
      applyOverride(id, styles) {
        iframeRef.current?.contentWindow?.postMessage({ type: 'os:apply', id, styles }, '*')
      },
      applyText(id, text) {
        iframeRef.current?.contentWindow?.postMessage({ type: 'os:text', id, text }, '*')
      },
    }), [])

    // Scale to container width
    useEffect(() => {
      const el = containerRef.current
      if (!el) return
      const ro = new ResizeObserver((entries) => {
        const w = entries[0].contentRect.width
        if (w > 0) setScale(w / 1280)
      })
      ro.observe(el)
      return () => ro.disconnect()
    }, [])

    // Listen for postMessages from iframe in design mode
    useEffect(() => {
      if (!designMode) {
        setHoverRect(null)
        return
      }
      function handler(e: MessageEvent) {
        if (!e.data) return
        const { type, id, rect, tagName, computedStyles } = e.data as Record<string, unknown>
        if (type === 'os:hover') {
          if (!id || !rect) {
            setHoverRect(null)
          } else {
            const r = rect as { left: number; top: number; width: number; height: number }
            setHoverRect({ left: r.left * scale, top: r.top * scale, width: r.width * scale, height: r.height * scale })
          }
        } else if (type === 'os:select' && onElementSelect) {
          const r = rect as { left: number; top: number; width: number; height: number }
          const d = e.data as Record<string, unknown>
          onElementSelect({
            id: String(id),
            tagName: String(tagName),
            htmlId: String(d.htmlId ?? ''),
            className: String(d.className ?? ''),
            rect: { left: r.left * scale, top: r.top * scale, width: r.width * scale, height: r.height * scale },
            computedStyles: computedStyles as Record<string, string>,
            textContent: String(d.textContent ?? ''),
            isLeaf: Boolean(d.isLeaf),
            navAncestor: d.navAncestor as { tagName: string; htmlId: string; className: string } | null ?? null,
          })
        }
      }
      window.addEventListener('message', handler)
      return () => window.removeEventListener('message', handler)
    }, [designMode, scale, onElementSelect])

    // Re-apply overrides after iframe reloads
    function handleLoad() {
      if (overrides) {
        const iframe = iframeRef.current
        if (iframe?.contentWindow) {
          for (const [id, styles] of Object.entries(overrides)) {
            iframe.contentWindow.postMessage({ type: 'os:apply', id, styles }, '*')
          }
        }
      }
      if (textOverrides) {
        const iframe = iframeRef.current
        if (iframe?.contentWindow) {
          for (const [id, { current }] of Object.entries(textOverrides)) {
            iframe.contentWindow.postMessage({ type: 'os:text', id, text: current }, '*')
          }
        }
      }
      if (!onThumbnail || !iframeRef.current) return
      setTimeout(() => {
        if (!iframeRef.current) return
        captureThumbnail(iframeRef.current).then(onThumbnail).catch(() => undefined)
      }, 800)
    }

    const iframeHeight = scale > 0 ? Math.ceil((containerRef.current?.clientHeight ?? 600) / scale) : 960

    return (
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', background: '#fff' }}
      >
        <iframe
          ref={iframeRef}
          srcDoc={srcdoc}
          sandbox="allow-scripts allow-same-origin"
          onLoad={handleLoad}
          title="Screen preview"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '1280px',
            height: `${iframeHeight}px`,
            border: 'none',
            transformOrigin: 'top left',
            transform: `scale(${scale})`,
            pointerEvents: (interactive || designMode) ? 'auto' : 'none',
          }}
        />
        {/* Hover outline overlay */}
        {designMode && hoverRect && (
          <div
            style={{
              position: 'absolute',
              left: hoverRect.left,
              top: hoverRect.top,
              width: hoverRect.width,
              height: hoverRect.height,
              border: '1.5px dashed #f59e0b',
              pointerEvents: 'none',
              zIndex: 10,
              boxSizing: 'border-box',
            }}
          />
        )}
      </div>
    )
  },
)
