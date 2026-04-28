"""Wrapper subprocess do `claude --print` em modo stream-json.

CRÍTICO: NÃO usa a Anthropic API direta. Tudo passa pelo CLI `claude`,
que está autenticado via OAuth no host (créditos da conta Pro/Max do CEO).
Não exigimos `ANTHROPIC_API_KEY`.
"""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import threading
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import structlog

from command_center.config import settings


log = structlog.get_logger(__name__)


ModelAlias = Literal["opus", "sonnet", "haiku"]

# Aliases curtos → IDs reais aceitos pelo CLI.
MODEL_MAP: dict[str, str] = {
    "opus": "claude-opus-4-7",
    "sonnet": "claude-sonnet-4-6",
    "haiku": "claude-haiku-4-5-20251001",
}


# ---------- Eventos tipados emitidos pelo runner ----------

@dataclass
class TextDelta:
    text: str


@dataclass
class ToolUse:
    tool_name: str
    tool_input: dict[str, Any]
    tool_use_id: str | None = None


@dataclass
class ToolResult:
    tool_use_id: str | None
    content: Any


@dataclass
class TokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0

    @property
    def total(self) -> int:
        return self.input_tokens + self.output_tokens

    @classmethod
    def from_dict(cls, raw: dict[str, Any] | None) -> "TokenUsage":
        if not raw:
            return cls()
        return cls(
            input_tokens=int(raw.get("input_tokens") or 0),
            output_tokens=int(raw.get("output_tokens") or 0),
            cache_read_input_tokens=int(raw.get("cache_read_input_tokens") or 0),
            cache_creation_input_tokens=int(raw.get("cache_creation_input_tokens") or 0),
        )


@dataclass
class Done:
    final_text: str
    cost_usd: float | None = None
    duration_ms: int | None = None
    usage: TokenUsage = field(default_factory=lambda: TokenUsage())
    raw_result: dict[str, Any] = field(default_factory=dict)


@dataclass
class RunnerError:
    message: str
    stderr: str | None = None


RunEvent = TextDelta | ToolUse | ToolResult | Done | RunnerError


