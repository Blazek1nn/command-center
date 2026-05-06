from __future__ import annotations

import pytest
from sqlalchemy import select

from command_center.db.models import (
    Conversation,
    ConversationStatus,
    Employee,
    EmployeeStatus,
    Message,
    Project,
    ProjectStatus,
    Task,
    TaskStatus,
)
from command_center.db.session import get_session


@pytest.mark.asyncio
async def test_db_models_relationships() -> None:
    async with get_session() as sess:
        proj = Project(
            name="multi-agent-core",
            path="/tmp/multi-agent-core",
            status=ProjectStatus.ACTIVE,
        )
        emp = Employee(
            name="dev-senior",
            model="sonnet",
            specialty="code",
            status=EmployeeStatus.IDLE,
        )
        sess.add_all([proj, emp])
        await sess.flush()

        task = Task(
            project_id=proj.id,
            title="implementar X",
            prompt="faça X em foo.py",
            assigned_to=emp.id,
            status=TaskStatus.PENDING,
            model="sonnet",
        )
        sess.add(task)
        await sess.flush()

        conv = Conversation(status=ConversationStatus.ACTIVE)
        sess.add(conv)
        await sess.flush()
        sess.add(Message(conversation_id=conv.id, role="ceo", content="oi"))

    async with get_session() as sess:
        loaded = (
            await sess.execute(select(Task).where(Task.title == "implementar X"))
        ).scalar_one()
        assert loaded.project_id is not None
        assert loaded.assigned_to is not None
        assert loaded.status == TaskStatus.PENDING

        proj_loaded = (
            await sess.execute(select(Project).where(Project.name == "multi-agent-core"))
        ).scalar_one()
        assert proj_loaded.path == "/tmp/multi-agent-core"

        msgs = (await sess.execute(select(Message))).scalars().all()
        assert len(msgs) == 1
        assert msgs[0].role == "ceo"


@pytest.mark.asyncio
async def test_task_parent_child_relationship() -> None:
    async with get_session() as sess:
        parent = Task(title="épico", prompt="quebrar em subtarefas", status=TaskStatus.PENDING)
        sess.add(parent)
        await sess.flush()

        child = Task(
            title="sub 1",
            prompt="parte 1",
            parent_task_id=parent.id,
            status=TaskStatus.PENDING,
        )
        sess.add(child)

    async with get_session() as sess:
        children = (
            await sess.execute(select(Task).where(Task.parent_task_id.is_not(None)))
        ).scalars().all()
        assert len(children) == 1
        assert children[0].title == "sub 1"
