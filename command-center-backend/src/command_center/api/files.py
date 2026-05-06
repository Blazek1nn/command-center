"""GET /api/files/read — leitura sandboxada de arquivos dentro de um projeto.

Path traversal defense: o path resolvido DEVE estar dentro do project.path.
Limite de 100 KB por arquivo.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from command_center.db.models import Project
from command_center.db.session import session_dependency


router = APIRouter(prefix="/api/files", tags=["files"])

MAX_FILE_BYTES = 100_000


class FileRead(BaseModel):
    path: str
    bytes: int
    content: str
    truncated: bool


def _resolve_project_path(project: Project) -> Path:
    """Resolve o path absoluto do projeto, expandindo ~."""
    p = Path(project.path).expanduser().resolve(strict=False)
    return p


@router.get("/read", response_model=FileRead)
async def read_file(
    project: str = Query(..., min_length=1, max_length=200),
    path: str = Query(..., min_length=1, max_length=500),
    sess: AsyncSession = Depends(session_dependency),
) -> FileRead:
    """Lê um arquivo relativo ao project.path. Rejeita path traversal."""
    proj = (
        await sess.execute(select(Project).where(Project.name == project))
    ).scalar_one_or_none()
    if proj is None:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    base = _resolve_project_path(proj)
    if not base.exists() or not base.is_dir():
        raise HTTPException(status_code=404, detail=f"Project path não acessível: {base}")

    # Resolve target relativo à base; rejeita absolute paths
    target_rel = Path(path)
    if target_rel.is_absolute():
        raise HTTPException(status_code=400, detail="Path deve ser relativo ao projeto")

    target = (base / target_rel).resolve(strict=False)

    # Path traversal guard: target deve estar dentro de base
    try:
        target.relative_to(base)
    except ValueError:
        raise HTTPException(status_code=400, detail="Path fora do projeto") from None

    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail=f"Arquivo não encontrado: {path}")

    size = target.stat().st_size
    if size > MAX_FILE_BYTES:
        # Lê só os primeiros MAX_FILE_BYTES — sinaliza truncado
        with target.open("rb") as f:
            raw = f.read(MAX_FILE_BYTES)
        try:
            content = raw.decode("utf-8", errors="replace")
        except Exception:
            content = raw.decode("latin-1", errors="replace")
        return FileRead(path=path, bytes=size, content=content, truncated=True)

    try:
        content = target.read_text(encoding="utf-8", errors="replace")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha ao ler: {exc}") from exc

    return FileRead(path=path, bytes=size, content=content, truncated=False)
