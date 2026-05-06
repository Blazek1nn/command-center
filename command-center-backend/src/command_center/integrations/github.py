"""Integração GitHub via `gh` CLI.

Usa o `gh` CLI já autenticado no host em vez de chamar a API REST diretamente.
Isso significa zero dependência de token extra — a autenticação segue a do usuário.

Fluxo de auto-PR:
  1. Verifica que project_dir é um repo git com remote
  2. Cria branch command-center/<task_id>-<slug>
  3. Staged changes (se houver) → git commit
  4. git push -u origin <branch>
  5. gh pr create --title ... --body ...
  6. Retorna PR URL
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

import structlog

log = structlog.get_logger(__name__)

GH_TIMEOUT = 30  # segundos por operação git/gh


def _run(cmd: list[str], cwd: Path | None = None, timeout: int = GH_TIMEOUT) -> tuple[int, str, str]:
    """Roda comando e retorna (returncode, stdout, stderr)."""
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd) if cwd else None,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return proc.returncode, proc.stdout.strip(), proc.stderr.strip()
    except subprocess.TimeoutExpired:
        return -1, "", f"timeout após {timeout}s"
    except FileNotFoundError as exc:
        return -1, "", f"comando não encontrado: {exc}"


def _slugify(text: str, max_len: int = 40) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"[\s-]+", "-", text).strip("-")
    return text[:max_len]


def is_git_repo(project_dir: Path) -> bool:
    code, _, _ = _run(["git", "rev-parse", "--git-dir"], cwd=project_dir)
    return code == 0


def has_remote(project_dir: Path) -> bool:
    code, out, _ = _run(["git", "remote"], cwd=project_dir)
    return code == 0 and bool(out)


def current_branch(project_dir: Path) -> str | None:
    code, out, _ = _run(["git", "branch", "--show-current"], cwd=project_dir)
    return out if code == 0 and out else None


def create_pr(
    *,
    project_dir: Path,
    task_id: int,
    task_title: str,
    task_output: str,
    base_branch: str = "main",
) -> str | None:
    """Cria PR no GitHub para as mudanças da task. Retorna URL do PR ou None em caso de falha."""
    if not is_git_repo(project_dir):
        log.warning("github.not_git_repo", path=str(project_dir))
        return None
    if not has_remote(project_dir):
        log.warning("github.no_remote", path=str(project_dir))
        return None

    slug = _slugify(task_title)
    branch_name = f"command-center/{task_id}-{slug}"

    # Cria branch a partir do HEAD atual
    code, _, err = _run(["git", "checkout", "-b", branch_name], cwd=project_dir)
    if code != 0:
        # Branch pode já existir — tenta só checkout
        code2, _, err2 = _run(["git", "checkout", branch_name], cwd=project_dir)
        if code2 != 0:
            log.warning("github.branch_failed", error=err or err2)
            return None

    # Stage só o conteúdo do projeto (era `git add -A` — risco de incluir
    # arquivos sensíveis se cwd herdar bagunça). Sprint 4: scope explícito.
    _run(["git", "add", "."], cwd=project_dir)

    # Sprint 4: alerta se algum arquivo suspeito foi staged (.env, *.key, etc.)
    code_diff, staged, _ = _run(
        ["git", "diff", "--cached", "--name-only"], cwd=project_dir,
    )
    if code_diff == 0 and staged:
        risky = [
            f for f in staged.splitlines()
            if f.endswith((".env", ".key", ".pem", ".p12", ".pfx"))
            or "secret" in f.lower()
            or "credential" in f.lower()
        ]
        if risky:
            log.warning(
                "github.suspicious_files_staged",
                files=risky,
                hint="Considere adicionar ao .gitignore antes de habilitar auto-PR",
            )

    # Commit (falha silenciosamente se não houver mudanças)
    commit_msg = f"feat: {task_title[:70]}\n\nGerado pelo Command Center (task #{task_id})."
    code, _, err = _run(
        ["git", "commit", "-m", commit_msg, "--allow-empty"],
        cwd=project_dir,
    )
    if code != 0:
        log.warning("github.commit_failed", error=err)

    # Push
    code, _, err = _run(
        ["git", "push", "-u", "origin", branch_name, "--force-with-lease"],
        cwd=project_dir,
    )
    if code != 0:
        log.warning("github.push_failed", error=err)
        return None

    # gh pr create
    body = (
        f"## Gerado pelo Command Center\n\n"
        f"**Task #{task_id}:** {task_title}\n\n"
        f"### Resultado\n\n{task_output[:2000]}\n\n"
        f"---\n🤖 Auto-PR criado pelo Command Center"
    )
    code, out, err = _run(
        [
            "gh", "pr", "create",
            "--title", task_title[:100],
            "--body", body,
            "--base", base_branch,
            "--head", branch_name,
        ],
        cwd=project_dir,
    )
    if code != 0:
        log.warning("github.pr_create_failed", error=err)
        return None

    # gh pr create retorna a URL do PR
    pr_url = out.strip()
    log.info("github.pr_created", url=pr_url, task_id=task_id)
    return pr_url if pr_url.startswith("http") else None
