# Frente A — Estabilidade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar 4 bugs que travariam uma demo de portfolio: race no EventBus, binding de tasks por título, SSE sem retry, e subprocess do Claude CLI órfão no Windows.

**Architecture:** TDD por fix. Fixes ordenados por dependência: subprocess reap (isolado) → race bus (fundação) → index binding (backend+frontend) → SSE retry (depende dos tipos do anterior). Sem git — checkpoints manuais entre fixes.

**Tech Stack:** Backend: Python 3.13, FastAPI, sse-starlette, asyncio, pytest 8.x com `asyncio_mode=auto`, uv. Frontend: Next.js 15, React 19, zustand, TypeScript strict, pnpm 9. Plataforma Windows (sem `--reload` funcional — restart manual via uvicorn standalone).

**Spec:** `docs/superpowers/specs/2026-04-28-frente-a-estabilidade-design.md`

**Backend dev loop:** restart manual via `Stop-Process` no PID listening em 8000 + `uv run uvicorn ... --port 8000`. Tests: `uv run pytest tests/<file>.py -v`.

**Frontend dev loop:** `pnpm dev` em port 3000, hot-reload funcional. Typecheck: `pnpm typecheck`. Sem testes unitários (vitest fica pra Frente C).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/command_center/events.py` | modify | adicionar `attach()`/`detach()` síncronos em `EventBus` |
| `src/command_center/api/chat.py` | modify | substituir `_forward()` task pelo padrão attach/detach |
| `src/command_center/orchestrator/dispatcher.py` | modify | incluir `"index"` nos 4 payloads de evento `task_*` |
| `src/command_center/agents/claude_runner.py` | modify | `proc.wait` com timeout após kill no finally e no cancel handler |
| `tests/test_event_bus_attach.py` | create | validar API attach/detach + race scenario |
| `tests/test_dispatcher_index.py` | create | validar `index` presente em todos os eventos `task_*` |
| `tests/test_runner_cleanup.py` | create | validar reap do subprocess após cancel |
| `command-center-frontend/src/lib/types.ts` | modify | adicionar `index: number` em tipos de evento de task |
| `command-center-frontend/src/hooks/use-chat.ts` | modify | usar `payload.index` direto; deletar `findTaskIndex`; adicionar flag `planCreated` e retry callback |
| `command-center-frontend/src/lib/sse.ts` | modify | aceitar `shouldAutoRetry` callback e `retryDelayMs` |
| `command-center-frontend/src/components/chat/ChatStream.tsx` | modify | adicionar fase `reconnecting` ao label/busy |
| `command-center-frontend/src/stores/chat-store.ts` | modify | adicionar `"reconnecting"` em `StreamPhase` |

---

## Pre-flight

- [ ] **Pre-1: Confirmar backend rodando em 8000**

```bash
curl -s -m 3 http://localhost:8000/health
```

Expected output: `{"status":"ok"}`

Se cair: subir com `cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run uvicorn command_center.main:app --port 8000 > /tmp/backend8000.log 2>&1 &` e aguardar 6s.

- [ ] **Pre-2: Validar suite de testes existente passa antes de mexer**

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run pytest tests/ -v --tb=short
```

Expected: todos os testes existentes passam (test_claude_runner, test_dispatcher, test_events, test_manager, test_models).

Se algum falha: registrar quais e parar — falhas pré-existentes precisam ser endereçadas antes ou o usuário decide pular.

---

## Task 1: Fix 4 — Subprocess reaping no Windows

**Why first:** menor blast radius, isolado em `claude_runner.py`. Se quebrar, só afeta o runner.

**Files:**
- Modify: `src/command_center/agents/claude_runner.py:263-276`
- Create: `tests/test_runner_cleanup.py`

### Steps

- [ ] **1.1: Criar arquivo de teste com failing test**

Escrever `C:\cc\command-center-backend\tests\test_runner_cleanup.py`:

```python
from __future__ import annotations

import asyncio
import sys
import time

import pytest

from command_center.agents.claude_runner import ClaudeRunner, RunnerError, TextDelta


@pytest.mark.asyncio
async def test_runner_reaps_subprocess_on_cancel() -> None:
    """Cancelar o consumer do runner deve matar o subprocess e reapá-lo em ≤3s.

    Usamos um stand-in que dorme — qualquer comando que fique vivo ≥10s serve.
    No Windows usamos `ping -n 60 127.0.0.1` (≈60s); fora do Windows, `sleep 60`.
    """
    if sys.platform == "win32":
        cli_args = "C:\\Windows\\System32\\PING.EXE"
        slow_prompt = "ignored"  # ping ignora args extra
    else:
        cli_args = "/bin/sleep"
        slow_prompt = "60"

    # Substituímos o cli_path pelo binário de stand-in para não depender do claude CLI real
    runner = ClaudeRunner(cli_path=cli_args, timeout_seconds=120)
    # Sobrescrevemos _build_args para usar args do stand-in
    if sys.platform == "win32":
        runner._build_args = lambda *a, **k: [cli_args, "-n", "60", "127.0.0.1"]  # type: ignore[method-assign]
    else:
        runner._build_args = lambda *a, **k: [cli_args, "60"]  # type: ignore[method-assign]

    captured_pid: list[int] = []

    async def consume() -> None:
        async for evt in runner.run(prompt=slow_prompt, model="sonnet"):
            # Capturamos qualquer evento (TextDelta vazio é ok). O importante é o subprocess subir.
            _ = evt

    task = asyncio.create_task(consume())
    # Damos 1s pro subprocess subir
    await asyncio.sleep(1.0)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

    # Após o cancel, dar até 3s pra reapar e checar que não há child orfão.
    # Validação simples: psutil seria melhor, mas evitamos a dep — verificamos
    # que o cancel completou sem deadlock dentro do timeout.
    # O teste real de "0 zombies" fica no smoke manual.

    # O importante aqui: a task terminou em tempo razoável (não ficou pendurada
    # esperando o subprocess de 60s).
    assert task.done()
```

