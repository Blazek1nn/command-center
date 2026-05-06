import * as vscode from "vscode";
import * as path from "path";
import { checkBackendAvailable, streamPost } from "./backendClient";
import type { ExtensionMessage, WebviewMessage } from "./types";

/**
 * ChatPanel manages the main WebView panel.
 * Singleton pattern — only one panel exists at a time (VS Code will focus it
 * if the user opens a second one).
 *
 * SSE proxy: all streaming calls are made by the extension host (Node.js) and
 * forwarded to the WebView via postMessage — this bypasses VS Code's WebView
 * fetch proxy which buffers streaming responses.
 */
export class ChatPanel {
  public static current: ChatPanel | undefined;
  private static readonly viewType = "commandCenter.chat";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _cancelStream: (() => void) | null = null;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.webview.html = this._getHtml();
    this._bindMessages();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Re-send init whenever panel becomes visible again (e.g. user switches tabs)
    this._panel.onDidChangeViewState(
      () => {
        if (this._panel.visible) {
          void this._sendInit();
        }
      },
      null,
      this._disposables
    );

    // Re-render when VS Code theme changes
    vscode.window.onDidChangeActiveColorTheme(
      () => {
        const kind = this._resolveThemeKind();
        void this._post({ type: "theme", kind });
      },
      null,
      this._disposables
    );
  }

  // ── Public API ────────────────────────────────────────────────────────────

  public static createOrShow(extensionUri: vscode.Uri): ChatPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (ChatPanel.current) {
      ChatPanel.current._panel.reveal(column);
      return ChatPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      ChatPanel.viewType,
      "Command Center",
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
      }
    );

    ChatPanel.current = new ChatPanel(panel, extensionUri);
    return ChatPanel.current;
  }

  public dispose(): void {
    this._cancelStream?.();
    this._cancelStream = null;
    ChatPanel.current = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables = [];
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _bindMessages(): void {
    this._panel.webview.onDidReceiveMessage(
      async (msg: WebviewMessage) => {
        switch (msg.type) {
          case "ready":
            await this._sendInit();
            break;

          case "openExternal":
            void vscode.env.openExternal(vscode.Uri.parse(msg.url));
            break;

          case "copyToClipboard":
            void vscode.env.clipboard.writeText(msg.text);
            void vscode.window.showInformationMessage("Copied to clipboard");
            break;

          case "checkBackend": {
            const url = this._backendUrl();
            const available = await checkBackendAvailable(url);
            void this._post({ type: "backendStatus", available });
            break;
          }

          // ── SSE proxy ──────────────────────────────────────────────────

          case "chatStream": {
            // Cancel any existing stream first
            this._cancelStream?.();
            const baseUrl = this._backendUrl();
            this._cancelStream = streamPost(
              `${baseUrl}/api/chat`,
              {
                message: msg.message,
                conversation_id: msg.conversationId,
                plan_only: true,
              },
              {
                onEvent: (event, data) => {
                  void this._post({ type: "sseEvent", event, data });
                },
                onDone: () => {
                  this._cancelStream = null;
                  void this._post({ type: "sseDone" });
                },
                onError: (error) => {
                  this._cancelStream = null;
                  void this._post({ type: "sseError", error });
                },
              }
            );
            break;
          }

          case "dispatchStream": {
            this._cancelStream?.();
            const baseUrl = this._backendUrl();
            this._cancelStream = streamPost(
              `${baseUrl}/api/dispatch`,
              {
                tasks: msg.tasks,
                conversation_id: msg.conversationId,
                manager_model: msg.managerModel,
                original_message: msg.originalMessage,
              },
              {
                onEvent: (event, data) => {
                  void this._post({ type: "sseEvent", event, data });
                },
                onDone: () => {
                  this._cancelStream = null;
                  void this._post({ type: "sseDone" });
                },
                onError: (error) => {
                  this._cancelStream = null;
                  void this._post({ type: "sseError", error });
                },
              }
            );
            break;
          }

          case "cancelStream": {
            this._cancelStream?.();
            this._cancelStream = null;
            break;
          }
        }
      },
      null,
      this._disposables
    );
  }

  private async _sendInit(): Promise<void> {
    const projectDir = this._resolveProjectDir();
    const projectName = projectDir ? path.basename(projectDir) : "unknown";
    const backendUrl = this._backendUrl();
    const available = await checkBackendAvailable(backendUrl);

    void this._post({
      type: "init",
      projectDir,
      projectName,
      backendUrl,
    });
    void this._post({ type: "backendStatus", available });
    void this._post({ type: "theme", kind: this._resolveThemeKind() });
  }

  private _resolveProjectDir(): string {
    const config = vscode.workspace.getConfiguration("commandCenter");
    const autoDetect = config.get<boolean>("autoDetectProject") ?? true;
    if (!autoDetect) return "";

    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : "";
  }

  private _backendUrl(): string {
    const config = vscode.workspace.getConfiguration("commandCenter");
    return config.get<string>("backendUrl") ?? "http://localhost:8000";
  }

  private _resolveThemeKind(): "light" | "dark" | "high-contrast" {
    const kind = vscode.window.activeColorTheme.kind;
    if (kind === vscode.ColorThemeKind.Light) return "light";
    if (kind === vscode.ColorThemeKind.HighContrast) return "high-contrast";
    return "dark";
  }

  private async _post(msg: ExtensionMessage): Promise<void> {
    await this._panel.webview.postMessage(msg);
  }

  private _getHtml(): string {
    const webview = this._panel.webview;

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "chat.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "chat.css")
    );

    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             img-src ${webview.cspSource} data:;
             script-src 'nonce-${nonce}';
             style-src ${webview.cspSource} 'unsafe-inline';" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Command Center</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
