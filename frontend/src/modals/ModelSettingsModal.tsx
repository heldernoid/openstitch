import type { ReactElement } from 'react'
import { useState, useEffect } from 'react'
import { settingsApi, skillsApi, openrouterApi, modelsApi } from '../lib/api'
import type { Skill, ModelInfo, OpenRouterModelEntry } from '../lib/api'
import { useProjectStore } from '../store/project'
import { useSettingsStore } from '../store/settings'
import type { EnabledModel } from '../store/settings'

interface ModelSettingsModalProps {
  onClose: () => void
  onModelsReloaded?: () => void
}

const CATEGORIES = ['all', 'brand', 'style', 'components', 'constraints', 'general'] as const
type CategoryFilter = (typeof CATEGORIES)[number]

const CATEGORY_COLORS: Record<string, string> = {
  brand: '#f59e0b',
  style: '#8b5cf6',
  components: '#3b82f6',
  constraints: '#ef4444',
  general: '#6b7280',
}

type Tab = 'models' | 'keys' | 'skills'

interface SkillFormState {
  name: string
  description: string
  body: string
  category: string
  scope: string
  is_active: boolean
}

const emptyForm = (): SkillFormState => ({
  name: '', description: '', body: '', category: 'general', scope: 'global', is_active: true,
})

const KEY_FIELDS = [
  { id: 'openai_api_key', label: 'OpenAI API Key', placeholder: 'sk-...' },
  { id: 'anthropic_api_key', label: 'Anthropic API Key', placeholder: 'sk-ant-...' },
  { id: 'gemini_api_key', label: 'Gemini API Key', placeholder: 'AIza...' },
]

