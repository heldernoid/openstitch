"""Tests for the planner prompt module."""
from __future__ import annotations

import pytest

from src.prompts.planner import PLANNER_SYSTEM_PROMPT, build_planner_user_prompt


def test_build_planner_user_prompt_includes_description() -> None:
    prompt = build_planner_user_prompt("A fitness tracking app", "## Color Palette\n- primary: #ff0000")
    assert "A fitness tracking app" in prompt


def test_build_planner_user_prompt_includes_design_md() -> None:
    design_md = "## Color Palette\n- primary: #abcdef\n- background: #ffffff"
    prompt = build_planner_user_prompt("A blog app", design_md)
    assert "#abcdef" in prompt
    assert "Color Palette" in prompt


def test_build_planner_user_prompt_truncates_design_md() -> None:
    long_design_md = "# Design\n" + "x" * 10000
    prompt = build_planner_user_prompt("An app", long_design_md)
    # design_md is truncated to 6000 chars
    x_count = prompt.count("x")
    assert x_count <= 6000


def test_planner_system_prompt_requests_json_output() -> None:
    assert "JSON" in PLANNER_SYSTEM_PROMPT


def test_planner_system_prompt_has_tailwind_config_schema() -> None:
    assert "tailwind_config" in PLANNER_SYSTEM_PROMPT


def test_planner_system_prompt_has_screens_schema() -> None:
    assert "screens" in PLANNER_SYSTEM_PROMPT
