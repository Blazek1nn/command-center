"""GET /api/metrics/session — agregado de custo do dia atual."""
from __future__ import annotations

from datetime import UTC, date, datetime, time
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from command_center.db.models import Task, TaskStatus
from command_center.db.session import session_dependency


router = APIRouter(prefix="/api/metrics", tags=["metrics"])


class ModelBreakdown(BaseModel):
    cost_usd: float
    count: int


class SessionMetrics(BaseModel):
    date: str
    total_cost_usd: float
    total_input_tokens: int
    total_output_tokens: int
    by_model: dict[str, ModelBreakdown]
    task_count: int


@router.get("/session", response_model=SessionMetrics)
async def session_metrics(
    sess: AsyncSession = Depends(session_dependency),
) -> SessionMetrics:
    """Agregado de custos das tasks finalizadas no dia atual (UTC)."""
    today = date.today()
    start = datetime.combine(today, time.min, tzinfo=UTC)
    end = datetime.combine(today, time.max, tzinfo=UTC)

    stmt = select(
        Task.model,
        func.coalesce(func.sum(Task.cost_estimate), 0.0).label("cost"),
        func.count(Task.id).label("count"),
    ).where(
        Task.completed_at.is_not(None),
        Task.completed_at >= start,
        Task.completed_at <= end,
    ).group_by(Task.model)

    rows = (await sess.execute(stmt)).all()

    by_model: dict[str, ModelBreakdown] = {}
    total_cost = 0.0
    total_count = 0
    for model, cost, count in rows:
        key = model or "unknown"
        by_model[key] = ModelBreakdown(cost_usd=float(cost), count=int(count))
        total_cost += float(cost)
        total_count += int(count)

    # Tokens não estão na tabela Task atualmente — retornamos 0 por enquanto
    return SessionMetrics(
        date=today.isoformat(),
        total_cost_usd=total_cost,
        total_input_tokens=0,
        total_output_tokens=0,
        by_model=by_model,
        task_count=total_count,
    )
