from __future__ import annotations

import base64
import json
from collections.abc import AsyncGenerator

import httpx
import structlog

from .base import ModelAdapter

logger: structlog.BoundLogger = structlog.get_logger()

_VISION_PATTERNS = ("vl", "vision", "llava", "minicpm-v")


class OllamaAdapter(ModelAdapter):
    name = "ollama"

    def __init__(self, model: str, base_url: str) -> None:
        self.model = model
        self.base_url = base_url
        self.supports_vision = any(p in model for p in _VISION_PATTERNS)

    async def stream_generate(
        self,
        system_prompt: str,
        user_prompt: str,
        image_bytes: bytes | None = None,
    ) -> AsyncGenerator[str, None]:
        payload: dict[str, object] = {
            "model": self.model,
            "prompt": user_prompt,
            "system": system_prompt,
            "stream": True,
        }
        if image_bytes is not None:
            payload["images"] = [base64.b64encode(image_bytes).decode()]

        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/api/generate",
                json=payload,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    data = json.loads(line)
                    if token := data.get("response"):
                        yield token
                    if data.get("done"):
                        break

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(f"{self.base_url}/api/tags")
                return r.status_code == 200
        except Exception:
            return False
