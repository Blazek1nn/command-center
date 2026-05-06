import * as vscode from "vscode";
import { checkBackendAvailable } from "./backendClient";
import { ChatPanel } from "./ChatPanel";

/**
 * ActivityProvider drives the sidebar WebView ("Agent Activity").
 * Shows live task status for the current workspace.
 * Opens automatically on extension activation when a workspace is open.
 */
export class ActivityProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "commandCenter.activityView";

  private _view?: vscode.WebviewView;
  private _backendUrl: string;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    backendUrl: string
  ) {
    this._backendUrl = backendUrl;
  }

  public updateBackendUrl(url: string): void {
    this._backendUrl = url;
    if (this._view) {
      void this._view.webview.postMessage({ type: "backendUrl", url });
    }
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, "media")],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    // Auto-open chat panel when the user clicks the CC sidebar icon.
    // Only opens if chat isn't already visible — doesn't re-open if user closed it intentionally.
    const openChatIfNeeded = () => {
      if (!ChatPanel.current) {
        ChatPanel.createOrShow(this._extensionUri);
      }
    };

    // First resolve = user clicked the CC icon for the first time this session
    setTimeout(openChatIfNeeded, 150);

    // Subsequent clicks: sidebar transitions from hidden → visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) openChatIfNeeded();
    });

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "checkBackend") {
        const available = await checkBackendAvailable(this._backendUrl);
        void webviewView.webview.postMessage({ type: "backendStatus", available, url: this._backendUrl });
      }
    });

    // Send backend URL on first load
    void webviewView.webview.postMessage({
      type: "init",
      backendUrl: this._backendUrl,
    });
  }

  private _getHtml(webview: vscode.Webview): string {
    const activityUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "activity.js")
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
             connect-src http://localhost:* https://localhost:*;
             img-src ${webview.cspSource} data:;
             script-src 'nonce-${nonce}';
             style-src ${webview.cspSource} 'unsafe-inline';" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Agent Activity</title>
</head>
<body class="activity-sidebar">
  <div id="root"></div>
  <script nonce="${nonce}" src="${activityUri}"></script>
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
