from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import structlog
from sqlalchemy import select

from command_center.agents.employee import Employee, EmployeeResult
from command_center.agents.manager import Plan, TaskSpec
from command_center.analytics import analytics
from command_center.async_utils import fire_and_log
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
from command_center.project_settings import ensure_project_claude_settings
from command_center.skills.loader import SkillsBundle, load_project_skills


log = structlog.get_logger(__name__)


def _summarize_tool_input(tool_name: str, tool_input: dict | None) -> str:
    """Gera string compacta humana pra UI: 'src/main.py (Write)' / 'ls -la'."""
    if not tool_input:
        return tool_name
    inp = tool_input
    if tool_name in ("Write", "Edit", "MultiEdit", "Read", "NotebookEdit"):
        path = inp.get("file_path") or inp.get("path") or inp.get("notebook_path") or "?"
        # Trunca caminhos absolutos pra ficar legível
        if isinstance(path, str) and len(path) > 60:
            parts = path.replace("\\", "/").split("/")
            path = ".../" + "/".join(parts[-3:])
        return str(path)
    if tool_name == "Bash":
        cmd = inp.get("command", "")
        return (cmd[:80] + "…") if len(cmd) > 80 else cmd
    if tool_name in ("Grep", "Glob"):
        pat = inp.get("pattern", "")
        return f"{pat[:50]}"
    if tool_name == "Task":
        return inp.get("description", "task")[:60]
    return tool_name


@dataclass
class FileTouchOut:
    """Snapshot de file_touched para serializar via SSE."""
    tool: str
    path: str
    operation: str


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
    files_touched: list[FileTouchOut] = field(default_factory=list)


@dataclass
class DispatchResult:
    outcomes: list[TaskOutcome] = field(default_factory=list)


