"""Deployment-specific configuration derived from Vercel system variables."""
from __future__ import annotations

from app.core.config import Settings


def _clear_vercel(monkeypatch) -> None:
    for name in ("VERCEL", "VERCEL_ENV", "VERCEL_URL", "CP_FRONTEND_ORIGIN"):
        monkeypatch.delenv(name, raising=False)


def test_vercel_binding_and_deployment_hosts_are_allowed(monkeypatch):
    _clear_vercel(monkeypatch)
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("VERCEL_ENV", "preview")
    monkeypatch.setenv("VERCEL_URL", "careerpilot-preview.vercel.app")

    settings = Settings()

    assert "careerpilot-preview.vercel.app" in settings.effective_allowed_hosts
    assert "*.services.vercel-infra.com" in settings.effective_allowed_hosts
    assert settings.effective_frontend_origin == "https://careerpilot-preview.vercel.app"


def test_explicit_frontend_origin_overrides_vercel_url(monkeypatch):
    _clear_vercel(monkeypatch)
    monkeypatch.setenv("VERCEL_URL", "careerpilot-preview.vercel.app")
    monkeypatch.setenv("CP_FRONTEND_ORIGIN", "https://careerpilot.example")

    settings = Settings()

    assert settings.effective_frontend_origin == "https://careerpilot.example"


def test_vercel_internal_host_pattern_is_not_enabled_locally(monkeypatch):
    _clear_vercel(monkeypatch)

    settings = Settings()

    assert "*.services.vercel-infra.com" not in settings.effective_allowed_hosts
    assert settings.effective_frontend_origin == "http://localhost:3000"
