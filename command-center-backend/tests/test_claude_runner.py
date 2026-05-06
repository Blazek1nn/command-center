from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from command_center.agents.claude_runner import (
    ClaudeRunner,
    Done,
    TextDelta,
    ToolUse,
)


def _fake_popen_factory(stdout_lines: list[str], returncode: int = 0):
    """Cria uma factory que retorna um MagicMock parecendo subprocess.Popen.

    O atributo `.stdout` é iterável (file-like): for raw in proc.stdout: ...
    Cada linha já é uma string (modo text=True no Popen real).
    """
    def factory(*args, **kwargs):
        proc = MagicMock()
        proc.stdout = iter(stdout_lines)
        proc.stderr = iter([])
        proc.returncode = returncode
        proc.poll = MagicMock(return_value=returncode)
        proc.wait = MagicMock(return_value=returncode)
        proc.kill = MagicMock()
        return proc
    return factory


@pytest.mark.asyncio
async def test_claude_runner_streams_correctly() -> None:
    """Mocka subprocess.Popen e verifica que TextDelta + ToolUse + Done são emitidos."""
    stdout_lines = [
        json.dumps({
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "text", "text": "Olá"},
                    {
                        "type": "tool_use",
                        "id": "t1",
                        "name": "Bash",
                        "input": {"command": "ls"},
                    },
                ]
            },
        }) + "\n",
        json.dumps({
            "type": "result",
            "result": "Olá",
            "total_cost_usd": 0.01,
            "duration_ms": 1234,
        }) + "\n",
    ]

    with patch(
        "command_center.agents.claude_runner.subprocess.Popen",
        side_effect=_fake_popen_factory(stdout_lines),
    ):
        runner = ClaudeRunner(cli_path="claude", timeout_seconds=5)
        events = []
        async for event in runner.run("oi", model="sonnet"):
            events.append(event)

    text_deltas = [e for e in events if isinstance(e, TextDelta)]
    assert len(text_deltas) >= 1
    assert any(td.text == "Olá" for td in text_deltas)

    tool_uses = [e for e in events if isinstance(e, ToolUse)]
    assert len(tool_uses) == 1
    assert tool_uses[0].tool_name == "Bash"
    assert tool_uses[0].tool_input == {"command": "ls"}

    done_events = [e for e in events if isinstance(e, Done)]
    assert len(done_events) == 1
    assert done_events[0].cost_usd == 0.01
    assert done_events[0].duration_ms == 1234


@pytest.mark.asyncio
async def test_claude_runner_handles_missing_cli() -> None:
    """Quando subprocess.Popen levanta FileNotFoundError, emite RunnerError."""
    with patch(
        "command_center.agents.claude_runner.subprocess.Popen",
        side_effect=FileNotFoundError("no claude"),
    ):
        runner = ClaudeRunner(cli_path="nope-claude", timeout_seconds=5)
        events = [e async for e in runner.run("oi", model="haiku")]

    from command_center.agents.claude_runner import RunnerError
    assert len(events) == 1
    assert isinstance(events[0], RunnerError)
    assert "nope-claude" in events[0].message
