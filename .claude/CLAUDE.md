# Contributing with AI Assistants - OpenStitch

This is the **primary reference for all AI tools** working on OpenStitch. Other tool-specific files (`.cursor/rules`, `.github/copilot-instructions.md`, etc.) refer here for full guidelines.

---

## Project Overview

OpenStitch is an open-source, locally-runnable AI UI design tool — think Google Stitch but self-hosted. Users describe a web app, optionally pick a design system, and get a full set of screens as self-contained HTML files on an infinite canvas. Screens connect into a clickable prototype. The output is designed screens — a prototype, not a codebase.

**This is NOT a code generator for shipping apps. NOT a Lovable clone.**

| Layer | Stack |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind |
| Canvas | @xyflow/react (React Flow) |
| Code editor | CodeMirror 6 (not Monaco) |
| State | Zustand |
| Backend | FastAPI (Python 3.11+) |
| Database | SQLite via aiosqlite |
| AI | Ollama (local) · OpenRouter (tested) · OpenAI · Anthropic · Gemini (wired, untested) |

**Tested and recommended providers:** Ollama (local, primary) and OpenRouter (cloud). Others work but have had less testing.

---

## How the Product Works

### Two entry points

**LandingView** (`generation/LandingView.tsx`) — shown when no project is active or no screens exist yet. Contains:
- Prompt textarea
- **Pencil/sketch button** — opens the `SketchPad` drawing canvas (pen, eraser, shapes, colors, text). When done, the sketch is attached as an image and the "Replicate" button appears.
- **Clip button** — opens file picker to attach a screenshot. Same result: image attached, "Replicate" button appears.
- Design system picker (dropdown, opens upward) — "Auto" (AI-generated) or one of 50+ brand design systems from awesome-design-md
- Model selector (custom dropdown, opens upward)
- Example prompt pills (horizontal scrollable row)
- **Generate** button — creates a full multi-screen app (DESIGN.md + plan + all screens)
- **Replicate** button — only appears when an image/sketch is attached. Creates a single screen that replicates the attached image.

**PromptPanel** (`generation/PromptPanel.tsx`) — shown when a project already has screens (canvas view). Contains:
- Prompt textarea
- **Clip button** — attach a reference image for the next generation (same as LandingView clip)
- **Iterate on [screen]** toggle — when active, the next generation iterates on the selected screen rather than creating a new one
- **Generate** button — generates a new multi-screen app for the existing project
- **Replicate** button — only appears when an image is attached (single-screen generation from image)

Note: PromptPanel does NOT have the sketch/draw button. Sketching is only in LandingView. PromptPanel does NOT have the model or design pickers — those live in the toolbar and LandingView respectively.

### DESIGN.md — the design source of truth

Every project has a **DESIGN.md** — a rich prose document that defines the full visual identity of the project:
- Visual theme & atmosphere
- Color palette with hex values and roles
- Typography (fonts, scale, weights)
- Component styles (buttons, cards, inputs, badges, nav)
- Layout principles
- Depth & elevation
- Do's and Don'ts
- Responsive behavior
- Agent Prompt Guide (quick reference for the LLM)

