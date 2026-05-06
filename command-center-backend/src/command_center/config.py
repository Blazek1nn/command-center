from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    projects_root: Path = Path.home() / "projects"
    db_url: str = "sqlite+aiosqlite:///./command_center.db"
    max_parallel_workers: int = 5
    claude_cli_path: str = "claude"
    log_level: str = "INFO"
    # Sonnet como default — Opus 2x mais caro sem ganho consistente em planejamento.
    # Override por request via ChatRequest.manager_model.
    default_manager_model: str = "sonnet"
    default_worker_model: str = "sonnet"
    # Modelo usado pelo small-talk fast-path (Haiku é o mais barato/rápido).
    smalltalk_model: str = "haiku"
    task_timeout_seconds: int = 600
    # Timeout pro Manager planejar — sem isso, SSE pode pendurar pra sempre se
    # o LLM hangar. 60s é bem mais que p99 esperado (~10-20s pra opus).
    manager_timeout_seconds: int = 90
    # MCP headless safety: se True, qualquer mcp.json sem allow-list explícita
    # de headless_mcps[] é bloqueado (task falha cedo com mensagem clara em
    # vez de pendurar). Ver skills/loader.py:filter_mcp_for_headless().
    # Default False pra não quebrar projetos sem mcp.json — usuário ativa
    # quando quer rigor extra.
    headless_strict: bool = False
    host: str = "0.0.0.0"
    port: int = 8000

    # Analytics — PostHog (optional).
    # Leave blank to use log-only mode (no external calls).
    # Get a free key at https://posthog.com — free up to 1M events/month.
    posthog_api_key: str = ""
    posthog_host: str = "https://app.posthog.com"


settings = Settings()
