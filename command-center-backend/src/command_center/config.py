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
    default_manager_model: str = "sonnet"
    default_worker_model: str = "sonnet"
    task_timeout_seconds: int = 600
    host: str = "0.0.0.0"
    port: int = 8000


settings = Settings()
