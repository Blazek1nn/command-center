"""POST /api/dispatch — executa um plano (talvez editado pelo CEO).

Companheiro do `plan_only=True` em /api/chat. Fluxo:
  1. Cliente manda /api/chat?plan_only=true → recebe `plan_created`
  2. Cliente exibe PlanEditor inline; CEO edita tasks (modelo, prompt, ordem)
  3. Cliente manda POST /api/dispatch {conversation_id, tasks: [...]}
  4. Backend roda dispatcher e streamea SSE igual ao chat.py
"""
from __future__ import annotations

import asyncio
import json
import traceback
from collections.abc import AsyncIterator
from typing import Any, Literal

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from command_center.agents.manager import Manager, Plan, TaskSpec
from command_center.config import settings
from command_center.db import session as session_module
from command_center.db.models import Conversation, Message
from command_center.events import Event, bus
from command_center.orchestrator.dispatcher import Dispatcher

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/api", tags=["dispatch"])


class TaskSpecIn(BaseModel):
    """Schema do TaskSpec esperado do cliente — idêntico ao backend."""
    title: str = Field(min_length=1, max_length=300)
    prompt: str = Field(min_length=1, max_length=10_000)
    project: str | None = None
    model: Literal["opus", "sonnet", "haiku"] = "sonnet"
    specialty: str = "code"
    depends_on: list[int] = Field(default_factory=list)


class DispatchRequest(BaseModel):
    conversation_id: int
    understanding: str = ""
    tasks: list[TaskSpecIn] = Field(default_factory=list, max_length=20)
    execution_mode: Literal["parallel", "sequential"] = "sequential"
    # Modelo usado pelo Reporter (síntese final). Default sonnet — Opus
    # raramente vale o custo na síntese.
    reporter_model: Literal["opus", "sonnet", "haiku"] = "sonnet"


def _sse(event_name: str, data: Any) -> dict[str, Any]:
    return {
        "event": event_name,
        "data": json.dumps(data, ensure_ascii=False, default=str),
    }


@router.post("/dispatch")
async def dispatch_plan(req: DispatchRequest) -> EventSourceResponse:
    if not req.tasks:
        raise HTTPException(
            status_code=400,
            detail="tasks vazio — pra small talk use /api/chat normal."
        )

    # Reconstrói Plan a partir do payload (compatível com manager.Plan).
    plan = Plan(
        understanding=req.understanding or "Plano editado pelo CEO.",
        execution_mode=req.execution_mode,
        tasks=[TaskSpec(**t.model_dump()) for t in req.tasks],
        estimated_minutes=0,
        direct_reply=None,
        critique=None,
    )

    dispatcher = Dispatcher()
    # Manager usado SÓ pro reporter — não vai gerar plano (já temos)
    manager = Manager(model=req.reporter_model)

    async def stream() -> AsyncIterator[dict[str, Any]]:
        # Persiste mensagem "system" indicando que veio de um plan editado
        async with session_module.AsyncSessionLocal() as sess:
            conv = await sess.get(Conversation, req.conversation_id)
            if conv is None:
                yield _sse("error", {"stage": "lookup", "error": f"conv {req.conversation_id} não existe"})
                return

        yield _sse("plan_created", plan.model_dump())

        # Despacho — mesma lógica do /api/chat
        queue = bus.attach()
        try:
            dispatch_task = asyncio.create_task(dispatcher.execute_plan(plan))
            try:
                while not dispatch_task.done() or not queue.empty():
                    try:
                        evt = await asyncio.wait_for(queue.get(), timeout=0.5)
                    except TimeoutError:
                        continue
                    if evt.type in {
                        "task_started",
                        "task_progress",
                        "task_completed",
                        "task_failed",
                        "worker_action",
                    }:
                        yield _sse(evt.type, evt.payload)
                result = await dispatch_task
            except BaseException:
                if not dispatch_task.done():
                    dispatch_task.cancel()
                raise
        except Exception as exc:
            tb = traceback.format_exc()
            log.error("dispatch.failed", error=repr(exc), traceback=tb)
            yield _sse("error", {"stage": "dispatch", "error": str(exc), "traceback": tb[-1500:]})
            return
        finally:
            bus.detach(queue)

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

        # Reporter
        try:
            report = await manager.report(plan, outcomes_payload)
        except Exception as exc:
            report = f"_(falha ao gerar relatório: {exc})_"

        yield _sse(
            "manager_report",
            {"report": report, "outcomes": outcomes_payload, "usage": usage_summary},
        )

        # Persist
        async with session_module.AsyncSessionLocal() as sess:
            sess.add(Message(conversation_id=req.conversation_id, role="manager", content=report))
            conv = await sess.get(Conversation, req.conversation_id)
            if conv is not None:
                conv.total_cost_usd = (conv.total_cost_usd or 0.0) + usage_summary["total"]["cost_usd"]
            await sess.commit()

        yield _sse("done", {"ok": True, "usage": usage_summary})

    return EventSourceResponse(stream())


# Endpoint conveniente: estima custo TOTAL de um plano antes de despachar.
# UI usa pra mostrar "Custo estimado: $X" no PlanEditor.
class CostEstimateRequest(BaseModel):
    tasks: list[TaskSpecIn]


class CostEstimateBreakdown(BaseModel):
    per_task: list[float]
    total_usd: float
    total_brl: float
    note: str


@router.post("/dispatch/estimate", response_model=CostEstimateBreakdown)
async def estimate_dispatch(req: CostEstimateRequest) -> CostEstimateBreakdown:
    """Estima custo total. Cada task ~ prompt-input + 2000 tokens output."""
    pricing = {"opus": (15.0, 75.0), "sonnet": (3.0, 15.0), "haiku": (0.80, 4.0)}
    per_task: list[float] = []
    for t in req.tasks:
        in_tokens = max(200, len(t.prompt) // 4 + 1500)  # +system prompt overhead
        out_tokens = 2000  # estimativa conservadora pro output do worker
        in_p, out_p = pricing.get(t.model, pricing["sonnet"])
        cost = (in_tokens * in_p + out_tokens * out_p) / 1_000_000
        per_task.append(round(cost, 4))

    total = sum(per_task)
    # Add reporter (Sonnet) cost ~ $0.05
    total += 0.05

    return CostEstimateBreakdown(
        per_task=per_task,
        total_usd=round(total, 4),
        total_brl=round(total * 5.0, 2),
        note=(
            "Soma dos workers + ~$0.05 do reporter. Não inclui custo do Manager "
            "(já gasto na geração do plano)."
        ),
    )
