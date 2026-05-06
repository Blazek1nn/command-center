# Frente A — Estabilidade

**Data:** 2026-04-28
**Status:** Design aprovado, pronto para virar plano de implementação
**Escopo:** 4 bug fixes que travariam uma demo de portfolio
**Repos afetados:** `command-center-backend`, `command-center-frontend`

---

## 1. Motivação

Auditoria crítica do projeto identificou 28 issues distribuídos em 4 frentes (Estabilidade, Performance, Polish, Wow factor). Esta frente cobre **apenas as 4 falhas que apareceriam numa demo de 5 minutos** — o tipo de bug que um recrutador sênior do Vale do Silício marca como red flag instantâneo.

Os 4 bugs:

1. Race condition no `EventBus` faz com que eventos `task_started`/`task_completed` sejam perdidos antes do subscriber registrar a fila.
2. Frontend mapeia tasks por **título** — duas tarefas com mesmo título embaralham progresso.
3. Stream SSE não tem retry — qualquer flap de rede deixa a UI travada em "Lavrando o relatório…" pra sempre.
4. Subprocess do Claude CLI não é reaped corretamente no Windows ao cancelar — fica `claude.exe` zumbi consumindo recursos.

## 2. Out of scope

Explicitamente **não** atacado nesta frente (vão para frentes seguintes):

- Performance e custo (Manager chamado 2× = $0.29/chat) → Frente B
- Cobertura de testes ampla, CI, migrations Alembic, lint, README de arquitetura → Frente C
- Cost dashboard, plan editing, agent activity stream, memória multi-turn → Frente D

Esta frente entrega **apenas estabilidade** — depois dela, o sistema não trava nem perde dados durante uso normal e flaky network.

## 3. Fixes

### 3.1 Race condition `bus` ↔ `dispatcher`

**Causa:**
`api/chat.py:71-87` cria task `_forward()` que chama `bus.subscribe()`. Usa `forward_started: asyncio.Event` setado **antes** do `async for` registrar a fila no `_subscribers`. Resultado: `forward_started.set()` retorna imediatamente mas a fila ainda não está registrada — eventos publicados pelo dispatcher entre o `set()` e o primeiro `q.get()` são perdidos.

**Solução:**
Substituir o padrão `subscribe()` async generator por uma API síncrona `attach()`/`detach()` que registra a fila imediatamente. Não precisa de `asyncio.Lock` — `list.append`/`list.remove` são atômicas em CPython e só são chamadas a partir do loop principal.

**Mudanças em `command_center/events.py`:**

Adicionar dois métodos em `EventBus`:

```python
def attach(self) -> asyncio.Queue[Event]:
    """Registra um subscriber síncrono. Caller DEVE chamar detach() em finally."""
    q: asyncio.Queue[Event] = asyncio.Queue(maxsize=self._max_buffer)
    self._subscribers.append(q)
    return q

def detach(self, q: asyncio.Queue[Event]) -> None:
    try:
        self._subscribers.remove(q)
    except ValueError:
        pass
```

Manter `subscribe()` async generator existente (ainda usado por `api/events.py`).

**Mudanças em `command_center/api/chat.py`:**

Eliminar `_forward()` task, `forward_started` Event, e `bus_queue` separado. Substituir por:

```python
plan_payload = plan.model_dump()
await bus.publish(Event(type="plan_created", payload=plan_payload))
yield _sse("plan_created", plan_payload)

queue = bus.attach()
try:
    dispatch_task = asyncio.create_task(dispatcher.execute_plan(plan))
    while not dispatch_task.done() or not queue.empty():
        try:
            evt = await asyncio.wait_for(queue.get(), timeout=0.5)
        except TimeoutError:
            continue
        if evt.type in {
            "task_started", "task_progress",
            "task_completed", "task_failed",
        }:
            yield _sse(evt.type, evt.payload)
    result = await dispatch_task
finally:
    bus.detach(queue)
```

### 3.2 Binding por **index** (não título, não task_id)

