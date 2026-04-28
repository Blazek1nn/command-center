from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from command_center.db.models import Employee
from command_center.db.session import session_dependency


router = APIRouter(prefix="/api/employees", tags=["employees"])


class EmployeeOut(BaseModel):
    id: int
    name: str
    model: str
    specialty: str
    status: str
    current_task_id: int | None


@router.get("", response_model=list[EmployeeOut])
async def list_employees(
    sess: AsyncSession = Depends(session_dependency),
) -> list[EmployeeOut]:
    rows = (await sess.execute(select(Employee).order_by(Employee.name))).scalars().all()
    return [
        EmployeeOut(
            id=r.id,
            name=r.name,
            model=r.model,
            specialty=r.specialty,
            status=r.status.value if hasattr(r.status, "value") else str(r.status),
            current_task_id=r.current_task_id,
        )
        for r in rows
    ]
