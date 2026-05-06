from __future__ import annotations

import os

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import command_center.db.session as session_module
from command_center.db.models import Base


# Tests patcham subprocess.Popen direto em claude_runner — bypass o caminho
# de hidden desktop para que os mocks funcionem.
os.environ.setdefault("CC_DISABLE_HIDDEN_DESKTOP", "1")


@pytest_asyncio.fixture(autouse=True)
async def _isolated_db(tmp_path, monkeypatch):
    """Cada teste recebe um SQLite isolado em arquivo temporário.

    Faz monkeypatch dos atributos do módulo `db.session` que são lidos
    em runtime pelos consumidores (dispatcher, queue, etc.)."""
    db_url = f"sqlite+aiosqlite:///{tmp_path / 'test.db'}"
    engine = create_async_engine(db_url, future=True)
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    monkeypatch.setattr(session_module, "engine", engine)
    monkeypatch.setattr(session_module, "AsyncSessionLocal", SessionLocal)

    yield

    await engine.dispose()
