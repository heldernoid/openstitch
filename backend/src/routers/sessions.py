"""Session log endpoint (generation history per project)."""
from __future__ import annotations

# Sessions are exposed under /api/projects/{id}/sessions - that route lives in
# projects.py to keep the prefix grouping clean.  This module is a placeholder
# so the import in main.py can remain consistent across all router modules.

from fastapi import APIRouter

router = APIRouter(tags=["sessions"])
