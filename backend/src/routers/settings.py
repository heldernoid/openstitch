from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from ..db.repositories.settings import SettingsRepository

router = APIRouter()

_SENSITIVE = {
    "openai_api_key",
    "anthropic_api_key",
    "gemini_api_key",
    "openrouter_api_key",
}


def _mask(key: str, value: str) -> str:
    if key in _SENSITIVE and len(value) > 8:
        return value[:4] + "****" + value[-4:]
    return value


class SettingValue(BaseModel):
    value: str


@router.get("/settings")
async def get_settings(request: Request) -> dict[str, str]:
    db = request.app.state.db
    repo = SettingsRepository(db.conn)
    settings = await repo.get_all()
    return {k: _mask(k, v) for k, v in settings.items()}


@router.put("/settings/{key}", status_code=204)
async def set_setting(key: str, body: SettingValue, request: Request) -> None:
    db = request.app.state.db
    repo = SettingsRepository(db.conn)
    await repo.set(key, body.value)
