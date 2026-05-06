from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from command_center.db import session as session_module
from command_center.db.models import Project, ProjectStatus
from command_center.main import app


@pytest.mark.asyncio
async def test_read_file_inside_project(tmp_path: Path) -> None:
    # Setup: cria diretório no tmp_path com um arquivo, registra Project
    proj_dir = tmp_path / "demo-proj"
    proj_dir.mkdir()
    (proj_dir / "hello.txt").write_text("Olá mundo!", encoding="utf-8")

    async with session_module.AsyncSessionLocal() as sess:
        sess.add(Project(name="demo-proj", path=str(proj_dir), status=ProjectStatus.ACTIVE))
        await sess.commit()

    client = TestClient(app)
    res = client.get("/api/files/read", params={"project": "demo-proj", "path": "hello.txt"})
    assert res.status_code == 200
    data = res.json()
    assert data["path"] == "hello.txt"
    assert data["content"] == "Olá mundo!"
    assert data["truncated"] is False


@pytest.mark.asyncio
async def test_read_file_blocks_path_traversal(tmp_path: Path) -> None:
    proj_dir = tmp_path / "guarded-proj"
    proj_dir.mkdir()
    (proj_dir / "ok.txt").write_text("ok", encoding="utf-8")
    # arquivo "secreto" FORA do projeto
    (tmp_path / "secret.txt").write_text("password=hunter2", encoding="utf-8")

    async with session_module.AsyncSessionLocal() as sess:
        sess.add(Project(name="guarded-proj", path=str(proj_dir), status=ProjectStatus.ACTIVE))
        await sess.commit()

    client = TestClient(app)
    res = client.get(
        "/api/files/read",
        params={"project": "guarded-proj", "path": "../secret.txt"},
    )
    assert res.status_code == 400
    assert "fora do projeto" in res.json()["detail"]


@pytest.mark.asyncio
async def test_read_file_rejects_absolute_path(tmp_path: Path) -> None:
    proj_dir = tmp_path / "abs-proj"
    proj_dir.mkdir()
    (proj_dir / "ok.txt").write_text("ok", encoding="utf-8")

    async with session_module.AsyncSessionLocal() as sess:
        sess.add(Project(name="abs-proj", path=str(proj_dir), status=ProjectStatus.ACTIVE))
        await sess.commit()

    client = TestClient(app)
    # Use absolute path obvious
    abs_path = "/etc/passwd"
    res = client.get(
        "/api/files/read",
        params={"project": "abs-proj", "path": abs_path},
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_read_file_404_unknown_project() -> None:
    client = TestClient(app)
    res = client.get(
        "/api/files/read",
        params={"project": "ghost-proj-xyz", "path": "x.txt"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_read_file_truncates_large_files(tmp_path: Path) -> None:
    proj_dir = tmp_path / "big-proj"
    proj_dir.mkdir()
    big_content = "x" * 200_000
    (proj_dir / "big.txt").write_text(big_content, encoding="utf-8")

    async with session_module.AsyncSessionLocal() as sess:
        sess.add(Project(name="big-proj", path=str(proj_dir), status=ProjectStatus.ACTIVE))
        await sess.commit()

    client = TestClient(app)
    res = client.get(
        "/api/files/read",
        params={"project": "big-proj", "path": "big.txt"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["truncated"] is True
    assert len(data["content"]) <= 100_000
    assert data["bytes"] == 200_000
