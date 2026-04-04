-- OpenStitch - single-file schema (authoritative, run once on a fresh database)

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    canvas_snapshot_json TEXT,
    design_md TEXT
);

CREATE TABLE IF NOT EXISTS screens (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    framework TEXT NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    thumbnail_data_url TEXT
);

CREATE TABLE IF NOT EXISTS screen_versions (
    id TEXT PRIMARY KEY,
    screen_id TEXT NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    prompt TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    screen_id TEXT REFERENCES screens(id) ON DELETE SET NULL,
    prompt TEXT NOT NULL,
    model TEXT NOT NULL,
    framework TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS flow_edges (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_screen_id TEXT NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
    target_screen_id TEXT NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
    trigger_selector TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    transition TEXT NOT NULL DEFAULT 'slide'
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skills (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    body         TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    examples     TEXT NOT NULL DEFAULT '',
    parameters   TEXT NOT NULL DEFAULT '[]',
    param_values TEXT NOT NULL DEFAULT '{}',
    category     TEXT NOT NULL DEFAULT 'general',
    scope        TEXT NOT NULL DEFAULT 'global',
    project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
    is_active    INTEGER NOT NULL DEFAULT 1,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

