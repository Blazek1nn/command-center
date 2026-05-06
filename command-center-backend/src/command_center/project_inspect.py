"""Inspecionar diretórios de projeto para inferir tech stack.

Usado por /api/projects pra mostrar badges (Python/Next.js/Rust/etc.) no sidebar
sem precisar rodar LLM. Heurística simples baseada em arquivos-marcador.
"""
from __future__ import annotations

from pathlib import Path

# Marker file → (label, prioridade — maior vence em conflito)
_MARKERS: list[tuple[str, str, int]] = [
    ("package.json", "Node.js", 5),
    ("next.config.js", "Next.js", 10),
    ("next.config.mjs", "Next.js", 10),
    ("next.config.ts", "Next.js", 10),
    ("vite.config.ts", "Vite", 8),
    ("vite.config.js", "Vite", 8),
    ("nuxt.config.ts", "Nuxt", 10),
    ("svelte.config.js", "Svelte", 10),
    ("astro.config.mjs", "Astro", 10),
    ("remix.config.js", "Remix", 10),
    ("pyproject.toml", "Python", 5),
    ("requirements.txt", "Python", 4),
    ("setup.py", "Python", 4),
    ("Cargo.toml", "Rust", 10),
    ("go.mod", "Go", 10),
    ("pubspec.yaml", "Flutter", 10),
    ("composer.json", "PHP", 8),
    ("Gemfile", "Ruby", 8),
    ("mix.exs", "Elixir", 10),
    ("build.gradle", "JVM/Gradle", 8),
    ("build.gradle.kts", "Kotlin", 9),
    ("pom.xml", "Java/Maven", 8),
    ("Dockerfile", "Docker", 2),
    (".sln", "C#", 10),
]

# Sub-marcadores Python que dão pista do framework dentro de Python
_PYTHON_FRAMEWORK_HINTS: dict[str, str] = {
    "fastapi": "FastAPI",
    "django": "Django",
    "flask": "Flask",
    "streamlit": "Streamlit",
    "langchain": "LangChain",
    "langgraph": "LangGraph",
}


def detect_stack(project_path: str | Path) -> list[str]:
    """Retorna lista de labels (max 3) que descrevem o stack. Vazio se não detectar."""
    path = Path(project_path).expanduser()
    if not path.exists() or not path.is_dir():
        return []

    found: list[tuple[str, int]] = []
    try:
        names = {p.name for p in path.iterdir() if p.is_file()}
    except (PermissionError, OSError):
        return []

    for marker, label, prio in _MARKERS:
        if marker in names:
            found.append((label, prio))

    # Para Python, tentar detectar framework
    if any(label == "Python" for label, _ in found):
        framework_label = _detect_python_framework(path)
        if framework_label:
            found.append((framework_label, 8))

    if not found:
        return []

    # Dedup por label, sort por prioridade desc
    seen: dict[str, int] = {}
    for label, prio in found:
        if label not in seen or prio > seen[label]:
            seen[label] = prio
    sorted_labels = sorted(seen.items(), key=lambda x: -x[1])
    return [label for label, _ in sorted_labels[:3]]


def _detect_python_framework(path: Path) -> str | None:
    """Lê pyproject.toml/requirements.txt à procura de framework conhecido."""
    candidates = [path / "pyproject.toml", path / "requirements.txt"]
    for f in candidates:
        if not f.exists():
            continue
        try:
            text = f.read_text(encoding="utf-8", errors="ignore").lower()
        except OSError:
            continue
        for needle, label in _PYTHON_FRAMEWORK_HINTS.items():
            if needle in text:
                return label
    return None
