import { create } from 'zustand'
import { projectsApi, screensApi } from '../lib/api'
import type { Project, Screen } from '../lib/api'
import { useGenerationStore } from './generation'

const LAST_PROJECT_KEY = 'openstitch:lastProjectId'
const lastPromptKey = (id: string) => `openstitch:last_prompt:${id}`

interface ProjectState {
  projects: Project[]
  activeProject: Project | null
  activeProjectLastPrompt: string | null
  screens: Screen[]
  activeScreen: Screen | null
  loading: boolean

  setLastPrompt: (projectId: string, prompt: string) => void

  loadProjects: () => Promise<void>
  setActiveProject: (project: Project | null) => Promise<void>
  createProject: (name: string) => Promise<Project>
  renameProject: (id: string, name: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  deleteAllProjects: () => Promise<void>
  updateProjectCanvas: (projectId: string, snapshotJson: string) => void

  loadScreens: (projectId: string) => Promise<void>
  setActiveScreen: (screen: Screen | null) => void
  updateScreenLocally: (screen: Screen) => void
  removeScreenLocally: (id: string) => void
  addScreenLocally: (screen: Screen) => void
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProject: null,
  activeProjectLastPrompt: null,
  screens: [],
  activeScreen: null,
  loading: false,

  loadProjects: async () => {
    set({ loading: true })
    try {
      const projects = await projectsApi.list()
      set({ projects })
      if (projects.length > 0 && !get().activeProject) {
        // URL param wins, then localStorage — no fallback to projects[0] so
        // that clearing the preference (logo click) sticks across refreshes
        const urlId = new URLSearchParams(window.location.search).get('project')
        const savedId = localStorage.getItem(LAST_PROJECT_KEY)
        const preferredId = urlId || savedId
        const preferred = preferredId ? projects.find((p) => p.id === preferredId) : null
        if (preferred) {
          await get().setActiveProject(preferred)
        }
      }
    } finally {
      set({ loading: false })
    }
  },

  setActiveProject: async (project) => {
    if (project) {
      localStorage.setItem(LAST_PROJECT_KEY, project.id)
      const url = new URL(window.location.href)
      url.searchParams.set('project', project.id)
      history.replaceState(null, '', url.toString())
    } else {
      localStorage.removeItem(LAST_PROJECT_KEY)
      const url = new URL(window.location.href)
      url.searchParams.delete('project')
      history.replaceState(null, '', url.toString())
    }
    const lastPrompt = project ? (localStorage.getItem(lastPromptKey(project.id)) ?? null) : null
    set({ activeProject: project, activeProjectLastPrompt: lastPrompt, screens: [], activeScreen: null })
    useGenerationStore.setState({
      designMd: '', planJson: '', appPlan: [],
      isGeneratingDesign: false, isGeneratingPlan: false,
      streamingScreenCode: '', streamingScreenName: null,
      isGeneratingApp: false, appError: null,
    })
    if (project) {
      await get().loadScreens(project.id)
    }
  },

  setLastPrompt: (projectId, prompt) => {
    localStorage.setItem(lastPromptKey(projectId), prompt)
    if (get().activeProject?.id === projectId) {
      set({ activeProjectLastPrompt: prompt })
    }
  },

  createProject: async (name) => {
    const project = await projectsApi.create(name)
    set((s) => ({ projects: [project, ...s.projects] }))
    await get().setActiveProject(project)
    return project
  },

  renameProject: async (id, name) => {
    const updated = await projectsApi.rename(id, name)
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? updated : p)),
      activeProject: s.activeProject?.id === id ? updated : s.activeProject,
    }))
  },

  deleteProject: async (id) => {
    await projectsApi.delete(id)
    const remaining = get().projects.filter((p) => p.id !== id)
    const next = remaining[0] ?? null
    set({ projects: remaining })
    if (get().activeProject?.id === id) {
      await get().setActiveProject(next)
    }
  },

  deleteAllProjects: async () => {
    await projectsApi.deleteAll()
    await get().setActiveProject(null)
    set({ projects: [] })
  },

  /** Update the in-memory canvas snapshot so switching back to this project loads correctly. */
  updateProjectCanvas: (projectId, snapshotJson) => {
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, canvas_snapshot_json: snapshotJson } : p,
      ),
      activeProject:
        s.activeProject?.id === projectId
          ? { ...s.activeProject, canvas_snapshot_json: snapshotJson }
          : s.activeProject,
    }))
  },

  loadScreens: async (projectId) => {
    const screens = await screensApi.list(projectId)
    set({ screens })
  },

  setActiveScreen: (screen) => set({ activeScreen: screen }),

  updateScreenLocally: (screen) => {
    set((s) => ({
      screens: s.screens.map((sc) => (sc.id === screen.id ? screen : sc)),
      activeScreen: s.activeScreen?.id === screen.id ? screen : s.activeScreen,
    }))
  },

  removeScreenLocally: (id) => {
    set((s) => ({
      screens: s.screens.filter((sc) => sc.id !== id),
      activeScreen: s.activeScreen?.id === id ? null : s.activeScreen,
    }))
  },

  addScreenLocally: (screen) => {
    set((s) => ({ screens: [screen, ...s.screens] }))
  },
}))
