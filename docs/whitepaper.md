# Lessons from Building a Multi-Agent Orchestrator on Top of Claude Code

**Command Center — Engineering Whitepaper v0.1**
*May 2026 · Updated as we learn*

---

## Abstract

Most teams trying to deploy AI coding agents face a dilemma: auto-execute agents surprise you with irreversible changes, while pure chat agents require babysitting. This paper documents the UX patterns, technical trade-offs, and failure modes we discovered building Command Center — an orchestration layer that introduces a **plan-then-approve-then-execute** model between the developer and the agent fleet.

We share what worked, what failed, and the data we collected from real usage. We hope this is useful to teams building in the agent-infrastructure space, and to companies evaluating whether to build similar tooling in-house.

---

## 1. The Core Problem: Autonomy vs. Trust

The fundamental tension in AI coding agents is **autonomy vs. trust**. Developers want agents that can execute multi-step tasks without hand-holding. But they also can't afford surprises in a production codebase.

The approaches we evaluated:

| Approach | Autonomy | Trust | Verdict |
|---|---|---|---|
| Full auto-execute | High | Low | Users stop using it after 2-3 bad experiences |
| Chat-only (Claude.ai) | Low | High | Too much babysitting; users don't adopt for real work |
| Plan-then-approve | Medium | High | Sustainable — users actually ship with this |
| Auto with undo | Medium | Medium | Complex to implement correctly; undo scope unclear |

**Finding #1:** The adoption-killing moment in auto-execute isn't when the agent does something wrong — it's when the agent does something *wrong that you didn't expect was even possible*. A plan forces the agent to reveal its intended actions before execution. Developers are willing to accept agent errors if they approved the approach.

---

## 2. The Plan-Then-Execute UX Pattern

### 2.1 What the plan contains

A good plan for a coding task includes:

```json
{
  "understanding": "Clear restatement of the request in agent's words",
  "execution_mode": "parallel | sequential",
  "tasks": [
    {
      "title": "Human-readable title for the UI",
      "model": "haiku | sonnet | opus",
      "specialty": "general | frontend | backend | tests | docs",
      "prompt": "Full context-rich prompt for the worker",
      "project": "project-name",
      "depends_on": [0],
      "auto_pr": false
    }
  ]
}
```

Three things matter here:

1. **`understanding`** — the agent's restatement. If this is wrong, the human catches it before any code is touched. This single field prevents ~40% of "agent did the wrong thing" complaints in our experience.

2. **`depends_on`** — explicit dependency graph. Workers without deps run in parallel; workers with deps wait. This is simpler than a full DAG solver but handles 95% of real-world cases.

3. **`model` per task** — the Manager assigns the cheapest capable model to each task. Search and read tasks go to Haiku (5× cheaper), write tasks to Sonnet. This alone reduces cost 30-50% compared to using Sonnet everywhere.

### 2.2 Plan editing is used more than expected

We expected most users to approve plans as-is. The data says otherwise:

> **73% of plans are edited before approval on tasks with 3+ workers.**

Common edits:
- Remove a task they don't want done yet ("skip the refactor, just fix the bug")
- Upgrade a task's model ("this architecture decision should be Opus, not Sonnet")
- Edit the prompt to add context the Manager missed

This finding shaped the PlanEditor UI design: every field is editable inline, changes recalculate estimated cost in real time, tasks can be reordered via drag.

### 2.3 The approval step as a trust-building ritual

Users don't just use plan approval as a safety check — they use it as a learning tool. Many developers read the generated prompt for each task to understand how the agent "thinks" about their codebase. Several users told us they got better at writing prompts themselves by reading Manager-generated prompts.

This is an underrated value proposition: the plan is also documentation.

---

## 3. Model Assignment: The Economics of Multi-Agent

The naive approach is to use your best model for everything. In multi-agent systems, this is a significant mistake.

### 3.1 Task type → optimal model

After analyzing 500+ tasks:

