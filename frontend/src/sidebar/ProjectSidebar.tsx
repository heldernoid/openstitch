import type { ReactElement } from 'react'
import { useState } from 'react'
import { useProjectStore } from '../store/project'
import { useCanvasStore } from '../store/canvas'
import { projectsApi } from '../lib/api'
import { FRAMEWORK_MAP } from '../lib/frameworks'
import { log } from '../store/log'

interface ProjectSidebarProps {
  onNewProject?: () => void
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
}

export function ProjectSidebar({ onNewProject }: ProjectSidebarProps): ReactElement {
  const projects = useProjectStore((s) => s.projects)
  const activeProject = useProjectStore((s) => s.activeProject)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const screens = useProjectStore((s) => s.screens)
  const activeScreen = useProjectStore((s) => s.activeScreen)
  const setActiveScreen = useProjectStore((s) => s.setActiveScreen)
  const addScreenNode = useCanvasStore((s) => s.addScreenNode)
  const selectNode = useCanvasStore((s) => s.selectNode)
  const nodes = useCanvasStore((s) => s.nodes)

  const deleteProject = useProjectStore((s) => s.deleteProject)
  const deleteAllProjects = useProjectStore((s) => s.deleteAllProjects)
  const updateProjectCanvas = useProjectStore((s) => s.updateProjectCanvas)

  const [projectsExpanded, setProjectsExpanded] = useState(true)
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)

  function handleScreenClick(screen: (typeof screens)[0]) {
    setActiveScreen(screen)
    if (!nodes.find((n) => n.id === screen.id)) {
      addScreenNode(screen.id, screen.name, screen.framework)
    }
    selectNode(screen.id)
  }

  function handleProjectSwitch(project: (typeof projects)[0]) {
    if (project.id !== activeProject?.id) {
      // Save current canvas layout before switching so it can be restored on return
      if (activeProject) {
        const snapshot = useCanvasStore.getState().toSnapshot()
        updateProjectCanvas(activeProject.id, snapshot)
        projectsApi.saveCanvas(activeProject.id, snapshot).catch(() => undefined)
        log.dim(`Canvas saved for "${activeProject.name}"`)
      }
      log.info(`Switched to project "${project.name}"`)
      setActiveScreen(null)
      setActiveProject(project).catch(() => undefined)
    }
  }

  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      {/* ── Projects section ── */}
      <div>
        <button
          onClick={() => setProjectsExpanded((v) => !v)}
          style={{
            width: '100%',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            border: 'none',
            borderBottom: projectsExpanded ? 'none' : '1px solid var(--border)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            style={{
              flexShrink: 0,
              transition: 'transform 0.15s',
              transform: projectsExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              color: 'var(--text-muted)',
            }}
          >
            <path d="M3 2l4 3-4 3V2z" fill="currentColor" />
          </svg>
          <span style={{ ...SECTION_LABEL, flex: 1 }}>Projects</span>
          {projects.length > 0 && (
            confirmDeleteAll ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }} onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteAllProjects().catch(() => undefined)
                    setConfirmDeleteAll(false)
                  }}
                  title="Confirm delete all"
                  style={{
                    height: 16, padding: '0 5px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(239,68,68,0.15)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    color: 'var(--status-red)',
                    fontSize: 9, fontWeight: 600,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  Delete all
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteAll(false) }}
                  style={{
                    height: 16, width: 16,
                    borderRadius: 'var(--radius-sm)',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                    fontSize: 12, lineHeight: 1,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  ×
                </button>
              </div>
            ) : (
              <span
                onClick={(e) => { e.stopPropagation(); setConfirmDeleteAll(true) }}
                title="Delete all projects"
                style={{
                  width: 18, height: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  opacity: 0.5,
                }}
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <polyline points="3,4 4,4 13,4"/>
                  <path d="M5 4V2h6v2M13 4l-1 10H4L3 4"/>
                </svg>
              </span>
            )
          )}
          {onNewProject && (
            <span
              onClick={(e) => { e.stopPropagation(); onNewProject() }}
              title="New project"
              style={{
                width: 18, height: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)',
                fontSize: 16, lineHeight: 1,
                cursor: 'pointer',
              }}
            >
              +
            </span>
          )}
        </button>

        {projectsExpanded && (
          <div
            style={{
              borderBottom: '1px solid var(--border)',
              maxHeight: 180,
              overflowY: 'auto',
            }}
          >
            {projects.length === 0 ? (
              <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text-muted)' }}>
                No projects yet.
              </div>
            ) : (
              projects.map((p) => {
                const isActive = p.id === activeProject?.id
                const isHovered = hoveredProjectId === p.id
                const isConfirming = confirmDeleteId === p.id
                return (
                  <div
                    key={p.id}
                    onMouseEnter={() => setHoveredProjectId(p.id)}
                    onMouseLeave={() => { setHoveredProjectId(null); setConfirmDeleteId(null) }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      background: isActive ? 'var(--bg-subtle)' : isHovered ? 'var(--bg-subtle)' : 'transparent',
                      borderLeft: `2px solid ${isActive ? 'var(--primary)' : 'transparent'}`,
                    }}
                  >
                    <button
                      onClick={() => handleProjectSwitch(p)}
                      title={p.name}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        minWidth: 0,
                        padding: '5px 6px 5px 10px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
                        style={{ flexShrink: 0, color: isActive ? 'var(--primary)' : 'var(--text-muted)' }}>
                        <path d="M2 4a1 1 0 011-1h4l1.5 2H13a1 1 0 011 1v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" />
                      </svg>
                      <span style={{
                        flex: 1,
                        fontSize: 12,
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? 'var(--text)' : 'var(--text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {p.name}
                      </span>
                    </button>

                    {/* Delete control - visible on hover */}
                    {isHovered && (
                      isConfirming ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3, paddingRight: 6, flexShrink: 0 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteProject(p.id).catch(() => undefined)
                              setConfirmDeleteId(null)
                              setHoveredProjectId(null)
                            }}
                            title="Confirm delete"
                            style={{
                              height: 18, padding: '0 6px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'rgba(239,68,68,0.15)',
                              border: '1px solid rgba(239,68,68,0.3)',
                              color: 'var(--status-red)',
                              fontSize: 10, fontWeight: 600,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Delete
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null) }}
                            title="Cancel"
                            style={{
                              height: 18, width: 18,
                              borderRadius: 'var(--radius-sm)',
                              background: 'transparent',
                              border: '1px solid var(--border)',
                              color: 'var(--text-muted)',
                              fontSize: 13, lineHeight: 1,
                              cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(p.id) }}
                          title="Delete project"
                          style={{
                            width: 20, height: 20,
                            marginRight: 6,
                            flexShrink: 0,
                            borderRadius: 'var(--radius-sm)',
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            fontSize: 14, lineHeight: 1,
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            opacity: 0.6,
                          }}
                        >
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <polyline points="3,4 4,4 13,4"/>
                            <path d="M5 4V2h6v2M13 4l-1 10H4L3 4"/>
                          </svg>
                        </button>
                      )
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* ── Screens section ── */}
      <div
        style={{
          padding: '8px 12px 4px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <span style={{ ...SECTION_LABEL, flex: 1 }}>
          Screens
          {screens.length > 0 && (
            <span style={{ marginLeft: 5, opacity: 0.6, fontWeight: 400 }}>
              ({screens.length})
            </span>
          )}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 4px' }}>
        {screens.length === 0 && (
          <div
            style={{
              padding: '16px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 11,
              lineHeight: 1.6,
            }}
          >
            {activeProject
              ? 'No screens yet.\nUse the prompt bar to generate one.'
              : 'Select a project to see screens.'}
          </div>
        )}
        {screens.map((screen) => {
          const fw = FRAMEWORK_MAP[screen.framework as keyof typeof FRAMEWORK_MAP]
          const isActive = activeScreen?.id === screen.id
          return (
            <button
              key={screen.id}
              onClick={() => handleScreenClick(screen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '6px 12px',
                background: isActive ? 'var(--bg-subtle)' : 'transparent',
                border: 'none',
                borderLeft: `2px solid ${isActive ? 'var(--primary)' : 'transparent'}`,
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--text)',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 30,
                  flexShrink: 0,
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                  background: 'var(--bg-muted)',
                  border: '1px solid var(--border)',
                }}
              >
                {screen.thumbnail_data_url ? (
                  <img
                    src={screen.thumbnail_data_url}
                    alt={screen.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    draggable={false}
                  />
                ) : (
                  <svg width="40" height="30" viewBox="0 0 40 30" fill="none" style={{ display: 'block' }}>
                    <rect width="40" height="30" fill="var(--bg-muted)" />
                    <rect x="6" y="5" width="28" height="3" rx="1.5" fill="var(--border-strong)" />
                    <rect x="6" y="11" width="20" height="2" rx="1" fill="var(--border)" />
                    <rect x="6" y="15" width="16" height="2" rx="1" fill="var(--border)" />
                    <rect x="6" y="21" width="12" height="6" rx="2" fill="var(--border-strong)" />
                  </svg>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: isActive ? 'var(--text)' : 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {screen.name}
                </div>
                {fw && (
                  <div style={{ marginTop: 2, fontSize: 10, color: fw.color, fontWeight: 500 }}>
                    {fw.shortLabel}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
