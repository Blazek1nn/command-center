from __future__ import annotations

from unittest.mock import patch

import pytest

from command_center.agents.claude_runner import Done, TextDelta
from command_center.agents.manager import Manager, Plan


@pytest.mark.asyncio
async def test_manager_returns_valid_plan() -> None:
    fake_response = """Aqui está o plano:
```json
{
  "understanding": "Adicionar testes ao multi-agent-core",
  "execution_mode": "parallel",
  "tasks": [
    {
      "title": "Escrever testes do dispatcher",
      "prompt": "Adicione test_dispatcher.py com casos de paralelismo e dependências.",
      "project": "multi-agent-core",
      "model": "sonnet",
      "specialty": "tests",
      "depends_on": []
    }
  ],
  "estimated_minutes": 10
}
```"""

    async def _fake_run(*args, **kwargs):
        yield TextDelta(text=fake_response)
        yield Done(final_text=fake_response, cost_usd=None, duration_ms=None)

    with patch(
        "command_center.agents.claude_runner.ClaudeRunner.run",
        side_effect=lambda *a, **k: _fake_run(),
    ):
        manager = Manager()
        plan = await manager.plan("preciso de testes para o dispatcher")

    assert isinstance(plan, Plan)
    assert plan.understanding.startswith("Adicionar")
    assert len(plan.tasks) == 1
    assert plan.tasks[0].project == "multi-agent-core"
    assert plan.tasks[0].model == "sonnet"
    assert plan.execution_mode == "parallel"
    assert plan.estimated_minutes == 10


@pytest.mark.asyncio
async def test_manager_raises_on_invalid_json() -> None:
    fake_response = "Não tenho ideia do que fazer, desculpe."

    async def _fake_run(*args, **kwargs):
        yield TextDelta(text=fake_response)
        yield Done(final_text=fake_response)

    with patch(
        "command_center.agents.claude_runner.ClaudeRunner.run",
        side_effect=lambda *a, **k: _fake_run(),
    ):
        manager = Manager()
        with pytest.raises(ValueError):
            await manager.plan("faça algo")
