/**
 * Messages exchanged between the VS Code extension host and WebView panels.
 * All communication goes through postMessage — keep types in sync on both sides.
 */

// Extension → WebView
export type ExtensionMessage =
  | { type: "init"; projectDir: string; projectName: string; backendUrl: string }
  | { type: "backendStatus"; available: boolean }
  | { type: "theme"; kind: "light" | "dark" | "high-contrast" }
  // SSE proxy — extension host streams backend events to the WebView
  | { type: "sseEvent"; event: string; data: unknown }
  | { type: "sseDone" }
  | { type: "sseError"; error: string };

// WebView → Extension
export type WebviewMessage =
  | { type: "ready" }
  | { type: "openExternal"; url: string }
  | { type: "copyToClipboard"; text: string }
  | { type: "checkBackend" }
  | { type: "getProjectDir" }
  // SSE proxy — WebView asks extension host to start a streaming call
  | { type: "chatStream"; message: string; conversationId: number | null }
  | { type: "dispatchStream"; tasks: unknown[]; conversationId: number | null; managerModel: string; originalMessage: string }
  | { type: "cancelStream" };

export interface BackendStatus {
  available: boolean;
  url: string;
  checkedAt: number;
}
