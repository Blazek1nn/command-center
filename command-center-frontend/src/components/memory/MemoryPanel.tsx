"use client";

import * as React from "react";
import { Brain, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { MemoryEntry } from "@/lib/types";

interface MemoryPanelProps {
  projectId?: number | null;
}

function formatAge(isoStr: string): string {
  const now = Date.now();
  const then = new Date(isoStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (mins > 0) return `${mins}m`;
  return "agora";
}

function MemoryItem({ entry, onDelete }: { entry: MemoryEntry; onDelete: (id: number) => void }) {
  const [expanded, setExpanded] = React.useState(false);
  const preview = entry.content.slice(0, 120);
  const hasMore = entry.content.length > 120;

  return (
    <div className="group rounded-lg border border-border/40 bg-background/30 px-2.5 py-2 text-[11px] transition-colors hover:border-border/60">
      <div className="flex items-start gap-1.5">
        <div className="mt-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="rounded bg-violet-500/10 px-1 py-px font-mono text-[9px] uppercase text-violet-600 dark:text-violet-400">
              {entry.source_type}
            </span>
            <span className="text-muted-foreground">{formatAge(entry.created_at)}</span>
            {entry.project_id && (
              <span className="text-muted-foreground">· proj #{entry.project_id}</span>
            )}
          </div>
          <p className="leading-relaxed text-foreground/80">
            {expanded ? entry.content : preview}
            {hasMore && !expanded && "…"}
          </p>
          {hasMore && (
            <button
              onClick={() => setExpanded((s) => !s)}
              className="mt-0.5 flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-foreground"
            >
              {expanded ? (
                <><ChevronUp className="h-2.5 w-2.5" /> menos</>
              ) : (
                <><ChevronDown className="h-2.5 w-2.5" /> mais</>
              )}
            </button>
          )}
        </div>
        <button
          onClick={() => onDelete(entry.id)}
          className="mt-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
          aria-label="Esquecer esta memória"
          title="Esquecer esta memória"
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  );
}

export function MemoryPanel({ projectId }: MemoryPanelProps) {
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["memory", "list", projectId ?? null],
    queryFn: () => api.listMemory({ project_id: projectId ?? undefined, limit: 5 }),
    enabled: open,
    staleTime: 1000 * 60 * 2, // 2min
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteMemory(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memory"] });
    },
  });

  const entries = data?.items ?? [];

  return (
    <div className="border-t border-border/30">
      <button
        onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-muted/20"
      >
        <Brain className="h-3.5 w-3.5 text-violet-500" />
        <span className="flex-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Memória
        </span>
        {!open && entries.length === 0 && !isLoading && (
          <span className="text-[9px] text-muted-foreground/60">clique pra ver</span>
        )}
        {open ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-1.5">
          {isLoading && (
            <p className="text-[11px] italic text-muted-foreground">Carregando…</p>
          )}
          {!isLoading && entries.length === 0 && (
            <p className="text-[11px] italic text-muted-foreground">
              Nenhuma memória ainda. Após conversas com trabalho real, decisões serão registradas aqui.
            </p>
          )}
          {entries.map((e) => (
            <MemoryItem
              key={e.id}
              entry={e}
              onDelete={(id) => deleteMut.mutate(id)}
            />
          ))}
          {entries.length > 0 && (
            <p className="text-center text-[9px] text-muted-foreground/50">
              Últimas {entries.length} decisões
            </p>
          )}
        </div>
      )}
    </div>
  );
}
