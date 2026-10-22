"""AI provider settings, connection tests, models and usage transparency."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.ai.service import (
    ai_status,
    delete_configuration,
    get_active_config,
    get_config_or_404,
    pricing_table,
    save_configuration,
    test_connection,
    usage_this_month,
    usage_today,
    decrypt_key,
)
from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.errors import NotFoundError, ValidationAppError
from app.database.base import utcnow
from app.models import AIProviderConfiguration, AIUsageRecord
from app.schemas.common import MessageResponse
from app.schemas.system import (
    AIStatusOut,
    ProviderConfigIn,
    ProviderConfigOut,
    ProviderTestOut,
    ProviderTestRequest,
    UsageRecordOut,
    UsageSummary,
)

router = APIRouter(prefix="/ai", tags=["ai settings"])


def _config_out(config: AIProviderConfiguration) -> ProviderConfigOut:
    return ProviderConfigOut(
        id=config.id, label=config.label, provider=config.provider, base_url=config.base_url,
        model=config.model, has_api_key=bool(config.api_key_ciphertext),
        api_key_hint=config.api_key_hint, is_active=config.is_active,
        local_endpoint=config.local_endpoint, temperature=config.temperature,
        max_output_tokens=config.max_output_tokens, timeout_seconds=config.timeout_seconds,
        max_retries=config.max_retries, task_models=config.task_models or {},
        fallback_model=config.fallback_model,
        monthly_usage_limit_tokens=config.monthly_usage_limit_tokens,
        last_test_status=config.last_test_status, last_test_message=config.last_test_message,
        last_tested_at=config.last_tested_at,
        disclosure_accepted_at=config.disclosure_accepted_at,
        created_at=config.created_at, updated_at=config.updated_at,
    )


@router.get("/status", response_model=AIStatusOut)
async def status(user: CurrentUser, db: DbSession) -> AIStatusOut:
    return AIStatusOut(**ai_status(db, user.id))


@router.get("/configs", response_model=list[ProviderConfigOut])
async def list_configs(user: CurrentUser, db: DbSession) -> list[ProviderConfigOut]:
    configs = list(db.scalars(select(AIProviderConfiguration).where(
        AIProviderConfiguration.user_id == user.id)
        .order_by(AIProviderConfiguration.created_at.asc())).all())
    return [_config_out(config) for config in configs]


@router.post("/configs", response_model=ProviderConfigOut, status_code=201)
async def create_config(payload: ProviderConfigIn, user: CurrentUser,
                        db: DbSession) -> ProviderConfigOut:
    if payload.is_active and not payload.disclosure_accepted:
        raise ValidationAppError(
            "Confirm the AI data disclosure before activating a provider. Career data is only sent "
            "to the provider you choose, for actions you start.")
    config = save_configuration(db, user, payload.model_dump())
    return _config_out(config)


@router.patch("/configs/{config_id}", response_model=ProviderConfigOut)
async def update_config(config_id: str, payload: ProviderConfigIn, user: CurrentUser,
                        db: DbSession) -> ProviderConfigOut:
    config = get_config_or_404(db, user.id, config_id)
    if payload.is_active and not (payload.disclosure_accepted or config.disclosure_accepted_at):
        raise ValidationAppError("Confirm the AI data disclosure before activating a provider.")
    config = save_configuration(db, user, payload.model_dump(), config=config)
    return _config_out(config)


@router.delete("/configs/{config_id}", response_model=MessageResponse)
async def remove_config(config_id: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    delete_configuration(db, user.id, config_id)
    return MessageResponse(message="AI provider configuration deleted. Stored credentials were removed.")


@router.post("/configs/{config_id}/activate", response_model=ProviderConfigOut)
async def activate(config_id: str, user: CurrentUser, db: DbSession) -> ProviderConfigOut:
    config = get_config_or_404(db, user.id, config_id)
    if not config.disclosure_accepted_at:
        raise ValidationAppError("Confirm the AI data disclosure before activating this provider.")
    for other in db.scalars(select(AIProviderConfiguration).where(
            AIProviderConfiguration.user_id == user.id)).all():
        other.is_active = other.id == config.id
    db.commit()
    db.refresh(config)
    return _config_out(config)


@router.post("/configs/{config_id}/test", response_model=ProviderTestOut)
async def test_config(config_id: str, user: CurrentUser, db: DbSession) -> ProviderTestOut:
    config = get_config_or_404(db, user.id, config_id)
    api_key = decrypt_key(config) if config.provider in {"openai_compatible", "openai"} else None
    result = await test_connection(provider=config.provider, base_url=config.base_url,
                                   model=config.model, api_key=api_key,
                                   timeout=min(30, config.timeout_seconds))
    config.last_test_status = "connected" if result["ok"] else "error"
    config.last_test_message = result["message"][:1000]
    config.last_tested_at = utcnow()
    db.commit()
    return ProviderTestOut(**result)


@router.post("/test", response_model=ProviderTestOut)
async def test_adhoc(payload: ProviderTestRequest, user: CurrentUser, db: DbSession) -> ProviderTestOut:
    api_key = payload.api_key
    if not api_key and payload.config_id:
        config = get_config_or_404(db, user.id, payload.config_id)
        api_key = decrypt_key(config) if config.provider in {"openai_compatible", "openai"} else None
    if payload.provider in {"openai_compatible", "openai"} and not api_key:
        raise ValidationAppError("Enter an API key to test this provider.")
    result = await test_connection(provider=payload.provider, base_url=payload.base_url,
                                   model=payload.model, api_key=api_key,
                                   timeout=payload.timeout_seconds)
    if payload.config_id:
        config = get_config_or_404(db, user.id, payload.config_id)
        config.last_test_status = "connected" if result["ok"] else "error"
        config.last_test_message = result["message"][:1000]
        config.last_tested_at = utcnow()
        db.commit()
    return ProviderTestOut(**result)


@router.get("/configs/{config_id}/models", response_model=list[str])
async def list_models(config_id: str, user: CurrentUser, db: DbSession) -> list[str]:
    from app.ai.service import build_client

    config = get_config_or_404(db, user.id, config_id)
    api_key = decrypt_key(config) if config.provider in {"openai_compatible", "openai"} else None
    client = build_client(config.provider, config.base_url)
    try:
        return await client.list_models(api_key)
    except Exception:  # noqa: BLE001 - model listing is best effort
        return []


@router.get("/usage", response_model=UsageSummary)
async def usage(user: CurrentUser, db: DbSession, days: int = Query(30, ge=1, le=365)) -> UsageSummary:
    settings = get_settings()
    since = utcnow() - timedelta(days=days)
    records = list(db.scalars(select(AIUsageRecord).where(
        AIUsageRecord.user_id == user.id, AIUsageRecord.created_at >= since)
        .order_by(AIUsageRecord.created_at.desc())).all())
    config = get_active_config(db, user.id)
    costs = [r.estimated_cost_usd for r in records if r.estimated_cost_usd is not None]
    by_task: dict[str, dict] = {}
    by_day: dict[str, dict] = {}
    for record in records:
        task = record.task or "other"
        stats = by_task.setdefault(task, {"task": task, "requests": 0, "tokens": 0, "failures": 0})
        stats["requests"] += 1
        stats["tokens"] += record.input_tokens + record.output_tokens
        stats["failures"] += 0 if record.success else 1
        day = record.created_at.date().isoformat()
        daily = by_day.setdefault(day, {"date": day, "requests": 0, "tokens": 0,
                                        "failures": 0, "estimated_cost_usd": 0.0})
        daily["requests"] += 1
        daily["tokens"] += record.input_tokens + record.output_tokens
        daily["failures"] += 0 if record.success else 1
        if record.estimated_cost_usd:
            daily["estimated_cost_usd"] += record.estimated_cost_usd
    if not pricing_table():
        cost_note = ("Cost estimates are unavailable because this deployment has no model pricing "
                     "table configured (CP_AI_PRICING_JSON). Token counts are recorded accurately.")
    else:
        cost_note = ("Costs are estimates calculated from the configured pricing table. Verify them "
                     "against your provider's billing dashboard.")
    return UsageSummary(
        period_days=days, requests=len(records),
        successes=len([r for r in records if r.success]),
        failures=len([r for r in records if not r.success]),
        input_tokens=sum(r.input_tokens for r in records),
        output_tokens=sum(r.output_tokens for r in records),
        estimated_cost_usd=round(sum(costs), 6) if costs else None,
        cost_note=cost_note,
        by_task=sorted(by_task.values(), key=lambda item: -item["tokens"]),
        by_day=sorted(by_day.values(), key=lambda item: item["date"]),
        configured=config is not None,
        provider_label=config.label if config else "",
        endpoint_kind=("local" if config and config.local_endpoint else
                       ("cloud" if config else "")),
        usage_limit_tokens=config.monthly_usage_limit_tokens if config else None,
        recent=[UsageRecordOut.model_validate(r) for r in records[:20]],
    )
