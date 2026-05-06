# Frente D — Wow Factor

**Data:** 2026-04-28
**Escopo:** 3 features que diferenciam o projeto em demo de portfolio

## Objetivo

Adicionar 3 features visíveis em <30s de demo:
- **D1 — Streaming plan deltas:** UI mostra o gerente "pensando" em tempo real durante `Manager.plan()`, em vez de só um spinner.
- **D2 — Cost dashboard:** painel compacto na sidebar mostrando custo cumulativo da sessão, breakdown por modelo (manager × workers) com mini-gráfico (recharts).
- **D3 — Demo seed script:** comando `uv run python -m command_center.scripts.seed_demo` popula 4 projects + 3 employees IDLE pra UI parecer "lived in" em screenshots/demos.

## Out of scope

- Plan editing (CEO aprova/edita plano antes de executar) → Frente futura
- Real-time agent activity stream (cursor-style) → Frente futura
- Multi-turn memory persistence → Frente futura

## Fixes

### D1 — Streaming plan deltas

**Backend (`api/chat.py` + `agents/manager.py`):**
- `Manager.plan()` recebe novo callback opcional `on_delta: Callable[[str], None] | None`. A cada `TextDelta` recebido do runner, chama `on_delta(event.text)`.
- Em `chat.py`, antes de `await manager.plan(...)`, instalar callback que publica eventos `manager_delta` no bus. Drenar a fila de deltas pra SSE em paralelo enquanto plan() roda.
- Novo tipo SSE: `manager_delta` com payload `{"text": str}`.

**Frontend:**
- `lib/types.ts`: adicionar `ChatSseEventType = "manager_delta"` ao union; `ManagerDeltaPayload { text: string }`.
- `chat-store.ts`: adicionar campo `thinkingText: string` ao state; ações `appendThinking(text)` e `clearThinking()`.
- `use-chat.ts`: handler para `manager_delta` chama `appendThinking`. Em `plan_created` chama `clearThinking`.
- `ChatStream.tsx`: durante phase `"thinking"`, se `thinkingText` não está vazio, renderiza o texto em fonte mono com cursor blinking em vez do spinner sozinho.

### D2 — Cost dashboard

**Frontend only.** Já existe `sessionUsage` no `chat-store.ts` agregando todos os chats. Falta UI.

- Novo componente `src/components/dashboard/CostPanel.tsx`:
  - Mostra `sessionUsage.total.cost_usd` formatado em $X.XX
  - Mini bar chart (recharts) com 2 barras: Manager vs Workers
  - Tokens IO total separado
  - Compacto (~150px altura), encaixa numa coluna lateral
- Posicionar em `WorkerPanel.tsx` (coluna direita), antes do `ProjectInsightsPanel`.

### D3 — Demo seed script

**Backend:** novo `scripts/seed_demo.py` que cria:
- 4 projects: MedDecide, trading-agent, wine-scanner-br, multi-agent-core (paths em `~/projects/`)
- 3 employees IDLE: code-sonnet-1, code-haiku-1, code-opus-1

Idempotente — se o nome já existe, pula. Roda via `uv run python -m command_center.scripts.seed_demo`.

## Critérios de aceitação

- [ ] **D1:** Em chat com mensagem complexa (gera tasks), entre `manager_thinking` e `plan_created` chegam ≥3 eventos `manager_delta` ao cliente. UI mostra texto sendo composto.
- [ ] **D2:** Painel "Custo da sessão" visível na sidebar direita com $0.00 inicial; após 1 chat, valor atualiza e barras refletem manager × workers.
- [ ] **D3:** Após `uv run python -m command_center.scripts.seed_demo`, `GET /api/projects` retorna ≥4 projects, `GET /api/employees` retorna ≥3.

## Plan summary

3 tasks independentes:

**Task 1 (D1):** backend manager.py + chat.py (delta callback + queue drain), frontend types/store/hook/ChatStream.
**Task 2 (D2):** novo componente CostPanel, encaixe em WorkerPanel.
**Task 3 (D3):** novo script seed_demo.py.

Detalhes de implementação no plan: `2026-04-28-frente-d-wow-factor.md`.