| Task category | Correct model | Why |
|---|---|---|
| Read/audit/search | Haiku | Low complexity, high volume, deterministic |
| Bug fix (isolated) | Sonnet | Code intelligence, context window matters |
| Feature implementation | Sonnet | Best cost/quality for creative coding |
| Architecture decision | Opus | Justifies the 2× cost — reasoning depth matters |
| Test writing | Haiku or Sonnet | Tests are formulaic; Haiku often sufficient |
| Docs writing | Haiku | Well-defined format, low ambiguity |
| Refactoring | Sonnet | Requires context awareness across files |

The Manager learns to assign models from the task `specialty` field + prompt content. We don't fine-tune — just careful prompt engineering with examples.

### 3.2 Observed cost distribution

In our usage (not a controlled study — single developer, real projects):

- Average cost per task: **$0.08–$0.22** depending on codebase size
- A "fix this bug + write tests" request with 3 workers: **~$0.35 total**
- An "audit this module for security issues" (1 Haiku read + 1 Sonnet report): **~$0.04**
- Plan generation (Manager): **$0.01–$0.05** per request

For comparison, the same request to Claude.ai in a chat session, manually copying/pasting results: **2-4× more expensive** in developer time, similar API cost.

### 3.3 Cost transparency changes behavior

Showing `cost_usd` per task in the UI changed how we use the tool. Tasks we thought were cheap turned out to be expensive (large context windows). Tasks we assumed would be expensive were cheap (Haiku is very good at reads).

**Finding #2:** Cost transparency is a feature, not a warning. It makes users better at delegating — they start "right-sizing" their requests.

---

## 4. The Permission Prompt Problem

This is the biggest unsolved problem in headless agent infrastructure.

### 4.1 What permission prompts are

The Claude Code CLI runs agents with `--dangerously-skip-permissions` to bypass confirmation prompts for built-in tools (Read, Write, Edit, Bash, etc.). This works for core Anthropic tools.

It does **not** work for external MCP servers. MCPs implement their own permission model via JSON-RPC `tools/call` with a `permission_mode` field. When an MCP server requests user approval, the CLI blocks waiting for keyboard input — but in headless mode, there's no keyboard attached.

### 4.2 Symptoms

- Worker process hangs indefinitely (no stdout, no stderr)
- No error is returned — from the orchestrator's perspective, the worker is "running"
- User sees a spinning progress indicator until timeout
- Task fails after `TASK_TIMEOUT_SECONDS` (default 600) with a generic error

### 4.3 Our mitigation

**Watchdog thread:** A separate OS thread monitors the worker process for permission prompt patterns in stdout/stderr. If detected + no further output for 10 seconds, the process is killed and a structured error is returned with `permission_blocked: True`.

```python
_PERMISSION_PATTERNS = re.compile(
    r"Allow this tool|requires permission|awaiting approval|"
    r"Do you want to|Please confirm|y/N",
    re.IGNORECASE
)
```

**Headless MCP allow-list:** `mcp.json` accepts an optional `headless_mcps` list. Only servers in this list are passed to workers. Servers not in the list are excluded from headless runs (they can still be used in interactive mode).

```json
{
  "mcpServers": {
    "firecrawl": { "command": "...", "args": [...] },
    "linear": { "command": "...", "args": [...] }
  },
  "headless_mcps": ["firecrawl"]
}
```

**Finding #3:** The watchdog + allow-list combination reduces permission-blocked workers from "eventual hang" to "fail fast with actionable message." But the root cause — MCPs lacking a headless mode — is an ecosystem problem, not something an orchestrator can fully solve.

---

## 5. Memory Between Sessions

### 5.1 The problem

A coding agent that doesn't remember context from previous sessions forces the developer to re-explain architecture decisions, preferences, and prior work in every conversation. This is one of the most cited frustrations with chat-based AI coding tools.

### 5.2 What we store

After each completed plan execution, we generate a decision summary via Haiku:

```
Summarize in 2-3 sentences what was decided and why, in a way that would be useful
to an agent reading this in a future session. Focus on decisions, not implementation.
```

This summary is stored with:
- `project_id` — scoped to the project
- `conversation_id` — traceable to source
- `created_at` — for recency weighting
- `embedding` (upcoming) — for semantic search

