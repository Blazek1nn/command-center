# Frente C — Engineering Polish

**Data:** 2026-04-28
**Escopo:** 5 itens que separam "amador" de "senior" na avaliação de portfolio

## Objetivo

Eliminar todos os red flags visíveis em uma revisão técnica do projeto:
- Tests que falham
- Typecheck com erros
- Sem defesa contra prompt injection
- Sem agregação de métricas
- README sem decisões técnicas explicadas

## Fixes

### C1 — Fix 3 typecheck errors

**Arquivo `src/components/chat/MessageBubble.tsx:67`** — `className` não existe em `Options` do ReactMarkdown.
Solução: envolver `<ReactMarkdown>` em `<div className="...">` em vez de passar `className` direto.

**Arquivo `src/components/projects/ProjectInsightCard.tsx:50`** — `Image` recebe `string | undefined` em `src`.
Solução: guard `if (!src) return null;` ou fallback string.

**Arquivo `src/components/workers/WorkerCard.tsx:27`** — mesmo padrão de `Image src` opcional.
Solução: idêntica ao C1 acima.

### C2 — Fix `test_claude_runner_streams_correctly`

**Causa:** o teste mocka `asyncio.StreamReader` via `_make_stream`, mas o runner agora usa `subprocess.Popen` síncrono em thread (não `asyncio.create_subprocess_exec`). O mock nunca é exercido — o teste roda o CLI real, falha por encoding (Win-1252 vs UTF-8 para "Olá"), e fica sempre vermelho.

**Solução:** reescrever o teste pra mockar `subprocess.Popen` no caminho atual. Cobrir TextDelta + ToolUse + Done com stream-json input.

### C3 — Prompt injection defense

**Causa:** `ChatRequest.message` em `api/chat.py:26-29` aceita qualquer string sem validação. CEO (ou um atacante via XSS hypotético) pode mandar mensagem gigante ($$$$$ em tokens) ou tentativa de injetar instruções nos prompts internos.

**Solução:**
- Adicionar `Field(max_length=10000)` em `message`
- Adicionar validador Pydantic que rejeita caracteres de controle (exceto newline/tab) e bytes nulos
- Limitar `history` a 20 itens

Não vamos fazer keyword blocking (`DELETE`, etc.) — falsos positivos são piores que o risco real (single-user app).

### C4 — `/api/metrics/session` endpoint

**Solução:** novo endpoint `GET /api/metrics/session` que retorna custo agregado das tasks na DB do dia atual:

```json
{
  "date": "2026-04-28",
  "total_cost_usd": 1.234,
  "total_input_tokens": 45000,
  "total_output_tokens": 12000,
  "by_model": {
    "opus": {"cost_usd": 0.85, "count": 3},
    "sonnet": {"cost_usd": 0.30, "count": 12},
    "haiku": {"cost_usd": 0.08, "count": 5}
  },
  "task_count": 20
}
```

Agrega via SQL: `SELECT model, SUM(cost_estimate), COUNT(*) FROM tasks WHERE DATE(completed_at) = today GROUP BY model`.

### C5 — README.md atualizado

Substituir o README atual por uma versão completa com:
- Hero section: "Command Center — orquestrador multi-agente CEO virtual via Claude CLI"
- Mermaid architecture diagram
- "Why CLI subprocess instead of Anthropic SDK?" decision log
- Quickstart (3 comandos)
- Stack table
- Status / roadmap mencionando Frentes A-D já concluídas
- Screenshots placeholder (TODO no rodapé indicando que serão adicionadas)

## Plan summary

5 tasks. Detalhes no plan file.
