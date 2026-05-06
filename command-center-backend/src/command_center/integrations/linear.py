"""Integração Linear via GraphQL API.

Usa Personal API Key do usuário para atualizar issues e criar comentários.
Não requer dependências extras — só urllib (stdlib).
"""
from __future__ import annotations

import json
import urllib.request
from typing import Any

import structlog

log = structlog.get_logger(__name__)

LINEAR_API_URL = "https://api.linear.app/graphql"


def _graphql(token: str, query: str, variables: dict[str, Any] | None = None) -> dict:
    """Executa uma query GraphQL na Linear API. Retorna o dict `data` ou levanta."""
    payload = {"query": query, "variables": variables or {}}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        LINEAR_API_URL,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": token,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        result = json.loads(resp.read().decode("utf-8"))
    if "errors" in result:
        raise RuntimeError(f"Linear API error: {result['errors']}")
    return result.get("data", {})


def get_issue(token: str, issue_id: str) -> dict | None:
    """Busca um issue pelo ID (ex: 'ABC-123'). Retorna dict ou None."""
    query = """
    query GetIssue($id: String!) {
        issue(id: $id) {
            id
            title
            state { name type }
            url
        }
    }
    """
    try:
        data = _graphql(token, query, {"id": issue_id})
        return data.get("issue")
    except Exception as exc:
        log.warning("linear.get_issue_failed", issue_id=issue_id, error=str(exc))
        return None


def add_comment(token: str, issue_id: str, body: str) -> bool:
    """Adiciona comentário em um issue. Retorna True se sucesso."""
    mutation = """
    mutation AddComment($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) {
            success
        }
    }
    """
    try:
        data = _graphql(token, mutation, {"issueId": issue_id, "body": body})
        return bool(data.get("commentCreate", {}).get("success"))
    except Exception as exc:
        log.warning("linear.add_comment_failed", issue_id=issue_id, error=str(exc))
        return False


def update_issue_state(token: str, issue_id: str, state_name: str) -> bool:
    """Tenta atualizar o estado de um issue pelo nome (ex: 'In Progress', 'Done').

    Primeiro busca o state ID pelo nome, depois aplica o update.
    Retorna True se sucesso.
    """
    # Busca estados disponíveis
    query = """
    query WorkflowStates {
        workflowStates { nodes { id name } }
    }
    """
    try:
        data = _graphql(token, query)
        states = data.get("workflowStates", {}).get("nodes", [])
        state = next(
            (s for s in states if s["name"].lower() == state_name.lower()),
            None,
        )
        if not state:
            log.warning("linear.state_not_found", state_name=state_name)
            return False

        mutation = """
        mutation UpdateIssue($id: String!, $stateId: String!) {
            issueUpdate(id: $id, input: { stateId: $stateId }) {
                success
            }
        }
        """
        data2 = _graphql(token, mutation, {"id": issue_id, "stateId": state["id"]})
        return bool(data2.get("issueUpdate", {}).get("success"))
    except Exception as exc:
        log.warning("linear.update_state_failed", issue_id=issue_id, error=str(exc))
        return False


async def notify_task_complete(
    *,
    token: str,
    issue_id: str,
    task_title: str,
    task_output: str,
    pr_url: str | None,
) -> None:
    """Notifica Linear que a task foi concluída — fire-and-forget."""
    import asyncio
    body_parts = [
        f"✅ **Command Center concluiu:** {task_title}",
        "",
        task_output[:1000],
    ]
    if pr_url:
        body_parts.append(f"\n🔗 **PR:** {pr_url}")
    body = "\n".join(body_parts)
    await asyncio.to_thread(add_comment, token, issue_id, body)
