"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MessageSquare, Settings } from "lucide-react";
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/status-pill";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { TaskRowActions } from "@/components/tasks/TaskRowActions";
import { useProject } from "@/hooks/use-projects";
import { useTasks } from "@/hooks/use-tasks";
import { useActiveProject } from "@/stores/active-project";
import { formatCost, formatRelative } from "@/lib/utils";

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const projectId = Number(id);
  const router = useRouter();
  const setActiveProject = useActiveProject((s) => s.setActiveProject);

  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: tasks, isLoading: tasksLoading } = useTasks({ project_id: projectId });

  const stats = (() => {
    const list = tasks ?? [];
    let totalCost = 0;
    const byStatus = { pending: 0, running: 0, done: 0, failed: 0, cancelled: 0 };
    for (const t of list) {
      totalCost += t.cost_estimate ?? 0;
      if (t.status in byStatus) byStatus[t.status as keyof typeof byStatus]++;
    }
    return { count: list.length, totalCost, byStatus };
  })();

  const handleChatAbout = () => {
    if (!project) return;
    setActiveProject(project.id, project.name);
    router.push("/chat");
  };

  return (
    <ThreeColumnLayout hideRight>
      <div className="mx-auto w-full max-w-5xl space-y-5 p-6">
        <Button variant="ghost" size="sm" asChild className="self-start">
          <Link href="/projects">
            <ArrowLeft className="h-4 w-4" /> Projetos
          </Link>
        </Button>

        {projectLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !project ? (
          <p className="text-sm text-muted-foreground">Projeto não encontrado.</p>
        ) : (
          <>
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold">{project.name}</h1>
                <p className="font-mono text-xs text-muted-foreground">{project.path}</p>
                {project.description && (
                  <p className="mt-2 text-sm text-muted-foreground">{project.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/projects/${id}/settings`}>
                    <Settings className="h-4 w-4" /> Skills & MCPs
                  </Link>
                </Button>
                <Button onClick={handleChatAbout} variant="default" size="sm">
                  <MessageSquare className="h-4 w-4" /> Conversar sobre este projeto
                </Button>
              </div>
            </header>

            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Tasks" value={String(stats.count)} />
              <Stat label="Custo total" value={formatCost(stats.totalCost || null)} mono />
              <Stat label="Concluídas" value={String(stats.byStatus.done)} accent="success" />
              <Stat
                label="Falhas"
                value={String(stats.byStatus.failed)}
                accent={stats.byStatus.failed > 0 ? "destructive" : undefined}
              />
            </section>

            <section className="space-y-2">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-medium">Tasks deste projeto</h2>
                <span className="text-xs text-muted-foreground">
                  {tasksLoading ? "carregando…" : `${tasks?.length ?? 0} total`}
                </span>
              </div>
              <div className="overflow-hidden rounded-lg border border-border bg-card/40">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Título</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Custo</TableHead>
                      <TableHead className="text-right">Criada</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasksLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-6">
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      </TableRow>
                    ) : (tasks?.length ?? 0) === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                          Nenhuma task ainda neste projeto.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (tasks ?? []).map((t) => (
                        <TableRow key={t.id}>
                          <TableCell>
                            <Link href={`/tasks/${t.id}`} className="font-medium hover:underline">
                              {t.title}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <StatusPill status={t.status} />
                          </TableCell>
                          <TableCell>
                            {t.model ? (
                              <Badge variant="muted" className="text-[10px]">{t.model}</Badge>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {formatCost(t.cost_estimate)}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {formatRelative(t.created_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <TaskRowActions task={t} />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>
          </>
        )}
      </div>
    </ThreeColumnLayout>
  );
}

function Stat({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: "success" | "destructive";
}) {
  const accentClass =
    accent === "success"
      ? "text-success"
      : accent === "destructive"
      ? "text-destructive"
      : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 text-xl font-medium ${accentClass} ${mono ? "font-mono text-base tabular-nums" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
