from __future__ import annotations

import asyncio
from unittest.mock import patch

import pytest

from command_center.agents.employee import EmployeeResult
from command_center.agents.manager import Plan, TaskSpec
from command_center.events import Event, EventBus, bus
from command_center.orchestrator.dispatcher import Dispatcher


@pytest.mark.asyncio
async def test_eventbus_fanout() -> None:
    test_bus = EventBus()
    received: list[Event] = []

    async def consumer() -> None:
        async for evt in test_bus.subscribe():
            received.append(evt)
            if len(received) >= 3:
                return

    task = asyncio.create_task(consumer())
    await asyncio.sleep(0.01)

    await test_bus.publish(Event(type="task_started", payload={"task_id": 1}))
    await test_bus.publish(Event(type="task_progress", payload={"task_id": 1, "chunk": "x"}))
    await test_bus.publish(Event(type="task_completed", payload={"task_id": 1}))

    await asyncio.wait_for(task, timeout=1.0)

    assert [e.type for e in received] == [
        "task_started",
        "task_progress",
        "task_completed",
    ]


@pytest.mark.asyncio
async def test_sse_events_published_on_task_lifecycle() -> None:
    """Despachar uma task simples deve publicar task_started + task_completed no bus global."""
    captured: list[Event] = []
    captured_done = asyncio.Event()

    async def _consume() -> None:
        async for evt in bus.subscribe():
            captured.append(evt)
            if any(e.type == "task_completed" for e in captured):
                captured_done.set()
                return

    consumer_task = asyncio.create_task(_consume())
    await asyncio.sleep(0.01)

    async def _fake_execute(self, prompt, cwd=None):
        return EmployeeResult(output="feito", cost_usd=0.0, duration_ms=5)

    with patch(
        "command_center.agents.employee.Employee.execute_collected",
        _fake_execute,
    ):
        plan = Plan(
            understanding="x",
            execution_mode="parallel",
            tasks=[
                TaskSpec(
                    title="t0",
                    prompt="faça nada",
                    model="sonnet",
                    specialty="code",
                )
            ],
        )
        dispatcher = Dispatcher(max_parallel=1)
        await dispatcher.execute_plan(plan)

    await asyncio.wait_for(captured_done.wait(), timeout=2.0)
    consumer_task.cancel()
    try:
        await consumer_task
    except asyncio.CancelledError:
        pass

    types = [e.type for e in captured]
    assert "task_started" in types
    assert "task_completed" in types
