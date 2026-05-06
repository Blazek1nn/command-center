from __future__ import annotations

import asyncio
from unittest.mock import patch

import pytest

from command_center.agents.employee import EmployeeResult
from command_center.agents.manager import Plan, TaskSpec
from command_center.events import Event, bus
from command_center.orchestrator.dispatcher import Dispatcher


@pytest.mark.asyncio
async def test_task_started_payload_includes_index() -> None:
    """task_started, task_completed e task_failed DEVEM carregar o índice
    estável do plano para que o frontend faça binding sem ambiguidade."""
    captured: list[Event] = []
    captured_done = asyncio.Event()

    queue = bus.attach()

    async def consume() -> None:
        try:
            while True:
                evt = await queue.get()
                captured.append(evt)
                if evt.type == "task_completed" and len(
                    [e for e in captured if e.type == "task_completed"]
                ) >= 2:
                    captured_done.set()
                    return
        except asyncio.CancelledError:
            pass

    consumer = asyncio.create_task(consume())

    async def _fake_execute(self, prompt, cwd=None):
        return EmployeeResult(output="ok", cost_usd=0.0, duration_ms=5)

    with patch(
        "command_center.agents.employee.Employee.execute_collected",
        _fake_execute,
    ):
        plan = Plan(
            understanding="x",
            execution_mode="sequential",
            tasks=[
                TaskSpec(title="A", prompt="p", model="sonnet", specialty="code"),
                TaskSpec(title="B", prompt="p", model="sonnet", specialty="code"),
            ],
        )
        dispatcher = Dispatcher(max_parallel=1)
        await dispatcher.execute_plan(plan)

    await asyncio.wait_for(captured_done.wait(), timeout=3.0)
    consumer.cancel()
    try:
        await consumer
    except asyncio.CancelledError:
        pass
    bus.detach(queue)

    started = [e for e in captured if e.type == "task_started"]
    completed = [e for e in captured if e.type == "task_completed"]

    assert len(started) == 2
    assert len(completed) == 2

    # Cada evento DEVE ter index, e os índices devem ser 0 e 1
    assert {e.payload.get("index") for e in started} == {0, 1}
    assert {e.payload.get("index") for e in completed} == {0, 1}


@pytest.mark.asyncio
async def test_task_failed_payload_includes_index() -> None:
    """task_failed (caminho de exceção) também carrega index."""
    captured: list[Event] = []
    captured_done = asyncio.Event()

    queue = bus.attach()

    async def consume() -> None:
        try:
            while True:
                evt = await queue.get()
                captured.append(evt)
                if evt.type == "task_failed":
                    captured_done.set()
                    return
        except asyncio.CancelledError:
            pass

    consumer = asyncio.create_task(consume())

    async def _fake_execute_raises(self, prompt, cwd=None):
        raise RuntimeError("boom")

    with patch(
        "command_center.agents.employee.Employee.execute_collected",
        _fake_execute_raises,
    ):
        plan = Plan(
            understanding="x",
            execution_mode="sequential",
            tasks=[TaskSpec(title="X", prompt="p", model="sonnet", specialty="code")],
        )
        dispatcher = Dispatcher(max_parallel=1)
        await dispatcher.execute_plan(plan)

    await asyncio.wait_for(captured_done.wait(), timeout=3.0)
    consumer.cancel()
    try:
        await consumer
    except asyncio.CancelledError:
        pass
    bus.detach(queue)

    failed = [e for e in captured if e.type == "task_failed"]
    assert len(failed) == 1
    assert failed[0].payload.get("index") == 0