**Causa:**
`hooks/use-chat.ts:90-93` mapeia eventos `task_started` para tasks do plano via `findTaskIndex(title)` — busca linear por título igual. Plano com tasks de mesmo título → primeira posição sempre ganha → progresso embaralha.

**Por que não usar `task_id`:** task_ids do banco só são gerados dentro de `_execute_one()` (`dispatcher.py:209-227`), depois do `plan_created`. No momento do `plan_created` os IDs não existem.

**Solução:**
Usar o **índice estável do plano** (0-based) como chave de binding. O dispatcher já recebe `index` em `_execute_one(self, index, spec)` — basta incluí-lo no payload dos eventos.

**Mudanças em `command_center/orchestrator/dispatcher.py`:**

Adicionar `"index": index` aos payloads em quatro pontos:

- Linha 130-138 (`task_started`)
- Linha 152-155 (`task_failed` por exceção)
- Linha 167-170 (`task_failed` por result.error)
- Linha 184-194 (`task_completed`)

**Mudanças em `command-center-frontend/src/hooks/use-chat.ts`:**

- Remover helper `findTaskIndex(title)`.
- Em `task_started`/`task_completed`/`task_failed`/`task_progress`, usar `evt.payload.index` diretamente como chave do `tasks` Record.
- Tipos compartilhados em `src/types/events.ts` (ou similar) recebem `index: number` adicionado a cada `Task*Event`.

### 3.3 SSE retry condicional

**Causa:**
`lib/sse.ts:45-46` lança erros de stream sem fallback. `use-chat.ts` mostra "network error" via toast e o estado fica em `phase: "reporting"` (ou anterior) pra sempre.

**Solução (opção C aprovada):**
Auto-retry **uma vez** se a conexão cair **antes** de receber `plan_created`. Depois de `plan_created`, falhas mostram toast com botão de retry manual — porque re-rodar Manager custa ~$0.29 e usuário deve decidir conscientemente.

**Mudanças em `command-center-frontend/src/lib/sse.ts`:**

Aceitar callback opcional na função de stream:

```ts
export type StreamOptions = {
  shouldAutoRetry?: () => boolean;
  retryDelayMs?: number;  // default 2000
  signal?: AbortSignal;
};

export async function* streamSSE(
  url: string,
  body: unknown,
  opts: StreamOptions = {},
): AsyncGenerator<SSEEvent> {
  let attempt = 0;
  while (true) {
    try {
      yield* doStream(url, body, opts.signal);
      return;
    } catch (err) {
      if (attempt >= 1) throw err;
      if (!opts.shouldAutoRetry?.()) throw err;
      attempt++;
      await sleep(opts.retryDelayMs ?? 2000);
    }
  }
}
```

`doStream` é a lógica atual extraída em função interna.

**Mudanças em `command-center-frontend/src/hooks/use-chat.ts`:**

- Adicionar flag local `let planCreated = false` no escopo do `sendMessage`.
- Setar `planCreated = true` ao receber evento `plan_created`.
- Passar `shouldAutoRetry: () => !planCreated` para `streamSSE`.
- No `catch` final do stream:
  - Se `planCreated === false` e a auto-retry falhou também → toast persistente "Falha ao conectar. [Tentar novamente]" (action chama `sendMessage(lastMessage)`).
  - Se `planCreated === true` → toast com mesmo action: "Conexão perdida durante execução. [Refazer]".
- UI: mostrar fase intermediária `"reconnecting"` no `PHASE_LABEL` ("Reconectando…") quando o retry está ativo.

**Mudanças em `command-center-frontend/src/components/chat/ChatStream.tsx`:**

Adicionar entry `reconnecting: "Reconectando…"` em `PHASE_LABEL` e incluir `"reconnecting"` no array `busy`.

### 3.4 Subprocess reaping no Windows

**Causa:**
`agents/claude_runner.py:270-276` finally chama `proc.kill()` mas não espera o processo morrer. No Windows o kill via `TerminateProcess` é assíncrono e o processo pode persistir alguns segundos. Pior: o reader thread é `daemon=True`, então se o processo Python pai termina, a thread morre sem reapar o filho — `claude.exe` fica zumbi.

