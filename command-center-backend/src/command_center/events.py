"""Event bus interno baseado em asyncio.Queue.

Cada subscriber recebe sua própria fila — fan-out simples para SSE."""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal


EventType = Literal[
    "manager_thinking",
    "plan_created",
    "task_started",
    "task_progress",
    "task_completed",
    "task_failed",
    "manager_report",
    "employee_status",
    "queue_status",
    "error",
]


@dataclass
class Event:
    type: EventType
    payload: dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))


class EventBus:
    def __init__(self, max_buffer: int = 1000) -> None:
        self._subscribers: list[asyncio.Queue[Event]] = []
        self._lock = asyncio.Lock()
        self._max_buffer = max_buffer

    async def publish(self, event: Event) -> None:
        async with self._lock:
            targets = list(self._subscribers)
        for q in targets:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    async def subscribe(self) -> AsyncIterator[Event]:
        q: asyncio.Queue[Event] = asyncio.Queue(maxsize=self._max_buffer)
        async with self._lock:
            self._subscribers.append(q)
        try:
            while True:
                yield await q.get()
        finally:
            async with self._lock:
                if q in self._subscribers:
                    self._subscribers.remove(q)


bus = EventBus()
