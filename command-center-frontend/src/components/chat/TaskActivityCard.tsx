"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  FileEdit,
  FilePlus,
  FileX,
  Folder,
  GitPullRequest,
  Loader2,
  Search,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileTouch } from "@/lib/types";
import type { TaskRun, WorkerAction } from "@/stores/chat-store";

interface TaskActivityCardProps {
  task: TaskRun;
  defaultExpanded?: boolean;
}

function toolIcon(tool: string) {
  switch (tool) {
    case "Write": return FilePlus;
    case "Edit": return FileEdit;
    case "MultiEdit": return FileEdit;
    case "NotebookEdit": return FileEdit;
    case "Read": return Folder;
    case "Bash": return Terminal;
    case "Grep":
    case "Glob": return Search;
    default: return Terminal;
  }
}

function operationIcon(op: FileTouch["operation"]) {
  switch (op) {
    case "create": return FilePlus;
    case "modify": return FileEdit;
    case "delete": return FileX;
  }
}

function operationColor(op: FileTouch["operation"]) {
  switch (op) {
    case "create": return "text-emerald-600 dark:text-emerald-400";
    case "modify": return "text-amber-600 dark:text-amber-400";
    case "delete": return "text-rose-600 dark:text-rose-400";
  }
}

function shortPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 3) return normalized;
  return ".../" + parts.slice(-3).join("/");
}

// Memo: ChatStream re-renderiza TODOS os cards quando UM evento SSE chega
// (Object.values(tasks) muda de referência). Comparamos por shallow equal nos
// fields que afetam render — se o objeto `task` é a mesma referência, skip.
// Como o store usa imutabilidade (upsertTask cria novo TaskRun), referência
// muda só pra task afetada → bingo.
export const TaskActivityCard = React.memo(TaskActivityCardInner, (prev, next) => {
  return prev.task === next.task && prev.defaultExpanded === next.defaultExpanded;
});

function TaskActivityCardInner({ task, defaultExpanded }: TaskActivityCardProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded ?? task.status === "running");

  // Auto-expandir quando começa a rodar
  React.useEffect(() => {
    if (task.status === "running") setExpanded(true);
  }, [task.status]);

  const isRunning = task.status === "running";
  const isDone = task.status === "done";
  const isFailed = task.status === "failed";

  const statusBadge =
    task.status === "running" ? (
      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        executando
      </span>
    ) : isDone ? (
      <span className="text-emerald-600 dark:text-emerald-400">concluído</span>
    ) : isFailed ? (
      <span className="text-rose-600 dark:text-rose-400">falhou</span>
    ) : task.status === "cancelled" ? (
      <span className="text-muted-foreground">cancelado</span>
    ) : (
      <span className="text-muted-foreground">pendente</span>
    );

  const hasActivity = task.actions.length > 0 || task.files_touched.length > 0;

  return (
    <motion.div
      layout
      className={cn(
        "rounded-xl border bg-card/40 backdrop-blur",
        isRunning && "border-amber-500/30 bg-amber-500/5",
        isDone && "border-border/60",
        isFailed && "border-rose-500/40 bg-rose-500/5",
      )}
    >
      <button
        onClick={() => setExpanded((s) => !s)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/20"
      >
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
          {String(task.index + 1).padStart(2, "0")}
        </span>
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-medium">{task.title}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="rounded bg-muted/50 px-1.5 py-px font-mono uppercase">
              {task.model}
            </span>
            {task.employee && <span>· {task.employee}</span>}
            {task.project && <span>· {task.project}</span>}
            <span>·</span>
            {statusBadge}
          </div>
        </div>
        {task.files_touched.length > 0 && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {task.files_touched.length} arq
          </span>
        )}
        {task.actions.length > 0 && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {task.actions.length} ações
          </span>
        )}
        {task.pr_url && (
          <a
            href={task.pr_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/8 px-2 py-0.5 text-[10px] text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400"
            title={task.pr_url}
          >
            <GitPullRequest className="h-2.5 w-2.5" />
            PR
          </a>
        )}
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-border/40"
          >
            <div className="space-y-3 px-4 py-3">
              {/* File changes */}
              {task.files_touched.length > 0 && (
                <FileChangesList files={task.files_touched} />
              )}

              {/* Activity stream */}
              {task.actions.length > 0 && (
                <ActivityStream actions={task.actions} />
              )}

              {!hasActivity && task.status === "running" && (
                <p className="text-[12px] italic text-muted-foreground">
                  Worker iniciando…
                </p>
              )}

              {!hasActivity && (isDone || isFailed) && (
                <p className="text-[12px] italic text-muted-foreground">
                  Sem actions registradas. Worker pode ter respondido só com texto.
                </p>
              )}

              {/* Error — badge específico se foi permission_blocked (Sprint 3) */}
              {task.error && task.permission_blocked && (
                <div className="rounded border border-amber-500/40 bg-amber-500/8 px-3 py-2.5 text-[12px]">
                  <div className="mb-1 flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
                    🔒 Permission prompt travou o worker
                  </div>
                  <p className="text-foreground/80 leading-relaxed">{task.error}</p>
                  {task.project && (
                    <a
                      href={`/projects?name=${encodeURIComponent(task.project)}`}
                      className="mt-2 inline-flex items-center gap-1 text-amber-700 underline hover:text-amber-800 dark:text-amber-400"
                    >
                      Configurar MCPs do projeto →
                    </a>
                  )}
                </div>
              )}
              {task.error && !task.permission_blocked && (
                <pre className="overflow-x-auto rounded border border-rose-500/30 bg-rose-500/5 px-2.5 py-2 text-[11px] text-rose-600 dark:text-rose-300">
                  {task.error}
                </pre>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function FileChangesList({ files }: { files: FileTouch[] }) {
  // Dedup por path (worker pode editar o mesmo arquivo várias vezes)
  const seen = new Map<string, FileTouch>();
  for (const f of files) {
    if (!seen.has(f.path)) seen.set(f.path, f);
  }
  const unique = Array.from(seen.values());

  return (
    <div>
      <div className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        Arquivos modificados ({unique.length})
      </div>
      <div className="space-y-1">
        {unique.map((f) => {
          const Icon = operationIcon(f.operation);
          return (
            <div
              key={f.path}
              className="flex items-center gap-2 rounded border border-border/40 bg-background/40 px-2 py-1.5 text-[12px]"
            >
              <Icon className={cn("h-3.5 w-3.5 shrink-0", operationColor(f.operation))} />
              <span className="truncate font-mono text-[11px]" title={f.path}>
                {shortPath(f.path)}
              </span>
              <span className="ml-auto rounded bg-muted/40 px-1.5 py-px text-[9px] uppercase tracking-wide text-muted-foreground">
                {f.tool}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityStream({ actions }: { actions: WorkerAction[] }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        Stream de atividade ({actions.length})
      </div>
      <ol className="max-h-48 space-y-0.5 overflow-y-auto rounded border border-border/40 bg-background/40 px-2 py-1.5 font-mono text-[10.5px] scrollbar-thin">
        {actions.map((a, idx) => {
          const Icon = toolIcon(a.tool);
          return (
            <li key={idx} className="flex items-center gap-1.5 text-foreground/80">
              <Icon className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">{a.tool}</span>
              <span className="text-foreground/60">·</span>
              <span className="truncate">{a.summary}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
