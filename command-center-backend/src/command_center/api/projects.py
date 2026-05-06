from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from command_center.db.models import Project, ProjectStatus
from command_center.db.session import session_dependency
from command_center.project_inspect import detect_stack
from command_center.project_settings import ensure_project_claude_settings


router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectIn(BaseModel):
    name: str
    path: str
    description: str | None = None


class ProjectOut(BaseModel):
    id: int
    name: str
    path: str
    description: str | None
    status: str
    created_at: datetime
    # Tech stack detectado (ex: ["Python", "FastAPI"]) — computed, sem migration.
    tech_stack: list[str] = []

    @classmethod
    def from_row(cls, row: Project, *, with_stack: bool = True) -> "ProjectOut":
        return cls(
            id=row.id,
            name=row.name,
            path=row.path,
            description=row.description,
            status=row.status.value if hasattr(row.status, "value") else str(row.status),
            created_at=row.created_at,
            tech_stack=detect_stack(row.path) if with_stack else [],
        )


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    sess: AsyncSession = Depends(session_dependency),
) -> list[ProjectOut]:
    rows = (
        await sess.execute(select(Project).order_by(Project.created_at.desc()))
    ).scalars().all()
    return [ProjectOut.from_row(r) for r in rows]


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(
    body: ProjectIn,
    sess: AsyncSession = Depends(session_dependency),
) -> ProjectOut:
    existing = (
        await sess.execute(select(Project).where(Project.name == body.name))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Projeto já existe.")

    # Auto-cria a pasta do projeto pra que o dispatcher possa cwd lá e os
    # Employees consigam escrever sem bater em sandbox restriction.
    # Expande ~ se presente. Falha silenciosamente se não puder criar (ex.:
    # permissões); o dispatcher tem fallback.
    expanded_path = str(Path(body.path).expanduser())
    try:
        Path(expanded_path).mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    # Libera Write/Edit/Bash pros workers rodando neste projeto.
    ensure_project_claude_settings(expanded_path)

    row = Project(
        name=body.name,
        path=expanded_path,
        description=body.description,
        status=ProjectStatus.ACTIVE,
    )
    sess.add(row)
    await sess.commit()
    await sess.refresh(row)
    return ProjectOut.from_row(row)


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: int,
    sess: AsyncSession = Depends(session_dependency),
) -> ProjectOut:
    row = await sess.get(Project, project_id)
    if not row:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    return ProjectOut.from_row(row)
