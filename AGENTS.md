# AI Agent Guidelines - OpenStitch

## Using a Supported AI Tool?

**If you are Claude, GitHub Copilot, Codeium, Cursor, or Continue.dev**, use your tool-specific file:

| Tool | File |
|---|---|
| **Claude** | [`.claude/CLAUDE.md`](./.claude/CLAUDE.md) ← primary reference for all AI tools |
| **GitHub Copilot** | [`.github/copilot-instructions.md`](./.github/copilot-instructions.md) |
| **Cursor** | [`.cursor/rules`](./.cursor/rules) |
| **Codeium** | [`.codeium/instructions.md`](./.codeium/instructions.md) |
| **Continue.dev** | [`.continue/instructions.md`](./.continue/instructions.md) |

---

## For Other AI Agents

[`.claude/CLAUDE.md`](./.claude/CLAUDE.md) is the **single authoritative source** for AI contributions to OpenStitch. This file is a quick overview - consult CLAUDE.md for full details.

### Project Overview

- **OpenStitch** - open-source, locally-runnable AI UI design tool
- **Frontend**: React 18 + Vite + TypeScript + Tailwind, running in Docker
- **Backend**: FastAPI (Python 3.11+), SQLite, WebSocket streaming
- **Canvas**: @xyflow/react - screens as nodes, navigation edges between them
- **AI**: Ollama (local) + optional OpenAI / Anthropic / Gemini / OpenRouter

### Key Constraints

1. **CSS variables for theming** - never hardcode hex colors; use `var(--bg-surface)`, `var(--text)`, etc.
2. **TypeScript strictness** - no `as any`; always run `npx tsc --noEmit` before committing
3. **Docker rebuild** - the frontend has no hot reload in production; always rebuild after changes
4. **Sandbox security** - the iframe sandbox in `preview/sandbox-utils.ts` is carefully scoped; changes need care
5. **API contract** - frontend and backend must stay in sync; don't change one side without the other

### Quality Commands

```bash
cd frontend && npx tsc --noEmit          # TypeScript
cd frontend && pnpm eslint src --ext ts,tsx  # Lint frontend
cd backend && uv run mypy src            # Type check backend
cd backend && uv run ruff check src      # Lint backend
cd backend && uv run pytest              # Backend tests
docker compose build frontend && docker compose up -d frontend  # Rebuild
```

### Good Use Cases

- UI panels, canvas features, store improvements
- LLM prompt templates (`backend/src/prompts/`)
- New skills (add a `.yaml` file to `backend/src/skills/`)
- New model provider adapters
- Backend tests

### Use with Caution

- Sandbox security model (`preview/sandbox-utils.ts`)
- Streaming protocol (`frontend/src/lib/stream.ts`)
- API shape changes (must update both frontend and backend)

---

**Full guidelines: [`.claude/CLAUDE.md`](./.claude/CLAUDE.md)**
