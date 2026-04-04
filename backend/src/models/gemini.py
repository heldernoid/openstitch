from __future__ import annotations

import base64
import json
from collections.abc import AsyncGenerator

import httpx
import structlog

from .base import ModelAdapter

logger: structlog.BoundLogger = structlog.get_logger()

_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiAdapter(ModelAdapter):
    name = "gemini"
    supports_vision = True

    def __init__(self, model: str, api_key: str) -> None:
        self.model = model
        self.api_key = api_key

    async def stream_generate(
        self,
        system_prompt: str,
        user_prompt: str,
        image_bytes: bytes | None = None,
    ) -> AsyncGenerator[str, None]:
        if image_bytes is not None:
            b64 = base64.b64encode(image_bytes).decode()
            parts: list[dict[str, object]] = [
                {"inline_data": {"mime_type": "image/jpeg", "data": b64}},
                {"text": user_prompt},
            ]
        else:
            parts = [{"text": user_prompt}]

        payload: dict[str, object] = {
            "contents": [{"role": "user", "parts": parts}],
            "systemInstruction": {
                "role": "user",
                "parts": [{"text": system_prompt}],
            },
        }
        url = (
            f"{_API_BASE}/{self.model}:streamGenerateContent"
            f"?key={self.api_key}&alt=sse"
        )
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream("POST", url, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data_str = line[5:].strip()
                    if not data_str:
                        continue
                    try:
                        data = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue
                    candidates = data.get("candidates", [])
                    if candidates:
                        c_parts = candidates[0].get("content", {}).get("parts", [])
                        if c_parts:
                            if text := c_parts[0].get("text"):
                                yield text

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(
                    f"{_API_BASE}?key={self.api_key}"
                )
                return r.status_code == 200
        except Exception:
            return False
