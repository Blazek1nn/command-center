"use client";

import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn, formatCost, formatDuration } from "@/lib/utils";
import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { TaskRun } from "@/stores/chat-store";
import type { TaskSpec } from "@/lib/types";

interface TaskCardProps {
  spec: TaskSpec;
  run: TaskRun | undefined;
}

const MODEL_BADGE: Record<string, "default" | "info" | "warning"> = {
  opus: "warning",
  sonnet: "default",
  haiku: "info",
};

export function TaskCard({ spec, run }: TaskCardProps) {
  const status = run?.status ?? "pending";
  const progressValue =
    status === "done" || status === "failed" || status === "cancelled"
      ? 100
      : status === "running"
        ? 60
        : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "group rounded-2xl border border-border bg-card p-4 shadow-zen transition-all",
        status === "running" && "border-primary/40 ring-1 ring-primary/15",
        status === "done" && "border-success/30",
        status === "failed" && "border-destructive/35",
      )}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-[15px] font-medium leading-snug">{spec.title}</h4>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant={MODEL_BADGE[spec.model] ?? "default"} className="rounded-full">
              {spec.model}
            </Badge>
            {spec.project && (
              <Badge variant="muted" className="rounded-full font-mono text-[10px]">
                {spec.project}
              </Badge>
            )}
            <Badge variant="outline" className="rounded-full text-[10px]">
              {spec.specialty}
            </Badge>
            {spec.depends_on.length > 0 && (
              <Badge variant="muted" className="rounded-full text-[10px]">
                <ChevronRight className="h-3 w-3" /> dep #{spec.depends_on.join(", #")}
              </Badge>
            )}
          </div>
        </div>
        <StatusPill status={status} />
      </div>

      <div className="mt-3.5">
        <Progress value={progressValue} />
      </div>

      {run?.employee && (
        <div className="mt-2.5 text-[11px] text-muted-foreground">
          executando como{" "}
          <span className="font-mono text-foreground">{run.employee}</span>
        </div>
      )}

      {run?.output && (
        <details className="mt-2.5 group/o" open={run.status === "done"}>
          <summary className="cursor-pointer text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground">
            output
          </summary>
          <div className="prose-chat mt-2 max-h-72 overflow-auto rounded-lg bg-secondary/30 p-3.5 text-sm scrollbar-thin">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {run.output.slice(-3000)}
            </ReactMarkdown>
          </div>
        </details>
      )}

      {run?.error && (
        <div className="mt-2.5 rounded-lg border border-destructive/25 bg-destructive/8 p-2.5 font-mono text-[11px] leading-relaxed text-destructive/90">
          {run.error}
        </div>
      )}

      {(run?.cost_usd != null || run?.duration_ms != null || (run?.input_tokens ?? 0) > 0) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border/60 pt-2.5 font-mono text-[11px] text-muted-foreground">
          <span title="custo">{formatCost(run?.cost_usd)}</span>
          {((run?.input_tokens ?? 0) + (run?.output_tokens ?? 0)) > 0 && (
            <span title="input → output tokens">
              ↓{run?.input_tokens ?? 0} ↑{run?.output_tokens ?? 0}
            </span>
          )}
          <span title="duração">{formatDuration(run?.duration_ms)}</span>
        </div>
      )}
    </motion.div>
  );
}
