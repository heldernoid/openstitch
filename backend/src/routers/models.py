from __future__ import annotations

import httpx
import structlog
from fastapi import APIRouter, Query, Request, WebSocket
from pydantic import BaseModel

from ..config import config
from ..db.repositories.settings import SettingsRepository
from ..models.registry import ModelInfo, registry

logger: structlog.BoundLogger = structlog.get_logger()

router = APIRouter()

_OPENROUTER_BASE = "https://openrouter.ai/api/v1"
_REFERER = "http://localhost:3000"
_APP_TITLE = "OpenStitch"


@router.get("/models", response_model=list[ModelInfo])
async def list_models(request: Request) -> list[ModelInfo]:
    db = request.app.state.db
    repo = SettingsRepository(db.conn)
    key_overrides = await repo.get_api_keys()
    return await registry.list_available(key_overrides=key_overrides)


class OpenRouterModelEntry(BaseModel):
    id: str
    name: str
    context_length: int | None = None
    prompt_price: str | None = None
    completion_price: str | None = None


@router.get("/openrouter/models", response_model=list[OpenRouterModelEntry])
async def list_openrouter_models(
    request: Request,
    key: str | None = Query(default=None),
) -> list[OpenRouterModelEntry]:
    """Proxy the OpenRouter model catalogue. Uses provided key or stored key."""
    if not key:
        db = request.app.state.db
        repo = SettingsRepository(db.conn)
        settings = await repo.get_api_keys()
        key = settings.get("openrouter_api_key") or config.openrouter_api_key
    if not key:
        return []

    def fmt_price(raw: str | None) -> str | None:
        if not raw:
            return None
        try:
            v = float(raw) * 1_000_000
            return f"${v:.3f}"
        except Exception:
            return raw

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{_OPENROUTER_BASE}/models",
                headers={
                    "Authorization": f"Bearer {key}",
                    "HTTP-Referer": _REFERER,
                    "X-Title": _APP_TITLE,
                },
            )
            r.raise_for_status()
            data = r.json().get("data", [])

        return [
            OpenRouterModelEntry(
                id=m["id"],
                name=m.get("name") or m["id"],
                context_length=m.get("context_length"),
                prompt_price=fmt_price(m.get("pricing", {}).get("prompt")),
                completion_price=fmt_price(m.get("pricing", {}).get("completion")),
            )
            for m in data
        ]
    except Exception as exc:
        logger.error("openrouter.list_models_error", error=str(exc))
        return []


class OpenRouterTestRequest(BaseModel):
    api_key: str


@router.post("/openrouter/test")
async def test_openrouter_connection(
    body: OpenRouterTestRequest,
) -> dict[str, bool | str]:
    """Send a tiny chat completion to verify the key + a model actually responds."""
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                f"{_OPENROUTER_BASE}/chat/completions",
                headers={
                    "Authorization": f"Bearer {body.api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": _REFERER,
                    "X-Title": _APP_TITLE,
                },
                json={
                    "model": "openai/gpt-4o-mini",
                    "messages": [{"role": "user", "content": "hi"}],
                    "max_tokens": 5,
                },
            )
        if r.status_code == 200:
            return {"ok": True}
        return {"ok": False, "error": r.text[:200]}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


class PullRequest(BaseModel):
    model: str


@router.websocket("/ws/models/pull")
async def pull_model_ws(websocket: WebSocket) -> None:
    """Proxy an Ollama model pull and stream progress frames to the client."""
    await websocket.accept()

    try:
        raw = await websocket.receive_text()
        req = PullRequest.model_validate_json(raw)
    except Exception as exc:
        await websocket.send_json({"type": "error", "message": f"Invalid request: {exc}"})
        await websocket.close()
        return

    model_name = req.model.strip()
    if not model_name:
        await websocket.send_json({"type": "error", "message": "Model name is required"})
        await websocket.close()
        return

    logger.info("models.pull_start", model=model_name)

    try:
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                f"{config.ollama_base_url}/api/pull",
                json={"name": model_name, "stream": True},
            ) as resp:
                if resp.status_code != 200:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Ollama returned {resp.status_code}",
                    })
                    await websocket.close()
                    return

                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        import json
                        frame = json.loads(line)
                        await websocket.send_json({"type": "progress", **frame})
                        if frame.get("status") == "success":
                            break
                    except Exception:
                        continue

    except Exception as exc:
        logger.error("models.pull_error", model=model_name, error=str(exc))
        await websocket.send_json({"type": "error", "message": f"Pull failed: {exc}"})
        await websocket.close()
        return

    await websocket.send_json({"type": "done", "model": model_name})
    await websocket.close()
    logger.info("models.pull_complete", model=model_name)
