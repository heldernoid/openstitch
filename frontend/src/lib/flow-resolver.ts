import type { Edge } from '@xyflow/react'

export interface FlowEdgeData extends Record<string, unknown> {
  triggerSelector: string
  projectId: string
}

export interface PathElement {
  tagName: string
  htmlId: string
  className: string
  textContent?: string
  childIndex?: number
  childCount?: number
  typeIndex?: number
  typeCount?: number
  attrs?: Record<string, string>
}

export interface NavigatePayload {
  selector: string   // backward compat (id or text)
  htmlId?: string    // element's HTML id attribute
  text?: string      // element's text content
  className?: string // element's class string
  tagName?: string
  path?: PathElement[] // full click path: from e.target up to matched button/anchor
}

// ─── Parsed trigger ───────────────────────────────────────────────────────────

interface AttrFilter {
  name: string
  op: '' | '=' | '^=' | '$=' | '*='
  value: string
}

interface ParsedTrigger {
  id: string | null
  tag: string | null
  classes: string[]
  pseudos: PseudoFilter[]
  attrs: AttrFilter[]
}

type PseudoFilter =
  | { type: 'contains'; text: string }
  | { type: 'nth-child'; a: number; b: number }
  | { type: 'first-child' }
  | { type: 'last-child' }
  | { type: 'nth-of-type'; a: number; b: number }
  | { type: 'first-of-type' }
  | { type: 'last-of-type' }

/** Parse An+B notation. Handles: 2n+1, odd, even, 3, n */
function parseNthArg(raw: string): { a: number; b: number } {
  const s = raw.trim().toLowerCase()
  if (s === 'odd') return { a: 2, b: 1 }
  if (s === 'even') return { a: 2, b: 0 }
  if (/^\d+$/.test(s)) return { a: 0, b: parseInt(s, 10) }
  // An+B
  const m = s.match(/^(-?\d*)n([+-]\d+)?$/)
  if (m) {
    const a = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : parseInt(m[1], 10)
    const b = m[2] ? parseInt(m[2], 10) : 0
    return { a, b }
  }
  return { a: 0, b: 1 }
}

/** Test if 1-based index n matches An+B (n >= 1). */
function matchesNth(a: number, b: number, n: number): boolean {
  if (a === 0) return n === b
  const k = (n - b) / a
  return Number.isInteger(k) && k >= 0
}

/**
 * Parse a CSS selector string into structured parts.
 * Supports:
 *   #id
 *   tag
 *   .class1.class2
 *   tag.class1.class2
 *   :contains("text")
 *   :nth-child(An+B)  :first-child  :last-child
 *   :nth-of-type(An+B)  :first-of-type  :last-of-type
 *   [attr]  [attr="val"]  [attr^="val"]  [attr$="val"]  [attr*="val"]
 */
