from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from command_center.db import session as session_module
from command_center.db.models import Task, TaskStatus
from command_center.main import app


@pytest.mark.asyncio
async def test_metrics_session_returns_aggregated_costs() -> None:
    """Popula tasks completed hoje com custos diferentes; verifica agregação."""
    async with session_module.AsyncSessionLocal() as sess:
        now = datetime.now(UTC)
        sess.add_all([
            Task(
                title="t1", prompt="p", model="opus",
                status=TaskStatus.DONE, cost_estimate=0.50,
                completed_at=now,
            ),
            Task(
                title="t2", prompt="p", model="opus",
                status=TaskStatus.DONE, cost_estimate=0.30,
                completed_at=now,
            ),
            Task(
                title="t3", prompt="p", model="sonnet",
                status=TaskStatus.DONE, cost_estimate=0.10,
                completed_at=now,
            ),
        ])
        await sess.commit()

    client = TestClient(app)
    response = client.get("/api/metrics/session")
    assert response.status_code == 200

    data = response.json()
    assert data["task_count"] == 3
    assert data["total_cost_usd"] == pytest.approx(0.90, abs=0.01)
    assert "opus" in data["by_model"]
    assert data["by_model"]["opus"]["count"] == 2
    assert data["by_model"]["opus"]["cost_usd"] == pytest.approx(0.80, abs=0.01)
    assert data["by_model"]["sonnet"]["count"] == 1
