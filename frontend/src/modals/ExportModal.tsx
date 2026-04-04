import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { Screen } from '../lib/api'
import { projectsApi } from '../lib/api'
import { stripFences } from '../preview/sandbox-utils'

interface ExportModalProps {
  screens: Screen[]
  activeScreen: Screen | null
  project: { id: string; name: string } | null
  onClose: () => void
}

function downloadFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Minimal ZIP builder (STORE, no compression) - no external deps
function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (const byte of data) {
    crc ^= byte
    for (let j = 0; j < 8; j++) crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function buildZip(files: { name: string; content: string | Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder()
  const localParts: Uint8Array[] = []
  const cdParts: Uint8Array[] = []
  let offset = 0

  for (const { name, content } of files) {
    const nameBytes = enc.encode(name)
    const dataBytes = typeof content === 'string' ? enc.encode(content) : content
    const crc = crc32(dataBytes)
    const size = dataBytes.length

    const lh = new DataView(new ArrayBuffer(30 + nameBytes.length))
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true)
    lh.setUint16(8, 0, true)           // STORE
    lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true)
    lh.setUint16(26, nameBytes.length, true)
    new Uint8Array(lh.buffer).set(nameBytes, 30)
    const localEntry = new Uint8Array(30 + nameBytes.length + size)
    localEntry.set(new Uint8Array(lh.buffer)); localEntry.set(dataBytes, 30 + nameBytes.length)
    localParts.push(localEntry)

    const cd = new DataView(new ArrayBuffer(46 + nameBytes.length))
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true)
    cd.setUint32(16, crc, true); cd.setUint32(20, size, true); cd.setUint32(24, size, true)
    cd.setUint16(28, nameBytes.length, true)
    cd.setUint32(42, offset, true)
    new Uint8Array(cd.buffer).set(nameBytes, 46)
    cdParts.push(new Uint8Array(cd.buffer))
    offset += localEntry.length
  }

  const cdSize = cdParts.reduce((s, p) => s + p.length, 0)
  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(8, files.length, true); eocd.setUint16(10, files.length, true)
  eocd.setUint32(12, cdSize, true); eocd.setUint32(16, offset, true)

  const total = offset + cdSize + 22
  const out = new Uint8Array(total)
  let pos = 0
  for (const p of localParts) { out.set(p, pos); pos += p.length }
  for (const p of cdParts)    { out.set(p, pos); pos += p.length }
  out.set(new Uint8Array(eocd.buffer), pos)
  return out
}

function downloadZip(zipName: string, files: { name: string; content: string | Uint8Array }[]) {
  const data = buildZip(files)
  const blob = new Blob([data as BlobPart], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = zipName
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

type Scope = 'screen' | 'all'

export function ExportModal({ screens, activeScreen, project, onClose }: ExportModalProps): ReactElement {
  const [scope, setScope] = useState<Scope>(activeScreen ? 'screen' : 'all')
  const [designMd, setDesignMd] = useState<string | null>(null)

  useEffect(() => {
    if (scope === 'all' && project?.id) {
      projectsApi.getDesignMd(project.id)
        .then((res) => setDesignMd(res.design_md))
        .catch(() => setDesignMd(null))
    } else {
      setDesignMd(null)
    }
  }, [scope, project?.id])

  const screensToExport = scope === 'screen' && activeScreen ? [activeScreen] : screens

  // Compute file list for display and count
  const fileList: { label: string; badge?: string; sub?: string }[] = []
  if (scope === 'all') {
    if (designMd) {
      fileList.push({ label: 'DESIGN.md', badge: 'MD' })
    }
    for (const s of screensToExport) {
      const slug = toSlug(s.name)
      fileList.push({ label: `${slug}/index.html` })
    }
  } else {
    for (const s of screensToExport) {
      fileList.push({ label: `${s.name.replace(/\s+/g, '-').toLowerCase()}.html` })
    }
  }

  function handleExport() {
    if (screensToExport.length === 1 && scope === 'screen') {
      const s = screensToExport[0]
      const filename = `${s.name.replace(/\s+/g, '-').toLowerCase()}.html`
      downloadFile(filename, stripFences(s.code))
    } else {
      const files: { name: string; content: string | Uint8Array }[] = []

      // DESIGN.md at root if available
      if (designMd) {
        files.push({ name: 'DESIGN.md', content: designMd })
      }

      // Per-screen folders
      for (const s of screensToExport) {
        const slug = toSlug(s.name)
        files.push({ name: `${slug}/index.html`, content: stripFences(s.code) })
      }

      const projectSlug = toSlug(project?.name ?? 'openstitch')
      downloadZip(`${projectSlug}.zip`, files)
    }
    onClose()
  }

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
          width: 480,
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
            gap: 10,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', flex: 1 }}>Export code</span>
          <button
            onClick={onClose}
            style={{
              width: 26, height: 26,
              borderRadius: 'var(--radius-md)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: 18,
            }}
          >x</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Scope selector */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(['screen', 'all'] as Scope[]).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                disabled={s === 'screen' && !activeScreen}
                style={{
                  flex: 1,
                  height: 36,
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${scope === s ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
                  background: scope === s ? 'rgba(245,158,11,0.08)' : 'transparent',
                  fontSize: 12,
                  fontWeight: 500,
                  color: scope === s ? 'var(--primary)' : 'var(--text-secondary)',
                  cursor: (s === 'screen' && !activeScreen) ? 'not-allowed' : 'pointer',
                  opacity: (s === 'screen' && !activeScreen) ? 0.4 : 1,
                  fontFamily: 'var(--font-ui)',
                }}
              >
                {s === 'screen' ? 'Active screen' : `All screens (${screens.length})`}
              </button>
            ))}
          </div>

          {/* File list */}
          <div
            style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                Files
              </span>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {fileList.length} file{fileList.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {fileList.map((f, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  {f.badge && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(99,102,241,0.15)',
                        color: '#6366f1',
                        flexShrink: 0,
                      }}
                    >
                      {f.badge}
                    </span>
                  )}
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text)', flex: 1 }}>
                    {f.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {scope === 'all'
              ? `Stitch export · ${fileList.length} file${fileList.length !== 1 ? 's' : ''}`
              : `${fileList.length} file${fileList.length !== 1 ? 's' : ''} · raw source`}
          </span>
          <button
            onClick={onClose}
            style={{
              height: 34, padding: '0 16px',
              borderRadius: 'var(--radius-md)',
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              fontSize: 12, fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={screensToExport.length === 0}
            style={{
              height: 34, padding: '0 16px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary)',
              border: 'none',
              color: 'var(--text-inverse)',
              fontSize: 12, fontWeight: 600,
              cursor: screensToExport.length === 0 ? 'not-allowed' : 'pointer',
              opacity: screensToExport.length === 0 ? 0.5 : 1,
              fontFamily: 'var(--font-ui)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 2v9M4 7l4 4 4-4M2 14h12"/>
            </svg>
            Download
          </button>
        </div>
      </div>
    </div>
  )
}
