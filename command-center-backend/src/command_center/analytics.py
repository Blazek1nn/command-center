"""
analytics.py — Provider-agnostic event tracking for Command Center.

Architecture:
  - Analytics.track() is the single call site throughout the codebase.
  - By default, events are logged via structlog (zero external deps, always safe).
  - When POSTHOG_API_KEY is set, events are also forwarded to PostHog cloud
    (free tier supports 1M events/month — enough for early traction phase).
  - Anonymous by design: user_id is a UUID stored in ~/.command-center/user_id,
    never an email or name. No PII is collected.

Usage:
    from command_center.analytics import analytics
    analytics.track("task_dispatched", {"model": "sonnet", "project": "my-app"})

Adding a new provider:
    Implement the Provider protocol and register it in _build_providers().
"""
from __future__ import annotations

import json
import os
import uuid
from abc import abstractmethod
from pathlib import Path
from typing import Any, Protocol

import structlog

log = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Anonymous user identity
# ---------------------------------------------------------------------------

def _get_anonymous_id() -> str:
    """
    Returns a stable anonymous UUID for this installation.
    Stored in ~/.command-center/user_id (plain text, no PII).
    Created on first call, reused forever.
    """
    id_file = Path.home() / ".command-center" / "user_id"
    try:
        id_file.parent.mkdir(parents=True, exist_ok=True)
        if id_file.exists():
            uid = id_file.read_text().strip()
            if uid:
                return uid
        uid = str(uuid.uuid4())
        id_file.write_text(uid)
        return uid
    except OSError:
        # Fallback: ephemeral ID for this process (won't persist across restarts)
        return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Provider protocol
# ---------------------------------------------------------------------------

class Provider(Protocol):
    @abstractmethod
    def track(self, event: str, properties: dict[str, Any], distinct_id: str) -> None:
        ...

    def flush(self) -> None:
        pass


# ---------------------------------------------------------------------------
# Providers
# ---------------------------------------------------------------------------

class LogProvider:
    """Always-on provider: writes events as structured JSON via structlog."""

    def track(self, event: str, properties: dict[str, Any], distinct_id: str) -> None:
        log.info(
            "analytics.event",
            event=event,
            properties=properties,
            distinct_id=distinct_id,
        )

    def flush(self) -> None:
        pass


class PostHogProvider:
    """
    PostHog cloud provider.

    Lazy-imports posthog so the backend starts cleanly even if the package
    isn't installed. Install with: `uv pip install posthog`

    Required env var: POSTHOG_API_KEY
    Optional env var: POSTHOG_HOST (default: https://app.posthog.com)
    """

    def __init__(self, api_key: str, host: str = "https://app.posthog.com") -> None:
        try:
            import posthog as _posthog  # type: ignore[import-untyped]
            _posthog.api_key = api_key
            _posthog.host = host
            # Disable PostHog's own exception logging to avoid noise
            _posthog.disabled = False
            self._ph = _posthog
            log.info("analytics.posthog.enabled", host=host)
        except ImportError:
            log.warning(
                "analytics.posthog.disabled",
                reason="posthog package not installed — run: uv pip install posthog",
            )
            self._ph = None

    def track(self, event: str, properties: dict[str, Any], distinct_id: str) -> None:
        if self._ph is None:
            return
        try:
            self._ph.capture(distinct_id, event, properties)
        except Exception as exc:  # noqa: BLE001
            log.warning("analytics.posthog.capture_error", error=repr(exc))

    def flush(self) -> None:
        if self._ph is None:
            return
        try:
            self._ph.flush()
        except Exception:  # noqa: BLE001
            pass


# ---------------------------------------------------------------------------
# Analytics facade
# ---------------------------------------------------------------------------

class Analytics:
    """
    Thread-safe, async-friendly analytics facade.

    track() is synchronous and non-blocking — providers should do their own
    batching/async. PostHog's Python SDK batches internally.
    """

    def __init__(self) -> None:
        self._distinct_id = _get_anonymous_id()
        self._providers: list[Provider] = _build_providers()
        log.info(
            "analytics.initialized",
            providers=[type(p).__name__ for p in self._providers],
            distinct_id=self._distinct_id,
        )

    def track(
        self,
        event: str,
        properties: dict[str, Any] | None = None,
    ) -> None:
        """
        Fire-and-forget event tracking. Never raises.

        Standard events (keep consistent to enable funnel analysis):
          task_dispatched       — {project, model, n_tasks}
          task_succeeded        — {project, model, cost_usd, duration_s, n_files_touched}
          task_failed           — {project, model, error_type, permission_blocked}
          plan_approved         — {project, n_tasks, was_edited}
          plan_rejected         — {project}
          plan_edited           — {project, n_tasks}
          conversation_started  — {project}
          session_started       — {}
          mcp_blocked           — {project, mcp_name}
          cost_reported         — {project, cost_usd, model}
        """
        props = properties or {}
        for provider in self._providers:
            try:
                provider.track(event, props, self._distinct_id)
            except Exception as exc:  # noqa: BLE001
                # Analytics must never break the main flow
                log.warning(
                    "analytics.provider_error",
                    provider=type(provider).__name__,
                    event=event,
                    error=repr(exc),
                )

    def flush(self) -> None:
        """Call on shutdown to drain any pending batches (e.g. PostHog)."""
        for provider in self._providers:
            try:
                provider.flush()
            except Exception:  # noqa: BLE001
                pass


def _build_providers() -> list[Provider]:
    providers: list[Provider] = [LogProvider()]

    posthog_key = os.getenv("POSTHOG_API_KEY", "").strip()
    if posthog_key:
        posthog_host = os.getenv("POSTHOG_HOST", "https://app.posthog.com").strip()
        providers.append(PostHogProvider(api_key=posthog_key, host=posthog_host))

    return providers


# ---------------------------------------------------------------------------
# Singleton — import and use directly
# ---------------------------------------------------------------------------

analytics = Analytics()