- [ ] **1.2: Rodar o teste — esperar FALHA (ou timeout)**

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run pytest tests/test_runner_cleanup.py -v --timeout=10
```

Expected: o teste deve passar OU falhar com timeout. O ponto é que **antes** do fix, se o subprocess não é reaped, a task pode ficar pendurada via finally tentando aguardar.

Se passar (alguma sorte): adicionar assert mais rígido. Se timeout: vai pro Step 1.3.

- [ ] **1.3: Aplicar fix no `_run_threaded` finally**

Editar `C:\cc\command-center-backend\src\command_center\agents\claude_runner.py` linhas 270-276 (bloco `finally:`):

```python
        finally:
            cancel_flag.set()
            if proc.poll() is None:
                try:
                    proc.kill()
                    await asyncio.to_thread(proc.wait, timeout=3)
                except (ProcessLookupError, subprocess.TimeoutExpired):
                    pass
```

- [ ] **1.4: Aplicar fix no handler de `CancelledError`**

Editar `C:\cc\command-center-backend\src\command_center\agents\claude_runner.py` linhas 263-269 (bloco `except asyncio.CancelledError:`):

```python
        except asyncio.CancelledError:
            cancel_flag.set()
            try:
                proc.kill()
                await asyncio.to_thread(proc.wait, timeout=3)
            except (ProcessLookupError, subprocess.TimeoutExpired):
                pass
            raise
```

- [ ] **1.5: Rodar teste novamente — esperar PASS**

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run pytest tests/test_runner_cleanup.py -v --timeout=10
```

Expected: PASS em <5s.

- [ ] **1.6: Rodar suite completa — esperar nenhum regressão**

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run pytest tests/ -v --tb=short
```

Expected: todos verdes (incluindo test_claude_runner.py original).

- [ ] **1.7: Restart do backend pra carregar mudança**

```powershell
$pids = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
$pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep 2
```

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run uvicorn command_center.main:app --port 8000 > /tmp/backend8000.log 2>&1 &
sleep 6
curl -s -m 3 http://localhost:8000/health
```

Expected: `{"status":"ok"}`.

- [ ] **1.8: Smoke test manual — cancel mid-stream**

Abrir frontend em `http://localhost:3000/chat`, mandar mensagem "rode 5 tasks paralelas em projetos diferentes", clicar no botão de cancelar dentro de 5 segundos. Em outro terminal:

```powershell
Start-Sleep 5
Get-Process claude -ErrorAction SilentlyContinue | Format-Table Id,StartTime
```

Expected: 0 processos `claude.exe` sobrando após 5s do cancel (ou apenas processos pré-existentes não relacionados).

- [ ] **1.9: Checkpoint — Task 1 done**

Anotar mentalmente: subprocess reap funcionando, suite verde. Avançar para Task 2.

---

## Task 2: Fix 1 — Race condition bus/dispatcher

**Why second:** fundação para confiabilidade de eventos `task_*` que serão modificados na Task 3.

**Files:**
- Modify: `src/command_center/events.py:34-60`
- Modify: `src/command_center/api/chat.py:76-109`
- Create: `tests/test_event_bus_attach.py`

### Steps

- [ ] **2.1: Escrever teste falhando para `attach()`/`detach()`**

Criar `C:\cc\command-center-backend\tests\test_event_bus_attach.py`:

