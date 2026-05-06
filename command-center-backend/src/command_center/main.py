from __future__ import annotations

import logging
import shutil
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from command_center.api import (
    chat,
    conversations,
    cost,
    dispatch,
    employees,
    events,
    files,
    integrations,
    memory,
    metrics,
    projects,
    skills,
    suggestions,
    tasks,
)
from command_center.config import settings
from command_center.db.session import engine, init_db
from command_center.win_console_hider import start_console_hider


def _configure_logging() -> None:
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    logging.basicConfig(level=level)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _configure_logging()
    await init_db()
    start_console_hider()
    yield


app = FastAPI(
    title="Command Center Backend",
    version="0.1.0",
    description="Orquestrador multi-agente para CEO virtual (Claude Code CLI).",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Sprint 5: expõe x-request-id pra browser ler em DevTools
    expose_headers=["x-request-id"],
)


@app.middleware("http")
async def trace_id_middleware(request: Request, call_next):
    """Sprint 5: injeta x-request-id em todo request pra correlação em logs.

    Cliente pode fornecer (header X-Request-ID) ou geramos novo. O ID fica
    bound no contextvar do structlog — toda log line do request recebe ele.
    """
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    structlog.contextvars.bind_contextvars(request_id=request_id)
    start = time.monotonic()
    try:
        response = await call_next(request)
    finally:
        # Limpa contextvar pra próximo request não herdar
        structlog.contextvars.unbind_contextvars("request_id")
    elapsed_ms = int((time.monotonic() - start) * 1000)
    response.headers["x-request-id"] = request_id
    response.headers["server-timing"] = f"app;dur={elapsed_ms}"
    return response

app.include_router(chat.router)
app.include_router(conversations.router)
app.include_router(events.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(employees.router)
app.include_router(metrics.router)
app.include_router(files.router)
app.include_router(cost.router)
app.include_router(suggestions.router)
app.include_router(dispatch.router)
app.include_router(memory.router)
app.include_router(skills.router)
app.include_router(integrations.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/deep")
async def health_deep() -> dict:
    """Sprint 5: health check profundo. Checa DB, claude CLI, key vault, disco.

    Retorna 200 sempre — campo `ok` agrega; cada componente tem detalhe.
    Status code 200 mesmo se algo falhar pra não confundir load balancers
    que tratariam 503 como "tire da rotação".
    """
    components: dict[str, dict] = {}

    # DB
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        components["db"] = {"ok": True}
    except Exception as exc:  # noqa: BLE001
        components["db"] = {"ok": False, "error": str(exc)[:200]}

    # Claude CLI
    cli_path = shutil.which(settings.claude_cli_path) or settings.claude_cli_path
    components["claude_cli"] = {
        "ok": Path(cli_path).exists() if cli_path else False,
        "path": cli_path,
    }

    # Key vault
    key_path = Path.home() / ".command-center" / "secret.key"
    components["secrets_vault"] = {
        "ok": key_path.exists(),
        "key_present": key_path.exists(),
    }

    # Disco — > 100MB livre
    try:
        total, used, free = shutil.disk_usage(Path.cwd())
        components["disk"] = {
            "ok": free > 100 * 1024 * 1024,
            "free_mb": free // (1024 * 1024),
        }
    except Exception as exc:  # noqa: BLE001
        components["disk"] = {"ok": False, "error": str(exc)[:120]}

    overall = all(c.get("ok", False) for c in components.values())
    return {"ok": overall, "components": components, "version": app.version}
