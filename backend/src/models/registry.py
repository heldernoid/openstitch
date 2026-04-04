from __future__ import annotations

import httpx
import structlog
from pydantic import BaseModel

from ..config import config
from .anthropic import AnthropicAdapter
from .base import ModelAdapter
from .gemini import GeminiAdapter
from .ollama import OllamaAdapter
from .openai import OpenAIAdapter
from .openrouter import OpenRouterAdapter

logger: structlog.BoundLogger = structlog.get_logger()


class ModelInfo(BaseModel):
    slug: str
    provider: str
    name: str
    supports_vision: bool
    size_bytes: int | None = None


class ModelRegistry:
    def resolve(
        self,
        slug: str,
        key_overrides: dict[str, str] | None = None,
    ) -> ModelAdapter | None:
        """Parse 'provider:model-name' and return an adapter, or None if unavailable.

        key_overrides: keys from the DB settings table, checked before env-var defaults.
        """
        if ":" not in slug:
            return None
        provider, model = slug.split(":", 1)
        overrides = key_overrides or {}

        if provider == "ollama":
            return OllamaAdapter(model, config.ollama_base_url)

        if provider == "openai":
            key = overrides.get("openai_api_key") or config.openai_api_key
            if key:
                return OpenAIAdapter(model, key)

        if provider == "anthropic":
            key = overrides.get("anthropic_api_key") or config.anthropic_api_key
            if key:
                return AnthropicAdapter(model, key)

        if provider == "gemini":
            key = overrides.get("gemini_api_key") or config.gemini_api_key
            if key:
                return GeminiAdapter(model, key)

        if provider == "openrouter":
            key = overrides.get("openrouter_api_key") or config.openrouter_api_key
            if key:
                return OpenRouterAdapter(model, key)

        return None

    async def list_available(
        self,
        key_overrides: dict[str, str] | None = None,
    ) -> list[ModelInfo]:
        """Return all available models with capability flags.

        key_overrides: keys from the DB settings table.
        """
        overrides = key_overrides or {}
        models: list[ModelInfo] = []

        # Ollama: fetch from /api/tags
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(f"{config.ollama_base_url}/api/tags")
                if r.status_code == 200:
                    for m in r.json().get("models", []):
                        name: str = m["name"]
                        models.append(ModelInfo(
                            slug=f"ollama:{name}",
                            provider="ollama",
                            name=name,
                            supports_vision=any(
                                p in name for p in ("vl", "vision", "llava", "minicpm-v")
                            ),
                            size_bytes=m.get("size"),
                        ))
        except Exception:
            logger.warning("registry.ollama_unavailable", base_url=config.ollama_base_url)

        # Cloud providers: show if key in DB overrides or env vars
        openai_key = overrides.get("openai_api_key") or config.openai_api_key
        if openai_key:
            models += [
                ModelInfo(slug="openai:gpt-4o", provider="openai", name="gpt-4o", supports_vision=True),
                ModelInfo(slug="openai:gpt-4o-mini", provider="openai", name="gpt-4o-mini", supports_vision=True),
            ]

        anthropic_key = overrides.get("anthropic_api_key") or config.anthropic_api_key
        if anthropic_key:
            models += [
                ModelInfo(
                    slug="anthropic:claude-sonnet-4-6",
                    provider="anthropic",
                    name="claude-sonnet-4-6",
                    supports_vision=True,
                ),
            ]

        gemini_key = overrides.get("gemini_api_key") or config.gemini_api_key
        if gemini_key:
            models += [
                ModelInfo(
                    slug="gemini:gemini-2.5-pro",
                    provider="gemini",
                    name="gemini-2.5-pro",
                    supports_vision=True,
                ),
            ]

        openrouter_key = overrides.get("openrouter_api_key") or config.openrouter_api_key
        if openrouter_key:
            models += [
                ModelInfo(
                    slug="openrouter:anthropic/claude-sonnet-4-6",
                    provider="openrouter",
                    name="claude-sonnet-4-6 (OR)",
                    supports_vision=True,
                ),
                ModelInfo(
                    slug="openrouter:openai/gpt-4o",
                    provider="openrouter",
                    name="gpt-4o (OR)",
                    supports_vision=True,
                ),
                ModelInfo(
                    slug="openrouter:google/gemini-2.5-pro",
                    provider="openrouter",
                    name="gemini-2.5-pro (OR)",
                    supports_vision=True,
                ),
                ModelInfo(
                    slug="openrouter:qwen/qwen-2.5-coder-32b-instruct",
                    provider="openrouter",
                    name="qwen2.5-coder:32b (OR)",
                    supports_vision=False,
                ),
            ]

        return models


registry = ModelRegistry()
