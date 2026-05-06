# Command Center

> Plan, approve, and dispatch coding tasks to a fleet of Claude Code agents — without losing the thread.

Command Center is an **orchestration layer on top of Claude Code**. You describe what you want; a Manager agent drafts a plan; you approve or edit it; Worker agents execute in parallel inside your project; you see every file touched and every command run, in real time.

Built for solo devs and small teams who want to delegate routine work to agents but still hold the steering wheel.

```
┌─────────┐   plan    ┌─────────┐  approve   ┌──────────────┐
│   You   │──────────▶│ Manager │───────────▶│  Worker × N  │──▶ git, files, MCPs
└─────────┘           └─────────┘            └──────────────┘
     ▲                                               │
     └───────────── live progress (SSE) ─────────────┘
```

---

## Why plan-then-execute wins

Auto-execute coding agents fail silently and waste tokens. Pure chat agents make you babysit them. Command Center sits in between: **the agent shows its plan first, you edit if needed, then it goes.** You always see what happened.

Concretely, you get:

- **Plan approval** — review and edit the full task breakdown before any code is touched
- **Parallel workers** — multiple tasks run concurrently, each with its own model, prompt, and progress stream
- **Per-project skills + MCPs** — drop a `.claude/skills/` dir or `mcp.json` into your project; Command Center loads them per task
- **Session memory** — what was decided in conversation #3 is recallable in conversation #47
- **Cost transparency** — every task reports `cost_usd`. No surprise bills
- **Auto-PR** — a finished task can open a GitHub PR with the diff

No `ANTHROPIC_API_KEY` needed — uses the `claude` CLI with your existing Pro/Max subscription.

---

## 5-minute setup

**Prerequisites:**

| Tool            | Min version | Purpose                                                                             |
| --------------- | ----------- | ----------------------------------------------------------------------------------- |
| Python          | 3.13        | Backend                                                                             |
| Node.js         | ≥ 20        | Frontend                                                                            |
| pnpm            | ≥ 9         | Frontend deps                                                                       |
| uv              | recent      | Backend deps (replaces pip/venv)                                                    |
| just            | ≥ 1.0       | Task runner                                                                         |
| Claude Code CLI | recent      | Auth via `claude login` — uses your Pro/Max OAuth credits, no `ANTHROPIC_API_KEY` needed |

```bash
git clone https://github.com/<org>/command-center.git
cd command-center
cp command-center-backend/.env.example command-center-backend/.env
# Edit .env: set PROJECTS_ROOT to your workspace directory
just dev          # backend → :8000  ·  frontend → :3000
```

Open **`http://localhost:3000/chat`**. Type a task. Watch a plan appear. Click approve.

**Verify before first use:**

```bash
claude --print --model haiku "ok"   # must return a single line of text
just health                          # checks DB, CLI, secrets vault, disk
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (Next.js 15, App Router)                      │
│  ─ /chat        ← CEO conversation + plan editor + SSE  │
│  ─ /projects    ← per-project skills + MCP config       │
│  ─ /tasks       ← history + cost analytics              │
│  ─ /settings    ← integrations (GitHub, Linear)         │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP + SSE
┌─────────────────────▼───────────────────────────────────┐
│  Backend (FastAPI + SQLite/WAL + asyncio)               │
│  ─ Manager agent: drafts plan from CEO request          │
│  ─ Dispatcher: spawns Worker agents per task            │
│  ─ Workers: each = `claude --print` subprocess          │
│  ─ Memory store: recallable past decisions              │
│  ─ Integrations: GitHub auto-PR, Linear sync            │
└─────────────────────┬───────────────────────────────────┘
                      │ subprocess
                      ▼
              `claude` CLI (your auth)
                      ↓
             Anthropic API (your OAuth)
```

The Manager assigns models to tasks automatically:

- **Haiku** → reading, search, classification, summaries (5× cheaper)
- **Sonnet** → code writing, refactoring, tests (default)
- **Opus** → deep architectural reasoning (opt-in)

---

## Stack

| Layer     | Tech                                                            |
| --------- | --------------------------------------------------------------- |
| Backend   | FastAPI, SQLAlchemy async, SQLite WAL, SSE-Starlette, structlog |
| Agents    | `claude --print --output-format stream-json`                    |
| Frontend  | Next.js 15, Tailwind v4, Framer Motion, Zustand, TanStack Query |
| Security  | Fernet-encrypted tokens, `rehype-sanitize`, path traversal hardening |

---

## Common commands

```bash
just dev          # backend + frontend in parallel
just test         # pytest + frontend tests
just typecheck    # mypy + tsc --noEmit
just lint         # ruff + eslint
just format       # ruff format + prettier
just health       # GET /health/deep — DB, CLI, secrets, disk
just reset-db     # nukes the local SQLite (destructive, asks first)
```

---

## Repo layout

```
command-center/
├── command-center-backend/   FastAPI orchestrator (Python 3.13)
├── command-center-frontend/  Next.js 15 UI (TypeScript, React 19)
├── command-center-meta/      Dev runner (backend + frontend, color-coded logs)
├── docs/                     Whitepaper, architecture, case studies
├── justfile                  Top-level task runner
├── LICENSE                   Apache 2.0
├── CONTRIBUTING.md
├── CLA.md
├── CODE_OF_CONDUCT.md
└── SECURITY.md
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `claude: command not found` | CLI not installed / not in PATH | Install Claude Code CLI; reopen terminal |
| Tasks fail with `exit code 1` | CLI not logged in / token expired | `claude login`; test with `claude --print --model haiku "ok"` |
| SSE events not arriving | Wrong API URL | Check `NEXT_PUBLIC_API_URL` in `command-center-frontend/.env.local` |
| `Address already in use :8000` | Zombie process on port | `netstat -ano \| findstr 8000` (Windows) or `lsof -i :8000` (Unix); kill PID |
| Tasks fail when using MCP servers | MCP requested interactive permission | Add `headless_mcps` list to your project's `mcp.json`; see [SECURITY.md](./SECURITY.md) |

---

## Status

**v0.3 (alpha).** Functional, used daily. Single-user. Local-only by default.

**Known limitations** — see [SECURITY.md](./SECURITY.md). Headlines: no multi-user auth; local-machine trust model; don't expose to the internet without a reverse proxy.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Open an issue first; one concern per PR; lint+test+typecheck green.

By contributing you agree to the [CLA](./CLA.md).

## License

[Apache 2.0](./LICENSE) · Copyright 2026 Command Center contributors · See [NOTICE](./NOTICE).

The Claude Code CLI is a separate product of Anthropic PBC, not bundled with this project.
