"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamPhase } from "@/stores/chat-store";

interface ExecutionStepperProps {
  phase: StreamPhase;
  taskCount: number;
  doneCount: number;
}

type StepKey = "planning" | "approval" | "executing" | "reporting" | "done";

interface StepDef {
  key: StepKey;
  label: string;
}

const STEPS: StepDef[] = [
  { key: "planning", label: "Planejando" },
  { key: "approval", label: "Aprovação" },
  { key: "executing", label: "Executando" },
  { key: "reporting", label: "Relatório" },
  { key: "done", label: "Pronto" },
];

function phaseToActiveStep(phase: StreamPhase): StepKey | null {
  switch (phase) {
    case "thinking":
    case "planning":
      return "planning";
    case "awaiting_approval":
      return "approval";
    case "executing":
      return "executing";
    case "reporting":
      return "reporting";
    case "done":
      return "done";
    case "reconnecting":
      // mantém o anterior visualmente, mas com spinner
      return "executing";
    default:
      return null;
  }
}

export function ExecutionStepper({ phase, taskCount, doneCount }: ExecutionStepperProps) {
  const active = phaseToActiveStep(phase);
  if (active === null) return null;

  const activeIdx = STEPS.findIndex((s) => s.key === active);

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/60 bg-card/40 px-4 py-3 backdrop-blur"
    >
      <div className="flex items-center gap-1.5 text-xs">
        {STEPS.map((step, idx) => {
          const isActive = idx === activeIdx;
          const isPast = idx < activeIdx;
          const isFuture = idx > activeIdx;

          return (
            <React.Fragment key={step.key}>
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-1 transition-all",
                  isActive && "bg-primary/15 text-primary font-medium",
                  isPast && "text-muted-foreground/80",
                  isFuture && "text-muted-foreground/40",
                )}
              >
                <div
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-mono",
                    isActive && "bg-primary text-primary-foreground",
                    isPast && "bg-muted-foreground/30 text-foreground",
                    isFuture && "border border-current/40",
                  )}
                >
                  {isPast ? (
                    <Check className="h-2.5 w-2.5" />
                  ) : isActive && phase !== "awaiting_approval" && phase !== "done" ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : (
                    idx + 1
                  )}
                </div>
                <span className="text-[11px]">{step.label}</span>
                {step.key === "executing" && taskCount > 0 && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {doneCount}/{taskCount}
                  </span>
                )}
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-px w-3 transition-colors",
                    idx < activeIdx ? "bg-muted-foreground/30" : "bg-border/40",
                  )}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </motion.div>
  );
}
