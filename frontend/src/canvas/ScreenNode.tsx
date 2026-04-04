import type { ReactElement } from 'react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Handle, Position, NodeResizer } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import type { ScreenNodeData } from '../store/canvas'
import { useCanvasStore } from '../store/canvas'
import { useProjectStore } from '../store/project'
import { screensApi } from '../lib/api'
import { FRAMEWORK_MAP } from '../lib/frameworks'
import { ScreenPreview } from '../preview/ScreenPreview'
import type { ScreenPreviewHandle, SelectedElement } from '../preview/ScreenPreview'
import { PropertiesPanel } from '../editor/PropertiesPanel'
import { buildOverrideStyleBlock, parseExistingOverrides } from '../preview/sandbox-utils'

export type ScreenNodeType = Node<ScreenNodeData, 'screen'>

function ScreenNodeComponent({ data, selected }: NodeProps<ScreenNodeType>): ReactElement {
  const fw = FRAMEWORK_MAP[data.framework as keyof typeof FRAMEWORK_MAP]
  const updateScreenNode = useCanvasStore((s) => s.updateScreenNode)
  const updateScreenLocally = useProjectStore((s) => s.updateScreenLocally)
  const screenOverrides = useCanvasStore((s) => s.screenOverrides[data.screenId] ?? {})
  const setElementOverride = useCanvasStore((s) => s.setElementOverride)
  const clearElementOverride = useCanvasStore((s) => s.clearElementOverride)
  const clearAllOverrides = useCanvasStore((s) => s.clearAllOverrides)
  const screenTextOverrides = useCanvasStore((s) => s.screenTextOverrides[data.screenId] ?? {})
  const setTextOverride = useCanvasStore((s) => s.setTextOverride)
  const clearTextOverride = useCanvasStore((s) => s.clearTextOverride)
  const clearAllTextOverrides = useCanvasStore((s) => s.clearAllTextOverrides)

  const triggerPickScreenId = useCanvasStore((s) => s.triggerPickScreenId)
  const completeTriggerPick = useCanvasStore((s) => s.completeTriggerPick)
  const clearTriggerPick = useCanvasStore((s) => s.clearTriggerPick)
  const pickMode = triggerPickScreenId === data.screenId

  const [designMode, setDesignMode] = useState(false)
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null)
  const [panelPos, setPanelPos] = useState({ x: 0, y: 0 })
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(data.name)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const nodeRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<ScreenPreviewHandle>(null)

  const handleThumbnail = useCallback(
    (dataUrl: string) => {
      updateScreenNode(data.screenId, { thumbnailDataUrl: dataUrl })
      screensApi
        .patch(data.screenId, { thumbnail_data_url: dataUrl })
        .then((updated) => updateScreenLocally(updated))
        .catch(() => undefined)
    },
    [data.screenId, updateScreenNode, updateScreenLocally],
  )

  function startRename() {
    setNameValue(data.name)
    setEditingName(true)
    setTimeout(() => { nameInputRef.current?.select() }, 0)
  }

  function commitRename() {
    const trimmed = nameValue.trim()
    setEditingName(false)
    if (!trimmed || trimmed === data.name) return
    updateScreenNode(data.screenId, { name: trimmed })
    screensApi.patch(data.screenId, { name: trimmed })
      .then((updated) => updateScreenLocally(updated))
      .catch(() => undefined)
  }

  function toggleDesignMode() {
    const next = !designMode
    setDesignMode(next)
    if (!next) {
      setSelectedElement(null)
    } else if (nodeRef.current) {
      const rect = nodeRef.current.getBoundingClientRect()
      setPanelPos({ x: rect.right + 8, y: rect.top })
    }
  }

  // Update panel position on canvas pan/zoom while in design mode
  useEffect(() => {
    if (!designMode) return
    function update() {
      if (nodeRef.current) {
        const rect = nodeRef.current.getBoundingClientRect()
        setPanelPos({ x: rect.right + 8, y: rect.top })
      }
    }
    const interval = setInterval(update, 200)
    return () => clearInterval(interval)
  }, [designMode])

  function bestTriggerSelector(el: SelectedElement): string {
    const nav = el.navAncestor
    const targetId = nav?.htmlId || el.htmlId
    if (targetId && targetId !== 'null' && targetId !== 'undefined' && targetId !== '') return `#${targetId}`
    const text = el.textContent?.trim() ?? ''
    if (text && text.length >= 2 && text.length <= 40 && !/[\n\r]/.test(text))
      return `:contains("${text}")`
    if (nav?.className) {
      const classes = nav.className.split(/\s+/).filter((c) => c && !c.includes(':') && c.length <= 20).slice(0, 2)
      if (classes.length > 0) return `${nav.tagName.toLowerCase()}.${classes.join('.')}`
      return nav.tagName.toLowerCase()
    }
    const classes = el.className.split(/\s+/).filter((c) => c && !c.includes(':') && c.length <= 20).slice(0, 2)
    if (classes.length > 0) return `${el.tagName.toLowerCase()}.${classes.join('.')}`
    return el.tagName.toLowerCase()
  }

  function handleElementSelect(el: SelectedElement) {
    if (pickMode) {
      completeTriggerPick(bestTriggerSelector(el))
      return
    }
    setSelectedElement(el)
    if (nodeRef.current) {
      const rect = nodeRef.current.getBoundingClientRect()
      setPanelPos({ x: rect.right + 8, y: rect.top })
    }
  }

  function handleStyleChange(id: string, property: string, value: string) {
    setElementOverride(data.screenId, id, { ...screenOverrides[id], [property]: value })
    previewRef.current?.applyOverride(id, { ...(screenOverrides[id] ?? {}), [property]: value })
  }

  function handleReset(id: string) {
    clearElementOverride(data.screenId, id)
    clearTextOverride(data.screenId, id)
    previewRef.current?.applyOverride(id, {})
    setSelectedElement(null)
  }

  function handleTextChange(id: string, text: string) {
    setTextOverride(data.screenId, id, text, selectedElement?.textContent ?? '')
    previewRef.current?.applyText(id, text)
  }

  function handleApply() {
    const hasText = Object.values(screenTextOverrides).some(({ original, current }) => original !== current)
    if (Object.keys(screenOverrides).length === 0 && !hasText) return

    // Merge previously saved CSS rules with the new session overrides so accumulated
    // changes are never lost when the user applies multiple times.
    const existingOverrides = parseExistingOverrides(data.code as string)
    const mergedOverrides: Record<string, Record<string, string>> = { ...existingOverrides }
    for (const [id, styles] of Object.entries(screenOverrides)) {
      mergedOverrides[id] = { ...(mergedOverrides[id] ?? {}), ...styles }
    }
    const styleBlock = buildOverrideStyleBlock(mergedOverrides)

    // Remove the old style block - we'll re-insert the merged one
    let base = (data.code as string)
      .replace(/<style id="__os_applied">[\s\S]*?<\/style>\n?/i, '')

    // Apply text changes directly in the HTML source - avoids fragile runtime ID mapping.
    // Escape HTML entities in original so it matches what's actually in the source.
    for (const { original, current } of Object.values(screenTextOverrides)) {
      if (!original || original === current) continue
      const escaped = original
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // Match the text between tag boundaries with optional surrounding whitespace
      base = base.replace(new RegExp(`(>[ \\t\\r\\n]*)${escaped}([ \\t\\r\\n]*<)`, 'g'), `$1${current}$2`)
    }

    // id-assigner goes in <head>; style block goes just before </body> so it loads
    // AFTER Tailwind's dynamically injected stylesheet, winning the cascade without !important.
    const needsIdScript = styleBlock && !base.includes('__os_id_assigner')
    const idScript = needsIdScript
      ? `<script id="__os_id_assigner">(function(){function a(){var n=0;document.querySelectorAll('body *').forEach(function(e){var t=e.tagName;if(t==='SCRIPT'||t==='STYLE')return;if(!e.dataset.osId)e.dataset.osId='os-'+(++n);});}document.readyState==='loading'?document.addEventListener('DOMContentLoaded',a):a();}());<\/script>`
      : ''

    let merged = base
    // Inject id-assigner into <head>
    if (idScript) {
      merged = /<\/head>/i.test(merged)
        ? merged.replace(/<\/head>/i, `${idScript}\n</head>`)
        : idScript + '\n' + merged
    }
    // Inject style block just before </body> so it beats Tailwind in cascade order
    if (styleBlock) {
      merged = /<\/body>/i.test(merged)
        ? merged.replace(/<\/body>/i, `${styleBlock}\n</body>`)
        : merged + '\n' + styleBlock
    }

    updateScreenNode(data.screenId, { code: merged })
    screensApi
      .patch(data.screenId, { code: merged })
      .then((updated) => updateScreenLocally(updated))
      .catch(() => undefined)
    clearAllOverrides(data.screenId)
    clearAllTextOverrides(data.screenId)
    setSelectedElement(null)
    setDesignMode(false)
  }

  return (
    <div
      ref={nodeRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-surface)',
        border: `1px solid ${(designMode || pickMode) ? '#f59e0b' : selected ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: pickMode ? '0 0 0 3px #f59e0b66' : designMode ? '0 0 0 2px #f59e0b44' : selected ? '0 0 0 2px var(--primary)' : 'var(--shadow-md)',
      }}
    >
      <NodeResizer
        minWidth={200}
        minHeight={150}
        isVisible={selected && !designMode}
        lineStyle={{ borderColor: 'var(--primary)' }}
        handleStyle={{ background: 'var(--primary)', border: 'none', borderRadius: 2, width: 8, height: 8 }}
      />

      {/* Title bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          background: 'var(--bg-surface-raised)',
          borderBottom: `1px solid ${(designMode || pickMode) ? '#f59e0b44' : 'var(--border)'}`,
          flexShrink: 0,
          userSelect: 'none',
        }}
      >
        {fw && (
          <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 4px', borderRadius: 'var(--radius-sm)', background: fw.bg, color: fw.color, letterSpacing: '0.02em', flexShrink: 0 }}>
            {fw.shortLabel}
          </span>
        )}
        {editingName ? (
          <input
            ref={nameInputRef}
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitRename() }
              if (e.key === 'Escape') { setEditingName(false) }
              e.stopPropagation()
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--text)',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--primary)',
              borderRadius: 3,
              outline: 'none',
              padding: '0 4px',
              height: 18,
              fontFamily: 'var(--font-ui)',
              minWidth: 0,
            }}
          />
        ) : (
          <span
            onDoubleClick={(e) => { e.stopPropagation(); startRename() }}
            title="Double-click to rename"
            style={{ flex: 1, fontSize: 11, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
          >
            {data.name}
          </span>
        )}

        {/* Design mode toggle */}
        {data.hasCode && !data.loading && (
          <button
            onClick={toggleDesignMode}
            title={designMode ? 'Exit design mode' : 'Enter design mode'}
            style={{
              background: designMode ? '#f59e0b22' : 'none',
              border: `1px solid ${designMode ? '#f59e0b' : 'transparent'}`,
              borderRadius: 4,
              padding: '2px 5px',
              cursor: 'pointer',
              color: designMode ? '#f59e0b' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10,
              fontWeight: 500,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            {designMode ? 'Design' : ''}
          </button>
        )}
      </div>

      {/* Preview area */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Pick mode overlay */}
        {pickMode && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 5,
              pointerEvents: 'none',
              border: '2px solid #f59e0b',
              borderRadius: 4,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 6,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(245,158,11,0.95)',
                color: '#000',
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 10,
                whiteSpace: 'nowrap',
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              }}
            >
              Click trigger element
              <button
                onClick={clearTriggerPick}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, color: '#000', fontWeight: 700, lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          </div>
        )}
        {data.loading ? (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, background: 'var(--bg-canvas)', padding: '12px 16px' }}>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[0, 150, 300, 200, 100].map((delay, i) => (
                <div key={i} style={{ height: i === 3 ? 40 : 10, width: i === 2 ? '80%' : i === 4 ? '60%' : '90%', borderRadius: 4, background: 'var(--border)', animation: 'skeletonPulse 1.4s ease-in-out infinite', animationDelay: `${delay}ms`, marginTop: i === 3 ? 6 : 0 }} />
              ))}
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Generating…</span>
          </div>
        ) : data.hasCode ? (
          <ScreenPreview
            ref={previewRef}
            framework={data.framework}
            code={data.code as string}
            onThumbnail={handleThumbnail}
            designMode={designMode || pickMode}
            onElementSelect={handleElementSelect}
            overrides={screenOverrides}
            textOverrides={screenTextOverrides}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--text-muted)', background: 'var(--bg-canvas)' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            <span style={{ fontSize: 11 }}>No preview yet</span>
          </div>
        )}
      </div>

      <style>{`@keyframes skeletonPulse{0%,100%{opacity:0.4}50%{opacity:1}}`}</style>

      <Handle type="source" position={Position.Right} style={{ background: 'var(--primary)', width: 10, height: 10 }} />
      <Handle type="target" position={Position.Left} style={{ background: 'var(--border-strong)', width: 10, height: 10 }} />

      {/* Properties Panel (portal) */}
      {designMode && selectedElement && (
        <PropertiesPanel
          x={panelPos.x}
          y={panelPos.y}
          element={selectedElement}
          overrides={screenOverrides[selectedElement.id] ?? {}}
          onStyleChange={handleStyleChange}
          onReset={handleReset}
          onApply={handleApply}
          onClose={() => setSelectedElement(null)}
          onTextChange={handleTextChange}
        />
      )}
    </div>
  )
}

export const ScreenNode = memo(ScreenNodeComponent)
