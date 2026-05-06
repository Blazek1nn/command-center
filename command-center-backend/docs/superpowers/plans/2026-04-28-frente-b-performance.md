# Frente B — Performance & Custo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Cortar custo e latência: "oi" cai de $0.29/41s para ~$0.15/20s; chat com tasks reais cai de $0.29 para ~$0.18.

**Architecture:** 4 fixes independentes — 2 backend (skip report quando vazio + sonnet pra report), 1 backend perf (count_by_status SQL agregado), 1 frontend (polling pausa em background). TDD onde aplicável; sem git, restarts manuais.

**Tech Stack:** Python 3.13 + SQLAlchemy async; React Query v5; pytest asyncio_mode=auto.

**Spec:** `docs/superpowers/specs/2026-04-28-frente-b-performance-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/command_center/api/chat.py` | modify | guard `if not plan.tasks` antes de `manager.report()` |
| `src/command_center/agents/manager.py` | modify | `report()` aceita `model` kwarg com default `"sonnet"` |
| `src/command_center/orchestrator/queue.py` | modify | `count_by_status()` usa GROUP BY |
| `tests/test_manager_report_model.py` | create | verifica model passado pro runner |
| `tests/test_queue_count.py` | create | verifica contagem correta + 1 query SQL única |
| `command-center-frontend/src/hooks/use-tasks.ts` | modify | `refetchIntervalInBackground: false` |
| `command-center-frontend/src/hooks/use-employees.ts` | modify | `refetchIntervalInBackground: false` |

---

## Pre-flight

- [ ] **Pre-1: Backend rodando**

```bash
curl -s -m 3 http://localhost:8000/health
```

Expected: `{"status":"ok"}`.

- [ ] **Pre-2: Suite Frente A baseline**

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run pytest tests/ --tb=line
```

Expected: 17 passed, 1 failed (`test_claude_runner_streams_correctly` pre-existente).

---

## Task 1: B1 — Skip report quando plano vazio

**Files:**
- Modify: `src/command_center/api/chat.py:148-152`

### Steps

- [ ] **1.1: Apply fix**

Edit `C:\cc\command-center-backend\src\command_center\api\chat.py`. Find the block:

```python
        # 4) Relatório final
        try:
            report = await manager.report(plan, outcomes_payload)
        except Exception as exc:
            report = f"_(falha ao gerar relatório: {exc})_"
```

Replace with:

```python
        # 4) Relatório final — skip Opus quando não há trabalho a sintetizar
        if not plan.tasks:
            report = (
                "Sem trabalho a despachar. Mande um pedido concreto "
                "(projeto + objetivo) que eu monto o plano."
            )
        else:
            try:
                report = await manager.report(plan, outcomes_payload)
            except Exception as exc:
                report = f"_(falha ao gerar relatório: {exc})_"
