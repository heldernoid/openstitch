"""Tests for the prompt assembly system."""
from __future__ import annotations

import pytest

from src.prompts.base import (
    FRAMEWORK_PROMPTS,
    VALID_FRAMEWORKS,
    assemble_prompt,
)
from src.prompts.html_tailwind import SYSTEM_PROMPT as HTML_TW
from src.prompts.react_tailwind import SYSTEM_PROMPT as REACT_TW
from src.prompts.vue_tailwind import SYSTEM_PROMPT as VUE_TW
from src.prompts.html_css import SYSTEM_PROMPT as HTML_CSS


# ---------------------------------------------------------------------------
# Framework registry
# ---------------------------------------------------------------------------

def test_all_four_frameworks_registered() -> None:
    assert VALID_FRAMEWORKS == {"html_tailwind", "react_tailwind", "vue_tailwind", "html_css"}


def test_framework_prompts_map_matches_valid_frameworks() -> None:
    assert set(FRAMEWORK_PROMPTS.keys()) == VALID_FRAMEWORKS


# ---------------------------------------------------------------------------
# assemble_prompt - no iteration context
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("framework", ["html_tailwind", "react_tailwind", "vue_tailwind", "html_css"])
def test_assemble_returns_correct_system_prompt(framework: str) -> None:
    system, user = assemble_prompt(framework, "a login page", None)
    assert system == FRAMEWORK_PROMPTS[framework]


@pytest.mark.parametrize("framework", ["html_tailwind", "react_tailwind", "vue_tailwind", "html_css"])
def test_assemble_no_context_returns_user_prompt_unchanged(framework: str) -> None:
    system, user = assemble_prompt(framework, "a dashboard", None)
    assert user == "a dashboard"


def test_assemble_empty_context_list_returns_user_prompt_unchanged() -> None:
    # empty list is falsy - treated same as None
    _, user = assemble_prompt("html_tailwind", "a settings page", [])
    assert user == "a settings page"


# ---------------------------------------------------------------------------
# assemble_prompt - with iteration context
# ---------------------------------------------------------------------------

def test_assemble_with_context_includes_history() -> None:
    _, user = assemble_prompt(
        "react_tailwind",
        "make the button blue",
        ["a login page"],
    )
    assert "Previous prompt 1: a login page" in user
    assert "New instruction: make the button blue" in user


def test_assemble_with_multiple_context_entries() -> None:
    ctx = ["a login page", "add a forgot password link", "center the form"]
    _, user = assemble_prompt("html_tailwind", "use a dark background", ctx)
    assert "Previous prompt 1: a login page" in user
    assert "Previous prompt 2: add a forgot password link" in user
    assert "Previous prompt 3: center the form" in user
    assert "New instruction: use a dark background" in user


def test_assemble_context_ordering() -> None:
    ctx = ["first", "second"]
    _, user = assemble_prompt("html_css", "third instruction", ctx)
    # history block must appear before the new instruction
    history_pos = user.index("Previous prompts for this screen:")
    new_pos = user.index("New instruction:")
    assert history_pos < new_pos


# ---------------------------------------------------------------------------
# System prompt content validation
# ---------------------------------------------------------------------------

def test_html_tailwind_prompt_requires_no_markdown_fences() -> None:
    assert "No markdown fences" in HTML_TW or "no markdown" in HTML_TW.lower()


def test_html_tailwind_prompt_mentions_tailwind_cdn() -> None:
    assert "cdn.tailwindcss.com" in HTML_TW


def test_react_tailwind_prompt_prohibits_imports() -> None:
    assert "import" in REACT_TW.lower()
    # The rule forbids imports - check the prohibition is present
    assert "Do NOT write import" in REACT_TW or "no imports" in REACT_TW.lower()


def test_react_tailwind_prompt_mentions_default_export() -> None:
    assert "export default" in REACT_TW


def test_vue_tailwind_prompt_mentions_sfc() -> None:
    assert "<template>" in VUE_TW


def test_html_css_prompt_prohibits_tailwind() -> None:
    assert "no Tailwind" in HTML_CSS or "No Tailwind" in HTML_CSS


def test_html_css_prompt_requires_style_block() -> None:
    assert "<style>" in HTML_CSS


def test_all_prompts_prohibit_external_images() -> None:
    for name, prompt in FRAMEWORK_PROMPTS.items():
        assert "external" in prompt.lower() or "placeholder" in prompt.lower(), (
            f"{name} prompt does not mention external images / placeholders"
        )


# ---------------------------------------------------------------------------
# assemble_prompt - with current_code (iteration editing)
# ---------------------------------------------------------------------------

def test_current_code_block_present_when_provided() -> None:
    code = "<div>hello</div>"
    _, user = assemble_prompt("html_tailwind", "make it blue", None, current_code=code)
    assert "<current_code>" in user
    assert "</current_code>" in user
    assert code in user


def test_current_code_absent_when_none() -> None:
    _, user = assemble_prompt("html_tailwind", "a login page", None, current_code=None)
    assert "<current_code>" not in user
    assert "current_code" not in user


def test_current_code_absent_when_not_passed() -> None:
    _, user = assemble_prompt("html_tailwind", "a settings page", None)
    assert "<current_code>" not in user


def test_current_code_appears_before_instruction() -> None:
    code = "existing code"
    _, user = assemble_prompt("react_tailwind", "add a footer", None, current_code=code)
    code_pos = user.index("<current_code>")
    instruction_pos = user.index("add a footer")
    assert code_pos < instruction_pos


def test_current_code_with_iteration_context() -> None:
    code = "<button>Submit</button>"
    ctx = ["a login form"]
    _, user = assemble_prompt("html_tailwind", "make button blue", ctx, current_code=code)
    assert "<current_code>" in user
    assert code in user
    assert "Previous prompt 1: a login form" in user
    assert "New instruction: make button blue" in user
    # code block must come before history
    assert user.index("<current_code>") < user.index("Previous prompt")
