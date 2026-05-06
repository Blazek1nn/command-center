from __future__ import annotations

import asyncio
import shutil
import subprocess
import sys
from unittest.mock import patch

import pytest

from command_center.agents.claude_runner import ClaudeRunner


def _slow_command() -> tuple[str, list[str]]:
    """Resolve a long-running stand-in binary that won't exit on its own.

    Returns (cli_path, full_args). Returns ("", []) if no suitable binary is
    available on this platform — caller should pytest.skip in that case.
    """
    if sys.platform == "win32":
        ping = shutil.which("ping") or shutil.which("PING.EXE")
        if not ping:
            return "", []
        return ping, [ping, "-n", "60", "127.0.0.1"]
    sleep_bin = shutil.which("sleep")
    if not sleep_bin:
        return "", []
    return sleep_bin, [sleep_bin, "60"]


@pytest.mark.asyncio
async def test_runner_reaps_subprocess_on_cancel() -> None:
    """Cancelar o consumer do runner deve matar o subprocess E aguardar o reap.

    Verificamos não apenas que a async task termina sem deadlock, mas também
    que o subprocess foi de fato esperado (proc.returncode != None significa
    que proc.wait() retornou — ou seja, o reap aconteceu).
    """
    cli_path, full_args = _slow_command()
    if not cli_path:
        pytest.skip("No suitable long-running stand-in binary found on this platform")

    runner = ClaudeRunner(cli_path=cli_path, timeout_seconds=120)
    runner._build_args = lambda *a, **k: full_args  # type: ignore[method-assign]

    captured_procs: list[subprocess.Popen[str]] = []
    original_popen = subprocess.Popen

    def capturing_popen(*args, **kwargs):  # type: ignore[no-untyped-def]
        proc = original_popen(*args, **kwargs)
        captured_procs.append(proc)
        return proc

    async def consume() -> None:
        async for evt in runner.run(prompt="ignored", model="sonnet"):
            _ = evt

    with patch(
        "command_center.agents.claude_runner.subprocess.Popen",
        side_effect=capturing_popen,
    ):
        task = asyncio.create_task(consume())
        await asyncio.sleep(1.0)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    assert task.done()
    assert len(captured_procs) >= 1, "expected ClaudeRunner to start a subprocess"
    proc = captured_procs[0]
    # proc.returncode is None while running. After a successful proc.wait()
    # (called inside the async finally), it MUST be set.
    assert proc.returncode is not None, (
        "subprocess.wait() was not called — Fix 4 regression: process is leaking"
    )
