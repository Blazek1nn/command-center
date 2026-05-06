from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from command_center.config import settings
from command_center.db.models import Base


# SQLite-specific: timeout maior pra evitar "database is locked" sob carga.
# WAL + NORMAL synchronous = 3-5x throughput pra workloads mistos read/write.
_is_sqlite = settings.db_url.startswith("sqlite")
_connect_args: dict = {"timeout": 30} if _is_sqlite else {}

engine: AsyncEngine = create_async_engine(
    settings.db_url,
    echo=False,
    future=True,
    connect_args=_connect_args,
    pool_pre_ping=True,
)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


if _is_sqlite:
    # PRAGMA aplicado em CADA conexão nova do pool (não basta fazer 1x no init).
    @event.listens_for(engine.sync_engine, "connect")
    def _sqlite_pragma(dbapi_conn, _connection_record) -> None:  # type: ignore[no-untyped-def]
        cursor = dbapi_conn.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA busy_timeout=30000")  # 30s
            cursor.execute("PRAGMA foreign_keys=ON")
        finally:
            cursor.close()


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    """Context manager — auto-commit no sucesso, rollback no erro."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def session_dependency() -> AsyncIterator[AsyncSession]:
    """Dependency injection do FastAPI — quem chama controla o commit."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
