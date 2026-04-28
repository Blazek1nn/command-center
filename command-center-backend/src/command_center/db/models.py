from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
    CANCELLED = "cancelled"


class EmployeeStatus(str, Enum):
    IDLE = "idle"
    BUSY = "busy"
    OFFLINE = "offline"


class ConversationStatus(str, Enum):
    ACTIVE = "active"
    CLOSED = "closed"


class ProjectStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    path: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ProjectStatus] = mapped_column(default=ProjectStatus.ACTIVE)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    tasks: Mapped[list[Task]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    model: Mapped[str] = mapped_column(String(50))
    specialty: Mapped[str] = mapped_column(String(100))
    status: Mapped[EmployeeStatus] = mapped_column(default=EmployeeStatus.IDLE)
    current_task_id: Mapped[int | None] = mapped_column(nullable=True)

    tasks: Mapped[list[Task]] = relationship(
        back_populates="employee",
        primaryjoin="Employee.id == foreign(Task.assigned_to)",
    )


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    parent_task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(300))
    prompt: Mapped[str] = mapped_column(Text)
    status: Mapped[TaskStatus] = mapped_column(default=TaskStatus.PENDING)
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    output: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    cost_estimate: Mapped[float | None] = mapped_column(Float, nullable=True)
    model: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    project: Mapped[Project | None] = relationship(back_populates="tasks")
    employee: Mapped[Employee | None] = relationship(
        back_populates="tasks",
        primaryjoin="foreign(Task.assigned_to) == Employee.id",
    )
    parent: Mapped[Task | None] = relationship(
        remote_side="Task.id", back_populates="children"
    )
    children: Mapped[list[Task]] = relationship(back_populates="parent")


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    status: Mapped[ConversationStatus] = mapped_column(default=ConversationStatus.ACTIVE)

    messages: Mapped[list[Message]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id"))
    role: Mapped[str] = mapped_column(String(20))  # ceo / manager / system / employee
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")
