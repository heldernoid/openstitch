"""Tests for generate_app router helper functions."""
from __future__ import annotations

import json

import pytest

from src.routers.generate_app import (
    _apply_design_shell,
    _build_head,
    _clean_plan_text,
    _extract_shell,
    _parse_plan,
)


# ── _parse_plan ────────────────────────────────────────────────────────────────

def test_parse_plan_new_format() -> None:
    data = {
        "app_name": "TestApp",
        "tailwind_config": {"colors": {"primary": "#ff0000"}},
        "google_fonts": "Inter:wght@400..700",
        "screens": [
            {"name": "Home", "prompt": "A home screen with hero section"},
            {"name": "About", "prompt": "An about page with team section"},
        ],
    }
    result = _parse_plan(json.dumps(data))
    assert result is not None
    assert result["app_name"] == "TestApp"
    assert result["tailwind_config"] == {"colors": {"primary": "#ff0000"}}
    assert result["google_fonts"] == "Inter:wght@400..700"
    assert len(result["screens"]) == 2
    assert result["screens"][0]["name"] == "Home"


def test_parse_plan_extracts_max_6_screens() -> None:
    screens = [{"name": f"Screen{i}", "prompt": f"Prompt {i}"} for i in range(8)]
    data = {
        "app_name": "BigApp",
        "tailwind_config": {},
        "google_fonts": "",
        "screens": screens,
    }
    result = _parse_plan(json.dumps(data))
    assert result is not None
    assert len(result["screens"]) == 6


def test_parse_plan_legacy_array_format() -> None:
    arr = [
        {"name": "X", "prompt": "Y"},
        {"name": "Z", "prompt": "W"},
    ]
    result = _parse_plan(json.dumps(arr))
    assert result is not None
    assert "screens" in result
    assert len(result["screens"]) == 2
    assert result["screens"][0]["name"] == "X"


def test_parse_plan_returns_none_on_garbage() -> None:
    result = _parse_plan("this is not json at all !!!")
    assert result is None


def test_parse_plan_returns_none_on_missing_screens() -> None:
    data = {"app_name": "NoScreens", "tailwind_config": {}}
    result = _parse_plan(json.dumps(data))
    assert result is None


def test_parse_plan_strips_think_tags() -> None:
    data = {
        "app_name": "ThinkApp",
        "tailwind_config": {},
        "google_fonts": "",
        "screens": [{"name": "Home", "prompt": "A home page"}],
    }
    raw = f"<think>Some reasoning here...</think>\n{json.dumps(data)}"
    result = _parse_plan(raw)
    assert result is not None
    assert result["app_name"] == "ThinkApp"


def test_parse_plan_strips_markdown_fences() -> None:
    data = {
        "app_name": "FencedApp",
        "tailwind_config": {},
        "google_fonts": "",
        "screens": [{"name": "Home", "prompt": "A home page"}],
    }
    raw = f"```json\n{json.dumps(data)}\n```"
    result = _parse_plan(raw)
    assert result is not None
    assert result["app_name"] == "FencedApp"


# ── _build_head ────────────────────────────────────────────────────────────────

def test_build_head_contains_tailwind_cdn() -> None:
    head = _build_head("TestApp", {}, "")
    assert "cdn.tailwindcss.com" in head


def test_build_head_contains_material_symbols() -> None:
    head = _build_head("TestApp", {}, "")
    assert "Material+Symbols+Outlined" in head or "Material Symbols" in head


def test_build_head_icon_css_has_vertical_align() -> None:
    head = _build_head("TestApp", {}, "")
    assert "vertical-align: middle" in head


def test_build_head_icon_css_has_line_height() -> None:
    head = _build_head("TestApp", {}, "")
    assert "line-height: 1" in head


def test_build_head_embeds_config_json() -> None:
    tailwind_config = {"colors": {"primary": "#abcdef"}}
    head = _build_head("TestApp", tailwind_config, "")
    assert "#abcdef" in head


def test_build_head_with_google_fonts() -> None:
    head = _build_head("TestApp", {}, "Inter:wght@400..700")
    assert "fonts.googleapis.com" in head
    assert "Inter" in head


def test_build_head_without_google_fonts() -> None:
    head = _build_head("TestApp", {}, "")
    # Material Symbols uses fonts.googleapis.com, but the custom fonts URL should not be present
    # Check that there's no family=Inter-style URL (only Material Symbols is fine)
    lines = head.splitlines()
    font_lines = [l for l in lines if "fonts.googleapis.com" in l and "Material" not in l]
    assert len(font_lines) == 0


# ── _apply_design_shell ────────────────────────────────────────────────────────

