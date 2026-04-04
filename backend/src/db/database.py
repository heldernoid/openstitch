from __future__ import annotations

from pathlib import Path

import aiosqlite
import structlog

logger: structlog.BoundLogger = structlog.get_logger()

_SCHEMA_FILE = Path(__file__).parent / "schema.sql"


def _split_sql_statements(sql: str) -> list[str]:
    """Split SQL text into individual statements on ';', respecting string literals."""
    statements: list[str] = []
    buf: list[str] = []
    i = 0
    n = len(sql)
    while i < n:
        c = sql[i]
        if c == "-" and i + 1 < n and sql[i + 1] == "-":
            while i < n and sql[i] != "\n":
                buf.append(sql[i])
                i += 1
            continue
        if c == "'":
            buf.append(c)
            i += 1
            while i < n:
                ch = sql[i]
                buf.append(ch)
                i += 1
                if ch == "'":
                    if i < n and sql[i] == "'":
                        buf.append(sql[i])
                        i += 1
                    else:
                        break
            continue
        if c == ";":
            stmt = "".join(buf).strip()
            if stmt:
                statements.append(stmt)
            buf = []
            i += 1
            continue
        buf.append(c)
        i += 1
    stmt = "".join(buf).strip()
    if stmt:
        statements.append(stmt)
    return statements


class Database:
    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        self._conn: aiosqlite.Connection | None = None

    async def initialize(self) -> None:
        path = Path(self._db_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = await aiosqlite.connect(str(path))
        self._conn.row_factory = aiosqlite.Row
        await self._conn.execute("PRAGMA foreign_keys = ON")
        await self._apply_schema()
        logger.info("database.initialized", path=str(path))

    async def _apply_schema(self) -> None:
        conn = self._conn
        assert conn is not None
        sql = _SCHEMA_FILE.read_text()
        for stmt in _split_sql_statements(sql):
            await conn.execute(stmt)
        await conn.commit()
        # Safe column migrations for existing databases
        for migration in [
            "ALTER TABLE projects ADD COLUMN design_md TEXT",
        ]:
            try:
                await conn.execute(migration)
                await conn.commit()
            except Exception:
                pass  # column already exists
        logger.info("database.schema_applied", file=_SCHEMA_FILE.name)

    async def close(self) -> None:
        if self._conn is not None:
            await self._conn.close()
            self._conn = None

    @property
    def conn(self) -> aiosqlite.Connection:
        if self._conn is None:
            raise RuntimeError("Database not initialized. Call initialize() first.")
        return self._conn
