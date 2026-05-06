"""CRUD de integrações externas (GitHub / Linear) — Frente ζ.

GET  /api/integrations                   — lista tipos configurados
POST /api/integrations                   — cria/atualiza integração
DELETE /api/integrations/{type}          — remove integração
GET  /api/integrations/{type}/test       — verifica se credencial funciona
"""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from command_center.db import session as session_module
from command_center.db.models import Integration
from command_center.secrets_vault import decrypt, encrypt

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


class IntegrationIn(BaseModel):
    integration_type: str  # "github" | "linear"
    token: str
    extra_config: dict | None = None


class IntegrationOut(BaseModel):
    integration_type: str
    # Nunca expõe o token completo — apenas os últimos 4 chars
    token_hint: str
    extra_config: dict | None
    created_at: str
    updated_at: str


def _mask_token(stored_token: str) -> str:
    """Hint do token pra UI. Descripta primeiro pra mostrar últimos 4 chars REAIS."""
    plain = decrypt(stored_token)
    if not plain or len(plain) <= 8:
        return "****"
    return f"...{plain[-4:]}"


def _parse_config(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


@router.get("")
async def list_integrations() -> dict:
    async with session_module.AsyncSessionLocal() as sess:
        from sqlalchemy import select
        rows = (await sess.execute(select(Integration))).scalars().all()
        return {
            "integrations": [
                IntegrationOut(
                    integration_type=r.integration_type,
                    token_hint=_mask_token(r.token),
                    extra_config=_parse_config(r.extra_config),
                    created_at=r.created_at.isoformat(),
                    updated_at=r.updated_at.isoformat(),
                )
                for r in rows
            ]
        }


@router.post("")
async def upsert_integration(body: IntegrationIn) -> dict:
    if body.integration_type not in ("github", "linear"):
        raise HTTPException(status_code=400, detail="integration_type deve ser 'github' ou 'linear'")

    extra_json = json.dumps(body.extra_config) if body.extra_config else None

    async with session_module.AsyncSessionLocal() as sess:
        from sqlalchemy import select
        existing = (
            await sess.execute(
                select(Integration).where(Integration.integration_type == body.integration_type)
            )
        ).scalar_one_or_none()
        encrypted_token = encrypt(body.token)
        if existing:
            existing.token = encrypted_token
            existing.extra_config = extra_json
        else:
            sess.add(Integration(
                integration_type=body.integration_type,
                token=encrypted_token,
                extra_config=extra_json,
            ))
        await sess.commit()
    return {"saved": True, "type": body.integration_type}


@router.delete("/{integration_type}")
async def delete_integration(integration_type: str) -> dict:
    async with session_module.AsyncSessionLocal() as sess:
        from sqlalchemy import select
        row = (
            await sess.execute(
                select(Integration).where(Integration.integration_type == integration_type)
            )
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Integração não encontrada")
        await sess.delete(row)
        await sess.commit()
    return {"deleted": True}


@router.get("/{integration_type}/test")
async def test_integration(integration_type: str) -> dict:
    """Verifica se a credencial está funcional."""
    async with session_module.AsyncSessionLocal() as sess:
        from sqlalchemy import select
        row = (
            await sess.execute(
                select(Integration).where(Integration.integration_type == integration_type)
            )
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Integração não configurada")
        token = decrypt(row.token)

    if integration_type == "github":
        import subprocess
        try:
            proc = subprocess.run(
                ["gh", "auth", "status"],
                capture_output=True, text=True, timeout=10,
            )
            ok = proc.returncode == 0
            return {"ok": ok, "message": proc.stdout.strip() or proc.stderr.strip()}
        except Exception as exc:
            return {"ok": False, "message": str(exc)}

    elif integration_type == "linear":
        from command_center.integrations.linear import _graphql
        try:
            data = _graphql(token, "query { viewer { name email } }")
            viewer = data.get("viewer", {})
            return {"ok": True, "user": viewer.get("name"), "email": viewer.get("email")}
        except Exception as exc:
            return {"ok": False, "message": str(exc)}

    return {"ok": False, "message": "tipo desconhecido"}
