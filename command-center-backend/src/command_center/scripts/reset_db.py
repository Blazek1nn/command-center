"""Reseta o DB: deleta o arquivo SQLite e recria o schema.

Usage: `uv run python -m command_center.scripts.reset_db`

USE COM CUIDADO — apaga TODOS os projects, tasks, employees, conversations.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from command_center.config import settings
from command_center.db.session import init_db


async def main() -> None:
    db_url = settings.db_url
    if not db_url.startswith("sqlite"):
        print(f"[reset_db] db_url={db_url} não é SQLite — abortando por segurança")
        sys.exit(1)

    db_file = db_url.split(":///")[-1]
    p = Path(db_file)
    if p.exists():
        p.unlink()
        print(f"[reset_db] removido: {p}")
    else:
        print(f"[reset_db] {p} não existia")

    await init_db()
    print("[reset_db] schema recriado")


if __name__ == "__main__":
    asyncio.run(main())
