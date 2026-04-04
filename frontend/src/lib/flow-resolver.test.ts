import { describe, it, expect } from 'vitest'
import { parseTrigger, resolveNavigation } from './flow-resolver'
import type { Edge } from '@xyflow/react'
import type { NavigatePayload, PathElement } from './flow-resolver'

// ─── parseTrigger ─────────────────────────────────────────────────────────────

describe('parseTrigger', () => {
  it('parses #id', () => {
    const r = parseTrigger('#my-btn')
    expect(r.id).toBe('my-btn')
    expect(r.tag).toBeNull()
    expect(r.classes).toEqual([])
    expect(r.pseudos).toEqual([])
    expect(r.attrs).toEqual([])
  })

  it('parses plain tag', () => {
    const r = parseTrigger('button')
    expect(r.tag).toBe('button')
    expect(r.classes).toEqual([])
  })

  it('parses .class', () => {
    const r = parseTrigger('.btn-primary')
    expect(r.classes).toEqual(['btn-primary'])
    expect(r.tag).toBeNull()
  })

  it('parses tag.class1.class2', () => {
    const r = parseTrigger('a.pixel-button.px-4')
    expect(r.tag).toBe('a')
    expect(r.classes).toEqual(['pixel-button', 'px-4'])
  })

  it('parses :contains("text")', () => {
    const r = parseTrigger('button:contains("Submit")')
    expect(r.tag).toBe('button')
    const c = r.pseudos.find((p) => p.type === 'contains')
    expect(c).toBeDefined()
    if (c?.type === 'contains') expect(c.text).toBe('Submit')
  })

  it('parses :nth-child(2n+1)', () => {
    const r = parseTrigger('li:nth-child(2n+1)')
    const p = r.pseudos.find((x) => x.type === 'nth-child')
    expect(p).toBeDefined()
    if (p?.type === 'nth-child') { expect(p.a).toBe(2); expect(p.b).toBe(1) }
  })

  it('parses :nth-child(odd)', () => {
    const r = parseTrigger(':nth-child(odd)')
    const p = r.pseudos.find((x) => x.type === 'nth-child')
    if (p?.type === 'nth-child') { expect(p.a).toBe(2); expect(p.b).toBe(1) }
  })

  it('parses :first-child and :last-child', () => {
    const r = parseTrigger('li:first-child')
    expect(r.pseudos.some((p) => p.type === 'first-child')).toBe(true)
    const r2 = parseTrigger('li:last-child')
    expect(r2.pseudos.some((p) => p.type === 'last-child')).toBe(true)
  })

  it('parses :nth-of-type(3)', () => {
    const r = parseTrigger('button:nth-of-type(3)')
    const p = r.pseudos.find((x) => x.type === 'nth-of-type')
    if (p?.type === 'nth-of-type') { expect(p.a).toBe(0); expect(p.b).toBe(3) }
  })

  it('parses [attr]', () => {
    const r = parseTrigger('a[href]')
    expect(r.attrs).toEqual([{ name: 'href', op: '', value: '' }])
  })

  it('parses [attr="val"]', () => {
    const r = parseTrigger('input[type="submit"]')
    expect(r.attrs).toEqual([{ name: 'type', op: '=', value: 'submit' }])
  })

  it('parses [attr^="val"]', () => {
    const r = parseTrigger('[data-action^="nav"]')
    expect(r.attrs).toEqual([{ name: 'data-action', op: '^=', value: 'nav' }])
  })

  it('parses [attr$="val"]', () => {
    const r = parseTrigger('[data-id$="-btn"]')
    expect(r.attrs).toEqual([{ name: 'data-id', op: '$=', value: '-btn' }])
  })

  it('parses [attr*="val"]', () => {
    const r = parseTrigger('[class*="primary"]')
    expect(r.attrs).toEqual([{ name: 'class', op: '*=', value: 'primary' }])
  })

  it('treats Tailwind colon-variant classes as class names (not pseudo)', () => {
    const r = parseTrigger('button.text-slate-500.hover:text-slate-700')
    expect(r.tag).toBe('button')
    expect(r.classes).toEqual(['text-slate-500', 'hover:text-slate-700'])
    expect(r.pseudos).toEqual([])
  })

  it('parses Tailwind class + real pseudo together', () => {
    const r = parseTrigger('button.hover:text-slate-700:first-of-type')
    expect(r.tag).toBe('button')
    expect(r.classes).toEqual(['hover:text-slate-700'])
    expect(r.pseudos.some((p) => p.type === 'first-of-type')).toBe(true)
  })

  it('parses compound: tag.class:contains()[attr]', () => {
    const r = parseTrigger('a.pixel-button.px-4.py-2:contains("Categories")[data-x="1"]')
    expect(r.tag).toBe('a')
    expect(r.classes).toEqual(['pixel-button', 'px-4', 'py-2'])
    expect(r.pseudos.some((p) => p.type === 'contains')).toBe(true)
    expect(r.attrs).toEqual([{ name: 'data-x', op: '=', value: '1' }])
  })
})

