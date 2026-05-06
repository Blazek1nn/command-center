/**
 * activity.js — Sidebar "Agent Activity" WebView.
 *
 * Shows the recent task history from the backend API.
 * Polls every 10s when the panel is visible.
 * Zero dependencies.
 */
(function () {
  "use strict";

  const vscode = acquireVsCodeApi();
  const root = document.getElementById("root");

  let state = {
    backendUrl: "http://localhost:8000",
    backendOnline: false,
    tasks: [],
    loading: true,
    error: null,
  };

  let pollTimer = null;

  // ── Init ──────────────────────────────────────────────────────────────────
  render();

  // ── Extension messages ────────────────────────────────────────────────────
  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg.type === "init" || msg.type === "backendUrl") {
      state.backendUrl = msg.backendUrl ?? msg.url ?? state.backendUrl;
      startPolling();
    }
    if (msg.type === "backendStatus") {
      state.backendOnline = msg.available;
      if (msg.available) fetchTasks();
      else { state.loading = false; render(); }
    }
  });

  // ── Polling ───────────────────────────────────────────────────────────────
  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    fetchTasks();
    pollTimer = setInterval(fetchTasks, 10_000);
  }

  async function fetchTasks() {
    try {
      const res = await fetch(`${state.backendUrl}/api/tasks?limit=20&order=desc`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.tasks = Array.isArray(data) ? data : (data.items ?? []);
      state.backendOnline = true;
      state.loading = false;
      state.error = null;
    } catch (err) {
      state.backendOnline = false;
      state.loading = false;
      state.error = err.message;
    }
    render();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render() {
    root.innerHTML = "";

    if (state.loading) {
      root.appendChild(statusEl("Loading…"));
      return;
    }

    if (!state.backendOnline) {
      const el = statusEl("Backend offline");
      const btn = document.createElement("button");
      btn.className = "cc-btn cc-btn-secondary";
      btn.textContent = "Retry";
      btn.style.marginTop = "8px";
      btn.addEventListener("click", () => {
        vscode.postMessage({ type: "checkBackend" });
        state.loading = true;
        render();
      });
      el.appendChild(btn);
      root.appendChild(el);
      return;
    }

    if (state.tasks.length === 0) {
      root.appendChild(statusEl("No tasks yet. Open the chat to get started."));
      return;
    }

    for (const task of state.tasks) {
      root.appendChild(buildTaskRow(task));
    }
  }

  function buildTaskRow(task) {
    const row = document.createElement("div");
    row.style.cssText = `
      padding: 8px;
      border: 1px solid var(--cc-border);
      border-radius: 6px;
      margin-bottom: 6px;
      background: var(--cc-surface);
    `;

    const status = task.status ?? "pending";
    const statusColor = {
      done: "var(--cc-success)",
      failed: "var(--cc-error)",
      running: "var(--cc-warning)",
      cancelled: "var(--cc-fg-muted)",
      pending: "var(--cc-fg-muted)",
    }[status] ?? "var(--cc-fg-muted)";

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:4px;";

    const dot = document.createElement("span");
    dot.style.cssText = `width:7px;height:7px;border-radius:50%;background:${statusColor};flex-shrink:0;`;
    if (status === "running") {
      dot.style.animation = "spin 0.7s linear infinite";
      dot.style.border = `2px solid ${statusColor}`;
      dot.style.background = "transparent";
      dot.style.borderTopColor = "transparent";
    }

    const title = document.createElement("span");
    title.style.cssText = "font-size:12px;font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    title.textContent = task.title ?? "Untitled task";

    header.appendChild(dot);
    header.appendChild(title);

    const meta = document.createElement("div");
    meta.style.cssText = "font-size:10px;color:var(--cc-fg-muted);display:flex;gap:8px;";

    if (task.model) {
      const m = document.createElement("span");
      m.textContent = task.model;
      m.style.fontFamily = "var(--cc-mono)";
      meta.appendChild(m);
    }

    if (task.cost_usd != null) {
      const c = document.createElement("span");
      c.textContent = `$${Number(task.cost_usd).toFixed(4)}`;
      c.style.fontFamily = "var(--cc-mono)";
      meta.appendChild(c);
    }

    if (task.created_at) {
      const d = document.createElement("span");
      d.textContent = new Date(task.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      meta.appendChild(d);
    }

    row.appendChild(header);
    row.appendChild(meta);

    if (task.error) {
      const err = document.createElement("div");
      err.style.cssText = "margin-top:4px;font-size:10px;color:var(--cc-error);font-family:var(--cc-mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      err.textContent = task.error;
      row.appendChild(err);
    }

    return row;
  }

  function statusEl(text) {
    const el = document.createElement("div");
    el.style.cssText = "padding:16px;text-align:center;font-size:12px;color:var(--cc-fg-muted);display:flex;flex-direction:column;align-items:center;";
    el.textContent = text;
    return el;
  }
})();
