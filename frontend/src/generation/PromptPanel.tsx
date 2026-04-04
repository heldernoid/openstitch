import type { ReactElement, KeyboardEvent } from 'react'
import { useState, useRef, useEffect } from 'react'
import { useProjectStore } from '../store/project'
import { useSettingsStore } from '../store/settings'
import { useGenerationStore } from '../store/generation'
import { useCanvasStore } from '../store/canvas'
import { screensApi } from '../lib/api'
import type { DoneFrame, AppScreenDoneFrame } from '../lib/stream'
import { log } from '../store/log'

const SUGGESTIONS = [
  'Personal site: 3 screens: light airy home with brief bio and AI/NLP skill chips (transformers, LLMs, embeddings); a projects grid with tech-stack tags and GitHub links; a blog index with post titles, dates and reading-time',
  'Hello World Facts: 3 screens: loud playful homepage that fires a random bizarre fact with a giant shuffle button and bouncy animation; a fact library with all facts as card tiles and category badges; a single-fact detail page with a share button and related facts',
  'The Chronicle: premium newspaper website. Brand name is "The Chronicle" — use it everywhere, no placeholders. Dark navy masthead with serif logotype, thin red accent strip, dense article grid, high-contrast black-and-white typography in the style of The Washington Post or NYT. 5 screens: editorial homepage with hero story and section grid; a Politics section with article cards; a full article reader with pull quotes and author bio; a video & multimedia page; a newsletter signup page',
  'EcoPath Consulting: environmental consulting business. Brand name is "EcoPath Consulting" — use it everywhere, no placeholders. Sage green and white palette, forest green accents, clean professional sans-serif typography, leaf motif in logo. 4 screens: landing page with hero mission statement and brand logo; an about page with team profiles and company values; a services page with offering cards (EIA · sustainability audits · carbon strategy); a contact page with inquiry form',
  'Paws & Hope: animal shelter website for street and neglected dogs. Brand name is "Paws & Hope" — use it everywhere, no placeholders. Warm amber and cream palette, friendly rounded typography, paw print motif. 5 screens: emotional landing with hero dog photo and adopt CTA; a dogs-available gallery with breed, age and personality tags; a dog profile page with story, photos and adopt button; an adoption process page with illustrated steps; a volunteer & donate page',
]

interface PromptPanelProps {
  onStreamOpen: () => void
  onNewScreen: (screenId: string) => void
  onAppStreamOpen: () => void
  onAppPlan: (screenNames: string[]) => void
  onAppScreenDone: (frame: AppScreenDoneFrame) => void
}

