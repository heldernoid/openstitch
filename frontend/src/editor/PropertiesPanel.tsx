import React, { type ReactElement, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { SelectedElement } from '../preview/ScreenPreview'

interface PropertiesPanelProps {
  x: number
  y: number
  element: SelectedElement
  overrides: Record<string, string>
  onStyleChange: (id: string, property: string, value: string) => void
  onReset: (id: string) => void
  onApply: () => void
  onClose: () => void
  onTextChange: (id: string, text: string) => void
}

function getCssSelector(el: SelectedElement): string {
  if (el.htmlId) return `#${el.htmlId}`
  if (el.className) {
    const classes = el.className.trim().split(/\s+/).slice(0, 3).map((c) => `.${c}`).join('')
    return `${el.tagName}${classes}`
  }
  return el.tagName
}

function parseColor(value: string): string {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(value)
  if (!m) return '#000000'
  return '#' + [m[1], m[2], m[3]].map((n) => parseInt(n).toString(16).padStart(2, '0')).join('')
}

function parsePx(value: string): number { return parseFloat(value) || 0 }

// All styles use CSS variables so the panel respects light/dark theme
const inputStyle: React.CSSProperties = {
  width: 46, padding: '2px 4px',
  background: 'var(--bg-subtle)', border: '1px solid var(--border)',
  borderRadius: 4, color: 'var(--text)', fontSize: 11, textAlign: 'right',
}

const selectStyle: React.CSSProperties = {
  padding: '2px 4px', background: 'var(--bg-subtle)', border: '1px solid var(--border)',
  borderRadius: 4, color: 'var(--text)', fontSize: 11, flex: 1,
}

function Section({ label }: { label: string }): ReactElement {
  return (
    <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 3px' }}>
      {label}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0' }}>
      <span style={{ width: 68, fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0, textAlign: 'right' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1 }}>{children}</div>
    </div>
  )
}

function ColorInput({ value, computed, onChange }: { value: string | undefined; computed: string; onChange: (v: string) => void }): ReactElement {
  const hex = value ?? parseColor(computed)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input type="color" value={hex} onChange={(e) => onChange(e.target.value)}
        style={{ width: 28, height: 22, padding: 1, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'none' }} />
      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{hex}</span>
    </div>
  )
}

function Num({ value, computed, suffix = 'px', min = 0, max = 9999, step = 1, onChange, w = 46 }: {
  value: string | undefined; computed: string; suffix?: string; min?: number; max?: number; step?: number; onChange: (v: string) => void; w?: number
}): ReactElement {
  const num = value !== undefined ? parseFloat(value) : parsePx(computed)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <input type="number" value={isNaN(num) ? '' : num} min={min} max={max} step={step}
        onChange={(e) => onChange(suffix ? `${e.target.value}${suffix}` : e.target.value)}
        style={{ ...inputStyle, width: w }} />
      {suffix && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{suffix}</span>}
    </div>
  )
}

function IconBtn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: ReactElement | string }): ReactElement {
  return (
    <button onClick={onClick} title={title} style={{
      width: 26, height: 22,
      border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 3,
      background: active ? 'rgba(245,158,11,0.15)' : 'var(--bg-subtle)',
      color: active ? 'var(--primary)' : 'var(--text-secondary)',
      fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    }}>
      {children}
    </button>
  )
}

