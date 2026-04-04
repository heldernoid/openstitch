"""Tests for /ws/generate WebSocket endpoint."""
from __future__ import annotations

import base64
from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.db.database import Database
from src.routers.generate import router as generate_router


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_adapter(tokens: list[str], supports_vision: bool = False) -> MagicMock:
    """Return a MagicMock adapter whose stream_generate is an async generator."""

    async def _gen(*args: Any, **kwargs: Any) -> Any:  # type: ignore[return]
        for t in tokens:
            yield t

    adapter = MagicMock()
    adapter.supports_vision = supports_vision
    adapter.stream_generate = _gen
    return adapter


def _make_app(setup_fn: Any = None) -> FastAPI:
    """Create a test FastAPI app with an in-memory SQLite database."""

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> Any:  # type: ignore[return]
        db = Database(":memory:")
        await db.initialize()
        if setup_fn is not None:
            await setup_fn(db)
        app.state.db = db
        yield
        await db.close()

    app = FastAPI(lifespan=lifespan)
    app.include_router(generate_router)
    return app


def _base_req(
    project_id: str = "proj-1",
    screen_id: str | None = None,
    framework: str = "html_tailwind",
    model: str = "ollama:qwen2.5-coder:7b",
    prompt: str = "a login page",
    iteration_context: list[str] | None = None,
    image_b64: str | None = None,
) -> dict[str, Any]:
    return {
        "project_id": project_id,
        "prompt": prompt,
        "framework": framework,
        "model": model,
        "screen_id": screen_id,
        "iteration_context": iteration_context,
        "image_b64": image_b64,
    }


# ---------------------------------------------------------------------------
# Helper: insert a project row in the test DB
# ---------------------------------------------------------------------------

async def _insert_project(db: Database, project_id: str) -> None:
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    await db.conn.execute(
        "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (project_id, "Test Project", now, now),
    )
    await db.conn.commit()


