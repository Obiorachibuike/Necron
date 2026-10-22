"""Shared schema base classes, validators and pagination envelopes."""
from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

T = TypeVar("T")


class AppSchema(BaseModel):
    """Base for request bodies: unknown keys are rejected instead of silently ignored."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True, extra="forbid")


class OutSchema(AppSchema):
    """Base for responses: tolerant of extra attributes supplied by construction helpers."""

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True, extra="ignore")


class ORMModel(OutSchema):
    model_config = ConfigDict(from_attributes=True)


class MessageResponse(AppSchema):
    message: str
    code: str = "ok"


class PaginationMeta(AppSchema):
    page: int
    page_size: int
    total: int
    total_pages: int


class Page(AppSchema, Generic[T]):
    items: list[T]
    meta: PaginationMeta


def page_envelope(items: list[T], total: int, page: int, page_size: int) -> dict:
    total_pages = max(1, (total + page_size - 1) // page_size)
    return {
        "items": items,
        "meta": {"page": page, "page_size": page_size, "total": total, "total_pages": total_pages},
    }


class PageParams(BaseModel):
    page: int = Field(1, ge=1, le=10_000)
    page_size: int = Field(20, ge=1, le=100)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class UrlStr(str):
    """Optional URL field: empty string allowed, otherwise http(s) required."""


OptionalUrl = Annotated[str, Field(default="", max_length=2000)]


def validate_http_url(value: str | None, *, allow_empty: bool = True) -> str:
    if value is None:
        return ""
    value = value.strip()
    if not value:
        if allow_empty:
            return ""
        raise ValueError("A URL is required")
    if len(value) > 2000:
        raise ValueError("URL is too long")
    if not (value.startswith("http://") or value.startswith("https://")):
        raise ValueError("URL must start with http:// or https://")
    if any(ch.isspace() for ch in value):
        raise ValueError("URL must not contain spaces")
    return value


class ProfileLinkMixin(AppSchema):
    portfolio_url: str = Field("", max_length=2000)
    github_url: str = Field("", max_length=2000)
    linkedin_url: str = Field("", max_length=2000)
    website_url: str = Field("", max_length=2000)

    @field_validator("portfolio_url", "github_url", "linkedin_url", "website_url")
    @classmethod
    def _urls(cls, value: str) -> str:
        return validate_http_url(value)


def date_in_past(value: date | None) -> date | None:
    if value and value.year < 1950:
        raise ValueError("Date is too far in the past")
    if value and value > date(date.today().year + 10, 12, 31):
        raise ValueError("Date is too far in the future")
    return value


class DateRangeMixin(BaseModel):
    start_date: date | None = None
    end_date: date | None = None
    is_current: bool = False

    @model_validator(mode="after")
    def _range(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("End date cannot be before the start date")
        if self.start_date and self.start_date.year < 1950:
            raise ValueError("Start date is too far in the past")
        return self


class TimestampedOut(ORMModel):
    id: str
    created_at: datetime
    updated_at: datetime


class LooseDateTime(datetime):
    """Documentation helper for endpoints accepting ISO datetimes."""
