"""Garante .claude/settings.json em pasta de projeto com permissions liberadas.

Defesa em profundidade pro caso de algum worker rodar SEM
--dangerously-skip-permissions: o settings local libera Write/Edit/Bash
dentro do project dir.
"""
from __future__ import annotations

import json
from pathlib import Path


_DEFAULT_SETTINGS = {
    "permissions": {
        "allow": [
            "Write",
            "Edit",
            "MultiEdit",
            "NotebookEdit",
            "Bash",
        ],
    },
}


def ensure_project_claude_settings(project_dir: Path | str) -> bool:
    """Cria/atualiza `<project_dir>/.claude/settings.json` com allow rules.

    Idempotente. Retorna True se escreveu, False se já existia compatível ou
    falhou por permissão de filesystem.
    """
    base = Path(project_dir).expanduser()
    if not base.exists():
        try:
            base.mkdir(parents=True, exist_ok=True)
        except OSError:
            return False

    claude_dir = base / ".claude"
    settings_path = claude_dir / "settings.json"

    try:
        claude_dir.mkdir(parents=True, exist_ok=True)
    except OSError:
        return False

    if settings_path.exists():
        try:
            existing = json.loads(settings_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            existing = {}
        # Merge: se já tem allow com nossas tools, não toca.
        allowed = (
            existing.get("permissions", {}).get("allow", [])
            if isinstance(existing.get("permissions"), dict)
            else []
        )
        needed = set(_DEFAULT_SETTINGS["permissions"]["allow"])
        if set(allowed) >= needed:
            return False
        # Caso contrário, mescla.
        existing.setdefault("permissions", {})
        existing["permissions"].setdefault("allow", [])
        merged = sorted(set(existing["permissions"]["allow"]) | needed)
        existing["permissions"]["allow"] = merged
        try:
            settings_path.write_text(
                json.dumps(existing, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            return True
        except OSError:
            return False

    try:
        settings_path.write_text(
            json.dumps(_DEFAULT_SETTINGS, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        return True
    except OSError:
        return False
