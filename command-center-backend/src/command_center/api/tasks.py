from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from command_center.db.models import Project, Task, TaskStatus
from command_center.db.session import session_dependency
from command_center.orchestrator.queue import queue


router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    prompt: str = Field(min_length=1, max_length=20_000)
    project_id: int | None = None
    model: str | None = Field(default=None, max_length=50)


class TaskOut(BaseModel):
    id: int
    project_id: int | None
    parent_task_id: int | None
    title: str
    prompt: str
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
            prompt=row.prompt,
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


@router.post("", response_model=TaskOut, status_code=201)
async def create_task(
    req: TaskIn,
    sess: AsyncSession = Depends(session_dependency),
) -> TaskOut:
    """Cria uma task standalone (não passa pelo Manager). Enfileira PENDING."""
    if req.project_id is not None:
        proj = await sess.get(Project, req.project_id)
        if proj is None:
            raise HTTPException(status_code=404, detail="Projeto não encontrado")

    row = Task(
        title=req.title,
        prompt=req.prompt,
        project_id=req.project_id,
        model=req.model,
        status=TaskStatus.PENDING,
    )
    sess.add(row)
    await sess.commit()
    await sess.refresh(row)
    return TaskOut.from_row(row)


@router.post("/{task_id}/retry", response_model=TaskOut, status_code=201)
async def retry_task(
    task_id: int,
    sess: AsyncSession = Depends(session_dependency),
) -> TaskOut:
    """Cria uma nova task com mesmo prompt/project/model. Original fica intocada."""
    original = await sess.get(Task, task_id)
    if original is None:
        raise HTTPException(status_code=404, detail="Task não encontrada")

    new_row = Task(
        title=f"{original.title} (retry)",
        prompt=original.prompt,
        project_id=original.project_id,
        model=original.model,
        status=TaskStatus.PENDING,
        parent_task_id=original.id,
    )
    sess.add(new_row)
    await sess.commit()
    await sess.refresh(new_row)
    return TaskOut.from_row(new_row)
