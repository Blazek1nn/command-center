# Frente A — Smoke Test Roteiro

Procedimento manual de validação. Tempo total: ~5 min. Executado após cada deploy/restart, ou como regression check antes de demo.

## Pré-requisitos

- Backend em `http://localhost:8000` (`curl /health` retorna `ok`)
- Frontend em `http://localhost:3000` (`pnpm dev`)
- DevTools do browser aberto na aba Network
- PowerShell aberto para verificar processos

## Cenário 1 — Greeting "oi"

1. Em `/chat`, enviar `oi`
2. Aguardar resposta completa (~50s, custo ~$0.29)

**Expected:** stream completo, mensagem do gerente aparece, sem corte. (Frente B vai otimizar este custo/tempo.)

## Cenário 2 — Tasks paralelas com mesmo título (Fix 2 — index binding)

1. Mensagem: `"Rode 2 tasks paralelas com o título 'Análise rápida', uma para o projeto MedDecide e outra para wine-scanner-br. Cada task retorna 1 frase descrevendo o projeto."`
2. Aguardar plano aparecer com 2 tasks de título idêntico
3. Observar progresso

**Expected:** ambas mostram progresso/output **independente**, sem embaralhar. Status final correto em ambas.

**Falha indica regressão:** se output das duas mistura ou status pula entre elas, o binding por title voltou.

## Cenário 3 — Drop antes de plan_created (Fix 3 — auto-retry condicional)

1. Mensagem qualquer com tasks: `"rode 2 tasks analisando projetos"`
2. **Imediatamente** (em <2s): DevTools → Network → click direito na req `chat` → "Block request URL"
3. Aguardar 2-3s
4. Unblock

**Expected:** UI mostra fase "Reconectando…", depois retoma stream normalmente. Plano aparece e tasks executam.

**Falha indica regressão:** se UI fica travada em erro sem auto-retry, o `shouldAutoRetry` quebrou.

## Cenário 4 — Drop depois de plan_created (Fix 3 — manual retry)

1. Mensagem com tasks longas: `"rode 3 análises paralelas detalhadas dos meus projetos"`
2. Aguardar plano aparecer (`plan_created` event renderiza as TaskCards)
3. Após plano visível, block request via DevTools
4. Aguardar 5s

**Expected:** Toast com `"Conexão perdida. ..."` e botão `"Refazer"`. **Sem auto-retry.** Botão Refazer reroda o chat (gera novo Manager call).

**Falha indica regressão:** se UI auto-retentar após plan_created, o gate `() => !planCreated` quebrou.

## Cenário 5 — Cancel mid-stream + reap (Fix 4 — subprocess cleanup)

1. Mensagem que dispara tasks: `"rode 5 análises detalhadas dos meus projetos"`
2. Aguardar tasks começarem (status "running" visível em pelo menos 1 TaskCard)
3. Clicar no botão de cancelar do chat (envio anterior abortado)
4. Em outro terminal:

```powershell
Start-Sleep 5
Get-Process claude -ErrorAction SilentlyContinue | Format-Table Id,StartTime
```

**Expected:** lista vazia (ou só processos pré-existentes não relacionados a este test run).

**Falha indica regressão:** se há `claude.exe` zumbi mais de 5s após cancel, o `proc.wait()` no finally do `_run_threaded` quebrou.

## Cenário 6 — Race fix (Fix 1 — EventBus attach/detach)

Difícil de testar manualmente — coberto pelos testes unitários `test_event_bus_attach.py` e `test_dispatcher_index.py`.

**Validação indireta:** rode 3 chats sequenciais com tasks paralelas, todos completam sem perder eventos `task_started`/`task_completed`.

**Falha indica regressão:** se uma TaskCard fica em status "pending" enquanto o backend mostra completed nos logs, o subscriber estava sendo registrado tarde.

## Validação automática (suite)

Antes de declarar a frente A concluída:

```bash
cd "C:/cc/command-center-backend" && C:/Users/USER/.local/bin/uv.exe run pytest tests/ --tb=line
```

**Expected:** 17 passed, 1 failed (`test_claude_runner_streams_correctly` — pré-existente, mojibake de encoding em literal).

```bash
cd "C:/cc/command-center-frontend" && C:/Users/USER/.local/pnpm-shim/node_modules/.bin/pnpm.cmd typecheck
```

**Expected:** 3 errors em `MessageBubble.tsx`, `ProjectInsightCard.tsx`, `WorkerCard.tsx` — todos pré-existentes e fora do escopo da Frente A. Nenhum erro novo nos arquivos modificados (`sse.ts`, `use-chat.ts`, `chat-store.ts`, `ChatStream.tsx`, `types.ts`).

## Rollback rápido

Se algum cenário falha em produção/demo, os 4 fixes são independentes e revertíveis individualmente:

| Fix | Arquivos a reverter |
|---|---|
| Fix 4 — reap | `claude_runner.py:25-29,266-281` |
| Fix 1 — race | `events.py:49-66`, `chat.py:76-99` |
| Fix 2 — index | `dispatcher.py:128-194`, `types.ts:88-131`, `use-chat.ts:88-125,203-213` |
| Fix 3 — retry | `sse.ts:17-115`, `use-chat.ts:60-189`, `chat-store.ts:33-41`, `ChatStream.tsx:13-31` |
