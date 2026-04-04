"""Prompt assembly utilities."""
from __future__ import annotations

from .html_tailwind import SYSTEM_PROMPT as _HTML_TW
from .react_tailwind import SYSTEM_PROMPT as _REACT_TW
from .vue_tailwind import SYSTEM_PROMPT as _VUE_TW
from .html_css import SYSTEM_PROMPT as _HTML_CSS
from .surgical import SURGICAL_SYSTEM_PROMPT

FRAMEWORK_PROMPTS: dict[str, str] = {
    "html_tailwind": _HTML_TW,
    "react_tailwind": _REACT_TW,
    "vue_tailwind": _VUE_TW,
    "html_css": _HTML_CSS,
}

VALID_FRAMEWORKS = frozenset(FRAMEWORK_PROMPTS.keys())


def assemble_prompt(
    framework: str,
    user_prompt: str,
    iteration_context: list[str] | None,
    current_code: str | None = None,
    active_skills: list[str] | None = None,
) -> tuple[str, str]:
    """Return (system_prompt, user_message) for the given framework."""
    system = FRAMEWORK_PROMPTS[framework]

    if active_skills:
        skill_blocks = "\n\n".join(
            f"<skill>\n{body.strip()}\n</skill>"
            for body in active_skills
            if body.strip()
        )
        if skill_blocks:
            system = (
                f"{system}\n\n"
                f"## Active skills\n"
                f"Apply the following skill instructions to every output without exception:\n\n"
                f"{skill_blocks}"
            )

    if current_code:
        # Give the model the exact code it must edit rather than regenerate.
        code_block = (
            "Current code (you MUST modify this - do not start from scratch):\n"
            "<current_code>\n"
            f"{current_code}\n"
            "</current_code>\n\n"
        )
    else:
        code_block = ""

    if iteration_context:
        history = "\n".join(
            f"Previous prompt {i + 1}: {p}"
            for i, p in enumerate(iteration_context)
        )
        user_message = (
            f"{code_block}"
            f"Previous prompts for this screen:\n{history}\n\n"
            f"New instruction: {user_prompt}"
        )
    else:
        user_message = f"{code_block}{user_prompt}" if code_block else user_prompt

    return system, user_message


def assemble_surgical_prompt(
    framework: str,
    user_prompt: str,
    current_code: str,
    iteration_context: list[str] | None = None,
    active_skills: list[str] | None = None,
) -> tuple[str, str]:
    """Return (system, user) for surgical (edit-mode) iteration.

    The system prompt instructs the model to emit only SEARCH/REPLACE blocks.
    The framework name is noted so the model writes syntactically correct code.
    """
    system = SURGICAL_SYSTEM_PROMPT

    if active_skills:
        skill_blocks = "\n\n".join(
            f"<skill>\n{body.strip()}\n</skill>"
            for body in active_skills
            if body.strip()
        )
        if skill_blocks:
            system = (
                f"{system}\n\n"
                "## Active skill constraints (apply these to your edits):\n\n"
                f"{skill_blocks}"
            )

    code_block = (
        "Current code:\n"
        "<current_code>\n"
        f"{current_code}\n"
        "</current_code>\n\n"
    )

    if iteration_context:
        history = "\n".join(
            f"Previous edit {i + 1}: {p}"
            for i, p in enumerate(iteration_context[-5:])
        )
        user = f"{code_block}Edit history:\n{history}\n\nNew edit: {user_prompt}"
    else:
        user = f"{code_block}Edit instruction: {user_prompt}"

    return system, user
