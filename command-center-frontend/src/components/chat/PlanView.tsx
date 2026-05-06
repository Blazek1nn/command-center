"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { GitBranch, Workflow, Clock, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TaskCard } from "@/components/chat/TaskCard";
import { BrushStroke } from "@/components/sumi";
import type { Plan } from "@/lib/types";
import type { TaskRun } from "@/stores/chat-store";

interface PlanViewProps {
  plan: Plan;
  tasks: Record<number, TaskRun>;
}

export function PlanView({ plan, tasks }: PlanViewProps) {
  const runs = Object.values(tasks);
  const running = runs.filter((t) => t.status === "running").length;
  const done = runs.filter((t) => t.status === "done").length;
  const total = runs.length;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative overflow-hidden rounded-2xl border border-border bg-card p-7 shadow-zen"
    >
      <Image
        src="/assets/bg-card-sakura.png"
        alt=""
        fill
        className="pointer-events-none object-cover object-right opacity-30"
        sizes="800px"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-card via-card/90 to-card/20" />
      <header className="relative z-10 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              <span>plano do gerente</span>
              <BrushStroke variant="splash" className="h-2.5 w-12" />
            </div>
            <p className="mt-2 font-display text-lg font-medium leading-snug text-foreground">
              {plan.understanding}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <Badge
              variant={plan.execution_mode === "parallel" ? "default" : "muted"}
              className="rounded-full"
            >
              {plan.execution_mode === "parallel" ? (
                <>
                  <Workflow className="h-3 w-3" /> paralelo
                </>
              ) : (
                <>
                  <GitBranch className="h-3 w-3" /> sequencial
                </>
              )}
            </Badge>
            {running > 1 && (
              <Badge variant="default" className="rounded-full font-mono">
                <Zap className="h-3 w-3" /> {running} rodando
              </Badge>
            )}
            <Badge variant="muted" className="rounded-full">
              <Clock className="h-3 w-3" /> ~{plan.estimated_minutes}min
            </Badge>
            {total > 0 && (
              <Badge variant="muted" className="rounded-full font-mono">
                {done}/{total}
              </Badge>
            )}
          </div>
        </div>
        <BrushStroke variant="long" className="mt-4 h-[5px] opacity-30" />
      </header>

      {plan.critique && (
        <div className="relative z-10 mb-4 rounded-lg border border-border/40 bg-muted/20 px-3.5 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground/70">
            Análise crítica do gerente
          </div>
          {plan.critique}
        </div>
      )}

      <div className="relative z-10 grid gap-3 sm:grid-cols-2">
        {plan.tasks.map((spec, idx) => (
          <TaskCard key={idx} spec={spec} run={tasks[idx]} />
        ))}
      </div>
    </motion.section>
  );
}
