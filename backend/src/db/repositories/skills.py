"""Skills repository."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from uuid import uuid4

import aiosqlite

from ..models import Skill


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_skill(row: aiosqlite.Row) -> Skill:
    return Skill(
        id=str(row["id"]),
        name=str(row["name"]),
        description=str(row["description"]),
        instructions=str(row["instructions"]),
        examples=str(row["examples"]),
        parameters=str(row["parameters"]),
        param_values=str(row["param_values"]),
        category=str(row["category"]),
        scope=str(row["scope"]),
        project_id=str(row["project_id"]) if row["project_id"] is not None else None,
        is_active=bool(row["is_active"]),
        sort_order=int(row["sort_order"]),
        created_at=str(row["created_at"]),
    )


def _resolve_body(skill: Skill) -> str:
    """Return the full injected text for a skill, with parameters substituted."""
    params: list[dict] = []
    values: dict = {}
    try:
        params = json.loads(skill.parameters) if skill.parameters else []
        values = json.loads(skill.param_values) if skill.param_values else {}
    except Exception:
        pass

    text = skill.instructions
    if skill.examples:
        text = f"{text}\n\nExamples:\n{skill.examples}"

    for param in params:
        key = param.get("key", "")
        value = values.get(key) or param.get("default_value", "")
        text = text.replace(f"{{{{{key}}}}}", str(value))

    return text


class SkillsRepository:
    def __init__(self, conn: aiosqlite.Connection) -> None:
        self._conn = conn

    async def list_global(self) -> list[Skill]:
        cursor = await self._conn.execute(
            "SELECT * FROM skills WHERE scope = 'global' ORDER BY sort_order ASC, created_at ASC"
        )
        rows = await cursor.fetchall()
        return [_row_to_skill(r) for r in rows]

    async def list_all_for_project(self, project_id: str) -> list[Skill]:
        """Global skills + project-scoped skills for the given project."""
        cursor = await self._conn.execute(
            """
            SELECT * FROM skills
            WHERE scope = 'global' OR (scope = 'project' AND project_id = ?)
            ORDER BY sort_order ASC, created_at ASC
            """,
            (project_id,),
        )
        rows = await cursor.fetchall()
        return [_row_to_skill(r) for r in rows]

    async def list_active(self, project_id: str, skip_ids: list[str] | None = None) -> list[Skill]:
        """Active global + project-scoped skills, optionally excluding skip_ids."""
        cursor = await self._conn.execute(
            """
            SELECT * FROM skills
            WHERE is_active = 1
              AND (scope = 'global' OR (scope = 'project' AND project_id = ?))
            ORDER BY sort_order ASC, created_at ASC
            """,
            (project_id,),
        )
        rows = await cursor.fetchall()
        skills = [_row_to_skill(r) for r in rows]
        if skip_ids:
            skip_set = set(skip_ids)
            skills = [s for s in skills if s.id not in skip_set]
        return skills

    def get_resolved_bodies(self, skills: list[Skill]) -> list[str]:
        """Return parameter-substituted full bodies for injection."""
        return [_resolve_body(s) for s in skills if s.instructions.strip()]

    async def get(self, id: str) -> Skill | None:
        cursor = await self._conn.execute("SELECT * FROM skills WHERE id = ?", (id,))
        row = await cursor.fetchone()
        return _row_to_skill(row) if row is not None else None

    async def create(
        self,
        name: str,
        instructions: str = "",
        examples: str = "",
        parameters: str = "[]",
        param_values: str = "{}",
        description: str = "",
        category: str = "general",
        scope: str = "global",
        project_id: str | None = None,
        is_active: bool = True,
        sort_order: int = 0,
    ) -> Skill:
        skill_id = str(uuid4())
        now = _now()
        await self._conn.execute(
            """
            INSERT INTO skills
              (id, name, description, body, instructions, examples, parameters, param_values,
               category, scope, project_id, is_active, sort_order, created_at)
            VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (skill_id, name, description, instructions, examples, parameters, param_values,
             category, scope, project_id, int(is_active), sort_order, now),
        )
        await self._conn.commit()
        return Skill(
            id=skill_id, name=name, description=description,
            instructions=instructions, examples=examples,
            parameters=parameters, param_values=param_values,
            category=category, scope=scope, project_id=project_id,
            is_active=is_active, sort_order=sort_order, created_at=now,
        )

    async def update(self, id: str, patch: dict) -> Skill | None:
        skill = await self.get(id)
        if skill is None:
            return None
        allowed = {"name", "description", "instructions", "examples", "parameters",
                   "param_values", "category", "is_active", "sort_order"}
        fields: list[str] = []
        values: list[object] = []
        for key, val in patch.items():
            if key in allowed and val is not None:
                fields.append(f"{key} = ?")
                values.append(int(val) if key == "is_active" else val)
        if not fields:
            return skill
        values.append(id)
        await self._conn.execute(
            f"UPDATE skills SET {', '.join(fields)} WHERE id = ?",  # noqa: S608
            values,
        )
        await self._conn.commit()
        return await self.get(id)

    async def delete(self, id: str) -> None:
        await self._conn.execute("DELETE FROM skills WHERE id = ?", (id,))
        await self._conn.commit()
