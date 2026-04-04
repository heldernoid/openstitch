export type Framework = 'html_tailwind' | 'react_tailwind' | 'vue_tailwind' | 'html_css'

export interface FrameworkMeta {
  id: Framework
  label: string
  shortLabel: string
  color: string
  bg: string
}

export const FRAMEWORKS: FrameworkMeta[] = [
  { id: 'html_tailwind',  label: 'HTML + Tailwind', shortLabel: 'HTML/TW',   color: '#e34c26', bg: 'rgba(227,76,38,0.12)' },
  { id: 'react_tailwind', label: 'React + Tailwind', shortLabel: 'React/TW', color: '#61dafb', bg: 'rgba(97,218,251,0.10)' },
  { id: 'vue_tailwind',   label: 'Vue + Tailwind',   shortLabel: 'Vue/TW',   color: '#42b883', bg: 'rgba(66,184,131,0.10)' },
  { id: 'html_css',       label: 'HTML + CSS',        shortLabel: 'HTML/CSS', color: '#7b9ef0', bg: 'rgba(38,77,228,0.12)'  },
]

export const FRAMEWORK_MAP: Record<Framework, FrameworkMeta> = Object.fromEntries(
  FRAMEWORKS.map(f => [f.id, f])
) as Record<Framework, FrameworkMeta>
