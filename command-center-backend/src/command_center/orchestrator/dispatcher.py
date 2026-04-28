from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import structlog
from sqlalchemy import select

from command_center.agents.employee import Employee, EmployeeResult
from command_center.agents.manager import Plan, TaskSpec
from command_center.config import settings
from command_center.db import session as session_module
from command_center.db.models import (
    Employee as EmployeeRow,
    EmployeeStatus,
    Project,
    Task,
    TaskStatus,
)
from command_center.events import Event, bus


log = structlog.get_logger(__name__)


@dataclass
class TaskOutcome:
    index: int
    title: str
    status: str  # done | failed | cancelled
    output: str | None = None
    error: str | None = None
    cost_usd: float | None = None
    duration_ms: int | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    task_id: int | None = None


@dataclass
class DispatchResult:
    outcomes: list[TaskOutcome] = field(default_factory=list)


class Dispatcher:
    """Recebe um Plan e despacha as tasks respeitando paralelismo e dependências."""

    def __init__(self, max_parallel: int | None = None) -> None:
        self.max_parallel = max_parallel or settings.max_parallel_workers
        self.semaphore = asyncio.Semaphore(self.max_parallel)

    async def execute_plan(self, plan: Plan) -> DispatchResult:
        if not plan.tasks:
            return DispatchResult(outcomes=[])
        if plan.execution_mode == "parallel" and self._has_no_deps(plan):
            outcomes = await self._run_parallel(plan)
        else:
            outcomes = await self._run_with_deps(plan)
        return DispatchResult(outcomes=outcomes)

    @staticmethod
    def _has_no_deps(plan: Plan) -> bool:
        return all(not task.depends_on for task in plan.tasks)

    async def _run_parallel(self, plan: Plan) -> list[TaskOutcome]:
        coros = [self._execute_one(idx, spec) for idx, spec in enumerate(plan.tasks)]
        results = await asyncio.gather(*coros, return_exceptions=True)
        outcomes: list[TaskOutcome] = []
        for idx, result in enumerate(results):
            if isinstance(result, BaseException):
                outcomes.append(
                    TaskOutcome(
                        index=idx,
                        title=plan.tasks[idx].title,
                        status="failed",
                        error=repr(result),
                    )
                )
            else:
                outcomes.append(result)
        return outcomes

    async def _run_with_deps(self, plan: Plan) -> list[TaskOutcome]:
        n = len(plan.tasks)
        outcomes: list[TaskOutcome | None] = [None] * n
        done_events = [asyncio.Event() for _ in range(n)]

        async def _runner(idx: int, spec: TaskSpec) -> None:
            for dep in spec.depends_on:
                if 0 <= dep < n:
                    await done_events[dep].wait()
                    prev = outcomes[dep]
                    if prev and prev.status != "done":
                        outcomes[idx] = TaskOutcome(
                            index=idx,
                            title=spec.title,
                            status="cancelled",
                            error=f"dependência #{dep} não concluiu (status={prev.status})",
                        )
                        done_events[idx].set()
                        return
            try:
                outcomes[idx] = await self._execute_one(idx, spec)
            except Exception as exc:
                outcomes[idx] = TaskOutcome(
                    index=idx,
                    title=spec.title,
                    status="failed",
                    error=repr(exc),
                )
            finally:
                done_events[idx].set()

        await asyncio.gather(
            *(_runner(idx, spec) for idx, spec in enumerate(plan.tasks)),
            return_exceptions=True,
        )
        return [o for o in outcomes if o is not None]

    async def _execute_one(self, index: int, spec: TaskSpec) -> TaskOutcome:
        async with self.semaphore:
            task_id = await self._persist_pending(spec)
            employee_snapshot = await self._reserve_employee(spec, task_id)
            cwd = await self._resolve_cwd(spec.project)

            await bus.publish(Event(
                type="task_started",
                payload={
                    "task_id": task_id,
                    "title": spec.title,
                    "employee": employee_snapshot.name if employee_snapshot else None,
                    "model": spec.model,
                    "project": spec.project,
                    "cwd": str(cwd) if cwd else None,
                },
            ))
            await self._mark_running(task_id)

            worker = Employee(
                name=employee_snapshot.name if employee_snapshot else f"worker-{index}",
                model=spec.model,
                specialty=spec.specialty,
            )

            try:
                result = await worker.execute_collected(spec.prompt, cwd=cwd)
            except Exception as exc:
                log.exception("dispatcher.execute_failed", task_id=task_id)
                await self._persist_failure(task_id, str(exc), employee_snapshot)
                await bus.publish(Event(
                    type="task_failed",
                    payload={"task_id": task_id, "error": str(exc)},
                ))
                return TaskOutcome(
                    index=index,
                    title=spec.title,
                    status="failed",
                    error=str(exc),
                    task_id=task_id,
                )

            await self._persist_result(task_id, result, employee_snapshot)

            if result.error:
                await bus.publish(Event(
                    type="task_failed",
                    payload={"task_id": task_id, "error": result.error},
                ))
                return TaskOutcome(
                    index=index,
                    title=spec.title,
                    status="failed",
                    output=result.output,
                    error=result.error,
                    cost_usd=result.cost_usd,
                    duration_ms=result.duration_ms,
                    input_tokens=result.usage.input_tokens,
                    output_tokens=result.usage.output_tokens,
                    task_id=task_id,
                )

            await bus.publish(Event(
                type="task_completed",
                payload={
                    "task_id": task_id,
                    "summary": (result.output or "")[-2000:],
                    "cost_usd": result.cost_usd,
                    "duration_ms": result.duration_ms,
                    "input_tokens": result.usage.input_tokens,
                    "output_tokens": result.usage.output_tokens,
                },
            ))
            return TaskOutcome(
                index=index,
                title=spec.title,
                status="done",
                output=result.output,
                cost_usd=result.cost_usd,
                duration_ms=result.duration_ms,
                input_tokens=result.usage.input_tokens,
                output_tokens=result.usage.output_tokens,
                task_id=task_id,
            )

    # ---------- Persistência ----------

    async def _persist_pending(self, spec: TaskSpec) -> int:
        async with session_module.AsyncSessionLocal() as sess:
            project_id: int | None = None
            if spec.project:
                proj = (
                    await sess.execute(select(Project).where(Project.name == spec.project))
                ).scalar_one_or_none()
                project_id = proj.id if proj else None
            row = Task(
                project_id=project_id,
                title=spec.title,
                prompt=spec.prompt,
                status=TaskStatus.PENDING,
                model=spec.model,
            )
            sess.add(row)
            await sess.commit()
            await sess.refresh(row)
            return row.id

    async def _reserve_employee(
        self, spec: TaskSpec, task_id: int
    ) -> EmployeeRow | None:
        """Reserva (ou cria) um EmployeeRow IDLE compatível, marca BUSY,
        e retorna um snapshot com os campos necessários."""
        async with session_module.AsyncSessionLocal() as sess:
            row = (
                await sess.execute(
                    select(EmployeeRow)
                    .where(EmployeeRow.status == EmployeeStatus.IDLE)
                    .where(EmployeeRow.model == spec.model)
                    .limit(1)
                )
            ).scalar_one_or_none()
            if row is None:
                row = EmployeeRow(
                    name=f"{spec.specialty}-{spec.model}-{task_id}",
                    model=spec.model,
                    specialty=spec.specialty,
                    status=EmployeeStatus.BUSY,
                    current_task_id=task_id,
                )
                sess.add(row)
            else:
                row.status = EmployeeStatus.BUSY
                row.current_task_id = task_id

            await sess.flush()
            assigned_id = row.id

            task_row = await sess.get(Task, task_id)
            if task_row:
                task_row.assigned_to = assigned_id

            await sess.commit()
            await sess.refresh(row)

            return EmployeeRow(
                id=row.id,
                name=row.name,
                model=row.model,
                specialty=row.specialty,
                status=row.status,
                current_task_id=row.current_task_id,
            )

    async def _resolve_cwd(self, project_name: str | None) -> Path | None:
        if not project_name:
            return None
        async with session_module.AsyncSessionLocal() as sess:
            proj = (
                await sess.execute(select(Project).where(Project.name == project_name))
            ).scalar_one_or_none()
            if proj:
                p = Path(proj.path)
                return p if p.exists() else None
        candidate = settings.projects_root / project_name
        return candidate if candidate.exists() else None

    async def _mark_running(self, task_id: int) -> None:
        async with session_module.AsyncSessionLocal() as sess:
            row = await sess.get(Task, task_id)
            if row:
                row.status = TaskStatus.RUNNING
                row.started_at = datetime.now(UTC)
                await sess.commit()

    async def _persist_result(
        self,
        task_id: int,
        result: EmployeeResult,
        employee: EmployeeRow | None,
    ) -> None:
        async with session_module.AsyncSessionLocal() as sess:
            row = await sess.get(Task, task_id)
            if row:
                row.status = TaskStatus.FAILED if result.error else TaskStatus.DONE
                row.output = result.output
                row.error = result.error
                row.cost_estimate = result.cost_usd
                row.completed_at = datetime.now(UTC)
            if employee and employee.id is not None:
                emp_row = await sess.get(EmployeeRow, employee.id)
                if emp_row:
                    emp_row.status = EmployeeStatus.IDLE
                    emp_row.current_task_id = None
            await sess.commit()

    async def _persist_failure(
        self,
        task_id: int,
        error: str,
        employee: EmployeeRow | None,
    ) -> None:
        async with session_module.AsyncSessionLocal() as sess:
            row = await sess.get(Task, task_id)
            if row:
                row.status = TaskStatus.FAILED
                row.error = error
                row.completed_at = datetime.now(UTC)
            if employee and employee.id is not None:
                emp_row = await sess.get(EmployeeRow, employee.id)
                if emp_row:
                    emp_row.status = EmployeeStatus.IDLE
                    emp_row.current_task_id = None
            await sess.commit()
