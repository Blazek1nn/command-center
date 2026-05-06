"""GET /api/suggestions — sugestões contextuais de prompts pro CEO.

Substitui o array hardcoded do empty state. Lê:
  - Projetos cadastrados (com seus stacks detectados)
  - Últimas N tasks (status, idade)
  - Projetos sem atividade recente

E gera 4 sugestões via Haiku (~$0.001/req). Cache em memória 1h, invalida
quando uma task completa.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from command_center.agents.claude_runner import ClaudeRunner, Done, RunnerError, TextDelta
from command_center.db.models import Project, ProjectStatus, Task, TaskStatus
from command_center.db.session import session_dependency
from command_center.project_inspect import detect_stack

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/api", tags=["suggestions"])

# ---------- Cache em memória ----------
_CACHE_TTL_SECONDS = 3600  # 1h
_cache: dict[str, tuple[float, list[str]]] = {}
_cache_lock = asyncio.Lock()


class SuggestionsResponse(BaseModel):
    suggestions: list[str]
    source: str  # "llm" | "rules" | "cache"
    generated_at: datetime


def invalidate_cache() -> None:
    """Chamado pelo dispatcher após task_completed pra forçar refresh."""
    _cache.clear()


# ---------- Snapshot do estado ----------

async def _gather_state(sess: AsyncSession) -> dict[str, Any]:
    """Snapshot leve: projetos + últimas 20 tasks."""
    projects = list(
        (await sess.execute(
            select(Project).where(Project.status == ProjectStatus.ACTIVE)
        )).scalars().all()
    )
    tasks = list(
        (await sess.execute(
            select(Task).order_by(desc(Task.created_at)).limit(20)
        )).scalars().all()
    )

    cutoff = datetime.now(UTC) - timedelta(days=3)
    project_summaries = []
    for p in projects:
        last_task = next(
            (t for t in tasks if t.project_id == p.id), None
        )
        last_activity_iso = (
            last_task.created_at.isoformat() if last_task else None
        )

        # SQLite stores naive datetimes — manually attach UTC if needed
        last_dt = last_task.created_at if last_task else None
        if last_dt is not None and last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=UTC)
        is_stale = last_dt is None or last_dt < cutoff

        project_summaries.append({
            "name": p.name,
            "description": p.description or "",
            "stack": detect_stack(p.path),
            "last_activity": last_activity_iso,
            "stale": is_stale,
        })

    task_summaries = [
        {
            "title": t.title[:120],
            "status": t.status.value if hasattr(t.status, "value") else str(t.status),
            "age_hours": int(
                (
                    datetime.now(UTC)
                    - (t.created_at.replace(tzinfo=UTC) if t.created_at.tzinfo is None else t.created_at)
                ).total_seconds()
                / 3600
            ),
        }
        for t in tasks[:10]
    ]

    return {
        "projects": project_summaries,
        "recent_tasks": task_summaries,
        "now": datetime.now(UTC).isoformat(),
    }


# ---------- LLM ----------

_PROMPT_TEMPLATE = """Você é um CTO experiente sugerindo próximos passos pro CEO.

Estado atual do portfólio:
```json
{state}
```

Gere EXATAMENTE 4 sugestões de prompts curtos (1 frase, máx 90 chars cada) que o CEO
poderia mandar pro gerente AGORA. As sugestões devem ser:
- Concretas (mencionar projeto pelo nome)
- Acionáveis (verbo de ação no início)
- Variadas (não 4 sugestões do mesmo projeto)
- Priorizar projetos sem atividade recente (stale=true) ou com tasks failed

