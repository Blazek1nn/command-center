"""GET/POST /api/conversations — histórico de conversas do CEO."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from command_center.db.models import Conversation, ConversationStatus, Message
from command_center.db.session import session_dependency


router = APIRouter(prefix="/api/conversations", tags=["conversations"])


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime


class ConversationSummary(BaseModel):
    id: int
    title: str
    project_id: int | None
    total_cost_usd: float
    started_at: datetime
    updated_at: datetime
    status: str
    message_count: int = 0


class ConversationDetail(ConversationSummary):
    messages: list[MessageOut]


class ConversationCreate(BaseModel):
    title: str = Field(default="Nova conversa", min_length=1, max_length=200)
    project_id: int | None = None


def _summary_from_row(row: Conversation, message_count: int = 0) -> ConversationSummary:
    return ConversationSummary(
        id=row.id,
        title=row.title,
        project_id=row.project_id,
        total_cost_usd=row.total_cost_usd,
        started_at=row.started_at,
        updated_at=row.updated_at,
        status=row.status.value if hasattr(row.status, "value") else str(row.status),
        message_count=message_count,
    )


@router.get("", response_model=list[ConversationSummary])
async def list_conversations(
    limit: int = Query(default=50, le=200),
    sess: AsyncSession = Depends(session_dependency),
) -> list[ConversationSummary]:
    """Lista conversas ordenadas por updated_at desc."""
    stmt = (
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .order_by(desc(Conversation.updated_at))
        .limit(limit)
    )
    rows = (await sess.execute(stmt)).scalars().all()
    return [_summary_from_row(r, len(r.messages)) for r in rows]


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: int,
    sess: AsyncSession = Depends(session_dependency),
) -> ConversationDetail:
    """Retorna conversa com lista de messages ordenadas."""
    stmt = (
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id)
    )
    row = (await sess.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    sorted_msgs = sorted(row.messages, key=lambda m: m.created_at)
    return ConversationDetail(
        id=row.id,
        title=row.title,
        project_id=row.project_id,
        total_cost_usd=row.total_cost_usd,
        started_at=row.started_at,
        updated_at=row.updated_at,
        status=row.status.value if hasattr(row.status, "value") else str(row.status),
        message_count=len(sorted_msgs),
        messages=[
            MessageOut(
                id=m.id,
                role=m.role,
                content=m.content,
                created_at=m.created_at,
            )
            for m in sorted_msgs
        ],
    )


@router.post("", response_model=ConversationSummary, status_code=201)
async def create_conversation(
    req: ConversationCreate,
    sess: AsyncSession = Depends(session_dependency),
) -> ConversationSummary:
    """Cria nova conversa vazia."""
    row = Conversation(
        title=req.title,
        project_id=req.project_id,
        status=ConversationStatus.ACTIVE,
    )
    sess.add(row)
    await sess.commit()
    await sess.refresh(row)
    return _summary_from_row(row, 0)


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: int,
    sess: AsyncSession = Depends(session_dependency),
) -> None:
    row = await sess.get(Conversation, conversation_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    await sess.delete(row)
    await sess.commit()
