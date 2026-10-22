"""Ollama native API client (/api/chat, /api/tags).

For a hosted deployment the server cannot reach a user's laptop-local Ollama.
Users must expose a reachable endpoint (for example a secured tunnel or a
self-hosted deployment) and the deployment must explicitly allow private
endpoints. Nothing about a user's endpoint is exposed to other users.
"""
from __future__ import annotations

import time
from urllib.parse import urlsplit

import httpx

from app.ai.base import AIError, AIProviderClient, AIRequest, LLMResult


def normalize_ollama_url(base_url: str) -> str:
    base = (base_url or "").strip().rstrip("/")
    if base.endswith("/api"):
        base = base[:-4]
    parts = urlsplit(base)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        raise AIError("bad_request", "The Ollama endpoint must be a valid http(s) URL.")
    return base


class OllamaClient(AIProviderClient):
    key = "ollama"
    label = "Ollama (local or self-hosted)"

    def __init__(self, base_url: str) -> None:
        self.base_url = normalize_ollama_url(base_url)

    async def chat(self, request: AIRequest, api_key: str | None = None) -> LLMResult:
        payload = {
            "model": request.model,
            "messages": [{"role": m.role, "content": m.content} for m in request.messages],
            "stream": False,
            "options": {"temperature": request.temperature, "num_predict": request.max_tokens},
        }
        if request.json_mode:
            payload["format"] = "json"
        started = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(request.timeout, connect=8.0),
                                         follow_redirects=False) as client:
                response = await client.post(f"{self.base_url}/api/chat", json=payload)
        except httpx.TimeoutException as exc:
            raise AIError("timeout", "The Ollama endpoint did not respond in time.", retryable=True) from exc
        except httpx.HTTPError as exc:
            raise AIError("unreachable", "The Ollama endpoint could not be reached.", retryable=True) from exc
        latency = int((time.monotonic() - started) * 1000)
        if response.status_code == 404:
            raise AIError("bad_request", "The Ollama model was not found. Check the model name.")
        if response.status_code >= 500:
            raise AIError("provider_error", "The Ollama endpoint returned a server error.", retryable=True)
        if response.status_code >= 400:
            raise AIError("bad_request", "The Ollama endpoint rejected the request.")
        try:
            body = response.json()
            text = (body.get("message") or {}).get("content", "") or ""
        except (ValueError, AttributeError, TypeError) as exc:
            raise AIError("invalid_output", "Ollama returned an unexpected response.") from exc
        return LLMResult(
            text=text,
            model=body.get("model") or request.model,
            provider=self.key,
            input_tokens=int(body.get("prompt_eval_count") or 0),
            output_tokens=int(body.get("eval_count") or 0),
            latency_ms=latency,
            endpoint_kind="local",
            raw_usage={k: body.get(k) for k in ("prompt_eval_count", "eval_count", "done_reason")},
        )

    async def list_models(self, api_key: str | None = None) -> list[str]:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=8.0),
                                         follow_redirects=False) as client:
                response = await client.get(f"{self.base_url}/api/tags")
        except httpx.TimeoutException as exc:
            raise AIError("timeout", "The Ollama endpoint did not respond when listing models.") from exc
        except httpx.HTTPError as exc:
            raise AIError("unreachable", "The Ollama endpoint could not be reached.") from exc
        if response.status_code >= 400:
            return []
        try:
            body = response.json()
        except ValueError:
            return []
        models = body.get("models") if isinstance(body, dict) else None
        if not isinstance(models, list):
            return []
        return sorted({str(m.get("name")) for m in models if isinstance(m, dict) and m.get("name")})[:200]
