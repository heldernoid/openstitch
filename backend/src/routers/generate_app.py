"""WebSocket endpoint for multi-screen app generation with shared design system."""
from __future__ import annotations

import json
import re
from base64 import b64decode
from typing import Any

import structlog
from fastapi import APIRouter, WebSocket
from pydantic import BaseModel, ValidationError

from ..db.repositories.projects import ProjectRepository
from ..db.repositories.screens import ScreenRepository
from ..db.repositories.sessions import SessionRepository
from ..db.repositories.settings import SettingsRepository
from ..db.repositories.skills import SkillsRepository
from ..models.registry import registry
from ..prompts.design_doc import DESIGN_DOC_SYSTEM_PROMPT, build_design_doc_prompt
from ..prompts.html_tailwind import SYSTEM_PROMPT as HTML_TW_SYSTEM, build_design_system_prompt
from ..prompts.planner import PLANNER_SYSTEM_PROMPT, build_planner_user_prompt
from ..prompts.selector import select_skills
from .design_systems import _read_design_md

logger: structlog.BoundLogger = structlog.get_logger()

router = APIRouter()

_MAX_SCREENS = 6
_FRAMEWORK = "html_tailwind"  # Generate App always uses HTML + Tailwind


_MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


class GenerateAppRequest(BaseModel):
    project_id: str
    prompt: str
    model: str
    framework: str = _FRAMEWORK  # kept for backward compat, ignored
    design_name: str | None = None  # e.g. "linear.app", "claude", "airbnb" — None = AI-generated
    image_b64: str | None = None   # optional reference screenshot (base64, no data URL prefix)


# ── Plan parsing ──────────────────────────────────────────────────────────────

def _clean_plan_text(raw: str) -> str:
    text = raw.strip()
    text = re.sub(r"<think(?:ing)?>.*?</think(?:ing)?>", "", text, flags=re.DOTALL).strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(l for l in lines[1:] if not l.startswith("```")).strip()
    return text


def _parse_plan(raw: str) -> dict | None:
    """Parse planner output — new format: {app_name, tailwind_config, google_fonts, screens:[]}."""
    text = _clean_plan_text(raw)
    # Try full object first
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(0))
            if isinstance(data, dict) and "screens" in data:
                screens = [
                    {"name": str(s["name"]), "prompt": str(s["prompt"])}
                    for s in data["screens"][:_MAX_SCREENS]
                    if isinstance(s, dict) and "name" in s and "prompt" in s
                ]
                if screens:
                    return {
                        "app_name": data.get("app_name", "App"),
                        "tailwind_config": data.get("tailwind_config", {}),
                        "google_fonts": data.get("google_fonts", ""),
                        "icon_library": data.get("icon_library", "none"),
                        "screens": screens,
                    }
        except Exception:
            pass
    # Fallback: try legacy JSON array format
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        try:
            arr = json.loads(match.group(0))
            if isinstance(arr, list):
                screens = [
                    {"name": str(s["name"]), "prompt": str(s["prompt"])}
                    for s in arr[:_MAX_SCREENS]
                    if isinstance(s, dict) and "name" in s and "prompt" in s
                ]
                if screens:
                    return {"app_name": "App", "tailwind_config": {}, "google_fonts": "", "icon_library": "none", "screens": screens}
        except Exception:
            pass
    return None


# ── Design shell builder ──────────────────────────────────────────────────────

