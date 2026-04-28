from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Literal

import structlog
from pydantic import BaseModel, Field

from command_center.agents.claude_runner import (
    ClaudeRunner,
    Done,
    RunnerError,
    TextDelta,
    TokenUsage,
)
from command_center.config import settings


log = structlog.get_logger(__name__)


PROMPTS_DIR = Path(__file__).parent / "prompts"


class TaskSpec(BaseModel):
    title: str
    prompt: str
    project: str | None = None
    model: Literal["opus", "sonnet", "haiku"] = "sonnet"
    specialty: str = "code"
    depends_on: list[int] = Field(default_factory=list)


class Plan(BaseModel):
    understanding: str
    execution_mode: Literal["parallel", "sequential"] = "sequential"
    tasks: list[TaskSpec] = Field(default_factory=list)
    estimated_minutes: int = 0


class ManagerUsage(BaseModel):
    """Custo/tokens consumidos pelas chamadas do próprio gerente (plan + report)."""

    cost_usd: float = 0.0
    input_tokens: int = 0
    output_tokens: int = 0

    def add(self, *, cost_usd: float | None, usage: TokenUsage) -> None:
        if cost_usd:
            self.cost_usd += cost_usd
        self.input_tokens += usage.input_tokens
        self.output_tokens += usage.output_tokens


def _load_system_prompt() -> str:
    return (PROMPTS_DIR / "manager.md").read_text(encoding="utf-8")


def _extract_json(text: str) -> str | None:
    fence = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        return fence.group(1)
    fence_any = re.search(r"```\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence_any:
        return fence_any.group(1)
    candidate = re.search(r"(\{.*\})", text, re.DOTALL)
    if candidate:
        return candidate.group(1)
    return None


class Manager:
    """Gerente sênior — decompõe pedido do CEO em Plan estruturado."""

    def __init__(self, model: str | None = None, runner: ClaudeRunner | None = None) -> None:
        self.model = model or settings.default_manager_model
        self.runner = runner or ClaudeRunner()
        self.system_prompt = _load_system_prompt()
        self.usage = ManagerUsage()

    async def plan(
        self,
        ceo_message: str,
        history: list[dict] | None = None,
    ) -> Plan:
        lines: list[str] = []
        if history:
            lines.append("Contexto da conversa (mais recente por último):")
            for msg in history[-10:]:
                role = msg.get("role", "ceo")
                content = msg.get("content", "")
                lines.append(f"- {role}: {content[:500]}")
            lines.append("")
        lines.append(f"Pedido atual do CEO:\n{ceo_message}")
        lines.append("")
        lines.append(
            "Responda APENAS com um bloco JSON dentro de ```json ... ```, "
            "seguindo o schema obrigatório do system prompt. Sem texto fora do bloco."
        )
        prompt = "\n".join(lines)

        parts: list[str] = []
        async for event in self.runner.run(
            prompt=prompt,
            model=self.model,
            system_prompt=self.system_prompt,
        ):
            if isinstance(event, TextDelta):
                parts.append(event.text)
            elif isinstance(event, Done):
                self.usage.add(cost_usd=event.cost_usd, usage=event.usage)
            elif isinstance(event, RunnerError):
                log.error(
                    "manager.plan_error",
                    error=event.message,
                    stderr=(event.stderr or "")[-1000:],
                )
                detail = event.message or "(sem mensagem)"
                if event.stderr:
                    detail += f" | stderr: {event.stderr[-400:]}"
                raise RuntimeError(f"Manager falhou: {detail}")

        full_text = "".join(parts)
        block = _extract_json(full_text)
        if not block:
            log.error("manager.no_json", text=full_text[:500])
            raise ValueError(
                "Gerente não retornou JSON parseável. "
                f"Resposta bruta (primeiros 300 chars): {full_text[:300]!r}"
            )

        try:
            data = json.loads(block)
        except json.JSONDecodeError as exc:
            raise ValueError(f"JSON inválido do gerente: {exc}") from exc

        return Plan.model_validate(data)

    async def report(self, plan: Plan, results: list[dict]) -> str:
        plan_json = plan.model_dump_json(indent=2)
        results_json = json.dumps(results, ensure_ascii=False, indent=2, default=str)
        prompt = (
            "Os funcionários terminaram. Gere um relatório consolidado para o CEO em "
            "**markdown**, em PT-BR, seguindo o formato do system prompt "
            "(TL;DR, O que foi feito, Problemas, Próximos passos).\n\n"
            f"## Plano original\n```json\n{plan_json}\n```\n\n"
            f"## Resultados\n```json\n{results_json}\n```"
        )
        parts: list[str] = []
        async for event in self.runner.run(
            prompt=prompt,
            model=self.model,
            system_prompt=self.system_prompt,
        ):
            if isinstance(event, TextDelta):
                parts.append(event.text)
            elif isinstance(event, Done):
                self.usage.add(cost_usd=event.cost_usd, usage=event.usage)
            elif isinstance(event, RunnerError):
                log.error("manager.report_error", error=event.message)
                return f"_(falha ao gerar relatório: {event.message})_"
        return "".join(parts)
