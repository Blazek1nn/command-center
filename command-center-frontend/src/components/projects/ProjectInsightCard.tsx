"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Folder, ListTodo, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { cn, formatCost, formatRelative } from "@/lib/utils";
import type { Project, Task } from "@/lib/types";

const BG_IMAGES = [
  "/assets/bg-card-mountains.png",
  "/assets/bg-card-bamboo.png",
  "/assets/bg-card-sakura.png",
] as const;

interface ProjectInsight {
  project: Project;
  tasks: Task[];
}

export function ProjectInsightCard({ project, tasks }: ProjectInsight) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const running = tasks.filter((t) => t.status === "running").length;
  const failed = tasks.filter((t) => t.status === "failed").length;
  const pending = tasks.filter((t) => t.status === "pending").length;
  const totalCost = tasks.reduce((acc, t) => acc + (t.cost_estimate ?? 0), 0);
  const successRate = total > 0 ? Math.round((done / total) * 100) : null;
  const last = tasks
    .filter((t) => t.completed_at || t.started_at)
    .sort(
      (a, b) =>
        new Date(b.completed_at || b.started_at || 0).getTime() -
        new Date(a.completed_at || a.started_at || 0).getTime(),
    )[0];

  const bgSrc = BG_IMAGES[project.id % BG_IMAGES.length] ?? BG_IMAGES[0];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card shadow-zen transition-colors hover:border-primary/40",
        running > 0 && "border-primary/40 ring-1 ring-primary/15",
      )}
    >
      <Image
        src={bgSrc}
        alt=""
        fill
        className="pointer-events-none object-cover object-right opacity-40"
        sizes="384px"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-card via-card/95 to-card/30" />
      <Link href={`/projects/${project.id}`} className="relative z-10 block p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Folder className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate text-sm font-medium">{project.name}</span>
          </div>
          {running > 0 && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-primary pulse-dot"
              title={`${running} task(s) rodando`}
            />
          )}
        </div>

        <div className="mt-3 grid grid-cols-4 gap-1.5 text-[10px]">
          <Stat icon={<ListTodo className="h-3 w-3" />} value={total} label="total" tone="muted" />
          <Stat
            icon={<CheckCircle2 className="h-3 w-3" />}
            value={done}
            label="ok"
            tone={done > 0 ? "success" : "muted"}
          />
          <Stat
            icon={<Clock className="h-3 w-3" />}
            value={running + pending}
            label="ativ"
            tone={running > 0 ? "primary" : "muted"}
          />
          <Stat
            icon={<AlertTriangle className="h-3 w-3" />}
            value={failed}
            label="erro"
            tone={failed > 0 ? "danger" : "muted"}
          />
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
          <span className="font-mono">{formatCost(totalCost || null)}</span>
          {successRate !== null && (
            <span title="taxa de sucesso">{successRate}% ok</span>
          )}
          {last && (
            <span title={last.title}>
              {last.status === "done"
                ? "✓"
                : last.status === "failed"
                  ? "✗"
                  : "·"}{" "}
              {formatRelative(last.completed_at ?? last.started_at)}
            </span>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

function Stat({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  tone: "muted" | "success" | "primary" | "danger";
}) {
  const tones: Record<typeof tone, string> = {
    muted: "text-muted-foreground bg-secondary/40",
    success: "text-success bg-success/10",
    primary: "text-primary bg-primary/10",
    danger: "text-destructive bg-destructive/10",
  };
  return (
    <div className={cn("flex flex-col items-center gap-0.5 rounded-lg py-1.5", tones[tone])}>
      <span className="flex items-center gap-0.5">
        {icon}
        <span className="font-mono font-semibold">{value}</span>
      </span>
      <span className="text-[9px] uppercase tracking-wider opacity-80">{label}</span>
    </div>
  );
}