```

- [ ] **1.2: Restart backend**

```powershell
$pids = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
$pids | ForEach-Object { try { $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $_" -ErrorAction SilentlyContinue; foreach ($c in $children) { Stop-Process -Id $c.ProcessId -Force -ErrorAction SilentlyContinue }; Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } catch {} }
Start-Sleep 2
```

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run uvicorn command_center.main:app --port 8000 > /tmp/backend8000.log 2>&1 &
sleep 7
curl -s -m 3 http://localhost:8000/health
```

Expected: `{"status":"ok"}`.

- [ ] **1.3: Smoke test "oi" — verifica custo cai**

```bash
curl -s -m 60 -N -X POST http://localhost:8000/api/chat -H "Content-Type: application/json" -d '{"message":"oi"}' 2>&1 | grep -E "^(event|data)" | tail -10
```

Look in the `done` event for `usage.total.cost_usd`. Expected: < 0.20 (apenas o plan call de opus, sem report). Antes do fix: ~0.29.

Report the value observed.

---

## Task 2: B2 — Manager.report() default sonnet

**Files:**
- Modify: `src/command_center/agents/manager.py:141-164`
- Create: `tests/test_manager_report_model.py`

### Steps

- [ ] **2.1: Write failing test**

Create `C:\cc\command-center-backend\tests\test_manager_report_model.py`:

```python
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from command_center.agents.claude_runner import Done, TextDelta, TokenUsage
from command_center.agents.manager import Manager, Plan


def _fake_runner_factory(captured: dict[str, object]):
    """Cria um runner falso que captura os args e emite TextDelta + Done."""

    async def fake_run(prompt: str, model: str, system_prompt: str | None = None):
        captured["model"] = model
        captured["prompt"] = prompt
        captured["system_prompt"] = system_prompt
        yield TextDelta(text="ok")
        yield Done(final_text="ok", cost_usd=0.0, usage=TokenUsage())

    runner = MagicMock()
    runner.run = fake_run
    return runner


@pytest.mark.asyncio
async def test_report_uses_sonnet_by_default() -> None:
    captured: dict[str, object] = {}
    runner = _fake_runner_factory(captured)
    mgr = Manager(model="opus", runner=runner)

    plan = Plan(understanding="x", execution_mode="parallel", tasks=[], estimated_minutes=0)
    result = await mgr.report(plan, [])

    assert captured["model"] == "sonnet", (
        f"report() deve usar sonnet por default, usou: {captured['model']}"
    )
    assert result == "ok"


@pytest.mark.asyncio
async def test_report_accepts_explicit_model() -> None:
    captured: dict[str, object] = {}
    runner = _fake_runner_factory(captured)
    mgr = Manager(model="opus", runner=runner)

    plan = Plan(understanding="x", execution_mode="parallel", tasks=[], estimated_minutes=0)
    await mgr.report(plan, [], model="haiku")

    assert captured["model"] == "haiku"


@pytest.mark.asyncio
async def test_plan_still_uses_manager_model() -> None:
    """plan() não deve ser afetado pela mudança em report() — continua usando self.model."""
    captured: dict[str, object] = {}
    runner = _fake_runner_factory(captured)
    mgr = Manager(model="opus", runner=runner)

    # plan() calls runner.run with self.model
    # Use a minimal valid JSON response for plan parsing
    async def plan_run(prompt: str, model: str, system_prompt: str | None = None):
        captured["model"] = model
        yield TextDelta(text='```json\n{"understanding":"x","execution_mode":"parallel","tasks":[],"estimated_minutes":0}\n```')
        yield Done(final_text="", cost_usd=0.0, usage=TokenUsage())

    runner.run = plan_run
    await mgr.plan("test")

    assert captured["model"] == "opus", "plan() deve continuar usando opus (self.model)"
```

- [ ] **2.2: Run test — expect FAIL**

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run pytest tests/test_manager_report_model.py -v
```

Expected: 2 of 3 fail (`test_report_uses_sonnet_by_default` and `test_report_accepts_explicit_model`); `test_plan_still_uses_manager_model` passes.

- [ ] **2.3: Modify Manager.report()**

Edit `C:\cc\command-center-backend\src\command_center\agents\manager.py`. Find:

```python
    async def report(self, plan: Plan, results: list[dict]) -> str:
        plan_json = plan.model_dump_json(indent=2)
        results_json = json.dumps(results, ensure_ascii=False, indent=2, default=str)
        prompt = (
            "Os funcionários terminaram. Gere um relatório consolidado para o CEO em "
            "**markdown**, em PT-BR, seguindo o formato do system prompt "
            "(TL;DR, O que foi feito, Problemas, Próximos passos).\n\n"
            f"## Plano original\n```json\n{plan_json}\n```\n\n"
            f"## Resultados\n```json\n{results_json}\n```"
        )
        parts: list[str] = []
        async for event in self.runner.run(
            prompt=prompt,
            model=self.model,
            system_prompt=self.system_prompt,
        ):
            if isinstance(event, TextDelta):
                parts.append(event.text)
            elif isinstance(event, Done):
                self.usage.add(cost_usd=event.cost_usd, usage=event.usage)
            elif isinstance(event, RunnerError):
                log.error("manager.report_error", error=event.message)
                return f"_(falha ao gerar relatório: {event.message})_"
        return "".join(parts)
```

Replace with:

```python
    async def report(
        self,
        plan: Plan,
        results: list[dict],
        model: str | None = None,
    ) -> str:
        """Gera relatório consolidado pro CEO. Default `sonnet` — síntese não exige opus."""
        report_model = model or "sonnet"
        plan_json = plan.model_dump_json(indent=2)
        results_json = json.dumps(results, ensure_ascii=False, indent=2, default=str)
        prompt = (
            "Os funcionários terminaram. Gere um relatório consolidado para o CEO em "
            "**markdown**, em PT-BR, seguindo o formato do system prompt "
            "(TL;DR, O que foi feito, Problemas, Próximos passos).\n\n"
            f"## Plano original\n```json\n{plan_json}\n```\n\n"
            f"## Resultados\n```json\n{results_json}\n```"
        )
        parts: list[str] = []
        async for event in self.runner.run(
            prompt=prompt,
            model=report_model,
            system_prompt=self.system_prompt,
        ):
            if isinstance(event, TextDelta):
                parts.append(event.text)
            elif isinstance(event, Done):
                self.usage.add(cost_usd=event.cost_usd, usage=event.usage)
            elif isinstance(event, RunnerError):
                log.error("manager.report_error", error=event.message)
                return f"_(falha ao gerar relatório: {event.message})_"
        return "".join(parts)
```

- [ ] **2.4: Run test — expect PASS**

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run pytest tests/test_manager_report_model.py -v
```

Expected: 3 PASS.

- [ ] **2.5: Run full suite**

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run pytest tests/ --tb=line
```

Expected: 20 passed, 1 failed (the pre-existing one).

---

## Task 3: B3 — `count_by_status` usa GROUP BY

**Files:**
- Modify: `src/command_center/orchestrator/queue.py:54-65`
- Create: `tests/test_queue_count.py`

### Steps

- [ ] **3.1: Write failing test**

Create `C:\cc\command-center-backend\tests\test_queue_count.py`:

```python
from __future__ import annotations

import pytest
from sqlalchemy import event

from command_center.db import session as session_module
from command_center.db.models import Task, TaskStatus
from command_center.orchestrator.queue import queue


@pytest.mark.asyncio
async def test_count_by_status_returns_correct_counts() -> None:
    """Popula o DB com tasks de diferentes statuses e verifica contagens."""
    async with session_module.AsyncSessionLocal() as sess:
        sess.add_all([
            Task(title="t1", prompt="p", status=TaskStatus.PENDING),
            Task(title="t2", prompt="p", status=TaskStatus.PENDING),
            Task(title="t3", prompt="p", status=TaskStatus.RUNNING),
            Task(title="t4", prompt="p", status=TaskStatus.DONE),
            Task(title="t5", prompt="p", status=TaskStatus.DONE),
            Task(title="t6", prompt="p", status=TaskStatus.DONE),
            Task(title="t7", prompt="p", status=TaskStatus.FAILED),
        ])
        await sess.commit()

    counts = await queue.count_by_status()

    assert counts.get("pending") == 2
    assert counts.get("running") == 1
    assert counts.get("done") == 3
    assert counts.get("failed") == 1
    # Status sem rows deve aparecer com 0
    assert counts.get("cancelled") == 0
    # Todos os status do enum devem estar presentes
    for s in TaskStatus:
        assert s.value in counts


@pytest.mark.asyncio
async def test_count_by_status_executes_single_query() -> None:
    """count_by_status() deve fazer apenas 1 SELECT (não 1 por status)."""
    async with session_module.AsyncSessionLocal() as sess:
        sess.add(Task(title="t1", prompt="p", status=TaskStatus.PENDING))
        await sess.commit()

    select_count = 0
    sync_engine = session_module.engine.sync_engine

    def _on_execute(conn, cursor, statement, parameters, context, executemany):
        nonlocal select_count
        if statement.lstrip().upper().startswith("SELECT"):
            select_count += 1

    event.listen(sync_engine, "before_cursor_execute", _on_execute)
    try:
        await queue.count_by_status()
    finally:
        event.remove(sync_engine, "before_cursor_execute", _on_execute)

    assert select_count == 1, (
        f"Esperado 1 SELECT (GROUP BY agregado), foi: {select_count}"
    )
```

- [ ] **3.2: Run test — expect FAIL**

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run pytest tests/test_queue_count.py -v
```

Expected: `test_count_by_status_executes_single_query` falha — `select_count > 1` (atual implementação faz N+1).

- [ ] **3.3: Modify queue.py — usar GROUP BY**

Edit `C:\cc\command-center-backend\src\command_center\orchestrator\queue.py`.

Top imports — adicionar `func`. Find:

```python
from sqlalchemy import select
```

Replace with:

```python
from sqlalchemy import func, select
```

Then find the `count_by_status` method:

```python
    async def count_by_status(self) -> dict[str, int]:
        async with session_module.AsyncSessionLocal() as sess:
            counts: dict[str, int] = {}
            for status in TaskStatus:
                n = (
                    await sess.execute(
                        select(Task).where(Task.status == status)
                    )
                ).scalars().all()
                counts[status.value] = len(n)
            return counts
```

Replace with:

```python
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
```

- [ ] **3.4: Run test — expect PASS**

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run pytest tests/test_queue_count.py -v
```

Expected: 2 PASS.

- [ ] **3.5: Run full suite**

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run pytest tests/ --tb=line
```

Expected: 22 passed, 1 failed (pre-existing).

---

## Task 4: B4 — Polling pausa em background

**Files:**
- Modify: `command-center-frontend/src/hooks/use-tasks.ts`
- Modify: `command-center-frontend/src/hooks/use-employees.ts`

### Steps

- [ ] **4.1: Update use-tasks.ts**

Edit `C:\cc\command-center-frontend\src\hooks\use-tasks.ts`. Add `refetchIntervalInBackground: false` to both `useTasks` and `useTask`:

```ts
export function useTasks(filters: { project_id?: number; status?: TaskStatus } = {}) {
  return useQuery({
    queryKey: ["tasks", filters],
    queryFn: () => api.listTasks(filters),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
}

export function useTask(id: number | null | undefined) {
  return useQuery({
    queryKey: ["tasks", id],
    queryFn: () => api.getTask(id!),
    enabled: id != null,
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
  });
}
```

(`useCancelTask` permanece intacto.)

- [ ] **4.2: Update use-employees.ts**

Edit `C:\cc\command-center-frontend\src\hooks\use-employees.ts`:

```ts
export function useEmployees() {
  return useQuery({
    queryKey: ["employees"],
    queryFn: () => api.listEmployees(),
    refetchInterval: 4_000,
    refetchIntervalInBackground: false,
  });
}
```

- [ ] **4.3: Typecheck**

```bash
cd "C:/cc/command-center-frontend" && C:/Users/USER/.local/pnpm-shim/node_modules/.bin/pnpm.cmd typecheck 2>&1 | tail -10
```

Expected: 3 pre-existing errors (`MessageBubble.tsx`, `ProjectInsightCard.tsx`, `WorkerCard.tsx`). NO new errors.

---

## Task 5: Final validation

- [ ] **5.1: Restart backend**

```powershell
$pids = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
$pids | ForEach-Object { try { $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $_" -ErrorAction SilentlyContinue; foreach ($c in $children) { Stop-Process -Id $c.ProcessId -Force -ErrorAction SilentlyContinue }; Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } catch {} }
Start-Sleep 2
```

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run uvicorn command_center.main:app --port 8000 > /tmp/backend8000.log 2>&1 &
sleep 7
curl -s -m 3 http://localhost:8000/health
```

- [ ] **5.2: Smoke test "oi" — verifica custo cai abaixo de $0.20**

```bash
curl -s -m 60 -N -X POST http://localhost:8000/api/chat -H "Content-Type: application/json" -d '{"message":"oi"}' 2>&1 | grep -E '"cost_usd"' | tail -1
```

Expected: total cost_usd <0.20.

- [ ] **5.3: Backend suite**

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run pytest tests/ --tb=line
```

Expected: 22 passed, 1 failed (pre-existing).

- [ ] **5.4: Frontend typecheck**

```bash
cd "C:/cc/command-center-frontend" && C:/Users/USER/.local/pnpm-shim/node_modules/.bin/pnpm.cmd typecheck 2>&1 | tail -5
```

Expected: 3 pre-existing errors only.

---

## Self-review

- ✅ §3.1 (skip report) → Task 1
- ✅ §3.2 (sonnet default) → Task 2
- ✅ §3.3 (GROUP BY) → Task 3
- ✅ §3.4 (background polling) → Task 4
- ✅ §4 acceptance criteria all mapped to verification steps
- ✅ Sem placeholders / TODOs
- ✅ Tipos consistentes (model: str | None)
- ✅ Ordem aplicação respeita independência dos fixes
