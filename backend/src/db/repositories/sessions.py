"""Session repository."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import aiosqlite
import structlog

from ..models import Session

logger: structlog.BoundLogger = structlog.get_logger()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_session(row: aiosqlite.Row) -> Session:
    return Session(
        id=str(row["id"]),
        project_id=str(row["project_id"]),
        screen_id=str(row["screen_id"]) if row["screen_id"] is not None else None,
        prompt=str(row["prompt"]),
        model=str(row["model"]),
        framework=str(row["framework"]),
        prompt_tokens=int(row["prompt_tokens"]),
        completion_tokens=int(row["completion_tokens"]),
        created_at=str(row["created_at"]),
    )


class SessionRepository:
    def __init__(self, conn: aiosqlite.Connection) -> None:
        self._conn = conn

    async def create(
        self,
        project_id: str,
        screen_id: str | None,
        prompt: str,
        model: str,
        framework: str,
        prompt_tokens: int,
        completion_tokens: int,
    ) -> str:
        session_id = str(uuid4())
        now = _now()
        await self._conn.execute(
            """
            INSERT INTO sessions (
                id, project_id, screen_id, prompt, model, framework,
                prompt_tokens, completion_tokens, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                project_id,
                screen_id,
                prompt,
                model,
                framework,
                prompt_tokens,
                completion_tokens,
                now,
            ),
        )
        await self._conn.commit()
        return session_id

    async def list_by_project(self, project_id: str) -> list[Session]:
        cursor = await self._conn.execute(
            "SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC",
            (project_id,),
        )
        rows = await cursor.fetchall()
        return [_row_to_session(r) for r in rows]
