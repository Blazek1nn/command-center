"""Memory store — busca e persistência de lembranças entre conversas.

Não usa embeddings (decisão deliberada: zero deps ML, deploy trivial). Usa
matching por palavra-chave + scoring TF-style:
  - Tokeniza query e content (lower, sem stopwords)
  - Score = sum(tf(token) * inverse-doc-freq-aprox) + recency boost
  - Retorna top K com >= MIN_SCORE

Suficiente pra portfolios de até alguns milhares de memórias. Acima disso,
upgrade pra sentence-transformers (Frente η.2 numa v3).
"""
from __future__ import annotations

import math
import re
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from command_center.db import session as session_module
from command_center.db.models import MemoryEntry

log = structlog.get_logger(__name__)

# Heurísticas de tokenização — alvo PT/EN sem dependências externas
_STOPWORDS = {
    # PT
    "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das",
    "em", "no", "na", "nos", "nas", "para", "pra", "com", "por", "que", "se", "e",
    "ou", "mas", "também", "tambem", "como", "quando", "onde", "qual", "quais",
    "ja", "já", "ai", "aí", "lá", "la", "ali", "aqui", "ele", "ela", "eles", "elas",
    "isso", "isto", "aquilo", "ser", "ter", "estar", "tem", "está", "esta", "ao",
    "os", "ao", "à", "às", "às", "depois", "antes", "muito", "muita",
    # EN
    "the", "a", "an", "of", "in", "to", "for", "on", "at", "by", "with", "and",
    "or", "but", "is", "was", "are", "were", "be", "been", "being", "have", "has",
    "had", "do", "does", "did", "this", "that", "these", "those", "it", "its",
}

_TOKEN_RE = re.compile(r"[a-záéíóúâêîôûãõàç]{3,}", re.IGNORECASE)


def _tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN_RE.findall(text.lower()) if t not in _STOPWORDS]


def _score_match(query_tokens: list[str], content: str, created_at: datetime | None) -> float:
    """Score de relevância — TF + recency. Não-negativo."""
    if not query_tokens:
        return 0.0
    content_tokens = _tokenize(content)
    if not content_tokens:
        return 0.0

    q_set = set(query_tokens)
    matches = sum(1 for t in content_tokens if t in q_set)
    if matches == 0:
        return 0.0

    # TF normalizado
    tf = matches / max(1, math.sqrt(len(content_tokens)))
    coverage = len(q_set & set(content_tokens)) / len(q_set)
    base_score = tf * coverage

    # Recency boost — entries mais novas valem mais
    if created_at is not None:
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)
        age = datetime.now(UTC) - created_at
        # Boost de até +0.3 nas últimas 24h, decay logarítmico depois
        days = age.total_seconds() / 86400
        recency_boost = max(0.0, 0.3 / (1 + days * 0.3))
        base_score += recency_boost

    return base_score


_MIN_SCORE = 0.15


# ---------- API pública ----------

async def add_memory(
    sess: AsyncSession,
    *,
    content: str,
    source_type: str,
    project_id: int | None = None,
    conversation_id: int | None = None,
    tags: list[str] | None = None,
) -> MemoryEntry:
    """Insere uma entry. NÃO commita — caller controla a transação."""
    row = MemoryEntry(
        project_id=project_id,
        conversation_id=conversation_id,
        source_type=source_type,
        content=content[:5000],  # cap pra não inflar DB
        tags=",".join(tags)[:500] if tags else None,
    )
    sess.add(row)
    await sess.flush()
    return row