// ─── resolveNavigation helpers ────────────────────────────────────────────────

function makeEdge(id: string, source: string, target: string, triggerSelector: string): Edge {
  return { id, source, target, data: { triggerSelector, projectId: 'p1' } } as Edge
}

function makeElem(overrides: Partial<PathElement> = {}): PathElement {
  return {
    tagName: 'button',
    htmlId: '',
    className: '',
    textContent: '',
    childIndex: 0,
    childCount: 1,
    typeIndex: 0,
    typeCount: 1,
    attrs: {},
    ...overrides,
  }
}

function makePayload(path: PathElement[]): NavigatePayload {
  const last = path[path.length - 1]
  return {
    selector: last?.htmlId || last?.textContent || '',
    htmlId: last?.htmlId ?? '',
    text: last?.textContent ?? '',
    className: last?.className ?? '',
    tagName: last?.tagName ?? '',
    path,
  }
}

// ─── resolveNavigation ────────────────────────────────────────────────────────

describe('resolveNavigation', () => {
  const edges = [
    makeEdge('e1', 'screen-a', 'screen-b', '#go-btn'),
    makeEdge('e2', 'screen-a', 'screen-c', 'button.btn-primary'),
    makeEdge('e3', 'screen-a', 'screen-d', 'a.pixel-button.px-4:contains("Categories")'),
    makeEdge('e4', 'screen-a', 'screen-e', ':nth-child(2)'),
    makeEdge('e5', 'screen-a', 'screen-f', '[data-nav="home"]'),
    makeEdge('e6', 'screen-a', 'screen-g', 'button:nth-of-type(2)'),
    makeEdge('e7', 'screen-a', 'screen-h', ':contains("Sign up")'),
  ]

  it('matches #id trigger', () => {
    const path = [makeElem({ tagName: 'button', htmlId: 'go-btn' })]
    expect(resolveNavigation(edges, 'screen-a', makePayload(path))).toBe('screen-b')
  })

  it('matches tag.class trigger', () => {
    const path = [makeElem({ tagName: 'button', className: 'btn-primary btn-lg' })]
    expect(resolveNavigation(edges, 'screen-a', makePayload(path))).toBe('screen-c')
  })

  it('matches :contains trigger', () => {
    const path = [makeElem({ tagName: 'a', className: 'pixel-button px-4 py-2', textContent: 'Categories' })]
    expect(resolveNavigation(edges, 'screen-a', makePayload(path))).toBe('screen-d')
  })

  it(':contains is case-insensitive', () => {
    const path = [makeElem({ tagName: 'a', className: 'pixel-button px-4', textContent: 'CATEGORIES' })]
    expect(resolveNavigation(edges, 'screen-a', makePayload(path))).toBe('screen-d')
  })

  it('matches :nth-child(2) - second child (childIndex=1)', () => {
    const path = [makeElem({ tagName: 'li', childIndex: 1, childCount: 3 })]
    expect(resolveNavigation(edges, 'screen-a', makePayload(path))).toBe('screen-e')
  })

  it('does NOT match :nth-child(2) for first child', () => {
    const path = [makeElem({ tagName: 'li', childIndex: 0, childCount: 3 })]
    expect(resolveNavigation(edges, 'screen-a', makePayload(path))).toBeNull()
  })

  it('matches [attr="val"] trigger', () => {
    const path = [makeElem({ tagName: 'a', attrs: { 'data-nav': 'home' } })]
    expect(resolveNavigation(edges, 'screen-a', makePayload(path))).toBe('screen-f')
  })

  it('does NOT match [attr="val"] with wrong value', () => {
    const path = [makeElem({ tagName: 'a', attrs: { 'data-nav': 'other' } })]
    expect(resolveNavigation(edges, 'screen-a', makePayload(path))).toBeNull()
  })

  it('matches :nth-of-type(2) - second of type', () => {
    const path = [makeElem({ tagName: 'button', typeIndex: 1, typeCount: 3 })]
    expect(resolveNavigation(edges, 'screen-a', makePayload(path))).toBe('screen-g')
  })

  it('matches :contains on its own', () => {
    const path = [makeElem({ tagName: 'button', textContent: 'Sign up now' })]
    expect(resolveNavigation(edges, 'screen-a', makePayload(path))).toBe('screen-h')
  })

  it('does not match wrong screen source', () => {
    const path = [makeElem({ tagName: 'button', htmlId: 'go-btn' })]
    expect(resolveNavigation(edges, 'screen-z', makePayload(path))).toBeNull()
  })

  it('checks full click path (inner child matches parent trigger)', () => {
    const innerEdges = [makeEdge('ex', 's1', 's2', 'button.play-btn')]
    // click on <i> inside <button.play-btn>
    const path = [
      makeElem({ tagName: 'i', className: 'fas fa-play' }),
      makeElem({ tagName: 'button', className: 'play-btn' }),
    ]
    expect(resolveNavigation(innerEdges, 's1', makePayload(path))).toBe('s2')
  })

  it('does not match a tag trigger against non-matching element', () => {
    const textEdges = [makeEdge('et', 's1', 's2', 'span')]
    const path = [makeElem({ tagName: 'button' })]
    expect(resolveNavigation(textEdges, 's1', makePayload(path))).toBeNull()
  })

  it('attr ^= prefix match', () => {
    const e = [makeEdge('ea', 's', 't', '[data-action^="nav"]')]
    const path = [makeElem({ attrs: { 'data-action': 'nav-home' } })]
    expect(resolveNavigation(e, 's', makePayload(path))).toBe('t')
  })

  it('attr $= suffix match', () => {
    const e = [makeEdge('eb', 's', 't', '[data-id$="-btn"]')]
    const path = [makeElem({ attrs: { 'data-id': 'submit-btn' } })]
    expect(resolveNavigation(e, 's', makePayload(path))).toBe('t')
  })

  it('attr *= substring match', () => {
    const e = [makeEdge('ec', 's', 't', '[data-label*="save"]')]
    const path = [makeElem({ attrs: { 'data-label': 'auto-save' } })]
    expect(resolveNavigation(e, 's', makePayload(path))).toBe('t')
  })

  it(':first-child matches childIndex=0', () => {
    const e = [makeEdge('ef', 's', 't', 'li:first-child')]
    const path = [makeElem({ tagName: 'li', childIndex: 0, childCount: 3 })]
    expect(resolveNavigation(e, 's', makePayload(path))).toBe('t')
  })

  it(':last-child matches childIndex=childCount-1', () => {
    const e = [makeEdge('el', 's', 't', 'li:last-child')]
    const path = [makeElem({ tagName: 'li', childIndex: 2, childCount: 3 })]
    expect(resolveNavigation(e, 's', makePayload(path))).toBe('t')
  })

  it(':first-of-type matches typeIndex=0', () => {
    const e = [makeEdge('efo', 's', 't', 'button:first-of-type')]
    const path = [makeElem({ tagName: 'button', typeIndex: 0, typeCount: 2 })]
    expect(resolveNavigation(e, 's', makePayload(path))).toBe('t')
  })

  it(':last-of-type matches typeIndex=typeCount-1', () => {
    const e = [makeEdge('elo', 's', 't', 'button:last-of-type')]
    const path = [makeElem({ tagName: 'button', typeIndex: 1, typeCount: 2 })]
    expect(resolveNavigation(e, 's', makePayload(path))).toBe('t')
  })

  it(':nth-child(odd) matches 1st, 3rd, 5th...', () => {
    const e = [makeEdge('eo', 's', 't', 'li:nth-child(odd)')]
    expect(resolveNavigation(e, 's', makePayload([makeElem({ tagName: 'li', childIndex: 0, childCount: 5 })]))).toBe('t')
    expect(resolveNavigation(e, 's', makePayload([makeElem({ tagName: 'li', childIndex: 2, childCount: 5 })]))).toBe('t')
    expect(resolveNavigation(e, 's', makePayload([makeElem({ tagName: 'li', childIndex: 1, childCount: 5 })]))).toBeNull()
  })
})
