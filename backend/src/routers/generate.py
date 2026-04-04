"""WebSocket endpoint for streaming code generation."""
from __future__ import annotations

import structlog
from base64 import b64decode
from typing import Any

from fastapi import APIRouter, WebSocket
from pydantic import BaseModel, ValidationError

from ..db.repositories.screens import ScreenRepository
from ..db.repositories.sessions import SessionRepository
from ..db.repositories.settings import SettingsRepository
from ..db.repositories.skills import SkillsRepository
from ..diff_apply import apply_search_replace
from ..models.registry import registry
from ..prompts.base import VALID_FRAMEWORKS, assemble_prompt, assemble_surgical_prompt
from ..prompts.selector import select_skills

logger: structlog.BoundLogger = structlog.get_logger()

router = APIRouter()

_MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB
_MAX_ITERATION_CONTEXT = 10
_STREAM_CHUNK = 80  # chars per synthetic token when replaying patched code


class GenerateRequest(BaseModel):
    project_id: str
    prompt: str
    framework: str
    model: str
    screen_id: str | None = None
    image_b64: str | None = None
    iteration_context: list[str] | None = None
    current_code: str | None = None
    edit_mode: bool = False


async def _send_error(ws: WebSocket, message: str) -> None:
    await ws.send_json({"type": "error", "message": message})
    await ws.close()


@router.websocket("/ws/generate")
async def generate_ws(websocket: WebSocket) -> None:
    await websocket.accept()

    # Parse and validate request
    try:
        raw = await websocket.receive_text()
        req = GenerateRequest.model_validate_json(raw)
    except (ValidationError, Exception) as exc:
        await _send_error(websocket, f"Invalid request: {exc}")
        return

    # Validate framework
    if req.framework not in VALID_FRAMEWORKS:
        await _send_error(websocket, f"Unknown framework: {req.framework!r}")
        return

    # Decode image if present
    image_bytes: bytes | None = None
    if req.image_b64:
        try:
            image_bytes = b64decode(req.image_b64)
        except Exception:
            await _send_error(websocket, "Invalid base64 image data")
            return
        if len(image_bytes) > _MAX_IMAGE_BYTES:
            await _send_error(websocket, "Image too large (max 5 MB)")
            return

    # Look up any API keys stored in settings (override env-var defaults)
    db = websocket.app.state.db
    settings_repo = SettingsRepository(db.conn)
    key_overrides = await settings_repo.get_api_keys()

    # Resolve adapter
    adapter = registry.resolve(req.model, key_overrides=key_overrides)
    if adapter is None:
        await _send_error(websocket, f"Model not available: {req.model}")
        return

    # Reject image input for non-vision models
    if image_bytes is not None and not adapter.supports_vision:
        await _send_error(
            websocket,
            f"Model {req.model} does not support image input. Select a vision model.",
        )
        return

    # --- Skill selection ---
    skills_repo = SkillsRepository(db.conn)
    active_skills = await skills_repo.list_active(req.project_id)
    selected_skills, selected_names = await select_skills(adapter, req.prompt, active_skills)
    skill_bodies = skills_repo.get_resolved_bodies(selected_skills) or None

    if selected_names:
        logger.info("generate.skills_selected", skills=selected_names)
        await websocket.send_json({"type": "skills_applied", "skills": selected_names})

    ctx = req.iteration_context[-_MAX_ITERATION_CONTEXT:] if req.iteration_context else None

    # ── Surgical edit mode ──────────────────────────────────────────────────────
    if req.edit_mode and req.current_code:
        system, user = assemble_surgical_prompt(
            req.framework, req.prompt, req.current_code, ctx, skill_bodies,
        )

        # Buffer the model's surgical output - do NOT stream tokens yet
        llm_parts: list[str] = []
        try:
            async for token in adapter.stream_generate(system, user, image_bytes):
                llm_parts.append(token)
        except Exception as exc:
            logger.error("generate.surgical_error", error=str(exc))
            await _send_error(websocket, f"Generation failed: {exc}")
            return

        llm_output = "".join(llm_parts)
        completion_tokens = len(llm_parts)
        applied_code, success = apply_search_replace(req.current_code, llm_output)

        if success:
            full_code = applied_code
            block_count = llm_output.count(">>>>>>> REPLACE")
            logger.info("generate.surgical_applied", blocks=block_count, tokens=completion_tokens)
            # Stream the patched code as synthetic token chunks
            for i in range(0, len(full_code), _STREAM_CHUNK):
                await websocket.send_json({"type": "token", "data": full_code[i : i + _STREAM_CHUNK]})
        else:
            # Fallback: full regen with direct streaming
            logger.warning("generate.surgical_fallback", reason="no_blocks_matched")
            system, user = assemble_prompt(req.framework, req.prompt, ctx, req.current_code, skill_bodies)
            full_code_parts: list[str] = []
            try:
                async for token in adapter.stream_generate(system, user, image_bytes):
                    full_code_parts.append(token)
                    await websocket.send_json({"type": "token", "data": token})
            except Exception as exc:
                logger.error("generate.adapter_error", error=str(exc))
                await _send_error(websocket, f"Generation failed: {exc}")
                return
            full_code = "".join(full_code_parts)
            completion_tokens = len(full_code_parts)

    # ── Normal generation mode ──────────────────────────────────────────────────
    else:
        system, user = assemble_prompt(req.framework, req.prompt, ctx, req.current_code, skill_bodies)
        full_code_parts = []
        try:
            async for token in adapter.stream_generate(system, user, image_bytes):
                full_code_parts.append(token)
                await websocket.send_json({"type": "token", "data": token})
        except Exception as exc:
            logger.error("generate.adapter_error", error=str(exc))
            await _send_error(websocket, f"Generation failed: {exc}")
            return
        full_code = "".join(full_code_parts)
        completion_tokens = len(full_code_parts)

    # ── Persist to database ─────────────────────────────────────────────────────
    screen_repo = ScreenRepository(db.conn)
    session_repo = SessionRepository(db.conn)

    try:
        if req.screen_id:
            screen_id = req.screen_id
            await screen_repo.update_code(screen_id, full_code, req.prompt, req.model)
        else:
            count = await screen_repo.count(req.project_id)
            screen = await screen_repo.create(
                project_id=req.project_id,
                name=f"Screen {count + 1}",
                framework=req.framework,
                code=full_code,
                prompt=req.prompt,
                model=req.model,
            )
            screen_id = screen.id

        session_id = await session_repo.create(
            project_id=req.project_id,
            screen_id=screen_id,
            prompt=req.prompt,
            model=req.model,
            framework=req.framework,
            prompt_tokens=0,
            completion_tokens=completion_tokens,
        )
    except Exception as exc:
        logger.error("generate.db_error", error=str(exc))
        await _send_error(websocket, f"Failed to save result: {exc}")
        return

    done_frame: dict[str, Any] = {
        "type": "done",
        "session_id": session_id,
        "screen_id": screen_id,
        "full_code": full_code,
        "model": req.model,
        "framework": req.framework,
        "prompt_tokens": 0,
        "completion_tokens": completion_tokens,
    }
    await websocket.send_json(done_frame)
    await websocket.close()
    logger.info(
        "generate.complete",
        screen_id=screen_id,
        session_id=session_id,
        tokens=completion_tokens,
        edit_mode=req.edit_mode,
    )