async def _insert_screen(
    db: Database, screen_id: str, project_id: str, framework: str = "html_tailwind"
) -> None:
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    await db.conn.execute(
        """INSERT INTO screens (id, project_id, name, framework, code, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (screen_id, project_id, "Screen 1", framework, "<html/>", now, now),
    )
    await db.conn.commit()


# ---------------------------------------------------------------------------
# Token streaming
# ---------------------------------------------------------------------------

def test_token_frames_received() -> None:
    adapter = _make_adapter(["Hello", " ", "World"])
    project_id = str(uuid4())

    async def setup(db: Database) -> None:
        await _insert_project(db, project_id)

    app = _make_app(setup)
    with patch("src.routers.generate.registry") as mock_reg:
        mock_reg.resolve.return_value = adapter
        with TestClient(app) as client:
            with client.websocket_connect("/ws/generate") as ws:
                ws.send_json(_base_req(project_id=project_id))
                frames = []
                while True:
                    frame = ws.receive_json()
                    frames.append(frame)
                    if frame["type"] in ("done", "error"):
                        break

    token_frames = [f for f in frames if f["type"] == "token"]
    assert [f["data"] for f in token_frames] == ["Hello", " ", "World"]


def test_done_frame_after_streaming() -> None:
    adapter = _make_adapter(["<html>ok</html>"])
    project_id = str(uuid4())

    async def setup(db: Database) -> None:
        await _insert_project(db, project_id)

    app = _make_app(setup)
    with patch("src.routers.generate.registry") as mock_reg:
        mock_reg.resolve.return_value = adapter
        with TestClient(app) as client:
            with client.websocket_connect("/ws/generate") as ws:
                ws.send_json(_base_req(project_id=project_id))
                frames = []
                while True:
                    frame = ws.receive_json()
                    frames.append(frame)
                    if frame["type"] in ("done", "error"):
                        break

    done = frames[-1]
    assert done["type"] == "done"
    assert done["full_code"] == "<html>ok</html>"
    assert done["framework"] == "html_tailwind"
    assert done["model"] == "ollama:qwen2.5-coder:7b"
    assert done["completion_tokens"] == 1


def test_new_screen_id_in_done_frame() -> None:
    """When screen_id=None, a new screen is created and its id returned."""
    adapter = _make_adapter(["code"])
    project_id = str(uuid4())

    async def setup(db: Database) -> None:
        await _insert_project(db, project_id)

    app = _make_app(setup)
    with patch("src.routers.generate.registry") as mock_reg:
        mock_reg.resolve.return_value = adapter
        with TestClient(app) as client:
            with client.websocket_connect("/ws/generate") as ws:
                ws.send_json(_base_req(project_id=project_id))
                done = None
                while True:
                    frame = ws.receive_json()
                    if frame["type"] == "done":
                        done = frame
                        break
                    if frame["type"] == "error":
                        pytest.fail(f"Unexpected error: {frame['message']}")
                        break

    assert done is not None
    assert done["screen_id"] != ""
    assert done["session_id"] != ""


def test_iteration_reuses_existing_screen() -> None:
    """When screen_id is set, the done frame echoes that screen_id."""
    adapter = _make_adapter(["new code"])
    project_id = str(uuid4())
    screen_id = str(uuid4())

    async def setup(db: Database) -> None:
        await _insert_project(db, project_id)
        await _insert_screen(db, screen_id, project_id)

    app = _make_app(setup)
    with patch("src.routers.generate.registry") as mock_reg:
        mock_reg.resolve.return_value = adapter
        with TestClient(app) as client:
            with client.websocket_connect("/ws/generate") as ws:
                ws.send_json(_base_req(project_id=project_id, screen_id=screen_id))
                while True:
                    frame = ws.receive_json()
                    if frame["type"] == "done":
                        assert frame["screen_id"] == screen_id
                        break
                    if frame["type"] == "error":
                        pytest.fail(f"Unexpected error: {frame['message']}")
                        break


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------

def test_error_on_invalid_json() -> None:
    app = _make_app()
    with TestClient(app) as client:
        with client.websocket_connect("/ws/generate") as ws:
            ws.send_text("not json at all {{{")
            frame = ws.receive_json()
    assert frame["type"] == "error"


def test_error_on_unknown_model() -> None:
    app = _make_app()
    with patch("src.routers.generate.registry") as mock_reg:
        mock_reg.resolve.return_value = None
        with TestClient(app) as client:
            with client.websocket_connect("/ws/generate") as ws:
                ws.send_json(_base_req())
                frame = ws.receive_json()
    assert frame["type"] == "error"
    assert "not available" in frame["message"].lower()


def test_error_on_unknown_framework() -> None:
    app = _make_app()
    with patch("src.routers.generate.registry") as mock_reg:
        mock_reg.resolve.return_value = _make_adapter([])
        with TestClient(app) as client:
            with client.websocket_connect("/ws/generate") as ws:
                ws.send_json(_base_req(framework="svelte_tailwind"))
                frame = ws.receive_json()
    assert frame["type"] == "error"
    assert "framework" in frame["message"].lower()


def test_error_on_image_too_large() -> None:
    big_image = base64.b64encode(b"x" * (5 * 1024 * 1024 + 1)).decode()
    app = _make_app()
    with patch("src.routers.generate.registry") as mock_reg:
        mock_reg.resolve.return_value = _make_adapter([], supports_vision=True)
        with TestClient(app) as client:
            with client.websocket_connect("/ws/generate") as ws:
                ws.send_json(_base_req(image_b64=big_image))
                frame = ws.receive_json()
    assert frame["type"] == "error"
    assert "5 mb" in frame["message"].lower() or "too large" in frame["message"].lower()


def test_error_on_non_vision_model_with_image() -> None:
    small_image = base64.b64encode(b"fake-image-data").decode()
    adapter = _make_adapter([], supports_vision=False)
    app = _make_app()
    with patch("src.routers.generate.registry") as mock_reg:
        mock_reg.resolve.return_value = adapter
        with TestClient(app) as client:
            with client.websocket_connect("/ws/generate") as ws:
                ws.send_json(_base_req(image_b64=small_image))
                frame = ws.receive_json()
    assert frame["type"] == "error"
    assert "vision" in frame["message"].lower()


def test_error_when_adapter_raises() -> None:
    async def _bad_gen(*args: Any, **kwargs: Any) -> Any:  # type: ignore[return]
        raise RuntimeError("model crashed")
        yield  # make it a generator

    adapter = MagicMock()
    adapter.supports_vision = False
    adapter.stream_generate = _bad_gen

    project_id = str(uuid4())

    async def setup(db: Database) -> None:
        await _insert_project(db, project_id)

    app = _make_app(setup)
    with patch("src.routers.generate.registry") as mock_reg:
        mock_reg.resolve.return_value = adapter
        with TestClient(app) as client:
            with client.websocket_connect("/ws/generate") as ws:
                ws.send_json(_base_req(project_id=project_id))
                frame = ws.receive_json()
    assert frame["type"] == "error"
    assert "generation failed" in frame["message"].lower()


# ---------------------------------------------------------------------------
# Iteration context
# ---------------------------------------------------------------------------

def test_iteration_context_capped_at_10() -> None:
    """When more than 10 context entries are sent, only the last 10 are used.
    We verify indirectly: generation completes without error (not that the
    truncated prompt text is literally in the output, which is model-dependent)."""
    adapter = _make_adapter(["ok"])
    project_id = str(uuid4())

    async def setup(db: Database) -> None:
        await _insert_project(db, project_id)

    app = _make_app(setup)
    ctx = [f"prompt {i}" for i in range(15)]
    with patch("src.routers.generate.registry") as mock_reg:
        mock_reg.resolve.return_value = adapter
        with TestClient(app) as client:
            with client.websocket_connect("/ws/generate") as ws:
                ws.send_json(_base_req(project_id=project_id, iteration_context=ctx))
                while True:
                    frame = ws.receive_json()
                    if frame["type"] == "done":
                        break
                    if frame["type"] == "error":
                        pytest.fail(f"Unexpected error: {frame['message']}")
                        break
