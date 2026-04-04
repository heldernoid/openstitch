"""Tests for project CRUD and canvas snapshot endpoints."""
from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from uuid import uuid4

from src.db.database import Database
from src.routers.projects import router as projects_router
from src.routers.screens import router as screens_router


def _make_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> Any:  # type: ignore[return]
        db = Database(":memory:")
        await db.initialize()
        app.state.db = db
        yield
        await db.close()

    app = FastAPI(lifespan=lifespan)
    app.include_router(projects_router)
    app.include_router(screens_router)
    return app


# ---------------------------------------------------------------------------
# Project CRUD
# ---------------------------------------------------------------------------

def test_create_project() -> None:
    with TestClient(_make_app()) as client:
        r = client.post("/api/projects", json={"name": "My App"})
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "My App"
    assert data["id"] != ""
    assert data["canvas_snapshot_json"] is None


def test_list_projects_empty() -> None:
    with TestClient(_make_app()) as client:
        r = client.get("/api/projects")
    assert r.status_code == 200
    assert r.json() == []


def test_list_projects_returns_created() -> None:
    with TestClient(_make_app()) as client:
        client.post("/api/projects", json={"name": "App 1"})
        client.post("/api/projects", json={"name": "App 2"})
        r = client.get("/api/projects")
    assert r.status_code == 200
    names = [p["name"] for p in r.json()]
    assert "App 1" in names
    assert "App 2" in names


def test_get_project() -> None:
    with TestClient(_make_app()) as client:
        created = client.post("/api/projects", json={"name": "Test"}).json()
        r = client.get(f"/api/projects/{created['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == created["id"]


def test_get_project_not_found() -> None:
    with TestClient(_make_app()) as client:
        r = client.get("/api/projects/nonexistent")
    assert r.status_code == 404


def test_patch_project_name() -> None:
    with TestClient(_make_app()) as client:
        created = client.post("/api/projects", json={"name": "Old"}).json()
        r = client.patch(f"/api/projects/{created['id']}", json={"name": "New"})
    assert r.status_code == 200
    assert r.json()["name"] == "New"


def test_patch_project_not_found() -> None:
    with TestClient(_make_app()) as client:
        r = client.patch("/api/projects/missing", json={"name": "X"})
    assert r.status_code == 404


def test_delete_project() -> None:
    with TestClient(_make_app()) as client:
        created = client.post("/api/projects", json={"name": "ToDelete"}).json()
        r = client.delete(f"/api/projects/{created['id']}")
        assert r.status_code == 204
        r2 = client.get(f"/api/projects/{created['id']}")
        assert r2.status_code == 404


def test_delete_project_not_found() -> None:
    with TestClient(_make_app()) as client:
        r = client.delete("/api/projects/ghost")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Canvas snapshot
# ---------------------------------------------------------------------------

def test_save_and_retrieve_canvas_snapshot() -> None:
    snapshot = json.dumps({"nodes": [], "edges": []})
    with TestClient(_make_app()) as client:
        created = client.post("/api/projects", json={"name": "Canvas"}).json()
        r = client.put(
            f"/api/projects/{created['id']}/canvas",
            json={"snapshot_json": snapshot},
        )
        assert r.status_code == 204
        r2 = client.get(f"/api/projects/{created['id']}")
    assert r2.json()["canvas_snapshot_json"] == snapshot


def test_canvas_save_not_found() -> None:
    with TestClient(_make_app()) as client:
        r = client.put("/api/projects/ghost/canvas", json={"snapshot_json": "{}"})
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Flow edges
# ---------------------------------------------------------------------------

def _make_app_with_screens(
    pid: str, s1: str, s2: str
) -> FastAPI:
    """Test app pre-seeded with one project and two screens."""
    from datetime import datetime, timezone

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> Any:  # type: ignore[return]
        db = Database(":memory:")
        await db.initialize()
        now = datetime.now(timezone.utc).isoformat()
        await db.conn.execute(
            "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (pid, "Flow", now, now),
        )
        for sid in (s1, s2):
            await db.conn.execute(
                "INSERT INTO screens (id, project_id, name, framework, code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (sid, pid, sid[:8], "html_tailwind", "<html/>", now, now),
            )
        await db.conn.commit()
        app.state.db = db
        yield
        await db.close()

    app = FastAPI(lifespan=lifespan)
    app.include_router(projects_router)
    app.include_router(screens_router)
    return app


def test_create_and_delete_flow_edge() -> None:
    pid = str(uuid4())
    s1 = str(uuid4())
    s2 = str(uuid4())
    app = _make_app_with_screens(pid, s1, s2)
    with TestClient(app) as client:
        r = client.post(
            f"/api/projects/{pid}/flow-edges",
            json={
                "source_screen_id": s1,
                "target_screen_id": s2,
                "trigger_selector": "#btn",
                "label": "Login",
                "transition": "fade",
            },
        )
        assert r.status_code == 201
        edge_id = r.json()["id"]
        assert edge_id != ""

        r2 = client.delete(f"/api/projects/{pid}/flow-edges/{edge_id}")
        assert r2.status_code == 204


def test_create_flow_edge_invalid_screens() -> None:
    with TestClient(_make_app()) as client:
        proj = client.post("/api/projects", json={"name": "Flow"}).json()
        r = client.post(
            f"/api/projects/{proj['id']}/flow-edges",
            json={
                "source_screen_id": "bad1",
                "target_screen_id": "bad2",
                "trigger_selector": "#btn",
            },
        )
    assert r.status_code == 422


def test_flow_edge_project_not_found() -> None:
    with TestClient(_make_app()) as client:
        r = client.post(
            "/api/projects/ghost/flow-edges",
            json={
                "source_screen_id": "s1",
                "target_screen_id": "s2",
                "trigger_selector": "#btn",
            },
        )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Sessions endpoint
# ---------------------------------------------------------------------------

def test_list_sessions_empty() -> None:
    with TestClient(_make_app()) as client:
        proj = client.post("/api/projects", json={"name": "P"}).json()
        r = client.get(f"/api/projects/{proj['id']}/sessions")
    assert r.status_code == 200
    assert r.json() == []


def test_list_sessions_project_not_found() -> None:
    with TestClient(_make_app()) as client:
        r = client.get("/api/projects/ghost/sessions")
    assert r.status_code == 404
