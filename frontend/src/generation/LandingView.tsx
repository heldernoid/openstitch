import type { ReactElement, KeyboardEvent } from 'react'
import { useState, useRef, useEffect, useCallback } from 'react'
import { SketchPad } from '../canvas/SketchPad'
import { useProjectStore } from '../store/project'
import { useSettingsStore } from '../store/settings'
import { useGenerationStore } from '../store/generation'
import { useCanvasStore } from '../store/canvas'
import { projectsApi, screensApi, designSystemsApi } from '../lib/api'
import type { DesignSystem } from '../lib/api'
import type { AppScreenDoneFrame as StreamDoneFrame, DoneFrame } from '../lib/stream'
import { log } from '../store/log'

const EXAMPLES = [
  'Make me an app for people who love kayaking in the Swedish west coast. Aim for 3 views',
  'One onboarding screen for a meditation app asking the user about their goals with illustrated option cards to choose from',
  'Xitique: a web app to track rotating community savings groups, showing each member\'s contribution status and time left until the next payout',
  'Capulana: a web store that sells capulana fabric patterns, showing a grid of colorful prints with filter options by region and occasion',
]

interface Props {
  onNewScreen: (screenId: string) => void
  onAppStreamOpen: () => void
  onAppPlan: (screenNames: string[]) => void
  onAppScreenDone: (frame: StreamDoneFrame) => void
}

