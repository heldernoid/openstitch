from __future__ import annotations

import base64
import json
from collections.abc import AsyncGenerator

import httpx
import structlog

from .base import ModelAdapter

logger: structlog.BoundLogger = structlog.get_logger()


class OpenAIAdapter(ModelAdapter):
    name = "openai"
    supports_vision = True

    def __init__(
        self,
        model: str,
        api_key: str,
        base_url: str = "https://api.openai.com/v1",
    ) -> None:
        self.model = model
        self.api_key = api_key
        self.base_url = base_url

    def _build_messages(
        self, system_prompt: str, user_prompt: str, image_bytes: bytes | None
    ) -> list[dict[str, object]]:
        messages: list[dict[str, object]] = [
            {"role": "system", "content": system_prompt}
        ]
        if image_bytes is not None:
            b64 = base64.b64encode(image_bytes).decode()
            messages.append({
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                    {"type": "text", "text": user_prompt},
                ],
            })
        else:
            messages.append({"role": "user", "content": user_prompt})
        return messages

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
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
                return r.status_code == 200
        except Exception:
            return False
