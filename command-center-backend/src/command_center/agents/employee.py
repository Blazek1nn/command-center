from __future__ import annotations

from collections.abc import AsyncIterator, Callable
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
    ToolUse,
)


log = structlog.get_logger(__name__)


PROMPTS_DIR = Path(__file__).parent / "prompts"

_EMPLOYEE_PROMPT_CACHE: str | None = None


def _load_employee_prompt() -> str:
    """Cache em memória — antes recarregava do disco a cada Employee()."""
    global _EMPLOYEE_PROMPT_CACHE
    if _EMPLOYEE_PROMPT_CACHE is None:
        _EMPLOYEE_PROMPT_CACHE = (PROMPTS_DIR / "employee.md").read_text(encoding="utf-8")
    return _EMPLOYEE_PROMPT_CACHE


@dataclass
class FileTouch:
    """Registro de toque em arquivo via tool_use (Write/Edit/MultiEdit)."""
    tool: str  # "Write" | "Edit" | "MultiEdit" | "NotebookEdit"
    path: str
    operation: str  # "create" | "modify" | "delete"


@dataclass
class EmployeeResult:
    output: str
    cost_usd: float | None = None
    duration_ms: int | None = None
    usage: TokenUsage = field(default_factory=lambda: TokenUsage())
    error: str | None = None
    # Sprint 3: True se a falha foi por permission prompt detectado pelo
    # watchdog. Dispatcher propaga pra UI mostrar mensagem específica.
    permission_blocked: bool = False
    # Lista de tool_use observados durante a execução. Usado pra mostrar
    # ao CEO o que o worker fez (file changes, comandos rodados).
    tool_uses: list[ToolUse] = field(default_factory=list)
    # Subconjunto: arquivos tocados (Write/Edit). UI usa pra cards de mudança.
    files_touched: list[FileTouch] = field(default_factory=list)


# Tools que indicam mudança de filesystem
_FS_WRITE_TOOLS = {"Write": "create", "Edit": "modify", "MultiEdit": "modify", "NotebookEdit": "modify"}


def _extract_file_touch(tu: ToolUse) -> FileTouch | None:
    op = _FS_WRITE_TOOLS.get(tu.tool_name)
    if op is None:
        return None
    # Conventionally Anthropic tools usam "file_path" ou "path"
    inp = tu.tool_input or {}
    path = inp.get("file_path") or inp.get("path") or inp.get("notebook_path")
    if not path:
        return None
    return FileTouch(tool=tu.tool_name, path=str(path), operation=op)


class Employee:
    """Funcionário (Sonnet/Haiku) — executa uma task num projeto."""

    def __init__(
        self,
        name: str,
        model: Literal["opus", "sonnet", "haiku"] = "sonnet",
        specialty: str = "code",
        runner: ClaudeRunner | None = None,
        skills_block: str | None = None,
        mcp_config_path: "Path | None" = None,
    ) -> None:
        self.name = name
        self.model = model
        self.specialty = specialty
        self.runner = runner or ClaudeRunner()
        self.system_prompt = _load_employee_prompt()
        # Skills injetadas (Frente δ): bloco markdown pré-concatenado
        self.skills_block = skills_block
        # Path do mcp.json do projeto (Frente δ)
        self.mcp_config_path = mcp_config_path

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
            skills_block=self.skills_block,
            mcp_config_path=self.mcp_config_path,
        ):
            yield event

    async def execute_collected(
        self,
        prompt: str,
        cwd: Path | str | None = None,
        on_tool_use: Callable[[ToolUse], None] | None = None,
    ) -> EmployeeResult:
        parts: list[str] = []
        cost: float | None = None
        duration: int | None = None
        usage = TokenUsage()
        error: str | None = None
        permission_blocked = False
        final_text_from_done: str | None = None
        tool_uses: list[ToolUse] = []
        files_touched: list[FileTouch] = []

        async for event in self.execute(prompt, cwd=cwd):
            if isinstance(event, TextDelta):
                parts.append(event.text)
            elif isinstance(event, ToolUse):
                tool_uses.append(event)
                touch = _extract_file_touch(event)
                if touch is not None:
                    files_touched.append(touch)
                # Callback síncrono — usado pelo dispatcher pra publicar no bus
                if on_tool_use is not None:
                    try:
                        on_tool_use(event)
                    except Exception as exc:
                        log.warning("employee.tool_use_callback_failed", error=str(exc))
            elif isinstance(event, Done):
                cost = event.cost_usd
                duration = event.duration_ms
                usage = event.usage
                if event.final_text:
                    final_text_from_done = event.final_text
            elif isinstance(event, RunnerError):
                error = event.message
                if event.permission_blocked:
                    permission_blocked = True

        output = final_text_from_done or "".join(parts)
        return EmployeeResult(
            output=output,
            cost_usd=cost,
            duration_ms=duration,
            usage=usage,
            error=error,
            permission_blocked=permission_blocked,
            tool_uses=tool_uses,
            files_touched=files_touched,
        )
