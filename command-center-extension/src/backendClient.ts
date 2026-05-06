/**
 * Backend connectivity utilities for the extension host (Node.js context).
 *
 * WHY: VS Code WebViews route fetch() through an internal proxy that buffers
 * SSE/streaming responses, breaking real-time plan streaming. We solve this by
 * making all streaming calls here (Node.js, no buffering) and forwarding parsed
 * SSE events to the WebView via panel.webview.postMessage().
 */
import * as https from "https";
import * as http from "http";
import type { IncomingMessage } from "http";

// ── Health check ────────────────────────────────────────────────────────────

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

// ── SSE streaming ───────────────────────────────────────────────────────────

export interface SseCallbacks {
  onEvent: (event: string, data: unknown) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

/**
 * Stream a POST request to the backend, parse SSE events, and call callbacks.
 * Returns a cancel function — call it to abort the request mid-stream.
 */
export function streamPost(
  url: string,
  body: unknown,
  callbacks: SseCallbacks
): () => void {
  const parsed = new URL(url);
  const isHttps = parsed.protocol === "https:";
  const client = isHttps ? https : http;

  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (isHttps ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  };

  const bodyStr = JSON.stringify(body);
  let destroyed = false;

  const req = client.request(options, (res: IncomingMessage) => {
    if (res.statusCode && res.statusCode >= 400) {
      callbacks.onError(`HTTP ${res.statusCode}`);
      return;
    }

    res.setEncoding("utf8");
    let buf = "";

    res.on("data", (chunk: string) => {
      buf += chunk;
      // SSE events are separated by double newlines
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        parseSseChunk(part, callbacks);
      }
    });

    res.on("end", () => {
      // Flush any remaining buffer
      if (buf.trim()) parseSseChunk(buf, callbacks);
      if (!destroyed) callbacks.onDone();
    });

    res.on("error", (err: Error) => {
      if (!destroyed) callbacks.onError(err.message);
    });
  });

  req.on("error", (err: Error) => {
    if (!destroyed) callbacks.onError(err.message);
  });

  req.write(bodyStr);
  req.end();

  // Return cancel function
  return () => {
    destroyed = true;
    req.destroy();
  };
}

function parseSseChunk(raw: string, callbacks: SseCallbacks): void {
  const lines = raw.split("\n");
  let eventType = "";
  let dataStr = "";
  for (const line of lines) {
    if (line.startsWith("event:")) { eventType = line.slice(6).trim(); }
    if (line.startsWith("data:")) { dataStr = line.slice(5).trim(); }
  }
  if (!eventType || !dataStr) return;
  try {
    const data = JSON.parse(dataStr);
    callbacks.onEvent(eventType, data);
  } catch {
    // malformed JSON — skip
  }
}
