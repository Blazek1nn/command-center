from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from command_center.config import settings
from command_center.db.models import Base


engine: AsyncEngine = create_async_engine(settings.db_url, echo=False, future=True)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


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
