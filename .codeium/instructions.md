# Codeium Instructions - OpenStitch

## Primary Reference

Read [`.claude/CLAUDE.md`](../.claude/CLAUDE.md) before making changes. That document is the authoritative guide for all AI-assisted contributions to OpenStitch.

---

## Project Context

- **OpenStitch**: open-source AI UI design tool - text/screenshot/sketch to frontend code
- **Frontend**: React 18 + Vite + TypeScript + Tailwind, built in Docker
- **Backend**: FastAPI (Python 3.11+), SQLite, WebSocket streaming
- **Canvas**: @xyflow/react (screens as nodes, edges wire navigation)
- **State**: Zustand stores

### Key Directories

```
frontend/src/canvas/        canvas and screen nodes
frontend/src/editor/        WorkspacePanel (file tree + CodeMirror)
frontend/src/generation/    PromptPanel, streaming
frontend/src/preview/       iframe sandbox, PlayMode
frontend/src/store/         Zustand stores
backend/src/routers/        API routes
backend/src/prompts/        LLM prompt templates
backend/src/skills/          skill YAML files - one per skill, loaded on startup
```

### Non-Negotiable Rules

1. **CSS variables only** - `var(--bg-surface)`, `var(--text)`, `var(--border)`, `var(--primary)`. No hex codes.
2. **TypeScript** - `npx tsc --noEmit` must pass. No `as any`.
3. **Docker rebuild** - `docker compose build frontend && docker compose up -d frontend` after every frontend change.
4. **No AI noise** - remove verbose/boilerplate comments before committing.
5. **Single scope per PR** - don't mix unrelated changes.

### Quality Commands

```bash
cd frontend && npx tsc --noEmit
cd frontend && pnpm eslint src --ext ts,tsx
cd backend && uv run mypy src && uv run ruff check src && uv run pytest
```

---

Full guidelines: [`.claude/CLAUDE.md`](../.claude/CLAUDE.md)