def test_apply_design_shell_replaces_existing_head() -> None:
    html = "<html><head><title>Old</title></head><body>content</body></html>"
    result = _apply_design_shell(html, "MyApp", {"colors": {"primary": "#111"}}, "")
    assert "<title>MyApp</title>" in result
    assert "<title>Old</title>" not in result
    assert "cdn.tailwindcss.com" in result


def test_apply_design_shell_injects_when_no_head() -> None:
    html = "<html lang='en'><body>just body</body></html>"
    result = _apply_design_shell(html, "MyApp", {}, "")
    assert "<head>" in result
    assert "cdn.tailwindcss.com" in result


def test_apply_design_shell_prepends_when_no_html() -> None:
    html = "<div>raw body content</div>"
    result = _apply_design_shell(html, "MyApp", {}, "")
    assert "<!DOCTYPE html>" in result
    assert "<html" in result
    assert "<head>" in result
    assert "cdn.tailwindcss.com" in result


# ── _extract_shell ─────────────────────────────────────────────────────────────

def test_extract_shell_finds_nav() -> None:
    html = "<html><body><nav class='main-nav'><a href='/'>Home</a></nav><main>content</main></body></html>"
    nav, footer = _extract_shell(html)
    assert "<nav" in nav
    assert "Home" in nav
    assert footer == ""


def test_extract_shell_finds_footer() -> None:
    html = "<html><body><main>content</main><footer class='site-footer'><p>Copyright 2024</p></footer></body></html>"
    nav, footer = _extract_shell(html)
    assert nav == ""
    assert "<footer" in footer
    assert "Copyright" in footer


def test_extract_shell_returns_empty_when_missing() -> None:
    html = "<html><body><main>no nav or footer here</main></body></html>"
    nav, footer = _extract_shell(html)
    assert nav == ""
    assert footer == ""


def test_html_tailwind_prompt_warns_about_brand_icons() -> None:
    from src.prompts.html_tailwind import SYSTEM_PROMPT
    assert "facebook" in SYSTEM_PROMPT.lower()
    assert "instagram" in SYSTEM_PROMPT.lower()
    assert "NOT" in SYSTEM_PROMPT or "not" in SYSTEM_PROMPT.lower()


def test_html_tailwind_prompt_provides_social_svg_alternatives() -> None:
    from src.prompts.html_tailwind import SYSTEM_PROMPT
    # Must provide ready-to-paste SVG for common social icons
    assert "<svg" in SYSTEM_PROMPT
    assert "Facebook" in SYSTEM_PROMPT
    assert "Instagram" in SYSTEM_PROMPT
    assert "LinkedIn" in SYSTEM_PROMPT


def test_html_tailwind_prompt_requires_size_class_on_icons() -> None:
    from src.prompts.html_tailwind import SYSTEM_PROMPT
    assert "text-[20px]" in SYSTEM_PROMPT or "size class" in SYSTEM_PROMPT.lower() or "explicit" in SYSTEM_PROMPT.lower()


def test_html_tailwind_prompt_forbids_guessing_icon_names() -> None:
    from src.prompts.html_tailwind import SYSTEM_PROMPT
    # Must warn against inventing/guessing icon names not in the list
    assert "guess" in SYSTEM_PROMPT.lower() or "invent" in SYSTEM_PROMPT.lower() or "verified list" in SYSTEM_PROMPT.lower()


def test_html_tailwind_prompt_forbids_undefined_css_classes() -> None:
    from src.prompts.html_tailwind import SYSTEM_PROMPT
    # Must warn against custom/undefined CSS class names
    assert "hero-bg" in SYSTEM_PROMPT or "undefined" in SYSTEM_PROMPT.lower() or "custom class" in SYSTEM_PROMPT.lower()
    assert "NEVER" in SYSTEM_PROMPT or "never" in SYSTEM_PROMPT.lower()


def test_html_tailwind_prompt_requires_content_density() -> None:
    from src.prompts.html_tailwind import SYSTEM_PROMPT
    # Must require multiple sections and content density
    assert "5" in SYSTEM_PROMPT and "section" in SYSTEM_PROMPT.lower()
    assert "300" in SYSTEM_PROMPT or "dense" in SYSTEM_PROMPT.lower() or "rich" in SYSTEM_PROMPT.lower()


def test_planner_requires_detailed_screen_prompts() -> None:
    from src.prompts.planner import PLANNER_SYSTEM_PROMPT
    # Must require detailed section descriptions, not sparse prompts
    assert "5" in PLANNER_SYSTEM_PROMPT and "section" in PLANNER_SYSTEM_PROMPT.lower()
    assert "300" in PLANNER_SYSTEM_PROMPT or "detail" in PLANNER_SYSTEM_PROMPT.lower()
    assert "sparse" in PLANNER_SYSTEM_PROMPT.lower() or "NOT" in PLANNER_SYSTEM_PROMPT
