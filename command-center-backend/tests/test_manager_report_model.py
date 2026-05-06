from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from command_center.agents.claude_runner import Done, TextDelta, TokenUsage
from command_center.agents.manager import Manager, Plan


def _fake_runner_factory(captured: dict[str, object]):
    """Cria um runner falso que captura os args e emite TextDelta + Done."""

    async def fake_run(prompt: str, model: str, system_prompt: str | None = None):
        captured["model"] = model
        captured["prompt"] = prompt
        captured["system_prompt"] = system_prompt
        yield TextDelta(text="ok")
        yield Done(final_text="ok", cost_usd=0.0, usage=TokenUsage())

    runner = MagicMock()
    runner.run = fake_run
    return runner


@pytest.mark.asyncio
async def test_report_uses_sonnet_by_default() -> None:
    captured: dict[str, object] = {}
    runner = _fake_runner_factory(captured)
    mgr = Manager(model="opus", runner=runner)

    plan = Plan(understanding="x", execution_mode="parallel", tasks=[], estimated_minutes=0)
    result = await mgr.report(plan, [])

    assert captured["model"] == "sonnet", (
        f"report() deve usar sonnet por default, usou: {captured['model']}"
    )
    assert result == "ok"


@pytest.mark.asyncio
async def test_report_accepts_explicit_model() -> None:
    captured: dict[str, object] = {}
    runner = _fake_runner_factory(captured)
    mgr = Manager(model="opus", runner=runner)

    plan = Plan(understanding="x", execution_mode="parallel", tasks=[], estimated_minutes=0)
    await mgr.report(plan, [], model="haiku")

    assert captured["model"] == "haiku"


@pytest.mark.asyncio
async def test_plan_still_uses_manager_model() -> None:
    """plan() não deve ser afetado pela mudança em report() — continua usando self.model."""
    captured: dict[str, object] = {}
    runner = _fake_runner_factory(captured)
    mgr = Manager(model="opus", runner=runner)

    async def plan_run(prompt: str, model: str, system_prompt: str | None = None):
        captured["model"] = model
        yield TextDelta(text='```json\n{"understanding":"x","execution_mode":"parallel","tasks":[],"estimated_minutes":0}\n```')
        yield Done(final_text="", cost_usd=0.0, usage=TokenUsage())

    runner.run = plan_run
    await mgr.plan("test")

    assert captured["model"] == "opus", "plan() deve continuar usando opus (self.model)"
