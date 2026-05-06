"""Skills e MCPs por projeto.

GET  /api/projects/{id}/skills            — lista skills (projeto + globais)
GET  /api/projects/{id}/skills/{name}     — conteúdo completo de uma skill
POST /api/projects/{id}/skills            — cria/atualiza skill no projeto
DELETE /api/projects/{id}/skills/{name}   — remove skill do projeto

GET /api/projects/{id}/mcps               — lê mcp.json
PUT /api/projects/{id}/mcps               — salva mcp.json

GET /api/skills/global                    — lista skills globais (~/.command-center/skills/)
POST /api/skills/global                   — cria/atualiza skill global
DELETE /api/skills/global/{name}          — remove skill global
"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from command_center.db import session as session_module
from command_center.db.models import Project
from command_center.skills.loader import (
    _GLOBAL_SKILLS_DIR,
    delete_skill,
    get_mcp_config,
    get_skill_content,
    list_skills,
    save_mcp_config,
    save_skill,
)

router = APIRouter(tags=["skills"])


# ---------- Helpers ----------

async def _get_project_path(project_id: int) -> Path:
    async with session_module.AsyncSessionLocal() as sess:
        proj = await sess.get(Project, project_id)
        if proj is None:
            raise HTTPException(status_code=404, detail="Projeto não encontrado")
        return Path(proj.path).expanduser()


# ---------- Models ----------

class SkillIn(BaseModel):
    name: str
    content: str


class McpConfigIn(BaseModel):
    config: dict


# ---------- Skills por projeto ----------

@router.get("/api/projects/{project_id}/skills")
async def list_project_skills(project_id: int) -> dict:
    project_dir = await _get_project_path(project_id)
    return {"skills": list_skills(project_dir)}


@router.get("/api/projects/{project_id}/skills/{name}")
async def get_project_skill(project_id: int, name: str) -> dict:
    project_dir = await _get_project_path(project_id)
    content = get_skill_content(project_dir, name)
    if content is None:
        raise HTTPException(status_code=404, detail="Skill não encontrada")
    return {"name": name, "content": content}


@router.post("/api/projects/{project_id}/skills")
async def create_project_skill(project_id: int, body: SkillIn) -> dict:
    project_dir = await _get_project_path(project_id)
    path = save_skill(project_dir, body.name, body.content)
    return {"name": body.name, "path": str(path), "chars": len(body.content)}


@router.delete("/api/projects/{project_id}/skills/{name}")
async def delete_project_skill(project_id: int, name: str) -> dict:
    project_dir = await _get_project_path(project_id)
    ok = delete_skill(project_dir, name)
    if not ok:
        raise HTTPException(status_code=404, detail="Skill não encontrada no projeto")
    return {"deleted": True}


# ---------- MCPs por projeto ----------

@router.get("/api/projects/{project_id}/mcps")
async def get_project_mcps(project_id: int) -> dict:
    project_dir = await _get_project_path(project_id)
    config = get_mcp_config(project_dir)
    return {"config": config or {}}


@router.put("/api/projects/{project_id}/mcps")
async def update_project_mcps(project_id: int, body: McpConfigIn) -> dict:
    project_dir = await _get_project_path(project_id)
    path = save_mcp_config(project_dir, body.config)
    return {"saved": True, "path": str(path)}


# ---------- Skills globais ----------

@router.get("/api/skills/global")
async def list_global_skills() -> dict:
    if not _GLOBAL_SKILLS_DIR.exists():
        return {"skills": []}
    skills = []
    for md_file in sorted(_GLOBAL_SKILLS_DIR.glob("*.md")):
        try:
            content = md_file.read_text(encoding="utf-8")
            skills.append({
                "name": md_file.stem,
                "scope": "global",
                "chars": len(content),
                "preview": content[:200],
            })
        except OSError:
            pass
    return {"skills": skills}


@router.post("/api/skills/global")
async def create_global_skill(body: SkillIn) -> dict:
    _GLOBAL_SKILLS_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in body.name)
    path = _GLOBAL_SKILLS_DIR / f"{safe_name}.md"
    path.write_text(body.content, encoding="utf-8")
    return {"name": safe_name, "path": str(path), "chars": len(body.content)}


@router.delete("/api/skills/global/{name}")
async def delete_global_skill(name: str) -> dict:
    path = _GLOBAL_SKILLS_DIR / f"{name}.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Skill global não encontrada")
    path.unlink()
    return {"deleted": True}
