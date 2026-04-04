# Contributing to OpenStitch

Thanks for your interest in contributing. Here's what you need to know.

## Requirements for Code Contributions

1. PRs must be focused on a **single scope** - don't mix features, refactors, and bug fixes
2. **TypeScript must pass** - `cd frontend && npx tsc --noEmit`
3. **Lint must pass** - frontend ESLint and backend ruff
4. New features should include tests where applicable (backend tests in `backend/tests/`)
5. **No hardcoded colors** - use CSS variables (`var(--bg-surface)`, `var(--text)`, etc.)
6. **AI-generated noise must be removed** before opening a PR - no boilerplate comments, no verbose explanations of obvious code
7. All CI checks must pass
8. PRs must include the **AI Tool Disclosure** section in the PR description (even if you didn't use AI)

## Development Setup

```bash
git clone https://github.com/your-org/openstitch
cd openstitch
cp .env.example .env
make up
open http://localhost:3000
```

## Making Changes

```bash
# Type check
cd frontend && npx tsc --noEmit

# Lint
cd frontend && pnpm eslint src --ext ts,tsx
cd backend && uv run ruff check src

# Backend type check + tests
cd backend && uv run mypy src
cd backend && uv run pytest

# Rebuild frontend after changes (required - no hot reload in Docker)
docker compose build frontend && docker compose up -d frontend
```

## AI-Assisted Contributions

AI tools are welcome. See [`.claude/CLAUDE.md`](./.claude/CLAUDE.md) for full guidelines. The short version:

- Use CSS variables, not hardcoded colors
- Don't bypass TypeScript
- Clean up AI-generated boilerplate before submitting
- Test the Docker build before opening a PR

## Reporting Issues

Open a GitHub issue with a clear description, steps to reproduce, and your environment (OS, Docker version, Ollama version, model used).
