"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, Edit3, GitPullRequest, Loader2, Play, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ModelAlias, Plan, TaskSpec } from "@/lib/types";
import { api } from "@/lib/api";
import { analytics } from "@/lib/analytics";
import { useQuery } from "@tanstack/react-query";

const MODELS: ModelAlias[] = ["haiku", "sonnet", "opus"];

const MODEL_BADGE: Record<ModelAlias, string> = {
  haiku: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  sonnet: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  opus: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
};

interface PlanEditorProps {
  plan: Plan;
  onDispatch: (tasks: TaskSpec[], execution_mode: "parallel" | "sequential") => void;
  onCancel: () => void;
  busy?: boolean;
}

/** Formato custo abreviado pra UI compacta. */
function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

export function PlanEditor({ plan, onDispatch, onCancel: _onCancel, busy }: PlanEditorProps) {
  const onCancel = React.useCallback(() => {
    analytics.track("plan_rejected", { project: plan.tasks[0]?.project ?? null });
    _onCancel();
  }, [_onCancel, plan.tasks]);
  const [tasks, setTasks] = React.useState<TaskSpec[]>(() =>
    plan.tasks.map((t) => ({ ...t })),
  );
  const [executionMode, setExecutionMode] = React.useState(plan.execution_mode);
  const [expandedIdx, setExpandedIdx] = React.useState<number | null>(null);
  const [showCritique, setShowCritique] = React.useState(false);

  // Custo estimado — recalcula via endpoint quando tasks mudam.
  // Hash estável (sem JSON.stringify): só dispara quando model OU tamanho do
  // prompt mudam significativamente. Reduz refetch de cada keystroke pra
  // mudanças reais (testar em React Query DevTools).
  const tasksHash = React.useMemo(
    () => tasks.map((t) => `${t.model}:${t.prompt.length}`).join("|"),
    [tasks],
  );
  const { data: estimate, isLoading: estimating } = useQuery({
    queryKey: ["dispatch-estimate", tasksHash],
    queryFn: () => api.estimateDispatch(tasks),
    staleTime: 1000 * 30,
    enabled: tasks.length > 0,
  });

  const update = (idx: number, patch: Partial<TaskSpec>) => {
    setTasks((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const remove = (idx: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== idx).map((t) => ({
      ...t,
      // Reajusta depends_on que apontavam pra idx removido (best-effort)
      depends_on: t.depends_on.filter((d) => d !== idx).map((d) => (d > idx ? d - 1 : d)),
    })));
  };

  const addTask = () => {
    setTasks((prev) => [
      ...prev,
      {
        title: "Nova task",
        prompt: "",
        project: prev[prev.length - 1]?.project ?? null,
        model: "sonnet",
        specialty: "code",
        depends_on: [],
      },
    ]);
    setExpandedIdx(tasks.length); // expande o novo
  };

  const move = (idx: number, dir: "up" | "down") => {
    setTasks((prev) => {
      const next = [...prev];
      const target = dir === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });
  };

  // Track whether user edited the plan before approving
  const originalTasksRef = React.useRef(plan.tasks.map((t) => t.title).join("|"));
  const wasEdited = tasks.map((t) => t.title).join("|") !== originalTasksRef.current;

  const dispatchHandler = () => {
    if (tasks.length === 0 || busy) return;
    analytics.track("plan_approved", {
      n_tasks: tasks.length,
      project: tasks[0]?.project ?? null,
      was_edited: wasEdited,
      execution_mode: executionMode,
    });
    onDispatch(tasks, executionMode);
  };

  const totalCost = estimate?.total_usd;
  const costColor =
    totalCost == null
      ? ""
      : totalCost < 0.05
        ? "text-emerald-500"
        : totalCost < 0.30
          ? "text-amber-500"
          : "text-rose-500";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="rounded-2xl border border-primary/30 bg-card/80 p-5 shadow-zen backdrop-blur"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-primary">
            <Edit3 className="h-3 w-3" />
            <span>Plano sugerido</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{tasks.length} tasks</span>
          </div>
          <p className="font-display text-base leading-snug text-foreground">
            {plan.understanding}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          aria-label="Cancelar"
          disabled={busy}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {plan.critique && (
        <div className="mb-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <button
            onClick={() => setShowCritique((s) => !s)}
            className="flex w-full items-center justify-between text-left text-[11px] uppercase tracking-wide text-muted-foreground"
          >
            <span>Pensamento do gerente</span>
            {showCritique ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showCritique && (
            <p className="mt-2 text-[12px] leading-relaxed text-foreground/80">{plan.critique}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        {tasks.map((t, idx) => (
          <TaskRow
            key={idx}
            idx={idx}
            task={t}
            estimateCost={estimate?.per_task[idx]}
            isExpanded={expandedIdx === idx}
            onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
            onUpdate={(patch) => update(idx, patch)}
            onRemove={() => remove(idx)}
            onMoveUp={() => move(idx, "up")}
            onMoveDown={() => move(idx, "down")}
            canMoveUp={idx > 0}
            canMoveDown={idx < tasks.length - 1}
            disabled={busy}
          />
        ))}
        {tasks.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
            Sem tasks. Adicione uma ou cancele.
          </div>
        )}
      </div>

      <button
        onClick={addTask}
        disabled={busy}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
      >
        <Plus className="h-3 w-3" /> Adicionar task
      </button>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4">
        <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="exec-mode"
              checked={executionMode === "parallel"}
              onChange={() => setExecutionMode("parallel")}
              disabled={busy}
              className="h-3 w-3"
            />
            Paralelo
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="exec-mode"
              checked={executionMode === "sequential"}
              onChange={() => setExecutionMode("sequential")}
              disabled={busy}
              className="h-3 w-3"
            />
            Sequencial
          </label>
          <span className="text-border">·</span>
          <span>
            {estimating ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> calculando…
              </span>
            ) : totalCost != null ? (
              <>
                Custo:{" "}
                <span className={cn("font-mono font-medium", costColor)}>
                  {formatCost(totalCost)}
                </span>
              </>
            ) : null}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={dispatchHandler}
            disabled={tasks.length === 0 || busy}
            className="gap-1.5"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Despachar
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

interface TaskRowProps {
  idx: number;
  task: TaskSpec;
  estimateCost: number | undefined;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<TaskSpec>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled?: boolean;
}

function TaskRow({
  idx,
  task,
  estimateCost,
  isExpanded,
  onToggle,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  disabled,
}: TaskRowProps) {
  return (
    <div className="rounded-lg border border-border bg-background/40 transition-colors hover:border-border/80">
      {/* Header (sempre visível) */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
          {String(idx + 1).padStart(2, "0")}
        </span>
        <select
          value={task.model}
          onChange={(e) => onUpdate({ model: e.target.value as ModelAlias })}
          disabled={disabled}
          className={cn(
            "rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide focus:outline-none focus:ring-1 focus:ring-primary/30",
            MODEL_BADGE[task.model],
          )}
        >
          {MODELS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <button
          onClick={onToggle}
          className="flex-1 truncate text-left text-[13px] hover:text-primary"
          disabled={disabled}
        >
          {task.title || <span className="italic text-muted-foreground">(sem título)</span>}
        </button>
        {estimateCost != null && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {formatCost(estimateCost)}
          </span>
        )}
        <div className="flex items-center gap-0.5">
          <button
            onClick={onMoveUp}
            disabled={disabled || !canMoveUp}
            className="rounded p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-30"
            aria-label="Mover acima"
            title="Mover acima"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={disabled || !canMoveDown}
            className="rounded p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-30"
            aria-label="Mover abaixo"
            title="Mover abaixo"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
          <button
            onClick={onRemove}
            disabled={disabled}
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            aria-label="Remover"
            title="Remover task"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Detalhes (expansível) */}
      {isExpanded && (
        <div className="space-y-2 border-t border-border/50 px-3 pb-3 pt-2">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
              Título
            </label>
            <input
              type="text"
              value={task.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
              disabled={disabled}
              className="w-full rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
              Prompt
            </label>
            <Textarea
              value={task.prompt}
              onChange={(e) => onUpdate({ prompt: e.target.value })}
              disabled={disabled}
              rows={4}
              className="w-full font-mono text-[12px] leading-relaxed"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
                Projeto
              </label>
              <input
                type="text"
                value={task.project ?? ""}
                onChange={(e) => onUpdate({ project: e.target.value || null })}
                placeholder="(opcional)"
                disabled={disabled}
                className="w-full rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
                Especialidade
              </label>
              <input
                type="text"
                value={task.specialty}
                onChange={(e) => onUpdate({ specialty: e.target.value })}
                disabled={disabled}
                className="w-full rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Frente ζ — integrações */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
            <label className="flex cursor-pointer items-center gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={task.auto_pr ?? false}
                onChange={(e) => onUpdate({ auto_pr: e.target.checked })}
                disabled={disabled}
                className="h-3.5 w-3.5 rounded"
              />
              <GitPullRequest className="h-3 w-3 text-muted-foreground" />
              <span>Auto-PR ao concluir</span>
            </label>
            <div className="flex flex-1 min-w-0 items-center gap-2">
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                Linear
              </span>
              <input
                type="text"
                value={task.linear_issue_id ?? ""}
                onChange={(e) => onUpdate({ linear_issue_id: e.target.value || null })}
                placeholder="ABC-123 (opcional)"
                disabled={disabled}
                className="flex-1 rounded-md border border-border/60 bg-background px-2 py-1 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Auto-dispatch toggle helpers — persistido em localStorage
const AUTO_DISPATCH_KEY = "cc.auto_dispatch";

export function loadAutoDispatch(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AUTO_DISPATCH_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveAutoDispatch(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTO_DISPATCH_KEY, String(value));
  } catch {
    // ignore
  }
}
