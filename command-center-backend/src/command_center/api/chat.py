"""POST /api/chat — fluxo SSE completo: pensa → planeja → executa → reporta."""
from __future__ import annotations

import asyncio
import json
import re
import traceback
from collections.abc import AsyncIterator
from typing import Any, Literal

import structlog
from fastapi import APIRouter
from pydantic import BaseModel, Field, field_validator
from sse_starlette.sse import EventSourceResponse

from command_center.agents.manager import Manager
from command_center.analytics import analytics
from command_center.async_utils import fire_and_log
from command_center.config import settings
from command_center.db import session as session_module
from command_center.db.models import Conversation, Message
from command_center.events import Event, bus
from command_center.memory.store import add_memory, generate_decision_summary
from command_center.orchestrator.dispatcher import Dispatcher

# Verbos de ação que indicam pedido de trabalho real (não small talk).
# Se a mensagem for curta E não contiver nenhum, vai pelo fast-path Haiku.
_ACTION_VERBS = re.compile(
    r"\b(crie|criar|cria|adicion|adicionar|refator|refatorar|implement|implementar|"
    r"corrij|corrigir|corrige|test|teste|testar|deploy|deployar|build|buildar|"
    r"escrev|escreva|escrever|gere|gerar|monte|montar|configur|configurar|"
    r"instal|instalar|atualiz|atualizar|remov|remover|delet|deletar|"
    r"audit|auditar|review|revisar|analis|analisar|debug|debugar|investig|investigar|"
    r"plan|planeje|planejar|despach|despachar|execut|executar|rod|rodar)\b",
    re.IGNORECASE,
)


def _is_smalltalk(message: str) -> bool:
    """Heurística: msg curta SEM verbo de ação = small talk → fast-path Haiku.

    Reduz custo de "oi" / "tudo bem?" / "como vc tá?" de $0.29 → ~$0.001.
    """
    text = message.strip()
    if len(text) > 80:
        return False
    return _ACTION_VERBS.search(text) is None


log = structlog.get_logger(__name__)


async def _save_decision_memory(
    *,
    user_message: str,
    manager_report: str,
    conv_id: int,
    project_id: int | None,
    project_name: str | None,
) -> None:
    """Fire-and-forget task: gera summary via Haiku e salva na tabela memory_entries."""
    try:
        summary = await generate_decision_summary(
            user_message=user_message,
            manager_report=manager_report,
            project_name=project_name,
        )
        if not summary:
            log.warning("memory.no_summary_generated", conv_id=conv_id)
            return
        async with session_module.AsyncSessionLocal() as sess:
            await add_memory(
                sess,
                content=summary,
                source_type="decision",
                project_id=project_id,
                conversation_id=conv_id,
            )
            await sess.commit()
        log.info("memory.decision_saved", conv_id=conv_id, project_id=project_id, chars=len(summary))
    except Exception as exc:
        log.warning("memory.save_failed", error=str(exc))


