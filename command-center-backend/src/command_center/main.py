from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from command_center.api import chat, employees, events, projects, tasks
from command_center.config import settings
from command_center.db.session import init_db
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
)

app.include_router(chat.router)
app.include_router(events.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(employees.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
