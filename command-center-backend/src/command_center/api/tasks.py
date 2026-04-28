from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from command_center.db.models import Task, TaskStatus
from command_center.db.session import session_dependency
from command_center.orchestrator.queue import queue


router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class TaskOut(BaseModel):
    id: int
    project_id: int | None
    parent_task_id: int | None
    title: str
    status: str
    assigned_to: int | None
    model: str | None
    output: str | None
    error: str | None
    cost_estimate: float | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None

    @classmethod
    def from_row(cls, row: Task) -> "TaskOut":
        return cls(
            id=row.id,
            project_id=row.project_id,
            parent_task_id=row.parent_task_id,
            title=row.title,
            status=row.status.value if hasattr(row.status, "value") else str(row.status),
            assigned_to=row.assigned_to,
            model=row.model,
            output=row.output,
            error=row.error,
            cost_estimate=row.cost_estimate,
            created_at=row.created_at,
            started_at=row.started_at,
            completed_at=row.completed_at,
        )


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    project_id: int | None = Query(default=None),
    status: TaskStatus | None = Query(default=None),
    limit: int = Query(default=200, le=500),
    sess: AsyncSession = Depends(session_dependency),
) -> list[TaskOut]:
    stmt = select(Task)
    if project_id is not None:
        stmt = stmt.where(Task.project_id == project_id)
    if status is not None:
        stmt = stmt.where(Task.status == status)
    stmt = stmt.order_by(Task.created_at.desc()).limit(limit)
    rows = (await sess.execute(stmt)).scalars().all()
    return [TaskOut.from_row(r) for r in rows]


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: int,
    sess: AsyncSession = Depends(session_dependency),
) -> TaskOut:
    row = await sess.get(Task, task_id)
    if not row:
        raise HTTPException(status_code=404, detail="Task não encontrada.")
    return TaskOut.from_row(row)


@router.post("/{task_id}/cancel")
async def cancel_task(task_id: int) -> dict[str, bool]:
    ok = await queue.cancel(task_id)
    if not ok:
        raise HTTPException(status_code=409, detail="Task não pode ser cancelada.")
    return {"cancelled": True}