router = APIRouter(prefix="/api", tags=["chat"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10_000)
    conversation_id: int | None = None
    history: list[dict[str, str]] | None = Field(default=None, max_length=20)
    # Override do modelo do Manager por request. Se None, usa default da config
    # OU o fast-path de small-talk (Haiku) quando a mensagem for trivial.
    manager_model: Literal["opus", "sonnet", "haiku"] | None = None
    # Se True, força execução com o modelo escolhido — desativa o auto-detect
    # de small-talk. Útil quando o usuário sabe que quer planejamento real.
    force_planning: bool = False
    # Se True, gera apenas o plano e PARA — não dispara workers nem report.
    # Cliente deve chamar POST /api/dispatch separadamente com as tasks (talvez
    # editadas) pra continuar o fluxo. Habilita o "approve before execute".
    plan_only: bool = False

    @field_validator("message")
    @classmethod
    def _strip_control_chars(cls, v: str) -> str:
        # Bloqueia bytes nulos e caracteres de controle exceto \n, \t, \r
        if "\x00" in v:
            raise ValueError("null bytes não permitidos")
        cleaned = "".join(
            c for c in v
            if c == "\n" or c == "\t" or c == "\r" or ord(c) >= 0x20
        )
        return cleaned


def _sse(event_name: str, data: Any) -> dict[str, Any]:
    return {
        "event": event_name,
        "data": json.dumps(data, ensure_ascii=False, default=str),
    }


@router.post("/chat")
async def chat(req: ChatRequest) -> EventSourceResponse:
    # Resolve modelo: explicit override > smalltalk fast-path > config default
    if req.manager_model:
        chosen_model = req.manager_model
    elif not req.force_planning and _is_smalltalk(req.message):
        chosen_model = settings.smalltalk_model
        log.info("chat.smalltalk_fastpath", message_chars=len(req.message))
    else:
        chosen_model = settings.default_manager_model

    manager = Manager(model=chosen_model)
    dispatcher = Dispatcher()

    async def stream() -> AsyncIterator[dict[str, Any]]:
        # 0) Resolve/cria conversation + persiste user message numa única transação
        # (antes vazava conversa órfã se commit da message falhasse).
        conv_id = req.conversation_id
        conv_project_id: int | None = None
        async with session_module.AsyncSessionLocal() as sess:
            if conv_id is None:
                title = req.message[:60].strip() or "Nova conversa"
                conv = Conversation(title=title)
                sess.add(conv)
                await sess.flush()  # popula conv.id sem commit ainda
                conv_id = conv.id
            else:
                conv = await sess.get(Conversation, conv_id)
                if conv:
                    conv_project_id = conv.project_id
            sess.add(Message(conversation_id=conv_id, role="ceo", content=req.message))
            await sess.commit()

        # Send conversation_id to client so it can update URL
        yield _sse("conversation_started", {"conversation_id": conv_id})
        analytics.track("conversation_started", {"project_id": conv_project_id})

        # 1) Gerente pensando
        thinking_payload = {"message": req.message, "model": chosen_model}
        try:
            await bus.publish(Event(type="manager_thinking", payload=thinking_payload))
        except BaseException as exc:
            tb = traceback.format_exc()
            log.error("chat.publish_failed", error=repr(exc), traceback=tb)
            yield _sse("error", {"stage": "publish", "error": repr(exc), "traceback": tb[-1500:]})
            return
        yield _sse("manager_thinking", thinking_payload)

        # 2) Plano (com streaming de deltas pra UI)
        delta_queue: asyncio.Queue[str] = asyncio.Queue()

        def _on_delta(text: str) -> None:
            try:
                delta_queue.put_nowait(text)
            except asyncio.QueueFull:
                pass  # drop deltas if UI can't keep up

        plan_task = asyncio.create_task(
            asyncio.wait_for(
                manager.plan(
                    req.message,
                    history=req.history,
                    on_delta=_on_delta,
                    project_id=conv_project_id,
                ),
                timeout=settings.manager_timeout_seconds,
            )
        )

        # Drena deltas em paralelo enquanto plan() roda
        try:
            while not plan_task.done():
                try:
                    text = await asyncio.wait_for(delta_queue.get(), timeout=0.1)
                    yield _sse("manager_delta", {"text": text})
                except TimeoutError:
                    continue
            # Drain trailing deltas after plan() finished
            while not delta_queue.empty():
                try:
                    text = delta_queue.get_nowait()
                    yield _sse("manager_delta", {"text": text})
                except asyncio.QueueEmpty:
                    break
            plan = await plan_task  # raises if plan() errored ou timeout
        except BaseException as exc:
            if not plan_task.done():
                plan_task.cancel()
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
        plan_payload["memories_used"] = manager.memories_used
        await bus.publish(Event(type="plan_created", payload=plan_payload))
        yield _sse("plan_created", plan_payload)

        # plan_only: para aqui SOMENTE se há tasks reais pra aprovar.
        # Se plan.tasks está vazio (small talk / direct_reply), cai no report
        # abaixo que usa direct_reply — não faz sentido pedir aprovação de plano vazio.
        if req.plan_only and plan.tasks:
            analytics.track("plan_created", {
                "project_id": conv_project_id,
                "n_tasks": len(plan.tasks),
                "model": chosen_model,
                "plan_only": True,
            })
            yield _sse("done", {
                "ok": True,
                "plan_only": True,
                "conversation_id": conv_id,
            })
            return

        # 3) Despacho — assina o bus síncronamente antes de iniciar dispatcher.
        # Outer try garante detach em qualquer caminho de saída; inner try
        # captura erro do dispatch_task pra cancelá-lo limpo antes de propagar.
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
                        "worker_action",  # cada tool_use do worker (Frente β)
                    }:
                        yield _sse(evt.type, evt.payload)
                result = await dispatch_task
            except BaseException:
                if not dispatch_task.done():
                    dispatch_task.cancel()
                raise
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

        # 4) Relatório final — skip Opus quando não há trabalho a sintetizar.
        # Se o Manager preencheu direct_reply (small talk, sem tasks), usa ele.
        # Senão cai no template fixo.
        if not plan.tasks:
            report = (plan.direct_reply or "").strip() or (
                "Sem trabalho a despachar. Mande um pedido concreto "
                "(projeto + objetivo) que eu monto o plano."
            )
        else:
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

        # Persist manager report + update conversation cost
        report_project_id: int | None = conv_project_id
        report_project_name: str | None = None
        async with session_module.AsyncSessionLocal() as sess:
            sess.add(Message(conversation_id=conv_id, role="manager", content=report))
            conv = await sess.get(Conversation, conv_id)
            if conv is not None:
                conv.total_cost_usd = (conv.total_cost_usd or 0.0) + usage_summary["total"]["cost_usd"]
                report_project_id = conv.project_id
                if conv.project_id:
                    from command_center.db.models import Project
                    proj = await sess.get(Project, conv.project_id)
                    if proj:
                        report_project_name = proj.name
            await sess.commit()

        # Track completion analytics
        total_cost = usage_summary["total"]["cost_usd"]
        analytics.track("chat_completed", {
            "project_id": report_project_id,
            "n_tasks": len(plan.tasks),
            "model": chosen_model,
            "cost_usd": round(total_cost, 6),
            "is_smalltalk": not plan.tasks,
            "workers_succeeded": sum(1 for o in result.outcomes if o.status == "done"),
            "workers_failed": sum(1 for o in result.outcomes if o.status == "failed"),
        })

        yield _sse("done", {"ok": True, "usage": usage_summary})

        # Fire-and-forget: gera decision summary via Haiku e persiste como memória.
        # Só pra conversas com trabalho real (tem tasks) — small talk não merece memory.
        if plan.tasks:
            fire_and_log(
                _save_decision_memory(
                    user_message=req.message,
                    manager_report=report,
                    conv_id=conv_id,
                    project_id=report_project_id,
                    project_name=report_project_name,
                ),
                name="memory.decision_summary",
            )

    return EventSourceResponse(stream())
