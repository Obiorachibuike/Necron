"""Provider registry."""
from __future__ import annotations

from app.jobs.base import JobProvider, ProviderQuery  # noqa: F401
from app.jobs.greenhouse import provider as greenhouse_provider
from app.jobs.lever import provider as lever_provider

PROVIDERS: dict[str, JobProvider] = {
    greenhouse_provider.key: greenhouse_provider,
    lever_provider.key: lever_provider,
}

PROVIDER_INFO = [
    {
        "provider": "greenhouse", "label": "Greenhouse", "supports_search": False,
        "supports_board": True, "requires_token": True, "documented": True,
        "notes": greenhouse_provider.notes,
    },
    {
        "provider": "lever", "label": "Lever", "supports_search": False,
        "supports_board": True, "requires_token": True, "documented": True,
        "notes": lever_provider.notes,
    },
    {
        "provider": "manual", "label": "Manual / pasted description", "supports_search": False,
        "supports_board": False, "requires_token": False, "documented": True,
        "notes": "Paste any job description. Works without any external API.",
    },
    {
        "provider": "url", "label": "Single job URL", "supports_search": False,
        "supports_board": False, "requires_token": False, "documented": True,
        "notes": "Fetch one public job page with SSRF protections, or paste the text if it is blocked.",
    },
]


def get_provider(key: str) -> JobProvider | None:
    return PROVIDERS.get(key)
