# Command Center

> Tell it what needs to be done. Watch your agents do it — in parallel.

A multi-agent orchestration system where you (the CEO) describe work in natural language, a Manager decomposes it into parallel tasks, and multiple Employee agents execute them simultaneously — all powered by **Claude Code CLI**, not the raw API.

![Command Center UI](docs/demo.gif)

---

## Why this is different

Most agent frameworks call the Anthropic API directly. This one uses **`claude --print`** — the same Claude Code CLI you already have authenticated. That means:

- ✅ No `ANTHROPIC_API_KEY` needed — uses your Claude Pro/Max subscription
- ✅ Full tool access: file I/O, bash, web search, code execution
- ✅ Claude's built-in permission system and safety guardrails
- ✅ Token optimization via [RTK](https://github.com/rtk-ai/rtk) (60–90% savings on bash output)

---

## Architecture

```
CEO (you)
   │  natural language request
   ▼
┌─────────────────────────────────────────┐
│              Manager Agent              │
│         (Claude Sonnet/Opus)            │
│  Decomposes request → JSON task graph   │
│  with depends_on dependency resolution  │
└─────────────────────────────────────────┘
   │  Plan { tasks[], execution_mode }
   ▼
┌─────────────────────────────────────────┐
│               Dispatcher                │
│  Parallel-first execution engine        │
│  Respects depends_on DAG               │
│  Up to 5 concurrent workers            │
└──────┬──────────┬──────────┬───────────┘
       │          │          │
       ▼          ▼          ▼
  Employee 1  Employee 2  Employee 3
  (Haiku)     (Sonnet)    (Sonnet)
  reads files  writes code  runs tests
       │          │          │
       └──────────┴──────────┘
                  │  results[]
                  ▼
┌─────────────────────────────────────────┐
│         Manager consolidates            │
│   TL;DR + what was done + next steps   │
└─────────────────────────────────────────┘
   │  markdown report
   ▼
CEO dashboard (real-time SSE streaming)
```

The Manager assigns the right model to each task automatically:
- **Haiku** → reading, search, classification, summaries (5× faster)
- **Sonnet** → code writing, refactoring, tests (default)
- **Opus** → reserved for deep architectural decisions only

---

## Features

- **Parallel-first execution** — tasks without dependencies run simultaneously
- **Real-time streaming UI** — watch each agent's output as it streams via SSE
- **Task dependency graph** — `depends_on` ensures correct ordering when needed
- **Per-task cost & token tracking** — know exactly what each task cost
- **RTK integration** — bash outputs compressed 60–90% before entering context
- **Project-aware** — agents work inside your actual project directories
- **Zen Japanese UI** — because agent infrastructure should be beautiful

---

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI, SQLAlchemy async, SQLite, SSE-Starlette |
| Agents | Claude Code CLI (`claude --print --output-format stream-json`) |
| Frontend | Next.js 15, Tailwind CSS v4, Framer Motion, Zustand |
| Token savings | [RTK](https://github.com/rtk-ai/rtk) |

---

## Quick Start

### Prerequisites

- [Claude Code CLI](https://docs.anthropic.com/claude-code) installed and authenticated (`claude --version`)
- Python 3.13+ with [uv](https://docs.astral.sh/uv/)
- Node.js 20+ with [pnpm](https://pnpm.io/)
- (Optional) [RTK](https://github.com/rtk-ai/rtk) for token savings

### 1. Clone

```bash
git clone https://github.com/Blazek1nn/command-center
cd command-center
```

### 2. Backend

```bash
cd command-center-backend
uv sync
uv run uvicorn command_center.main:app --reload --port 8000
```

### 3. Frontend

```bash
cd command-center-frontend
pnpm install
pnpm dev
```

### 4. (Optional) Token savings with RTK

```bash
# Install RTK
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh

# Configure for Claude Code
rtk init -g
```

### 5. Open

Navigate to [http://localhost:3000/chat](http://localhost:3000/chat)

---

## One-command dev (meta orchestrator)

```bash
cd command-center-meta
node scripts/dev.mjs
```

Starts backend + frontend in parallel, all output color-coded in one terminal. No CMD windows.

---

## Configuration

Create `command-center-backend/.env`:

```env
# Project directory where agents will work
PROJECTS_ROOT=/path/to/your/projects

# Model for the Manager (default: sonnet)
DEFAULT_MANAGER_MODEL=sonnet

# Max parallel agents (default: 5)
MAX_PARALLEL_WORKERS=5

# Agent task timeout in seconds (default: 600)
TASK_TIMEOUT_SECONDS=600
```

---

## How it works — in depth

### 1. CEO sends a message

```
"Add E2E tests to the auth flow and fix the flaky login test"
```

### 2. Manager generates a parallel task plan

```json
{
  "understanding": "Add E2E tests to auth flow and fix flaky login test",
  "execution_mode": "parallel",
  "tasks": [
    {
      "title": "Audit existing auth tests",
      "model": "haiku",
      "specialty": "triage",
      "depends_on": []
    },
    {
      "title": "Fix flaky login test",
      "model": "sonnet",
      "specialty": "tests",
      "depends_on": [0]
    },
    {
      "title": "Write E2E auth flow tests",
      "model": "sonnet",
      "specialty": "tests",
      "depends_on": [0]
    }
  ]
}
```

### 3. Dispatcher executes

- Task 0 (haiku) runs immediately
- Tasks 1 and 2 run in parallel once Task 0 completes

### 4. Manager consolidates

Returns a markdown report: TL;DR, what was done, problems found, next steps.

---

## Windows notes

CMD window suppression is built-in — a background thread intercepts any console windows created by agent subprocesses and hides them immediately.

---

## License

MIT
