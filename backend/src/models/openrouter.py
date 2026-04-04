from __future__ import annotations

import json
from collections.abc import AsyncGenerator

import httpx
import structlog

from .openai import OpenAIAdapter

logger: structlog.BoundLogger = structlog.get_logger()

_OPENROUTER_BASE = "https://openrouter.ai/api/v1"
_REFERER = "http://localhost:3000"
_APP_TITLE = "OpenStitch"


class OpenRouterAdapter(OpenAIAdapter):
    name = "openrouter"
    supports_vision = True  # conservative default - most flagship models support vision

    def __init__(self, model: str, api_key: str) -> None:
        super().__init__(model, api_key, base_url=_OPENROUTER_BASE)

    async def stream_generate(
        self,
        system_prompt: str,
        user_prompt: str,
        image_bytes: bytes | None = None,
    ) -> AsyncGenerator[str, None]:
        messages = self._build_messages(system_prompt, user_prompt, image_bytes)
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": _REFERER,
            "X-Title": _APP_TITLE,
        }
        payload: dict[str, object] = {
            "model": self.model,
            "messages": messages,
            "stream": True,
        }
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data_str = line[5:].strip()
                    if data_str == "[DONE]":
                        break
                    if not data_str:
                        continue
                    chunk = json.loads(data_str)
                    choices = chunk.get("choices", [])
                    if choices:
                        delta = choices[0].get("delta", {})
                        if content := delta.get("content"):
                            yield content

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(
                    f"{self.base_url}/models",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "HTTP-Referer": _REFERER,
                        "X-Title": _APP_TITLE,
                    },
                )
                return r.status_code == 200
        except Exception:
            return False