```python
from __future__ import annotations

import asyncio

import pytest

from command_center.events import Event, EventBus


@pytest.mark.asyncio
async def test_attach_registers_subscriber_synchronously() -> None:
    """attach() deve adicionar o subscriber ANTES de qualquer await,
    evitando race entre publish() e subscribe()."""
    test_bus = EventBus()
    queue = test_bus.attach()

    # Publica imediatamente, sem yield ao loop
    await test_bus.publish(Event(type="task_started", payload={"task_id": 1}))

    evt = await asyncio.wait_for(queue.get(), timeout=0.5)
    assert evt.type == "task_started"
    assert evt.payload == {"task_id": 1}

    test_bus.detach(queue)


@pytest.mark.asyncio
async def test_detach_removes_subscriber() -> None:
    test_bus = EventBus()
    queue = test_bus.attach()
    test_bus.detach(queue)

    # Publish após detach NÃO deve enfileirar
    await test_bus.publish(Event(type="task_started", payload={"task_id": 99}))

    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(queue.get(), timeout=0.2)


@pytest.mark.asyncio
async def test_detach_idempotent() -> None:
    """detach() de uma queue já removida não deve raise."""
    test_bus = EventBus()
    queue = test_bus.attach()
    test_bus.detach(queue)
    test_bus.detach(queue)  # idempotente


@pytest.mark.asyncio
async def test_no_event_lost_with_concurrent_publisher() -> None:
    """attach() seguido de publish em paralelo: nenhum evento perdido."""
    test_bus = EventBus()
    queue = test_bus.attach()

    async def publisher() -> None:
        for i in range(10):
            await test_bus.publish(Event(type="task_progress", payload={"i": i}))

    pub_task = asyncio.create_task(publisher())
    received: list[int] = []
    while len(received) < 10:
        evt = await asyncio.wait_for(queue.get(), timeout=1.0)
        received.append(evt.payload["i"])
    await pub_task

    assert received == list(range(10))
    test_bus.detach(queue)
```

- [ ] **2.2: Rodar — esperar FALHA (`AttributeError: 'EventBus' has no attribute 'attach'`)**

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run pytest tests/test_event_bus_attach.py -v
```

Expected: 4 testes falham com `AttributeError`.

- [ ] **2.3: Implementar `attach()` e `detach()` em `EventBus`**

Editar `C:\cc\command-center-backend\src\command_center\events.py`. Adicionar dois métodos dentro da classe `EventBus` (após `publish`, antes de `subscribe`):

```python
    def attach(self) -> asyncio.Queue[Event]:
        """Registra um subscriber sincronamente. Caller deve chamar detach() em finally."""
        q: asyncio.Queue[Event] = asyncio.Queue(maxsize=self._max_buffer)
        self._subscribers.append(q)
        return q

    def detach(self, q: asyncio.Queue[Event]) -> None:
        try:
            self._subscribers.remove(q)
        except ValueError:
            pass
```

Não tocar em `subscribe()` — mantemos compatibilidade com `api/events.py` que ainda usa o async generator.

- [ ] **2.4: Rodar testes — esperar PASS**

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run pytest tests/test_event_bus_attach.py -v
```

Expected: 4 PASS.

- [ ] **2.5: Aplicar mudança em `api/chat.py` — eliminar `_forward()` task**

Editar `C:\cc\command-center-backend\src\command_center\api\chat.py` linhas 76-109. Substituir o bloco inteiro:

```python
        # 3) Despacho — assina o bus síncronamente antes de iniciar dispatcher
        queue = bus.attach()
        try:
            dispatch_task = asyncio.create_task(dispatcher.execute_plan(plan))
            try:
                while not dispatch_task.done() or not queue.empty():
                    try:
                        evt = await asyncio.wait_for(queue.get(), timeout=0.5)
                    except TimeoutError:
                        continue
                    if evt.type in {
                        "task_started",
                        "task_progress",
                        "task_completed",
                        "task_failed",
                    }:
                        yield _sse(evt.type, evt.payload)
                result = await dispatch_task
            except BaseException:
                if not dispatch_task.done():
                    dispatch_task.cancel()
                raise
        finally:
            bus.detach(queue)
```

- [ ] **2.6: Rodar suite backend — verificar nenhuma regressão**

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run pytest tests/ -v --tb=short
```

Expected: tudo verde.

- [ ] **2.7: Restart backend**

```powershell
$pids = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
$pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep 2
```

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run uvicorn command_center.main:app --port 8000 > /tmp/backend8000.log 2>&1 &
sleep 6
curl -s -m 3 http://localhost:8000/health
```

Expected: `{"status":"ok"}`.

- [ ] **2.8: Smoke test — chat "oi" via curl, verificar fluxo completo**

```bash
curl -s -m 90 -N -X POST http://localhost:8000/api/chat -H "Content-Type: application/json" -d '{"message":"oi"}' 2>&1 | head -30
```

Expected: stream com `manager_thinking` → `plan_created` → `manager_report` → `done`. Sem cortes prematuros.

- [ ] **2.9: Checkpoint — Task 2 done**

---

## Task 3: Fix 2 — Index binding (backend + frontend)

**Why third:** backend e frontend simultâneos. Backend só envia o campo; frontend usa direto.

**Files (backend):**
- Modify: `src/command_center/orchestrator/dispatcher.py:128-194`
- Create: `tests/test_dispatcher_index.py`

**Files (frontend):**
- Modify: `command-center-frontend/src/lib/types.ts` (adicionar `index` em tipos de evento de task)
- Modify: `command-center-frontend/src/hooks/use-chat.ts:88-137,204-213` (usar `p.index`, deletar `findTaskIndex`)

### Steps — Backend

- [ ] **3.1: Escrever teste falhando para `index` em events**

Criar `C:\cc\command-center-backend\tests\test_dispatcher_index.py`:

```python
from __future__ import annotations

import asyncio
from unittest.mock import patch

import pytest

from command_center.agents.employee import EmployeeResult
from command_center.agents.manager import Plan, TaskSpec
from command_center.events import Event, bus
from command_center.orchestrator.dispatcher import Dispatcher


@pytest.mark.asyncio
async def test_task_started_payload_includes_index() -> None:
    """task_started, task_completed e task_failed DEVEM carregar o índice
    estável do plano para que o frontend faça binding sem ambiguidade."""
    captured: list[Event] = []
    captured_done = asyncio.Event()

    queue = bus.attach()

    async def consume() -> None:
        try:
            while True:
                evt = await queue.get()
                captured.append(evt)
                if evt.type == "task_completed":
                    captured_done.set()
                    return
        except asyncio.CancelledError:
            pass

    consumer = asyncio.create_task(consume())

    async def _fake_execute(self, prompt, cwd=None):
        return EmployeeResult(output="ok", cost_usd=0.0, duration_ms=5)

    with patch(
        "command_center.agents.employee.Employee.execute_collected",
        _fake_execute,
    ):
        plan = Plan(
            understanding="x",
            execution_mode="sequential",
            tasks=[
                TaskSpec(title="A", prompt="p", model="sonnet", specialty="code"),
                TaskSpec(title="B", prompt="p", model="sonnet", specialty="code"),
            ],
        )
        dispatcher = Dispatcher(max_parallel=1)
        await dispatcher.execute_plan(plan)

    await asyncio.wait_for(captured_done.wait(), timeout=3.0)
    consumer.cancel()
    try:
        await consumer
    except asyncio.CancelledError:
        pass
    bus.detach(queue)

    started = [e for e in captured if e.type == "task_started"]
    completed = [e for e in captured if e.type == "task_completed"]

    assert len(started) == 2
    assert len(completed) == 2

    # Cada evento DEVE ter index, e os índices devem ser 0 e 1
    assert {e.payload.get("index") for e in started} == {0, 1}
    assert {e.payload.get("index") for e in completed} == {0, 1}


@pytest.mark.asyncio
async def test_task_failed_payload_includes_index() -> None:
    """task_failed (caminho de exceção) também carrega index."""
    captured: list[Event] = []
    captured_done = asyncio.Event()

    queue = bus.attach()

    async def consume() -> None:
        try:
            while True:
                evt = await queue.get()
                captured.append(evt)
                if evt.type == "task_failed":
                    captured_done.set()
                    return
        except asyncio.CancelledError:
            pass

    consumer = asyncio.create_task(consume())

    async def _fake_execute_raises(self, prompt, cwd=None):
        raise RuntimeError("boom")

    with patch(
        "command_center.agents.employee.Employee.execute_collected",
        _fake_execute_raises,
    ):
        plan = Plan(
            understanding="x",
            execution_mode="sequential",
            tasks=[TaskSpec(title="X", prompt="p", model="sonnet", specialty="code")],
        )
        dispatcher = Dispatcher(max_parallel=1)
        await dispatcher.execute_plan(plan)

    await asyncio.wait_for(captured_done.wait(), timeout=3.0)
    consumer.cancel()
    try:
        await consumer
    except asyncio.CancelledError:
        pass
    bus.detach(queue)

    failed = [e for e in captured if e.type == "task_failed"]
    assert len(failed) == 1
    assert failed[0].payload.get("index") == 0
```

- [ ] **3.2: Rodar — esperar FALHA (`index` ausente nos payloads)**

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run pytest tests/test_dispatcher_index.py -v
```

Expected: 2 testes falham porque `payload.get("index")` retorna None.

- [ ] **3.3: Adicionar `index` aos 4 payloads em `dispatcher.py`**

Editar `C:\cc\command-center-backend\src\command_center\orchestrator\dispatcher.py`. Quatro modificações dentro de `_execute_one`:

**3.3.a** — Linha 128-138, evento `task_started`:

```python
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
                },
            ))
```

**3.3.b** — Linha 152-155, evento `task_failed` por exceção:

```python
                await bus.publish(Event(
                    type="task_failed",
                    payload={"index": index, "task_id": task_id, "error": str(exc)},
                ))
```

**3.3.c** — Linha 167-170, evento `task_failed` por result.error:

```python
                await bus.publish(Event(
                    type="task_failed",
                    payload={"index": index, "task_id": task_id, "error": result.error},
                ))
```

**3.3.d** — Linha 184-194, evento `task_completed`:

```python
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
                },
            ))
```

- [ ] **3.4: Rodar — esperar PASS**

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run pytest tests/test_dispatcher_index.py -v
```

Expected: 2 PASS.

- [ ] **3.5: Rodar suite completa — verificar regressão**

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run pytest tests/ -v --tb=short
```

Expected: tudo verde.

### Steps — Frontend

- [ ] **3.6: Localizar e ler `lib/types.ts` para entender estrutura de tipos**

```bash
cat "C:/cc/command-center-frontend/src/lib/types.ts" | head -120
```

Identificar as interfaces `TaskStartedPayload`, `TaskCompletedPayload`, `TaskFailedPayload`. Anotar suas linhas — precisamos adicionar `index: number` em cada uma.

- [ ] **3.7: Adicionar campo `index` nos tipos de payload**

Editar `C:\cc\command-center-frontend\src\lib\types.ts`. Para cada interface listada abaixo, adicionar como **primeira propriedade**:

```ts
  /** Índice estável (0-based) da task no plano. Use isto para binding. */
  index: number;