async def _post_task_integrations(
    *,
    index: int,
    task_id: int,
    spec: "TaskSpec",
    output: str,
    project_dir: Path,
) -> None:
    """Fire-and-forget: auto-PR no GitHub + notificação Linear."""
    pr_url: str | None = None

    # ── GitHub auto-PR ────────────────────────────────────────────────────────
    try:
        from command_center.integrations.github import create_pr
        pr_url = await asyncio.to_thread(
            create_pr,
            project_dir=project_dir,
            task_id=task_id,
            task_title=spec.title,
            task_output=output,
        )
        if pr_url:
            await bus.publish(Event(
                type="pr_created",
                payload={
                    "index": index,
                    "task_id": task_id,
                    "pr_url": pr_url,
                },
            ))
            log.info("integrations.pr_created", url=pr_url, task_id=task_id)
    except Exception as exc:
        log.warning("integrations.github_failed", error=str(exc))

    # ── Linear notification ───────────────────────────────────────────────────
    if spec.linear_issue_id:
        try:
            from sqlalchemy import select as sa_select
            from command_center.db.models import Integration
            from command_center.integrations.linear import notify_task_complete
            from command_center.secrets_vault import decrypt

            async with session_module.AsyncSessionLocal() as sess:
                row = (
                    await sess.execute(
                        sa_select(Integration).where(Integration.integration_type == "linear")
                    )
                ).scalar_one_or_none()

            if row:
                await notify_task_complete(
                    token=decrypt(row.token),
                    issue_id=spec.linear_issue_id,
                    task_title=spec.title,
                    task_output=output,
                    pr_url=pr_url,
                )
                log.info("integrations.linear_notified", issue_id=spec.linear_issue_id)
        except Exception as exc:
            log.warning("integrations.linear_failed", error=str(exc))


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

            # Carrega skills + MCP config do projeto (Frente δ)
            skills_bundle: SkillsBundle = SkillsBundle()
            if cwd is not None:
                try:
                    skills_bundle = load_project_skills(cwd)
                except Exception as exc:
                    log.warning("dispatcher.skills_load_failed", error=str(exc))

            # Sprint 3: bloqueia cedo se mcp.json sem allow-list (headless_strict)
            if skills_bundle.is_headless_blocked:
                msg = (
                    f"MCP bloqueado em modo headless. O projeto tem .claude/mcp.json "
                    f"com servers ({', '.join(skills_bundle.mcp_filtered_out)}) mas "
                    f"sem allow-list 'headless_mcps' — esses servers podem pedir "
                    f"permissão e travar o worker. Adicione `\"headless_mcps\": [\"nome\"]` "
                    f"no mcp.json com os servers seguros pra rodar headless, ou desative "
                    f"settings.headless_strict."
                )
                await self._persist_failure(task_id, msg, employee_snapshot)
                await bus.publish(Event(
                    type="task_failed",
                    payload={
                        "index": index,
                        "task_id": task_id,
                        "error": msg,
                        "permission_blocked": True,
                    },
                ))
                return TaskOutcome(
                    index=index,
                    title=spec.title,
                    status="failed",
                    error=msg,
                    task_id=task_id,
                )

            await bus.publish(Event(
                type="task_started",
                payload={
                    "index": index,
                    "task_id": task_id,
                    "title": spec.title,
                    "employee": employee_snapshot.name if employee_snapshot else None,
                    "model": spec.model,
                    "project": spec.project,
                    "cwd": str(cwd) if cwd else None,
                    "skills": [sk.name for sk in skills_bundle.skills],
                },
            ))
            await self._mark_running(task_id)

            worker = Employee(
                name=employee_snapshot.name if employee_snapshot else f"worker-{index}",
                model=spec.model,
                specialty=spec.specialty,
                skills_block=skills_bundle.system_prompt_block or None,
                mcp_config_path=skills_bundle.mcp_config_path,
            )

            # Callback que publica cada tool_use do worker no bus.
            # Frontend mostra "code-sonnet-1 escreveu src/main.py" em tempo real.
            def _emit_tool_use(tu) -> None:  # type: ignore[no-untyped-def]
                try:
                    payload = {
                        "index": index,
                        "task_id": task_id,
                        "worker": employee_snapshot.name if employee_snapshot else None,
                        "tool": tu.tool_name,
                        "input_summary": _summarize_tool_input(tu.tool_name, tu.tool_input),
                    }
                    fire_and_log(
                        bus.publish(Event(type="worker_action", payload=payload)),
                        name="bus.worker_action",
                    )
                except Exception as exc:
                    log.warning("dispatcher.emit_tool_use_failed", error=str(exc))

            try:
                result = await worker.execute_collected(
                    spec.prompt, cwd=cwd, on_tool_use=_emit_tool_use,
                )
            except Exception as exc:
                log.exception("dispatcher.execute_failed", task_id=task_id)
                await self._persist_failure(task_id, str(exc), employee_snapshot)
                await bus.publish(Event(
                    type="task_failed",
                    payload={"index": index, "task_id": task_id, "error": str(exc)},
                ))
                analytics.track("task_failed", {
                    "project": spec.project,
                    "model": spec.model,
                    "error_type": type(exc).__name__,
                    "permission_blocked": False,
                })
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
                    payload={
                        "index": index,
                        "task_id": task_id,
                        "error": result.error,
                        "permission_blocked": result.permission_blocked,
                    },
                ))
                analytics.track("task_failed", {
                    "project": spec.project,
                    "model": spec.model,
                    "error_type": "runner_error",
                    "permission_blocked": result.permission_blocked,
                    "cost_usd": round(result.cost_usd or 0.0, 6),
                    "duration_s": round((result.duration_ms or 0) / 1000, 2),
                })
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

            files_touched_payload = [
                {"tool": ft.tool, "path": ft.path, "operation": ft.operation}
                for ft in result.files_touched
            ]
            await bus.publish(Event(
                type="task_completed",
                payload={
                    "index": index,
                    "task_id": task_id,
                    "summary": (result.output or "")[-2000:],
                    "cost_usd": result.cost_usd,
                    "duration_ms": result.duration_ms,
                    "input_tokens": result.usage.input_tokens,
                    "output_tokens": result.usage.output_tokens,
                    "files_touched": files_touched_payload,
                },
            ))
            analytics.track("task_succeeded", {
                "project": spec.project,
                "model": spec.model,
                "cost_usd": round(result.cost_usd or 0.0, 6),
                "duration_s": round((result.duration_ms or 0) / 1000, 2),
                "n_files_touched": len(result.files_touched),
                "auto_pr": spec.auto_pr,
            })

            # Invalida cache de sugestões — task nova muda contexto pro CTO virtual
            try:
                from command_center.api.suggestions import invalidate_cache
                invalidate_cache()
            except Exception:
                pass  # cache invalidation NEVER bloqueia fluxo

            outcome = TaskOutcome(
                index=index,
                title=spec.title,
                status="done",
                output=result.output,
                cost_usd=result.cost_usd,
                duration_ms=result.duration_ms,
                input_tokens=result.usage.input_tokens,
                output_tokens=result.usage.output_tokens,
                task_id=task_id,
                files_touched=[
                    FileTouchOut(tool=ft.tool, path=ft.path, operation=ft.operation)
                    for ft in result.files_touched
                ],
            )

            # Auto-PR + Linear — fire-and-forget (Frente ζ)
            if spec.auto_pr and cwd is not None:
                fire_and_log(
                    _post_task_integrations(
                        index=index,
                        task_id=task_id,
                        spec=spec,
                        output=result.output or "",
                        project_dir=cwd,
                    ),
                    name=f"integrations.post_task[{task_id}]",
                )

            return outcome

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
        """Retorna cwd do projeto pra Employee. Auto-cria a pasta se faltar.

        Sem cwd válido o claude.exe inherita o cwd do backend e o sandbox
        bloqueia writes fora dele. Criar a pasta vazia é safe — o Employee
        materializa o conteúdo dentro dela.
        """
        if not project_name:
            return None
        async with session_module.AsyncSessionLocal() as sess:
            proj = (
                await sess.execute(select(Project).where(Project.name == project_name))
            ).scalar_one_or_none()
            if proj:
                p = Path(proj.path).expanduser()
                if not p.exists():
                    try:
                        p.mkdir(parents=True, exist_ok=True)
                    except OSError as exc:
                        log.warning(
                            "dispatcher.cwd.mkdir_failed",
                            path=str(p), error=str(exc),
                        )
                        return None
                ensure_project_claude_settings(p)
                return p
        candidate = Path(settings.projects_root).expanduser() / project_name
        if not candidate.exists():
            try:
                candidate.mkdir(parents=True, exist_ok=True)
            except OSError:
                return None
        ensure_project_claude_settings(candidate)
        return candidate

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