def _build_head(app_name: str, tailwind_config: dict, google_fonts: str, icon_library: str = "none") -> str:
    """Build a complete <head> block with embedded Tailwind config + fonts."""
    tw_extend = {k: v for k, v in tailwind_config.items() if k != "darkMode"}
    config_json = json.dumps({"darkMode": "class", "theme": {"extend": tw_extend}}, indent=4)

    fonts_url = ""
    if google_fonts:
        fonts_url = (
            f'  <link href="https://fonts.googleapis.com/css2?family={google_fonts}'
            f'&display=swap" rel="stylesheet"/>\n'
        )

    icon_url = ""
    icon_css = ""
    if icon_library == "material-symbols":
        icon_url = (
            '  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined'
            ':wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>\n'
        )
        icon_css = """
    .material-symbols-outlined {
      font-size: 20px;
      font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
      vertical-align: middle;
      line-height: 1;
    }"""

    return f"""<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>{app_name}</title>
{fonts_url}{icon_url}  <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
  <script id="tailwind-config">
    tailwind.config = {config_json}
  </script>
  <style>{icon_css}
    body {{ min-height: max(884px, 100dvh); }}
  </style>
</head>"""


def _apply_design_shell(html: str, app_name: str, tailwind_config: dict, google_fonts: str, icon_library: str = "none") -> str:
    """Replace or inject the <head> block with our canonical design-system head."""
    head = _build_head(app_name, tailwind_config, google_fonts, icon_library)
    # Replace existing head
    result = re.sub(r"<head[^>]*>.*?</head>", head, html, flags=re.DOTALL | re.IGNORECASE)
    if result != html:
        return result
    # No head found — inject after <html ...>
    result = re.sub(r"(<html[^>]*>)", rf"\1\n{head}", html, flags=re.IGNORECASE)
    if result != html:
        return result
    # No html tag — prepend full structure
    return f"<!DOCTYPE html>\n<html lang=\"en\">\n{head}\n{html}\n</html>"


def _extract_shell(code: str) -> tuple[str, str]:
    """Extract <nav> and <footer> for verbatim reuse across screens."""
    nav = ""
    footer = ""
    nav_match = re.search(r"(<nav\b[^>]*>.*?</nav>)", code, re.DOTALL | re.IGNORECASE)
    if nav_match:
        nav = nav_match.group(1).strip()
    footer_match = re.search(r"(<footer\b[^>]*>.*?</footer>)", code, re.DOTALL | re.IGNORECASE)
    if footer_match:
        footer = footer_match.group(1).strip()
    return nav, footer


async def _try_send(ws: WebSocket, data: dict) -> bool:
    try:
        await ws.send_json(data)
        return True
    except Exception:
        return False


# ── WebSocket handler ─────────────────────────────────────────────────────────

