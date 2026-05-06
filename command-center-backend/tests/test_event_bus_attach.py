from __future__ import annotations

import asyncio

import pytest

from command_center.events import Event, EventBus


@pytest.mark.asyncio
async def test_attach_registers_subscriber_synchronously() -> None:
    """attach() deve adicionar o subscriber ANTES de qualquer await,
    evitando race entre publish() e subscribe()."""
    test_bus = EventBus()
    queue = test_bus.attach()

    # Publica imediatamente, sem yield ao loop
    await test_bus.publish(Event(type="task_started", payload={"task_id": 1}))

    evt = await asyncio.wait_for(queue.get(), timeout=0.5)
    assert evt.type == "task_started"
    assert evt.payload == {"task_id": 1}

    test_bus.detach(queue)


@pytest.mark.asyncio
async def test_detach_removes_subscriber() -> None:
    test_bus = EventBus()
    queue = test_bus.attach()
    test_bus.detach(queue)

    # Publish após detach NÃO deve enfileirar
    await test_bus.publish(Event(type="task_started", payload={"task_id": 99}))

    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(queue.get(), timeout=0.2)


@pytest.mark.asyncio
async def test_detach_idempotent() -> None:
    """detach() de uma queue já removida não deve raise."""
    test_bus = EventBus()
    queue = test_bus.attach()
    test_bus.detach(queue)
    test_bus.detach(queue)  # idempotente


@pytest.mark.asyncio
async def test_no_event_lost_with_concurrent_publisher() -> None:
    """attach() seguido de publish em paralelo: nenhum evento perdido."""
    test_bus = EventBus()
    queue = test_bus.attach()

    async def publisher() -> None:
        for i in range(10):
            await test_bus.publish(Event(type="task_progress", payload={"i": i}))

    pub_task = asyncio.create_task(publisher())
    received: list[int] = []
    while len(received) < 10:
        evt = await asyncio.wait_for(queue.get(), timeout=1.0)
        received.append(evt.payload["i"])
    await pub_task

    assert received == list(range(10))
    test_bus.detach(queue)
