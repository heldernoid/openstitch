"""Dataclass models mirroring SQLite tables. No Pydantic."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Screen:
    id: str
    project_id: str
    name: str
    framework: str
    code: str
    created_at: str
    updated_at: str
    thumbnail_data_url: str | None


@dataclass
class ScreenVersion:
    id: str
    screen_id: str
    code: str
    prompt: str
    model: str
    created_at: str


@dataclass
class Session:
    id: str
    project_id: str
    screen_id: str | None
    prompt: str
    model: str
    framework: str
    prompt_tokens: int
    completion_tokens: int
    created_at: str


@dataclass
class Project:
    id: str
    name: str
    created_at: str
    updated_at: str
    canvas_snapshot_json: str | None


@dataclass
class Skill:
    id: str
    name: str
    description: str
    instructions: str
    examples: str
    parameters: str   # JSON array of {key, label, type, default_value}
    param_values: str  # JSON object {key: value}
    category: str
    scope: str
    project_id: str | None
    is_active: bool
    sort_order: int
    created_at: str