export function LandingView({ onNewScreen, onAppStreamOpen, onAppPlan, onAppScreenDone }: Props): ReactElement {
  const [prompt, setPrompt] = useState('')
  const [creating, setCreating] = useState(false)
  const [selectedDesign, setSelectedDesign] = useState<string | null>(null) // null = Auto
  const [designs, setDesigns] = useState<DesignSystem[]>([])
  const [designSearch, setDesignSearch] = useState('')
  const [designOpen, setDesignOpen] = useState(false)
  const [attachedImage, setAttachedImage] = useState<string | null>(null) // data URL
  const [drawingOpen, setDrawingOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const designRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadProjects = useProjectStore((s) => s.loadProjects)
  const activeProject = useProjectStore((s) => s.activeProject)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const selectedModel = useSettingsStore((s) => s.selectedModel)
  const generate = useGenerationStore((s) => s.generate)
  const generateApp = useGenerationStore((s) => s.generateApp)
  const addScreenLocally = useProjectStore((s) => s.addScreenLocally)
  const addScreenNode = useCanvasStore((s) => s.addScreenNode)

  useEffect(() => {
    designSystemsApi.list()
      .then(setDesigns)
      .catch(() => {}) // silently fail if backend not ready
  }, [])

  // Close design dropdown on outside click
  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (designRef.current && !designRef.current.contains(e.target as Node)) {
      setDesignOpen(false)
    }
  }, [])
  useEffect(() => {
    if (designOpen) document.addEventListener('mousedown', handleOutsideClick)
    else document.removeEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [designOpen, handleOutsideClick])

  async function getOrCreateProject(): Promise<NonNullable<typeof activeProject>> {
    if (activeProject) return activeProject
    // Create with placeholder, then rename via LLM in background
    const project = await projectsApi.create('New Project')
    await loadProjects()
    setActiveProject(project)
    // Fire-and-forget: ask LLM for a better name, then update store
    const p = prompt.trim() || (attachedImage ? 'Replicated Design' : 'New Project')
    const projectId = project.id
    projectsApi.suggestName(p, selectedModel)
      .then(({ name }) => useProjectStore.getState().renameProject(projectId, name))
      .catch(() => undefined)
    return project
  }

  async function handleGenerate() {
    if (creating) return
    const p = prompt.trim() || (attachedImage ? 'Recreate this design' : '')
    if (!p) return
    setCreating(true)
    try {
      const project = await getOrCreateProject()
      onAppStreamOpen()
      const image_b64 = attachedImage?.replace(/^data:[^;]+;base64,/, '')
      generateApp(
        { project_id: project.id, prompt: p, model: selectedModel, framework: 'html_tailwind', design_name: selectedDesign, image_b64 },
        { onPlan: onAppPlan, onScreenDone: onAppScreenDone, onAllDone: () => {}, onError: () => setCreating(false) },
      )
    } catch (e) { log.error(`${e}`); setCreating(false) }
  }

  async function handleReplicate() {
    if (creating || !attachedImage) return
    const p = prompt.trim() || 'Replicate this design as faithfully as possible'
    setCreating(true)
    try {
      const project = await getOrCreateProject()
      const image_b64 = attachedImage.replace(/^data:[^;]+;base64,/, '')
      const projectId = project.id
      generate(
        { project_id: projectId, prompt: p, framework: 'html_tailwind', model: selectedModel, image_b64 },
        (frame: DoneFrame) => {
          screensApi.get(frame.screen_id).then((screen) => {
            if (useProjectStore.getState().activeProject?.id !== projectId) return
            addScreenLocally(screen)
            addScreenNode(screen.id, screen.name, screen.framework, undefined, screen.code)
            onNewScreen(screen.id)
          }).catch(() => undefined)
          setCreating(false)
        },
      )
    } catch (e) { log.error(`${e}`); setCreating(false) }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setAttachedImage(ev.target?.result as string)
    reader.readAsDataURL(file)
    e.target.value = '' // allow re-selecting same file
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleGenerate()
    }
  }

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 24px 48px',
      background: 'var(--bg-app)',
      overflowY: 'auto',
    }}>
      <div style={{ width: '100%', maxWidth: 580 }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 52, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 12 }}>
            <span style={{ color: 'var(--text)' }}>Open</span>
            <span style={{ color: 'var(--primary)' }}>Stitch</span>
          </div>
          {activeProject ? (
            <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
              Describe what to build for <strong style={{ color: 'var(--text)' }}>{activeProject.name}</strong>
            </p>
          ) : (
            <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
              Describe your web app and get a full design system, screens, and prototype
            </p>
          )}
        </div>

        {/* Prompt box */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          overflow: 'visible',
          boxShadow: '0 2px 16px rgba(0,0,0,0.1)',
        }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={attachedImage ? 'Describe what to build, or leave blank to recreate the screenshot…' : 'Describe the web app you want to build…'}
            rows={3}
            style={{
              width: '100%',
              padding: '14px 16px',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: 14,
              color: 'var(--text)',
              lineHeight: 1.6,
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderTop: '1px solid var(--border)',
          }}>
            {/* Model picker */}
            <ModelSelector />

            {/* Divider */}
            <span style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />

            {/* Design picker — inline */}
            <div style={{ position: 'relative', flexShrink: 0 }} ref={designRef}>
              <button
                onClick={() => { setDesignOpen((v) => !v); setDesignSearch('') }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  height: 26, padding: '0 8px',
                  background: 'transparent', border: 'none',
                  cursor: 'pointer', borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-muted)',
                }}
              >
                {selectedDesign ? (
                  <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: designs.find((d) => d.name === selectedDesign)?.accent ?? 'var(--accent)' }} />
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--accent)' }}>✦</span>
                )}
                <span style={{ fontSize: 11, fontWeight: selectedDesign ? 500 : 400 }}>
                  {selectedDesign ? (designs.find((d) => d.name === selectedDesign)?.label ?? selectedDesign) : 'Design: Auto'}
                </span>
                <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{ flexShrink: 0, transform: designOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  <path d="M3 6l5 5 5-5"/>
                </svg>
              </button>

              {designOpen && (
                <div style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 4px)',
                  left: 0,
                  width: 220,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 100,
                  overflow: 'hidden',
                }}>
                  <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                    <input
                      autoFocus
                      value={designSearch}
                      onChange={(e) => setDesignSearch(e.target.value)}
                      placeholder="Search designs…"
                      style={{
                        width: '100%', height: 26, padding: '0 8px',
                        background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)', color: 'var(--text)',
                        fontSize: 11, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                      }}
                    />
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {('auto ai generated'.includes(designSearch.toLowerCase()) || designSearch === '') && (
                      <button onClick={() => { setSelectedDesign(null); setDesignOpen(false) }}
                        style={{ width: '100%', textAlign: 'left', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 7, background: selectedDesign === null ? 'var(--bg-subtle)' : 'transparent', border: 'none', cursor: 'pointer' }}>
                        <span style={{ fontSize: 11, color: 'var(--accent)' }}>✦</span>
                        <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: selectedDesign === null ? 600 : 400 }}>Auto (AI generated)</span>
                      </button>
                    )}
                    {designs.filter((d) => !designSearch || d.label.toLowerCase().includes(designSearch.toLowerCase()) || d.name.toLowerCase().includes(designSearch.toLowerCase())).map((d) => (
                      <button key={d.name} onClick={() => { setSelectedDesign(d.name); setDesignOpen(false) }}
                        style={{ width: '100%', textAlign: 'left', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 7, background: selectedDesign === d.name ? 'var(--bg-subtle)' : 'transparent', border: 'none', cursor: 'pointer' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: d.accent, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: selectedDesign === d.name ? 600 : 400 }}>{d.label}</span>
                      </button>
                    ))}
                    {designs.filter((d) => !designSearch || d.label.toLowerCase().includes(designSearch.toLowerCase()) || d.name.toLowerCase().includes(designSearch.toLowerCase())).length === 0 && designSearch && (
                      <div style={{ padding: '7px 10px', fontSize: 11, color: 'var(--text-muted)' }}>No matches for "{designSearch}"</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <span style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />

            {/* Wireframe draw */}
            <button
              onClick={() => setDrawingOpen(true)}
              title="Draw wireframe"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 26, height: 26,
                background: 'transparent', border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                opacity: 0.6,
                flexShrink: 0,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </button>

            {/* Image attach */}
            {attachedImage ? (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <img
                  src={attachedImage}
                  alt="attached"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    width: 26, height: 26,
                    borderRadius: 4,
                    objectFit: 'cover',
                    border: '1px solid var(--border-strong)',
                    cursor: 'pointer',
                    display: 'block',
                  }}
                />
                <button
                  onClick={() => setAttachedImage(null)}
                  title="Remove image"
                  style={{
                    position: 'absolute', top: -5, right: -5,
                    width: 14, height: 14,
                    borderRadius: '50%',
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                    fontSize: 9, lineHeight: 1,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Attach reference screenshot"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 26, height: 26,
                  background: 'transparent', border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  opacity: 0.6,
                  flexShrink: 0,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                </svg>
              </button>
            )}

            <div style={{ flex: 1 }} />

            {attachedImage ? (
              <button
                onClick={handleReplicate}
                disabled={creating}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px',
                  background: !creating ? 'var(--primary)' : 'var(--bg-hover)',
                  color: !creating ? 'var(--text-inverse)' : 'var(--text-muted)',
                  border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  cursor: creating ? 'default' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {creating ? 'Creating…' : 'Replicate'}
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || creating}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px',
                  background: prompt.trim() && !creating ? 'var(--accent)' : 'var(--bg-hover)',
                  color: prompt.trim() && !creating ? 'var(--accent-fg)' : 'var(--text-muted)',
                  border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  cursor: prompt.trim() && !creating ? 'pointer' : 'default',
                  transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}
              >
                {creating ? 'Creating…' : 'Generate'}
                {!creating && (
                  <span style={{ opacity: 0.55, fontSize: 10, fontFamily: 'monospace' }}>⌘↵</span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Examples — horizontal scrollable pills */}
        <div style={{
          marginTop: 14,
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'none',
        }}>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              title={ex}
              onClick={() => { setPrompt(ex); textareaRef.current?.focus() }}
              style={{
                flexShrink: 0,
                maxWidth: 200,
                height: 28,
                padding: '0 12px',
                borderRadius: 999,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontSize: 11,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {drawingOpen && (
        <SketchPad
          onSubmit={(dataUrl) => { setAttachedImage(dataUrl); setDrawingOpen(false) }}
          onClose={() => setDrawingOpen(false)}
        />
      )}
    </div>
  )
}



const PROVIDER_LABELS: Record<string, string> = {
  ollama: 'Ollama',
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
}

function ModelSelector(): ReactElement {
  const selectedModel = useSettingsStore((s) => s.selectedModel)
  const setSelectedModel = useSettingsStore((s) => s.setSelectedModel)
  const enabledModels = useSettingsStore((s) => s.enabledModels)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const handleOutside = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
  }, [])
  useEffect(() => {
    if (open) document.addEventListener('mousedown', handleOutside)
    else document.removeEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open, handleOutside])

  if (!enabledModels.length) {
    return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selectedModel}</span>
  }

  const grouped: Record<string, typeof enabledModels> = {}
  for (const m of enabledModels) {
    if (!grouped[m.provider]) grouped[m.provider] = []
    grouped[m.provider].push(m)
  }
  const hasGroups = Object.keys(grouped).length > 1
  const currentName = enabledModels.find((m) => m.slug === selectedModel)?.name ?? selectedModel

  return (
    <div style={{ position: 'relative', flexShrink: 0 }} ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          height: 26, padding: '0 8px',
          background: 'transparent', border: 'none',
          cursor: 'pointer', borderRadius: 'var(--radius-sm)',
          color: 'var(--text-muted)',
        }}
      >
        <span style={{ fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentName}
        </span>
        <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M3 6l5 5 5-5"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 4px)',
          left: 0,
          minWidth: 200,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 100,
          overflow: 'hidden',
        }}>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {hasGroups
              ? Object.entries(grouped).map(([provider, ms]) => (
                  <div key={provider}>
                    <div style={{ padding: '5px 10px 2px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                      {PROVIDER_LABELS[provider] ?? provider}
                    </div>
                    {ms.map((m) => (
                      <button key={m.slug} onClick={() => { setSelectedModel(m.slug); setOpen(false) }}
                        style={{ width: '100%', textAlign: 'left', padding: '6px 10px', display: 'block', background: selectedModel === m.slug ? 'var(--bg-subtle)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text)', fontWeight: selectedModel === m.slug ? 600 : 400 }}>
                        {m.name}
                      </button>
                    ))}
                  </div>
                ))
              : enabledModels.map((m) => (
                  <button key={m.slug} onClick={() => { setSelectedModel(m.slug); setOpen(false) }}
                    style={{ width: '100%', textAlign: 'left', padding: '6px 10px', display: 'block', background: selectedModel === m.slug ? 'var(--bg-subtle)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text)', fontWeight: selectedModel === m.slug ? 600 : 400 }}>
                    {m.name}
                  </button>
                ))
            }
          </div>
        </div>
      )}
    </div>
  )
}
