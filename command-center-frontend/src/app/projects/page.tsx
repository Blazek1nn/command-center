"use client";

import { Plus } from "lucide-react";
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/hooks/use-projects";
import { useDialogs } from "@/stores/dialogs";

export default function ProjectsPage() {
  const { data, isLoading } = useProjects();

  return (
    <ThreeColumnLayout hideRight>
      <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
        <header>
          <h1 className="text-lg font-semibold">Projetos</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os projetos sob gestão do gerente.
          </p>
        </header>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : (data?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border p-6">
            <p className="text-sm text-muted-foreground">
              Nenhum projeto criado.
            </p>
            <Button
              size="sm"
              onClick={() => useDialogs.getState().openNewProject()}
            >
              <Plus className="h-4 w-4" /> Criar primeiro projeto
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data!.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>
    </ThreeColumnLayout>
  );
}
