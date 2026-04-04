"""Screen CRUD and version history endpoints."""
from __future__ import annotations

from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..db.repositories.screens import ScreenRepository

logger: structlog.BoundLogger = structlog.get_logger()

router = APIRouter(tags=["screens"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class ScreenOut(BaseModel):
    id: str
    project_id: str
    name: str
    framework: str
    code: str
    created_at: str
    updated_at: str
    thumbnail_data_url: str | None = None


class ScreenVersionOut(BaseModel):
    id: str
    screen_id: str
    code: str
    prompt: str
    model: str
    created_at: str


class PatchScreenIn(BaseModel):
    name: str | None = None
    code: str | None = None
    thumbnail_data_url: str | None = None
    prompt: str | None = None
    model: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _repo(request: Request) -> ScreenRepository:
    return ScreenRepository(request.app.state.db.conn)


# ---------------------------------------------------------------------------
# Project-scoped screen list
# ---------------------------------------------------------------------------

@router.get("/api/projects/{project_id}/screens", response_model=list[ScreenOut])
async def list_screens(project_id: str, request: Request) -> list[Any]:
    screens = await _repo(request).list_by_project(project_id)
    return [ScreenOut(**s.__dict__) for s in screens]


# ---------------------------------------------------------------------------
# Screen CRUD
# ---------------------------------------------------------------------------

@router.get("/api/screens/{id}", response_model=ScreenOut)
async def get_screen(id: str, request: Request) -> Any:
    screen = await _repo(request).get(id)
    if screen is None:
        raise HTTPException(status_code=404, detail="Screen not found")
    return ScreenOut(**screen.__dict__)


@router.patch("/api/screens/{id}", response_model=ScreenOut)
async def patch_screen(id: str, body: PatchScreenIn, request: Request) -> Any:
    repo = _repo(request)
    screen = await repo.get(id)
    if screen is None:
        raise HTTPException(status_code=404, detail="Screen not found")

    if body.name is not None:
        screen = await repo.update_name(id, body.name)

    if body.code is not None:
        prompt = body.prompt or ""
        model = body.model or ""
        screen = await repo.update_code(id, body.code, prompt, model)

    if body.thumbnail_data_url is not None:
        await repo.update_thumbnail(id, body.thumbnail_data_url)
        screen = await repo.get(id)
        assert screen is not None

    return ScreenOut(**screen.__dict__)


@router.delete("/api/screens/{id}", status_code=204)
async def delete_screen(id: str, request: Request) -> None:
    repo = _repo(request)
    if await repo.get(id) is None:
        raise HTTPException(status_code=404, detail="Screen not found")
    await repo.delete(id)


@router.get("/api/screens/{id}/versions", response_model=list[ScreenVersionOut])
async def get_versions(id: str, request: Request) -> list[Any]:
    repo = _repo(request)
    if await repo.get(id) is None:
        raise HTTPException(status_code=404, detail="Screen not found")
    versions = await repo.get_versions(id)
    return [ScreenVersionOut(**v.__dict__) for v in versions]
