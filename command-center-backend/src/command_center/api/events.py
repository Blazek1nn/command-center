"""GET /api/events — SSE global de status (employees, queue, lifecycle)."""
from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from command_center.events import bus


router = APIRouter(prefix="/api", tags=["events"])


@router.get("/events")
async def stream_events() -> EventSourceResponse:
    async def gen() -> AsyncIterator[dict[str, Any]]:
        async for event in bus.subscribe():
            yield {
                "event": event.type,
                "data": json.dumps(
                    {"timestamp": event.timestamp.isoformat(), **event.payload},
                    ensure_ascii=False,
                    default=str,
                ),
            }

    return EventSourceResponse(gen())
