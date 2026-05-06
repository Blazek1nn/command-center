"""Fila de tarefas backed por SQLite.

Não é um broker: é uma view sobre a tabela `tasks` filtrando por status.
Útil para o ralph_loop e endpoints de status."""
from __future__ import annotations

from sqlalchemy import func, select

from command_center.db import session as session_module
from command_center.db.models import Task, TaskStatus


class TaskQueue:
    async def enqueue(
        self,
        title: str,
        prompt: str,
        project_id: int | None = None,
        model: str | None = None,
    ) -> int:
        async with session_module.AsyncSessionLocal() as sess:
            row = Task(
                title=title,
                prompt=prompt,
                project_id=project_id,
                model=model,
                status=TaskStatus.PENDING,
            )
            sess.add(row)
            await sess.commit()
            await sess.refresh(row)
            return row.id

    async def list_pending(self, limit: int = 20) -> list[Task]:
        async with session_module.AsyncSessionLocal() as sess:
            result = await sess.execute(
                select(Task)
                .where(Task.status == TaskStatus.PENDING)
                .order_by(Task.created_at.asc())
                .limit(limit)
            )
            return list(result.scalars().all())

    async def cancel(self, task_id: int) -> bool:
        async with session_module.AsyncSessionLocal() as sess:
            row = await sess.get(Task, task_id)
            if row and row.status in (TaskStatus.PENDING, TaskStatus.RUNNING):
                row.status = TaskStatus.CANCELLED
                await sess.commit()
                return True
            return False

    async def count_by_status(self) -> dict[str, int]:
        async with session_module.AsyncSessionLocal() as sess:
            result = await sess.execute(
                select(Task.status, func.count(Task.id)).group_by(Task.status)
            )
            counts: dict[str, int] = {s.value: 0 for s in TaskStatus}
            for status, n in result.all():
                key = status.value if hasattr(status, "value") else str(status)
                counts[key] = n
            return counts


queue = TaskQueue()
