/**
 * Backend connectivity utilities for the extension host (Node.js context).
 * The WebView does its own fetch/SSE directly — this file is for the host process.
 */
import * as https from "https";
import * as http from "http";

export async function checkBackendAvailable(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const healthUrl = `${url}/health`;
    const client = url.startsWith("https://") ? https : http;
    const req = client.get(healthUrl, { timeout: 3000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

export function getDefaultBackendUrl(
  config: { get: (key: string) => string | undefined }
): string {
  return config.get("backendUrl") ?? "http://localhost:8000";
}
