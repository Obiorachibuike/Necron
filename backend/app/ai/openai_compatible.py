"""OpenAI-compatible Chat Completions client.

Works with OpenAI and any server implementing the same documented contract
(including OpenAI-compatible gateways and Ollama's /v1 endpoint). The exact
endpoint contract is verified against `/chat/completions` and `/models`.
"""
from __future__ import annotations

import time
from urllib.parse import urlsplit

import httpx

from app.ai.base import AIError, AIProviderClient, AIRequest, LLMResult


def normalize_base_url(base_url: str) -> str:
    base = (base_url or "").strip().rstrip("/")
    if not base:
        raise AIError("bad_request", "A base URL is required.")
    parts = urlsplit(base)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        raise AIError("bad_request", "The base URL must be a valid http(s) URL.")
    if parts.hostname == "api.openai.com" and "/v1" not in parts.path:
        base += "/v1"
    return base


class OpenAICompatibleClient(AIProviderClient):
    key = "openai_compatible"
    label = "OpenAI-compatible"

    def __init__(self, base_url: str) -> None:
        self.base_url = normalize_base_url(base_url)

    def _headers(self, api_key: str | None) -> dict[str, str]:
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        return headers

    async def chat(self, request: AIRequest, api_key: str | None = None) -> LLMResult:
        payload: dict = {
            "model": request.model,
            "messages": [{"role": m.role, "content": m.content} for m in request.messages],
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
        }
        if request.json_mode:
            payload["response_format"] = {"type": "json_object"}
        started = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(request.timeout, connect=8.0),
                                         follow_redirects=False) as client:
                response = await client.post(f"{self.base_url}/chat/completions",
                                             json=payload, headers=self._headers(api_key))
        except httpx.TimeoutException as exc:
            raise AIError("timeout", "The AI provider did not respond in time.", retryable=True) from exc
        except httpx.HTTPError as exc:
            raise AIError("unreachable", "The AI provider endpoint could not be reached.", retryable=True) from exc
        latency = int((time.monotonic() - started) * 1000)
        if response.status_code in {401, 403}:
            raise AIError("auth_failed", "The AI provider rejected the API key.")
        if response.status_code == 429:
            raise AIError("rate_limited", "The AI provider is rate limiting requests.", retryable=True)
        if response.status_code == 404:
            raise AIError("bad_request",
                          "The provider endpoint or model was not found. Check the base URL and model name.")
        if response.status_code >= 500:
            raise AIError("provider_error", "The AI provider returned a server error.", retryable=True)
        if response.status_code >= 400:
            detail = ""
            try:
                body = response.json()
                detail = str((body.get("error") or {}).get("message", ""))[:300]
            except ValueError:
                pass
            raise AIError("bad_request", f"The AI provider rejected the request. {detail}".strip())
        try:
            body = response.json()
            choice = body["choices"][0]
            text = choice["message"]["content"] or ""
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise AIError("invalid_output", "The AI provider returned an unexpected response.") from exc
        usage = body.get("usage") or {}
        if request.json_mode and not text.strip():
            raise AIError("invalid_output", "The AI provider returned an empty structured response.")
        return LLMResult(
            text=text,
            model=body.get("model") or request.model,
            provider=self.key,
            input_tokens=int(usage.get("prompt_tokens") or 0),
            output_tokens=int(usage.get("completion_tokens") or 0),
            latency_ms=latency,
            endpoint_kind="cloud",
            raw_usage=usage,
        )

    async def list_models(self, api_key: str | None = None) -> list[str]:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=8.0),
                                         follow_redirects=False) as client:
                response = await client.get(f"{self.base_url}/models", headers=self._headers(api_key))
        except httpx.TimeoutException as exc:
            raise AIError("timeout", "The provider did not respond when listing models.") from exc
        except httpx.HTTPError as exc:
            raise AIError("unreachable", "The provider endpoint could not be reached.") from exc
        if response.status_code in {401, 403}:
            raise AIError("auth_failed", "The provider rejected the API key while listing models.")
        if response.status_code >= 400:
            # Many compatible servers do not expose /models; this is not fatal.
            return []
        try:
            body = response.json()
        except ValueError:
            return []
        data = body.get("data") if isinstance(body, dict) else None
        if not isinstance(data, list):
            return []
        return sorted({str(item.get("id")) for item in data if isinstance(item, dict) and item.get("id")})[:200]
