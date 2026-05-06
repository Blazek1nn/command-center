/**
 * extension.ts — Command Center VS Code Extension entry point.
 *
 * Activation: `onStartupFinished` — loads silently, registers commands.
 * The WebView panel is only created when the user explicitly opens it.
 *
 * Commands registered:
 *   commandCenter.newTask     — opens the chat panel (⌘⇧A)
 *   commandCenter.showActivity — focuses the sidebar activity view
 *   commandCenter.openSettings — opens VS Code settings filtered to Command Center
 */
import * as vscode from "vscode";
import { ChatPanel } from "./ChatPanel";
import { ActivityProvider } from "./ActivityProvider";
import { WelcomePanel } from "./WelcomePanel";
import { checkBackendAvailable, getDefaultBackendUrl } from "./backendClient";

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration("commandCenter");
  const backendUrl = getDefaultBackendUrl({ get: (k) => config.get(k) });

  // ── Sidebar activity provider ────────────────────────────────────────────
  const activityProvider = new ActivityProvider(context.extensionUri, backendUrl);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ActivityProvider.viewType,
      activityProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // ── Commands ─────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("commandCenter.newTask", async () => {
      // Check backend availability and warn if not running
      const available = await checkBackendAvailable(backendUrl);
      if (!available) {
        const action = await vscode.window.showWarningMessage(
          `Command Center backend not found at ${backendUrl}. Start it with: just dev`,
          "Open Docs",
          "Open Anyway"
        );
        if (action === "Open Docs") {
          void vscode.env.openExternal(
            vscode.Uri.parse("https://github.com/command-center-dev/command-center#5-minute-setup")
          );
          return;
        }
        if (action !== "Open Anyway") {
          return;
        }
      }
      ChatPanel.createOrShow(context.extensionUri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("commandCenter.showActivity", () => {
      void vscode.commands.executeCommand("commandCenter.activityView.focus");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("commandCenter.openSettings", () => {
      void vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:command-center-dev.command-center"
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("commandCenter.showWelcome", () => {
      WelcomePanel.show(context.extensionUri);
    })
  );

  // ── First-run welcome ─────────────────────────────────────────────────────
  const hasSeenWelcome = context.globalState.get<boolean>("hasSeenWelcome", false);
  if (!hasSeenWelcome) {
    void context.globalState.update("hasSeenWelcome", true);
    WelcomePanel.show(context.extensionUri);
  }

  // ── Config change listener ────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("commandCenter.backendUrl")) {
        const newUrl = vscode.workspace
          .getConfiguration("commandCenter")
          .get<string>("backendUrl") ?? "http://localhost:8000";
        activityProvider.updateBackendUrl(newUrl);
      }
    })
  );

  // ── Status bar item ───────────────────────────────────────────────────────
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "commandCenter.newTask";
  statusBarItem.tooltip = "Command Center — open agent chat (⌘⇧A)";
  context.subscriptions.push(statusBarItem);

  // Poll backend status every 30s and update status bar
  const updateStatusBar = async (): Promise<void> => {
    const url = vscode.workspace
      .getConfiguration("commandCenter")
      .get<string>("backendUrl") ?? backendUrl;
    const ok = await checkBackendAvailable(url);
    statusBarItem.text = ok ? "$(pulse) CC" : "$(circle-slash) CC";
    statusBarItem.backgroundColor = ok
      ? undefined
      : new vscode.ThemeColor("statusBarItem.warningBackground");
    statusBarItem.show();
  };

  void updateStatusBar();
  const timer = setInterval(() => void updateStatusBar(), 30_000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
}

export function deactivate(): void {
  // Cleanup handled by disposables registered in activate()
}
