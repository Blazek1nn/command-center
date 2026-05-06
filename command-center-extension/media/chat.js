/**
 * chat.js — Self-contained Command Center WebView UI.
 *
 * No build step, no React, no external deps. Pure DOM manipulation.
 * Runs inside VS Code's WebView sandbox (no Node access, no eval).
 *
 * SSE PROXY ARCHITECTURE:
 *   All streaming calls go through the extension host (Node.js) via postMessage.
 *   The WebView's fetch() is routed through VS Code's internal proxy which
 *   buffers SSE responses — bypassing it via the extension host fixes streaming.
 *
 * State machine:
 *   idle → thinking (sent chatStream to host)
 *        → streaming (manager_thinking / manager_delta events)
 *        → awaiting_approval (plan_created with tasks)
 *        → executing (dispatch in progress)
 *        → idle (done / error)
 */

(function () {
  "use strict";

  // ── VS Code API ──────────────────────────────────────────────────────────
  const vscode = acquireVsCodeApi();

  // ── State ────────────────────────────────────────────────────────────────
  let state = {
    backendUrl: "http://localhost:8000",
    projectDir: "",
    projectName: "—",
    backendOnline: false,
    phase: "idle", // idle | thinking | streaming | awaiting_approval | executing
    messages: [],
    currentPlan: null,
    activeTasks: {}, // index → { title, status, actions[], cost_usd }
    conversationId: null,
    streamingText: "",
  };

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const root = document.getElementById("root");

  // ── Boot ─────────────────────────────────────────────────────────────────
  render();
  vscode.postMessage({ type: "ready" });

  // ── Extension → WebView messages ─────────────────────────────────────────
  window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.type) {
      case "init":
        state.backendUrl = msg.backendUrl;
        state.projectDir = msg.projectDir;
        state.projectName = msg.projectName;
        render();
        break;

      case "backendStatus":
        state.backendOnline = msg.available;
        render();
        break;

      case "theme":
        document.body.dataset.theme = msg.kind;
        break;

      // ── SSE proxy events from extension host ─────────────────────────

      case "sseEvent":
        processSseEvent(msg.event, msg.data);
        break;

      case "sseDone":
        if (state.phase !== "idle" && state.phase !== "awaiting_approval") {
          state.phase = "idle";
          render();
        }
        break;

      case "sseError":
        state.phase = "idle";
        pushSystemMsg(`⚠ ${msg.error}`);
        render();
        break;
    }
  });

  // ── SSE event processor ───────────────────────────────────────────────────
  function processSseEvent(eventType, data) {
    switch (eventType) {
      case "conversation_started":
        state.conversationId = data.conversation_id;
        break;

      case "manager_thinking":
        state.phase = "streaming";
        state.streamingText = "";
        render();
        break;

      case "manager_delta":
        state.streamingText += data.text ?? "";
        updateStreamingMessage(state.streamingText);
        break;

      case "plan_created":
        finalizeStreamingMessage();
        state.currentPlan = data;
        if (data.tasks && data.tasks.length > 0) {
          state.phase = "awaiting_approval";
        } else {
          if (data.direct_reply) pushManagerMsg(data.direct_reply);
          state.phase = "idle";
        }
        render();
        break;

      case "task_started":
        state.phase = "executing";
        state.activeTasks[data.index] = {
          title: data.title,
          status: "running",
          model: data.model,
          project: data.project,
          actions: [],
          cost_usd: null,
        };
        render();
        break;

      case "worker_action":
        if (state.activeTasks[data.index]) {
          state.activeTasks[data.index].actions.push({
            tool: data.tool,
            summary: data.input_summary,
          });
          updateTaskCard(data.index);
        }
        break;

      case "task_completed":
        if (state.activeTasks[data.index]) {
          state.activeTasks[data.index].status = "done";
          state.activeTasks[data.index].cost_usd = data.cost_usd;
          updateTaskCard(data.index);
        }
        break;

      case "task_failed":
        if (state.activeTasks[data.index]) {
          state.activeTasks[data.index].status = "failed";
          state.activeTasks[data.index].error = data.error;
          updateTaskCard(data.index);
        }
        break;

      case "manager_report":
        pushManagerMsg(data.report);
        if (data.usage?.total?.cost_usd != null) {
          pushSystemMsg(
            `Done · $${data.usage.total.cost_usd.toFixed(4)} · ` +
            `${(data.usage.total.input_tokens ?? 0) + (data.usage.total.output_tokens ?? 0)} tokens`
          );
        }
        state.phase = "idle";
        render();
        break;

      case "done":
        state.phase = "idle";
        render();
        break;

      case "error":
        pushSystemMsg(`⚠ ${data.stage}: ${data.error}`);
        state.phase = "idle";
        render();
        break;
    }
  }

  // ── Send message (proxy through extension host) ───────────────────────────
  function sendMessage(text) {
    if (!text.trim() || state.phase !== "idle") return;
    if (!state.backendOnline) {
      vscode.postMessage({ type: "checkBackend" });
      pushSystemMsg("Backend offline. Start it with: just dev");
      return;
    }

    pushUserMsg(text);
    state.phase = "thinking";
    state.streamingText = "";
    state.currentPlan = null;
    state.activeTasks = {};
    render();

    // Ask extension host to open the SSE stream (bypasses WebView proxy buffering)
    vscode.postMessage({
      type: "chatStream",
      message: text,
      conversationId: state.conversationId,
    });
  }

  // ── Dispatch approved plan (proxy through extension host) ─────────────────
  function approvePlan() {
    if (!state.currentPlan) return;
    state.phase = "executing";
    state.activeTasks = {};
    for (const [i, t] of (state.currentPlan.tasks ?? []).entries()) {
      state.activeTasks[i] = { title: t.title, status: "running", model: t.model, actions: [] };
    }
    render();

    vscode.postMessage({
      type: "dispatchStream",
      tasks: state.currentPlan.tasks,
      conversationId: state.conversationId,
      managerModel: state.currentPlan.model ?? "sonnet",
      originalMessage: state.currentPlan.understanding ?? "",
    });
  }

  function rejectPlan() {
    state.currentPlan = null;
    state.phase = "idle";
    vscode.postMessage({ type: "cancelStream" });
    pushSystemMsg("Plan rejected. Send a new message to start over.");
    render();
  }

  function cancelRequest() {
    vscode.postMessage({ type: "cancelStream" });
    state.phase = "idle";
    pushSystemMsg("Cancelled.");
    render();
  }

  // ── Message helpers ───────────────────────────────────────────────────────
  function pushUserMsg(text) {
    state.messages.push({ role: "user", content: text, ts: Date.now() });
  }

  function pushManagerMsg(text) {
    state.messages.push({ role: "manager", content: text, ts: Date.now() });
  }

  function pushSystemMsg(text) {
    state.messages.push({ role: "system", content: text, ts: Date.now() });
  }

  // ── Streaming message helpers (patch DOM directly for perf) ───────────────
  let _streamingEl = null;

  function updateStreamingMessage(text) {
    if (!_streamingEl) {
      const msg = { role: "manager", content: text, ts: Date.now(), streaming: true };
      state.messages.push(msg);
      const list = document.querySelector(".cc-messages");
      if (list) {
        const el = buildMsgEl(msg);
        el.dataset.streaming = "true";
        list.appendChild(el);
        _streamingEl = el.querySelector(".cc-msg-body");
        list.scrollTop = list.scrollHeight;
      }
    } else {
      _streamingEl.textContent = text;
      const list = document.querySelector(".cc-messages");
      if (list) list.scrollTop = list.scrollHeight;
    }
  }

  function finalizeStreamingMessage() {
    if (_streamingEl) {
      const el = _streamingEl.closest("[data-streaming]");
      if (el) delete el.dataset.streaming;
      _streamingEl = null;
    }
    const last = state.messages[state.messages.length - 1];
    if (last?.streaming) {
      last.streaming = false;
      last.content = state.streamingText;
    }
    state.streamingText = "";
  }

  // ── Task card live update (patch, don't full-render) ──────────────────────
  function updateTaskCard(index) {
    const card = document.querySelector(`[data-task-index="${index}"]`);
    if (!card) { render(); return; }
    const task = state.activeTasks[index];
    card.className = `cc-task-card ${task.status}`;
    const spinner = card.querySelector(".cc-spinner");
    if (spinner && task.status !== "running") spinner.remove();
    const costEl = card.querySelector(".cc-task-card-cost");
    if (costEl && task.cost_usd != null) {
      costEl.textContent = `$${task.cost_usd.toFixed(4)}`;
    }
    const actionList = card.querySelector(".cc-activity-list");
    if (actionList && task.actions.length > 0) {
      const last = task.actions[task.actions.length - 1];
      const row = document.createElement("div");
      row.className = "cc-action-row";
      row.innerHTML = `<span class="cc-action-tool">${esc(last.tool)}</span><span class="cc-action-summary">${esc(last.summary)}</span>`;
      actionList.appendChild(row);
      actionList.scrollTop = actionList.scrollHeight;
    }
  }

  // ── Full render ───────────────────────────────────────────────────────────
  function render() {
    _streamingEl = null; // DOM wiped — reset streaming ref
    root.innerHTML = "";
    root.appendChild(buildLayout());
  }

  function buildLayout() {
    const wrap = div("", "");

    // Header
    const header = div("cc-header", "");
    const dot = div("cc-status-dot " + (state.backendOnline ? "online" : "offline"), "");
    const title = div("cc-header-title", "Command Center");
    const badge = div("cc-project-badge", state.projectName || "no project");
    header.appendChild(dot);
    header.appendChild(title);
    header.appendChild(badge);
    wrap.appendChild(header);

    // Offline banner
    if (!state.backendOnline) {
      const banner = div("cc-offline-banner", "");
      banner.innerHTML = `⚠ Backend offline · <a id="cc-check-backend" href="#">check again</a> or run <code>just dev</code>`;
      banner.querySelector("#cc-check-backend").addEventListener("click", (e) => {
        e.preventDefault();
        vscode.postMessage({ type: "checkBackend" });
      });
      wrap.appendChild(banner);
    }

    // Messages list
    const msgList = div("cc-messages", "");

    if (state.messages.length === 0) {
      const empty = div("cc-msg system", "");
      const body = div("cc-msg-body", "What do you want to build today? Describe the task and I'll create a plan.");
      empty.appendChild(body);
      msgList.appendChild(empty);
    } else {
      for (const msg of state.messages) {
        if (!msg.streaming) msgList.appendChild(buildMsgEl(msg));
      }
    }

    // Thinking indicator
    if (state.phase === "thinking") {
      const msg = div("cc-msg system", "");
      const body = div("cc-msg-body", "");
      body.innerHTML = `<span class="cc-spinner" style="display:inline-block;margin-right:6px;vertical-align:middle;"></span>Manager is planning…`;
      msg.appendChild(body);
      msgList.appendChild(msg);
    }

    // Active task cards
    for (const [idx, task] of Object.entries(state.activeTasks)) {
      msgList.appendChild(buildTaskCard(Number(idx), task));
    }

    // Plan editor
    if (state.phase === "awaiting_approval" && state.currentPlan?.tasks?.length) {
      msgList.appendChild(buildPlanEditor(state.currentPlan));
    }

    wrap.appendChild(msgList);
    setTimeout(() => { msgList.scrollTop = msgList.scrollHeight; }, 0);

    // Input area
    wrap.appendChild(buildInputArea());

    return wrap;
  }

  function buildMsgEl(msg) {
    const el = div(`cc-msg ${msg.role}${msg.streaming ? " streaming" : ""}`, "");
    if (msg.streaming) el.dataset.streaming = "true";

    const meta = div("cc-msg-meta", "");
    meta.textContent = msg.role === "user" ? "You" : msg.role === "manager" ? "Manager" : "System";
    const time = document.createElement("time");
    time.textContent = new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    meta.appendChild(span("·"));
    meta.appendChild(time);

    const body = div("cc-msg-body", msg.content);

    el.appendChild(meta);
    el.appendChild(body);
    return el;
  }

  function buildPlanEditor(plan) {
    const wrap = div("cc-plan", "");

    const header = div("cc-plan-header", "");
    header.innerHTML = `Proposed plan <span style="font-weight:400;text-transform:none;letter-spacing:0">(${plan.tasks.length} task${plan.tasks.length !== 1 ? "s" : ""})</span>`;
    wrap.appendChild(header);

    const tasks = div("cc-plan-tasks", "");
    for (const [i, t] of plan.tasks.entries()) {
      const item = div("cc-task-item", "");
      const idx = div("cc-task-index", String(i + 1).padStart(2, "0"));
      const info = div("", "");
      const title = div("cc-task-title", t.title);
      const meta = div("cc-task-meta", "");
      const modelBadge = span(t.model ?? "sonnet");
      modelBadge.className = `cc-badge model-${t.model ?? "sonnet"}`;
      if (t.project) {
        const projBadge = span(t.project);
        projBadge.className = "cc-badge";
        meta.appendChild(projBadge);
      }
      meta.appendChild(modelBadge);
      info.appendChild(title);
      info.appendChild(meta);
      item.appendChild(idx);
      item.appendChild(info);
      tasks.appendChild(item);
    }
    wrap.appendChild(tasks);

    const actions = div("cc-plan-actions", "");
    const approveBtn = button("✓ Approve & run", "cc-btn cc-btn-primary");
    approveBtn.addEventListener("click", approvePlan);
    const rejectBtn = button("✕ Reject", "cc-btn cc-btn-danger");
    rejectBtn.addEventListener("click", rejectPlan);
    actions.appendChild(approveBtn);
    actions.appendChild(rejectBtn);
    wrap.appendChild(actions);

    return wrap;
  }

  function buildTaskCard(index, task) {
    const card = div(`cc-task-card ${task.status}`, "");
    card.dataset.taskIndex = String(index);

    const header = div("cc-task-card-header", "");
    if (task.status === "running") {
      header.appendChild(div("cc-spinner", ""));
    } else if (task.status === "done") {
      header.appendChild(span("✓ "));
    } else if (task.status === "failed") {
      header.appendChild(span("✕ "));
    }
    const title = div("cc-task-card-title", task.title);
    const cost = div("cc-task-card-cost", task.cost_usd != null ? `$${task.cost_usd.toFixed(4)}` : "");
    header.appendChild(title);
    header.appendChild(cost);
    card.appendChild(header);

    if (task.actions.length > 0) {
      const activity = div("cc-activity", "");
      const actHeader = div("cc-activity-header", `Actions (${task.actions.length})`);
      const actList = div("cc-activity-list", "");
      for (const a of task.actions) {
        const row = div("cc-action-row", "");
        const tool = span(a.tool);
        tool.className = "cc-action-tool";
        const summary = span(a.summary);
        summary.className = "cc-action-summary";
        row.appendChild(tool);
        row.appendChild(summary);
        actList.appendChild(row);
      }
      activity.appendChild(actHeader);
      activity.appendChild(actList);
      card.appendChild(activity);
    }

    if (task.error) {
      const errEl = div("", "");
      errEl.style.cssText = "padding:8px 12px;font-size:11px;color:var(--cc-error);font-family:var(--cc-mono);white-space:pre-wrap;overflow-x:auto;";
      errEl.textContent = task.error;
      card.appendChild(errEl);
    }

    return card;
  }

  function buildInputArea() {
    const area = div("cc-input-area", "");
    const wrap = div("cc-textarea-wrap", "");
    const ta = document.createElement("textarea");
    ta.className = "cc-textarea";
    ta.placeholder = state.phase === "idle" ? "Describe a task for your agents…" : "Waiting…";
    ta.disabled = state.phase !== "idle";
    ta.rows = 1;
    ta.setAttribute("aria-label", "Task input");

    ta.addEventListener("input", () => {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    });

    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const text = ta.value.trim();
        if (text) { ta.value = ""; ta.style.height = "auto"; sendMessage(text); }
      }
      if (e.key === "Escape" && state.phase !== "idle") cancelRequest();
    });

    const sendBtn = button("↑", "cc-btn cc-btn-primary cc-send-btn");
    sendBtn.title = "Send (Enter)";
    sendBtn.disabled = state.phase !== "idle";
    sendBtn.addEventListener("click", () => {
      const text = ta.value.trim();
      if (text) { ta.value = ""; ta.style.height = "auto"; sendMessage(text); }
    });

    wrap.appendChild(ta);
    wrap.appendChild(sendBtn);

    if (state.phase !== "idle") {
      const cancelBtn = button("✕", "cc-btn cc-btn-secondary cc-send-btn");
      cancelBtn.title = "Cancel (Esc)";
      cancelBtn.style.marginLeft = "4px";
      cancelBtn.addEventListener("click", cancelRequest);
      wrap.appendChild(cancelBtn);
    }

    area.appendChild(wrap);
    area.appendChild(div("cc-hint", "Enter to send · Shift+Enter for newline · Esc to cancel"));

    setTimeout(() => ta.focus(), 50);
    return area;
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────
  function div(className, textContent) {
    const el = document.createElement("div");
    if (className) el.className = className;
    if (textContent) el.textContent = textContent;
    return el;
  }

  function span(textContent) {
    const el = document.createElement("span");
    if (textContent) el.textContent = textContent;
    return el;
  }

  function button(textContent, className) {
    const el = document.createElement("button");
    el.className = className;
    el.textContent = textContent;
    return el;
  }

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
})();
