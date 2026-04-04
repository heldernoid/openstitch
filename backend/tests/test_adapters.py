"""Tests for model adapters - uses mocked HTTP, no live network required."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest

from src.models.ollama import OllamaAdapter
from src.models.openai import OpenAIAdapter
from src.models.anthropic import AnthropicAdapter
from src.models.gemini import GeminiAdapter
from src.models.openrouter import OpenRouterAdapter


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_stream_cm(lines: list[str]) -> AsyncMock:
    """Return a mocked httpx stream context manager that yields the given lines."""

    async def _aiter_lines() -> AsyncMock:  # type: ignore[return]
        for line in lines:
            yield line

    mock_response = AsyncMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.aiter_lines = _aiter_lines

    stream_cm = AsyncMock()
    stream_cm.__aenter__ = AsyncMock(return_value=mock_response)
    stream_cm.__aexit__ = AsyncMock(return_value=False)
    return stream_cm


def _make_client_cm(stream_cm: AsyncMock) -> AsyncMock:
    """Wrap a stream CM in an httpx.AsyncClient context manager mock.

    client.stream(...) is called synchronously (not awaited) and returns
    an async context manager, so mock_client must be a MagicMock, not AsyncMock.
    """
    mock_client = MagicMock()
    mock_client.stream.return_value = stream_cm

    client_cm = AsyncMock()
    client_cm.__aenter__ = AsyncMock(return_value=mock_client)
    client_cm.__aexit__ = AsyncMock(return_value=False)
    return client_cm


# ---------------------------------------------------------------------------
# OllamaAdapter
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ollama_stream_tokens() -> None:
    lines = [
        '{"response": "Hello", "done": false}',
        '{"response": " World", "done": false}',
        '{"response": "", "done": true}',
    ]
    stream_cm = _make_stream_cm(lines)
    client_cm = _make_client_cm(stream_cm)

    with patch("src.models.ollama.httpx.AsyncClient", return_value=client_cm):
        adapter = OllamaAdapter("qwen2.5-coder:7b", "http://localhost:11434")
        tokens: list[str] = []
        async for token in adapter.stream_generate("system", "user"):
            tokens.append(token)

    assert tokens == ["Hello", " World"]


@pytest.mark.asyncio
async def test_ollama_health_check_pass() -> None:
    mock_response = AsyncMock()
    mock_response.status_code = 200

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_response)

    client_cm = AsyncMock()
    client_cm.__aenter__ = AsyncMock(return_value=mock_client)
    client_cm.__aexit__ = AsyncMock(return_value=False)

    with patch("src.models.ollama.httpx.AsyncClient", return_value=client_cm):
        adapter = OllamaAdapter("test-model", "http://localhost:11434")
        result = await adapter.health_check()

    assert result is True


@pytest.mark.asyncio
async def test_ollama_health_check_fail() -> None:
    client_cm = AsyncMock()
    client_cm.__aenter__ = AsyncMock(side_effect=Exception("connection refused"))

    with patch("src.models.ollama.httpx.AsyncClient", return_value=client_cm):
        adapter = OllamaAdapter("test-model", "http://localhost:11434")
        result = await adapter.health_check()

    assert result is False


@pytest.mark.asyncio
async def test_ollama_vision_flag() -> None:
    adapter_vl = OllamaAdapter("qwen2.5vl:7b", "http://localhost:11434")
    adapter_text = OllamaAdapter("qwen2.5-coder:32b", "http://localhost:11434")
    adapter_llava = OllamaAdapter("llava:34b", "http://localhost:11434")

    assert adapter_vl.supports_vision is True
    assert adapter_text.supports_vision is False
    assert adapter_llava.supports_vision is True


@pytest.mark.asyncio
async def test_ollama_stream_with_image() -> None:
    lines = ['{"response": "UI code", "done": true}']
    stream_cm = _make_stream_cm(lines)
    mock_client = MagicMock()
    mock_client.stream.return_value = stream_cm
    client_cm = AsyncMock()
    client_cm.__aenter__ = AsyncMock(return_value=mock_client)
    client_cm.__aexit__ = AsyncMock(return_value=False)

    with patch("src.models.ollama.httpx.AsyncClient", return_value=client_cm):
        adapter = OllamaAdapter("qwen2.5vl:7b", "http://localhost:11434")
        tokens: list[str] = []
        async for token in adapter.stream_generate("system", "user", b"fake-image-bytes"):
            tokens.append(token)

    # Verify image was passed in the payload
    call_kwargs = mock_client.stream.call_args.kwargs
    assert "images" in call_kwargs["json"]
    assert tokens == ["UI code"]


# ---------------------------------------------------------------------------
# OpenAIAdapter - skip when no key
# ---------------------------------------------------------------------------

def test_openai_skip_without_key() -> None:
    """OpenAI adapter should not be instantiated when no key is set."""
    from src.models.registry import ModelRegistry
    from unittest.mock import patch as _patch

    r = ModelRegistry()
    with _patch("src.models.registry.config") as mock_cfg:
        mock_cfg.openai_api_key = ""
        mock_cfg.anthropic_api_key = ""
        mock_cfg.gemini_api_key = ""
        mock_cfg.openrouter_api_key = ""
        mock_cfg.ollama_base_url = "http://localhost:11434"
        adapter = r.resolve("openai:gpt-4o")
    assert adapter is None


def test_anthropic_skip_without_key() -> None:
    from src.models.registry import ModelRegistry
    from unittest.mock import patch as _patch

    r = ModelRegistry()
    with _patch("src.models.registry.config") as mock_cfg:
        mock_cfg.openai_api_key = ""
        mock_cfg.anthropic_api_key = ""
        mock_cfg.gemini_api_key = ""
        mock_cfg.openrouter_api_key = ""
        mock_cfg.ollama_base_url = "http://localhost:11434"
        adapter = r.resolve("anthropic:claude-sonnet-4-6")
    assert adapter is None


def test_gemini_skip_without_key() -> None:
    from src.models.registry import ModelRegistry
    from unittest.mock import patch as _patch

    r = ModelRegistry()
    with _patch("src.models.registry.config") as mock_cfg:
        mock_cfg.openai_api_key = ""
        mock_cfg.anthropic_api_key = ""
        mock_cfg.gemini_api_key = ""
        mock_cfg.openrouter_api_key = ""
        mock_cfg.ollama_base_url = "http://localhost:11434"
        adapter = r.resolve("gemini:gemini-2.5-pro")
    assert adapter is None


def test_openrouter_skip_without_key() -> None:
    from src.models.registry import ModelRegistry
    from unittest.mock import patch as _patch

    r = ModelRegistry()
    with _patch("src.models.registry.config") as mock_cfg:
        mock_cfg.openai_api_key = ""
        mock_cfg.anthropic_api_key = ""
        mock_cfg.gemini_api_key = ""
        mock_cfg.openrouter_api_key = ""
        mock_cfg.ollama_base_url = "http://localhost:11434"
        adapter = r.resolve("openrouter:anthropic/claude-sonnet-4-6")
    assert adapter is None


# ---------------------------------------------------------------------------
# OpenAI streaming
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_openai_stream_tokens() -> None:
    lines = [
        'data: {"choices": [{"delta": {"content": "Hello"}}]}',
        'data: {"choices": [{"delta": {"content": " World"}}]}',
        "data: [DONE]",
    ]
    stream_cm = _make_stream_cm(lines)
    client_cm = _make_client_cm(stream_cm)

    with patch("src.models.openai.httpx.AsyncClient", return_value=client_cm):
        adapter = OpenAIAdapter("gpt-4o", "test-key")
        tokens: list[str] = []
        async for token in adapter.stream_generate("system", "user"):
            tokens.append(token)

    assert tokens == ["Hello", " World"]


# ---------------------------------------------------------------------------
# Anthropic streaming
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_anthropic_stream_tokens() -> None:
    lines = [
        'data: {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Hi"}}',
        'data: {"type": "content_block_delta", "delta": {"type": "text_delta", "text": " there"}}',
        'data: {"type": "message_stop"}',
    ]
    stream_cm = _make_stream_cm(lines)
    client_cm = _make_client_cm(stream_cm)

    with patch("src.models.anthropic.httpx.AsyncClient", return_value=client_cm):
        adapter = AnthropicAdapter("claude-sonnet-4-6", "test-key")
        tokens: list[str] = []
        async for token in adapter.stream_generate("system", "user"):
            tokens.append(token)

    assert tokens == ["Hi", " there"]


# ---------------------------------------------------------------------------
# Gemini streaming
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_gemini_stream_tokens() -> None:
    lines = [
        'data: {"candidates": [{"content": {"parts": [{"text": "Foo"}]}}]}',
        'data: {"candidates": [{"content": {"parts": [{"text": " Bar"}]}}]}',
    ]
    stream_cm = _make_stream_cm(lines)
    client_cm = _make_client_cm(stream_cm)

    with patch("src.models.gemini.httpx.AsyncClient", return_value=client_cm):
        adapter = GeminiAdapter("gemini-2.5-pro", "test-key")
        tokens: list[str] = []
        async for token in adapter.stream_generate("system", "user"):
            tokens.append(token)

    assert tokens == ["Foo", " Bar"]


# ---------------------------------------------------------------------------
# OpenRouter streaming
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_openrouter_stream_tokens() -> None:
    lines = [
        'data: {"choices": [{"delta": {"content": "Token"}}]}',
        "data: [DONE]",
    ]
    stream_cm = _make_stream_cm(lines)
    client_cm = _make_client_cm(stream_cm)

    with patch("src.models.openrouter.httpx.AsyncClient", return_value=client_cm):
        adapter = OpenRouterAdapter("anthropic/claude-sonnet-4-6", "test-key")
        tokens: list[str] = []
        async for token in adapter.stream_generate("system", "user"):
            tokens.append(token)

    assert tokens == ["Token"]


@pytest.mark.asyncio
async def test_openrouter_includes_required_headers() -> None:
    """OpenRouter requests must include HTTP-Referer and X-Title headers."""
    lines = ["data: [DONE]"]
    stream_cm = _make_stream_cm(lines)
    mock_client = MagicMock()
    mock_client.stream.return_value = stream_cm
    client_cm = AsyncMock()
    client_cm.__aenter__ = AsyncMock(return_value=mock_client)
    client_cm.__aexit__ = AsyncMock(return_value=False)

    with patch("src.models.openrouter.httpx.AsyncClient", return_value=client_cm):
        adapter = OpenRouterAdapter("openai/gpt-4o", "test-key")
        async for _ in adapter.stream_generate("system", "user"):
            pass

    call_kwargs = mock_client.stream.call_args.kwargs
    headers = call_kwargs["headers"]
    assert "HTTP-Referer" in headers
    assert "X-Title" in headers
