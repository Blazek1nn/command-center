/**
 * Messages exchanged between the VS Code extension host and WebView panels.
 * All communication goes through postMessage — keep types in sync on both sides.
 */

// Extension → WebView
export type ExtensionMessage =
  | { type: "init"; projectDir: string; projectName: string; backendUrl: string }
  | { type: "backendStatus"; available: boolean }
  | { type: "theme"; kind: "light" | "dark" | "high-contrast" };

// WebView → Extension
export type WebviewMessage =
  | { type: "ready" }
  | { type: "openExternal"; url: string }
  | { type: "copyToClipboard"; text: string }
  | { type: "checkBackend" }
  | { type: "getProjectDir" };

export interface BackendStatus {
  available: boolean;
  url: string;
  checkedAt: number;
}
