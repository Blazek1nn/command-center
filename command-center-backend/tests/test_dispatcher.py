from __future__ import annotations

import asyncio
from unittest.mock import patch

import pytest

from command_center.agents.employee import EmployeeResult
from command_center.agents.manager import Plan, TaskSpec
from command_center.orchestrator.dispatcher import Dispatcher


@pytest.mark.asyncio
async def test_dispatcher_respects_max_parallel() -> None:
    in_flight = 0
    max_seen = 0
    lock = asyncio.Lock()

    async def _fake_execute(self, prompt, cwd=None):
        nonlocal in_flight, max_seen
        async with lock:
            in_flight += 1
            max_seen = max(max_seen, in_flight)
        await asyncio.sleep(0.05)
        async with lock:
            in_flight -= 1
        return EmployeeResult(output="ok", cost_usd=0.0, duration_ms=10)

    with patch(
        "command_center.agents.employee.Employee.execute_collected",
        _fake_execute,
    ):
        plan = Plan(
            understanding="x",
            execution_mode="parallel",
            tasks=[
                TaskSpec(
                    title=f"t{i}",
                    prompt="p",
                    model="sonnet",
                    specialty="code",
                )
                for i in range(6)
            ],
        )
        dispatcher = Dispatcher(max_parallel=2)
        result = await dispatcher.execute_plan(plan)

    assert max_seen <= 2, f"Esperava ≤2 em flight, vi {max_seen}"
    assert len(result.outcomes) == 6
    assert all(o.status == "done" for o in result.outcomes)


@pytest.mark.asyncio
async def test_dispatcher_handles_dependencies() -> None:
    order: list[int] = []
    lock = asyncio.Lock()

    async def _fake_execute(self, prompt, cwd=None):
        idx = int(prompt.split("#")[1])
        await asyncio.sleep(0.01 * (3 - idx))  # invertido pra garantir que ordem vem da dep
        async with lock:
            order.append(idx)
        return EmployeeResult(output=f"done {idx}", cost_usd=None, duration_ms=None)

    with patch(
        "command_center.agents.employee.Employee.execute_collected",
        _fake_execute,
    ):
        plan = Plan(
            understanding="x",
            execution_mode="sequential",
            tasks=[
                TaskSpec(title="A", prompt="run #0", model="sonnet", specialty="code"),
                TaskSpec(title="B", prompt="run #1", model="sonnet", specialty="code", depends_on=[0]),
                TaskSpec(title="C", prompt="run #2", model="sonnet", specialty="code", depends_on=[1]),
            ],
        )
        dispatcher = Dispatcher(max_parallel=3)
        result = await dispatcher.execute_plan(plan)

    assert order == [0, 1, 2]
    assert all(o.status == "done" for o in result.outcomes)


@pytest.mark.asyncio
async def test_dispatcher_cancels_dependents_on_failure() -> None:
    async def _fake_execute(self, prompt, cwd=None):
        if "#0" in prompt:
            return EmployeeResult(output="", error="boom", cost_usd=None, duration_ms=None)
        return EmployeeResult(output="ok", cost_usd=None, duration_ms=None)

    with patch(
        "command_center.agents.employee.Employee.execute_collected",
        _fake_execute,
    ):
        plan = Plan(
            understanding="x",
            execution_mode="sequential",
            tasks=[
                TaskSpec(title="A", prompt="run #0", model="sonnet", specialty="code"),
                TaskSpec(
                    title="B",
                    prompt="run #1",
                    model="sonnet",
                    specialty="code",
                    depends_on=[0],
                ),
            ],
        )
        dispatcher = Dispatcher(max_parallel=2)
        result = await dispatcher.execute_plan(plan)

    assert result.outcomes[0].status == "failed"
    assert result.outcomes[1].status == "cancelled"
