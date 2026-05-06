# Frente B — Performance & Custo

**Data:** 2026-04-28
**Status:** Design aprovado
**Escopo:** 4 fixes de custo e performance
**Repos afetados:** `command-center-backend`, `command-center-frontend`

---

## 1. Motivação

Auditoria identificou que o chat custa ~$0.29 e leva 41-52s mesmo para um simples "oi", pois o Manager (Opus, ~$15/M input) é chamado 2 vezes: uma para `plan()` e outra para `report()`. Na ausência de tasks, o report é redundante. Quando há tasks, o report é apenas síntese — sonnet (~$3/M input) sintetiza bem por 1/5 do custo.

Frontend também faz polling cego de `/api/tasks` e `/api/employees` mesmo quando a aba não tem foco; e `count_by_status` na queue faz N+1.

## 2. Out of scope

- Streaming text-deltas do plan em tempo real (UX wow factor) → Frente D
- Engineering polish (testes, CI, migrations, prompt injection defense) → Frente C
- Cost dashboard agregado → Frente D

## 3. Fixes

### 3.1 Skip `Manager.report()` quando plano vazio (B1)

**Causa:** `api/chat.py:149-152` chama `manager.report(plan, [])` mesmo quando `plan.tasks == []`. Isso roda Opus por ~15s só pra dizer "não havia trabalho a fazer". Custa $0.15/call.

**Solução:** se `plan.tasks` está vazio, gerar mensagem template em PT-BR diretamente em `chat.py`, sem rodar runner. O usage do report fica zero (não há call).

**Mudança em `api/chat.py`:** dentro do bloco `# 4) Relatório final`, ANTES do `try: report = await manager.report(...)`, adicionar guard:

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

### 3.2 `Manager.report()` usa sonnet por padrão (B2)

**Causa:** `Manager.report()` em `agents/manager.py:152-156` usa `self.model` que é opus. Síntese de relatório não exige Opus — Sonnet é 5x mais barato e qualitativamente suficiente.

**Solução:** adicionar parâmetro opcional `model` em `Manager.report()` com default `"sonnet"`. Manter `self.model` (opus) como o **plan model**; usar argumento explícito para o report.

**Mudança em `agents/manager.py`:**

Substituir a assinatura de `report` e o `self.runner.run(... model=self.model ...)`:

```python
    async def report(
        self,
        plan: Plan,
        results: list[dict],
        model: str | None = None,
    ) -> str:
        report_model = model or "sonnet"
        plan_json = plan.model_dump_json(indent=2)
        results_json = json.dumps(results, ensure_ascii=False, indent=2, default=str)
        prompt = (
            # ... (mantém)
        )
        parts: list[str] = []
        async for event in self.runner.run(
            prompt=prompt,
            model=report_model,
            system_prompt=self.system_prompt,
        ):
            # ... (mantém)
        return "".join(parts)
```

`api/chat.py` continua chamando `manager.report(plan, outcomes_payload)` sem mudanças — o default `"sonnet"` cuida do resto. (Mas o caller pode override se quiser.)

### 3.3 N+1 em `count_by_status` (B3)

**Causa:** `orchestrator/queue.py:54-65` itera sobre cada `TaskStatus` enum value e dispara um `SELECT * FROM tasks WHERE status = X` por iteração. Para 5 statuses → 5 queries; cada uma carrega TODOS os rows daquele status só pra contar (`scalars().all()` + `len()`). Em uma DB com 1000 tasks, isso são 5 queries pesadas.

**Solução:** uma única query `SELECT status, COUNT(*) GROUP BY status`, depois preencher zeros para statuses ausentes.

**Mudança em `orchestrator/queue.py`:**

```python
    async def count_by_status(self) -> dict[str, int]:
        from sqlalchemy import func, select

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

(Os imports de `func` e `select` já existem no módulo — `select` está importado no topo, `func` precisa adicionar.)

### 3.4 Polling pausado em background (B4)

**Causa:** `useTasks` (refetchInterval 5s), `useTask` (3s) e `useEmployees` (4s) continuam fazendo requests mesmo com aba inativa. Em mobile celular = bateria + bandwidth.

**Solução:** adicionar `refetchIntervalInBackground: false` explicitamente nos 3 hooks. Default no React Query v5 já é false na maioria dos casos, mas sendo explícito blinda contra mudanças futuras + serve como contrato visível para outros devs.

**Mudança em `src/hooks/use-tasks.ts`:**

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

**Mudança em `src/hooks/use-employees.ts`:**

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

## 4. Critérios de aceitação

- [ ] **B1:** Chat com mensagem que gera plan vazio (ex.: "oi") retorna em <25s e custa <$0.20 (apenas o plan call). Verificável via `usage.total.cost_usd` no evento `done`.
- [ ] **B2:** Chat com plano de ≥1 task: o `usage.manager.cost_usd` reflete plan(opus) + report(sonnet); deve ser <$0.20 (plan opus ~$0.15 + report sonnet ~$0.03).
- [ ] **B3:** `queue.count_by_status()` executa apenas 1 query SQL (verificável via `EXPLAIN` ou via teste unitário com `assert_called_once`).
- [ ] **B4:** Quando a aba do navegador está oculta, requests para `/api/tasks` e `/api/employees` cessam. Verificável via DevTools Network com aba minimizada.

## 5. Plano de teste

### 5.1 Backend

- **`tests/test_manager_report_model.py`** (novo): testar que `Manager.report(plan, [], model="sonnet")` chama `runner.run` com `model="sonnet"`; sem o param, default é `"sonnet"`.
- **`tests/test_queue_count.py`** (novo): popular DB com tasks de vários status, chamar `queue.count_by_status()`, verificar contagens corretas e que apenas 1 query SQL foi executada (capturar via SQLAlchemy event listener `before_cursor_execute`).
- **Integration via curl:** após restart, mandar "oi" e verificar `usage.total.cost_usd < 0.20` no evento `done`.

### 5.2 Frontend

- Typecheck deve continuar com 0 erros novos nos arquivos tocados.
- Smoke manual em DevTools: minimizar aba por 30s, verificar que requests param.

## 6. Risks & open questions

- **B1 — UX impact:** o usuário recebe mensagem template em vez de "Olá! Como posso ajudar?" personalizado. Aceitável dado o tradeoff de $0.15/greeting. Se virar ruído, podemos rodar Haiku no futuro (~$0.005/call).
- **B2 — quality dropoff:** Sonnet pode ter relatórios menos elegantes que Opus. Risco baixo — relatório é síntese, não geração criativa. Reversível trocando o default de `"sonnet"` para `"opus"` em uma linha.
- **B3 — Status enum mapping:** `TaskStatus` é um enum do Python. SQLAlchemy retorna o enum value diretamente em queries. O fix `status.value if hasattr(...)` é defensivo mas talvez redundante. Deixar como defensive — custo zero.
- **B4 — Default behavior:** se React Query v5 já tem `refetchIntervalInBackground: false` como default, esta mudança é redundante mas serve como contrato. Não causa regressão.

## 7. Ordem de aplicação

1. **B1** primeiro — mudança em chat.py, ganho imediato e mensurável.
2. **B2** depois — extends Manager.report API, requer 1 linha de chat.py se quisermos override (não requer aqui — default cobre).
3. **B3** isolado — só toca queue.py + 1 teste.
4. **B4** isolado — 2 arquivos frontend, 1 linha cada.

## 8. Próximo passo

Após aprovação → `writing-plans` gera plano concreto.
