"""Demo seed script: popula DB com projects e employees pra demos/screenshots.

Run: `uv run python -m command_center.scripts.seed_demo`

Idempotente — pula entries que já existem com mesmo nome.
"""
from __future__ import annotations

import asyncio
from pathlib import Path

from sqlalchemy import select

from command_center.config import settings
from command_center.db import session as session_module
from command_center.db.models import (
    Employee,
    EmployeeStatus,
    Project,
    ProjectStatus,
)
from command_center.db.session import init_db


PROJECTS = [
    {
        "name": "MedDecide",
        "description": "Triagem médica automatizada — decisão clínica baseada em IA.",
    },
    {
        "name": "trading-agent",
        "description": "Trading bot multi-agente com asyncio e backtesting.",
    },
    {
        "name": "wine-scanner-br",
        "description": "Scanner de vinhos brasileiros — FastAPI + SQLite + visão computacional.",
    },
    {
        "name": "multi-agent-core",
        "description": "Core de orquestração multi-agente reutilizável.",
    },
]

EMPLOYEES = [
    {"name": "code-sonnet-1", "model": "sonnet", "specialty": "code"},
    {"name": "code-haiku-1", "model": "haiku", "specialty": "code"},
    {"name": "code-opus-1", "model": "opus", "specialty": "code"},
]


async def seed_projects() -> int:
    """Popula DB e cria diretórios físicos vazios pra cada projeto.

    Cria os dirs porque o dispatcher precisa de cwd válido pra os Employees
    poderem escrever lá — sem isso, claude.exe inherita o cwd do backend e
    bate em sandbox restriction.
    """
    base_path = Path(settings.projects_root)
    base_path.mkdir(parents=True, exist_ok=True)
    added = 0
    async with session_module.AsyncSessionLocal() as sess:
        for p in PROJECTS:
            existing = (
                await sess.execute(select(Project).where(Project.name == p["name"]))
            ).scalar_one_or_none()
            if existing is not None:
                print(f"[seed] project '{p['name']}' já existe, pulando")
                continue
            project_dir = base_path / p["name"]
            project_dir.mkdir(parents=True, exist_ok=True)
            row = Project(
                name=p["name"],
                path=str(project_dir),
                description=p["description"],
                status=ProjectStatus.ACTIVE,
            )
            sess.add(row)
            added += 1
            print(f"[seed] + project '{p['name']}' @ {project_dir}")
        await sess.commit()
    return added


async def seed_employees() -> int:
    added = 0
    async with session_module.AsyncSessionLocal() as sess:
        for e in EMPLOYEES:
            existing = (
                await sess.execute(select(Employee).where(Employee.name == e["name"]))
            ).scalar_one_or_none()
            if existing is not None:
                print(f"[seed] employee '{e['name']}' já existe, pulando")
                continue
            row = Employee(
                name=e["name"],
                model=e["model"],
                specialty=e["specialty"],
                status=EmployeeStatus.IDLE,
            )
            sess.add(row)
            added += 1
            print(f"[seed] + employee '{e['name']}'")
        await sess.commit()
    return added


async def main() -> None:
    await init_db()
    p_added = await seed_projects()
    e_added = await seed_employees()
    print(f"\n[seed] done — {p_added} project(s) + {e_added} employee(s) added")


if __name__ == "__main__":
    asyncio.run(main())
