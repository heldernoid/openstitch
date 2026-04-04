"""Screen and ScreenVersion repository."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import aiosqlite
import structlog

from ..models import Screen, ScreenVersion

logger: structlog.BoundLogger = structlog.get_logger()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_screen(row: aiosqlite.Row) -> Screen:
    return Screen(
        id=str(row["id"]),
        project_id=str(row["project_id"]),
        name=str(row["name"]),
        framework=str(row["framework"]),
        code=str(row["code"]),
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
        thumbnail_data_url=(
            str(row["thumbnail_data_url"]) if row["thumbnail_data_url"] is not None else None
        ),
    )


def _row_to_version(row: aiosqlite.Row) -> ScreenVersion:
    return ScreenVersion(
        id=str(row["id"]),
        screen_id=str(row["screen_id"]),
        code=str(row["code"]),
        prompt=str(row["prompt"]),
        model=str(row["model"]),
        created_at=str(row["created_at"]),
    )


class ScreenRepository:
    def __init__(self, conn: aiosqlite.Connection) -> None:
        self._conn = conn

    async def create(
        self,
        project_id: str,
        name: str,
        framework: str,
        code: str,
        prompt: str = "",
        model: str = "",
    ) -> Screen:
        now = _now()
        screen_id = str(uuid4())
        await self._conn.execute(
            """
            INSERT INTO screens (id, project_id, name, framework, code, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (screen_id, project_id, name, framework, code, now, now),
        )
        if prompt:
            version_id = str(uuid4())
            await self._conn.execute(
                """
                INSERT INTO screen_versions (id, screen_id, code, prompt, model, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (version_id, screen_id, code, prompt, model, now),
            )
        await self._conn.commit()
        return Screen(
            id=screen_id,
            project_id=project_id,
            name=name,
            framework=framework,
            code=code,
            created_at=now,
            updated_at=now,
            thumbnail_data_url=None,
        )

    async def list_by_project(self, project_id: str) -> list[Screen]:
        cursor = await self._conn.execute(
            "SELECT * FROM screens WHERE project_id = ? ORDER BY created_at ASC",
            (project_id,),
        )
        rows = await cursor.fetchall()
        return [_row_to_screen(r) for r in rows]

    async def get(self, id: str) -> Screen | None:
        cursor = await self._conn.execute(
            "SELECT * FROM screens WHERE id = ?", (id,)
        )
        row = await cursor.fetchone()
        return _row_to_screen(row) if row is not None else None

    async def update_code(
        self, id: str, code: str, prompt: str, model: str
    ) -> Screen:
        existing = await self.get(id)
        if existing is None:
            raise ValueError(f"Screen {id!r} not found")
        now = _now()
        version_id = str(uuid4())
        await self._conn.execute(
            """
            INSERT INTO screen_versions (id, screen_id, code, prompt, model, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (version_id, id, code, prompt, model, now),
        )
        await self._conn.execute(
            "UPDATE screens SET code = ?, updated_at = ? WHERE id = ?",
            (code, now, id),
        )
        await self._conn.commit()
        return Screen(
            id=existing.id,
            project_id=existing.project_id,
            name=existing.name,
            framework=existing.framework,
            code=code,
            created_at=existing.created_at,
            updated_at=now,
            thumbnail_data_url=existing.thumbnail_data_url,
        )

    async def update_name(self, id: str, name: str) -> Screen:
        now = _now()
        await self._conn.execute(
            "UPDATE screens SET name = ?, updated_at = ? WHERE id = ?",
            (name, now, id),
        )
        await self._conn.commit()
        screen = await self.get(id)
        if screen is None:
            raise ValueError(f"Screen {id!r} not found")
        return screen

    async def update_thumbnail(self, id: str, data_url: str) -> None:
        await self._conn.execute(
            "UPDATE screens SET thumbnail_data_url = ? WHERE id = ?",
            (data_url, id),
        )
        await self._conn.commit()

    async def delete(self, id: str) -> None:
        await self._conn.execute("DELETE FROM screens WHERE id = ?", (id,))
        await self._conn.commit()

    async def get_versions(self, id: str) -> list[ScreenVersion]:
        cursor = await self._conn.execute(
            "SELECT * FROM screen_versions WHERE screen_id = ? ORDER BY created_at ASC",
            (id,),
        )
        rows = await cursor.fetchall()
        return [_row_to_version(r) for r in rows]

    async def count(self, project_id: str) -> int:
        cursor = await self._conn.execute(
            "SELECT COUNT(*) FROM screens WHERE project_id = ?", (project_id,)
        )
        row = await cursor.fetchone()
        return int(row[0]) if row is not None else 0
