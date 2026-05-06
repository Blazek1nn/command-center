"use client";

import { useEffect, useRef, useState } from "react";
import { streamSse, safeJson, type RawSseEvent } from "@/lib/sse";

interface UseSseOptions<T> {
  url: string;
  enabled?: boolean;
  /** Decoda data string em T. Padrão: JSON.parse com fallback null. */
  decode?: (raw: RawSseEvent) => T | null;
}

interface UseSseState<T> {
  events: T[];
  connected: boolean;
  error: Error | null;
}

/**
 * Hook GET-only para conectar a um endpoint SSE (ex.: /api/events).
 * Para fluxos POST com body (ex.: /api/chat), use o useChat() ou
 * chame `streamSse` diretamente.
 */
export function useSse<T = unknown>({
  url,
  enabled = true,
  decode,
}: UseSseOptions<T>): UseSseState<T> {
  const [events, setEvents] = useState<T[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    controllerRef.current = controller;

    let cancelled = false;
    setConnected(true);
    setError(null);

    (async () => {
      try {
        for await (const raw of streamSse(url, { signal: controller.signal })) {
          if (cancelled) break;
          const decoded = decode
            ? decode(raw)
            : (safeJson<T>(raw.data) as T | null);
          if (decoded != null) {
            setEvents((prev) => [...prev, decoded as T]);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err as Error);
      } finally {
        if (!cancelled) setConnected(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, enabled, decode]);

  return { events, connected, error };
}
