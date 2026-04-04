"""Tests for the design_doc prompt module."""
from __future__ import annotations

import pytest

from src.prompts.design_doc import DESIGN_DOC_SYSTEM_PROMPT, build_design_doc_prompt


def test_build_design_doc_prompt_no_reference() -> None:
    prompt = build_design_doc_prompt("A task management app for teams")
    assert "A task management app for teams" in prompt
    assert "Adapt" not in prompt


def test_build_design_doc_prompt_with_reference() -> None:
    reference = "# My Reference Design\n\n## Color Palette\n- primary: #ff0000"
    prompt = build_design_doc_prompt("A recipe app", reference_design_md=reference)
    assert "Adapt" in prompt
    assert "A recipe app" in prompt
    assert "#ff0000" in prompt


def test_build_design_doc_prompt_truncates_reference() -> None:
    long_reference = "x" * 10000
    prompt = build_design_doc_prompt("An e-commerce app", reference_design_md=long_reference)
    # Reference should be truncated to 8000 chars
    # The long_reference content in the prompt should not exceed 8000 of the x's
    x_count = prompt.count("x")
    assert x_count <= 8000


def test_design_doc_system_prompt_mentions_all_sections() -> None:
    prompt = DESIGN_DOC_SYSTEM_PROMPT
    assert "Visual Theme" in prompt
    assert "Color Palette" in prompt
    assert "Typography" in prompt
    assert "Component" in prompt
    assert "Layout" in prompt
    assert "Elevation" in prompt or "Depth" in prompt
    assert "Do" in prompt  # covers "Do's and Don'ts"
    assert "Responsive" in prompt
    assert "Agent Prompt" in prompt


def test_build_design_doc_prompt_includes_app_description() -> None:
    description = "A unique pet adoption platform"
    prompt = build_design_doc_prompt(description)
    assert description in prompt
