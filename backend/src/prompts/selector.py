"""Skill auto-selection - uses the generation model to pick relevant skills."""
from __future__ import annotations

import asyncio
import json
import re

from ..db.models import Skill
from ..models.base import ModelAdapter

_SELECTION_TIMEOUT = 12.0  # seconds - fall back to [] on timeout

_SYSTEM = (
    "You are a skill selector for a UI code generation system. "
    "Your only job is to decide which skills are relevant to the given UI task. "
    "Reply ONLY with a valid JSON array of skill IDs. No explanation, no prose, nothing else."
)


async def _call(adapter: ModelAdapter, prompt: str, skills: list[Skill]) -> list[Skill]:
    skill_list = "\n".join(
        f'  {{"id": {json.dumps(s.id)}, "name": {json.dumps(s.name)}, '
        f'"description": {json.dumps(s.description)}}}'
        for s in skills
    )
    user = (
        f"UI task: {prompt}\n\n"
        f"Available skills:\n{skill_list}\n\n"
        f'Reply with ONLY a JSON array of the most relevant skill IDs (maximum 10), e.g. ["skill-a", "skill-b"]. '
        f"Pick only skills that meaningfully improve this specific task. If none are relevant, reply []"
    )

    tokens: list[str] = []
    async for token in adapter.stream_generate(_SYSTEM, user):
        tokens.append(token)

    raw = "".join(tokens).strip()
    # Strip reasoning blocks (qwen3, deepseek-r1, etc.)
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    # Find first JSON array anywhere in output
    match = re.search(r"\[.*?\]", raw, re.DOTALL)
    if not match:
        return []

    ids: list[str] = json.loads(match.group(0))
    valid = {s.id: s for s in skills}
    return [valid[i] for i in ids if i in valid]


async def select_skills(
    adapter: ModelAdapter,
    prompt: str,
    skills: list[Skill],
) -> tuple[list[Skill], list[str]]:
    """
    Ask the model which active skills are relevant to this prompt.
    Returns (selected_skills, selected_names).
    Falls back gracefully on error or timeout.
    """
    if not skills:
        return [], []

    # Single skill - no selection needed, always apply
    if len(skills) == 1:
        return skills, [skills[0].name]

    try:
        selected = await asyncio.wait_for(_call(adapter, prompt, skills), timeout=_SELECTION_TIMEOUT)
        return selected, [s.name for s in selected]
    except asyncio.TimeoutError:
        # Timed out - apply none rather than flood context with all skills
        return [], []
    except Exception:
        # Parse error or adapter error - safe fallback
        return [], []