Responda APENAS com array JSON, sem texto adicional, no formato:
```json
["sugestão 1", "sugestão 2", "sugestão 3", "sugestão 4"]
```"""


async def _generate_via_llm(state: dict[str, Any]) -> list[str] | None:
    """Chama Haiku pra gerar sugestões. Retorna None se falhar."""
    runner = ClaudeRunner()
    state_json = json.dumps(state, indent=2, ensure_ascii=False, default=str)
    prompt = _PROMPT_TEMPLATE.format(state=state_json)

    parts: list[str] = []
    try:
        async for event in runner.run(prompt=prompt, model="haiku"):
            if isinstance(event, TextDelta):
                parts.append(event.text)
            elif isinstance(event, Done):
                pass
            elif isinstance(event, RunnerError):
                log.warning("suggestions.llm_error", error=event.message)
                return None
    except Exception as exc:
        log.warning("suggestions.llm_exception", error=str(exc))
        return None

    full = "".join(parts)
    # Extrai array JSON
    match = re.search(r"\[\s*\".*?\"\s*(?:,\s*\".*?\"\s*)*\]", full, re.DOTALL)
    if not match:
        log.warning("suggestions.no_json_array", text=full[:300])
        return None
    try:
        arr = json.loads(match.group(0))
        if not isinstance(arr, list):
            return None
        return [str(x).strip() for x in arr if isinstance(x, str)][:4]
    except (json.JSONDecodeError, ValueError) as exc:
        log.warning("suggestions.json_decode", error=str(exc), text=match.group(0)[:300])
        return None


# ---------- Rule-based fallback ----------

def _rule_based(state: dict[str, Any]) -> list[str]:
    """Fallback determinístico — usa quando o LLM falha ou não há projetos."""
    projects = state.get("projects", [])
    if not projects:
        return [
            "Crie meu primeiro projeto com o comando /novo-projeto.",
            "Liste os 4 modelos disponíveis e quando usar cada um.",
            "Mostre como funciona o orquestrador multi-agente.",
            "Sugira boas práticas pra começar um projeto novo.",
        ]

    stale = [p for p in projects if p.get("stale")]
    active = [p for p in projects if not p.get("stale")]
    suggestions: list[str] = []

    for p in stale[:2]:
        suggestions.append(f"Faça uma auditoria rápida do {p['name']} e me diga o que está pendente.")

    for p in active[:2]:
        stack_str = ", ".join(p.get("stack", []) or [])
        if "Python" in p.get("stack", []):
            suggestions.append(f"Adicione testes unitários ao {p['name']}.")
        elif any(s in p.get("stack", []) for s in ("Next.js", "Vite", "Node.js")):
            suggestions.append(f"Revise a UI do {p['name']} buscando inconsistências.")
        else:
            suggestions.append(f"Crie um README para o {p['name']}{' (' + stack_str + ')' if stack_str else ''}.")

    while len(suggestions) < 4:
        suggestions.append("Liste meus projetos e me diga onde você focaria primeiro.")

    return suggestions[:4]


# ---------- Endpoint ----------

@router.get("/suggestions", response_model=SuggestionsResponse)
async def get_suggestions(
    sess: AsyncSession = Depends(session_dependency),
    refresh: bool = False,
) -> SuggestionsResponse:
    """Retorna 4 sugestões contextuais. Cache 1h ou até task completar.

    Query param `refresh=true` força regenerar.
    """
    cache_key = "global"

    async with _cache_lock:
        cached = _cache.get(cache_key)
        if cached and not refresh:
            ts, suggestions = cached
            if time.time() - ts < _CACHE_TTL_SECONDS:
                return SuggestionsResponse(
                    suggestions=suggestions,
                    source="cache",
                    generated_at=datetime.fromtimestamp(ts, UTC),
                )

    state = await _gather_state(sess)

    llm_result = await _generate_via_llm(state)
    if llm_result and len(llm_result) >= 1:
        # Garantir 4 (preencher com fallback se faltarem)
        if len(llm_result) < 4:
            fb = _rule_based(state)
            for s in fb:
                if s not in llm_result:
                    llm_result.append(s)
                if len(llm_result) >= 4:
                    break
        result = llm_result[:4]
        source = "llm"
    else:
        result = _rule_based(state)
        source = "rules"

    async with _cache_lock:
        _cache[cache_key] = (time.time(), result)

    return SuggestionsResponse(
        suggestions=result,
        source=source,
        generated_at=datetime.now(UTC),
    )