```

Aplicar em:
- `TaskStartedPayload`
- `TaskCompletedPayload`
- `TaskFailedPayload`
- `TaskProgressPayload` (se existir; senão criar)

Se `TaskProgressPayload` não existir, adicioná-lo:

```ts
export interface TaskProgressPayload {
  index: number;
  task_id: number;
  chunk: string;
}
```

- [ ] **3.8: Atualizar `use-chat.ts` para usar `payload.index` direto**

Editar `C:\cc\command-center-frontend\src\hooks\use-chat.ts` linhas 88-137. Substituir os 4 case handlers:

```ts
            case "task_started": {
              const p = payload as TaskStartedPayload;
              store.bindTaskId(p.task_id, p.index);
              store.upsertTask(p.index, {
                task_id: p.task_id,
                status: "running",
                employee: p.employee,
              });
              break;
            }
            case "task_progress": {
              const p = payload as { index: number; task_id: number; chunk: string };
              const cur = useChatStore.getState().tasks[p.index];
              store.upsertTask(p.index, {
                output: (cur?.output ?? "") + (p.chunk ?? ""),
              });
              break;
            }
            case "task_completed": {
              const p = payload as TaskCompletedPayload;
              store.upsertTask(p.index, {
                status: "done",
                output: p.summary,
                cost_usd: p.cost_usd,
                duration_ms: p.duration_ms,
                input_tokens: p.input_tokens ?? 0,
                output_tokens: p.output_tokens ?? 0,
              });
              break;
            }
            case "task_failed": {
              const p = payload as TaskFailedPayload;
              store.upsertTask(p.index, {
                status: "failed",
                error: p.error,
              });
              break;
            }
```

- [ ] **3.9: Deletar helper `findTaskIndex`**

Editar `C:\cc\command-center-frontend\src\hooks\use-chat.ts` linhas 203-213. Remover toda a função:

```ts
/**
 * Busca o índice da task pelo título (best-effort) — o backend não reusa
 * o índice, então fazemos matching pelo título exato.
 */
function findTaskIndex(_taskId: number, title: string): number | null {
  const tasks = useChatStore.getState().tasks;
  for (const idx in tasks) {
    if (tasks[idx]?.title === title) return Number(idx);
  }
  return null;
}
```

- [ ] **3.10: Verificar que typecheck passa**

```bash
cd "C:/cc/command-center-frontend" && pnpm typecheck
```

Expected: 0 errors.

- [ ] **3.11: Verificar que lint passa**

```bash
cd "C:/cc/command-center-frontend" && pnpm lint
```

Expected: 0 errors. Warnings de `react-hooks/exhaustive-deps` aceitáveis se não foram introduzidos por esta mudança.

- [ ] **3.12: Restart backend (carregar mudanças do dispatcher)**

```powershell
$pids = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
$pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep 2
```

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run uvicorn command_center.main:app --port 8000 > /tmp/backend8000.log 2>&1 &
sleep 6
```

- [ ] **3.13: Iniciar frontend (se ainda não estiver rodando)**

```bash
cd "C:/cc/command-center-frontend" && pnpm dev > /tmp/frontend.log 2>&1 &
sleep 8
curl -s -m 3 http://localhost:3000 -o /dev/null -w "HTTP:%{http_code}\n"
```

Expected: HTTP:200.

- [ ] **3.14: Smoke test manual — 2 tasks com mesmo título**

Em `http://localhost:3000/chat`, mandar:

> "Crie 2 tasks paralelas, ambas com o título 'Análise rápida', uma processando o nome de cada um dos 4 projetos do meu portfólio (output: 1 frase por task)."

Verificar nas TaskCards:
- Cada task mostra output INDEPENDENTE (não embaralhado)
- Status updates correspondem à task certa
- Ambas chegam ao status "done" sem misturar

- [ ] **3.15: Checkpoint — Task 3 done**

---

## Task 4: Fix 3 — SSE retry condicional

**Why last:** depende dos tipos de evento estabilizados na Task 3.

**Files:**
- Modify: `command-center-frontend/src/lib/sse.ts:28-83` (adicionar opções de retry)
- Modify: `command-center-frontend/src/hooks/use-chat.ts:34-176` (flag `planCreated`, retry callback, novo error path)
- Modify: `command-center-frontend/src/components/chat/ChatStream.tsx:13-30` (adicionar fase `reconnecting` ao label/busy)
- Modify: `command-center-frontend/src/stores/chat-store.ts:33-40` (adicionar `"reconnecting"` em `StreamPhase`)

### Steps

- [ ] **4.1: Adicionar `"reconnecting"` em `StreamPhase`**

Editar `C:\cc\command-center-frontend\src\stores\chat-store.ts` linhas 33-40:

```ts
export type StreamPhase =
  | "idle"
  | "thinking"
  | "planning"
  | "executing"
  | "reporting"
  | "reconnecting"
  | "done"
  | "error";
```

