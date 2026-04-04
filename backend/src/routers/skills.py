"""Skills CRUD REST endpoints."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..db.repositories.skills import SkillsRepository

router = APIRouter()


class CreateSkillBody(BaseModel):
    name: str
    instructions: str = ""
    examples: str = ""
    parameters: str = "[]"
    param_values: str = "{}"
    description: str = ""
    category: str = "general"
    is_active: bool = True
    sort_order: int = 0


class PatchSkillBody(BaseModel):
    name: str | None = None
    description: str | None = None
    instructions: str | None = None
    examples: str | None = None
    parameters: str | None = None
    param_values: str | None = None
    category: str | None = None
    is_active: bool | None = None
    sort_order: int | None = None


def _to_dict(skill) -> dict:  # type: ignore[type-arg]
    return {
        "id": skill.id,
        "name": skill.name,
        "description": skill.description,
        "instructions": skill.instructions,
        "examples": skill.examples,
        "parameters": skill.parameters,
        "param_values": skill.param_values,
        "category": skill.category,
        "scope": skill.scope,
        "project_id": skill.project_id,
        "is_active": skill.is_active,
        "sort_order": skill.sort_order,
        "created_at": skill.created_at,
    }


@router.get("/api/skills")
async def list_global_skills(request: Request) -> list[dict]:
    repo = SkillsRepository(request.app.state.db.conn)
    return [_to_dict(s) for s in await repo.list_global()]


@router.get("/api/projects/{project_id}/skills")
async def list_project_skills(project_id: str, request: Request) -> list[dict]:
    repo = SkillsRepository(request.app.state.db.conn)
    return [_to_dict(s) for s in await repo.list_all_for_project(project_id)]


@router.post("/api/skills", status_code=201)
async def create_global_skill(body: CreateSkillBody, request: Request) -> dict:
    repo = SkillsRepository(request.app.state.db.conn)
    skill = await repo.create(
        name=body.name,
        instructions=body.instructions,
        examples=body.examples,
        parameters=body.parameters,
        param_values=body.param_values,
        description=body.description,
        category=body.category,
        scope="global",
        is_active=body.is_active,
        sort_order=body.sort_order,
    )
    return _to_dict(skill)


@router.post("/api/projects/{project_id}/skills", status_code=201)
async def create_project_skill(project_id: str, body: CreateSkillBody, request: Request) -> dict:
    repo = SkillsRepository(request.app.state.db.conn)
    skill = await repo.create(
        name=body.name,
        instructions=body.instructions,
        examples=body.examples,
        parameters=body.parameters,
        param_values=body.param_values,
        description=body.description,
        category=body.category,
        scope="project",
        project_id=project_id,
        is_active=body.is_active,
        sort_order=body.sort_order,
    )
    return _to_dict(skill)


@router.patch("/api/skills/{skill_id}")
async def update_skill(skill_id: str, body: PatchSkillBody, request: Request) -> dict:
    repo = SkillsRepository(request.app.state.db.conn)
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    skill = await repo.update(skill_id, patch)
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    return _to_dict(skill)


@router.delete("/api/skills/{skill_id}", status_code=204)
async def delete_skill(skill_id: str, request: Request) -> None:
    repo = SkillsRepository(request.app.state.db.conn)
    await repo.delete(skill_id)
