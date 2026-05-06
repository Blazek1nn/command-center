/**
 * welcome.js — First-run onboarding panel for Command Center.
 * Shown once on first install, accessible via "Command Center: Welcome" command.
 */
(function () {
  "use strict";

  const vscode = acquireVsCodeApi();
  let backendOk = null;

  // ── Check backend on load ─────────────────────────────────────────────────
  checkBackend();

  function checkBackend() {
    const dot = document.getElementById("status-dot");
    const label = document.getElementById("status-label");
    if (dot) dot.className = "dot dot-checking";
    if (label) label.textContent = "Checking backend…";

    // Ask extension host to check (extension host has Node.js access)
    vscode.postMessage({ type: "checkBackend" });
  }

  // ── Messages from extension host ──────────────────────────────────────────
  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (msg.type === "backendStatus") {
      backendOk = msg.available;
      const dot = document.getElementById("status-dot");
      const label = document.getElementById("status-label");
      const startBtn = document.getElementById("btn-start");
      if (dot) dot.className = "dot " + (backendOk ? "dot-ok" : "dot-err");
      if (label) {
        label.textContent = backendOk
          ? "Backend running — you're ready!"
          : "Backend not found. Run: just dev";
      }
      if (startBtn) startBtn.disabled = false;
    }
  });

  // ── Button handlers ───────────────────────────────────────────────────────
  document.getElementById("btn-start")?.addEventListener("click", () => {
    vscode.postMessage({ type: "openChat" });
  });

  document.getElementById("btn-docs")?.addEventListener("click", () => {
    vscode.postMessage({ type: "openExternal", url: "https://github.com/command-center-dev/command-center#5-minute-setup" });
  });

  document.getElementById("btn-retry")?.addEventListener("click", checkBackend);

  // ── Example tasks (click to pre-fill chat) ────────────────────────────────
  document.querySelectorAll(".task-example").forEach((el) => {
    el.addEventListener("click", () => {
      const task = el.dataset.task;
      if (task) {
        vscode.postMessage({ type: "openChatWithTask", task });
      }
    });
  });
})();
