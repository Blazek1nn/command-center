/**
 * Helpers de SSE — usamos `fetch` + reader manual em vez de EventSource
 * porque o backend é POST (com body JSON) na rota /api/chat.
 *
 * Para a rota GET /api/events o EventSource nativo do browser também
 * funcionaria, mas mantemos uma única implementação para uniformidade.
 */
import { API_URL } from "./api";

export interface RawSseEvent {
  /** Nome após `event:`. SSE default é "message" se omitido. */
  event: string;
  /** Conteúdo do `data:` já concatenado, sem o prefixo. */
  data: string;
}

export interface StreamSseOptions {
  signal?: AbortSignal;
  method?: string;
  body?: BodyInit | null;
  headers?: Record<string, string>;
  /** Se retornar true, tenta reconectar UMA vez quando a conexão cai sem completar.
   *  Avaliado no momento da falha — útil para condicionar a "antes de plan_created". */
  shouldAutoRetry?: () => boolean;
  /** Atraso entre tentativa original e retry. Default 2000ms. */
  retryDelayMs?: number;
  /** Callback chamado JUST antes do retry. Útil pra UI mostrar "reconectando…". */
  onRetry?: () => void;
}

/**
 * Faz uma requisição (POST/GET) e itera sobre os eventos SSE recebidos.
 * Yield-a um RawSseEvent por evento completo (delimitado por linha em branco).
 *
 * Suporta UM retry condicional: se a conexão cai e shouldAutoRetry() retorna true,
 * espera retryDelayMs e tenta de novo. Aborts (AbortError) NUNCA são retried.
 */
export async function* streamSse(
  url: string,
  options: StreamSseOptions = {},
): AsyncGenerator<RawSseEvent, void, unknown> {
  const maxAttempts = 2; // original + 1 retry
  let attempt = 0;
  while (true) {
    try {
      yield* doStream(url, options);
      return;
    } catch (err) {
      attempt++;
      if (attempt >= maxAttempts) throw err;
      const e = err as Error;
      if (e.name === "AbortError") throw err; // user cancelou — não retry
      if (!options.shouldAutoRetry?.()) throw err;
      options.onRetry?.();
      // Espera abort-aware: se o user cancelar durante o atraso, abortamos
      // imediatamente em vez de esperar o timeout completo e fazer um fetch
      // doomed.
      const delayMs = options.retryDelayMs ?? 2000;
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, delayMs);
        const onAbort = () => {
          clearTimeout(t);
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        };
        if (options.signal?.aborted) {
          onAbort();
          return;
        }
        options.signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
  }
}

async function* doStream(
  url: string,
  options: StreamSseOptions,
): AsyncGenerator<RawSseEvent, void, unknown> {
  const fullUrl = url.startsWith("http") ? url : `${API_URL}${url}`;

  const res = await fetch(fullUrl, {
    method: options.method ?? "GET",
    headers: {
      Accept: "text/event-stream",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    body: options.body,
    signal: options.signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`SSE request failed: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let sepIdx: number;
      while ((sepIdx = findSeparator(buffer)) !== -1) {
        const rawEvent = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx).replace(/^(\r?\n){1,2}/, "");
        const parsed = parseEventBlock(rawEvent);
        if (parsed) yield parsed;
      }
    }

    const tail = buffer.trim();
    if (tail) {
      const parsed = parseEventBlock(tail);
      if (parsed) yield parsed;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }
}

function findSeparator(buf: string): number {
  const a = buf.indexOf("\n\n");
  const b = buf.indexOf("\r\n\r\n");
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}

function parseEventBlock(block: string): RawSseEvent | null {
  if (!block.trim()) return null;
  let event = "message";
  const dataLines: string[] = [];
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimStart();
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

export function safeJson<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