async def search_memory(
    sess: AsyncSession,
    *,
    query: str,
    project_id: int | None = None,
    k: int = 5,
    cutoff_days: int = 60,
) -> list[tuple[MemoryEntry, float]]:
    """Busca top K entries relevantes. Retorna [(entry, score), ...] desc."""
    query_tokens = _tokenize(query)
    if not query_tokens:
        return []

    cutoff = datetime.now(UTC) - timedelta(days=cutoff_days)

    stmt = select(MemoryEntry).where(MemoryEntry.created_at >= cutoff)
    if project_id is not None:
        # Inclui entries do projeto + entries globais (project_id NULL)
        stmt = stmt.where(
            (MemoryEntry.project_id == project_id) | (MemoryEntry.project_id.is_(None))
        )
    # LIMIT 50: scoring é O(n) em Python. Pra >10k memórias migrar pra FTS5
    # (SQLite nativo). 50 candidates cobre 95% dos casos pra projeto típico.
    stmt = stmt.order_by(desc(MemoryEntry.created_at)).limit(50)

    rows = list((await sess.execute(stmt)).scalars().all())
    scored: list[tuple[MemoryEntry, float]] = []
    for row in rows:
        score = _score_match(query_tokens, row.content, row.created_at)
        if score >= _MIN_SCORE:
            scored.append((row, score))

    scored.sort(key=lambda x: -x[1])
    return scored[:k]


async def list_memory(
    sess: AsyncSession,
    *,
    project_id: int | None = None,
    limit: int = 20,
) -> list[MemoryEntry]:
    """Últimas N memories (sem busca). Pra painel 'memória recente' do sidebar."""
    stmt = select(MemoryEntry).order_by(desc(MemoryEntry.created_at)).limit(limit)
    if project_id is not None:
        stmt = stmt.where(MemoryEntry.project_id == project_id)
    return list((await sess.execute(stmt)).scalars().all())


async def delete_memory(sess: AsyncSession, memory_id: int) -> bool:
    row = await sess.get(MemoryEntry, memory_id)
    if row is None:
        return False
    await sess.delete(row)
    return True


def format_for_prompt(entries: Iterable[tuple[MemoryEntry, float]]) -> str:
    """Renderiza memories como bloco markdown pro Manager prompt."""
    lines = []
    for entry, score in entries:
        ts = entry.created_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=UTC)
        age = datetime.now(UTC) - ts
        days = int(age.total_seconds() / 86400)
        ago = "hoje" if days == 0 else f"há {days}d"
        proj = f" [proj #{entry.project_id}]" if entry.project_id else ""
        lines.append(f"- [{ago}{proj}] {entry.content[:300]}")
    return "\n".join(lines) if lines else ""


# ---------- Helper: gera decision summary via Haiku ----------

async def generate_decision_summary(
    *,
    user_message: str,
    manager_report: str,
    project_name: str | None = None,
) -> str | None:
    """Chama Haiku pra gerar 2-3 frases resumindo a decisão tomada na conv.

    Retorna None se Haiku falhar — não bloqueia o fluxo principal.
    """
    from command_center.agents.claude_runner import ClaudeRunner, Done, RunnerError, TextDelta

    proj_hint = f" no projeto **{project_name}**" if project_name else ""
    prompt = (
        "Resuma essa interação CEO ↔ Gerente em 2-3 frases curtas em PT-BR, "
        "focando no QUE FOI DECIDIDO e QUE TRABALHO FOI/SERÁ feito"
        f"{proj_hint}. Sem preâmbulo, direto ao ponto. Útil pra contexto de "
        "futuras conversas.\n\n"
        f"## Pedido do CEO\n{user_message[:1500]}\n\n"
        f"## Resposta do gerente\n{manager_report[:2000]}"
    )

    runner = ClaudeRunner()
    parts: list[str] = []
    try:
        async for event in runner.run(prompt=prompt, model="haiku"):
            if isinstance(event, TextDelta):
                parts.append(event.text)
            elif isinstance(event, RunnerError):
                log.warning("memory.summary_runner_error", error=event.message)
                return None
            elif isinstance(event, Done):
                pass
    except Exception as exc:
        log.warning("memory.summary_exception", error=str(exc))
        return None

    summary = "".join(parts).strip()
    return summary if summary else None