### 5.3 Current implementation: keyword matching

Today we use TF-IDF keyword matching with a `LIMIT 50` SQL query before scoring. This is fast and requires no external API calls.

**Limitation:** If the developer asks "how did we handle auth?" and the memory was stored as "implemented OAuth2 flow with refresh token rotation," the match only succeeds if there's a keyword overlap. In our usage, we estimate ~60% recall on semantically relevant memories.

### 5.4 Upcoming: semantic search

The next iteration replaces TF-IDF with `text-embedding-3-small` (OpenAI) or Cohere embeddings stored in a vector column (SQLite + sqlite-vec, or pgvector if/when we migrate to PostgreSQL).

Expected recall improvement: 60% → 85%+ based on benchmarks on similar retrieval tasks.

**Finding #4:** Even imperfect memory (60% recall) meaningfully reduces the "re-explain yourself" overhead. Users who use the tool for 2+ weeks on the same project notice the difference immediately.

---

## 6. Async Reliability: The Fire-and-Forget Trap

### 6.1 The bug

Early versions of Command Center used `asyncio.create_task()` for background work (saving memories, creating PRs, notifying Linear). In Python's asyncio, if a fire-and-forget task raises an exception and nothing holds a reference to the task object, the exception is silently discarded with a warning printed to stderr — which we weren't watching.

This meant:
- Auto-PRs were silently not being created
- Memory saves were silently failing
- Integration notifications were silently dropping

We discovered this only when a user noticed "your auto-PR feature is broken."

### 6.2 The fix

```python
_BACKGROUND_TASKS: set[asyncio.Task] = set()

def fire_and_log(coro: Coroutine, *, name: str) -> asyncio.Task:
    task = asyncio.create_task(coro, name=name)
    _BACKGROUND_TASKS.add(task)
    def _on_done(t: asyncio.Task) -> None:
        _BACKGROUND_TASKS.discard(t)
        if t.cancelled():
            return
        exc = t.exception()
        if exc:
            log.error("background_task.failed", name=name, error=repr(exc))
    task.add_done_callback(_on_done)
    return task
```

The `_BACKGROUND_TASKS` set holds a strong reference so the GC doesn't collect the task before it completes.

**Finding #5:** `asyncio.create_task()` without a strong reference + done callback is a reliability trap. In an orchestrator that runs background tasks across many requests, this pattern silently loses work. Use `fire_and_log` or equivalent on every fire-and-forget.

---

## 7. SQLite Under Concurrent Agent Load

### 7.1 The problem

SQLite's default write mode is "journal mode" (WAL disabled). Under concurrent writes from multiple async tasks, this causes serialization at the OS file-lock level, reducing throughput dramatically.

### 7.2 The fix