export function PromptPanel({ onStreamOpen, onNewScreen, onAppStreamOpen, onAppPlan, onAppScreenDone }: PromptPanelProps): ReactElement {
  const activeProject = useProjectStore((s) => s.activeProject)
  const activeScreen = useProjectStore((s) => s.activeScreen)
  const screens = useProjectStore((s) => s.screens)
  const activeProjectLastPrompt = useProjectStore((s) => s.activeProjectLastPrompt)
  const addScreenLocally = useProjectStore((s) => s.addScreenLocally)
  const updateScreenLocally = useProjectStore((s) => s.updateScreenLocally)

  const selectedModel = useSettingsStore((s) => s.selectedModel)

  const generate = useGenerationStore((s) => s.generate)
  const generateApp = useGenerationStore((s) => s.generateApp)
  const isGenerating = useGenerationStore((s) => s.isGenerating)
  const isGeneratingApp = useGenerationStore((s) => s.isGeneratingApp)
  const appGeneratingProjectId = useGenerationStore((s) => s.appGeneratingProjectId)
  const generatingProjectId = useGenerationStore((s) => s.generatingProjectId)
  const pendingImage = useGenerationStore((s) => s.pendingImage)
  const setPendingImage = useGenerationStore((s) => s.setPendingImage)

  const isGeneratingForThisProject = isGeneratingApp && appGeneratingProjectId === activeProject?.id
  const isSingleGeneratingForThisProject = isGenerating && generatingProjectId === activeProject?.id
  const busy = isSingleGeneratingForThisProject || isGeneratingForThisProject

  const addScreenNode = useCanvasStore((s) => s.addScreenNode)
  const updateScreenNode = useCanvasStore((s) => s.updateScreenNode)

  const [prompt, setPrompt] = useState(() => activeProjectLastPrompt ?? '')
  const [iterateOnActive, setIterateOnActive] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)


  // Reset prompt when switching projects
  useEffect(() => {
    setPrompt(activeProjectLastPrompt ?? '')
  }, [activeProject?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  // G shortcut: focus this panel's textarea
  useEffect(() => {
    function handler() { textareaRef.current?.focus() }
    window.addEventListener('openstitch:focus-prompt', handler)
    return () => window.removeEventListener('openstitch:focus-prompt', handler)
  }, [])


  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      if (iterateOnActive) {
        handleGenerate()
      } else {
        handleGenerateApp()
      }
    }
  }

  function handleSuggestion(text: string) {
    setPrompt(text)
    textareaRef.current?.focus()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      setPendingImage(reader.result as string)
      log.info(`Image attached: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`)
    }
    reader.readAsDataURL(file)
    // Reset input so the same file can be picked again
    e.target.value = ''
  }

  function handleGenerateApp() {
    if (!prompt.trim() || !activeProject || busy) return
    onAppStreamOpen()
    generateApp(
      {
        project_id: activeProject.id,
        prompt: prompt.trim(),
        framework: 'html_tailwind',
        model: selectedModel,
      },
      {
        onPlan: onAppPlan,
        onScreenDone: onAppScreenDone,
        onAllDone: () => { setPrompt('') },
      },
    )
  }

  function handleGenerate() {
    if (!prompt.trim() || !activeProject || busy) return

    // Strip the data URL prefix to get raw base64
    const image_b64 = pendingImage ? pendingImage.split(',')[1] : undefined

    const req = {
      project_id: activeProject.id,
      prompt: prompt.trim(),
      framework: 'html_tailwind',
      model: selectedModel,
      ...(image_b64 ? { image_b64 } : {}),
      ...(iterateOnActive && activeScreen ? {
        screen_id: activeScreen.id,
        current_code: activeScreen.code,
        iteration_context: [],
      } : {}),
    }

    // Clear image before generating so user sees it was consumed
    setPendingImage(null)
    onStreamOpen()

    generate(req, (frame: DoneFrame) => {
      handleDone(frame)
    })
  }

  function handleDone(frame: DoneFrame) {
    // Capture state at call time :by the time the API response arrives the user
    // may have switched projects, so we must not use reactive values inside .then()
    const calledForProjectId = activeProject?.id
    const wasIterating = iterateOnActive
    const targetScreenId = activeScreen?.id

    screensApi.get(frame.screen_id).then((screen) => {
      // If the user switched away from the project that triggered this generation, skip
      const currentProjectId = useProjectStore.getState().activeProject?.id
      if (currentProjectId !== calledForProjectId) return

      if (wasIterating && targetScreenId) {
        updateScreenLocally(screen)
        updateScreenNode(screen.id, {
          name: screen.name,
          framework: screen.framework,
          code: screen.code,
          hasCode: true,
        })
      } else {
        addScreenLocally(screen)
        addScreenNode(screen.id, screen.name, screen.framework, undefined, screen.code)
        onNewScreen(screen.id)
      }
      setPrompt('')
    }).catch(() => undefined)
  }

  // Minimised pill shown while app generation is running for THIS project
  if (isGeneratingForThisProject) {
    return (
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-full)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 8px 0 14px',
          height: 36,
          zIndex: 15,
          maxWidth: 'calc(100% - 48px)',
        }}
      >
        <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--primary)', animation: `sdot 0.6s ease ${i * 0.2}s infinite` }} />
          ))}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Generating app…</span>
        <button
          onClick={() => { useGenerationStore.getState().abortApp() }}
          style={{
            height: 24,
            padding: '0 10px',
            borderRadius: 'var(--radius-full)',
            border: 'none',
            background: 'rgba(239,68,68,0.12)',
            color: 'var(--status-red)',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Stop
        </button>
      </div>
    )
  }

  // Minimized pill
  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        title="Expand prompt panel"
        style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          height: 30,
          padding: '0 14px',
          borderRadius: 'var(--radius-full)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          zIndex: 15,
          color: 'var(--text-secondary)',
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
        {prompt.trim()
          ? <span style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prompt}</span>
          : <span style={{ color: 'var(--text-muted)' }}>Describe the UI…</span>
        }
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.5 }}>
          <path d="M3 6l5 5 5-5"/>
        </svg>
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 580,
        maxWidth: 'calc(100% - 48px)',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-xl)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 15,
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '6px 8px 4px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <button
          onClick={() => setMinimized(true)}
          title="Minimize"
          style={{
            width: 20,
            height: 20,
            borderRadius: 'var(--radius-sm)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 10l5-5 5 5"/>
          </svg>
        </button>
      </div>

      {/* Suggestions - only shown before any screens exist */}
      {screens.length === 0 && (
        <div style={{ position: 'relative' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px 6px',
              flexWrap: 'nowrap',
              overflowX: 'auto',
              scrollbarWidth: 'none',
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                flexShrink: 0,
              }}
            >
              Try:
            </span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleSuggestion(s)}
                title={s}
                style={{
                  height: 24,
                  padding: '0 10px',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-secondary)',
                  fontSize: 11,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  maxWidth: 220,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {s}
              </button>
            ))}
          </div>
          {/* Fade-out on right edge */}
          <div style={{
            position: 'absolute', top: 0, right: 0, width: 40, height: '100%',
            background: 'linear-gradient(to right, transparent, var(--bg-surface))',
            pointerEvents: 'none',
          }} />
        </div>
      )}

      {/* Attached image preview */}
      {pendingImage && (
        <div
          style={{
            margin: '0 12px 4px',
            padding: '6px 8px',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <img
            src={pendingImage}
            alt="Attached"
            style={{
              width: 40,
              height: 40,
              objectFit: 'cover',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)' }}>
            Image attached - describe the UI you want to generate from it
          </span>
          <button
            onClick={() => setPendingImage(null)}
            style={{
              width: 20,
              height: 20,
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Textarea */}
      <div style={{ padding: '4px 12px' }}>
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            pendingImage
              ? 'Describe the UI to generate from the attached image…'
              : 'Describe the screen or changes you want…'
          }
          rows={3}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontFamily: 'var(--font-ui)',
            fontSize: 13,
            color: 'var(--text)',
            lineHeight: 1.6,
            padding: '6px 0',
          }}
        />
      </div>

      {/* Bottom row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px 10px',
          borderTop: '1px solid var(--border)',
        }}
      >
        {/* Iterate/new context pill */}
        {activeScreen && (
          <button
            onClick={() => setIterateOnActive((v) => !v)}
            style={{
              height: 24,
              padding: '0 9px',
              borderRadius: 'var(--radius-full)',
              border: `1px solid ${iterateOnActive ? 'var(--primary)' : 'var(--border)'}`,
              background: iterateOnActive ? 'rgba(245,158,11,0.08)' : 'var(--bg-subtle)',
              color: iterateOnActive ? 'var(--primary)' : 'var(--text-secondary)',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M13 2v5h-5"/><path d="M13 7A6 6 0 103 11"/>
            </svg>
            Iterate on {activeScreen.name}
          </button>
        )}

        {/* Attach image button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Attach image"
          style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--radius-md)',
            border: pendingImage ? '1px solid rgba(245,158,11,0.5)' : '1px solid var(--border)',
            background: pendingImage ? 'rgba(245,158,11,0.1)' : 'var(--bg-subtle)',
            color: pendingImage ? 'var(--primary)' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        <div style={{ flex: 1 }} />

        {/* Char count */}
        {prompt.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {prompt.length}
          </span>
        )}

        {/* Keyboard hint */}
        {!busy && !iterateOnActive && (
          <kbd style={{
            background: 'var(--bg-muted)', border: '1px solid var(--border-strong)',
            borderRadius: 3, padding: '1px 4px', fontSize: 10, color: 'var(--text-muted)',
          }}>⌘↵</kbd>
        )}

        {/* Stop button - shown while busy */}
        {busy && (
          <button
            onClick={() => { useGenerationStore.getState().abort(); useGenerationStore.getState().abortApp() }}
            style={{
              height: 30,
              padding: '0 14px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'rgba(239,68,68,0.15)',
              color: 'var(--status-red)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: 'var(--status-red)',
                    animation: `sdot 0.6s ease ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </span>
            Stop
          </button>
        )}

        {/* Primary action button */}
        {!busy && (
          <button
            onClick={pendingImage && !iterateOnActive ? handleGenerate : iterateOnActive ? handleGenerate : handleGenerateApp}
            disabled={!prompt.trim() || !activeProject}
            title={iterateOnActive ? 'Apply changes to screen' : pendingImage ? 'Replicate from image' : 'Generate all screens (⌘↵)'}
            style={{
              height: 30,
              padding: '0 14px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--primary)',
              color: 'var(--text-inverse)',
              fontSize: 12,
              fontWeight: 600,
              cursor: (!prompt.trim() || !activeProject) ? 'not-allowed' : 'pointer',
              opacity: (!prompt.trim() || !activeProject) ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            {pendingImage && !iterateOnActive ? 'Replicate' : 'Generate'}
          </button>
        )}
      </div>

      <style>{`
        @keyframes sdot{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}
      `}</style>

    </div>
  )
}