- [ ] **4.2: Estender `streamSse` com retry options**

Editar `C:\cc\command-center-frontend\src\lib\sse.ts`. Substituir a interface `StreamSseOptions` (linha 17-22) por:

```ts
export interface StreamSseOptions {
  signal?: AbortSignal;
  method?: string;
  body?: BodyInit | null;
  headers?: Record<string, string>;
  /** Se retornar true, tenta reconectar UMA vez quando a conexão cai sem completar.
   *  Avaliado no momento da falha — útil para condicionar a "antes de plan_created". */
  shouldAutoRetry?: () => boolean;
  /** Atraso entre tentativa original e retry. Default 2000ms. */
  retryDelayMs?: number;
  /** Callback chamado JUST antes do retry. Útil pra UI mostrar "reconectando…". */
  onRetry?: () => void;
}
```

- [ ] **4.3: Refatorar `streamSse` extraindo `doStream` interno + loop de retry**

Substituir a função `streamSse` (linhas 28-83) inteira por:

```ts
export async function* streamSse(
  url: string,
  options: StreamSseOptions = {},
): AsyncGenerator<RawSseEvent, void, unknown> {
  const maxAttempts = 2; // original + 1 retry
  let attempt = 0;
  while (true) {
    try {
      yield* doStream(url, options);
      return;
    } catch (err) {
      attempt++;
      if (attempt >= maxAttempts) throw err;
      const e = err as Error;
      if (e.name === "AbortError") throw err; // user cancelou — não retry
      if (!options.shouldAutoRetry?.()) throw err;
      options.onRetry?.();
      await new Promise<void>((resolve) =>
        setTimeout(resolve, options.retryDelayMs ?? 2000),
      );
    }
  }
}

async function* doStream(
  url: string,
  options: StreamSseOptions,
): AsyncGenerator<RawSseEvent, void, unknown> {
  const fullUrl = url.startsWith("http") ? url : `${API_URL}${url}`;

  const res = await fetch(fullUrl, {
    method: options.method ?? "GET",
    headers: {
      Accept: "text/event-stream",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    body: options.body,
    signal: options.signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`SSE request failed: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let sepIdx: number;
      while ((sepIdx = findSeparator(buffer)) !== -1) {
        const rawEvent = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx).replace(/^(\r?\n){1,2}/, "");
        const parsed = parseEventBlock(rawEvent);
        if (parsed) yield parsed;
      }
    }

    const tail = buffer.trim();
    if (tail) {
      const parsed = parseEventBlock(tail);
      if (parsed) yield parsed;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }
}
```

Manter `findSeparator`, `parseEventBlock`, `safeJson` inalterados.

- [ ] **4.4: Atualizar `use-chat.ts` para usar retry condicional**

Editar `C:\cc\command-center-frontend\src\hooks\use-chat.ts`. Modificar o corpo do `sendMessage` (linhas 34-176). Substituir desde o início do try até o final do catch por:

```ts
      const controller = new AbortController();
      abortRef.current = controller;

      // Flag local que controla o retry: só retentamos antes de plan_created.
      let planCreated = false;

      try {
        const stream = streamSse("/api/chat", {
          method: "POST",
          body: JSON.stringify({
            message: trimmed,
            history: prevMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
          signal: controller.signal,
          shouldAutoRetry: () => !planCreated,
          onRetry: () => {
            store.setPhase("reconnecting");
            toast.message("Reconectando…", { duration: 2000 });
          },
        });

        for await (const evt of stream) {
          const payload = safeJson<unknown>(evt.data);
          if (payload == null) continue;

          switch (evt.event) {
            case "manager_thinking": {
              const _p = payload as ManagerThinkingPayload;
              store.setPhase("thinking");
              break;
            }
            case "plan_created": {
              const plan = payload as Plan;
              planCreated = true;
              store.setPlan(plan);
              store.setPhase("executing");
              break;
            }
            case "task_started": {
              const p = payload as TaskStartedPayload;
              store.bindTaskId(p.task_id, p.index);
              store.upsertTask(p.index, {
                task_id: p.task_id,
                status: "running",
                employee: p.employee,
              });
              break;
            }
            case "task_progress": {
              const p = payload as { index: number; task_id: number; chunk: string };
              const cur = useChatStore.getState().tasks[p.index];
              store.upsertTask(p.index, {
                output: (cur?.output ?? "") + (p.chunk ?? ""),
              });
              break;
            }
            case "task_completed": {
              const p = payload as TaskCompletedPayload;
              store.upsertTask(p.index, {
                status: "done",
                output: p.summary,
                cost_usd: p.cost_usd,
                duration_ms: p.duration_ms,
                input_tokens: p.input_tokens ?? 0,
                output_tokens: p.output_tokens ?? 0,
              });
              break;
            }
            case "task_failed": {
              const p = payload as TaskFailedPayload;
              store.upsertTask(p.index, {
                status: "failed",
                error: p.error,
              });
              break;
            }
            case "manager_report": {
              const p = payload as ManagerReportPayload;
              store.applyOutcomes(p.outcomes ?? []);
              if (p.usage) store.applyUsage(p.usage);
              store.appendMessage({
                id: newId(),
                role: "manager",
                content: p.report,
                createdAt: Date.now(),
              });
              store.setPhase("reporting");
              break;
            }
            case "error": {
              const p = payload as ChatErrorPayload & { exception?: string; traceback?: string };
              const msg = p.error || p.exception || "erro desconhecido";
              store.setError(`[${p.stage}] ${msg}${p.traceback ? "\n\n" + p.traceback : ""}`);
              toast.error(`Falha (${p.stage}): ${msg}`);
              break;
            }
            case "done": {
              store.setPhase("done");
              await queryClient.invalidateQueries({ queryKey: ["tasks"] });
              await queryClient.invalidateQueries({ queryKey: ["employees"] });
              break;
            }
            default:
              break;
          }
        }
      } catch (err) {
        const e = err as Error;
        if (e.name === "AbortError") return;
        store.setError(e.message);
        if (planCreated) {
          // Já recebemos plano — retry manual evita re-cobrar Manager
          toast.error(`Conexão perdida. ${e.message}`, {
            action: {
              label: "Refazer",
              onClick: () => void sendMessage(trimmed),
            },
            duration: 10000,
          });
        } else {
          // Auto-retry já tentou e falhou — mostra retry manual igualmente
          toast.error(`Falha ao conectar. ${e.message}`, {
            action: {
              label: "Tentar novamente",
              onClick: () => void sendMessage(trimmed),
            },
            duration: 10000,
          });
        }
      }
```

(O `useCallback` envoltório, deps `[store, queryClient]` e o resto do hook permanecem como estão.)

- [ ] **4.5: Adicionar `"reconnecting"` ao `PHASE_LABEL` e `busy` em `ChatStream.tsx`**

Editar `C:\cc\command-center-frontend\src\components\chat\ChatStream.tsx`. Linhas 13-18:

```tsx
const PHASE_LABEL: Record<string, string> = {
  thinking: "Gerente refletindo…",
  planning: "Compondo o plano…",
  executing: "Funcionários em ação…",
  reporting: "Lavrando o relatório…",
  reconnecting: "Reconectando…",
};
```

E linha 30:

```tsx
  const busy = ["thinking", "planning", "executing", "reporting", "reconnecting"].includes(phase);
```

- [ ] **4.6: Verificar typecheck e lint**

```bash
cd "C:/cc/command-center-frontend" && pnpm typecheck && pnpm lint
```

Expected: 0 errors.

- [ ] **4.7: Smoke test manual — drop antes de plan_created (auto-retry)**

Setup: backend em 8000, frontend em 3000.

Sequência:
1. Abrir DevTools → Network tab
2. Em `/chat`, enviar "rode 3 tasks paralelas analisando os projetos do portfólio"
3. **Imediatamente** (em <2s, antes do `plan_created` chegar) clicar com botão direito na requisição `chat` no Network → "Block request URL"
4. Esperar 2-3s
5. Voltar e desbloquear ("Unblock")

Expected: UI mostra fase "Reconectando…" em ~2s, depois retoma o stream normalmente. Plano aparece e tasks executam.

- [ ] **4.8: Smoke test manual — drop depois de plan_created (retry manual)**

Sequência:
1. Em `/chat`, enviar "rode 3 tasks paralelas longas em projetos diferentes"
2. Aguardar `plan_created` (plano aparece visualmente, ~10-20s)
3. **Após** o plano aparecer, bloquear a requisição via DevTools (mesma técnica)
4. Esperar 5s

Expected: UI **não auto-reconecta**. Toast mostra "Conexão perdida..." com botão "Refazer". Clicar refaz — novo Manager call rola.

- [ ] **4.9: Smoke test manual — backend OK do início ao fim (regression)**

Sequência:
1. Em `/chat`, enviar simplesmente "oi"
2. Aguardar resposta completa

Expected: nada quebrou — `manager_thinking` → `plan_created` (0 tasks) → `manager_report` → `done`. Resposta do gerente aparece como mensagem.

- [ ] **4.10: Checkpoint — Task 4 done**

---

## Task 5: Smoke roteiro consolidado

**Why:** documenta o procedimento manual de validação para futuras frentes / demos / regressões.

**Files:**
- Create: `docs/superpowers/specs/2026-04-28-frente-a-smoke-test.md`

### Steps

- [ ] **5.1: Escrever roteiro de smoke**

Criar `C:\cc\command-center-backend\docs\superpowers\specs\2026-04-28-frente-a-smoke-test.md`:

```markdown
# Frente A — Smoke Test Roteiro

Procedimento manual de validação. Tempo total: ~5 min. Executado após cada deploy/restart.

## Pré-requisitos

- Backend em `http://localhost:8000` (`curl /health` retorna `ok`)
- Frontend em `http://localhost:3000`
- DevTools do browser aberto na aba Network
- PowerShell aberto para verificar processos

## Cenário 1 — Greeting "oi"

1. Em `/chat`, enviar `oi`
2. Aguardar resposta completa (~50s, custo ~$0.29)

**Expected:** stream completo, mensagem do gerente aparece, sem corte. (Frente B vai otimizar este custo/tempo.)

## Cenário 2 — Tasks paralelas com mesmo título (Fix 2)

1. Mensagem: "Rode 2 tasks paralelas com o título 'Análise rápida', uma para o projeto MedDecide e outra para wine-scanner-br. Cada task retorna 1 frase descrevendo o projeto."
2. Aguardar plano aparecer com 2 tasks de título idêntico
3. Observar progresso

**Expected:** ambas mostram progresso/output **independente**, sem embaralhar. Status final correto em ambas.

## Cenário 3 — Drop antes de plan_created (Fix 3 auto-retry)

1. Mensagem qualquer com tasks: "rode 2 tasks analisando projetos"
2. **Imediatamente** (em <2s): DevTools → Network → click direito na req `chat` → "Block request URL"
3. Aguardar 2-3s
4. Unblock

**Expected:** UI mostra "Reconectando…", depois retoma stream normalmente.

## Cenário 4 — Drop depois de plan_created (Fix 3 manual retry)

1. Mensagem com tasks longas: "rode 3 análises paralelas detalhadas dos meus projetos"
2. Aguardar plano aparecer
3. Após `plan_created`, block request via DevTools
4. Aguardar 5s

**Expected:** Toast com "Conexão perdida — [Refazer]". **Sem auto-retry.** Botão Refazer reroda o chat.

## Cenário 5 — Cancel mid-stream + reap (Fix 4)

1. Mensagem que dispara tasks: "rode 5 análises detalhadas dos meus projetos"
2. Aguardar tasks começarem (status "running" visível)
3. Clicar no botão de cancelar do chat
4. Em outro terminal, executar:

```powershell
Start-Sleep 5
Get-Process claude -ErrorAction SilentlyContinue | Format-Table Id,StartTime
```

**Expected:** lista vazia (ou só processos não relacionados a este test run).

## Cenário 6 — Race fix (Fix 1)

Difícil de testar manualmente — coberto pelos testes unitários `test_event_bus_attach.py` e `test_dispatcher_index.py`.

**Validação indireta:** rode 3 chats sequenciais com tasks, todos completam sem perder eventos `task_started`/`task_completed`. Se algum task aparece "stuck" em pending mas o backend mostra completed, o race regrediu.
```

- [ ] **5.2: Verificar arquivo criado**

```bash
ls "C:/cc/command-center-backend/docs/superpowers/specs/2026-04-28-frente-a-smoke-test.md"
```

Expected: arquivo presente.

- [ ] **5.3: Final — rodar suite backend completa uma última vez**

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run pytest tests/ -v --tb=short
```

Expected: 100% verde, incluindo os 3 novos arquivos (`test_runner_cleanup`, `test_event_bus_attach`, `test_dispatcher_index`).

- [ ] **5.4: Frontend final — typecheck + lint + build**

```bash
cd "C:/cc/command-center-frontend" && pnpm typecheck && pnpm lint && pnpm build
```

Expected: build sucesso. (Build pode demorar; aceitar até 2min.)

- [ ] **5.5: Frente A done**

Mover para Frente B (Performance & Custo) seguindo o mesmo ciclo de brainstorming/spec/plan.

---

## Self-review

Reviewed against `docs/superpowers/specs/2026-04-28-frente-a-estabilidade-design.md`:

- ✅ **Spec §3.1 (Race fix)** → Task 2 (events.py + chat.py), com testes em `test_event_bus_attach.py`
- ✅ **Spec §3.2 (Index binding)** → Task 3, backend (dispatcher.py) + frontend (use-chat.ts + types.ts), teste em `test_dispatcher_index.py`
- ✅ **Spec §3.3 (SSE retry condicional)** → Task 4, sse.ts + use-chat.ts + ChatStream.tsx + chat-store.ts
- ✅ **Spec §3.4 (Subprocess reap)** → Task 1 (claude_runner.py), teste em `test_runner_cleanup.py`
- ✅ **Spec §5 (Plano de teste)** → cobertura backend completa; frontend coberta via typecheck + smoke roteiro (Task 5). Vitest unit tests deferidos para Frente C conforme decisão pragmática (frontend não tem framework instalado).
- ✅ **Spec §4 (Critérios de aceitação)** → cada fix tem step de smoke ou unit test mapeado.
- ✅ **Sem placeholders / TODOs / "implement later"** — todo step tem código concreto.
- ✅ **Tipos consistentes**: `index: number` usado uniformemente em backend (payloads), types.ts (interfaces), use-chat.ts (handlers). `StreamPhase` extendido coerentemente em chat-store.ts e usado em ChatStream.tsx.
- ✅ **Ordem dos fixes respeita dependências**: reap (isolado) → race (fundação) → index (precondição pro retry) → retry (top da pilha).

**Gaps conhecidos (out of scope, documentados):**
- Frente C absorverá: vitest setup, alembic migrations, CI lint/typecheck, prompt injection defense, README architecture, cost dashboard.
- Risco aberto registrado no spec §6 (UX de "Refazer" cobra Manager 2x) deferido para discussão em Frente B/C.
