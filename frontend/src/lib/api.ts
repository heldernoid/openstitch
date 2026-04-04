import { log } from '../store/log'

// Empty string = same origin (works behind Nginx proxy in Docker production)
const BASE = (import.meta.env.VITE_HTTP_BACKEND_URL as string | undefined) ?? 'http://localhost:7001'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const t0 = Date.now()
  log.http(`→ ${method} ${path}`)
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (networkErr) {
    console.error(`[api] network error: ${method} ${BASE}${path}`, networkErr)
    log.http(`← network error: ${method} ${path}`)
    throw networkErr
  }
  const ms = Date.now() - t0
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    log.http(`← ${res.status} ${method} ${path} (${ms}ms) - ${text.slice(0, 80)}`)
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`)
  }
  log.http(`← ${res.status} ${method} ${path} (${ms}ms)`)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}

// ---- Typed API helpers ----

export interface ModelInfo {
  slug: string
  provider: string
  name: string
  supports_vision: boolean
  size_bytes?: number | null
}

export interface Project {
  id: string
  name: string
  created_at: string
  updated_at: string
  canvas_snapshot_json: string | null
  design_md?: string | null
}

export interface Screen {
  id: string
  project_id: string
  name: string
  framework: string
  code: string
  created_at: string
  updated_at: string
  thumbnail_data_url: string | null
}

export interface ScreenVersion {
  id: string
  screen_id: string
  code: string
  prompt: string
  model: string
  created_at: string
}

export interface Session {
  id: string
  project_id: string
  screen_id: string | null
  prompt: string
  model: string
  framework: string
  prompt_tokens: number
  completion_tokens: number
  created_at: string
}

export const modelsApi = {
  list: () => api.get<ModelInfo[]>('/api/models'),
}

export interface OpenRouterModelEntry {
  id: string
  name: string
  context_length: number | null
  prompt_price: string | null
  completion_price: string | null
}

export const openrouterApi = {
  listModels: (key?: string) => {
    const qs = key ? `?key=${encodeURIComponent(key)}` : ''
    return api.get<OpenRouterModelEntry[]>(`/api/openrouter/models${qs}`)
  },
  testConnection: (apiKey: string) =>
    api.post<{ ok: boolean; error?: string }>('/api/openrouter/test', { api_key: apiKey }),
}

export const projectsApi = {
  list:         ()                => api.get<Project[]>('/api/projects'),
  create:       (name: string)    => api.post<Project>('/api/projects', { name }),
  get:          (id: string)      => api.get<Project>(`/api/projects/${id}`),
  rename:       (id: string, name: string) => api.patch<Project>(`/api/projects/${id}`, { name }),
  delete:       (id: string)      => api.delete<void>(`/api/projects/${id}`),
  deleteAll:    ()               => api.delete<void>('/api/projects'),
  saveCanvas:   (id: string, snapshot_json: string) =>
    api.put<void>(`/api/projects/${id}/canvas`, { snapshot_json }),
  listSessions: (id: string)      => api.get<Session[]>(`/api/projects/${id}/sessions`),
  getDesignMd:  (id: string)      => api.get<{ design_md: string | null }>(`/api/projects/${id}/design-md`),
  suggestName:  (prompt: string, model: string) => api.post<{ name: string }>('/api/projects/suggest-name', { prompt, model }),
}

export interface FlowEdgePayload {
  source_screen_id: string
  target_screen_id: string
  trigger_selector: string
  label?: string
  transition?: string
}

export const flowEdgesApi = {
  create: (projectId: string, body: FlowEdgePayload) =>
    api.post<{ id: string }>(`/api/projects/${projectId}/flow-edges`, body),
  delete: (projectId: string, edgeId: string) =>
    api.delete<void>(`/api/projects/${projectId}/flow-edges/${edgeId}`),
}

export const settingsApi = {
  getAll: () => api.get<Record<string, string>>('/api/settings'),
  set: (key: string, value: string) =>
    api.put<void>(`/api/settings/${key}`, { value }),
}

export interface SkillParameter {
  key: string
  label: string
  type: 'text' | 'color'
  default_value: string
}

export interface Skill {
  id: string
  name: string
  description: string
  instructions: string
  examples: string
  parameters: string    // JSON string → SkillParameter[]
  param_values: string  // JSON string → Record<string,string>
  category: string
  scope: string
  project_id: string | null
  is_active: boolean
  sort_order: number
  created_at: string
}

export const skillsApi = {
  listGlobal:      ()                   => api.get<Skill[]>('/api/skills'),
  listForProject:  (projectId: string)  => api.get<Skill[]>(`/api/projects/${projectId}/skills`),
  createGlobal:    (body: Partial<Skill>) => api.post<Skill>('/api/skills', body),
  createForProject:(projectId: string, body: Partial<Skill>) =>
    api.post<Skill>(`/api/projects/${projectId}/skills`, body),
  update:          (id: string, patch: Partial<Skill>) => api.patch<Skill>(`/api/skills/${id}`, patch),
  delete:          (id: string)         => api.delete<void>(`/api/skills/${id}`),
}

export interface DesignSystem {
  name: string
  label: string
  accent: string
  preview_colors?: string[]
  content?: string
}

export const designSystemsApi = {
  list: () => api.get<DesignSystem[]>('/api/design-systems'),
  get:  (name: string) => api.get<DesignSystem>(`/api/design-systems/${name}`),
}

export const screensApi = {
  list:    (projectId: string)    => api.get<Screen[]>(`/api/projects/${projectId}/screens`),
  get:     (id: string)           => api.get<Screen>(`/api/screens/${id}`),
  patch:   (id: string, body: Partial<Screen> & { prompt?: string; model?: string }) =>
    api.patch<Screen>(`/api/screens/${id}`, body),
  delete:  (id: string)           => api.delete<void>(`/api/screens/${id}`),
  versions:(id: string)           => api.get<ScreenVersion[]>(`/api/screens/${id}/versions`),
}
