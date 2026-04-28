from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import structlog

from command_center.agents.claude_runner import (
    ClaudeRunner,
    Done,
    RunEvent,
    RunnerError,
    TextDelta,
    TokenUsage,
)


log = structlog.get_logger(__name__)


PROMPTS_DIR = Path(__file__).parent / "prompts"


def _load_employee_prompt() -> str:
    return (PROMPTS_DIR / "employee.md").read_text(encoding="utf-8")


@dataclass
class EmployeeResult:
    output: str
    cost_usd: float | None = None
    duration_ms: int | None = None
    usage: TokenUsage = field(default_factory=lambda: TokenUsage())
    error: str | None = None


class Employee:
    """Funcionário (Sonnet/Haiku) — executa uma task num projeto."""

    def __init__(
        self,
        name: str,
        model: Literal["opus", "sonnet", "haiku"] = "sonnet",
        specialty: str = "code",
        runner: ClaudeRunner | None = None,
    ) -> None:
        self.name = name
        self.model = model
        self.specialty = specialty
        self.runner = runner or ClaudeRunner()
        self.system_prompt = _load_employee_prompt()

    async def execute(
        self,
        prompt: str,
        cwd: Path | str | None = None,
    ) -> AsyncIterator[RunEvent]:
        log.info("employee.start", name=self.name, model=self.model, cwd=str(cwd) if cwd else None)
        contextualized = (
            f"# Sua identidade\n"
            f"Você é o funcionário **{self.name}** "
            f"(especialidade: {self.specialty}, modelo: {self.model}). "
            f"Execute a tarefa abaixo passo a passo.\n\n"
            f"# Tarefa\n{prompt}"
        )
        async for event in self.runner.run(
            prompt=contextualized,
            model=self.model,
            cwd=cwd,
            system_prompt=self.system_prompt,
        ):
            yield event

    async def execute_collected(
        self,
        prompt: str,
        cwd: Path | str | None = None,
    ) -> EmployeeResult:
        parts: list[str] = []
        cost: float | None = None
        duration: int | None = None
        usage = TokenUsage()
        error: str | None = None
        final_text_from_done: str | None = None

        async for event in self.execute(prompt, cwd=cwd):
            if isinstance(event, TextDelta):
                parts.append(event.text)
            elif isinstance(event, Done):
                cost = event.cost_usd
                duration = event.duration_ms
                usage = event.usage
                if event.final_text:
                    final_text_from_done = event.final_text
            elif isinstance(event, RunnerError):
                error = event.message

        output = final_text_from_done or "".join(parts)
        return EmployeeResult(
            output=output,
            cost_usd=cost,
            duration_ms=duration,
            usage=usage,
            error=error,
        )
