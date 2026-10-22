"""Alembic environment: reads the application settings so migrations and the API always
target the same database.
"""
from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import get_settings  # noqa: E402
from app.database.base import Base, UTCDateTime  # noqa: E402
from app import models  # noqa: E402,F401 - imported so every table is registered

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def render_item(type_, obj, autogen_context):
    """Render the portable UTC timestamp as its concrete SQL type.

    Without this, autogenerate emits ``app.database.base.UTCDateTime(...)`` and the migration
    fails with a NameError because migrations do not import application modules.
    """
    if type_ == "type" and isinstance(obj, UTCDateTime):
        return "sa.DateTime(timezone=True)"
    return False

# The runtime configuration always wins; ``alembic.ini`` is only a fallback for offline use.
_database_url = get_settings().database_url
if _database_url.startswith("postgres://"):
    # SQLAlchemy 2 requires the explicit driver prefix.
    _database_url = _database_url.replace("postgres://", "postgresql+psycopg://", 1)
config.set_main_option("sqlalchemy.url", _database_url.replace("%", "%%"))


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        render_item=render_item,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata,
                          compare_type=True, render_item=render_item)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
