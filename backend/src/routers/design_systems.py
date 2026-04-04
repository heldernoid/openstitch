"""Design systems endpoint — serves DESIGN.md files from design-systems/.

Directory layout (mounted at /app/design-systems):
  third-party/awesome-design-md/<name>/DESIGN.md   — bundled official designs
  user/<name>/DESIGN.md                            — user's own designs
"""
from __future__ import annotations

import re
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/design-systems")

_DESIGN_DIR = Path("/app/design-systems")

# Folders that are containers of designs, not designs themselves
_SKIP = {"third-party", "user"}


def _iter_designs() -> list[Path]:
    """Return all DESIGN.md parent directories, scanning up to two levels."""
    if not _DESIGN_DIR.exists():
        return []
    found: list[Path] = []
    for entry in sorted(_DESIGN_DIR.iterdir()):
        if not entry.is_dir():
            continue
        if entry.name in _SKIP:
            # One level deeper
            for sub in sorted(entry.iterdir()):
                if not sub.is_dir():
                    continue
                if entry.name == "third-party":
                    # third-party/<source>/<name>/DESIGN.md
                    for design in sorted(sub.iterdir()):
                        if design.is_dir() and (design / "DESIGN.md").exists():
                            found.append(design)
                else:
                    # user/<name>/DESIGN.md
                    if (sub / "DESIGN.md").exists():
                        found.append(sub)
        else:
            # Legacy flat layout: <name>/DESIGN.md
            if (entry / "DESIGN.md").exists():
                found.append(entry)
    return found


def _read_design_md(name: str) -> str:
    """Find and return DESIGN.md content for the given design name."""
    for design_dir in _iter_designs():
        if design_dir.name == name:
            return (design_dir / "DESIGN.md").read_text(encoding="utf-8")
    raise FileNotFoundError(name)


def _extract_preview_colors(design_md: str) -> list[str]:
    """Extract first 5 unique hex colors from a DESIGN.md."""
    colors = re.findall(r"#([0-9a-fA-F]{6})\b", design_md)
    seen: list[str] = []
    for c in colors:
        normalized = f"#{c.lower()}"
        if normalized not in seen:
            seen.append(normalized)
        if len(seen) >= 5:
            break
    return seen


def _extract_accent(design_md: str) -> str:
    """Extract the primary/accent color from a DESIGN.md.

    Looks for a 'primary' color line first, falls back to the first hex found.
    """
    # Try to find a line like: primary: #hex or "primary" "#hex"
    for pattern in [
        r'(?i)\bprimary\b[^\n#]*?(#[0-9a-fA-F]{6})\b',
        r'(?i)\baccent\b[^\n#]*?(#[0-9a-fA-F]{6})\b',
        r'(?i)\bbrand\b[^\n#]*?(#[0-9a-fA-F]{6})\b',
    ]:
        m = re.search(pattern, design_md)
        if m:
            return m.group(1).lower()
    # Fallback: first hex color in the file
    m = re.search(r"#([0-9a-fA-F]{6})\b", design_md)
    return f"#{m.group(1).lower()}" if m else "#888888"


def _label(name: str) -> str:
    return name.replace(".app", "").replace(".", " ").replace("-", " ").title()


@router.get("")
async def list_design_systems() -> list[dict]:
    """List all available design systems for the picker."""
    result = []
    for design_dir in _iter_designs():
        name = design_dir.name
        content = (design_dir / "DESIGN.md").read_text(encoding="utf-8")
        result.append({
            "name": name,
            "label": _label(name),
            "accent": _extract_accent(content),
        })
    return result


@router.get("/{name}")
async def get_design_system(name: str) -> dict:
    """Return full DESIGN.md content for a design system."""
    if not re.match(r"^[a-zA-Z0-9_.\-]+$", name):
        raise HTTPException(status_code=400, detail="Invalid name")
    try:
        content = _read_design_md(name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Design system '{name}' not found")
    return {
        "name": name,
        "label": _label(name),
        "accent": _extract_accent(content),
        "preview_colors": _extract_preview_colors(content),
        "content": content,
    }
