"use client";

import Image from "next/image";
import { Sparkles } from "lucide-react";
import { useProjects } from "@/hooks/use-projects";
import { useTasks } from "@/hooks/use-tasks";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectInsightCard } from "@/components/projects/ProjectInsightCard";

/**
 * Lê todos os projetos + tasks recentes e exibe um card de insight por projeto.
 * Usado no painel direito do /chat.
 */
export function ProjectInsightsPanel() {
  const projects = useProjects();
  const tasks = useTasks({});

  const tasksByProject = (tasks.data ?? []).reduce<Record<number, typeof tasks.data>>((acc, t) => {
    if (t.project_id == null) return acc;
    if (!acc[t.project_id]) acc[t.project_id] = [];
    acc[t.project_id]!.push(t);
    return acc;
  }, {});

  const isLoading = projects.isLoading || tasks.isLoading;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative overflow-hidden border-b border-border">
        <Image
          src="/assets/section-pattern.png"
          alt=""
          fill
          className="pointer-events-none object-cover object-center opacity-35"
          sizes="384px"
        />
        <div className="relative z-10 flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            <span>Projetos</span>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {(projects.data ?? []).length}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin">
        {isLoading ? (
          <div className="space-y-2 p-1">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (projects.data ?? []).length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            Nenhum projeto registrado.
            <br />
            <span className="opacity-70">
              Crie via <code className="font-mono">POST /api/projects</code>.
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {(projects.data ?? []).map((p) => (
              <ProjectInsightCard
                key={p.id}
                project={p}
                tasks={tasksByProject[p.id] ?? []}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
