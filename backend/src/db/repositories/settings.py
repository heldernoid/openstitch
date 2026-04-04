from __future__ import annotations

import aiosqlite


class SettingsRepository:
    def __init__(self, conn: aiosqlite.Connection) -> None:
        self.conn = conn

    async def get(self, key: str) -> str | None:
        async with self.conn.execute(
            "SELECT value FROM settings WHERE key = ?", (key,)
        ) as cur:
            row = await cur.fetchone()
            return str(row[0]) if row else None

    async def set(self, key: str, value: str) -> None:
        await self.conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?)"
            " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
        await self.conn.commit()

    async def get_all(self) -> dict[str, str]:
        async with self.conn.execute("SELECT key, value FROM settings") as cur:
            rows = await cur.fetchall()
            return {str(row[0]): str(row[1]) for row in rows}

    async def get_api_keys(self) -> dict[str, str]:
        """Return only non-empty API key settings (for injection into model adapters)."""
        all_settings = await self.get_all()
        key_names = {
            "openai_api_key",
            "anthropic_api_key",
            "gemini_api_key",
            "openrouter_api_key",
        }
        return {k: v for k, v in all_settings.items() if k in key_names and v}
