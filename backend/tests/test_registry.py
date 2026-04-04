"""Tests for model registry slug parsing and adapter resolution."""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from src.models.ollama import OllamaAdapter
from src.models.openai import OpenAIAdapter
from src.models.anthropic import AnthropicAdapter
from src.models.gemini import GeminiAdapter
from src.models.openrouter import OpenRouterAdapter
from src.models.registry import ModelRegistry


def _registry_with_keys(**kwargs: str) -> tuple[ModelRegistry, object]:
    """Return a registry and a mock config with the given key values."""
    defaults = {
        "ollama_base_url": "http://localhost:11434",
        "openai_api_key": "",
        "anthropic_api_key": "",
        "gemini_api_key": "",
        "openrouter_api_key": "",
    }
    defaults.update(kwargs)
    return ModelRegistry(), defaults


# ---------------------------------------------------------------------------
# Slug parsing
# ---------------------------------------------------------------------------

def test_resolve_ollama_simple() -> None:
    r, cfg = _registry_with_keys()
    with patch("src.models.registry.config") as mock_cfg:
        for k, v in cfg.items():
            setattr(mock_cfg, k, v)
        adapter = r.resolve("ollama:qwen2.5-coder:32b")
    assert isinstance(adapter, OllamaAdapter)
    assert adapter.model == "qwen2.5-coder:32b"


def test_resolve_ollama_7b() -> None:
    r, cfg = _registry_with_keys()
    with patch("src.models.registry.config") as mock_cfg:
        for k, v in cfg.items():
            setattr(mock_cfg, k, v)
        adapter = r.resolve("ollama:qwen2.5-coder:7b")
    assert isinstance(adapter, OllamaAdapter)
    assert adapter.model == "qwen2.5-coder:7b"


def test_resolve_openai_with_key() -> None:
    r, cfg = _registry_with_keys(openai_api_key="sk-test")
    with patch("src.models.registry.config") as mock_cfg:
        for k, v in cfg.items():
            setattr(mock_cfg, k, v)
        adapter = r.resolve("openai:gpt-4o")
    assert isinstance(adapter, OpenAIAdapter)
    assert adapter.model == "gpt-4o"


def test_resolve_openai_no_key_returns_none() -> None:
    r, cfg = _registry_with_keys(openai_api_key="")
    with patch("src.models.registry.config") as mock_cfg:
        for k, v in cfg.items():
            setattr(mock_cfg, k, v)
        adapter = r.resolve("openai:gpt-4o")
    assert adapter is None


def test_resolve_anthropic_with_key() -> None:
    r, cfg = _registry_with_keys(anthropic_api_key="sk-ant-test")
    with patch("src.models.registry.config") as mock_cfg:
        for k, v in cfg.items():
            setattr(mock_cfg, k, v)
        adapter = r.resolve("anthropic:claude-sonnet-4-6")
    assert isinstance(adapter, AnthropicAdapter)


def test_resolve_gemini_with_key() -> None:
    r, cfg = _registry_with_keys(gemini_api_key="AIza-test")
    with patch("src.models.registry.config") as mock_cfg:
        for k, v in cfg.items():
            setattr(mock_cfg, k, v)
        adapter = r.resolve("gemini:gemini-2.5-pro")
    assert isinstance(adapter, GeminiAdapter)


def test_resolve_openrouter_with_key() -> None:
    r, cfg = _registry_with_keys(openrouter_api_key="sk-or-test")
    with patch("src.models.registry.config") as mock_cfg:
        for k, v in cfg.items():
            setattr(mock_cfg, k, v)
        adapter = r.resolve("openrouter:anthropic/claude-sonnet-4-6")
    assert isinstance(adapter, OpenRouterAdapter)
    assert adapter.model == "anthropic/claude-sonnet-4-6"


def test_resolve_unknown_provider_returns_none() -> None:
    r = ModelRegistry()
    adapter = r.resolve("unknown:some-model")
    assert adapter is None


def test_resolve_no_colon_returns_none() -> None:
    r = ModelRegistry()
    adapter = r.resolve("badslug")
    assert adapter is None


# ---------------------------------------------------------------------------
# list_available
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_available_includes_ollama_models() -> None:
    ollama_response = {
        "models": [
            {"name": "qwen2.5-coder:32b", "size": 19900000000},
            {"name": "qwen2.5vl:7b", "size": 5900000000},
        ]
    }
    mock_resp = AsyncMock()
    mock_resp.status_code = 200
    mock_resp.json = lambda: ollama_response

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    client_cm = AsyncMock()
    client_cm.__aenter__ = AsyncMock(return_value=mock_client)
    client_cm.__aexit__ = AsyncMock(return_value=False)

    with patch("src.models.registry.httpx.AsyncClient", return_value=client_cm):
        with patch("src.models.registry.config") as mock_cfg:
            mock_cfg.ollama_base_url = "http://localhost:11434"
            mock_cfg.openai_api_key = ""
            mock_cfg.anthropic_api_key = ""
            mock_cfg.gemini_api_key = ""
            mock_cfg.openrouter_api_key = ""

            r = ModelRegistry()
            models = await r.list_available()

    slugs = [m.slug for m in models]
    assert "ollama:qwen2.5-coder:32b" in slugs
    assert "ollama:qwen2.5vl:7b" in slugs

    vl_model = next(m for m in models if "vl" in m.name)
    assert vl_model.supports_vision is True

    text_model = next(m for m in models if "coder" in m.name)
    assert text_model.supports_vision is False


@pytest.mark.asyncio
async def test_list_available_ollama_unreachable_returns_empty() -> None:
    client_cm = AsyncMock()
    client_cm.__aenter__ = AsyncMock(side_effect=Exception("connection refused"))

    with patch("src.models.registry.httpx.AsyncClient", return_value=client_cm):
        with patch("src.models.registry.config") as mock_cfg:
            mock_cfg.ollama_base_url = "http://localhost:11434"
            mock_cfg.openai_api_key = ""
            mock_cfg.anthropic_api_key = ""
            mock_cfg.gemini_api_key = ""
            mock_cfg.openrouter_api_key = ""

            r = ModelRegistry()
            models = await r.list_available()

    assert models == []


@pytest.mark.asyncio
async def test_list_available_includes_openrouter_when_key_set() -> None:
    mock_resp = AsyncMock()
    mock_resp.status_code = 200
    mock_resp.json = lambda: {"models": []}

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    client_cm = AsyncMock()
    client_cm.__aenter__ = AsyncMock(return_value=mock_client)
    client_cm.__aexit__ = AsyncMock(return_value=False)

    with patch("src.models.registry.httpx.AsyncClient", return_value=client_cm):
        with patch("src.models.registry.config") as mock_cfg:
            mock_cfg.ollama_base_url = "http://localhost:11434"
            mock_cfg.openai_api_key = ""
            mock_cfg.anthropic_api_key = ""
            mock_cfg.gemini_api_key = ""
            mock_cfg.openrouter_api_key = "sk-or-test"

            r = ModelRegistry()
            models = await r.list_available()

    providers = {m.provider for m in models}
    assert "openrouter" in providers
