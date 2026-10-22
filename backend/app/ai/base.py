"""AI provider contracts and errors."""
from __future__ import annotations

import abc
from dataclasses import dataclass, field


class AIError(Exception):
    """Provider/request failure with a stable code for UI messaging."""

    def __init__(self, code: str, message: str, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable

    def public_message(self) -> str:
        return {
            "not_configured": "No AI provider is configured. Add one in Settings → AI Provider.",
            "auth_failed": "The AI provider rejected the stored API key. Update it in settings.",
            "rate_limited": "The AI provider is rate limiting requests. Try again shortly.",
            "timeout": "The AI provider did not respond in time.",
            "unreachable": "The AI provider endpoint could not be reached.",
            "invalid_output": "The AI provider returned a response that did not match the required structure.",
            "usage_limit": "Your AI usage limit has been reached for this period.",
            "unsupported": "That AI provider is not supported.",
            "bad_request": "The AI provider rejected this request.",
            "provider_error": "The AI provider returned an error.",
            "disabled": "AI features are disabled for this request.",
        }.get(self.code, self.message)


@dataclass
class AIMessage:
    role: str
    content: str


@dataclass
class LLMResult:
    text: str
    model: str
    provider: str
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0
    endpoint_kind: str = "cloud"
    raw_usage: dict = field(default_factory=dict)


@dataclass
class AIRequest:
    messages: list[AIMessage]
    model: str
    temperature: float = 0.3
    max_tokens: int = 1200
    timeout: float = 60.0
    json_mode: bool = False
    task: str = "generic"


class AIProviderClient(abc.ABC):
    key: str = ""
    label: str = ""

    @abc.abstractmethod
    async def chat(self, request: AIRequest, api_key: str | None = None) -> LLMResult:
        ...

    @abc.abstractmethod
    async def list_models(self, api_key: str | None = None) -> list[str]:
        ...


def extract_json(text: str):
    """Parse JSON from an LLM response, tolerating code fences and prose."""
    import json
    import re

    if not text or not text.strip():
        raise ValueError("empty response")
    cleaned = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.S)
    if fence:
        cleaned = fence.group(1).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    for opener, closer in (("{", "}"), ("[", "]")):
        start = cleaned.find(opener)
        end = cleaned.rfind(closer)
        if start != -1 and end > start:
            snippet = cleaned[start:end + 1]
            try:
                return json.loads(snippet)
            except json.JSONDecodeError:
                continue
    raise ValueError("no valid JSON found")