On connection, apply:

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA busy_timeout=30000;
PRAGMA foreign_keys=ON;
```

WAL (Write-Ahead Logging) allows concurrent readers and a single writer without blocking reads. `synchronous=NORMAL` trades full fsync on every write for ~3× write performance with acceptable durability (safe for everything short of a power failure mid-write).

### 7.3 Index your foreign keys

SQLite doesn't auto-index foreign keys. In our schema, 7 FK columns (`Task.project_id`, `Message.conversation_id`, etc.) were doing full table scans on every JOIN. Adding `index=True` on each FK column reduced per-request DB time from ~45ms to ~8ms at our data volumes.

**Finding #6:** SQLite with WAL + FK indexes + busy_timeout handles 5 concurrent workers comfortably. The limit isn't SQLite — it's the subprocess spawning overhead of the `claude` CLI (roughly 1-2s to start a new process).

---

## 8. SSE Streaming: What Developers Actually Want to See

### 8.1 Event taxonomy

We went through 4 iterations of what to stream. The final set:

| Event | When | UI uses it for |
|---|---|---|
| `manager_thinking` | Plan started | "Manager is planning…" spinner |
| `manager_delta` | Each LLM token | Live streaming of plan text |
| `plan_created` | Plan complete | Render PlanEditor |
| `task_started` | Worker starts | Task card appears in running state |
| `worker_action` | Each tool_use | Activity stream inside task card |
| `task_completed` | Worker succeeds | Card turns green, file list appears |
| `task_failed` | Worker fails | Card turns red, error message appears |
| `pr_created` | Auto-PR created | PR link badge in task card |
| `manager_report` | Report complete | Final summary in conversation |
| `done` | All done | Close SSE connection |

The key insight: developers want to see **tool calls**, not just status changes. Seeing "worker wrote `src/auth/middleware.py`" in real time is qualitatively different from "worker is running." It builds trust in the agent's approach before it's done.

### 8.2 Reconnection and deduplication

SSE connections drop. The standard `EventSource` API reconnects automatically, but the server needs to handle this correctly:

- Each event gets a unique `id` (UUID or sequential)
- Client sends `Last-Event-ID` header on reconnect
- Server replays events from that point

We haven't fully implemented this yet (events are live, not stored). It's a known limitation.

**Finding #7:** The activity stream (showing tool calls) is the most-praised feature in user feedback. It's also the feature that most distinguishes Command Center from chat-based agents. Don't cut it from the MVP.

---

## 9. What We'd Do Differently

**Use the API, not the CLI.** The `claude` CLI works and is fast to prototype with. But it ties the product to CLI version compatibility, authentication flow, and flag availability. For production use, the Anthropic API (or Claude Code SDK when available) is the right abstraction boundary. We'd make this change before any serious scale.

**PostgreSQL from day one.** SQLite with WAL is surprisingly capable, but the single-writer constraint will eventually bite. The migration from SQLite to PostgreSQL is non-trivial (async drivers differ, migration tooling differs). Start with PostgreSQL if you know the product will grow.

**Multi-provider from day one.** Supporting only Claude means: (a) you're not architecture-neutral, (b) you have no baseline for model quality comparisons, (c) any strategic partnership requires maintaining provider parity. Adding OpenAI and Gemini support retrospectively is painful.

**Instrument before you ship.** We added analytics late. As a result, we have no data on how users actually discovered the tool, where they dropped off in onboarding, or which features drove retention. This data is irreplaceable. Add PostHog (or equivalent) before the first user.

---

## Appendix A: Architecture Decision Log

| Decision | Alternatives considered | Outcome |
|---|---|---|
| Use `claude` CLI subprocess | Direct API calls | Faster to ship; technical debt acknowledged |
| SQLite | PostgreSQL, MongoDB | Correct for single-user; plan to migrate at scale |
| SSE for streaming | WebSockets, polling | SSE simpler for unidirectional streaming; no WS overhead |
| Fernet for token encryption | Plaintext (original), AWS KMS | Fernet right-sized for local single-user; KMS overkill |
| TF-IDF memory search | Vector DB (pgvector) | TF-IDF zero setup; migrating to embeddings next |
| FastAPI + asyncio | Django, Flask, Starlette only | FastAPI best ergonomics for SSE + async SQLAlchemy |
| Next.js App Router | CRA, Vite + React, Remix | Best SSE support + streaming UI in Next.js 15 |

---

## Appendix B: Open Questions

1. **When does plan-then-execute break down?** For tasks that require the agent to explore before planning, a single-shot plan is insufficient. The agent needs to read code, then plan, then execute. We handle this with a "triage" task at the start of the plan, but it's clunky.

2. **How do you handle agent disagreements?** When two workers produce conflicting changes (e.g., both modify the same file), the last writer wins. We don't have a merge/conflict resolution strategy. This is fine for now (workers rarely touch the same files) but is a correctness gap.

3. **What's the right memory retention policy?** We currently keep all memories indefinitely. Should old memories decay? Should contradictory decisions cancel each other? We don't have good answers yet.

4. **Multi-user auth without breaking the local-first model?** Auth typically requires a server-side user store. But our value proposition is "runs on your machine, uses your Claude account." These two goals conflict. The extension model (VS Code plugin) may resolve this — the extension is per-user by definition.

---

*This document is updated as we build and learn. Contributions welcome via [CONTRIBUTING.md](../CONTRIBUTING.md).*
