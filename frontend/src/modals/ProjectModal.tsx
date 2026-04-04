import type { ReactElement } from 'react'
import { useState } from 'react'
import { useProjectStore } from '../store/project'

interface ProjectModalProps {
  mode: 'create' | 'delete'
  onClose: () => void
}

export function ProjectModal({ mode, onClose }: ProjectModalProps): ReactElement {
  const createProject = useProjectStore((s) => s.createProject)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const deleteProject = useProjectStore((s) => s.deleteProject)
  const activeProject = useProjectStore((s) => s.activeProject)

  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!name.trim()) return
    setBusy(true)
    setError('')
    try {
      const project = await createProject(name.trim())
      await setActiveProject(project)
      onClose()
    } catch {
      setError('Failed to create project')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!activeProject) return
    setBusy(true)
    try {
      await deleteProject(activeProject.id)
      onClose()
    } catch {
      setError('Failed to delete project')
    } finally {
      setBusy(false)
    }
  }

  const isCreate = mode === 'create'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-xl)',
          width: 400,
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            height: 52,
            padding: '0 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', flex: 1 }}>
            {isCreate ? 'New project' : 'Delete project'}
          </span>
          <button
            onClick={onClose}
            style={{
              width: 26, height: 26, background: 'transparent', border: 'none',
              cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {isCreate ? (
            <>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Project name
              </label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
                placeholder="My UI project"
                style={{
                  height: 36,
                  padding: '0 10px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-focus)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text)',
                  fontSize: 13,
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                  fontFamily: 'var(--font-ui)',
                }}
              />
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Delete{' '}
              <strong style={{ color: 'var(--text)' }}>{activeProject?.name}</strong>?
              This will permanently remove all screens and generation history.
              This cannot be undone.
            </p>
          )}
          {error && (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--status-red)' }}>{error}</p>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            onClick={onClose}
            style={{
              height: 34, padding: '0 16px',
              borderRadius: 'var(--radius-md)',
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'var(--font-ui)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={isCreate ? handleCreate : handleDelete}
            disabled={busy || (isCreate && !name.trim())}
            style={{
              height: 34, padding: '0 16px',
              borderRadius: 'var(--radius-md)',
              background: isCreate ? 'var(--primary)' : 'var(--status-red)',
              border: 'none',
              color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: (busy || (isCreate && !name.trim())) ? 'not-allowed' : 'pointer',
              opacity: (busy || (isCreate && !name.trim())) ? 0.5 : 1,
              fontFamily: 'var(--font-ui)',
            }}
          >
            {busy ? '…' : isCreate ? 'Create' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
