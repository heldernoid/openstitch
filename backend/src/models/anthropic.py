from __future__ import annotations

import base64
import json
from collections.abc import AsyncGenerator

import httpx
import structlog

from .base import ModelAdapter

logger: structlog.BoundLogger = structlog.get_logger()

_API_BASE = "https://api.anthropic.com/v1"
_ANTHROPIC_VERSION = "2023-06-01"


class AnthropicAdapter(ModelAdapter):
    name = "anthropic"
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
            content: list[dict[str, object]] = [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": b64,
                    },
                },
                {"type": "text", "text": user_prompt},
            ]
        else:
            content = [{"type": "text", "text": user_prompt}]

        payload: dict[str, object] = {
            "model": self.model,
            "max_tokens": 8192,
            "system": system_prompt,
            "messages": [{"role": "user", "content": content}],
            "stream": True,
        }
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": _ANTHROPIC_VERSION,
            "content-type": "application/json",
        }
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream(
                "POST",
                f"{_API_BASE}/messages",
                headers=headers,
                json=payload,
            ) as response:
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
                    if data.get("type") == "content_block_delta":
                        delta = data.get("delta", {})
                        if delta.get("type") == "text_delta":
                            if text := delta.get("text"):
                                yield text
                    elif data.get("type") == "message_stop":
                        break

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(
                    f"{_API_BASE}/models",
                    headers={
                        "x-api-key": self.api_key,
                        "anthropic-version": _ANTHROPIC_VERSION,
                    },
                )
                return r.status_code == 200
        except Exception:
            return False
