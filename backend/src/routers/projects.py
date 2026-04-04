"""Project CRUD and canvas snapshot endpoints."""
from __future__ import annotations

import sqlite3
from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..db.repositories.projects import ProjectRepository
from ..db.repositories.sessions import SessionRepository
from ..db.repositories.settings import SettingsRepository
from ..models.registry import registry

logger: structlog.BoundLogger = structlog.get_logger()

router = APIRouter(prefix="/api/projects", tags=["projects"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class ProjectOut(BaseModel):
    id: str
    name: str
    created_at: str
    updated_at: str
    canvas_snapshot_json: str | None = None


class CreateProjectIn(BaseModel):
    name: str


class PatchProjectIn(BaseModel):
    name: str


class CanvasSnapshotIn(BaseModel):
    snapshot_json: str


class FlowEdgeIn(BaseModel):
    source_screen_id: str
    target_screen_id: str
    trigger_selector: str
    label: str = ""
    transition: str = "slide"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _repo(request: Request) -> ProjectRepository:
    return ProjectRepository(request.app.state.db.conn)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[ProjectOut])
async def list_projects(request: Request) -> list[Any]:
    projects = await _repo(request).list_all()
    return [ProjectOut(**p.__dict__) for p in projects]


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(body: CreateProjectIn, request: Request) -> Any:
    project = await _repo(request).create(body.name)
    return ProjectOut(**project.__dict__)


@router.get("/{id}", response_model=ProjectOut)
async def get_project(id: str, request: Request) -> Any:
    project = await _repo(request).get(id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectOut(**project.__dict__)


@router.patch("/{id}", response_model=ProjectOut)
async def patch_project(id: str, body: PatchProjectIn, request: Request) -> Any:
    repo = _repo(request)
    if await repo.get(id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    project = await repo.update(id, body.name)
    return ProjectOut(**project.__dict__)


@router.delete("", status_code=204)
async def delete_all_projects(request: Request) -> None:
    repo = _repo(request)
    await repo.delete_all()


@router.delete("/{id}", status_code=204)
async def delete_project(id: str, request: Request) -> None:
    repo = _repo(request)
    if await repo.get(id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    await repo.delete(id)


@router.put("/{id}/canvas", status_code=204)
async def save_canvas(id: str, body: CanvasSnapshotIn, request: Request) -> None:
    repo = _repo(request)
    if await repo.get(id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    await repo.save_canvas(id, body.snapshot_json)


@router.get("/{id}/sessions")
async def list_sessions(id: str, request: Request) -> Any:
    repo = _repo(request)
    if await repo.get(id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    session_repo = SessionRepository(request.app.state.db.conn)
    sessions = await session_repo.list_by_project(id)
    return [s.__dict__ for s in sessions]


@router.post("/{id}/flow-edges", status_code=201)
async def create_flow_edge(id: str, body: FlowEdgeIn, request: Request) -> Any:
    repo = _repo(request)
    if await repo.get(id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        edge_id = await repo.create_flow_edge(
            project_id=id,
            source_screen_id=body.source_screen_id,
            target_screen_id=body.target_screen_id,
            trigger_selector=body.trigger_selector,
            label=body.label,
            transition=body.transition,
        )
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=422, detail="Source or target screen not found")
    return {"id": edge_id}


@router.delete("/{id}/flow-edges/{edge_id}", status_code=204)
async def delete_flow_edge(id: str, edge_id: str, request: Request) -> None:
    await _repo(request).delete_flow_edge(edge_id)


@router.get("/{project_id}/design-md")
async def get_project_design_md(project_id: str, request: Request) -> dict:
    db = request.app.state.db
    repo = ProjectRepository(db.conn)
    design_md = await repo.get_design_md(project_id)
    return {"design_md": design_md}


class SuggestNameBody(BaseModel):
    prompt: str
    model: str


@router.post("/suggest-name")
async def suggest_project_name(body: SuggestNameBody, request: Request) -> dict:
    """Use the LLM to suggest a short project name (2-4 words) from a prompt."""
    db = request.app.state.db
    settings_repo = SettingsRepository(db.conn)
    key_overrides = await settings_repo.get_api_keys()
    adapter = registry.resolve(body.model, key_overrides=key_overrides)
    if adapter is None:
        # Fallback: first two words
        words = body.prompt.strip().split()
        return {"name": " ".join(words[:2]) or "New Project"}
    try:
        parts: list[str] = []
        async for token in adapter.stream_generate(
            "You are a naming assistant. Reply with ONLY a project name: 2-4 words, title case, no punctuation, no explanation.",
            f"App description: {body.prompt[:300]}\n\nProject name:",
        ):
            parts.append(token)
        name = "".join(parts).strip().strip('"\'').strip()
        # Sanitise: keep only first line, max 40 chars
        name = name.splitlines()[0].strip()[:40] or "New Project"
        return {"name": name}
    except Exception:
        words = body.prompt.strip().split()
        return {"name": " ".join(words[:2]) or "New Project"}