export function parseTrigger(trigger: string): ParsedTrigger {
  let s = trigger.trim()
  let id: string | null = null
  let tag: string | null = null
  const classes: string[] = []
  const pseudos: PseudoFilter[] = []
  const attrs: AttrFilter[] = []

  // --- parse attribute selectors [attr...] (consume before anything else)
  s = s.replace(/\[([^\]]+)\]/g, (_, inner: string) => {
    const m = inner.match(/^([\w-]+)(?:([\^$*]?=)['"]?([^'"\]]*)['"]?)?$/)
    if (m) {
      attrs.push({ name: m[1], op: (m[2] ?? '') as AttrFilter['op'], value: m[3] ?? '' })
    }
    return ''
  })

  // --- parse pseudo-classes :pseudo(...) — only known names, so Tailwind classes
  //     like hover:text-slate-700 are left intact and treated as class names
  s = s.replace(/:(contains|nth-child|first-child|last-child|nth-of-type|first-of-type|last-of-type)(?:\(([^)]*)\))?/g, (_, name: string, arg: string | undefined) => {
    switch (name) {
      case 'contains':
        pseudos.push({ type: 'contains', text: (arg ?? '').replace(/^['"]|['"]$/g, '') })
        break
      case 'nth-child':
        pseudos.push({ type: 'nth-child', ...parseNthArg(arg ?? '1') })
        break
      case 'first-child':
        pseudos.push({ type: 'first-child' })
        break
      case 'last-child':
        pseudos.push({ type: 'last-child' })
        break
      case 'nth-of-type':
        pseudos.push({ type: 'nth-of-type', ...parseNthArg(arg ?? '1') })
        break
      case 'first-of-type':
        pseudos.push({ type: 'first-of-type' })
        break
      case 'last-of-type':
        pseudos.push({ type: 'last-of-type' })
        break
    }
    return ''
  })

  // --- #id (standalone, remainder after stripping pseudo/attrs)
  if (s.startsWith('#')) {
    const m = s.match(/^#([\w-]+)/)
    if (m) id = m[1]
    return { id, tag, classes, pseudos, attrs }
  }

  // --- tag and .class parts
  if (!s.startsWith('.') && s.length > 0) {
    const dotIdx = s.indexOf('.')
    if (dotIdx === -1) {
      tag = s.toLowerCase() || null
      return { id, tag, classes, pseudos, attrs }
    }
    tag = s.slice(0, dotIdx).toLowerCase()
    s = s.slice(dotIdx)
  }

  if (s.length > 0) {
    classes.push(...s.split('.').filter(Boolean))
  }

  return { id, tag, classes, pseudos, attrs }
}

// ─── Matching ─────────────────────────────────────────────────────────────────

interface NormElem {
  tagName: string
  htmlId: string
  classes: string[]
  textContent: string
  childIndex: number   // 0-based
  childCount: number
  typeIndex: number    // 0-based among same-tag siblings
  typeCount: number
  attrs: Record<string, string>
}

function elemMatchesParsed(parsed: ParsedTrigger, elem: NormElem): boolean {
  const { id, tag, classes, pseudos, attrs } = parsed

  if (id !== null) {
    if (!elem.htmlId || elem.htmlId !== id) return false
  }

  if (tag !== null) {
    if (!elem.tagName || elem.tagName !== tag) return false
  }

  if (classes.length > 0) {
    if (!classes.every((c) => elem.classes.includes(c))) return false
  }

  // Must have at least one positive constraint
  if (id === null && tag === null && classes.length === 0 && pseudos.length === 0 && attrs.length === 0) {
    return false
  }

  for (const attr of attrs) {
    const val = elem.attrs[attr.name]
    if (val === undefined) return false
    if (attr.op === '') continue
    if (attr.op === '=' && val !== attr.value) return false
    if (attr.op === '^=' && !val.startsWith(attr.value)) return false
    if (attr.op === '$=' && !val.endsWith(attr.value)) return false
    if (attr.op === '*=' && !val.includes(attr.value)) return false
  }

  for (const p of pseudos) {
    switch (p.type) {
      case 'contains':
        if (!elem.textContent.toLowerCase().includes(p.text.toLowerCase())) return false
        break
      case 'nth-child':
        if (!matchesNth(p.a, p.b, elem.childIndex + 1)) return false
        break
      case 'first-child':
        if (elem.childIndex !== 0) return false
        break
      case 'last-child':
        if (elem.childIndex !== elem.childCount - 1) return false
        break
      case 'nth-of-type':
        if (!matchesNth(p.a, p.b, elem.typeIndex + 1)) return false
        break
      case 'first-of-type':
        if (elem.typeIndex !== 0) return false
        break
      case 'last-of-type':
        if (elem.typeIndex !== elem.typeCount - 1) return false
        break
    }
  }

  return true
}

/** Given current screen + click payload, find target screen ID. */
export function resolveNavigation(
  edges: Edge[],
  currentScreenId: string,
  payload: string | NavigatePayload,
): string | null {
  const text    = typeof payload === 'string' ? payload : (payload.text ?? payload.selector ?? '')
  const rawPath = typeof payload === 'string' ? [] : (payload.path ?? [])

  // Normalise path elements
  const pathElems: NormElem[] = rawPath.map((p) => ({
    tagName: (p.tagName ?? '').toLowerCase(),
    htmlId: p.htmlId ?? '',
    classes: (p.className ?? '').split(/\s+/).filter(Boolean),
    textContent: p.textContent ?? '',
    childIndex: p.childIndex ?? 0,
    childCount: p.childCount ?? 1,
    typeIndex: p.typeIndex ?? 0,
    typeCount: p.typeCount ?? 1,
    attrs: p.attrs ?? {},
  }))

  // Fallback for old payloads without path
  if (pathElems.length === 0 && typeof payload !== 'string') {
    pathElems.push({
      tagName: (payload.tagName ?? '').toLowerCase(),
      htmlId: payload.htmlId ?? '',
      classes: (payload.className ?? '').split(/\s+/).filter(Boolean),
      textContent: text,
      childIndex: 0,
      childCount: 1,
      typeIndex: 0,
      typeCount: 1,
      attrs: {},
    })
  }

  for (const edge of edges) {
    if (edge.source !== currentScreenId) continue
    const trigger = ((edge.data as FlowEdgeData | undefined)?.triggerSelector ?? '').trim()
    if (!trigger) continue

    const parsed = parseTrigger(trigger)
    const hasStructural = parsed.id !== null || parsed.tag !== null || parsed.classes.length > 0
      || parsed.pseudos.length > 0 || parsed.attrs.length > 0

    if (hasStructural) {
      for (const elem of pathElems) {
        if (elemMatchesParsed(parsed, elem)) return edge.target
      }
      continue
    }

    // Text match (case-insensitive substring, legacy fallback)
    const needle = trigger.toLowerCase()
    const haystack = text.toLowerCase()
    if (needle && haystack && (haystack.includes(needle) || needle.includes(haystack))) return edge.target
  }
  return null
}
