from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from command_center.db import session as session_module
from command_center.db.models import Conversation, Message
from command_center.main import app


@pytest.mark.asyncio
async def test_create_and_get_conversation() -> None:
    client = TestClient(app)
    res = client.post("/api/conversations", json={"title": "Smoke test"})
    assert res.status_code == 201
    data = res.json()
    assert data["title"] == "Smoke test"
    assert data["message_count"] == 0
    cid = data["id"]

    # Adiciona messages diretamente via DB
    async with session_module.AsyncSessionLocal() as sess:
        sess.add(Message(conversation_id=cid, role="ceo", content="oi"))
        sess.add(Message(conversation_id=cid, role="manager", content="ok"))
        await sess.commit()

    res = client.get(f"/api/conversations/{cid}")
    assert res.status_code == 200
    data = res.json()
    assert data["message_count"] == 2
    roles = [m["role"] for m in data["messages"]]
    assert roles == ["ceo", "manager"]


@pytest.mark.asyncio
async def test_list_conversations_orders_by_updated_at() -> None:
    client = TestClient(app)
    r1 = client.post("/api/conversations", json={"title": "Older"}).json()
    r2 = client.post("/api/conversations", json={"title": "Newer"}).json()

    res = client.get("/api/conversations")
    assert res.status_code == 200
    items = res.json()
    # Newer one should be first
    assert items[0]["id"] == r2["id"]
    assert items[1]["id"] == r1["id"]


@pytest.mark.asyncio
async def test_delete_conversation_cascades_messages() -> None:
    client = TestClient(app)
    r = client.post("/api/conversations", json={"title": "To delete"}).json()
    cid = r["id"]

    async with session_module.AsyncSessionLocal() as sess:
        sess.add(Message(conversation_id=cid, role="ceo", content="bye"))
        await sess.commit()

    res = client.delete(f"/api/conversations/{cid}")
    assert res.status_code == 204

    res = client.get(f"/api/conversations/{cid}")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_get_unknown_conversation_404() -> None:
    client = TestClient(app)
    res = client.get("/api/conversations/99999")
    assert res.status_code == 404