export function ModelSettingsModal({ onClose, onModelsReloaded }: ModelSettingsModalProps): ReactElement {
  const [tab, setTab] = useState<Tab>('models')
  const activeProject = useProjectStore((s) => s.activeProject)
  const enabledModels = useSettingsStore((s) => s.enabledModels)
  const setEnabledModels = useSettingsStore((s) => s.setEnabledModels)

  // API Keys tab
  const [keyValues, setKeyValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [savedKeys, setSavedKeys] = useState(false)

  // Models tab – Ollama
  const [ollamaModels, setOllamaModels] = useState<ModelInfo[]>([])
  const [ollamaLoading, setOllamaLoading] = useState(true)
  const [ollamaSearch, setOllamaSearch] = useState('')

  // Models tab – OpenRouter
  const [orKey, setOrKey] = useState('')
  const [orConnected, setOrConnected] = useState(false)
  const [orModels, setOrModels] = useState<OpenRouterModelEntry[]>([])
  const [orSearch, setOrSearch] = useState('')
  const [orLoading, setOrLoading] = useState(false)
  const [orTesting, setOrTesting] = useState(false)
  const [orError, setOrError] = useState<string | null>(null)

  // Skills tab
  const [skills, setSkills] = useState<Skill[]>([])
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newForm, setNewForm] = useState<SkillFormState>(emptyForm())
  const [editForm, setEditForm] = useState<SkillFormState>(emptyForm())
  const [skillsLoading, setSkillsLoading] = useState(false)

  useEffect(() => {
    // Load API keys + detect saved OR key
    settingsApi.getAll().then((settings) => {
      const keys: Record<string, string> = {}
      for (const field of KEY_FIELDS) {
        keys[field.id] = settings[field.id] ?? ''
      }
      setKeyValues(keys)

      const savedOrKey = settings['openrouter_api_key'] ?? ''
      if (savedOrKey) {
        setOrKey(savedOrKey)
        setOrConnected(true)
        setOrLoading(true)
        openrouterApi.listModels(savedOrKey)
          .then(setOrModels)
          .catch(() => undefined)
          .finally(() => setOrLoading(false))
      }
    }).catch(() => undefined)

    // Load Ollama models
    setOllamaLoading(true)
    modelsApi.list()
      .then((all) => setOllamaModels(all.filter((m) => m.provider === 'ollama')))
      .catch(() => undefined)
      .finally(() => setOllamaLoading(false))
  }, [])

  useEffect(() => {
    if (tab !== 'skills') return
    setSkillsLoading(true)
    const load = activeProject
      ? skillsApi.listForProject(activeProject.id)
      : skillsApi.listGlobal()
    load.then(setSkills).catch(() => undefined).finally(() => setSkillsLoading(false))
  }, [tab, activeProject])

  // ─── API Keys handlers ───────────────────────────────────────────────────────

  async function handleSaveKeys() {
    setSaving(true)
    try {
      await Promise.all(
        KEY_FIELDS
          .filter((f) => keyValues[f.id] !== undefined)
          .map((f) => settingsApi.set(f.id, keyValues[f.id] ?? '')),
      )
      setSavedKeys(true)
      setTimeout(() => setSavedKeys(false), 2000)
      onModelsReloaded?.()
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  // ─── OpenRouter handlers ─────────────────────────────────────────────────────

  async function handleConnectOR() {
    if (!orKey.trim() || orTesting) return
    setOrTesting(true)
    setOrError(null)
    try {
      const result = await openrouterApi.testConnection(orKey.trim())
      if (result.ok) {
        await settingsApi.set('openrouter_api_key', orKey.trim())
        setOrConnected(true)
        setOrLoading(true)
        const models = await openrouterApi.listModels(orKey.trim())
        setOrModels(models)
        onModelsReloaded?.()
      } else {
        setOrError(result.error ?? 'Connection failed - check your key')
      }
    } catch (err) {
      setOrError(String(err))
    } finally {
      setOrTesting(false)
      setOrLoading(false)
    }
  }

  function handleDisconnectOR() {
    setOrConnected(false)
    setOrModels([])
    setOrKey('')
    setOrError(null)
    setEnabledModels(enabledModels.filter((m) => m.provider !== 'openrouter'))
    settingsApi.set('openrouter_api_key', '').catch(() => undefined)
    onModelsReloaded?.()
  }

  // ─── Model toggle helpers ────────────────────────────────────────────────────

  function toggleOllamaModel(m: ModelInfo) {
    const em: EnabledModel = { slug: m.slug, name: m.name, provider: 'ollama' }
    const isEnabled = enabledModels.some((e) => e.slug === m.slug)
    if (isEnabled) {
      setEnabledModels(enabledModels.filter((e) => e.slug !== m.slug))
    } else {
      setEnabledModels([...enabledModels, em])
    }
  }

  function toggleOrModel(m: OpenRouterModelEntry) {
    const slug = `openrouter:${m.id}`
    const em: EnabledModel = { slug, name: m.name, provider: 'openrouter' }
    const isEnabled = enabledModels.some((e) => e.slug === slug)
    if (isEnabled) {
      setEnabledModels(enabledModels.filter((e) => e.slug !== slug))
    } else {
      setEnabledModels([...enabledModels, em])
    }
  }

  const filteredOllamaModels = ollamaSearch
    ? ollamaModels.filter((m) => m.name.toLowerCase().includes(ollamaSearch.toLowerCase()))
    : ollamaModels

  const filteredOrModels = orModels.filter((m) => {
    if (!orSearch) return true
    const q = orSearch.toLowerCase()
    return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
  })

  // ─── Skills handlers ─────────────────────────────────────────────────────────

  async function handleToggleSkill(skill: Skill) {
    const updated = await skillsApi.update(skill.id, { is_active: !skill.is_active }).catch(() => null)
    if (updated) setSkills((prev) => prev.map((s) => s.id === skill.id ? updated : s))
  }

  async function handleDeleteSkill(id: string) {
    await skillsApi.delete(id).catch(() => undefined)
    setSkills((prev) => prev.filter((s) => s.id !== id))
    setDeletingId(null)
  }

  async function handleCreateSkill() {
    if (!newForm.name.trim() || !newForm.body.trim()) return
    const created = activeProject && newForm.scope === 'project'
      ? await skillsApi.createForProject(activeProject.id, newForm).catch(() => null)
      : await skillsApi.createGlobal(newForm).catch(() => null)
    if (created) {
      setSkills((prev) => [...prev, created])
      setNewForm(emptyForm())
      setShowNewForm(false)
    }
  }

  async function handleSaveEdit(id: string) {
    const updated = await skillsApi.update(id, editForm).catch(() => null)
    if (updated) {
      setSkills((prev) => prev.map((s) => s.id === id ? updated : s))
      setEditingId(null)
    }
  }

  function startEdit(skill: Skill) {
    setEditForm({
      name: skill.name,
      description: skill.description,
      body: skill.instructions,
      category: skill.category,
      scope: skill.scope,
      is_active: skill.is_active,
    })
    setEditingId(skill.id)
    setShowNewForm(false)
  }

  const filteredSkills = categoryFilter === 'all'
    ? skills
    : skills.filter((s) => s.category === categoryFilter)

  const activeCount = skills.filter((s) => s.is_active).length

  // ─── Shared styles ───────────────────────────────────────────────────────────

  const tabStyle = (active: boolean): React.CSSProperties => ({
    height: 34,
    padding: '0 14px',
    border: 'none',
    background: active ? 'var(--bg-subtle)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--text-muted)',
    borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  })

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 34,
    padding: '0 10px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text)',
    fontSize: 13,
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const textareaStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text)',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    resize: 'vertical',
    lineHeight: 1.5,
    boxSizing: 'border-box',
    minHeight: 72,
  }

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 8,
  }

  const checkboxRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 10px',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    userSelect: 'none',
  }

  function SkillForm({ form, onChange, onSave, onCancel, saveLabel }: {
    form: SkillFormState
    onChange: (f: SkillFormState) => void
    onSave: () => void
    onCancel: () => void
    saveLabel: string
  }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            placeholder="Skill name"
            style={{ ...inputStyle, flex: 1, fontSize: 12 }}
          />
          <select
            value={form.category}
            onChange={(e) => onChange({ ...form, category: e.target.value })}
            style={{ ...inputStyle, width: 130, fontFamily: 'var(--font-ui)', fontSize: 12 }}
          >
            {['general', 'brand', 'style', 'components', 'constraints'].map((c) => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
          <select
            value={form.scope}
            onChange={(e) => onChange({ ...form, scope: e.target.value })}
            style={{ ...inputStyle, width: 120, fontFamily: 'var(--font-ui)', fontSize: 12 }}
          >
            <option value="global">Global</option>
            {activeProject && <option value="project">This project</option>}
          </select>
        </div>
        <input
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          placeholder="Short description (optional)"
          style={{ ...inputStyle, fontSize: 12 }}
        />
        <textarea
          value={form.body}
          onChange={(e) => onChange({ ...form, body: e.target.value })}
          placeholder="Prompt fragment injected into every generation when this skill is active…"
          style={textareaStyle}
          rows={3}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ height: 28, padding: '0 12px', borderRadius: 'var(--radius-md)', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!form.name.trim() || !form.body.trim()}
            style={{ height: 28, padding: '0 12px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', border: 'none', color: 'var(--text-inverse)', fontSize: 11, fontWeight: 600, cursor: (!form.name.trim() || !form.body.trim()) ? 'not-allowed' : 'pointer', opacity: (!form.name.trim() || !form.body.trim()) ? 0.5 : 1 }}
          >
            {saveLabel}
          </button>
        </div>
      </div>
    )
  }

  const modalWidth = tab === 'models' ? 660 : tab === 'skills' ? 620 : 480

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-xl)',
          width: modalWidth,
          maxHeight: '85vh',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.15s ease',
        }}
      >
        {/* Header */}
        <div style={{ height: 52, padding: '0 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', flex: 1 }}>Settings</span>
          <button onClick={onClose} style={{ width: 26, height: 26, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px', flexShrink: 0 }}>
          <button style={tabStyle(tab === 'models')} onClick={() => setTab('models')}>Models</button>
          <button style={tabStyle(tab === 'keys')} onClick={() => setTab('keys')}>API Keys</button>
          <button style={tabStyle(tab === 'skills')} onClick={() => setTab('skills')}>
            Skills
            {activeCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--primary)', color: 'var(--text-inverse)', borderRadius: 'var(--radius-full)', padding: '1px 5px', lineHeight: 1.4 }}>
                {activeCount}
              </span>
            )}
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', flex: 1 }}>

          {/* ── Models tab ──────────────────────────────────────────────────── */}
          {tab === 'models' && (
            <>
              {/* Ollama section */}
              <div>
                <div style={sectionLabelStyle}>Ollama</div>
                {ollamaLoading ? (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Loading…</p>
                ) : ollamaModels.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>No Ollama models found - is Ollama running?</p>
                ) : (
                  <>
                    <input
                      value={ollamaSearch}
                      onChange={(e) => setOllamaSearch(e.target.value)}
                      placeholder="Filter models…"
                      style={{ ...inputStyle, marginBottom: 6, fontFamily: 'var(--font-ui)', fontSize: 12 }}
                    />
                    <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '4px' }}>
                      {filteredOllamaModels.length === 0 ? (
                        <p style={{ margin: '6px 8px', fontSize: 12, color: 'var(--text-muted)' }}>No models match "{ollamaSearch}"</p>
                      ) : filteredOllamaModels.map((m) => {
                        const checked = enabledModels.some((e) => e.slug === m.slug)
                        return (
                          <label key={m.slug} style={{ ...checkboxRowStyle, background: checked ? 'var(--bg-subtle)' : 'transparent' }} onClick={() => toggleOllamaModel(m)}>
                            <input type="checkbox" checked={checked} onChange={() => undefined} style={{ accentColor: 'var(--primary)', width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }} />
                            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', flex: 1, fontFamily: 'var(--font-mono)' }}>{m.name}</span>
                            {m.size_bytes && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {(m.size_bytes / 1e9).toFixed(1)} GB
                              </span>
                            )}
                          </label>
                        )
                      })}
                    </div>
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      Check models to pin them in the canvas dropdown. Leave all unchecked to show all.
                    </p>
                  </>
                )}
              </div>

              {/* OpenRouter section */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={sectionLabelStyle}>OpenRouter</span>
                  {orConnected && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--status-green)', background: 'rgba(34,197,94,0.12)', borderRadius: 'var(--radius-full)', padding: '2px 7px', marginBottom: 8 }}>
                      ✓ Connected
                    </span>
                  )}
                </div>

                {!orConnected ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="password"
                        value={orKey}
                        onChange={(e) => { setOrKey(e.target.value); setOrError(null) }}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleConnectOR() }}
                        placeholder="sk-or-v1-..."
                        autoComplete="off"
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button
                        onClick={handleConnectOR}
                        disabled={!orKey.trim() || orTesting}
                        style={{ height: 34, padding: '0 14px', borderRadius: 'var(--radius-md)', background: 'var(--primary)', border: 'none', color: 'var(--text-inverse)', fontSize: 12, fontWeight: 600, cursor: (!orKey.trim() || orTesting) ? 'not-allowed' : 'pointer', opacity: (!orKey.trim() || orTesting) ? 0.5 : 1, whiteSpace: 'nowrap' }}
                      >
                        {orTesting ? 'Testing…' : 'Test & Connect'}
                      </button>
                    </div>
                    {orError && (
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--status-red)', lineHeight: 1.4 }}>{orError}</p>
                    )}
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      Sends a tiny test request to verify your key works before saving.
                    </p>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <input
                        type="text"
                        value={orSearch}
                        onChange={(e) => setOrSearch(e.target.value)}
                        placeholder="Search models…"
                        style={{ ...inputStyle, flex: 1, fontFamily: 'var(--font-ui)' }}
                      />
                      <button
                        onClick={handleDisconnectOR}
                        style={{ height: 34, padding: '0 12px', borderRadius: 'var(--radius-md)', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        Disconnect
                      </button>
                    </div>
                    {orLoading ? (
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Loading models…</p>
                    ) : (
                      <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '4px' }}>
                        {filteredOrModels.length === 0 ? (
                          <p style={{ margin: '8px 0', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No models match</p>
                        ) : filteredOrModels.map((m) => {
                          const slug = `openrouter:${m.id}`
                          const checked = enabledModels.some((e) => e.slug === slug)
                          return (
                            <label key={m.id} style={{ ...checkboxRowStyle, background: checked ? 'var(--bg-subtle)' : 'transparent' }} onClick={() => toggleOrModel(m)}>
                              <input type="checkbox" checked={checked} onChange={() => undefined} style={{ accentColor: 'var(--primary)', width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }} />
                              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                                {m.context_length && (
                                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                    {m.context_length >= 1000 ? `${Math.round(m.context_length / 1000)}K` : m.context_length} ctx
                                  </span>
                                )}
                                {m.prompt_price && (
                                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                    {m.prompt_price}/<span style={{ fontSize: 9 }}>1M in</span>
                                  </span>
                                )}
                                {m.completion_price && (
                                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                    {m.completion_price}/<span style={{ fontSize: 9 }}>1M out</span>
                                  </span>
                                )}
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    )}
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      Check models to add them to the canvas dropdown.{' '}
                      {enabledModels.filter((m) => m.provider === 'openrouter').length > 0 && (
                        <span style={{ color: 'var(--primary)', fontWeight: 500 }}>
                          {enabledModels.filter((m) => m.provider === 'openrouter').length} selected
                        </span>
                      )}
                    </p>
                  </>
                )}
              </div>
            </>
          )}

          {/* ── API Keys tab ─────────────────────────────────────────────────── */}
          {tab === 'keys' && (
            <>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                API keys are stored in the local database and override environment variables.
                Leave blank to use the server's env var defaults.
              </p>
              {KEY_FIELDS.map((field) => (
                <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{field.label}</label>
                  <input
                    type="password"
                    value={keyValues[field.id] ?? ''}
                    onChange={(e) => setKeyValues((v) => ({ ...v, [field.id]: e.target.value }))}
                    placeholder={field.placeholder}
                    style={inputStyle}
                    autoComplete="off"
                  />
                </div>
              ))}
            </>
          )}

          {/* ── Skills tab ───────────────────────────────────────────────────── */}
          {tab === 'skills' && (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    style={{
                      height: 26, padding: '0 10px', borderRadius: 'var(--radius-full)',
                      border: `1px solid ${categoryFilter === cat ? (cat === 'all' ? 'var(--primary)' : CATEGORY_COLORS[cat]) : 'var(--border)'}`,
                      background: categoryFilter === cat ? (cat === 'all' ? 'rgba(99,102,241,0.1)' : `${CATEGORY_COLORS[cat]}18`) : 'transparent',
                      color: categoryFilter === cat ? (cat === 'all' ? 'var(--primary)' : CATEGORY_COLORS[cat]) : 'var(--text-muted)',
                      fontSize: 11, fontWeight: 500, cursor: 'pointer',
                    }}
                  >
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                <button
                  onClick={() => { setShowNewForm(true); setEditingId(null) }}
                  style={{ height: 26, padding: '0 10px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--primary)', color: 'var(--text-inverse)', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> New skill
                </button>
              </div>

              {showNewForm && (
                <SkillForm
                  form={newForm}
                  onChange={setNewForm}
                  onSave={handleCreateSkill}
                  onCancel={() => { setShowNewForm(false); setNewForm(emptyForm()) }}
                  saveLabel="Create"
                />
              )}

              {skillsLoading ? (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Loading…</p>
              ) : filteredSkills.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
                  {skills.length === 0 ? 'No skills yet - create one above.' : 'No skills in this category.'}
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filteredSkills.map((skill) => (
                    <div key={skill.id}>
                      {editingId === skill.id ? (
                        <SkillForm
                          form={editForm}
                          onChange={setEditForm}
                          onSave={() => handleSaveEdit(skill.id)}
                          onCancel={() => setEditingId(null)}
                          saveLabel="Save"
                        />
                      ) : (
                        <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', opacity: skill.is_active ? 1 : 0.55 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{skill.name}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 'var(--radius-sm)', background: `${CATEGORY_COLORS[skill.category] ?? '#6b7280'}22`, color: CATEGORY_COLORS[skill.category] ?? '#6b7280' }}>
                              {skill.category}
                            </span>
                            {skill.scope === 'project' && (
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>project</span>
                            )}
                            <button
                              onClick={() => handleToggleSkill(skill)}
                              title={skill.is_active ? 'Disable skill' : 'Enable skill'}
                              style={{ width: 32, height: 18, borderRadius: 9, border: 'none', background: skill.is_active ? 'var(--primary)' : 'var(--border-strong)', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.15s' }}
                            >
                              <span style={{ position: 'absolute', top: 2, left: skill.is_active ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
                            </button>
                            <button onClick={() => startEdit(skill)} title="Edit" style={{ width: 24, height: 24, borderRadius: 'var(--radius-sm)', border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✎</button>
                            {deletingId === skill.id ? (
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Delete?</span>
                                <button onClick={() => handleDeleteSkill(skill.id)} style={{ height: 20, padding: '0 6px', borderRadius: 4, border: 'none', background: '#ef444420', color: '#ef4444', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Yes</button>
                                <button onClick={() => setDeletingId(null)} style={{ height: 20, padding: '0 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer' }}>No</button>
                              </div>
                            ) : (
                              <button onClick={() => setDeletingId(skill.id)} title="Delete" style={{ width: 24, height: 24, borderRadius: 'var(--radius-sm)', border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                            )}
                          </div>
                          {skill.description && (
                            <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{skill.description}</p>
                          )}
                          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {skill.instructions}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {tab === 'keys' && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
            <button onClick={onClose} style={{ height: 34, padding: '0 16px', borderRadius: 'var(--radius-md)', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
              Cancel
            </button>
            <button
              onClick={handleSaveKeys}
              disabled={saving}
              style={{ height: 34, padding: '0 16px', borderRadius: 'var(--radius-md)', background: savedKeys ? 'var(--status-green)' : 'var(--primary)', border: 'none', color: 'var(--text-inverse)', fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', transition: 'background 0.2s' }}
            >
              {savedKeys ? '✓ Saved' : saving ? 'Saving…' : 'Save keys'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
