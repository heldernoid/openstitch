### Description

A clear summary of the change and which issue it addresses (if any).

Fixes issue: <!-- #0000 or none -->

### AI Tool Disclosure

- [ ] My contribution does not include any AI-generated content
- [ ] My contribution includes AI-generated content, as disclosed below:
    - AI tools used: `[e.g. Claude, GitHub Copilot, Cursor, Codeium]`
    - Models: `[e.g. Claude Sonnet 4.6, GPT-4o, Gemini 2.5 Pro]`
    - How it was used: `[e.g. generated initial implementation, wrote tests, suggested refactor]`

### Checklist

- [ ] TypeScript passes - `cd frontend && npx tsc --noEmit`
- [ ] Frontend lint passes - `cd frontend && pnpm eslint src --ext ts,tsx`
- [ ] Backend checks pass - `uv run mypy src`, `uv run ruff check src`, `uv run pytest` (if backend changed)
- [ ] No hardcoded colors - CSS variables used throughout
- [ ] AI-generated noise removed - no boilerplate or verbose comments
- [ ] Docker rebuild tested locally
- [ ] Single focused scope
- [ ] Follows guidelines in [CONTRIBUTING.md](./CONTRIBUTING.md)
