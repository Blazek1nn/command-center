from __future__ import annotations

import pytest
from sqlalchemy import event

from command_center.db import session as session_module
from command_center.db.models import Task, TaskStatus
from command_center.orchestrator.queue import queue


@pytest.mark.asyncio
async def test_count_by_status_returns_correct_counts() -> None:
    """Popula o DB com tasks de diferentes statuses e verifica contagens."""
    async with session_module.AsyncSessionLocal() as sess:
        sess.add_all([
            Task(title="t1", prompt="p", status=TaskStatus.PENDING),
            Task(title="t2", prompt="p", status=TaskStatus.PENDING),
            Task(title="t3", prompt="p", status=TaskStatus.RUNNING),
            Task(title="t4", prompt="p", status=TaskStatus.DONE),
            Task(title="t5", prompt="p", status=TaskStatus.DONE),
            Task(title="t6", prompt="p", status=TaskStatus.DONE),
            Task(title="t7", prompt="p", status=TaskStatus.FAILED),
        ])
        await sess.commit()

    counts = await queue.count_by_status()

    assert counts.get("pending") == 2
    assert counts.get("running") == 1
    assert counts.get("done") == 3
    assert counts.get("failed") == 1
    assert counts.get("cancelled") == 0
    for s in TaskStatus:
        assert s.value in counts


@pytest.mark.asyncio
async def test_count_by_status_executes_single_query() -> None:
    """count_by_status() deve fazer apenas 1 SELECT."""
    async with session_module.AsyncSessionLocal() as sess:
        sess.add(Task(title="t1", prompt="p", status=TaskStatus.PENDING))
        await sess.commit()

    select_count = 0
    sync_engine = session_module.engine.sync_engine

    def _on_execute(conn, cursor, statement, parameters, context, executemany):
        nonlocal select_count
        if statement.lstrip().upper().startswith("SELECT"):
            select_count += 1

    event.listen(sync_engine, "before_cursor_execute", _on_execute)
    try:
        await queue.count_by_status()
    finally:
        event.remove(sync_engine, "before_cursor_execute", _on_execute)

    assert select_count == 1, (
        f"Esperado 1 SELECT (GROUP BY agregado), foi: {select_count}"
    )
