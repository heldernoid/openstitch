"""Project repository."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import aiosqlite
import structlog

from ..models import Project

logger: structlog.BoundLogger = structlog.get_logger()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_project(row: aiosqlite.Row) -> Project:
    return Project(
        id=str(row["id"]),
        name=str(row["name"]),
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
        canvas_snapshot_json=(
            str(row["canvas_snapshot_json"])
            if row["canvas_snapshot_json"] is not None
            else None
        ),
    )


class ProjectRepository:
    def __init__(self, conn: aiosqlite.Connection) -> None:
        self._conn = conn

    async def create(self, name: str) -> Project:
        project_id = str(uuid4())
        now = _now()
        await self._conn.execute(
            """
            INSERT INTO projects (id, name, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            (project_id, name, now, now),
        )
        await self._conn.commit()
        return Project(
            id=project_id,
            name=name,
            created_at=now,
            updated_at=now,
            canvas_snapshot_json=None,
        )

    async def list_all(self) -> list[Project]:
        cursor = await self._conn.execute(
            "SELECT * FROM projects ORDER BY created_at DESC"
        )
        rows = await cursor.fetchall()
        return [_row_to_project(r) for r in rows]

    async def get(self, id: str) -> Project | None:
        cursor = await self._conn.execute(
            "SELECT * FROM projects WHERE id = ?", (id,)
        )
        row = await cursor.fetchone()
        return _row_to_project(row) if row is not None else None

    async def update(self, id: str, name: str) -> Project:
        now = _now()
        await self._conn.execute(
            "UPDATE projects SET name = ?, updated_at = ? WHERE id = ?",
            (name, now, id),
        )
        await self._conn.commit()
        project = await self.get(id)
        if project is None:
            raise ValueError(f"Project {id!r} not found")
        return project

    async def delete(self, id: str) -> None:
        await self._conn.execute("DELETE FROM projects WHERE id = ?", (id,))
        await self._conn.commit()

    async def delete_all(self) -> int:
        cursor = await self._conn.execute("DELETE FROM projects")
        await self._conn.commit()
        return cursor.rowcount or 0

    async def save_canvas(self, id: str, snapshot_json: str) -> None:
        now = _now()
        await self._conn.execute(
            "UPDATE projects SET canvas_snapshot_json = ?, updated_at = ? WHERE id = ?",
            (snapshot_json, now, id),
        )
        await self._conn.commit()

    async def get_flow_edges(self, id: str) -> list[dict[str, str]]:
        cursor = await self._conn.execute(
            "SELECT * FROM flow_edges WHERE project_id = ?", (id,)
        )
        rows = await cursor.fetchall()
        return [
            {
                "id": str(r["id"]),
                "project_id": str(r["project_id"]),
                "source_screen_id": str(r["source_screen_id"]),
                "target_screen_id": str(r["target_screen_id"]),
                "trigger_selector": str(r["trigger_selector"]),
                "label": str(r["label"]),
                "transition": str(r["transition"]),
            }
            for r in rows
        ]

    async def create_flow_edge(
        self,
        project_id: str,
        source_screen_id: str,
        target_screen_id: str,
        trigger_selector: str,
        label: str = "",
        transition: str = "slide",
    ) -> str:
        edge_id = str(uuid4())
        await self._conn.execute(
            """
            INSERT INTO flow_edges
                (id, project_id, source_screen_id, target_screen_id,
                 trigger_selector, label, transition)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                edge_id,
                project_id,
                source_screen_id,
                target_screen_id,
                trigger_selector,
                label,
                transition,
            ),
        )
        await self._conn.commit()
        return edge_id

    async def delete_flow_edge(self, edge_id: str) -> None:
        await self._conn.execute("DELETE FROM flow_edges WHERE id = ?", (edge_id,))
        await self._conn.commit()

    async def update_design_md(self, project_id: str, design_md: str) -> None:
        await self._conn.execute(
            "UPDATE projects SET design_md = ?, updated_at = ? WHERE id = ?",
            (design_md, _now(), project_id),
        )
        await self._conn.commit()

    async def get_design_md(self, project_id: str) -> str | None:
        async with self._conn.execute(
            "SELECT design_md FROM projects WHERE id = ?", (project_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if row and row["design_md"]:
                return str(row["design_md"])
            return None