class ClaudeRunner:
    """Executa `claude --print --output-format stream-json` e parseia linha-a-linha."""

    def __init__(
        self,
        cli_path: str | None = None,
        timeout_seconds: int | None = None,
    ) -> None:
        self.cli_path = cli_path or settings.claude_cli_path
        self.timeout_seconds = timeout_seconds or settings.task_timeout_seconds

    def _build_args(
        self,
        prompt: str,
        model: ModelAlias | str,
        system_prompt: str | None,
    ) -> list[str]:
        resolved = MODEL_MAP.get(model, model)
        args: list[str] = [
            self.cli_path,
            "--print",
            "--model",
            resolved,
            "--output-format",
            "stream-json",
            "--verbose",
        ]
        if system_prompt:
            args.extend(["--append-system-prompt", system_prompt])
        args.append(prompt)
        return args

    async def run(
        self,
        prompt: str,
        model: ModelAlias | str = "sonnet",
        cwd: Path | str | None = None,
        system_prompt: str | None = None,
    ) -> AsyncIterator[RunEvent]:
        args = self._build_args(prompt, model, system_prompt)
        cwd_str = str(cwd) if cwd else None

        log.info(
            "claude_runner.start",
            model=model,
            cwd=cwd_str,
            prompt_chars=len(prompt),
            has_system=bool(system_prompt),
        )

        # No Windows, asyncio.create_subprocess_exec frequentemente cai num
        # event loop sem suporte a subprocess (NotImplementedError). Em vez de
        # nos preocuparmos com a policy correta, sempre rodamos em thread via
        # subprocess.Popen + asyncio.Queue. Funciona em qualquer plataforma.
        async for event in self._run_threaded(args, cwd_str):
            yield event

    async def _run_threaded(
        self,
        args: list[str],
        cwd_str: str | None,
    ) -> AsyncIterator[RunEvent]:
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[RunEvent | None] = asyncio.Queue()
        env = os.environ.copy()

        creationflags = 0
        startupinfo = None
        if sys.platform == "win32":
            creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = 0  # SW_HIDE

        try:
            proc = subprocess.Popen(
                args,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=cwd_str,
                env=env,
                bufsize=1,  # line-buffered
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=creationflags,
                startupinfo=startupinfo,
            )
        except FileNotFoundError as exc:
            yield RunnerError(message=f"CLI '{self.cli_path}' não encontrado: {exc}")
            return

        cancel_flag = threading.Event()
        accumulated: list[str] = []

        def _emit(event: RunEvent) -> None:
            asyncio.run_coroutine_threadsafe(queue.put(event), loop)

        def _emit_sentinel() -> None:
            asyncio.run_coroutine_threadsafe(queue.put(None), loop)

        def _reader() -> None:
            stderr_buf: list[str] = []

            def _drain_stderr() -> None:
                if proc.stderr is None:
                    return
                for line in proc.stderr:
                    stderr_buf.append(line)

            stderr_thread = threading.Thread(target=_drain_stderr, daemon=True)
            stderr_thread.start()

            saw_done = False
            try:
                if proc.stdout is None:
                    return
                for raw in proc.stdout:
                    if cancel_flag.is_set():
                        break
                    line = raw.strip()
                    if not line:
                        continue
                    try:
                        msg = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    for event in self._parse_message_sync(msg, accumulated):
                        if isinstance(event, Done):
                            saw_done = True
                        _emit(event)

                try:
                    proc.wait(timeout=self.timeout_seconds)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()
                    _emit(RunnerError(message=f"Timeout após {self.timeout_seconds}s"))
                    return

                stderr_thread.join(timeout=1.0)
                if proc.returncode != 0 and not saw_done:
                    stderr_text = "".join(stderr_buf)
                    _emit(
                        RunnerError(
                            message=f"claude CLI exit code {proc.returncode}",
                            stderr=stderr_text[-2000:],
                        ),
                    )
            except Exception as exc:  # noqa: BLE001
                _emit(RunnerError(message=f"reader thread crash: {exc!r}"))
            finally:
                _emit_sentinel()

        reader_thread = threading.Thread(target=_reader, daemon=True)
        reader_thread.start()

        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield item
        except asyncio.CancelledError:
            cancel_flag.set()
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            raise
        finally:
            cancel_flag.set()
            if proc.poll() is None:
                try:
                    proc.kill()
                except ProcessLookupError:
                    pass

    @staticmethod
    def _parse_message_sync(
        msg: dict[str, Any],
        accumulated: list[str],
    ) -> list[RunEvent]:
        """Versão síncrona do parser — usado pela thread reader."""
        events: list[RunEvent] = []
        msg_type = msg.get("type")

        if msg_type == "assistant":
            message = msg.get("message", {})
            for block in message.get("content", []) or []:
                btype = block.get("type")
                if btype == "text":
                    text = block.get("text", "")
                    if text:
                        accumulated.append(text)
                        events.append(TextDelta(text=text))
                elif btype == "tool_use":
                    events.append(
                        ToolUse(
                            tool_name=block.get("name", ""),
                            tool_input=block.get("input", {}) or {},
                            tool_use_id=block.get("id"),
                        ),
                    )
        elif msg_type == "user":
            message = msg.get("message", {})
            content = message.get("content", [])
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_result":
                        events.append(
                            ToolResult(
                                tool_use_id=block.get("tool_use_id"),
                                content=block.get("content"),
                            ),
                        )
        elif msg_type == "result":
            events.append(
                Done(
                    final_text="".join(accumulated) or msg.get("result", "") or "",
                    cost_usd=msg.get("total_cost_usd") or msg.get("cost_usd"),
                    duration_ms=msg.get("duration_ms"),
                    usage=TokenUsage.from_dict(msg.get("usage")),
                    raw_result=msg,
                ),
            )
        return events

    @staticmethod
    async def _iter_lines(stream: asyncio.StreamReader) -> AsyncIterator[str]:
        while True:
            line = await stream.readline()
            if not line:
                break
            yield line.decode("utf-8", errors="replace")

    @staticmethod
    async def _parse_message(
        msg: dict[str, Any],
        accumulated: list[str],
    ) -> AsyncIterator[RunEvent]:
        msg_type = msg.get("type")

        if msg_type == "assistant":
            message = msg.get("message", {})
            for block in message.get("content", []) or []:
                btype = block.get("type")
                if btype == "text":
                    text = block.get("text", "")
                    if text:
                        accumulated.append(text)
                        yield TextDelta(text=text)
                elif btype == "tool_use":
                    yield ToolUse(
                        tool_name=block.get("name", ""),
                        tool_input=block.get("input", {}) or {},
                        tool_use_id=block.get("id"),
                    )

        elif msg_type == "user":
            message = msg.get("message", {})
            content = message.get("content", [])
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_result":
                        yield ToolResult(
                            tool_use_id=block.get("tool_use_id"),
                            content=block.get("content"),
                        )

        elif msg_type == "result":
            yield Done(
                final_text="".join(accumulated) or msg.get("result", "") or "",
                cost_usd=msg.get("total_cost_usd") or msg.get("cost_usd"),
                duration_ms=msg.get("duration_ms"),
                usage=TokenUsage.from_dict(msg.get("usage")),
                raw_result=msg,
            )


async def run_to_string(
    prompt: str,
    model: ModelAlias | str = "sonnet",
    cwd: Path | str | None = None,
    system_prompt: str | None = None,
) -> tuple[str, Done | None, RunnerError | None]:
    """Helper: drena o stream e devolve (texto_final, done, erro)."""
    runner = ClaudeRunner()
    parts: list[str] = []
    done: Done | None = None
    error: RunnerError | None = None
    async for event in runner.run(prompt, model=model, cwd=cwd, system_prompt=system_prompt):
        if isinstance(event, TextDelta):
            parts.append(event.text)
        elif isinstance(event, Done):
            done = event
        elif isinstance(event, RunnerError):
            error = event
    final = done.final_text if done and done.final_text else "".join(parts)
    return final, done, error
