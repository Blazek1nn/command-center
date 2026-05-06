"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2, AlertCircle, FileText } from "lucide-react";
import { useSse } from "@/hooks/use-sse";
import { safeJson, type RawSseEvent } from "@/lib/sse";
import { formatRelative } from "@/lib/utils";
import type { GlobalSseEvent } from "@/lib/types";

interface FeedItem extends GlobalSseEvent {
  id: string;
}

const ICONS: Record<string, React.ReactNode> = {
  task_started: <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />,
  task_progress: <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />,
  task_completed: <CheckCircle2 className="h-3.5 w-3.5 text-success" />,
  task_failed: <AlertCircle className="h-3.5 w-3.5 text-destructive" />,
  manager_thinking: <FileText className="h-3.5 w-3.5 text-muted-foreground" />,
  manager_report: <FileText className="h-3.5 w-3.5 text-success" />,
};

const LABELS: Record<string, string> = {
  task_started: "Task iniciada",
  task_progress: "Progresso",
  task_completed: "Task concluída",
  task_failed: "Task falhou",
  manager_thinking: "Gerente pensando",
  manager_report: "Relatório do gerente",
  plan_created: "Plano criado",
};

const decode = (raw: RawSseEvent): GlobalSseEvent | null => {
  const data = safeJson<Record<string, unknown>>(raw.data);
  if (!data) return null;
  const { timestamp, ...payload } = data as { timestamp?: string };
  return {
    type: raw.event as GlobalSseEvent["type"],
    timestamp: timestamp ?? new Date().toISOString(),
    payload: payload as Record<string, unknown>,
  };
};

export function ActivityFeed() {
  const { events, connected } = useSse<GlobalSseEvent>({ url: "/api/events", decode });

  const items: FeedItem[] = React.useMemo(
    () =>
      events
        .slice(-30)
        .reverse()
        .map((e, i) => ({ ...e, id: `${e.timestamp}-${i}` })),
    [events],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Atividade</span>
        <span
          className={
            "h-1.5 w-1.5 rounded-full " +
            (connected ? "bg-success" : "bg-muted-foreground/40")
          }
          title={connected ? "conectado" : "desconectado"}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 scrollbar-thin">
        {items.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            Nenhum evento ainda.
          </div>
        ) : (
          <ul className="space-y-1.5">
            <AnimatePresence initial={false}>
              {items.map((it) => (
                <motion.li
                  key={it.id}
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-2 rounded-lg border border-border bg-card/60 px-2.5 py-2 text-[11px] shadow-zen"
                >
                  <div className="mt-0.5">{ICONS[it.type] ?? null}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{LABELS[it.type] ?? it.type}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatRelative(it.timestamp)}
                      </span>
                    </div>
                    <div className="truncate text-muted-foreground">
                      {String(it.payload.title ?? it.payload.message ?? it.payload.error ?? "")}
                    </div>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}
