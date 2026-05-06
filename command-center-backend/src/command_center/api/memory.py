"""GET /api/memory  — busca e lista memórias persistentes.
DELETE /api/memory/{id} — remove uma entrada (privacidade matters).
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from command_center.db import session as session_module
from command_center.memory.store import (
    delete_memory,
    list_memory,
    search_memory,
)

router = APIRouter(prefix="/api/memory", tags=["memory"])


class MemoryOut(BaseModel):
    id: int
    project_id: int | None
    conversation_id: int | None
    source_type: str
    content: str
    tags: str | None
    created_at: str

    @classmethod
    def from_row(cls, row, score: float | None = None) -> "MemoryOut":
        return cls(
            id=row.id,
            project_id=row.project_id,
            conversation_id=row.conversation_id,
            source_type=row.source_type,
            content=row.content,
            tags=row.tags,
            created_at=row.created_at.isoformat(),
        )


class MemorySearchOut(BaseModel):
    id: int
    project_id: int | None
    conversation_id: int | None
    source_type: str
    content: str
    tags: str | None
    created_at: str
    score: float


@router.get("")
async def list_or_search_memory(
    q: str | None = Query(default=None, description="Query de busca por palavra-chave"),
    project_id: int | None = Query(default=None),
    k: int = Query(default=5, ge=1, le=20),
    limit: int = Query(default=20, ge=1, le=100),
) -> dict:
    """Busca memórias por query (com score) ou lista as mais recentes."""
    async with session_module.AsyncSessionLocal() as sess:
        if q:
            results = await search_memory(sess, query=q, project_id=project_id, k=k)
            items = [
                MemorySearchOut(
                    id=row.id,
                    project_id=row.project_id,
                    conversation_id=row.conversation_id,
                    source_type=row.source_type,
                    content=row.content,
                    tags=row.tags,
                    created_at=row.created_at.isoformat(),
                    score=round(score, 4),
                )
                for row, score in results
            ]
            return {"mode": "search", "query": q, "items": items}
        else:
            rows = await list_memory(sess, project_id=project_id, limit=limit)
            items = [MemoryOut.from_row(r) for r in rows]
            return {"mode": "list", "items": items}


@router.delete("/{memory_id}")
async def remove_memory(memory_id: int) -> dict[str, bool]:
    """Remove uma entrada de memória pelo ID."""
    async with session_module.AsyncSessionLocal() as sess:
        ok = await delete_memory(sess, memory_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Memória não encontrada")
        await sess.commit()
        return {"deleted": True}