This format is based on [awesome-design-md](https://github.com/nicholasgriffintn/awesome-design-md). Two sources:
1. **User picks a brand** → planner receives the brand's DESIGN.md and outputs a modified version adapted to the user's app
2. **Auto** → planner generates a full rich DESIGN.md from scratch

DESIGN.md is stored per-project in the DB and is visible in the WorkspacePanel editor. It is injected into every screen generation so all screens share the same visual identity.

**DESIGN.md ≠ Skills.** DESIGN.md = *what it looks like*. Skills = *how to build things* (layout patterns, functional constraints, accessibility, etc.).

### Design Systems directory

Brand DESIGN.md files live on disk, mounted into the backend container at `/app/design-systems/`. Layout:

```
design-systems/
  third-party/
    awesome-design-md/
      linear.app/DESIGN.md
      stripe.com/DESIGN.md
      ...                        # 50+ brand designs from awesome-design-md
  user/
    my-brand/DESIGN.md           # user's own custom designs
```

`GET /api/design-systems` scans this tree, extracts each design's accent color and display label, and returns the list for the picker. `GET /api/design-systems/{name}` returns the full content plus preview colors.

**How brand selection feeds generation:**

When the user picks a brand (e.g. "linear.app"), the frontend fetches that DESIGN.md and sends it as `reference_design_md` to the backend. `build_design_doc_prompt()` in `backend/src/prompts/design_doc.py` then asks the LLM to *adapt* it for the user's app description — keeping the spirit and values, adapting component descriptions and the Agent Prompt Guide to the new domain. The reference is truncated to 8000 chars before being sent.

When the user picks **Auto**, no reference is provided and the LLM generates a full DESIGN.md from scratch using the domain-specific rules in `DESIGN_DOC_SYSTEM_PROMPT`.

**The 9 required sections** the LLM must output:
1. Visual Theme & Atmosphere
2. Color Palette & Roles (exact hex values)
3. Typography Rules (two distinct Google Fonts)
4. Component Stylings (buttons, cards, inputs, badges, nav)
5. Layout Principles (8px grid, max-widths)
6. Depth & Elevation
7. Do's and Don'ts
8. Responsive Behavior
9. Agent Prompt Guide (color token table + example component prompts)

### Generated screens

Every screen is a **self-contained HTML file**:
- Tailwind CDN with `tailwind.config` embedded (colors, fonts, radii from DESIGN.md)
- Google Fonts via CDN link
- Material Symbols for icons
- No build step — opens directly in any browser

### Skills

Skills are YAML prompt fragments injected into the LLM for every screen generation when active. They encode functional patterns only (layout templates, a11y, responsive, animation, etc.) — never visual styles (those belong in DESIGN.md or the design system picker). Located in `backend/src/skills/`.

---

## Key Files and Directories

```
frontend/src/
  canvas/
    CanvasRoot.tsx        React Flow canvas root
    ScreenNode.tsx        Individual screen node (iframe preview + controls)
    SketchPad.tsx         Drawing canvas overlay (pen, eraser, shapes, colors, text tool)
  editor/
    WorkspacePanel.tsx    Right panel: file tree + CodeMirror editors for DESIGN.md, plan.json, screens
    CodePanel.tsx         Legacy single-screen code panel (deprecated in favour of WorkspacePanel)
  generation/
    LandingView.tsx       Entry screen: prompt box, sketch button, clip button, design/model pickers, examples
    PromptPanel.tsx       In-canvas prompt bar: prompt, clip, iterate toggle, generate/replicate
    GenerationStream.tsx  Live token stream panel for single-screen generation (replica)
    MultiScreenProgress.tsx  Progress overlay for multi-screen app generation
    IterationChat.tsx     Per-screen iteration chat UI (inside WorkspacePanel)
    WireframeCanvas.tsx   Simple canvas (unused — SketchPad is used instead)
  preview/
    ScreenPreview.tsx     Iframe sandbox for rendering generated HTML
    PlayModeRunner.tsx    Full-screen clickable prototype mode
  store/
    project.ts            Projects + screens state
    generation.ts         Generation state (streaming, app plan, progress)
    canvas.ts             Canvas nodes + edges
    settings.ts           Model selection, theme, API keys
    log.ts                Activity log entries
  lib/
    api.ts                REST API client
    stream.ts             WebSocket streaming protocol (must stay in sync with backend)

backend/src/
  routers/
    generate_app.py       Multi-screen app generation endpoint (WebSocket)
    generate.py           Single-screen generation endpoint (WebSocket)
    projects.py           Project CRUD
    screens.py            Screen CRUD
    skills.py             Skills list + toggle
    design_systems.py     Design system list + DESIGN.md content serving
  prompts/
    planner.py            Planner LLM prompt (outputs DESIGN.md + tailwind_config + screen plan)
    html_tailwind.py      Per-screen HTML generation prompt
  db/
    schema.sql            SQLite schema
    seed.py               DB seeding (skills, API keys, migrations)
  skills/                 One YAML file per skill
```

---

## Critical Non-Obvious Behaviors

These are the things most likely to trip up an agent that hasn't read the source:

### Generation

- **Max 6 screens per app generation** (`_MAX_SCREENS = 6` in `generate_app.py`). Plans requesting more are silently capped.
- **Max image size: 5 MB** for screenshot/sketch input. Larger images are rejected.
- **DESIGN.md truncation**: truncated to **6000 chars** when injected into per-screen prompts. Truncated to **8000 chars** when used as a reference design for adaptation. The full doc is stored in DB; both are read-path truncations only.
- **Surgical edit mode**: when `edit_mode=True` and `current_code` is provided, the backend asks the LLM for `SEARCH/REPLACE` diff blocks instead of full regeneration. If no valid blocks are found it falls back to full regen. Diff apply tries exact match first, then whitespace-normalized line match. This is separate from regular iteration.
- **Iteration context max 10 items**: `iteration_context` array is capped at 10 previous prompt/code pairs. Older entries are dropped silently.
- **Skill parameter substitution**: `{{param_key}}` placeholders in skill `instructions` are replaced with values from `param_values` before injection. No template engine — plain string replace.
- **Skills selected once per generation** in the backend (`select_skills()`), not per-screen. The same skill set applies to all screens in the run. The `skills_applied` frame tells the frontend which skills were used.
- **Plan parsing is robust**: the planner output goes through `strip_markdown_fence()`, `<think>` block stripping, then tries to parse as `{app_name, screens, ...}` object first and falls back to a legacy `[...]` array format. Plans over 6 screens are silently capped.
- **Partial screen failure**: if one screen fails during multi-screen generation, a `screen_failed` frame is sent but generation continues. The project ends up with N-1 screens and no error is surfaced to the user beyond the activity log.
- **Nav/footer shell reuse**: after the first screen is generated, its `<nav>` and `<footer>` HTML are extracted and injected verbatim into the prompts for all subsequent screens. This enforces visual consistency across screens automatically — do not remove this logic.
- **Reference image in multi-screen**: if a reference image was attached, it is passed to every screen generation with a prepended extraction instruction, not just the first screen.
- **Design head injection**: `generate_app.py` injects the Tailwind config + Google Fonts `<head>` block using three fallback strategies: (1) replace existing `<head>` content, (2) inject after `<html>` tag, (3) prepend the full structure. Only `material-symbols` is recognized as an existing icon library — others trigger a new CDN link.
- **DESIGN.md preview sent to frontend**: only the first **300 chars** of the generated DESIGN.md are sent in the `design_done` frame for the activity log preview. This is not a truncation of what's stored.

### Canvas & Persistence

- **Canvas is NOT auto-saved**. `updateProjectCanvas()` must be called explicitly after mutations. Closing the browser without triggering a save loses canvas state. The snapshot is loaded on project switch via `loadFromSnapshot()`.
- **Canvas snapshot format**: serialized React Flow state — `{nodes: [...], edges: [...]}` stored as JSON string in `projects.canvas_snapshot_json`.
- **Canvas overrides are in-memory only**: design mode allows per-element style and text overrides (`screenOverrides`, `screenTextOverrides` in `canvas.ts`). These are stored in Zustand only — they are cleared on project switch and never persisted to the DB.
- **Project auto-naming**: new projects are created with the placeholder name "New Project". A fire-and-forget call to `projectsApi.suggestName(prompt, model)` renames it in the background. If the LLM call fails, it falls back to the first two words of the prompt. No error is shown.
- **Undo history max 50 snapshots** (`MAX_HISTORY = 50` in `canvas.ts`).

### API Keys

- **DB always wins over `.env`**: `seed_api_keys()` only inserts if the DB row is currently empty. Keys set via the Settings UI are never overwritten by environment variables on restart.
- **API key masking**: keys returned from the settings API are masked as `XXXX****XXXX`. This is applied in the response only — keys are stored unmasked in the DB.

### Sandbox & Preview

- **SHADCN_COMPAT shim**: `sandbox-utils.ts` injects stub implementations of 20+ component names into every iframe — `Button`, `Card`, `Badge`, `Input`, `Label`, `Textarea`, `Avatar`, `Separator`, `Table`, `Tabs`, `Select`, `Dialog`, and more. This prevents "X is not defined" errors when the LLM generates code using component names without imports. Do not remove or weaken this layer.
- **NAV_SHIM**: also injected into every iframe. Intercepts clicks and posts `{type: 'navigate', selector, ...}` messages to the parent. In-page anchor links (`<a href="#section">`) are allowed through and scroll normally — everything else is intercepted.
- **Thumbnail capture**: `captureScreenshot()` is called on the ScreenNode iframe ref after generation completes. Result is stored as `thumbnail_data_url` (JPEG data URL) in both the canvas node and the DB.
- **WebSocket URL**: if `VITE_WS_BACKEND_URL` is not set, the frontend derives the WebSocket URL from `window.location`, choosing `ws:` or `wss:` to match the page protocol. In the Docker setup, Nginx proxies WebSocket connections so both work.

### Streaming Protocol

The WebSocket streaming protocol (`lib/stream.ts`) uses typed frames. Full list:

| Frame | Direction | Meaning |
|---|---|---|
| `design_start` | server→client | DESIGN.md generation starting |
| `design_token` | server→client | DESIGN.md token chunk |
| `design_done` | server→client | DESIGN.md complete (includes 300-char preview) |
| `planning` | server→client | plan generation starting |
| `plan_token` | server→client | plan token chunk |
| `plan` | server→client | parsed plan ready (array of screen names) |
| `screen_start` | server→client | individual screen generation starting |
| `token` | server→client | screen HTML token chunk |
| `screen_done` | server→client | screen complete (includes full HTML) |
| `screen_failed` | server→client | screen failed, generation continues |
| `skills_applied` | server→client | which skills were used |
| `all_done` | server→client | all screens complete |

Frontend and backend must stay in sync on this protocol — changing frame names or shapes requires updates on both sides.

### Token Counting

- **Frontend `tokenCount` ≠ LLM tokens**. The frontend counts streaming frames (chunks), not actual model tokens. Real token usage is in `DoneFrame.completion_tokens` from the model adapter. These numbers differ significantly.

### Play Mode

- **Flow resolver selector syntax** (`lib/flow-resolver.ts`): matches `#id`, `.class`, `tag.class`, `:contains("text")`, `:nth-of-type(n)` (including full An+B notation), `[attr="val"]`, and combinations. Used to wire navigation between screens. Do not simplify this logic — the variety of selector forms is intentional to handle LLM-generated HTML variation.

### WorkspacePanel

- **File ID convention**: `'design'` → DESIGN.md stream, `'plan'` → plan.json stream, `'screen:{name}'` → screen code. These string keys are used throughout WorkspacePanel to route editor state.
- **IterationChat** (`generation/IterationChat.tsx`): per-screen multi-turn chat. Builds `iteration_context` array over multiple turns. "Apply" sends generation with `edit_mode: true`. Context is preserved per screen session but not persisted to DB.

### Unfinished / Unused

- **`screen_versions` table** exists in `schema.sql` but no router endpoint reads or writes to it. Screen versioning is unimplemented.
- **`transition` field on flow edges** (default `'slide'`) exists in the schema and frontend edge model but is never used. Animated transitions between screens in Play Mode are not implemented.

---

## Recommended Use Cases

### Good

- Adding or improving UI panels and canvas interactions
- Improving LLM prompt templates in `backend/src/prompts/`
- Adding new skills - drop a `.yaml` file in `backend/src/skills/` (see Skills section below)
- Adding support for new model providers in `backend/src/routers/`
- Fixing canvas layout or edge-wiring bugs
- Improving the sandbox rendering in `preview/sandbox-utils.ts`
- Writing or improving backend tests in `backend/tests/`
- Refactoring Zustand stores for clarity

### Use with Caution

- **Sandbox security model** (`sandbox-utils.ts`) - the iframe sandbox is carefully scoped; changes can break isolation
- **Streaming protocol** (`lib/stream.ts`) - frontend and backend must stay in sync
- **API shape changes** - the frontend depends on backend response shapes; breaking changes need both sides updated together
- **Skills** - editing an existing skill YAML changes it for all new deployments; existing rows in the DB are not overwritten (INSERT OR IGNORE on `id`)

---

## API Keys

Cloud API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`) can be set in `.env`. On startup, `seed_api_keys()` in `backend/src/db/seed.py` writes any non-empty env key into the `settings` table **only if that row is currently empty** — so the DB value always wins. This means keys set via the Settings UI are never silently overwritten by a deploy.

---

## Adding Skills

Skills are prompt fragments injected into the LLM when a user activates them. Each skill is a YAML file in `backend/src/skills/`. The backend loads them at startup with `INSERT OR IGNORE`, so:

- New files are picked up after `docker compose up -d backend` (no rebuild needed).
- On conflict, seed updates `name`, `description`, `instructions`, `examples`, `category`, `sort_order` — so prompt changes in YAML take effect on restart.
- `is_active` and `param_values` are **never overwritten** — user toggles and edits are safe.
- The `id` field is the stable key. It must be unique across all files.

### YAML format

```yaml
id: skill-my-skill          # stable, unique, kebab-case, prefixed with "skill-"
name: "My Skill"            # display name shown in the UI
description: "One-liner shown in the skills list"
category: style             # one of: style, components, brand, constraints, general
scope: global               # global (all projects) or project (per-project only)
is_active: false            # false = off by default; user can toggle on
sort_order: 10              # controls display order; lower = higher in list
instructions: |
  The full prompt fragment injected into every generation when this skill is active.
  Be specific and directive. Write it as instructions to the LLM, not as description.
  Multi-line YAML block - indent consistently.
examples: |
  A short code example showing the expected output style.
  Used as a reference in the UI (not injected into prompts).
parameters: []              # [] for no parameters, or a JSON array of param objects
param_values: {}            # {} for no defaults, or a JSON object of key: value pairs
```

### Parameterized skills

Parameters let users customize a skill without editing it directly. Use `{{param_key}}` placeholders in `instructions`:

```yaml
parameters: '[{"key":"primary_color","label":"Primary Color","type":"color","default_value":"#6366f1"}]'
param_values: '{"primary_color":"#6366f1"}'
instructions: |
  Use {{primary_color}} as the primary brand color throughout.
```

Parameter types: `text`, `color`.

### Rules

- `id` must be unique. Use the filename as a guide: `skill-<filename-without-extension>`.
- `instructions` is what matters most - write it as precise LLM directives.
- Keep `examples` short; it is shown in the UI tooltip, not sent to the model.
- Set `is_active: false` for optional style/pattern skills so users opt in. Set `is_active: true` for foundational constraints (e.g. responsive, cross-screen-consistency) that should apply to every generation.
- Do not duplicate an existing skill ID - the new file will be silently ignored.

---

## Essential Guidelines

### 1. Theming - always use CSS variables

Never hardcode colors. The app supports light and dark themes via CSS variables.

```ts
// ❌ Wrong
style={{ background: '#1f2937', color: '#f9fafb' }}

// ✅ Correct
style={{ background: 'var(--bg-surface)', color: 'var(--text)' }}
```

Key variables: `--bg-app`, `--bg-surface`, `--bg-subtle`, `--border`, `--border-strong`, `--text`, `--text-secondary`, `--text-muted`, `--primary`

### 2. TypeScript - no `any` escapes

```ts
// ❌ Wrong
const data = response as any

// ✅ Correct - type it properly or use unknown with a guard
```

### 3. State - use Zustand stores, not prop drilling

Access stores with selectors. Avoid passing deeply nested props.

```ts
const screens = useProjectStore((s) => s.screens)
```

### 4. Clean up AI-generated noise

Remove before committing:
- Verbose comments explaining obvious code
- Placeholder or boilerplate comments
- Redundant docstrings on simple functions
- `console.log` debug statements

Keep:
- Comments explaining non-obvious logic
- JSDoc on public-facing utilities

### 5. Docker rebuild required for frontend changes

The frontend runs in Docker with a production build - there is no hot reload in the deployed setup.

```bash
docker compose build frontend && docker compose up -d frontend
```

Always type-check before building:
```bash
cd frontend && npx tsc --noEmit
```

---

## Development Workflow

### 1. Understand first
- Read the relevant store and component before changing it
- Trace how data flows: backend route → Zustand store → component

### 2. Implement
- Keep changes focused - one concern per PR
- Follow existing patterns in the file you're editing

### 3. Quality checks

```bash
# Type check
cd frontend && npx tsc --noEmit
cd backend && uv run mypy src

# Lint
cd frontend && pnpm eslint src --ext ts,tsx
cd backend && uv run ruff check src

# Backend tests
cd backend && uv run pytest

# Or all at once
make typecheck
make lint
```

### 4. Rebuild and verify

```bash
docker compose build frontend && docker compose up -d frontend
# Open http://localhost:3000 and manually verify the change
```

---

## Anti-Patterns to Avoid

❌ **Don't** hardcode hex colors - use CSS variables
✅ **Do** use `var(--bg-surface)`, `var(--text)`, etc.

❌ **Don't** use `as any` to silence TypeScript
✅ **Do** model the type correctly

❌ **Don't** add `useEffect` where derived state or event handlers suffice
✅ **Do** keep components simple

❌ **Don't** change both frontend and backend shapes in separate PRs
✅ **Do** keep API contract changes atomic

❌ **Don't** leave AI-generated boilerplate comments in submitted code
✅ **Do** clean up before opening a PR

❌ **Don't** over-engineer - don't add abstractions for one-off operations
✅ **Do** keep solutions as simple as the problem requires

---

## Example: Adding a New Feature

```bash
# 1. Read the relevant files first
# e.g. for a new panel: read the existing panel + its store

# 2. Implement the change

# 3. Type check
cd frontend && npx tsc --noEmit

# 4. Lint
cd frontend && pnpm eslint src --ext ts,tsx

# 5. Rebuild
docker compose build frontend && docker compose up -d frontend

# 6. Manually verify in the browser

# 7. Commit with a clear message
git commit -m "feat: add X panel with Y capability"
```

---

## Quality Checklist

Before opening a PR:

- [ ] TypeScript passes (`npx tsc --noEmit`)
- [ ] ESLint passes
- [ ] Backend mypy + ruff pass (if backend was changed)
- [ ] Backend tests pass (`uv run pytest`)
- [ ] CSS variables used - no hardcoded colors
- [ ] AI-generated noise removed
- [ ] Docker rebuild tested locally
- [ ] Change is focused on a single scope
- [ ] No `console.log` or debug artifacts left

---

## Getting Help

- `README.md` - setup and quick start
- `CONTRIBUTING.md` - contribution requirements
- GitHub Issues - bug reports and feature requests
