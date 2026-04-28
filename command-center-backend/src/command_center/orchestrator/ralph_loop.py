"""Loop autônomo opcional — drena a fila de tasks pendentes em background.

Inspirado no padrão "ralph wiggum loop": tick simples, sem agendamento sofisticado.
Ative montando RalphLoop().start() numa task background do FastAPI lifespan."""
from __future__ import annotations

import asyncio

import structlog

from command_center.agents.manager import Plan, TaskSpec
from command_center.orchestrator.dispatcher import Dispatcher
from command_center.orchestrator.queue import queue


log = structlog.get_logger(__name__)


class RalphLoop:
    def __init__(self, interval_seconds: int = 30, batch_size: int = 5) -> None:
        self.interval = interval_seconds
        self.batch_size = batch_size
        self._stop = asyncio.Event()
        self._dispatcher = Dispatcher()

    async def start(self) -> None:
        log.info("ralph_loop.start", interval=self.interval, batch=self.batch_size)
        while not self._stop.is_set():
            try:
                pending = await queue.list_pending(limit=self.batch_size)
                if pending:
                    plan = Plan(
                        understanding="Ralph loop: drenando fila pendente.",
                        execution_mode="parallel",
                        tasks=[
                            TaskSpec(
                                title=t.title,
                                prompt=t.prompt,
                                project=None,
                                model=(t.model or "sonnet"),  # type: ignore[arg-type]
                                specialty="code",
                            )
                            for t in pending
                        ],
                        estimated_minutes=5 * len(pending),
                    )
                    await self._dispatcher.execute_plan(plan)
            except Exception:
                log.exception("ralph_loop.tick_failed")
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self.interval)
            except TimeoutError:
                pass

    def stop(self) -> None:
        self._stop.set()
