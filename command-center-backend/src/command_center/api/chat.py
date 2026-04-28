"""POST /api/chat — fluxo SSE completo: pensa → planeja → executa → reporta."""
from __future__ import annotations

import asyncio
import json
import traceback
from collections.abc import AsyncIterator
from typing import Any

import structlog
from fastapi import APIRouter
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from command_center.agents.manager import Manager
from command_center.events import Event, bus
from command_center.orchestrator.dispatcher import Dispatcher


log = structlog.get_logger(__name__)


router = APIRouter(prefix="/api", tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None
    history: list[dict[str, str]] | None = None


def _sse(event_name: str, data: Any) -> dict[str, Any]:
    return {
        "event": event_name,
        "data": json.dumps(data, ensure_ascii=False, default=str),
    }


@router.post("/chat")
async def chat(req: ChatRequest) -> EventSourceResponse:
    manager = Manager()
    dispatcher = Dispatcher()

    async def stream() -> AsyncIterator[dict[str, Any]]:
        # 1) Gerente pensando
        await bus.publish(Event(type="manager_thinking", payload={"message": req.message}))
        yield _sse("manager_thinking", {"message": req.message})

        # 2) Plano
        try:
            plan = await manager.plan(req.message, history=req.history)
        except Exception as exc:
            tb = traceback.format_exc()
            log.error("chat.plan_failed", error=repr(exc), traceback=tb)
            yield _sse(
                "error",
                {
                    "stage": "plan",
                    "error": str(exc) or repr(exc),
                    "exception": type(exc).__name__,
                    "traceback": tb[-1500:],
                },
            )
            return

        plan_payload = plan.model_dump()
        await bus.publish(Event(type="plan_created", payload=plan_payload))
        yield _sse("plan_created", plan_payload)

        # 3) Despacho — encaminhamos os eventos do bus relacionados a tasks
        bus_queue: asyncio.Queue[Event] = asyncio.Queue()
        forward_started = asyncio.Event()

        async def _forward() -> None:
            forward_started.set()
            async for evt in bus.subscribe():
                if evt.type in {
                    "task_started",
                    "task_progress",
                    "task_completed",
                    "task_failed",
                }:
                    await bus_queue.put(evt)

        forward_task = asyncio.create_task(_forward())
        await forward_started.wait()  # garante subscribe antes do dispatch

        dispatch_task = asyncio.create_task(dispatcher.execute_plan(plan))

        try:
            while not dispatch_task.done() or not bus_queue.empty():
                try:
                    evt = await asyncio.wait_for(bus_queue.get(), timeout=0.5)
                    yield _sse(evt.type, evt.payload)
                except TimeoutError:
                    continue
            result = await dispatch_task
        finally:
            forward_task.cancel()
            try:
                await forward_task
            except (asyncio.CancelledError, Exception):
                pass

        outcomes_payload = [
            {
                "index": o.index,
                "title": o.title,
                "status": o.status,
                "task_id": o.task_id,
                "output": (o.output or "")[-3000:],
                "error": o.error,
                "cost_usd": o.cost_usd,
                "duration_ms": o.duration_ms,
                "input_tokens": o.input_tokens,
                "output_tokens": o.output_tokens,
            }
            for o in result.outcomes
        ]

        workers_cost = sum((o.cost_usd or 0.0) for o in result.outcomes)
        workers_in = sum(o.input_tokens for o in result.outcomes)
        workers_out = sum(o.output_tokens for o in result.outcomes)
        usage_summary = {
            "manager": {
                "cost_usd": manager.usage.cost_usd,
                "input_tokens": manager.usage.input_tokens,
                "output_tokens": manager.usage.output_tokens,
            },
            "workers": {
                "cost_usd": workers_cost,
                "input_tokens": workers_in,
                "output_tokens": workers_out,
            },
            "total": {
                "cost_usd": manager.usage.cost_usd + workers_cost,
                "input_tokens": manager.usage.input_tokens + workers_in,
                "output_tokens": manager.usage.output_tokens + workers_out,
            },
        }

        # 4) Relatório final
        try:
            report = await manager.report(plan, outcomes_payload)
        except Exception as exc:
            report = f"_(falha ao gerar relatório: {exc})_"

        await bus.publish(Event(
            type="manager_report",
            payload={"report": report, "usage": usage_summary},
        ))
        yield _sse(
            "manager_report",
            {"report": report, "outcomes": outcomes_payload, "usage": usage_summary},
        )
        yield _sse("done", {"ok": True, "usage": usage_summary})

    return EventSourceResponse(stream())
