# Posts para publicação

---

## Hacker News — Show HN

**Título:**
```
Show HN: Command Center – multi-agent orchestration via Claude Code CLI (not API)
```

**Corpo:**
```
I built a CEO → Manager → Employees pipeline where natural language requests get
decomposed into parallel tasks executed by multiple Claude agents simultaneously.

The key design decision: everything runs through `claude --print` (the CLI), not
the Anthropic API directly. This means it uses your existing Claude Pro/Max
subscription with no API key — and agents get Claude's full tool suite (file I/O,
bash, web search) out of the box.

Architecture:
  CEO → Manager (Sonnet) → JSON task plan with depends_on DAG
  Dispatcher → parallel execution (up to 5 concurrent workers)
  Employees (Haiku/Sonnet) → actual work in project directories
  Manager → consolidated markdown report → CEO

The Manager assigns models intelligently: Haiku for reading/triage (5× faster),
Sonnet for code, Opus only for deep architectural decisions.

Frontend: Next.js 15 with real-time SSE streaming — you watch each agent's output
as it arrives, with per-task cost/token tracking.

Token optimization: integrated RTK (Rust Token Killer) compresses bash outputs
60–90% before they enter agent context.

GitHub: https://github.com/Blazek1nn/command-center
```

---

## Reddit — r/MachineLearning

**Título:**
```
[P] Command Center: CEO→Manager→Employees multi-agent pipeline built on Claude Code CLI
```

**Corpo:**
```
I built a multi-agent orchestration system that uses Claude Code CLI as the agent
runtime instead of calling the Anthropic API directly.

**How it works:**
1. You (CEO) describe work in natural language
2. Manager agent decomposes it into a JSON task graph with `depends_on` for ordering
3. Dispatcher runs independent tasks in parallel (up to 5 concurrent)
4. Employee agents execute in your actual project directories with full tool access
5. Manager consolidates results into a TL;DR report

**What makes this different from LangChain/AutoGen/etc:**
- Uses `claude --print --output-format stream-json` — not the raw API
- Agents have Claude Code's full tool suite: bash, file I/O, web search, code execution
- No API key needed — uses Claude Pro/Max subscription
- Token optimization via RTK: bash outputs compressed 60–90%
- Parallel-first scheduling with proper dependency resolution

**Stack:** FastAPI + SQLAlchemy (backend), Next.js 15 + Tailwind v4 (frontend),
SSE for real-time streaming, SQLite for persistence.

The Manager prompt enforces aggressive parallelism — tasks in different projects,
read-only tasks, and tasks touching different files always run simultaneously.

GitHub: https://github.com/Blazek1nn/command-center

Demo video in comments.
```

---

## LinkedIn

**Texto:**
```
Construí um sistema onde você descreve o que precisa ser feito,
e múltiplos agentes Claude trabalham em paralelo para entregar.

A arquitetura:
→ Você (CEO): mensagem em linguagem natural
→ Gerente (Claude Sonnet): decompõe em tarefas com grafo de dependências
→ Dispatcher: executa tarefas independentes simultaneamente
→ Funcionários (Claude Haiku/Sonnet): trabalham nos seus projetos reais
→ Relatório final: TL;DR + o que foi feito + próximos passos

O detalhe que muda tudo: usa o Claude Code CLI (`claude --print`),
não a API diretamente. Isso significa:
✓ Sem API key — usa sua assinatura Pro/Max existente
✓ Agentes com acesso real a arquivos, terminal e web
✓ Sistema de permissões do Claude nativo

Está no GitHub (link nos comentários).

#AI #MultiAgent #ClaudeAI #Anthropic #OpenSource
```
