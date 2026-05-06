"""Migra projetos do path antigo (~/projects/<nome>) pro novo (settings.projects_root/<nome>).

Idempotente. Atualiza só os que ainda têm path antigo. Cria as pastas físicas
se não existirem.

Run: `uv run python -m command_center.scripts.migrate_project_paths`
"""
from __future__ import annotations

import asyncio
from pathlib import Path

from sqlalchemy import select

from command_center.config import settings
from command_center.db import session as session_module
from command_center.db.models import Project
from command_center.db.session import init_db


async def main() -> None:
    await init_db()
    new_root = Path(settings.projects_root).expanduser()
    old_root = (Path.home() / "projects").resolve()
    new_root.mkdir(parents=True, exist_ok=True)

    print(f"[migrate] new_root: {new_root}")
    print(f"[migrate] old_root (será substituído): {old_root}")

    updated = 0
    async with session_module.AsyncSessionLocal() as sess:
        rows = (await sess.execute(select(Project))).scalars().all()
        for proj in rows:
            current_path = Path(proj.path).expanduser().resolve()
            try:
                current_path.relative_to(old_root)
            except ValueError:
                # path não está sob old_root → já está correto ou customizado
                print(f"[migrate]   skip '{proj.name}' (path: {proj.path})")
                continue

            new_path = new_root / proj.name
            new_path.mkdir(parents=True, exist_ok=True)
            proj.path = str(new_path)
            updated += 1
            print(f"[migrate]   OK '{proj.name}' -> {new_path}")
        await sess.commit()

    print(f"\n[migrate] done — {updated} project(s) atualizado(s)")


if __name__ == "__main__":
    asyncio.run(main())
