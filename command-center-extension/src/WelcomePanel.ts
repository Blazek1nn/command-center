import * as vscode from "vscode";
import { checkBackendAvailable } from "./backendClient";

/**
 * WelcomePanel — shown once on first install, and via "Command Center: Welcome" command.
 *
 * Responsibilities:
 * - Show onboarding steps (prerequisites, setup, first task)
 * - Check if backend is running and report status
 * - Allow launching the chat panel directly with an example task
 */
export class WelcomePanel {
  private static readonly viewType = "commandCenter.welcome";
  private static _current: WelcomePanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._panel.webview.html = this._getHtml();
    this._bindMessages();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static show(extensionUri: vscode.Uri): void {
    if (WelcomePanel._current) {
      WelcomePanel._current._panel.reveal(vscode.ViewColumn.One);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      WelcomePanel.viewType,
      "Welcome to Command Center",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
      }
    );
    WelcomePanel._current = new WelcomePanel(panel, extensionUri);
  }

  public dispose(): void {
    WelcomePanel._current = undefined;
    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
    this._disposables = [];
  }

  private _bindMessages(): void {
    const webview = this._panel.webview;

    webview.onDidReceiveMessage(
      async (msg) => {
        switch (msg.type) {
          case "checkBackend": {
            const config = vscode.workspace.getConfiguration("commandCenter");
            const url = config.get<string>("backendUrl") ?? "http://localhost:8000";
            const available = await checkBackendAvailable(url);
            void webview.postMessage({ type: "backendStatus", available, url });
            break;
          }
          case "openChat":
            void vscode.commands.executeCommand("commandCenter.newTask");
            break;
          case "openChatWithTask":
            // Open the chat panel — the task text will be pre-filled via state
            // (future: pass task through extension state → ChatPanel)
            void vscode.commands.executeCommand("commandCenter.newTask");
            break;
          case "openExternal":
            void vscode.env.openExternal(vscode.Uri.parse(msg.url));
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private _getHtml(): string {
    const webview = this._panel.webview;
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "welcome.css")
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "welcome.js")
    );
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             connect-src http://localhost:* https://localhost:*;
             img-src ${webview.cspSource} data:;
             script-src 'nonce-${nonce}';
             style-src ${webview.cspSource} 'unsafe-inline';" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Welcome to Command Center</title>
</head>
<body>
  <h1>Welcome to Command Center</h1>
  <p>Plan, approve, and dispatch coding tasks to AI agents — without leaving VS Code.</p>

  <div class="hero">
    <div class="status">
      <span class="dot dot-checking" id="status-dot"></span>
      <span id="status-label">Checking backend…</span>
      <button class="btn-secondary" id="btn-retry" style="padding:2px 10px;font-size:11px;">↻ Retry</button>
    </div>
  </div>

  <h2>Get started in 3 steps</h2>

  <div class="step">
    <div class="step-num">1</div>
    <div class="step-body">
      <div class="step-title">Start the backend</div>
      <div class="step-desc">
        Clone the repo and run <code>just dev</code>. The backend starts on <code>:8000</code>.
        Full guide: <a href="#" onclick="postMsg('openExternal','https://github.com/command-center-dev/command-center#5-minute-setup')">README</a>
      </div>
    </div>
  </div>

  <div class="step">
    <div class="step-num">2</div>
    <div class="step-body">
      <div class="step-title">Authenticate Claude Code CLI</div>
      <div class="step-desc">
        Run <code>claude login</code> in your terminal. Test with <code>claude --print --model haiku "ok"</code>.
      </div>
    </div>
  </div>

  <div class="step">
    <div class="step-num">3</div>
    <div class="step-body">
      <div class="step-title">Open the chat and send your first task</div>
      <div class="step-desc">Press <span class="badge">⌘⇧A</span> or click the button below. Try one of these:</div>
      <div class="task-example" data-task="Add a hello world endpoint to this project with a test" style="margin-top:8px;">
        <span class="task-example-icon">⚡</span>
        Add a hello world endpoint with a test
      </div>
      <div class="task-example" data-task="Audit this codebase for security issues and create a report">
        <span class="task-example-icon">🔍</span>
        Audit this codebase for security issues
      </div>
      <div class="task-example" data-task="Write a README for this project based on the code">
        <span class="task-example-icon">📝</span>
        Write a README based on the code
      </div>
    </div>
  </div>

  <div class="actions">
    <button class="btn-primary" id="btn-start">Open Command Center chat →</button>
    <button class="btn-secondary" id="btn-docs">View docs</button>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) text += chars[Math.floor(Math.random() * chars.length)];
  return text;
}
