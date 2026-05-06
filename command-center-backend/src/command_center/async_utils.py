"""Helpers para asyncio — fire-and-forget com logging de exceções.

Sem isso, `asyncio.create_task(coro())` engole exceções silenciosamente,
o que é uma fonte clássica de bugs invisíveis: PR não criado, memory não
salva, etc — e ninguém vê o erro nos logs.
"""
from __future__ import annotations

import asyncio
from collections.abc import Coroutine
from typing import Any

import structlog

log = structlog.get_logger(__name__)

# Mantém referências fortes pra tasks fire-and-forget — sem isso, GC pode
# coletar a task antes dela rodar (asyncio docs warning).
_BACKGROUND_TASKS: set[asyncio.Task[Any]] = set()


def fire_and_log(coro: Coroutine[Any, Any, Any], *, name: str) -> asyncio.Task[Any]:
    """Spawn `coro` como background task com logging de exceções.

    Uso:
        fire_and_log(_save_decision_memory(...), name="memory.decision_summary")

    Garantias:
    - Mantém referência forte (não é coletado pelo GC)
    - Loga exceções via structlog (não engole silenciosamente)
    - Loga cancelamento como debug (não como erro)
    """
    task = asyncio.create_task(coro, name=name)
    _BACKGROUND_TASKS.add(task)

    def _on_done(t: asyncio.Task[Any]) -> None:
        _BACKGROUND_TASKS.discard(t)
        if t.cancelled():
            log.debug("background_task.cancelled", name=name)
            return
        exc = t.exception()
        if exc is not None:
            log.error(
                "background_task.failed",
                name=name,
                error=repr(exc),
                exc_info=exc,
            )

    task.add_done_callback(_on_done)
    return task