export function PropertiesPanel({
  x, y, element, overrides, onStyleChange, onReset, onApply, onClose, onTextChange,
}: PropertiesPanelProps): ReactElement {
  const [localText, setLocalText] = useState(element.textContent ?? '')
  const [copied, setCopied] = useState(false)
  const [copiedNav, setCopiedNav] = useState(false)

  useEffect(() => { setLocalText(element.textContent ?? '') }, [element.id, element.textContent])

  const cs = element.computedStyles
  const get = (k: string) => overrides[k]
  const set = useCallback((k: string, v: string) => onStyleChange(element.id, k, v), [element.id, onStyleChange])

  const cssSelector = getCssSelector(element)
  const navSel = element.navAncestor ? getCssSelector(element.navAncestor as Parameters<typeof getCssSelector>[0]) : null
  const showNavSel = navSel && navSel !== cssSelector

  function copySel() {
    navigator.clipboard.writeText(cssSelector).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }
  function copyNavSel() {
    if (!navSel) return
    navigator.clipboard.writeText(navSel).then(() => { setCopiedNav(true); setTimeout(() => setCopiedNav(false), 1500) })
  }

  const panel = (
    <div
      style={{
        position: 'fixed', left: x, top: Math.min(y, window.innerHeight - 640),
        width: 272,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        zIndex: 9999,
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        overflow: 'hidden',
        maxHeight: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 10, padding: '1px 5px', background: 'var(--bg-subtle)', color: '#a78bfa', borderRadius: 3, fontFamily: 'monospace' }}>
              {element.tagName}
            </span>
            {element.htmlId && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>#{element.htmlId}</span>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
        </div>
        {/* CSS Selector row - copy to use as trigger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg-subtle)', borderRadius: 4, padding: '4px 7px' }}>
          <span style={{ flex: 1, fontSize: 10, color: '#d97706', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {cssSelector}
          </span>
          <button onClick={copySel} title="Copy selector - paste as edge trigger" style={{
            height: 18, padding: '0 6px', borderRadius: 3,
            background: copied ? 'rgba(22,163,74,0.15)' : 'var(--border)',
            border: `1px solid ${copied ? '#16a34a' : 'var(--border-strong)'}`,
            color: copied ? '#4ade80' : 'var(--text-secondary)',
            fontSize: 9, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {copied ? '✓ copied' : 'copy'}
          </button>
        </div>
        {/* Play-mode trigger: the parent button/a that play mode actually matches */}
        {showNavSel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(99,102,241,0.08)', borderRadius: 4, padding: '4px 7px', marginTop: 5, border: '1px solid rgba(99,102,241,0.2)' }}>
            <span style={{ fontSize: 9, color: '#818cf8', flexShrink: 0 }}>▶ play</span>
            <span style={{ flex: 1, fontSize: 10, color: '#a5b4fc', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {navSel}
            </span>
            <button onClick={copyNavSel} title="Copy play-mode trigger selector" style={{
              height: 18, padding: '0 6px', borderRadius: 3,
              background: copiedNav ? 'rgba(22,163,74,0.15)' : 'rgba(99,102,241,0.15)',
              border: `1px solid ${copiedNav ? '#16a34a' : 'rgba(99,102,241,0.4)'}`,
              color: copiedNav ? '#4ade80' : '#818cf8',
              fontSize: 9, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {copiedNav ? '✓ copied' : 'copy'}
            </button>
          </div>
        )}
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
          {showNavSel ? 'Use ▶ play selector as edge trigger (matches the parent button)' : 'Use selector as edge trigger to wire navigation in Play mode'}
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '6px 10px 10px', scrollbarWidth: 'thin', scrollbarColor: 'var(--border) var(--bg-surface)' }}>

        {/* Content */}
        {element.isLeaf && (
          <>
            <Section label="Content" />
            <textarea value={localText} onChange={(e) => { setLocalText(e.target.value); onTextChange(element.id, e.target.value) }}
              rows={2} style={{
                width: '100%', padding: '4px 6px',
                background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                borderRadius: 4, color: 'var(--text)', fontSize: 11, resize: 'vertical',
                fontFamily: 'ui-sans-serif, system-ui, sans-serif', boxSizing: 'border-box',
              }} />
          </>
        )}

        {/* Layout */}
        <Section label="Layout" />
        <Row label="Display">
          <select value={get('display') ?? cs.display ?? 'block'} onChange={(e) => set('display', e.target.value)} style={selectStyle}>
            {['block','flex','inline-flex','inline-block','inline','grid','none'].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Row>
        {(get('display') ?? cs.display ?? '').includes('flex') && (
          <>
            <Row label="Direction">
              <select value={get('flexDirection') ?? cs.flexDirection ?? 'row'} onChange={(e) => set('flexDirection', e.target.value)} style={selectStyle}>
                {['row','column','row-reverse','column-reverse'].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Row>
            <Row label="Justify">
              <select value={get('justifyContent') ?? cs.justifyContent ?? 'flex-start'} onChange={(e) => set('justifyContent', e.target.value)} style={selectStyle}>
                {['flex-start','center','flex-end','space-between','space-around','space-evenly'].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Row>
            <Row label="Align">
              <select value={get('alignItems') ?? cs.alignItems ?? 'stretch'} onChange={(e) => set('alignItems', e.target.value)} style={selectStyle}>
                {['flex-start','center','flex-end','stretch','baseline'].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Row>
            <Row label="Gap">
              <Num value={get('gap')} computed={cs.gap ?? '0px'} onChange={(v) => set('gap', v)} />
            </Row>
          </>
        )}
        <Row label="Width">
          <select value={(get('width') ?? cs.width ?? 'auto') === 'auto' ? 'auto' : 'px'}
            onChange={(e) => set('width', e.target.value === 'auto' ? 'auto' : cs.width ?? 'auto')}
            style={{ ...selectStyle, flex: 'none', width: 56 }}>
            <option value="auto">auto</option>
            <option value="px">px</option>
          </select>
          {get('width') && get('width') !== 'auto' && (
            <Num value={get('width')} computed={cs.width} onChange={(v) => set('width', v)} />
          )}
          <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 4 }}>H</span>
          <select value={(get('height') ?? cs.height ?? 'auto') === 'auto' ? 'auto' : 'px'}
            onChange={(e) => set('height', e.target.value === 'auto' ? 'auto' : cs.height ?? 'auto')}
            style={{ ...selectStyle, flex: 'none', width: 56 }}>
            <option value="auto">auto</option>
            <option value="px">px</option>
          </select>
          {get('height') && get('height') !== 'auto' && (
            <Num value={get('height')} computed={cs.height} onChange={(v) => set('height', v)} />
          )}
        </Row>
        <Row label="Overflow">
          <select value={get('overflow') ?? cs.overflow ?? 'visible'} onChange={(e) => set('overflow', e.target.value)} style={selectStyle}>
            {['visible','hidden','scroll','auto','clip'].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Row>
        <Row label="Position">
          <select value={get('position') ?? cs.position ?? 'static'} onChange={(e) => set('position', e.target.value)} style={selectStyle}>
            {['static','relative','absolute','fixed','sticky'].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Row>

        {/* Colors */}
        <Section label="Colors" />
        <Row label="Background">
          <ColorInput value={get('backgroundColor')} computed={cs.backgroundColor} onChange={(v) => set('backgroundColor', v)} />
        </Row>
        <Row label="Text color">
          <ColorInput value={get('color')} computed={cs.color} onChange={(v) => set('color', v)} />
        </Row>

        {/* Typography */}
        <Section label="Typography" />
        <Row label="Size / Weight">
          <Num value={get('fontSize')} computed={cs.fontSize} onChange={(v) => set('fontSize', v)} w={40} />
          <select value={get('fontWeight') ?? cs.fontWeight} onChange={(e) => set('fontWeight', e.target.value)}
            style={{ ...selectStyle, width: 54, flex: 'none' }}>
            {['100','200','300','400','500','600','700','800','900'].map((w) => <option key={w}>{w}</option>)}
          </select>
        </Row>
        <Row label="Line height">
          <Num value={get('lineHeight')} computed={cs.lineHeight} suffix="" step={0.1} min={0} max={5} onChange={(v) => set('lineHeight', v)} />
        </Row>
        <Row label="Letter spacing">
          <Num value={get('letterSpacing')} computed={cs.letterSpacing} step={0.5} min={-10} max={20} onChange={(v) => set('letterSpacing', v)} />
        </Row>
        <Row label="Align">
          {(['left','center','right','justify'] as const).map((v) => (
            <IconBtn key={v} active={(get('textAlign') ?? cs.textAlign) === v} onClick={() => set('textAlign', v)} title={v}>
              {v === 'left' ? '⬤' : v === 'center' ? '◉' : v === 'right' ? '◎' : '≡'}
            </IconBtn>
          ))}
        </Row>
        <Row label="Transform">
          <select value={get('textTransform') ?? cs.textTransform ?? 'none'} onChange={(e) => set('textTransform', e.target.value)} style={selectStyle}>
            {['none','uppercase','lowercase','capitalize'].map((v) => <option key={v}>{v}</option>)}
          </select>
        </Row>
        <Row label="Decoration">
          <select value={get('textDecoration') ?? (cs.textDecoration ?? 'none').split(' ')[0]} onChange={(e) => set('textDecoration', e.target.value)} style={selectStyle}>
            {['none','underline','overline','line-through'].map((v) => <option key={v}>{v}</option>)}
          </select>
        </Row>
        <Row label="Font style">
          <IconBtn active={(get('fontStyle') ?? cs.fontStyle) === 'italic'} onClick={() => set('fontStyle', (get('fontStyle') ?? cs.fontStyle) === 'italic' ? 'normal' : 'italic')} title="Italic">
            <em>I</em>
          </IconBtn>
        </Row>

        {/* Spacing */}
        <Section label="Padding" />
        <Row label="Top / Right">
          <Num value={get('paddingTop')} computed={cs.paddingTop} onChange={(v) => set('paddingTop', v)} />
          <Num value={get('paddingRight')} computed={cs.paddingRight} onChange={(v) => set('paddingRight', v)} />
        </Row>
        <Row label="Bottom / Left">
          <Num value={get('paddingBottom')} computed={cs.paddingBottom} onChange={(v) => set('paddingBottom', v)} />
          <Num value={get('paddingLeft')} computed={cs.paddingLeft} onChange={(v) => set('paddingLeft', v)} />
        </Row>

        <Section label="Margin" />
        <Row label="Top / Right">
          <Num value={get('marginTop')} computed={cs.marginTop ?? '0px'} min={-999} onChange={(v) => set('marginTop', v)} />
          <Num value={get('marginRight')} computed={cs.marginRight ?? '0px'} min={-999} onChange={(v) => set('marginRight', v)} />
        </Row>
        <Row label="Bottom / Left">
          <Num value={get('marginBottom')} computed={cs.marginBottom ?? '0px'} min={-999} onChange={(v) => set('marginBottom', v)} />
          <Num value={get('marginLeft')} computed={cs.marginLeft ?? '0px'} min={-999} onChange={(v) => set('marginLeft', v)} />
        </Row>

        {/* Border */}
        <Section label="Border" />
        <Row label="Width / Style">
          <Num value={get('borderWidth')} computed={cs.borderWidth ?? '0px'} onChange={(v) => set('borderWidth', v)} w={36} />
          <select value={get('borderStyle') ?? cs.borderStyle ?? 'solid'} onChange={(e) => set('borderStyle', e.target.value)}
            style={{ ...selectStyle, width: 70, flex: 'none' }}>
            {['none','solid','dashed','dotted','double'].map((v) => <option key={v}>{v}</option>)}
          </select>
        </Row>
        <Row label="Color">
          <ColorInput value={get('borderColor')} computed={cs.borderColor ?? '#000000'} onChange={(v) => set('borderColor', v)} />
        </Row>
        <Row label="Radius">
          <Num value={get('borderRadius')} computed={cs.borderRadius} max={128} onChange={(v) => set('borderRadius', v)} />
        </Row>

        {/* Decoration */}
        <Section label="Decoration" />
        <Row label="Opacity">
          <input type="range" min={0} max={1} step={0.01}
            value={get('opacity') !== undefined ? parseFloat(get('opacity')!) : parseFloat(cs.opacity ?? '1') || 1}
            onChange={(e) => set('opacity', e.target.value)}
            style={{ flex: 1, accentColor: 'var(--primary)' }} />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 28, textAlign: 'right' }}>
            {parseFloat(get('opacity') ?? cs.opacity ?? '1').toFixed(2)}
          </span>
        </Row>
        <Row label="Box shadow">
          <select onChange={(e) => set('boxShadow', e.target.value)} defaultValue=""
            style={selectStyle}>
            <option value="">none</option>
            <option value="0 1px 3px rgba(0,0,0,0.12)">sm</option>
            <option value="0 4px 12px rgba(0,0,0,0.15)">md</option>
            <option value="0 8px 24px rgba(0,0,0,0.2)">lg</option>
            <option value="0 16px 48px rgba(0,0,0,0.25)">xl</option>
            <option value="inset 0 2px 6px rgba(0,0,0,0.15)">inset</option>
          </select>
        </Row>
        <Row label="Cursor">
          <select value={get('cursor') ?? cs.cursor ?? 'auto'} onChange={(e) => set('cursor', e.target.value)} style={selectStyle}>
            {['auto','default','pointer','text','move','not-allowed','wait','crosshair','grab'].map((v) => <option key={v}>{v}</option>)}
          </select>
        </Row>
        <Row label="Transition">
          <select onChange={(e) => set('transition', e.target.value)} defaultValue=""
            style={selectStyle}>
            <option value="">none</option>
            <option value="all 0.15s ease">fast (0.15s)</option>
            <option value="all 0.3s ease">normal (0.3s)</option>
            <option value="all 0.5s ease">slow (0.5s)</option>
            <option value="all 0.3s cubic-bezier(0.4,0,0.2,1)">material</option>
            <option value="all 0.4s cubic-bezier(0.34,1.56,0.64,1)">spring</option>
          </select>
        </Row>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button onClick={() => onReset(element.id)} style={{
          flex: 1, padding: '5px 0', background: 'none', border: '1px solid var(--border)',
          borderRadius: 5, color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer',
        }}>Reset</button>
        <button onClick={onApply} style={{
          flex: 2, padding: '5px 0', background: 'var(--primary)', border: 'none',
          borderRadius: 5, color: '#000', fontSize: 11, fontWeight: 600, cursor: 'pointer',
        }}>Apply to code</button>
      </div>
    </div>
  )

  return createPortal(panel, document.body) as ReactElement
}
