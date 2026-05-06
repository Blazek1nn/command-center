"""Carrega skills (.md) e MCP config (.json) para um projeto.

Convenção de paths:
- Por projeto: <project_dir>/.claude/skills/*.md
- Global:      ~/.command-center/skills/*.md  (fallback, sem override por projeto)
- MCP:         <project_dir>/.claude/mcp.json

Skills por projeto sobrescrevem globais com o mesmo nome (stem do arquivo).
O resultado é um bloco de texto concatenado pra passar ao Claude via
--append-system-prompt, e um Path opcional de mcp.json pra --mcp-config.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import structlog

log = structlog.get_logger(__name__)

# Diretório global de skills do Command Center no host
_GLOBAL_SKILLS_DIR = Path.home() / ".command-center" / "skills"


@dataclass
class SkillInfo:
    name: str          # stem do arquivo (sem extensão)
    content: str       # conteúdo completo do .md
    path: Path         # path absoluto do arquivo
    scope: str         # "project" | "global"


@dataclass
class SkillsBundle:
    """Tudo que o dispatcher precisa pra passar ao Employee."""
    skills: list[SkillInfo] = field(default_factory=list)
    mcp_config_path: Path | None = None
    # Status do filtro headless: 'ok' se filtrado/passou, 'missing_allowlist'
    # se mcp.json existe mas não tem headless_mcps[] e config strict=True,
    # 'no_mcp' se nem tem mcp.json.
    mcp_headless_status: str = "no_mcp"
    # Servers que foram filtrados out pelo allow-list (pra UI mostrar).
    mcp_filtered_out: list[str] = field(default_factory=list)

    @property
    def system_prompt_block(self) -> str:
        """Bloco markdown concatenado de todas as skills ativas."""
        if not self.skills:
            return ""
        parts: list[str] = ["## Skills ativas (regras obrigatórias do projeto)"]
        for sk in self.skills:
            parts.append(f"\n### {sk.name}\n{sk.content.strip()}")
        return "\n".join(parts)

    @property
    def has_skills(self) -> bool:
        return bool(self.skills)

    @property
    def has_mcp(self) -> bool:
        return self.mcp_config_path is not None

    @property
    def is_headless_blocked(self) -> bool:
        """True se headless_strict + mcp.json sem allow-list. Dispatcher
        deve falhar a task ao invés de tentar rodar."""
        return self.mcp_headless_status == "missing_allowlist"


def _filter_mcp_for_headless(
    mcp_path: Path, project_dir: Path, strict: bool
) -> tuple[Path | None, str, list[str]]:
    """Filtra mcp.json pra modo headless usando o campo `headless_mcps`.

    Convenção: o JSON pode ter um campo top-level `headless_mcps: list[str]`
    com os nomes dos servers permitidos em modo headless. Os outros são
    removidos (pra evitar prompts de permissão que travariam o worker).

    Retorna (path_pra_passar_ao_cli, status, filtered_out_names).

    - Se mcp.json não tem `headless_mcps`: retorna o mcp.json original e
      status='unfiltered' (warning) ou status='missing_allowlist' se strict.
    - Se tem allow-list: escreve um mcp.headless.json filtrado em .tmp/
      e retorna esse path + status='ok'.
    """
    try:
        config = json.loads(mcp_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        log.warning("skills.mcp_parse_failed", error=str(exc))
        return mcp_path, "parse_failed", []

    allow_list = config.get("headless_mcps")
    servers = config.get("mcpServers", {})

    if not isinstance(allow_list, list):
        # Sem allow-list: passa o original (modo permissivo) ou bloqueia (strict)
        if strict and servers:
            return None, "missing_allowlist", list(servers.keys())
        return mcp_path, "unfiltered", []

    allow_set = {str(name) for name in allow_list}
    filtered_servers = {k: v for k, v in servers.items() if k in allow_set}
    filtered_out = [k for k in servers if k not in allow_set]

    # Escreve o filtrado em .claude/.tmp/ — não polui o repo, é regenerado
    # a cada execução. .gitignore deve cobrir .claude/.tmp/.
    tmp_dir = project_dir / ".claude" / ".tmp"
    try:
        tmp_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        log.warning("skills.mcp_tmp_mkdir_failed", error=str(exc))
        return mcp_path, "tmp_failed", filtered_out

    filtered_path = tmp_dir / "mcp.headless.json"
    filtered_config = dict(config)
    filtered_config["mcpServers"] = filtered_servers
    try:
        filtered_path.write_text(
            json.dumps(filtered_config, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except OSError as exc:
        log.warning("skills.mcp_filtered_write_failed", error=str(exc))
        return mcp_path, "write_failed", filtered_out

    return filtered_path, "ok", filtered_out


def load_project_skills(project_dir: Path) -> SkillsBundle:
    """Carrega skills do projeto + globais e MCP config.

    Returns SkillsBundle sempre (nunca levanta exceção — falhas são logged).
    """
    # Import lazy pra evitar ciclo (config importa db indiretamente)
    from command_center.config import settings

    bundle = SkillsBundle()
    project_skills_dir = project_dir / ".claude" / "skills"
    mcp_path = project_dir / ".claude" / "mcp.json"

    # Mapa nome → SkillInfo (projeto tem prioridade sobre global)
    seen: dict[str, SkillInfo] = {}

    # 1. Skills do projeto
    if project_skills_dir.exists():
        for md_file in sorted(project_skills_dir.glob("*.md")):
            try:
                content = md_file.read_text(encoding="utf-8")
                seen[md_file.stem] = SkillInfo(
                    name=md_file.stem,
                    content=content,
                    path=md_file,
                    scope="project",
                )
            except OSError as exc:
                log.warning("skills.read_failed", path=str(md_file), error=str(exc))

    # 2. Skills globais (não sobrescrevem projeto)
    if _GLOBAL_SKILLS_DIR.exists():
        for md_file in sorted(_GLOBAL_SKILLS_DIR.glob("*.md")):
            if md_file.stem not in seen:
                try:
                    content = md_file.read_text(encoding="utf-8")
                    seen[md_file.stem] = SkillInfo(
                        name=md_file.stem,
                        content=content,
                        path=md_file,
                        scope="global",
                    )
                except OSError as exc:
                    log.warning("skills.global_read_failed", path=str(md_file), error=str(exc))

    bundle.skills = list(seen.values())

    # 3. MCP config — passa por filtro de allow-list pra modo headless
    if mcp_path.exists():
        filtered_path, status, filtered_out = _filter_mcp_for_headless(
            mcp_path, project_dir, strict=settings.headless_strict
        )
        bundle.mcp_config_path = filtered_path
        bundle.mcp_headless_status = status
        bundle.mcp_filtered_out = filtered_out

    if bundle.skills or bundle.mcp_config_path or bundle.mcp_headless_status != "no_mcp":
        log.info(
            "skills.loaded",
            project=str(project_dir),
            skill_count=len(bundle.skills),
            has_mcp=bundle.has_mcp,
            mcp_headless_status=bundle.mcp_headless_status,
            mcp_filtered_out=bundle.mcp_filtered_out,
        )

    return bundle


# ---------- Gerenciamento de skills via API ----------

def list_skills(project_dir: Path) -> list[dict]:
    """Lista skills do projeto + globais. Para GET /api/projects/{id}/skills."""
    bundle = load_project_skills(project_dir)
    return [
        {
            "name": sk.name,
            "scope": sk.scope,
            "chars": len(sk.content),
            "preview": sk.content[:200],
        }
        for sk in bundle.skills
    ]


def get_skill_content(project_dir: Path, name: str) -> str | None:
    """Lê conteúdo de uma skill específica."""
    proj_file = project_dir / ".claude" / "skills" / f"{name}.md"
    if proj_file.exists():
        return proj_file.read_text(encoding="utf-8")
    global_file = _GLOBAL_SKILLS_DIR / f"{name}.md"
    if global_file.exists():
        return global_file.read_text(encoding="utf-8")
    return None


def save_skill(project_dir: Path, name: str, content: str) -> Path:
    """Salva (cria ou sobrescreve) uma skill no projeto.

    Hardening Sprint 4: além do replace de chars suspeitos no nome, valida via
    `Path.resolve()` que o path final está REALMENTE dentro de skills_dir —
    blinda contra payloads tipo "..\\..\\..\\evil.md" ou symlinks que escapem.
    """
    # Sanitize name: apenas alphanumeric, hífens e underscores
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in name).strip("._-")
    if not safe_name:
        raise ValueError("Nome de skill inválido após sanitização")
    skills_dir = (project_dir / ".claude" / "skills").resolve()
    skills_dir.mkdir(parents=True, exist_ok=True)
    target = (skills_dir / f"{safe_name}.md").resolve()
    # is_relative_to garante que target NÃO escapou do skills_dir
    if not target.is_relative_to(skills_dir):
        raise ValueError(f"Path traversal bloqueado: {target}")
    target.write_text(content, encoding="utf-8")
    return target


def delete_skill(project_dir: Path, name: str) -> bool:
    """Remove uma skill do projeto. Retorna False se não existir."""
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in name).strip("._-")
    if not safe_name:
        return False
    skills_dir = (project_dir / ".claude" / "skills").resolve()
    target = (skills_dir / f"{safe_name}.md").resolve()
    if not target.is_relative_to(skills_dir):
        return False
    if target.exists():
        target.unlink()
        return True
    return False


def get_mcp_config(project_dir: Path) -> dict | None:
    """Lê mcp.json do projeto. None se não existir."""
    mcp_path = project_dir / ".claude" / "mcp.json"
    if not mcp_path.exists():
        return None
    try:
        return json.loads(mcp_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        log.warning("skills.mcp_read_failed", path=str(mcp_path), error=str(exc))
        return None


def save_mcp_config(project_dir: Path, config: dict) -> Path:
    """Salva mcp.json no projeto."""
    claude_dir = project_dir / ".claude"
    claude_dir.mkdir(parents=True, exist_ok=True)
    mcp_path = claude_dir / "mcp.json"
    mcp_path.write_text(
        json.dumps(config, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return mcp_path