@router.websocket("/ws/generate-app")
async def generate_app_ws(websocket: WebSocket) -> None:
    await websocket.accept()

    try:
        raw = await websocket.receive_text()
        req = GenerateAppRequest.model_validate_json(raw)
    except (ValidationError, Exception) as exc:
        await _try_send(websocket, {"type": "error", "message": f"Invalid request: {exc}"})
        await websocket.close()
        return

    db = websocket.app.state.db
    settings_repo = SettingsRepository(db.conn)
    key_overrides = await settings_repo.get_api_keys()
    adapter = registry.resolve(req.model, key_overrides=key_overrides)
    if adapter is None:
        await _try_send(websocket, {"type": "error", "message": f"Model not available: {req.model}"})
        await websocket.close()
        return

    # Decode image if provided
    image_bytes: bytes | None = None
    if req.image_b64:
        try:
            image_bytes = b64decode(req.image_b64)
        except Exception:
            await _try_send(websocket, {"type": "error", "message": "Invalid base64 image data"})
            await websocket.close()
            return
        if len(image_bytes) > _MAX_IMAGE_BYTES:
            await _try_send(websocket, {"type": "error", "message": "Image too large (max 5 MB)"})
            await websocket.close()
            return
        if not adapter.supports_vision:
            await _try_send(websocket, {
                "type": "error",
                "message": f"Model {req.model} does not support image input. Select a vision model.",
            })
            await websocket.close()
            return

    # ── Phase 0: Design system ────────────────────────────────────────────────
    await _try_send(websocket, {"type": "design_start"})
    logger.info("generate_app.design_start", project=req.project_id)

    rich_design_md: str = ""

    if req.design_name:
        # Use the reference design as-is — no LLM needed
        try:
            rich_design_md = _read_design_md(req.design_name)
            logger.info("generate_app.design_loaded", design=req.design_name, length=len(rich_design_md))
        except FileNotFoundError:
            logger.warning("generate_app.design_not_found", design=req.design_name)
        # Send full content as one token so WorkspacePanel shows it
        if rich_design_md:
            await _try_send(websocket, {"type": "design_token", "data": rich_design_md})
    else:
        # No design selected — generate a fresh one with the LLM
        design_parts: list[str] = []
        try:
            async for token in adapter.stream_generate(
                DESIGN_DOC_SYSTEM_PROMPT,
                build_design_doc_prompt(req.prompt, has_image=image_bytes is not None),
                image_bytes,
            ):
                design_parts.append(token)
                await _try_send(websocket, {"type": "design_token", "data": token})
        except Exception as exc:
            await _try_send(websocket, {"type": "error", "message": f"Design generation failed: {exc}"})
            await websocket.close()
            return
        rich_design_md = "".join(design_parts)

    await _try_send(websocket, {"type": "design_done", "preview": rich_design_md[:300]})
    logger.info("generate_app.design_done", length=len(rich_design_md))

    # ── Phase 1: Plan (design system + screens) ───────────────────────────────
    await _try_send(websocket, {"type": "planning"})
    logger.info("generate_app.planning", project=req.project_id)

    planner_user = build_planner_user_prompt(req.prompt, rich_design_md)

    plan_parts: list[str] = []
    try:
        async for token in adapter.stream_generate(PLANNER_SYSTEM_PROMPT, planner_user):
            plan_parts.append(token)
            await _try_send(websocket, {"type": "plan_token", "data": token})
    except Exception as exc:
        await _try_send(websocket, {"type": "error", "message": f"Planning failed: {exc}"})
        await websocket.close()
        return

    plan = _parse_plan("".join(plan_parts))
    if not plan or not plan["screens"]:
        await _try_send(websocket, {"type": "error", "message": "Could not generate a plan. Try a more specific description."})
        await websocket.close()
        return

    app_name: str = plan["app_name"]
    tailwind_config: dict = plan["tailwind_config"]
    google_fonts: str = plan["google_fonts"]
    icon_library: str = plan.get("icon_library", "none")
    screens_plan: list[dict] = plan["screens"]
    total = len(screens_plan)

    logger.info("generate_app.plan_ready", app_name=app_name, screens=[s["name"] for s in screens_plan])

    await _try_send(websocket, {
        "type": "plan",
        "app_name": app_name,
        "screens": [s["name"] for s in screens_plan],
        "prompts": [s["prompt"] for s in screens_plan],
        "total": total,
        "tailwind_config": tailwind_config,
        "google_fonts": google_fonts,
    })

    # ── Phase 2: Generate each screen ────────────────────────────────────────
    screen_repo = ScreenRepository(db.conn)
    session_repo = SessionRepository(db.conn)
    skills_repo = SkillsRepository(db.conn)
    active_skills = await skills_repo.list_active(req.project_id)
    selected_skills, selected_names = await select_skills(adapter, req.prompt, active_skills)
    skill_bodies = skills_repo.get_resolved_bodies(selected_skills) or None

    if selected_names:
        await _try_send(websocket, {"type": "skills_applied", "skills": selected_names})

    # Build design system addendum for each screen prompt
    design_addendum = ""
    if tailwind_config:
        design_addendum = build_design_system_prompt(tailwind_config, google_fonts, app_name)

    # Build full system prompt: base + design system
    screen_system = HTML_TW_SYSTEM
    if design_addendum:
        screen_system = HTML_TW_SYSTEM + design_addendum

    # Optionally inject skills
    if skill_bodies:
        skill_blocks = "\n\n".join(
            f"<skill>\n{b.strip()}\n</skill>" for b in skill_bodies if b.strip()
        )
        if skill_blocks:
            screen_system = (
                f"{screen_system}\n\n## Active skills\n"
                f"Apply the following skill instructions to every output:\n\n{skill_blocks}"
            )

    generated: list[dict[str, Any]] = []
    shell_nav = ""
    shell_footer = ""

    # Prepend carbon-copy instruction when a reference image is provided
    screenshot_note = (
        "IMPORTANT: A reference screenshot is provided. Recreate this UI as faithfully as "
        "possible — match the exact layout structure, color palette, typography, spacing, "
        "border radius, shadows, and component patterns you see. Do not invent new design "
        "choices; copy what is in the image.\n\n"
        if image_bytes else ""
    )

    for i, screen_plan in enumerate(screens_plan):
        name = screen_plan["name"]
        screen_prompt = screenshot_note + screen_plan["prompt"]

        # Reuse nav/footer from first screen for visual consistency
        if i > 0 and (shell_nav or shell_footer):
            parts: list[str] = []
            if shell_nav:
                parts.append(f"Navigation — copy EXACTLY, do not restyle:\n{shell_nav}")
            if shell_footer:
                parts.append(f"Footer — copy EXACTLY, do not restyle:\n{shell_footer}")
            screen_prompt = (
                f"{screen_prompt}\n\n"
                f"UI consistency (screen {i + 1} of {total}): include these verbatim:\n\n"
                + "\n\n".join(parts)
            )

        if not await _try_send(websocket, {
            "type": "screen_start",
            "name": name,
            "index": i,
            "total": total,
        }):
            return

        full_code_parts: list[str] = []
        try:
            # Pass image to all screens so each can match the reference layout
            async for token in adapter.stream_generate(screen_system, screen_prompt, image_bytes):
                full_code_parts.append(token)
                if not await _try_send(websocket, {"type": "token", "data": token}):
                    return
        except Exception as exc:
            logger.error("generate_app.screen_error", name=name, error=repr(exc))
            await _try_send(websocket, {
                "type": "screen_failed",
                "name": name,
                "index": i,
                "prompt": screen_plan["prompt"],
                "message": str(exc)[:200],
            })
            continue

        full_code = "".join(full_code_parts)

        # Post-process: inject canonical design head
        if tailwind_config:
            full_code = _apply_design_shell(full_code, app_name, tailwind_config, google_fonts, icon_library)

        # Extract nav/footer from first screen for reuse
        if i == 0 and full_code:
            shell_nav, shell_footer = _extract_shell(full_code)

        completion_tokens = len(full_code_parts)

        try:
            screen = await screen_repo.create(
                project_id=req.project_id,
                name=name,
                framework=_FRAMEWORK,
                code=full_code,
                prompt=screen_plan["prompt"],
                model=req.model,
            )
            await session_repo.create(
                project_id=req.project_id,
                screen_id=screen.id,
                prompt=screen_plan["prompt"],
                model=req.model,
                framework=_FRAMEWORK,
                prompt_tokens=0,
                completion_tokens=completion_tokens,
            )
        except Exception as exc:
            logger.error("generate_app.db_error", name=name, error=repr(exc))
            await _try_send(websocket, {"type": "error", "message": f"Failed to save '{name}'"})
            return

        generated.append({"id": screen.id, "name": name})

        await _try_send(websocket, {
            "type": "screen_done",
            "screen_id": screen.id,
            "name": name,
            "index": i,
            "total": total,
            "full_code": full_code,
            "model": req.model,
            "framework": _FRAMEWORK,
            "completion_tokens": completion_tokens,
        })
        logger.info("generate_app.screen_done", name=name, index=i, tokens=completion_tokens)

    # Store rich generated DESIGN.md in project
    try:
        project_repo = ProjectRepository(db.conn)
        await project_repo.update_design_md(req.project_id, rich_design_md)
    except Exception:
        pass  # non-critical

    await _try_send(websocket, {"type": "all_done", "total": total, "screens": generated})
    await websocket.close()
    logger.info("generate_app.complete", app_name=app_name, total=total)
