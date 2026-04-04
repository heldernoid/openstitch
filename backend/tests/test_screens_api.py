"""Tests for screen CRUD and version history endpoints."""
from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.db.database import Database
from src.routers.screens import router as screens_router
from src.routers.projects import router as projects_router


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


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Helpers: create a project and screen via REST
# ---------------------------------------------------------------------------

def _create_project(client: TestClient, name: str = "Test Project") -> str:
    r = client.post("/api/projects", json={"name": name})
    assert r.status_code == 201
    return str(r.json()["id"])


def _insert_screen(
    client: TestClient,
    project_id: str,
    name: str = "Screen 1",
    framework: str = "html_tailwind",
    code: str = "<html/>",
) -> dict[str, Any]:
    """Insert a screen directly into the test app's DB via the app.state accessor."""
    # Access the DB through the TestClient's app state
    # We use a small hack: inject via a test-only endpoint
    # Instead, just use the generate WS... but that requires a model.
    # The cleanest approach: insert directly in the lifespan setup.
    # For these tests, we use a separate fixture factory.
    raise NotImplementedError("Use _make_app_with_screen instead")


def _make_app_with_data(
    project_ids: list[str] | None = None,
    screens: list[dict[str, str]] | None = None,
) -> FastAPI:
    """Create test app pre-seeded with projects and screens."""

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> Any:  # type: ignore[return]
        db = Database(":memory:")
        await db.initialize()
        now = _now()
        for pid in (project_ids or []):
            await db.conn.execute(
                "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (pid, f"Project {pid[:8]}", now, now),
            )
        for s in (screens or []):
            await db.conn.execute(
                """INSERT INTO screens
                   (id, project_id, name, framework, code, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    s["id"],
                    s["project_id"],
                    s.get("name", "Screen"),
                    s.get("framework", "html_tailwind"),
                    s.get("code", "<html/>"),
                    now,
                    now,
                ),
            )
        await db.conn.commit()
        app.state.db = db
        yield
        await db.close()

    app = FastAPI(lifespan=lifespan)
    app.include_router(projects_router)
    app.include_router(screens_router)
    return app


# ---------------------------------------------------------------------------
# Screen list
# ---------------------------------------------------------------------------

def test_list_screens_empty() -> None:
    pid = str(uuid4())
    app = _make_app_with_data(project_ids=[pid])
    with TestClient(app) as client:
        r = client.get(f"/api/projects/{pid}/screens")
    assert r.status_code == 200
    assert r.json() == []


def test_list_screens_returns_all() -> None:
    pid = str(uuid4())
    s1 = str(uuid4())
    s2 = str(uuid4())
    app = _make_app_with_data(
        project_ids=[pid],
        screens=[
            {"id": s1, "project_id": pid, "name": "Login"},
            {"id": s2, "project_id": pid, "name": "Dashboard"},
        ],
    )
    with TestClient(app) as client:
        r = client.get(f"/api/projects/{pid}/screens")
    assert r.status_code == 200
    names = [s["name"] for s in r.json()]
    assert "Login" in names
    assert "Dashboard" in names


# ---------------------------------------------------------------------------
# Get screen
# ---------------------------------------------------------------------------

def test_get_screen() -> None:
    pid = str(uuid4())
    sid = str(uuid4())
    app = _make_app_with_data(
        project_ids=[pid],
        screens=[{"id": sid, "project_id": pid, "code": "<b>hello</b>"}],
    )
    with TestClient(app) as client:
        r = client.get(f"/api/screens/{sid}")
    assert r.status_code == 200
    assert r.json()["id"] == sid
    assert r.json()["code"] == "<b>hello</b>"


def test_get_screen_not_found() -> None:
    with TestClient(_make_app()) as client:
        r = client.get("/api/screens/nope")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Patch screen
# ---------------------------------------------------------------------------

def test_patch_screen_name() -> None:
    pid = str(uuid4())
    sid = str(uuid4())
    app = _make_app_with_data(
        project_ids=[pid],
        screens=[{"id": sid, "project_id": pid, "name": "Old Name"}],
    )
    with TestClient(app) as client:
        r = client.patch(f"/api/screens/{sid}", json={"name": "New Name"})
    assert r.status_code == 200
    assert r.json()["name"] == "New Name"


def test_patch_screen_code_creates_version() -> None:
    pid = str(uuid4())
    sid = str(uuid4())
    app = _make_app_with_data(
        project_ids=[pid],
        screens=[{"id": sid, "project_id": pid, "code": "<html>old</html>"}],
    )
    with TestClient(app) as client:
        r = client.patch(
            f"/api/screens/{sid}",
            json={"code": "<html>new</html>", "prompt": "make it dark", "model": "ollama:test"},
        )
        assert r.status_code == 200
        assert r.json()["code"] == "<html>new</html>"

        versions = client.get(f"/api/screens/{sid}/versions").json()
    assert len(versions) == 1
    assert versions[0]["code"] == "<html>new</html>"
    assert versions[0]["prompt"] == "make it dark"


def test_patch_screen_thumbnail() -> None:
    pid = str(uuid4())
    sid = str(uuid4())
    app = _make_app_with_data(
        project_ids=[pid],
        screens=[{"id": sid, "project_id": pid}],
    )
    with TestClient(app) as client:
        r = client.patch(
            f"/api/screens/{sid}",
            json={"thumbnail_data_url": "data:image/png;base64,abc"},
        )
        assert r.status_code == 200
        assert r.json()["thumbnail_data_url"] == "data:image/png;base64,abc"


def test_patch_screen_not_found() -> None:
    with TestClient(_make_app()) as client:
        r = client.patch("/api/screens/missing", json={"name": "X"})
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Delete screen
# ---------------------------------------------------------------------------

def test_delete_screen() -> None:
    pid = str(uuid4())
    sid = str(uuid4())
    app = _make_app_with_data(
        project_ids=[pid],
        screens=[{"id": sid, "project_id": pid}],
    )
    with TestClient(app) as client:
        r = client.delete(f"/api/screens/{sid}")
        assert r.status_code == 204
        r2 = client.get(f"/api/screens/{sid}")
        assert r2.status_code == 404


def test_delete_screen_not_found() -> None:
    with TestClient(_make_app()) as client:
        r = client.delete("/api/screens/ghost")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Version history
# ---------------------------------------------------------------------------

def test_versions_empty_initially() -> None:
    pid = str(uuid4())
    sid = str(uuid4())
    app = _make_app_with_data(
        project_ids=[pid],
        screens=[{"id": sid, "project_id": pid}],
    )
    with TestClient(app) as client:
        r = client.get(f"/api/screens/{sid}/versions")
    assert r.status_code == 200
    assert r.json() == []


def test_versions_accumulate_on_code_updates() -> None:
    pid = str(uuid4())
    sid = str(uuid4())
    app = _make_app_with_data(
        project_ids=[pid],
        screens=[{"id": sid, "project_id": pid, "code": "<html>v0</html>"}],
    )
    with TestClient(app) as client:
        client.patch(
            f"/api/screens/{sid}",
            json={"code": "<html>v1</html>", "prompt": "make it light"},
        )
        client.patch(
            f"/api/screens/{sid}",
            json={"code": "<html>v2</html>", "prompt": "make it dark"},
        )
        r = client.get(f"/api/screens/{sid}/versions")
    assert r.status_code == 200
    assert len(r.json()) == 2
    prompts = [v["prompt"] for v in r.json()]
    assert "make it light" in prompts
    assert "make it dark" in prompts


def test_versions_not_found() -> None:
    with TestClient(_make_app()) as client:
        r = client.get("/api/screens/ghost/versions")
    assert r.status_code == 404
