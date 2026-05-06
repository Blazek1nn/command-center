from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from command_center.db import session as session_module
from command_center.db.models import Project, ProjectStatus, Task, TaskStatus
from command_center.main import app


@pytest.mark.asyncio
async def test_create_task_without_project() -> None:
    client = TestClient(app)
    res = client.post(
        "/api/tasks",
        json={"title": "test task", "prompt": "do nothing", "model": "sonnet"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["title"] == "test task"
    assert data["status"] == "pending"
    assert data["model"] == "sonnet"


@pytest.mark.asyncio
async def test_create_task_with_invalid_project_id() -> None:
    client = TestClient(app)
    res = client.post(
        "/api/tasks",
        json={"title": "x", "prompt": "x", "project_id": 99999},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_create_task_validates_input() -> None:
    client = TestClient(app)
    res = client.post("/api/tasks", json={"title": "", "prompt": "x"})
    assert res.status_code == 422
    res = client.post("/api/tasks", json={"title": "x", "prompt": ""})
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_retry_task_creates_copy() -> None:
    async with session_module.AsyncSessionLocal() as sess:
        original = Task(
            title="original",
            prompt="do X",
            model="opus",
            status=TaskStatus.FAILED,
        )
        sess.add(original)
        await sess.commit()
        await sess.refresh(original)
        original_id = original.id

    client = TestClient(app)
    res = client.post(f"/api/tasks/{original_id}/retry")
    assert res.status_code == 201
    data = res.json()
    assert data["title"] == "original (retry)"
    assert data["status"] == "pending"
    assert data["model"] == "opus"
    assert data["parent_task_id"] == original_id


@pytest.mark.asyncio
async def test_retry_nonexistent_task_404() -> None:
    client = TestClient(app)
    res = client.post("/api/tasks/99999/retry")
    assert res.status_code == 404
