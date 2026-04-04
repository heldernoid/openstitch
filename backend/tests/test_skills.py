"""Tests for skill YAML files in src/skills/."""
from __future__ import annotations

from pathlib import Path

import pytest
import yaml

SKILLS_DIR = Path(__file__).parent.parent / "src" / "skills"


def test_design_style_skills_removed() -> None:
    removed = [
        "brutalism.yaml",
        "claymorphism.yaml",
        "darkmode.yaml",
        "glass.yaml",
        "material3.yaml",
        "shadcn.yaml",
    ]
    for filename in removed:
        assert not (SKILLS_DIR / filename).exists(), (
            f"{filename} should have been removed but still exists"
        )


def test_functional_skills_present() -> None:
    required = [
        "a11y.yaml",
        "placeholder-images.yaml",
        "responsive.yaml",
        "admin-dashboard.yaml",
        "auth-flows.yaml",
        "data-visualization.yaml",
    ]
    for filename in required:
        assert (SKILLS_DIR / filename).exists(), (
            f"{filename} should exist but was not found"
        )


def test_all_remaining_skills_are_valid_yaml() -> None:
    yaml_files = list(SKILLS_DIR.glob("*.yaml"))
    assert len(yaml_files) > 0, "No YAML files found in skills directory"
    for path in yaml_files:
        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
        assert isinstance(data, dict), f"{path.name} should parse to a dict"
        assert "name" in data, f"{path.name} missing 'name' field"
        assert "description" in data, f"{path.name} missing 'description' field"
        assert "instructions" in data, f"{path.name} missing 'instructions' field"


def test_no_react_specific_skills() -> None:
    assert not (SKILLS_DIR / "shadcn.yaml").exists(), (
        "shadcn.yaml is React-specific and should not exist"
    )


def test_no_duplicate_design_systems() -> None:
    # These bring their own design systems and should have been removed
    for filename in ["bootstrap-5.yaml", "daisyui.yaml", "flowbite.yaml"]:
        assert not (SKILLS_DIR / filename).exists(), (
            f"{filename} brings its own design system and should have been removed"
        )