**Solução:**
Após `proc.kill()`, aguardar o reap com timeout pequeno via `asyncio.to_thread` (não bloqueia o event loop).

**Mudanças em `command_center/agents/claude_runner.py`:**

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

Também aplicar o mesmo padrão no bloco `except asyncio.CancelledError` (linhas 263-269).

## 4. Critérios de aceitação

- [ ] **Race fix:** 100 chats sequenciais → 0 eventos `task_*` perdidos. Teste com plan de 3 tasks paralelas.
- [ ] **Index binding:** plan com 2 tasks de título idêntico → cada uma renderiza output independente.
- [ ] **SSE retry antes de plan_created:** simular drop com `proc.kill()` no backend → frontend reconecta sozinho em ≤3s.
- [ ] **SSE retry depois de plan_created:** simular drop após `plan_created` → toast com botão funcional, sem auto-retry.
- [ ] **Subprocess reap:** rodar chat, cancelar via AbortController durante streaming → após 5s, 0 processos `claude.exe` em `tasklist`.

## 5. Plano de teste

### 5.1 Backend (`pytest`)

- **`tests/test_event_bus_race.py`** (novo): subscriber via `attach()`, publica antes de qualquer `await`, depois `await q.get()` retorna o evento. Versão com `subscribe()` async generator falha (regression check).
- **`tests/test_dispatcher_events_index.py`** (novo): roda `_execute_one(idx=2, spec)` com runner mockado, verifica que todos os 4 tipos de evento (`task_started`/`task_progress`/`task_completed`/`task_failed`) carregam `payload["index"] == 2`.
- **`tests/test_runner_cleanup.py`** (novo): inicia `ClaudeRunner.run()` com prompt longo, cancela via `task.cancel()`, verifica `proc.poll() is not None` em ≤3s.

### 5.2 Frontend (`vitest`)

- **`src/lib/sse.test.ts`** (novo): mock fetch com `ReadableStream`, simular erro mid-stream, verificar 1 retry quando `shouldAutoRetry` retorna true; verificar 0 retries quando retorna false.
- **`src/hooks/use-chat.test.ts`** (novo): smoke test de fluxo completo com SSE mockado, asserts ordem `manager_thinking` → `plan_created` → `task_started` (com index) → `task_completed` (com index) → `manager_report` → `done`.

### 5.3 Manual / smoke

Roteiro de demo escrito em `docs/superpowers/specs/2026-04-28-frente-a-smoke-test.md` (criado junto com a implementação) cobrindo:

1. "oi" → resposta simples chega completa em <60s
2. "rode 2 tasks idênticas em paralelo" → progresso individual visível
3. Pull cabo durante streaming → comportamento correto conforme momento
4. Cancelar via UI → `claude.exe` desaparece do tasklist em <5s

## 6. Risks & open questions

- **Risco 1:** `asyncio.to_thread` em `finally` pode bloquear se o event loop está sendo finalizado (shutdown do servidor). Mitigação: timeout explícito de 3s já está no design.
- **Risco 2:** `bus.attach()` síncrono assume CPython com GIL. Em alternativas (PyPy, free-threading) a `list.append`/`remove` pode não ser atômica. Aceitável: projeto roda CPython 3.13 declaradamente.
- **Open question:** se o retry após `plan_created` for "Refazer" (não "Resume"), o usuário vai ser cobrado 2× pelo Manager. UX deve deixar isso explícito? Decisão deferida pra Frente B (custo) ou Frente C (UX polish).

## 7. Ordem de aplicação

Para revisão incremental, sugerida ordem na implementação:

1. Fix 4 (subprocess reap) — menor blast radius, isolado em runner.
2. Fix 1 (race bus) — fundação para confiabilidade dos próximos.
3. Fix 2 (index binding) — backend + frontend simultâneos.
4. Fix 3 (SSE retry) — depende de tipos do Fix 2 estarem estáveis.

Cada fix vira um commit independente com seus testes.

## 8. Próximo passo

Após aprovação deste spec → `writing-plans` skill gera o plano de implementação concreto (passos, comandos, validações).
