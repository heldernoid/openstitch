"""Seed skills from backend/src/skills/*.yaml on startup.

Uses INSERT OR IGNORE so:
- Fresh DB: all YAML skills are inserted.
- Existing DB: new YAML files get picked up; existing rows (including user edits) are left untouched.
"""
from __future__ import annotations

import json
from pathlib import Path

import aiosqlite
import structlog
import yaml

from ..config import config

logger: structlog.BoundLogger = structlog.get_logger()

_SKILLS_DIR = Path(__file__).parent.parent / "skills"

_ENV_KEY_MAP = {
    "openai_api_key": config.openai_api_key,
    "anthropic_api_key": config.anthropic_api_key,
    "gemini_api_key": config.gemini_api_key,
    "openrouter_api_key": config.openrouter_api_key,
}


async def seed_api_keys(conn: aiosqlite.Connection) -> None:
    """Seed API keys from environment into DB if not already present."""
    for key, value in _ENV_KEY_MAP.items():
        if not value:
            continue
        async with conn.execute("SELECT value FROM settings WHERE key = ?", (key,)) as cur:
            row = await cur.fetchone()
        if not row or not row[0]:
            await conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?)"
                " ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE excluded.value != ''",
                (key, value),
            )
            logger.info("seed.api_key_seeded", key=key)
    await conn.commit()


async def migrate_skills_table(conn: aiosqlite.Connection) -> None:
    """Add columns that were introduced after the initial schema."""
    async with conn.execute("PRAGMA table_info(skills)") as cur:
        columns = {row[1] async for row in cur}
    if "body" not in columns:
        await conn.execute("ALTER TABLE skills ADD COLUMN body TEXT NOT NULL DEFAULT ''")
        await conn.commit()
        logger.info("seed.skills_migrated", added="body")


async def seed_skills(conn: aiosqlite.Connection) -> None:
    await migrate_skills_table(conn)
    if not _SKILLS_DIR.exists():
        logger.warning("seed.skills_dir_not_found", path=str(_SKILLS_DIR))
        return

    skill_files = sorted(_SKILLS_DIR.glob("*.yaml"))

    # Collect valid IDs from current YAML files
    valid_ids: set[str] = set()
    for path in skill_files:
        try:
            s = yaml.safe_load(path.read_text())
            sid = s.get("id") if s else None
            if sid:
                valid_ids.add(sid)
        except Exception:
            pass

    # Remove global skills whose YAML files were deleted
    if valid_ids:
        placeholders = ",".join("?" * len(valid_ids))
        deleted = await conn.execute(
            f"DELETE FROM skills WHERE project_id IS NULL AND id NOT IN ({placeholders})",
            list(valid_ids),
        )
        if deleted.rowcount:
            logger.info("seed.skills_removed_stale", count=deleted.rowcount)
    else:
        # No YAML files at all — remove all global skills
        await conn.execute("DELETE FROM skills WHERE project_id IS NULL")

    if not skill_files:
        await conn.commit()
        return

    inserted = 0
    for path in skill_files:
        try:
            s = yaml.safe_load(path.read_text())
        except Exception as exc:
            logger.warning("seed.skill_parse_error", file=path.name, error=str(exc))
            continue

        sid = s.get("id")
        if not sid:
            logger.warning("seed.skill_missing_id", file=path.name)
            continue

        params = s.get("parameters", [])
        pvals = s.get("param_values", {})

        cursor = await conn.execute(
            """
            INSERT INTO skills
              (id, name, description, body, instructions, examples, parameters, param_values,
               category, scope, project_id, is_active, sort_order, created_at)
            VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, NULL, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
              name         = excluded.name,
              description  = excluded.description,
              instructions = excluded.instructions,
              examples     = excluded.examples,
              parameters   = excluded.parameters,
              category     = excluded.category,
              sort_order   = excluded.sort_order
            """,
            (
                sid,
                s.get("name", ""),
                s.get("description", ""),
                s.get("instructions", ""),
                s.get("examples", ""),
                json.dumps(params) if not isinstance(params, str) else params,
                json.dumps(pvals) if not isinstance(pvals, str) else pvals,
                s.get("category", "general"),
                s.get("scope", "global"),
                int(s.get("is_active", True)),
                int(s.get("sort_order", 0)),
            ),
        )
        if cursor.rowcount:
            inserted += 1

    await conn.commit()
    if inserted:
        logger.info("seed.skills_inserted", count=inserted)
